/**
 * グローバルエラーハンドリングミドルウェア
 * Requirements: 1.3, 8.3
 *
 * AppError クラス階層による統一エラー分類と、
 * ApiErrorResponse 形式の統一レスポンスを提供する。
 * Sentry 統合は Critical/Warning/Info レベルで分類（現時点では console 出力）。
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';

// ---------------------------------------------------------------------------
// Error level type
// ---------------------------------------------------------------------------

export type ErrorLevel = 'critical' | 'warning' | 'info';

// ---------------------------------------------------------------------------
// Base AppError
// ---------------------------------------------------------------------------

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly level: ErrorLevel;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    opts: {
      code: string;
      statusCode: number;
      level: ErrorLevel;
      details?: Record<string, unknown>;
    },
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = opts.code;
    this.statusCode = opts.statusCode;
    this.level = opts.level;
    this.details = opts.details;
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Specific error subclasses
// ---------------------------------------------------------------------------

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, { code: 'VALIDATION_ERROR', statusCode: 400, level: 'warning', details });
  }
}

export class AuthenticationError extends AppError {
  constructor(message = '認証が必要です。') {
    super(message, { code: 'AUTHENTICATION_ERROR', statusCode: 401, level: 'warning' });
  }
}

export class AuthorizationError extends AppError {
  constructor(message = '権限が不足しています。') {
    super(message, { code: 'AUTHORIZATION_ERROR', statusCode: 403, level: 'warning' });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'リソースが見つかりません。') {
    super(message, { code: 'NOT_FOUND', statusCode: 404, level: 'info' });
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'レート制限を超過しました。') {
    super(message, { code: 'RATE_LIMIT_ERROR', statusCode: 429, level: 'warning' });
  }
}

export class ProviderError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, { code: 'PROVIDER_ERROR', statusCode: 502, level: 'critical', details });
  }
}

export class ZendeskError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, { code: 'ZENDESK_ERROR', statusCode: 502, level: 'critical', details });
  }
}

export class DatabaseError extends AppError {
  constructor(message = 'データベースエラーが発生しました。') {
    super(message, { code: 'DATABASE_ERROR', statusCode: 500, level: 'critical' });
  }
}

export class InternalError extends AppError {
  constructor(message = '内部エラーが発生しました。') {
    super(message, { code: 'INTERNAL_ERROR', statusCode: 500, level: 'critical' });
  }
}

// ---------------------------------------------------------------------------
// ApiErrorResponse interface
// ---------------------------------------------------------------------------

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// ---------------------------------------------------------------------------
// Global error handler middleware
// ---------------------------------------------------------------------------

/**
 * Express エラーハンドリングミドルウェア。
 * すべてのエラーを ApiErrorResponse 形式に変換して返す。
 * Sentry レベル分類に基づいてログ出力する（将来的に Sentry SDK に置換）。
 */
export function globalErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    // Log based on severity level
    logByLevel(err.level, err);

    const body: ApiErrorResponse = {
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  // Unknown / unhandled errors → 500 Internal Error (critical)
  console.error('[CRITICAL] Unhandled error:', err);

  const body: ApiErrorResponse = {
    error: {
      code: 'INTERNAL_ERROR',
      message: '内部エラーが発生しました。',
    },
  };
  res.status(500).json(body);
}

// ---------------------------------------------------------------------------
// Async handler wrapper
// ---------------------------------------------------------------------------

/**
 * async ルートハンドラのエラーを自動的に next() へ渡すラッパー。
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function logByLevel(level: ErrorLevel, err: AppError): void {
  switch (level) {
    case 'critical':
      console.error(`[CRITICAL] ${err.code}: ${err.message}`);
      break;
    case 'warning':
      console.warn(`[WARNING] ${err.code}: ${err.message}`);
      break;
    case 'info':
      console.info(`[INFO] ${err.code}: ${err.message}`);
      break;
  }
}
