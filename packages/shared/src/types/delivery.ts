/**
 * 配信追跡関連の型定義
 * Requirements: 6.1, 6.2, 6.4, 6.6
 */

import type { DeliveryStatus } from './sms.js';

/** 配信イベントのソース */
export type DeliveryEventSource = 'api_response' | 'polling' | 'webhook';

/** 配信イベント */
export interface DeliveryEvent {
  id: string;
  smsLogId: string;
  status: DeliveryStatus;
  rawPayload?: unknown;
  source: DeliveryEventSource;
  createdAt: Date;
}

/** Webhookペイロード */
export interface WebhookPayload {
  externalMessageId: string;
  status: DeliveryStatus;
  timestamp: string;
  rawData?: unknown;
}
