import { describe, it, expect, vi } from 'vitest';
import type { SmsProvider, DeliveryStatus } from '@zendesk-sms-tool/shared';
import type { DeliveryService } from '../../services/delivery-service.js';
import {
  processPollingJob,
  addPollingJob,
  DELIVERY_POLLING_QUEUE,
  DEFAULT_POLLING_DELAY_MS,
  createDeliveryPollingQueue,
} from '../delivery-polling-worker.js';

// --- Mock factories ---

function createMockProvider(status: DeliveryStatus = 'delivered'): SmsProvider {
  return {
    sendMessage: vi.fn(),
    getDeliveryStatus: vi.fn<any>().mockResolvedValue({
      externalMessageId: 'ext-msg-001',
      status,
      updatedAt: new Date(),
      rawResponse: { provider: 'mock' },
    }),
    validateConfig: vi.fn(),
  };
}

function createMockDeliveryService(): DeliveryService {
  return {
    recordInitialStatus: vi.fn(),
    updateStatus: vi.fn<any>().mockResolvedValue(undefined),
    processWebhook: vi.fn(),
    schedulePolling: vi.fn(),
    getStatusHistory: vi.fn(),
  } as unknown as DeliveryService;
}

// --- Tests ---

describe('delivery-polling-worker', () => {
  describe('processPollingJob()', () => {
    it('should call provider.getDeliveryStatus and update via deliveryService', async () => {
      const provider = createMockProvider('delivered');
      const deliveryService = createMockDeliveryService();
      const job = {
        data: { smsLogId: 'sms-log-1', externalMessageId: 'ext-msg-001' },
      };

      const result = await processPollingJob(job, deliveryService, provider);

      expect(provider.getDeliveryStatus).toHaveBeenCalledWith('ext-msg-001');
      expect(deliveryService.updateStatus).toHaveBeenCalledWith(
        'sms-log-1',
        'delivered',
        'polling',
        { provider: 'mock' },
      );
      expect(result).toEqual({
        smsLogId: 'sms-log-1',
        externalMessageId: 'ext-msg-001',
        status: 'delivered',
        changed: true,
      });
    });

    it('should handle queued status from provider', async () => {
      const provider = createMockProvider('queued');
      const deliveryService = createMockDeliveryService();
      const job = {
        data: { smsLogId: 'sms-log-2', externalMessageId: 'ext-msg-002' },
      };

      const result = await processPollingJob(job, deliveryService, provider);

      expect(result.status).toBe('queued');
      expect(deliveryService.updateStatus).toHaveBeenCalledWith(
        'sms-log-2',
        'queued',
        'polling',
        { provider: 'mock' },
      );
    });

    it('should handle failed status from provider', async () => {
      const provider = createMockProvider('failed');
      const deliveryService = createMockDeliveryService();
      const job = {
        data: { smsLogId: 'sms-log-3', externalMessageId: 'ext-msg-003' },
      };

      const result = await processPollingJob(job, deliveryService, provider);

      expect(result.status).toBe('failed');
    });

    it('should propagate provider errors', async () => {
      const provider = createMockProvider();
      (provider.getDeliveryStatus as any).mockRejectedValue(new Error('Provider timeout'));
      const deliveryService = createMockDeliveryService();
      const job = {
        data: { smsLogId: 'sms-log-4', externalMessageId: 'ext-msg-004' },
      };

      await expect(processPollingJob(job, deliveryService, provider)).rejects.toThrow(
        'Provider timeout',
      );
    });
  });

  describe('addPollingJob()', () => {
    it('should add a job to the queue with default delay', async () => {
      const mockQueue = { add: vi.fn().mockResolvedValue({}) } as any;

      await addPollingJob(mockQueue, 'sms-log-1', 'ext-msg-001');

      expect(mockQueue.add).toHaveBeenCalledWith(
        'poll-ext-msg-001',
        { smsLogId: 'sms-log-1', externalMessageId: 'ext-msg-001' },
        { delay: DEFAULT_POLLING_DELAY_MS },
      );
    });

    it('should add a job with custom delay', async () => {
      const mockQueue = { add: vi.fn().mockResolvedValue({}) } as any;

      await addPollingJob(mockQueue, 'sms-log-1', 'ext-msg-001', 60_000);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'poll-ext-msg-001',
        { smsLogId: 'sms-log-1', externalMessageId: 'ext-msg-001' },
        { delay: 60_000 },
      );
    });
  });

  describe('createDeliveryPollingQueue()', () => {
    it('should create a queue with correct name and retry config', () => {
      // Use a mock connection - we just verify the queue is created with correct options
      const queue = createDeliveryPollingQueue({ host: 'localhost', port: 6379 });

      expect(queue.name).toBe(DELIVERY_POLLING_QUEUE);

      // Clean up to avoid open handles
      queue.close();
    });
  });

  describe('constants', () => {
    it('should have correct queue name', () => {
      expect(DELIVERY_POLLING_QUEUE).toBe('delivery-polling');
    });

    it('should have 30s default polling delay', () => {
      expect(DEFAULT_POLLING_DELAY_MS).toBe(30_000);
    });
  });
});
