/**
 * Zendesk Sidebar API Client
 */
import type {
  DeliveryStatus,
  SendType,
  Template,
  TemplateSearchQuery,
  PaginatedResult,
  Folder,
} from '@zendesk-sms-tool/shared';

export interface SendSmsParams {
  to: string;
  body: string;
  templateId?: string;
  ticketId?: string;
  sendType?: SendType;
  selfCopy?: boolean;
  templateName?: string;
}

export interface SendSmsResponse {
  success: boolean;
  smsLogId?: string;
  externalMessageId?: string;
  error?: { code: string; message: string };
  warnings?: Array<{ type: string; message: string }>;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const BASE_URL = import.meta.env.VITE_API_URL ?? 'https://sms-2ftz.onrender.com';

let currentUserId = '';

export function setUserId(userId: string): void {
  currentUserId = userId;
}
