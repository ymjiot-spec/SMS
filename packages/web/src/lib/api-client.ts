/**
 * API Client
 * Requirements: 13.1, 13.2
 *
 * バックエンドAPIへの型付きHTTPクライアント。
 * 全Phase 1エンドポイントをカバーし、エラーハンドリングとX-User-Id認証ヘッダーを含む。
 */

import type {
  SendType,
  DeliveryStatus,
  DeliveryEvent,
  Template,
  CreateTemplateInput,
  UpdateTemplateInput,
  TemplateSearchQuery,
  User,
  PaginatedResult,
  Folder,
} from '@zendesk-sms-tool/shared';

// --- Response types ---

export interface SendSmsParams {
  to: string;
  body: string;
  templateId?: string;
  ticketId?: string;
  sendType?: SendType;
}

export interface SendSmsResponse {
  success: boolean;
  smsLogId?: string;
  externalMessageId?: string;
  error?: { code: string; message: string };
  warnings?: Array<{ type: string; message: string }>;
}

export interface SmsLogEntry {
  id: string;
  operatorId: string;
  recipientPhone: string;
  messageBody: string;
  templateId?: string | null;
  ticketId?: string | null;
  sendType: SendType;
  externalMessageId?: string | null;
  deliveryStatus: DeliveryStatus;
  resultMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SmsLogFilters {
  ticketId?: string;
  phone?: string;
  operatorId?: string;
  templateId?: string;
  dateFrom?: string;
  dateTo?: string;
  deliveryStatus?: DeliveryStatus;
  page?: number;
  limit?: number;
}

export interface TicketContext {
  ticketId: string;
  subject?: string;
  requesterName?: string;
  requesterPhone?: string;
}

export interface CreateInternalNoteParams {
  ticketId: string;
  destinationPhone: string;
  sendType?: string;
  templateName?: string;
  messageBody: string;
  senderName: string;
  sendTimestamp?: string;
  sendResult?: string;
  deliveryStatus?: DeliveryStatus;
  externalMessageId?: string;
}

export interface Company {
  id: string;
  name: string;
  code: string;
}

// --- Error class ---

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// --- API Client ---

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? '';

let currentUserId = '';

export function setUserId(userId: string): void {
  currentUserId = userId;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(currentUserId ? { 'X-User-Id': currentUserId } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };

  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = body.error ?? {};
    throw new ApiError(
      res.status,
      err.code ?? 'UNKNOWN_ERROR',
      err.message ?? `Request failed with status ${res.status}`,
      err.details,
    );
  }

  return res.json() as Promise<T>;
}

function toQueryString(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  );
  if (entries.length === 0) return '';
  const qs = new URLSearchParams(
    entries.map(([k, v]) => [k, String(v)]),
  ).toString();
  return `?${qs}`;
}

// --- Public API ---

/** SMS送信 POST /api/sms/send */
export async function sendSms(
  params: SendSmsParams,
): Promise<SendSmsResponse> {
  return request<SendSmsResponse>('/api/sms/send', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** テンプレート一覧取得 GET /api/templates */
export async function getTemplates(
  filters?: TemplateSearchQuery & { folderId?: string | null },
): Promise<PaginatedResult<Template>> {
  const qs = filters ? toQueryString(filters as Record<string, unknown>) : '';
  return request<PaginatedResult<Template>>(`/api/templates${qs}`);
}

/** テンプレート検索 GET /api/templates/search */
export async function searchTemplates(
  params: TemplateSearchQuery,
): Promise<PaginatedResult<Template>> {
  const qs = toQueryString(params as Record<string, unknown>);
  return request<PaginatedResult<Template>>(`/api/templates/search${qs}`);
}

/** テンプレート作成 POST /api/templates */
export async function createTemplate(
  data: CreateTemplateInput,
): Promise<Template> {
  return request<Template>('/api/templates', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** 送信履歴一覧 GET /api/sms/logs */
export async function getSmsLogs(
  filters?: SmsLogFilters,
): Promise<PaginatedResult<SmsLogEntry>> {
  const qs = filters ? toQueryString(filters as Record<string, unknown>) : '';
  return request<PaginatedResult<SmsLogEntry>>(`/api/sms/logs${qs}`);
}

/** 送信履歴詳細 GET /api/sms/logs/:id */
export async function getSmsLogById(id: string): Promise<SmsLogEntry> {
  return request<SmsLogEntry>(`/api/sms/logs/${encodeURIComponent(id)}`);
}

/** チケット情報取得 GET /api/zendesk/ticket/:id/context */
export async function getTicketContext(
  ticketId: string,
): Promise<TicketContext> {
  return request<TicketContext>(
    `/api/zendesk/ticket/${encodeURIComponent(ticketId)}/context`,
  );
}

/** 社内メモ作成 POST /api/zendesk/internal-note */
export async function createInternalNote(
  data: CreateInternalNoteParams,
): Promise<{ success: boolean }> {
  return request<{ success: boolean }>('/api/zendesk/internal-note', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** 自分の情報取得 GET /api/users/me */
export async function getCurrentUser(): Promise<User> {
  return request<User>('/api/users/me');
}

/** 企業一覧取得 GET /api/companies */
export async function getCompanies(): Promise<Company[]> {
  return request<Company[]>('/api/companies');
}

/** テンプレート更新 PUT /api/templates/:id */
export async function updateTemplate(
  id: string,
  data: UpdateTemplateInput,
): Promise<Template> {
  return request<Template>(`/api/templates/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/** テンプレート削除 DELETE /api/templates/:id */
export async function deleteTemplate(id: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/templates/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

/** テンプレート複製 POST /api/templates/:id/duplicate */
export async function duplicateTemplate(
  id: string,
  name: string,
): Promise<Template> {
  return request<Template>(`/api/templates/${encodeURIComponent(id)}/duplicate`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

/** お気に入りトグル POST /api/templates/:id/favorite */
export async function toggleFavorite(id: string): Promise<{ favorited: boolean }> {
  return request<{ favorited: boolean }>(`/api/templates/${encodeURIComponent(id)}/favorite`, {
    method: 'POST',
  });
}



/** 配信ステータス履歴レスポンス */
export interface DeliveryStatusResponse {
  smsLogId: string;
  events: DeliveryEvent[];
}

/** 配信ステータス取得 GET /api/sms/delivery-status/:id */
export async function getDeliveryStatus(
  smsLogId: string,
): Promise<DeliveryStatusResponse> {
  return request<DeliveryStatusResponse>(
    `/api/sms/delivery-status/${encodeURIComponent(smsLogId)}`,
  );
}

/** 自分にも送信付きSMS送信パラメータ */
export interface SendSmsWithSelfCopyParams {
  to: string;
  body: string;
  templateId?: string;
  ticketId?: string;
}

/** 自分にも送信付きSMS送信レスポンス */
export interface SendSmsWithSelfCopyResponse {
  success: boolean;
  smsLogId?: string;
  externalMessageId?: string;
  selfCopyResult?: { success: boolean; error?: { code: string; message: string } };
  partialSuccess: boolean;
  error?: { code: string; message: string };
  warnings?: Array<{ type: string; message: string }>;
}

/** 自分にも送信付きSMS送信 POST /api/sms/send-self-copy */
export async function sendSmsWithSelfCopy(
  params: SendSmsWithSelfCopyParams,
): Promise<SendSmsWithSelfCopyResponse> {
  return request<SendSmsWithSelfCopyResponse>('/api/sms/send-self-copy', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** テスト送信パラメータ */
export interface TestSendSmsParams {
  body: string;
  testPhone?: string;
  templateId?: string;
  ticketId?: string;
}

/** テスト送信 POST /api/sms/test-send */
export async function testSendSms(
  params: TestSendSmsParams,
): Promise<SendSmsResponse> {
  return request<SendSmsResponse>('/api/sms/test-send', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}


// --- Folder API ---

/** フォルダ一覧取得 GET /api/folders */
export async function getFolders(): Promise<Folder[]> {
  const result = await request<{ items: Folder[] }>('/api/folders');
  return result.items;
}

/** フォルダ作成 POST /api/folders */
export async function createFolder(name: string, parentId?: string | null): Promise<Folder> {
  return request<Folder>('/api/folders', {
    method: 'POST',
    body: JSON.stringify({ name, parentId: parentId ?? null }),
  });
}

/** フォルダ更新 PUT /api/folders/:id */
export async function updateFolder(id: string, name?: string, parentId?: string | null): Promise<Folder> {
  const body: Record<string, unknown> = {};
  if (name !== undefined) body.name = name;
  if (parentId !== undefined) body.parentId = parentId;
  return request<Folder>(`/api/folders/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/** フォルダ移動（parentId変更） PUT /api/folders/:id */
export async function moveFolder(id: string, parentId: string | null): Promise<Folder> {
  return request<Folder>(`/api/folders/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ parentId }),
  });
}

/** フォルダ削除 DELETE /api/folders/:id */
export async function deleteFolder(id: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/folders/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

/** テンプレート並び替え PUT /api/templates/reorder */
export async function reorderTemplates(
  items: Array<{ id: string; sortOrder: number; folderId?: string | null }>,
): Promise<{ success: boolean }> {
  return request<{ success: boolean }>('/api/templates/reorder', {
    method: 'PUT',
    body: JSON.stringify({ items }),
  });
}

/** お気に入り一覧取得 GET /api/favorites */
export async function getFavorites(): Promise<{ items: string[] }> {
  return request<{ items: string[] }>('/api/favorites');
}
