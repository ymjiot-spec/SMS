import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsService } from '../settings-service.js';
import type { SystemSettings } from '../settings-service.js';

function createMockAuditService() {
  return {
    log: vi.fn().mockResolvedValue(undefined),
    search: vi.fn(),
  } as any;
}

describe('SettingsService', () => {
  let service: SettingsService;
  let mockAudit: ReturnType<typeof createMockAuditService>;

  beforeEach(() => {
    mockAudit = createMockAuditService();
    service = new SettingsService(mockAudit);
  });

  describe('getSettings()', () => {
    it('should return default settings', () => {
      const settings = service.getSettings();

      expect(settings).toEqual({
        smsProvider: {
          name: expect.any(String),
          apiKey: expect.any(String),
          endpoint: expect.any(String),
        },
        webhook: {
          url: expect.any(String),
          secret: expect.any(String),
        },
        testPhoneNumber: expect.any(String),
        rateLimitPerMinute: expect.any(Number),
        zendeskIntegration: {
          subdomain: expect.any(String),
          email: expect.any(String),
          apiToken: expect.any(String),
        },
      });
    });

    it('should return a deep copy (mutations do not affect internal state)', () => {
      const settings = service.getSettings();
      settings.smsProvider.name = 'mutated';

      const fresh = service.getSettings();
      expect(fresh.smsProvider.name).not.toBe('mutated');
    });
  });

  describe('updateSettings()', () => {
    it('should update smsProvider settings', async () => {
      const updated = await service.updateSettings('admin-1', {
        smsProvider: { name: 'media4u', apiKey: 'key-123', endpoint: 'https://api.example.com' },
      });

      expect(updated.smsProvider).toEqual({
        name: 'media4u',
        apiKey: 'key-123',
        endpoint: 'https://api.example.com',
      });
    });

    it('should partially update smsProvider settings', async () => {
      await service.updateSettings('admin-1', {
        smsProvider: { name: 'media4u', apiKey: 'key-1', endpoint: 'https://a.com' },
      });

      const updated = await service.updateSettings('admin-1', {
        smsProvider: { name: 'media4u', apiKey: 'key-2', endpoint: 'https://a.com' },
      });

      expect(updated.smsProvider.apiKey).toBe('key-2');
    });

    it('should update webhook settings', async () => {
      const updated = await service.updateSettings('admin-1', {
        webhook: { url: 'https://hook.example.com', secret: 's3cret' },
      });

      expect(updated.webhook).toEqual({
        url: 'https://hook.example.com',
        secret: 's3cret',
      });
    });

    it('should update testPhoneNumber', async () => {
      const updated = await service.updateSettings('admin-1', {
        testPhoneNumber: '09099999999',
      });

      expect(updated.testPhoneNumber).toBe('09099999999');
    });

    it('should update rateLimitPerMinute', async () => {
      const updated = await service.updateSettings('admin-1', {
        rateLimitPerMinute: 20,
      });

      expect(updated.rateLimitPerMinute).toBe(20);
    });

    it('should update zendeskIntegration settings', async () => {
      const updated = await service.updateSettings('admin-1', {
        zendeskIntegration: {
          subdomain: 'mycompany',
          email: 'admin@mycompany.com',
          apiToken: 'zd-token',
        },
      });

      expect(updated.zendeskIntegration).toEqual({
        subdomain: 'mycompany',
        email: 'admin@mycompany.com',
        apiToken: 'zd-token',
      });
    });

    it('should record audit log with before/after values', async () => {
      const before = service.getSettings();

      await service.updateSettings('admin-1', {
        testPhoneNumber: '09011112222',
      }, '10.0.0.1');

      expect(mockAudit.log).toHaveBeenCalledWith({
        userId: 'admin-1',
        action: 'config_change',
        resourceType: 'settings',
        resourceId: 'system-settings',
        details: {
          before,
          after: expect.objectContaining({ testPhoneNumber: '09011112222' }),
        },
        ipAddress: '10.0.0.1',
      });
    });

    it('should persist changes across getSettings calls', async () => {
      await service.updateSettings('admin-1', {
        rateLimitPerMinute: 50,
      });

      const settings = service.getSettings();
      expect(settings.rateLimitPerMinute).toBe(50);
    });

    it('should update multiple sections at once', async () => {
      const updated = await service.updateSettings('admin-1', {
        testPhoneNumber: '09033334444',
        rateLimitPerMinute: 30,
        webhook: { url: 'https://new.hook', secret: 'new-secret' },
      });

      expect(updated.testPhoneNumber).toBe('09033334444');
      expect(updated.rateLimitPerMinute).toBe(30);
      expect(updated.webhook.url).toBe('https://new.hook');
    });
  });
});
