/**
 * 監査ログ関連の型定義
 * Requirements: 14.1, 14.2, 14.3, 14.5, 14.6
 */

/** 監査アクション種別 */
export type AuditAction =
  | 'sms_send'
  | 'sms_send_failed'
  | 'template_create'
  | 'template_update'
  | 'template_delete'
  | 'permission_denied'
  | 'config_change';

/** 監査ログエントリ */
export interface AuditLogEntry {
  userId: string;
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  details: Record<string, unknown>;
  ipAddress?: string;
}

/** 監査ログ検索クエリ */
export interface AuditSearchQuery {
  userId?: string;
  action?: AuditAction;
  resourceType?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  limit?: number;
}
