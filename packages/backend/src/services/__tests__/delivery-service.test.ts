import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { DeliveryService } from '../delivery-service.js';
import type { SmsProvider } from '@zendesk-sms-tool/shared';

// --- Mock factories ---

function createMockProvider(): SmsProvider {
  return {
    sendMessage: vi.fn(),
    getDeliveryStatus: vi.fn(),
    validateConfig: vi.fn(),
  };
}

function createMockPrisma() {
  return {
    deliveryEvent: {
      create: vi.fn<any>().mockResolvedValue({
        id: 'de-1',
        smsLogId: 'sms-log-1',
        status: 'QUEUED',
        rawPayload: null,
        source: 'api_response',
        createdAt: new Date('2024-01-01T00:00:00Z'),
      }),
      findMany: vi.fn<any>().mockResolvedValue([]),
    },
    smsLog: {
      update: vi.fn<any>().mockResolvedValue({}),
      findFirst: vi.fn<any>().mockResolvedValue(null),
    },
  } as any;
}

// --- Tests ---

describe('DeliveryService', () => {
  let service: DeliveryService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockProvider: SmsProvider;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockProvider = createMockProvider();
    service = new DeliveryService(mockPrisma, mockProvider);
  });

  describe('recordInitialStatus()', () => {
    it('should create a delivery event with api_response source', async () => {
      await service.recordInitialStatus('sms-log-1', 'queued');

      expect(mockPrisma.deliveryEvent.create).toHaveBeenCalledWith({
        data: {
          smsLogId: 'sms-log-1',
          status: 'QUEUED',
          source: 'api_response',
          rawPayload: Prisma.JsonNull,
        },
      });
    });

    it('should handle different initial statuses', async () => {
      await service.recordInitialStatus('sms-log-2', 'sent');

      expect(mockPrisma.deliveryEvent.create).toHaveBeenCalledWith({
        data: {
          smsLogId: 'sms-log-2',
          status: 'SENT',
          source: 'api_response',
          rawPayload: Prisma.JsonNull,
        },
      });
    });
  });

  describe('updateStatus()', () => {
    it('should create a delivery event and update sms_log', async () => {
      await service.updateStatus('sms-log-1', 'delivered', 'polling');

      expect(mockPrisma.deliveryEvent.create).toHaveBeenCalledWith({
        data: {
          smsLogId: 'sms-log-1',
          status: 'DELIVERED',
          source: 'polling',
          rawPayload: Prisma.JsonNull,
        },
      });

      expect(mockPrisma.smsLog.update).toHaveBeenCalledWith({
        where: { id: 'sms-log-1' },
        data: { deliveryStatus: 'DELIVERED' },
      });
    });

    it('should store rawPayload when provided', async () => {
      const rawPayload = { provider_status: 'DLR_RECEIVED', timestamp: '2024-01-01' };
      await service.updateStatus('sms-log-1', 'delivered', 'webhook', rawPayload);

      expect(mockPrisma.deliveryEvent.create).toHaveBeenCalledWith({
        data: {
          smsLogId: 'sms-log-1',
          status: 'DELIVERED',
          source: 'webhook',
          rawPayload,
        },
      });
    });

    it('should handle failed status', async () => {
      await service.updateStatus('sms-log-1', 'failed', 'polling');

      expect(mockPrisma.smsLog.update).toHaveBeenCalledWith({
        where: { id: 'sms-log-1' },
        data: { deliveryStatus: 'FAILED' },
      });
    });
  });

  describe('processWebhook()', () => {
    it('should find sms_log by externalMessageId and update status', async () => {
      mockPrisma.smsLog.findFirst.mockResolvedValue({
        id: 'sms-log-1',
        externalMessageId: 'ext-msg-001',
      });

      await service.processWebhook({
        externalMessageId: 'ext-msg-001',
        status: 'delivered',
        rawPayload: { raw: 'data' },
      });

      expect(mockPrisma.smsLog.findFirst).toHaveBeenCalledWith({
        where: { externalMessageId: 'ext-msg-001' },
      });

      expect(mockPrisma.deliveryEvent.create).toHaveBeenCalledWith({
        data: {
          smsLogId: 'sms-log-1',
          status: 'DELIVERED',
          source: 'webhook',
          rawPayload: { raw: 'data' },
        },
      });

      expect(mockPrisma.smsLog.update).toHaveBeenCalledWith({
        where: { id: 'sms-log-1' },
        data: { deliveryStatus: 'DELIVERED' },
      });
    });

    it('should throw when sms_log not found for externalMessageId', async () => {
      mockPrisma.smsLog.findFirst.mockResolvedValue(null);

      await expect(
        service.processWebhook({
          externalMessageId: 'unknown-id',
          status: 'delivered',
        }),
      ).rejects.toThrow('SmsLog not found for externalMessageId: unknown-id');
    });

    it('should process webhook without rawPayload', async () => {
      mockPrisma.smsLog.findFirst.mockResolvedValue({
        id: 'sms-log-2',
        externalMessageId: 'ext-msg-002',
      });

      await service.processWebhook({
        externalMessageId: 'ext-msg-002',
        status: 'failed',
      });

      expect(mockPrisma.deliveryEvent.create).toHaveBeenCalledWith({
        data: {
          smsLogId: 'sms-log-2',
          status: 'FAILED',
          source: 'webhook',
          rawPayload: Prisma.JsonNull,
        },
      });
    });
  });

  describe('schedulePolling()', () => {
    it('should return not-scheduled when no queue provided', async () => {
      const result = await service.schedulePolling('sms-log-1', 'ext-msg-001');

      expect(result).toEqual({
        smsLogId: 'sms-log-1',
        externalMessageId: 'ext-msg-001',
        scheduled: false,
        message: expect.stringContaining('No queue'),
      });
    });

    it('should schedule job when queue is provided', async () => {
      const mockQueue = { add: vi.fn().mockResolvedValue({}) } as any;

      const result = await service.schedulePolling('sms-log-1', 'ext-msg-001', mockQueue);

      expect(result).toEqual({
        smsLogId: 'sms-log-1',
        externalMessageId: 'ext-msg-001',
        scheduled: true,
        message: expect.stringContaining('scheduled'),
      });
      expect(mockQueue.add).toHaveBeenCalledWith(
        'poll-ext-msg-001',
        { smsLogId: 'sms-log-1', externalMessageId: 'ext-msg-001' },
        { delay: 30_000 },
      );
    });
  });

  describe('getStatusHistory()', () => {
    it('should return delivery events ordered by createdAt', async () => {
      const now = new Date('2024-01-01T00:00:00Z');
      const later = new Date('2024-01-01T01:00:00Z');

      mockPrisma.deliveryEvent.findMany.mockResolvedValue([
        {
          id: 'de-1',
          smsLogId: 'sms-log-1',
          status: 'QUEUED',
          rawPayload: null,
          source: 'api_response',
          createdAt: now,
        },
        {
          id: 'de-2',
          smsLogId: 'sms-log-1',
          status: 'DELIVERED',
          rawPayload: { raw: 'data' },
          source: 'polling',
          createdAt: later,
        },
      ]);

      const history = await service.getStatusHistory('sms-log-1');

      expect(mockPrisma.deliveryEvent.findMany).toHaveBeenCalledWith({
        where: { smsLogId: 'sms-log-1' },
        orderBy: { createdAt: 'asc' },
      });

      expect(history).toHaveLength(2);
      expect(history[0]).toEqual({
        id: 'de-1',
        smsLogId: 'sms-log-1',
        status: 'queued',
        rawPayload: undefined,
        source: 'api_response',
        createdAt: now,
      });
      expect(history[1]).toEqual({
        id: 'de-2',
        smsLogId: 'sms-log-1',
        status: 'delivered',
        rawPayload: { raw: 'data' },
        source: 'polling',
        createdAt: later,
      });
    });

    it('should return empty array when no events exist', async () => {
      mockPrisma.deliveryEvent.findMany.mockResolvedValue([]);

      const history = await service.getStatusHistory('sms-log-nonexistent');

      expect(history).toEqual([]);
    });
  });
});
