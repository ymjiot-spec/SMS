// Common types
export type { PaginatedResult } from './types/common.js';

// Types
export type {
  DeliveryStatus,
  SendType,
  SendMessageRequest,
  SendMessageResponse,
  DeliveryStatusResponse,
  SmsProvider,
} from './types/sms.js';

export type {
  TemplateVisibility,
  Template,
  CreateTemplateInput,
  UpdateTemplateInput,
  TemplateSearchQuery,
  RenderResult,
  ValidationResult,
  Folder,
  CreateFolderInput,
  UpdateFolderInput,
} from './types/template.js';

export type {
  DeliveryEventSource,
  DeliveryEvent,
  WebhookPayload,
} from './types/delivery.js';

export type {
  UserRole,
  User,
} from './types/user.js';

export type {
  AuditAction,
  AuditLogEntry,
  AuditSearchQuery,
} from './types/audit.js';

// Constants
export {
  SUPPORTED_VARIABLES,
  VARIABLE_PATTERN,
  DANGEROUS_KEYWORDS,
  RATE_LIMIT,
  DUPLICATE_SEND_WINDOW_MS,
} from './constants.js';

export type { SupportedVariable } from './constants.js';

// Validators
export { validateJapanesePhoneNumber } from './validators/phone.js';
export {
  parseVariables,
  renderTemplate,
  validateVariableFormat,
} from './validators/template.js';
