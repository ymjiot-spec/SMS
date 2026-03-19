/**
 * SmsProvider インターフェース re-export
 * バックエンド内で共有パッケージの型を便利にインポートするためのモジュール
 *
 * Requirements: 12.1
 */
export type {
  SmsProvider,
  SendMessageRequest,
  SendMessageResponse,
  DeliveryStatusResponse,
  DeliveryStatus,
} from '@zendesk-sms-tool/shared';
