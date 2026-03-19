/**
 * MockProvider — 開発・テスト用 SMS プロバイダ実装
 * メモリ内にメッセージを保存し、成功/失敗シミュレーションが可能
 *
 * Requirements: 12.3
 */
import type {
  SmsProvider,
  SendMessageRequest,
  SendMessageResponse,
  DeliveryStatusResponse,
  DeliveryStatus,
} from './sms-provider.js';

/** MockProvider の設定オプション */
export interface MockProviderOptions {
  /** 全送信を強制的に失敗させる */
  shouldFail?: boolean;
  /** 失敗率（0〜1）。shouldFail が false の場合に確率的に失敗させる */
  failureRate?: number;
  /** 配信ステータスの自動進行を有効にする */
  simulateDeliveryProgression?: boolean;
}

/** メモリ内に保存するメッセージレコード */
export interface StoredMessage {
  request: SendMessageRequest;
  response: SendMessageResponse;
  status: DeliveryStatus;
  createdAt: Date;
}

/** 配信ステータスの進行順序 */
const STATUS_PROGRESSION: DeliveryStatus[] = ['queued', 'sent', 'delivered'];

export class MockProvider implements SmsProvider {
  private messages = new Map<string, StoredMessage>();
  private options: Required<MockProviderOptions>;
  private idCounter = 0;

  constructor(options: MockProviderOptions = {}) {
    this.options = {
      shouldFail: options.shouldFail ?? false,
      failureRate: options.failureRate ?? 0,
      simulateDeliveryProgression: options.simulateDeliveryProgression ?? false,
    };
  }

  async sendMessage(req: SendMessageRequest): Promise<SendMessageResponse> {
    if (this.shouldSimulateFailure()) {
      const response: SendMessageResponse = {
        success: false,
        status: 'failed',
        error: { code: 'MOCK_FAILURE', message: 'Simulated send failure' },
      };
      return response;
    }

    this.idCounter++;
    const externalMessageId = `mock-${this.idCounter}-${Date.now()}`;
    const response: SendMessageResponse = {
      success: true,
      externalMessageId,
      status: 'queued',
    };

    this.messages.set(externalMessageId, {
      request: req,
      response,
      status: 'queued',
      createdAt: new Date(),
    });

    return response;
  }

  async getDeliveryStatus(externalMessageId: string): Promise<DeliveryStatusResponse> {
    const stored = this.messages.get(externalMessageId);
    if (!stored) {
      return {
        externalMessageId,
        status: 'unknown',
        updatedAt: new Date(),
      };
    }

    if (this.options.simulateDeliveryProgression) {
      this.advanceStatus(externalMessageId, stored);
    }

    return {
      externalMessageId,
      status: stored.status,
      updatedAt: new Date(),
    };
  }

  async validateConfig(): Promise<{ valid: boolean; errors: string[] }> {
    return { valid: true, errors: [] };
  }

  // --- ヘルパーメソッド ---

  /** 保存されたメッセージを取得（テスト用） */
  getStoredMessage(externalMessageId: string): StoredMessage | undefined {
    return this.messages.get(externalMessageId);
  }

  /** 全保存メッセージを取得（テスト用） */
  getAllMessages(): Map<string, StoredMessage> {
    return new Map(this.messages);
  }

  /** メッセージストアをクリア（テスト用） */
  clear(): void {
    this.messages.clear();
    this.idCounter = 0;
  }

  /** 特定メッセージのステータスを手動設定（テスト用） */
  setMessageStatus(externalMessageId: string, status: DeliveryStatus): void {
    const stored = this.messages.get(externalMessageId);
    if (stored) {
      stored.status = status;
    }
  }

  private shouldSimulateFailure(): boolean {
    if (this.options.shouldFail) {
      return true;
    }
    if (this.options.failureRate > 0) {
      return Math.random() < this.options.failureRate;
    }
    return false;
  }

  private advanceStatus(externalMessageId: string, stored: StoredMessage): void {
    const currentIndex = STATUS_PROGRESSION.indexOf(stored.status);
    if (currentIndex >= 0 && currentIndex < STATUS_PROGRESSION.length - 1) {
      const nextStatus = STATUS_PROGRESSION[currentIndex + 1];
      stored.status = nextStatus;
      this.messages.set(externalMessageId, stored);
    }
  }
}
