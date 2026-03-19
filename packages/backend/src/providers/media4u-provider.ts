/**
 * Media4uProvider — MediaSMS-CONSOLE API プロバイダ実装
 * https://www.sms-console.jp/api/ 準拠
 *
 * Requirements: 12.2, 12.4
 */
import type {
  SmsProvider,
  SendMessageRequest,
  SendMessageResponse,
  DeliveryStatusResponse,
  DeliveryStatus,
} from './sms-provider.js';

/** MediaSMS-CONSOLE API 設定 */
export interface Media4uConfig {
  /** API endpoint (default: https://www.sms-console.jp/api/) */
  apiUrl?: string;
  /** 認証ユーザー名 (2-20桁) */
  username: string;
  /** 認証パスワード (6-20桁) */
  password: string;
}

/** リトライ設定 */
export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
}

const DEFAULT_API_URL = 'https://www.sms-console.jp/api/';

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1_000,
  maxDelay: 10_000,
};

/** MediaSMS レスポンスコード → DeliveryStatus マッピング */
const RESPONSE_CODE_MAP: Record<number, DeliveryStatus> = {
  200: 'sent',      // 成功（受付完了）
};

/** リトライ対象のレスポンスコード (サーバー側一時エラー) */
const RETRYABLE_CODES = new Set([500, 502, 503, 504]);

/** sleep ユーティリティ */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 指数バックオフ遅延を計算 */
function calculateBackoffDelay(attempt: number, config: RetryConfig): number {
  const delay = config.initialDelay * Math.pow(2, attempt);
  return Math.min(delay, config.maxDelay);
}

/** MediaSMS API エラー */
export class Media4uApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly errorCode?: string,
  ) {
    super(message);
    this.name = 'Media4uApiError';
  }
}

/** MediaSMS レスポンスコードの説明 */
function describeResponseCode(code: number): string {
  switch (code) {
    case 200: return '成功';
    case 401: return '認証エラー';
    case 550: return '送信失敗';
    case 551: return '送信失敗（その他）';
    case 559: return 'タイムアウト';
    case 560: return '電話番号不正';
    case 585: return '本文不正';
    case 590: return 'パラメータ不正';
    case 591: return 'テンプレートID不正';
    case 597: return '送信制限超過';
    case 598: return 'リクエスト不正';
    case 599: return 'システムエラー';
    default: return `不明なエラー (${code})`;
  }
}

/** リトライ可能なエラーかどうかを判定 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Media4uApiError) {
    if (error.statusCode && RETRYABLE_CODES.has(error.statusCode)) {
      return true;
    }
  }
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }
  return false;
}

export class Media4uProvider implements SmsProvider {
  private config: Media4uConfig;
  private retryConfig: RetryConfig;
  private apiUrl: string;

  constructor(config: Media4uConfig, retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG) {
    this.config = config;
    this.retryConfig = retryConfig;
    this.apiUrl = config.apiUrl ?? DEFAULT_API_URL;
  }

  /**
   * SMS送信
   * MediaSMS-CONSOLE API にPOSTでパラメータ送信
   */
  async sendMessage(req: SendMessageRequest): Promise<SendMessageResponse> {
    try {
      // パラメータ構築
      const params = new URLSearchParams();
      params.set('username', this.config.username);
      params.set('password', this.config.password);
      params.set('mobilenumber', req.to.replace(/-/g, '')); // ハイフン無しにする
      params.set('smstext', req.body);

      // 送達結果通知を有効化（smsid は数字のみで生成 — MediaSMS制約）
      const smsid = `${Date.now()}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
      params.set('status', '1');
      params.set('smsid', smsid);

      console.log('--- Media4u API Request ---');
      console.log(`Endpoint: ${this.apiUrl}`);
      console.log(`Method: POST`);
      console.log(`Headers: Content-Type: application/x-www-form-urlencoded`);

      // Do not log the raw password in a real production app, but for debugging we log the payload structure
      const debugParams = new URLSearchParams(params.toString());
      debugParams.set('password', '***');
      console.log(`Body: ${debugParams.toString()}`);

      const response = await this.postWithRetry(params);

      // MediaSMS は HTTP 200 でレスポンスを返し、ボディにステータスコードが含まれる
      const responseText = await response.text();
      const responseCode = parseInt(responseText.trim(), 10);

      console.log('--- Media4u API Response ---');
      console.log(`HTTP Status Code: ${response.status}`);
      console.log(`API Response Code: ${responseCode}`);
      console.log(`API Response Body: ${responseText}`);

      if (responseCode === 200) {
        console.log("SMS sent successfully");
        return {
          success: true,
          externalMessageId: smsid,
          status: 'sent',
        };
      }

      // エラーレスポンス
      const errorMessage = describeResponseCode(responseCode);
      console.error("SMS send failed", `Status: ${responseCode}, error: ${errorMessage}`);
      return {
        success: false,
        status: 'failed',
        error: { code: String(responseCode), message: errorMessage },
      };
    } catch (error) {
      console.error('--- Media4u API Error ---');
      console.error("SMS send failed", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorCode =
        error instanceof Media4uApiError ? (error.errorCode ?? 'PROVIDER_ERROR') : 'PROVIDER_ERROR';

      return {
        success: false,
        status: 'failed',
        error: { code: errorCode, message: errorMessage },
      };
    }
  }

  /**
   * 配信ステータス取得
   * MediaSMS-CONSOLE 送達結果取得API（個別方式）
   */
  async getDeliveryStatus(externalMessageId: string): Promise<DeliveryStatusResponse> {
    try {
      const params = new URLSearchParams();
      params.set('username', this.config.username);
      params.set('password', this.config.password);
      params.set('smsid', externalMessageId);

      const response = await fetch(`${this.apiUrl}?${params.toString()}`, {
        method: 'GET',
      });

      const responseText = await response.text();
      // 送達結果: "smsid,status_code,datetime" 形式
      const parts = responseText.trim().split(',');
      const statusCode = parts.length >= 2 ? parseInt(parts[1], 10) : -1;

      let status: DeliveryStatus;
      switch (statusCode) {
        case 200:
          status = 'delivered';
          break;
        case 550:
        case 551:
          status = 'failed';
          break;
        case 559:
          status = 'expired';
          break;
        default:
          status = 'unknown';
      }

      return {
        externalMessageId,
        status,
        updatedAt: parts.length >= 3 ? new Date(parts[2]) : new Date(),
        rawResponse: responseText,
      };
    } catch {
      return {
        externalMessageId,
        status: 'unknown',
        updatedAt: new Date(),
      };
    }
  }

  async validateConfig(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!this.config.username || typeof this.config.username !== 'string' || this.config.username.trim() === '') {
      errors.push('username is required');
    } else if (this.config.username.length < 2 || this.config.username.length > 20) {
      errors.push('username must be 2-20 characters');
    }

    if (!this.config.password || typeof this.config.password !== 'string' || this.config.password.trim() === '') {
      errors.push('password is required');
    } else if (this.config.password.length < 6 || this.config.password.length > 20) {
      errors.push('password must be 6-20 characters');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * リトライ付きPOST
   */
  private async postWithRetry(params: URLSearchParams): Promise<Response> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = calculateBackoffDelay(attempt - 1, this.retryConfig);
          await sleep(delay);
        }

        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        });

        // HTTP レベルのエラー（5xx）はリトライ
        if (!response.ok && RETRYABLE_CODES.has(response.status)) {
          const apiError = new Media4uApiError(
            `HTTP ${response.status}: ${response.statusText}`,
            response.status,
          );
          if (attempt < this.retryConfig.maxRetries) {
            lastError = apiError;
            continue;
          }
          throw apiError;
        }

        return response;
      } catch (error) {
        lastError = error;
        if (isRetryableError(error) && attempt < this.retryConfig.maxRetries) {
          continue;
        }
        throw error;
      }
    }

    throw lastError;
  }
}
