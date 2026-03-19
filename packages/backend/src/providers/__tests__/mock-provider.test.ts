import { describe, it, expect, beforeEach } from 'vitest';
import { MockProvider } from '../mock-provider.js';
import type { SendMessageRequest } from '../sms-provider.js';

describe('MockProvider', () => {
  let provider: MockProvider;

  const validRequest: SendMessageRequest = {
    to: '09012345678',
    body: 'テストメッセージ',
  };

  beforeEach(() => {
    provider = new MockProvider();
  });

  describe('sendMessage', () => {
    it('should return success with externalMessageId and queued status', async () => {
      const result = await provider.sendMessage(validRequest);

      expect(result.success).toBe(true);
      expect(result.externalMessageId).toBeDefined();
      expect(result.externalMessageId).toMatch(/^mock-/);
      expect(result.status).toBe('queued');
      expect(result.error).toBeUndefined();
    });

    it('should store the message in memory', async () => {
      const result = await provider.sendMessage(validRequest);
      const stored = provider.getStoredMessage(result.externalMessageId!);

      expect(stored).toBeDefined();
      expect(stored!.request).toEqual(validRequest);
      expect(stored!.status).toBe('queued');
    });

    it('should generate unique externalMessageIds', async () => {
      const r1 = await provider.sendMessage(validRequest);
      const r2 = await provider.sendMessage(validRequest);

      expect(r1.externalMessageId).not.toBe(r2.externalMessageId);
    });

    it('should return failure when shouldFail is true', async () => {
      provider = new MockProvider({ shouldFail: true });
      const result = await provider.sendMessage(validRequest);

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe('MOCK_FAILURE');
    });

    it('should not store message on failure', async () => {
      provider = new MockProvider({ shouldFail: true });
      await provider.sendMessage(validRequest);

      expect(provider.getAllMessages().size).toBe(0);
    });

    it('should support metadata in request', async () => {
      const reqWithMeta: SendMessageRequest = {
        ...validRequest,
        metadata: { ticketId: 'T-123' },
      };
      const result = await provider.sendMessage(reqWithMeta);
      const stored = provider.getStoredMessage(result.externalMessageId!);

      expect(stored!.request.metadata).toEqual({ ticketId: 'T-123' });
    });
  });

  describe('getDeliveryStatus', () => {
    it('should return status for a sent message', async () => {
      const sendResult = await provider.sendMessage(validRequest);
      const status = await provider.getDeliveryStatus(sendResult.externalMessageId!);

      expect(status.externalMessageId).toBe(sendResult.externalMessageId);
      expect(status.status).toBe('queued');
      expect(status.updatedAt).toBeInstanceOf(Date);
    });

    it('should return unknown for non-existent message', async () => {
      const status = await provider.getDeliveryStatus('non-existent-id');

      expect(status.status).toBe('unknown');
      expect(status.externalMessageId).toBe('non-existent-id');
    });

    it('should simulate delivery progression when enabled', async () => {
      provider = new MockProvider({ simulateDeliveryProgression: true });
      const sendResult = await provider.sendMessage(validRequest);
      const id = sendResult.externalMessageId!;

      // queued -> sent
      const status1 = await provider.getDeliveryStatus(id);
      expect(status1.status).toBe('sent');

      // sent -> delivered
      const status2 = await provider.getDeliveryStatus(id);
      expect(status2.status).toBe('delivered');

      // delivered stays delivered
      const status3 = await provider.getDeliveryStatus(id);
      expect(status3.status).toBe('delivered');
    });

    it('should not progress status when progression is disabled', async () => {
      const sendResult = await provider.sendMessage(validRequest);
      const id = sendResult.externalMessageId!;

      const status1 = await provider.getDeliveryStatus(id);
      const status2 = await provider.getDeliveryStatus(id);

      expect(status1.status).toBe('queued');
      expect(status2.status).toBe('queued');
    });
  });

  describe('validateConfig', () => {
    it('should always return valid', async () => {
      const result = await provider.validateConfig();

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('helper methods', () => {
    it('clear() should reset all messages and counter', async () => {
      await provider.sendMessage(validRequest);
      await provider.sendMessage(validRequest);
      expect(provider.getAllMessages().size).toBe(2);

      provider.clear();
      expect(provider.getAllMessages().size).toBe(0);
    });

    it('setMessageStatus() should update status of stored message', async () => {
      const result = await provider.sendMessage(validRequest);
      const id = result.externalMessageId!;

      provider.setMessageStatus(id, 'delivered');
      const stored = provider.getStoredMessage(id);
      expect(stored!.status).toBe('delivered');
    });

    it('setMessageStatus() should be no-op for non-existent message', () => {
      // Should not throw
      provider.setMessageStatus('non-existent', 'delivered');
    });
  });

  describe('failureRate', () => {
    it('should fail approximately at the configured rate', async () => {
      provider = new MockProvider({ failureRate: 1.0 });
      const result = await provider.sendMessage(validRequest);
      expect(result.success).toBe(false);
    });

    it('should succeed when failureRate is 0', async () => {
      provider = new MockProvider({ failureRate: 0 });
      const result = await provider.sendMessage(validRequest);
      expect(result.success).toBe(true);
    });
  });
});
