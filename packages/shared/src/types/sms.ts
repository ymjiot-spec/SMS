/**
 * SMS関連の型定義
 * Requirements: 12.1, 6.1
 */

/** SMS配信ステータス */
export type DeliveryStatus = 'queued' | 'sent' | 'delivered' | 'failed' | 'expired' | 'unknown';

/** SMS送信種別 */
export type SendType = 'customer' | 'self_copy' | 'test';

/** SMS送信リクエスト */
export interface SendMessageRequest {
  /** 宛先電話番号（E.164 or 国内形式） */
  to: string;
  /** メッセージ本文 */
  body: string;
  /** メタデータ */
  metadata?: Record<string, string>;
}

/** SMS送信レスポンス */
export interface SendMessageResponse {
  success: boolean;
  externalMessageId?: string;
  status: DeliveryStatus;
  error?: { code: string; message: string };
}

/** 配信ステータスレスポンス */
export interface DeliveryStatusResponse {
  externalMessageId: string;
  status: DeliveryStatus;
  updatedAt: Date;
  rawResponse?: unknown;
}

/** SMSプロバイダインターフェース */
export interface SmsProvider {
  sendMessage(req: SendMessageRequest): Promise<SendMessageResponse>;
  getDeliveryStatus(externalMessageId: string): Promise<DeliveryStatusResponse>;
  validateConfig(): Promise<{ valid: boolean; errors: string[] }>;
}
