import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuditService } from '../audit-service.js';
import type { AuditLogEntry, AuditSearchQuery } from '@zendesk-sms-tool/shared';

// Mock Prisma client
function createMockPrisma() {
  return {
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  } as any;
}

describe('AuditService', () => {
  let service: AuditService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    service = new AuditService(mockPrisma);
  });

  describe('log()', () => {
    it('should create an audit log for sms_send action', async () => {
      const entry: AuditLogEntry = {
        userId: 'user-1',
        action: 'sms_send',
        resourceType: 'sms',
        resourceId: 'sms-log-1',
        details: {
          recipientPhone: '09012345678',
          messageBody: 'テストメッセージ',
          templateId: 'tmpl-1',
          resultStatus: 'success',
        },
      };

      await service.log(entry);

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          action: 'SMS_SEND',
          resourceType: 'sms',
          resourceId: 'sms-log-1',
          details: {
            recipientPhone: '09012345678',
            messageBody: 'テストメッセージ',
            templateId: 'tmpl-1',
            resultStatus: 'success',
          },
          ipAddress: null,
        },
      });
    });

    it('should create an audit log for sms_send_failed action', async () => {
      const entry: AuditLogEntry = {
        userId: 'user-1',
        action: 'sms_send_failed',
        resourceType: 'sms',
        details: {
          recipientPhone: '09012345678',
          error: 'Provider timeout',
        },
      };

      await service.log(entry);

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          action: 'SMS_SEND_FAILED',
          resourceType: 'sms',
          resourceId: null,
          details: {
            recipientPhone: '09012345678',
            error: 'Provider timeout',
          },
          ipAddress: null,
        },
      });
    });

    it('should create an audit log for template_create action', async () => {
      const entry: AuditLogEntry = {
        userId: 'user-2',
        action: 'template_create',
        resourceType: 'template',
        resourceId: 'tmpl-new',
        details: {
          name: '新規テンプレート',
          body: 'こんにちは {{customer_name}} 様',
        },
      };

      await service.log(entry);

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-2',
          action: 'TEMPLATE_CREATE',
          resourceType: 'template',
          resourceId: 'tmpl-new',
          details: {
            name: '新規テンプレート',
            body: 'こんにちは {{customer_name}} 様',
          },
          ipAddress: null,
        },
      });
    });

    it('should create an audit log for template_update action with before/after values', async () => {
      const entry: AuditLogEntry = {
        userId: 'user-2',
        action: 'template_update',
        resourceType: 'template',
        resourceId: 'tmpl-1',
        details: {
          before: { body: '旧本文' },
          after: { body: '新本文' },
        },
      };

      await service.log(entry);

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-2',
          action: 'TEMPLATE_UPDATE',
          resourceType: 'template',
          resourceId: 'tmpl-1',
          details: {
            before: { body: '旧本文' },
            after: { body: '新本文' },
          },
          ipAddress: null,
        },
      });
    });

    it('should create an audit log for template_delete action', async () => {
      const entry: AuditLogEntry = {
        userId: 'user-2',
        action: 'template_delete',
        resourceType: 'template',
        resourceId: 'tmpl-1',
        details: { name: '削除されたテンプレート' },
      };

      await service.log(entry);

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-2',
          action: 'TEMPLATE_DELETE',
          resourceType: 'template',
          resourceId: 'tmpl-1',
          details: { name: '削除されたテンプレート' },
          ipAddress: null,
        },
      });
    });

    it('should create an audit log for permission_denied action', async () => {
      const entry: AuditLogEntry = {
        userId: 'user-3',
        action: 'permission_denied',
        resourceType: 'settings',
        details: {
          attemptedAction: 'update_api_key',
          requiredRole: 'SYSTEM_ADMIN',
          actualRole: 'OPERATOR',
        },
        ipAddress: '192.168.1.100',
      };

      await service.log(entry);

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-3',
          action: 'PERMISSION_DENIED',
          resourceType: 'settings',
          resourceId: null,
          details: {
            attemptedAction: 'update_api_key',
            requiredRole: 'SYSTEM_ADMIN',
            actualRole: 'OPERATOR',
          },
          ipAddress: '192.168.1.100',
        },
      });
    });

    it('should create an audit log for config_change action', async () => {
      const entry: AuditLogEntry = {
        userId: 'admin-1',
        action: 'config_change',
        resourceType: 'settings',
        resourceId: 'provider-config',
        details: {
          before: { provider: 'mock' },
          after: { provider: 'media4u' },
        },
        ipAddress: '10.0.0.1',
      };

      await service.log(entry);

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'admin-1',
          action: 'CONFIG_CHANGE',
          resourceType: 'settings',
          resourceId: 'provider-config',
          details: {
            before: { provider: 'mock' },
            after: { provider: 'media4u' },
          },
          ipAddress: '10.0.0.1',
        },
      });
    });

    it('should store ipAddress when provided', async () => {
      const entry: AuditLogEntry = {
        userId: 'user-1',
        action: 'sms_send',
        resourceType: 'sms',
        details: { test: true },
        ipAddress: '127.0.0.1',
      };

      await service.log(entry);

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ipAddress: '127.0.0.1' }),
        }),
      );
    });
  });

  describe('search()', () => {
    const mockAuditLogs = [
      {
        id: 'audit-1',
        userId: 'user-1',
        action: 'SMS_SEND',
        resourceType: 'sms',
        resourceId: 'sms-1',
        details: { recipientPhone: '09012345678' },
        ipAddress: null,
        createdAt: new Date('2024-01-15T10:00:00Z'),
      },
      {
        id: 'audit-2',
        userId: 'user-2',
        action: 'TEMPLATE_CREATE',
        resourceType: 'template',
        resourceId: 'tmpl-1',
        details: { name: 'テスト' },
        ipAddress: '192.168.1.1',
        createdAt: new Date('2024-01-15T11:00:00Z'),
      },
    ];

    it('should return paginated results with defaults', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue(mockAuditLogs);
      mockPrisma.auditLog.count.mockResolvedValue(2);

      const result = await service.search({});

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should map Prisma action enums back to lowercase', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue(mockAuditLogs);
      mockPrisma.auditLog.count.mockResolvedValue(2);

      const result = await service.search({});

      expect(result.items[0].action).toBe('sms_send');
      expect(result.items[1].action).toBe('template_create');
    });

    it('should filter by userId', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      await service.search({ userId: 'user-1' });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-1' }),
        }),
      );
    });

    it('should filter by action (mapping lowercase to Prisma enum)', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      await service.search({ action: 'permission_denied' });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ action: 'PERMISSION_DENIED' }),
        }),
      );
    });

    it('should filter by resourceType', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      await service.search({ resourceType: 'template' });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ resourceType: 'template' }),
        }),
      );
    });

    it('should filter by date range', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      const dateFrom = new Date('2024-01-01');
      const dateTo = new Date('2024-01-31');

      await service.search({ dateFrom, dateTo });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: dateFrom, lte: dateTo },
          }),
        }),
      );
    });

    it('should filter by dateFrom only', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      const dateFrom = new Date('2024-01-01');
      await service.search({ dateFrom });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: dateFrom },
          }),
        }),
      );
    });

    it('should filter by dateTo only', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      const dateTo = new Date('2024-01-31');
      await service.search({ dateTo });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { lte: dateTo },
          }),
        }),
      );
    });

    it('should apply pagination correctly', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(50);

      const result = await service.search({ page: 3, limit: 10 });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        }),
      );
      expect(result.page).toBe(3);
      expect(result.limit).toBe(10);
    });

    it('should combine multiple filters', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      await service.search({
        userId: 'user-1',
        action: 'sms_send',
        resourceType: 'sms',
      });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-1',
            action: 'SMS_SEND',
            resourceType: 'sms',
          },
        }),
      );
    });

    it('should order results by createdAt descending', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      await service.search({});

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });
});
