import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import type { UserRole } from '@zendesk-sms-tool/shared';
import { createAuthMiddleware, requireRole, hasPermission } from '../auth.js';

// --- Mock helpers ---

function createMockPrisma(user: Record<string, unknown> | null = null) {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue(user),
    },
  } as any;
}

function createMockAuditService() {
  return {
    log: vi.fn().mockResolvedValue(undefined),
    search: vi.fn(),
  } as any;
}

function createMockReqResNext(headers: Record<string, string> = {}, user?: any) {
  const req = {
    headers,
    user,
    method: 'GET',
    baseUrl: '/api',
    path: '/test',
    ip: '127.0.0.1',
  } as unknown as Request;

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;

  const next = vi.fn() as NextFunction;

  return { req, res, next };
}

const MOCK_USER = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  phone: '09012345678',
  role: 'OPERATOR',
  companyId: 'company-1',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

// --- hasPermission tests ---

describe('hasPermission', () => {
  it('should allow SYSTEM_ADMIN for any role', () => {
    expect(hasPermission('SYSTEM_ADMIN', 'OPERATOR')).toBe(true);
    expect(hasPermission('SYSTEM_ADMIN', 'SUPERVISOR')).toBe(true);
    expect(hasPermission('SYSTEM_ADMIN', 'SYSTEM_ADMIN')).toBe(true);
  });

  it('should allow SUPERVISOR for OPERATOR and SUPERVISOR roles', () => {
    expect(hasPermission('SUPERVISOR', 'OPERATOR')).toBe(true);
    expect(hasPermission('SUPERVISOR', 'SUPERVISOR')).toBe(true);
  });

  it('should deny SUPERVISOR for SYSTEM_ADMIN role', () => {
    expect(hasPermission('SUPERVISOR', 'SYSTEM_ADMIN')).toBe(false);
  });

  it('should allow OPERATOR only for OPERATOR role', () => {
    expect(hasPermission('OPERATOR', 'OPERATOR')).toBe(true);
  });

  it('should deny OPERATOR for SUPERVISOR and SYSTEM_ADMIN roles', () => {
    expect(hasPermission('OPERATOR', 'SUPERVISOR')).toBe(false);
    expect(hasPermission('OPERATOR', 'SYSTEM_ADMIN')).toBe(false);
  });
});

// --- createAuthMiddleware tests ---

describe('createAuthMiddleware', () => {
  it('should return 401 when X-User-Id header is missing', async () => {
    const mockPrisma = createMockPrisma();
    const middleware = createAuthMiddleware(mockPrisma);
    const { req, res, next } = createMockReqResNext();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when user is not found in DB', async () => {
    const mockPrisma = createMockPrisma(null);
    const middleware = createAuthMiddleware(mockPrisma);
    const { req, res, next } = createMockReqResNext({ 'x-user-id': 'nonexistent' });

    await middleware(req, res, next);

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'nonexistent' } });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should attach user to req and call next when user is found', async () => {
    const mockPrisma = createMockPrisma(MOCK_USER);
    const middleware = createAuthMiddleware(mockPrisma);
    const { req, res, next } = createMockReqResNext({ 'x-user-id': 'user-1' });

    await middleware(req, res, next);

    expect(req.user).toEqual({
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      phone: '09012345678',
      role: 'OPERATOR',
      companyId: 'company-1',
      createdAt: MOCK_USER.createdAt,
      updatedAt: MOCK_USER.updatedAt,
    });
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return 500 when DB throws an error', async () => {
    const mockPrisma = createMockPrisma();
    mockPrisma.user.findUnique.mockRejectedValue(new Error('DB connection failed'));
    const middleware = createAuthMiddleware(mockPrisma);
    const { req, res, next } = createMockReqResNext({ 'x-user-id': 'user-1' });

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});

// --- requireRole tests ---

describe('requireRole', () => {
  let mockAuditService: ReturnType<typeof createMockAuditService>;

  beforeEach(() => {
    mockAuditService = createMockAuditService();
  });

  it('should return 401 when req.user is not set', async () => {
    const middleware = requireRole(mockAuditService, 'OPERATOR');
    const { req, res, next } = createMockReqResNext();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should allow OPERATOR to access OPERATOR-level endpoint', async () => {
    const middleware = requireRole(mockAuditService, 'OPERATOR');
    const { req, res, next } = createMockReqResNext({}, {
      id: 'user-1', role: 'OPERATOR' as UserRole,
    });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should allow SUPERVISOR to access OPERATOR-level endpoint (hierarchy)', async () => {
    const middleware = requireRole(mockAuditService, 'OPERATOR');
    const { req, res, next } = createMockReqResNext({}, {
      id: 'user-2', role: 'SUPERVISOR' as UserRole,
    });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should allow SYSTEM_ADMIN to access SUPERVISOR-level endpoint (hierarchy)', async () => {
    const middleware = requireRole(mockAuditService, 'SUPERVISOR');
    const { req, res, next } = createMockReqResNext({}, {
      id: 'user-3', role: 'SYSTEM_ADMIN' as UserRole,
    });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should deny OPERATOR access to SUPERVISOR-level endpoint', async () => {
    const middleware = requireRole(mockAuditService, 'SUPERVISOR');
    const { req, res, next } = createMockReqResNext({}, {
      id: 'user-1', role: 'OPERATOR' as UserRole,
    });

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'FORBIDDEN' }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should deny OPERATOR access to SYSTEM_ADMIN-level endpoint', async () => {
    const middleware = requireRole(mockAuditService, 'SYSTEM_ADMIN');
    const { req, res, next } = createMockReqResNext({}, {
      id: 'user-1', role: 'OPERATOR' as UserRole,
    });

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('should deny SUPERVISOR access to SYSTEM_ADMIN-level endpoint', async () => {
    const middleware = requireRole(mockAuditService, 'SYSTEM_ADMIN');
    const { req, res, next } = createMockReqResNext({}, {
      id: 'user-2', role: 'SUPERVISOR' as UserRole,
    });

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('should log permission_denied to audit service when access is denied', async () => {
    const middleware = requireRole(mockAuditService, 'SYSTEM_ADMIN');
    const { req, res, next } = createMockReqResNext({}, {
      id: 'user-1', role: 'OPERATOR' as UserRole,
    });

    await middleware(req, res, next);

    expect(mockAuditService.log).toHaveBeenCalledWith({
      userId: 'user-1',
      action: 'permission_denied',
      resourceType: '/api/test',
      details: {
        attemptedAction: 'GET /api/test',
        requiredRoles: ['SYSTEM_ADMIN'],
        actualRole: 'OPERATOR',
      },
      ipAddress: '127.0.0.1',
    });
  });

  it('should not log audit when access is granted', async () => {
    const middleware = requireRole(mockAuditService, 'OPERATOR');
    const { req, res, next } = createMockReqResNext({}, {
      id: 'user-1', role: 'OPERATOR' as UserRole,
    });

    await middleware(req, res, next);

    expect(mockAuditService.log).not.toHaveBeenCalled();
  });

  it('should still deny access even if audit logging fails', async () => {
    mockAuditService.log.mockRejectedValue(new Error('Audit DB down'));
    const middleware = requireRole(mockAuditService, 'SYSTEM_ADMIN');
    const { req, res, next } = createMockReqResNext({}, {
      id: 'user-1', role: 'OPERATOR' as UserRole,
    });

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('should allow access when user has any of the specified roles', async () => {
    const middleware = requireRole(mockAuditService, 'SUPERVISOR', 'SYSTEM_ADMIN');
    const { req, res, next } = createMockReqResNext({}, {
      id: 'user-2', role: 'SUPERVISOR' as UserRole,
    });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should include role info in 403 response details', async () => {
    const middleware = requireRole(mockAuditService, 'SUPERVISOR');
    const { req, res, next } = createMockReqResNext({}, {
      id: 'user-1', role: 'OPERATOR' as UserRole,
    });

    await middleware(req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          details: {
            requiredRoles: 'SUPERVISOR',
            currentRole: 'OPERATOR',
          },
        }),
      }),
    );
  });
});
