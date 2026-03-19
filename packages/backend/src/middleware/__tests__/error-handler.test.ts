import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  ProviderError,
  ZendeskError,
  DatabaseError,
  InternalError,
  globalErrorHandler,
  asyncHandler,
} from '../error-handler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockReqRes() {
  const req = {} as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, next };
}

function getJsonBody(res: Response): unknown {
  return (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
}

// ---------------------------------------------------------------------------
// AppError class hierarchy
// ---------------------------------------------------------------------------

describe('AppError class hierarchy', () => {
  it('AppError stores code, statusCode, level, and details', () => {
    const err = new AppError('test', {
      code: 'TEST',
      statusCode: 418,
      level: 'info',
      details: { field: 'value' },
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.message).toBe('test');
    expect(err.code).toBe('TEST');
    expect(err.statusCode).toBe(418);
    expect(err.level).toBe('info');
    expect(err.details).toEqual({ field: 'value' });
  });

  it('AppError without details has undefined details', () => {
    const err = new AppError('no details', {
      code: 'X',
      statusCode: 400,
      level: 'warning',
    });
    expect(err.details).toBeUndefined();
  });

  const errorCases: Array<{
    name: string;
    create: () => AppError;
    expectedCode: string;
    expectedStatus: number;
    expectedLevel: string;
  }> = [
    {
      name: 'ValidationError',
      create: () => new ValidationError('bad input', { field: 'to' }),
      expectedCode: 'VALIDATION_ERROR',
      expectedStatus: 400,
      expectedLevel: 'warning',
    },
    {
      name: 'AuthenticationError',
      create: () => new AuthenticationError(),
      expectedCode: 'AUTHENTICATION_ERROR',
      expectedStatus: 401,
      expectedLevel: 'warning',
    },
    {
      name: 'AuthorizationError',
      create: () => new AuthorizationError(),
      expectedCode: 'AUTHORIZATION_ERROR',
      expectedStatus: 403,
      expectedLevel: 'warning',
    },
    {
      name: 'NotFoundError',
      create: () => new NotFoundError(),
      expectedCode: 'NOT_FOUND',
      expectedStatus: 404,
      expectedLevel: 'info',
    },
    {
      name: 'RateLimitError',
      create: () => new RateLimitError(),
      expectedCode: 'RATE_LIMIT_ERROR',
      expectedStatus: 429,
      expectedLevel: 'warning',
    },
    {
      name: 'ProviderError',
      create: () => new ProviderError('timeout'),
      expectedCode: 'PROVIDER_ERROR',
      expectedStatus: 502,
      expectedLevel: 'critical',
    },
    {
      name: 'ZendeskError',
      create: () => new ZendeskError('api failure'),
      expectedCode: 'ZENDESK_ERROR',
      expectedStatus: 502,
      expectedLevel: 'critical',
    },
    {
      name: 'DatabaseError',
      create: () => new DatabaseError(),
      expectedCode: 'DATABASE_ERROR',
      expectedStatus: 500,
      expectedLevel: 'critical',
    },
    {
      name: 'InternalError',
      create: () => new InternalError(),
      expectedCode: 'INTERNAL_ERROR',
      expectedStatus: 500,
      expectedLevel: 'critical',
    },
  ];

  it.each(errorCases)(
    '$name maps to status $expectedStatus, code $expectedCode, level $expectedLevel',
    ({ create, expectedCode, expectedStatus, expectedLevel }) => {
      const err = create();
      expect(err).toBeInstanceOf(AppError);
      expect(err.code).toBe(expectedCode);
      expect(err.statusCode).toBe(expectedStatus);
      expect(err.level).toBe(expectedLevel);
    },
  );

  it('subclasses are instanceof AppError and Error', () => {
    const errors = [
      new ValidationError('x'),
      new AuthenticationError(),
      new AuthorizationError(),
      new NotFoundError(),
      new RateLimitError(),
      new ProviderError('x'),
      new ZendeskError('x'),
      new DatabaseError(),
      new InternalError(),
    ];
    for (const err of errors) {
      expect(err).toBeInstanceOf(AppError);
      expect(err).toBeInstanceOf(Error);
    }
  });
});

// ---------------------------------------------------------------------------
// globalErrorHandler
// ---------------------------------------------------------------------------

describe('globalErrorHandler', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  it('returns correct status and ApiErrorResponse for each AppError subclass', () => {
    const cases: Array<{ err: AppError; status: number; code: string }> = [
      { err: new ValidationError('bad', { field: 'x' }), status: 400, code: 'VALIDATION_ERROR' },
      { err: new AuthenticationError(), status: 401, code: 'AUTHENTICATION_ERROR' },
      { err: new AuthorizationError(), status: 403, code: 'AUTHORIZATION_ERROR' },
      { err: new NotFoundError(), status: 404, code: 'NOT_FOUND' },
      { err: new RateLimitError(), status: 429, code: 'RATE_LIMIT_ERROR' },
      { err: new ProviderError('fail'), status: 502, code: 'PROVIDER_ERROR' },
      { err: new ZendeskError('fail'), status: 502, code: 'ZENDESK_ERROR' },
      { err: new DatabaseError(), status: 500, code: 'DATABASE_ERROR' },
      { err: new InternalError(), status: 500, code: 'INTERNAL_ERROR' },
    ];

    for (const { err, status, code } of cases) {
      const { req, res, next } = createMockReqRes();
      globalErrorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(status);
      const body = getJsonBody(res) as any;
      expect(body.error.code).toBe(code);
      expect(body.error.message).toBe(err.message);
    }
  });

  it('includes details in response when present', () => {
    const { req, res, next } = createMockReqRes();
    const err = new ValidationError('bad input', { field: 'to', reason: 'invalid' });
    globalErrorHandler(err, req, res, next);

    const body = getJsonBody(res) as any;
    expect(body.error.details).toEqual({ field: 'to', reason: 'invalid' });
  });

  it('omits details key when not present', () => {
    const { req, res, next } = createMockReqRes();
    const err = new NotFoundError();
    globalErrorHandler(err, req, res, next);

    const body = getJsonBody(res) as any;
    expect(body.error).not.toHaveProperty('details');
  });

  it('returns 500 INTERNAL_ERROR for unknown errors', () => {
    const { req, res, next } = createMockReqRes();
    const err = new Error('something broke');
    globalErrorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    const body = getJsonBody(res) as any;
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('内部エラーが発生しました。');
    expect(body.error).not.toHaveProperty('details');
  });

  it('ApiErrorResponse format is consistent across all error types', () => {
    const errors: Error[] = [
      new ValidationError('v'),
      new AuthenticationError(),
      new ProviderError('p'),
      new Error('unknown'),
    ];

    for (const err of errors) {
      const { req, res, next } = createMockReqRes();
      globalErrorHandler(err, req, res, next);

      const body = getJsonBody(res) as any;
      // Every response must have error.code and error.message
      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('code');
      expect(body.error).toHaveProperty('message');
      expect(typeof body.error.code).toBe('string');
      expect(typeof body.error.message).toBe('string');
    }
  });

  it('logs critical errors with console.error', () => {
    const { req, res, next } = createMockReqRes();
    globalErrorHandler(new ProviderError('timeout'), req, res, next);
    expect(console.error).toHaveBeenCalled();
  });

  it('logs warning errors with console.warn', () => {
    const { req, res, next } = createMockReqRes();
    globalErrorHandler(new ValidationError('bad'), req, res, next);
    expect(console.warn).toHaveBeenCalled();
  });

  it('logs info errors with console.info', () => {
    const { req, res, next } = createMockReqRes();
    globalErrorHandler(new NotFoundError(), req, res, next);
    expect(console.info).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// asyncHandler
// ---------------------------------------------------------------------------

describe('asyncHandler', () => {
  it('calls next with error when async handler throws', async () => {
    const error = new ValidationError('async fail');
    const handler = asyncHandler(async () => {
      throw error;
    });

    const { req, res, next } = createMockReqRes();
    handler(req, res, next);

    // Wait for the microtask (promise rejection) to settle
    await new Promise((r) => setTimeout(r, 0));

    expect(next).toHaveBeenCalledWith(error);
  });

  it('does not call next when async handler succeeds', async () => {
    const handler = asyncHandler(async (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const { req, res, next } = createMockReqRes();
    handler(req, res, next);

    await new Promise((r) => setTimeout(r, 0));

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('catches rejected promises and forwards to next', async () => {
    const handler = asyncHandler(async () => {
      return Promise.reject(new InternalError('boom'));
    });

    const { req, res, next } = createMockReqRes();
    handler(req, res, next);

    await new Promise((r) => setTimeout(r, 0));

    expect(next).toHaveBeenCalledWith(expect.any(InternalError));
  });
});
