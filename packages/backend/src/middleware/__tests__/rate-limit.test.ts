import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  createRateLimitStore,
  isRateLimited,
  recordSend,
  checkDuplicateSend,
  createRateLimitMiddleware,
  createDuplicateSendMiddleware,
  createKeywordCheckMiddleware,
} from '../rate-limit.js';
import type { RateLimitStore } from '../rate-limit.js';
import { RATE_LIMIT, DUPLICATE_SEND_WINDOW_MS } from '@zendesk-sms-tool/shared';

// --- Mock helpers ---

function createMockReqResNext(
  user?: { id: string },
  body?: Record<string, unknown>,
) {
  const req = {
    user,
    body: body ?? {},
  } as unknown as Request;

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;

  const next = vi.fn() as NextFunction;

  return { req, res, next };
}

function createMockPrisma(recentSend: { createdAt: Date } | null = null) {
  return {
    smsLog: {
      findFirst: vi.fn().mockResolvedValue(recentSend),
    },
  } as any;
}

// --- isRateLimited / recordSend tests ---

describe('Rate Limit Store', () => {
  let store: RateLimitStore;

  beforeEach(() => {
    store = createRateLimitStore();
  });

  describe('isRateLimited (Requirement 10.4)', () => {
    it('should not be rate limited with no prior sends', () => {
      expect(isRateLimited(store, 'op-1')).toBe(false);
    });

    it('should not be rate limited below threshold', () => {
      const now = Date.now();
      for (let i = 0; i < RATE_LIMIT.maxSendsPerWindow - 1; i++) {
        recordSend(store, 'op-1', now);
      }
      expect(isRateLimited(store, 'op-1', now)).toBe(false);
    });

    it('should be rate limited at threshold', () => {
      const now = Date.now();
      for (let i = 0; i < RATE_LIMIT.maxSendsPerWindow; i++) {
        recordSend(store, 'op-1', now);
      }
      expect(isRateLimited(store, 'op-1', now)).toBe(true);
    });

    it('should reset after window expires', () => {
      const now = Date.now();
      for (let i = 0; i < RATE_LIMIT.maxSendsPerWindow; i++) {
        recordSend(store, 'op-1', now);
      }
      // After window passes, should no longer be limited
      const afterWindow = now + RATE_LIMIT.windowMs + 1;
      expect(isRateLimited(store, 'op-1', afterWindow)).toBe(false);
    });

    it('should track operators independently', () => {
      const now = Date.now();
      for (let i = 0; i < RATE_LIMIT.maxSendsPerWindow; i++) {
        recordSend(store, 'op-1', now);
      }
      expect(isRateLimited(store, 'op-1', now)).toBe(true);
      expect(isRateLimited(store, 'op-2', now)).toBe(false);
    });

    it('should clean up old timestamps on check', () => {
      const now = Date.now();
      // Add old sends outside window
      for (let i = 0; i < 5; i++) {
        recordSend(store, 'op-1', now - RATE_LIMIT.windowMs - 1000);
      }
      // Add recent sends within window
      for (let i = 0; i < 3; i++) {
        recordSend(store, 'op-1', now);
      }
      // Should only count recent sends
      expect(isRateLimited(store, 'op-1', now)).toBe(false);
      expect(store.sends.get('op-1')?.length).toBe(3);
    });
  });
});

// --- checkDuplicateSend tests ---

describe('checkDuplicateSend (Requirement 10.5)', () => {
  it('should detect duplicate send within window', async () => {
    const lastSentAt = new Date();
    const mockPrisma = createMockPrisma({ createdAt: lastSentAt });

    const result = await checkDuplicateSend(mockPrisma, 'op-1', '09012345678');

    expect(result.isDuplicate).toBe(true);
    expect(result.lastSentAt).toEqual(lastSentAt);
    expect(mockPrisma.smsLog.findFirst).toHaveBeenCalledWith({
      where: {
        operatorId: 'op-1',
        recipientPhone: '09012345678',
        createdAt: { gte: expect.any(Date) },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
  });

  it('should return no duplicate when no recent send exists', async () => {
    const mockPrisma = createMockPrisma(null);

    const result = await checkDuplicateSend(mockPrisma, 'op-1', '09012345678');

    expect(result.isDuplicate).toBe(false);
    expect(result.lastSentAt).toBeUndefined();
  });
});

// --- createRateLimitMiddleware tests ---

describe('createRateLimitMiddleware', () => {
  let store: RateLimitStore;

  beforeEach(() => {
    store = createRateLimitStore();
  });

  it('should return 401 when user is not authenticated', () => {
    const middleware = createRateLimitMiddleware(store);
    const { req, res, next } = createMockReqResNext(undefined);

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should allow request when under rate limit', () => {
    const middleware = createRateLimitMiddleware(store);
    const { req, res, next } = createMockReqResNext({ id: 'op-1' });

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return 429 when rate limit is exceeded', () => {
    const middleware = createRateLimitMiddleware(store);
    const now = Date.now();

    // Fill up the rate limit
    for (let i = 0; i < RATE_LIMIT.maxSendsPerWindow; i++) {
      recordSend(store, 'op-1', now);
    }

    const { req, res, next } = createMockReqResNext({ id: 'op-1' });
    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'RATE_LIMIT_EXCEEDED',
        }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should record send on successful pass-through', () => {
    const middleware = createRateLimitMiddleware(store);
    const { req, res, next } = createMockReqResNext({ id: 'op-1' });

    middleware(req, res, next);

    expect(store.sends.get('op-1')?.length).toBe(1);
  });
});

// --- createDuplicateSendMiddleware tests ---

describe('createDuplicateSendMiddleware', () => {
  it('should add warning when duplicate send detected', async () => {
    const lastSentAt = new Date();
    const mockPrisma = createMockPrisma({ createdAt: lastSentAt });
    const middleware = createDuplicateSendMiddleware(mockPrisma);
    const { req, res, next } = createMockReqResNext(
      { id: 'op-1' },
      { to: '09012345678' },
    );

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect((req as any).sendWarnings).toHaveLength(1);
    expect((req as any).sendWarnings[0].type).toBe('duplicate_send');
  });

  it('should not add warning when no duplicate', async () => {
    const mockPrisma = createMockPrisma(null);
    const middleware = createDuplicateSendMiddleware(mockPrisma);
    const { req, res, next } = createMockReqResNext(
      { id: 'op-1' },
      { to: '09012345678' },
    );

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect((req as any).sendWarnings).toBeUndefined();
  });

  it('should call next even when user or phone is missing', async () => {
    const mockPrisma = createMockPrisma();
    const middleware = createDuplicateSendMiddleware(mockPrisma);
    const { req, res, next } = createMockReqResNext(undefined, {});

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(mockPrisma.smsLog.findFirst).not.toHaveBeenCalled();
  });

  it('should call next even when DB query fails', async () => {
    const mockPrisma = createMockPrisma();
    mockPrisma.smsLog.findFirst.mockRejectedValue(new Error('DB error'));
    const middleware = createDuplicateSendMiddleware(mockPrisma);
    const { req, res, next } = createMockReqResNext(
      { id: 'op-1' },
      { to: '09012345678' },
    );

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

// --- createKeywordCheckMiddleware tests ---

describe('createKeywordCheckMiddleware', () => {
  it('should add warning when dangerous keywords detected', () => {
    const middleware = createKeywordCheckMiddleware();
    const { req, res, next } = createMockReqResNext(
      { id: 'op-1' },
      { body: '解約の手続きをお願いします' },
    );

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect((req as any).sendWarnings).toHaveLength(1);
    expect((req as any).sendWarnings[0].type).toBe('dangerous_keywords');
    expect((req as any).sendWarnings[0].details.keywords).toContain('解約');
  });

  it('should not add warning for safe messages', () => {
    const middleware = createKeywordCheckMiddleware();
    const { req, res, next } = createMockReqResNext(
      { id: 'op-1' },
      { body: 'お問い合わせありがとうございます' },
    );

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect((req as any).sendWarnings).toBeUndefined();
  });

  it('should call next when body is missing', () => {
    const middleware = createKeywordCheckMiddleware();
    const { req, res, next } = createMockReqResNext({ id: 'op-1' }, {});

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should call next when body is not a string', () => {
    const middleware = createKeywordCheckMiddleware();
    const { req, res, next } = createMockReqResNext(
      { id: 'op-1' },
      { body: 123 as any },
    );

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect((req as any).sendWarnings).toBeUndefined();
  });

  it('should detect multiple keywords in one message', () => {
    const middleware = createKeywordCheckMiddleware();
    const { req, res, next } = createMockReqResNext(
      { id: 'op-1' },
      { body: '返金と解約について弁護士に相談します' },
    );

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    const warnings = (req as any).sendWarnings;
    expect(warnings).toHaveLength(1);
    expect(warnings[0].details.keywords).toContain('返金');
    expect(warnings[0].details.keywords).toContain('解約');
    expect(warnings[0].details.keywords).toContain('弁護士');
  });
});
