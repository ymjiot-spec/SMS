/**
 * 共通定数定義
 * Requirements: 3.1, 10.2, 10.4, 10.5
 */

/** テンプレートでサポートされる変数一覧 (Requirement 3.1) */
export const SUPPORTED_VARIABLES = [
  'customer_name',
  'phone',
  'ticket_id',
  'agent_name',
  'company_name',
  'today',
  'support_email',
  'short_url',
] as const;

export type SupportedVariable = (typeof SUPPORTED_VARIABLES)[number];

/** テンプレート変数パターン */
export const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

/** 危険キーワード一覧 (Requirement 10.2) */
export const DANGEROUS_KEYWORDS = [
  '解約',
  'キャンセル',
  '返金',
  '訴訟',
  '裁判',
  '弁護士',
  '消費者センター',
  '個人情報',
  'パスワード',
  '暗証番号',
  'クレジットカード',
] as const;

/** レート制限設定 (Requirement 10.4) */
export const RATE_LIMIT = {
  /** 1ウィンドウあたりの最大送信数 */
  maxSendsPerWindow: 10,
  /** ウィンドウサイズ（ミリ秒） — 1分 */
  windowMs: 60_000,
} as const;

/** 重複送信警告ウィンドウ（ミリ秒） — 5分 (Requirement 10.5) */
export const DUPLICATE_SEND_WINDOW_MS = 5 * 60_000;
