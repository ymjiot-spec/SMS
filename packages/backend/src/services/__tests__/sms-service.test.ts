import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SmsService } from '../sms-service.js';
import type { SendParams } from '../sms-service.js';
import type { SmsProvider, SendMessageResponse } from '@zendesk-sms-tool/shared';
import { AuditService } from '../audit-service.js';

// --- Mock factories ---

function createMockProvider(overrides?: Partial<SmsProvider>): SmsProvider {
  return {
    sendMessage: vi.fn<any>().mockResolvedValue({
      success: true,
      externalMessageId: 'ext-msg-001',
      status: 'queued',
    } satisfies SendMessageResponse),
    getDeliveryStatus: vi.fn(),
    validateConfig: vi.fn(),
    ...overrides,
  };
}

function createMockPrisma() {
  return {
    smsLog: {
      create: vi.fn<any>().mockResolvedValue({
        id: 'sms-log-1',
        operatorId: 'op-1',
        recipientPhone: '09012345678',
        messageBody: 'テスト',
        sendType: 'CUSTOMER',
        externalMessageId: 'ext-msg-001',
        deliveryStatus: 'QUEUED',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    },
  } as any;
}

function createMockAuditService(): AuditService {
  return {
    log: vi.fn().mockResolvedValue(undefined),
    search: vi.fn(),
  } as any;
}

function validSendParams(overrides?: Partial<SendParams>): SendParams {
  return {
    operatorId: 'op-1',
    to: '09012345678',
    body: 'テストメッセージです',
    sendType: 'customer',
    ...overrides,
  };
}

// --- Tests ---

describe('SmsService', () => {
  let service: SmsService;
  let mockProvider: SmsProvider;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockAudit: AuditService;

  beforeEach(() => {
    mockProvider = createMockProvider();
    mockPrisma = createMockPrisma();
    mockAudit = createMockAuditService();
    service = new SmsService(mockProvider, mockPrisma, mockAudit);
  });

  describe('send() - 成功ケース', () => {
    it('should send SMS successfully with valid params', async () => {
      const result = await service.send(validSendParams());

      expect(result.success).toBe(true);
      expect(result.externalMessageId).toBe('ext-msg-001');
      expect(result.smsLogId).toBe('sms-log-1');
      expect(result.error).toBeUndefined();
    });

    it('should call provider.sendMessage with correct params', async () => {
      const params = validSendParams();
      await service.send(params);

      expect(mockProvider.sendMessage).toHaveBeenCalledWith({
        to: '09012345678',
        body: 'テストメッセージです',
      });
    });

    it('should create sms_log record on success', async () => {
      await service.send(validSendParams({ templateId: 'tmpl-1', ticketId: 'ticket-100' }));

      expect(mockPrisma.smsLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          operatorId: 'op-1',
          recipientPhone: '09012345678',
          messageBody: 'テストメッセージです',
          templateId: 'tmpl-1',
          ticketId: 'ticket-100',
          sendType: 'CUSTOMER',
          externalMessageId: 'ext-msg-001',
          deliveryStatus: 'QUEUED',
        }),
      });
    });

    it('should create audit log on success with sms_send action', async () => {
      await service.send(validSendParams());

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'op-1',
          action: 'sms_send',
          resourceType: 'sms',
          resourceId: 'sms-log-1',
          details: expect.objectContaining({
            recipientPhone: '09012345678',
            messageBody: 'テストメッセージです',
            resultStatus: 'success',
          }),
        }),
      );
    });

    it('should handle self_copy sendType', async () => {
      await service.send(validSendParams({ sendType: 'self_copy' }));

      expect(mockPrisma.smsLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sendType: 'SELF_COPY',
        }),
      });
    });

    it('should handle test sendType', async () => {
      await service.send(validSendParams({ sendType: 'test' }));

      expect(mockPrisma.smsLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sendType: 'TEST',
        }),
      });
    });

    it('should set null for optional fields when not provided', async () => {
      await service.send(validSendParams());

      expect(mockPrisma.smsLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          templateId: null,
          ticketId: null,
        }),
      });
    });
  });

  describe('send() - 電話番号バリデーション (Requirement 1.4)', () => {
    it('should reject invalid phone number format', async () => {
      const result = await service.send(validSendParams({ to: '12345' }));

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_PHONE_NUMBER');
      expect(mockProvider.sendMessage).not.toHaveBeenCalled();
      expect(mockPrisma.smsLog.create).not.toHaveBeenCalled();
    });

    it('should reject phone number without 070/080/090 prefix', async () => {
      const result = await service.send(validSendParams({ to: '06012345678' }));

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_PHONE_NUMBER');
    });

    it('should reject phone number with wrong length', async () => {
      const result = await service.send(validSendParams({ to: '0901234567' }));

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_PHONE_NUMBER');
    });

    it('should accept valid 070 prefix', async () => {
      const result = await service.send(validSendParams({ to: '07012345678' }));
      expect(result.success).toBe(true);
    });

    it('should accept valid 080 prefix', async () => {
      const result = await service.send(validSendParams({ to: '08012345678' }));
      expect(result.success).toBe(true);
    });

    it('should accept valid 090 prefix', async () => {
      const result = await service.send(validSendParams({ to: '09012345678' }));
      expect(result.success).toBe(true);
    });
  });

  describe('send() - メッセージ本文バリデーション (Requirement 1.5)', () => {
    it('should reject empty message body', async () => {
      const result = await service.send(validSendParams({ body: '' }));

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('EMPTY_MESSAGE_BODY');
      expect(mockProvider.sendMessage).not.toHaveBeenCalled();
      expect(mockPrisma.smsLog.create).not.toHaveBeenCalled();
    });

    it('should reject whitespace-only message body', async () => {
      const result = await service.send(validSendParams({ body: '   \t\n  ' }));

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('EMPTY_MESSAGE_BODY');
      expect(mockProvider.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('send() - プロバイダエラー (Requirement 1.3)', () => {
    it('should return error when provider fails', async () => {
      const failProvider = createMockProvider({
        sendMessage: vi.fn<any>().mockResolvedValue({
          success: false,
          status: 'failed',
          error: { code: 'PROVIDER_TIMEOUT', message: 'Request timed out' },
        } satisfies SendMessageResponse),
      });
      service = new SmsService(failProvider, mockPrisma, mockAudit);

      const result = await service.send(validSendParams());

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PROVIDER_TIMEOUT');
      expect(result.error?.message).toBe('Request timed out');
      expect(result.smsLogId).toBe('sms-log-1');
    });

    it('should create sms_log with FAILED status on provider error', async () => {
      const failProvider = createMockProvider({
        sendMessage: vi.fn<any>().mockResolvedValue({
          success: false,
          status: 'failed',
          error: { code: 'PROVIDER_ERROR', message: 'Failed' },
        } satisfies SendMessageResponse),
      });
      service = new SmsService(failProvider, mockPrisma, mockAudit);

      await service.send(validSendParams());

      expect(mockPrisma.smsLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          deliveryStatus: 'FAILED',
          resultMessage: 'Failed',
          externalMessageId: null,
        }),
      });
    });

    it('should create audit log with sms_send_failed action on provider error', async () => {
      const failProvider = createMockProvider({
        sendMessage: vi.fn<any>().mockResolvedValue({
          success: false,
          status: 'failed',
          error: { code: 'RATE_LIMITED', message: 'Too many requests' },
        } satisfies SendMessageResponse),
      });
      service = new SmsService(failProvider, mockPrisma, mockAudit);

      await service.send(validSendParams());

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'sms_send_failed',
          details: expect.objectContaining({
            errorCode: 'RATE_LIMITED',
            errorMessage: 'Too many requests',
            resultStatus: 'failed',
          }),
        }),
      );
    });

    it('should handle provider error without error details', async () => {
      const failProvider = createMockProvider({
        sendMessage: vi.fn<any>().mockResolvedValue({
          success: false,
          status: 'failed',
        } satisfies SendMessageResponse),
      });
      service = new SmsService(failProvider, mockPrisma, mockAudit);

      const result = await service.send(validSendParams());

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PROVIDER_ERROR');
      expect(result.error?.message).toBe('SMS送信に失敗しました');
    });
  });
});

// --- DeliveryService integration tests (Task 15.4) ---

describe('SmsService - DeliveryService integration', () => {
  let mockProvider: SmsProvider;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockAudit: AuditService;

  const mockDeliveryService = {
    recordInitialStatus: vi.fn().mockResolvedValue(undefined),
    schedulePolling: vi.fn().mockResolvedValue({ scheduled: false, message: 'no queue' }),
    processWebhook: vi.fn(),
    getStatusHistory: vi.fn(),
    updateStatus: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockProvider = createMockProvider();
    mockPrisma = createMockPrisma();
    mockAudit = createMockAuditService();
  });

  it('should call recordInitialStatus and schedulePolling after successful send', async () => {
    const service = new SmsService(mockProvider, mockPrisma, mockAudit, mockDeliveryService as any);
    const result = await service.send(validSendParams());

    expect(result.success).toBe(true);
    expect(mockDeliveryService.recordInitialStatus).toHaveBeenCalledWith('sms-log-1', 'queued');
    expect(mockDeliveryService.schedulePolling).toHaveBeenCalledWith('sms-log-1', 'ext-msg-001');
  });

  it('should not call delivery service on failed send', async () => {
    const failProvider = createMockProvider({
      sendMessage: vi.fn<any>().mockResolvedValue({
        success: false,
        status: 'failed',
        error: { code: 'PROVIDER_ERROR', message: 'Failed' },
      } satisfies SendMessageResponse),
    });
    const service = new SmsService(failProvider, mockPrisma, mockAudit, mockDeliveryService as any);
    const result = await service.send(validSendParams());

    expect(result.success).toBe(false);
    expect(mockDeliveryService.recordInitialStatus).not.toHaveBeenCalled();
    expect(mockDeliveryService.schedulePolling).not.toHaveBeenCalled();
  });

  it('should not fail send if delivery service throws', async () => {
    mockDeliveryService.recordInitialStatus.mockRejectedValueOnce(new Error('DB error'));
    const service = new SmsService(mockProvider, mockPrisma, mockAudit, mockDeliveryService as any);
    const result = await service.send(validSendParams());

    expect(result.success).toBe(true);
    expect(result.smsLogId).toBe('sms-log-1');
  });

  it('should work without delivery service (backward compatible)', async () => {
    const service = new SmsService(mockProvider, mockPrisma, mockAudit);
    const result = await service.send(validSendParams());

    expect(result.success).toBe(true);
    expect(mockDeliveryService.recordInitialStatus).not.toHaveBeenCalled();
  });

  it('should not schedule polling when no externalMessageId', async () => {
    const noExtIdProvider = createMockProvider({
      sendMessage: vi.fn<any>().mockResolvedValue({
        success: true,
        status: 'queued',
      } satisfies SendMessageResponse),
    });
    const service = new SmsService(noExtIdProvider, mockPrisma, mockAudit, mockDeliveryService as any);
    await service.send(validSendParams());

    expect(mockDeliveryService.recordInitialStatus).toHaveBeenCalled();
    expect(mockDeliveryService.schedulePolling).not.toHaveBeenCalled();
  });
});


// --- sendWithSelfCopy tests (Task 16.1, Requirements: 4.1, 4.2, 4.3, 4.4) ---

describe('SmsService - sendWithSelfCopy', () => {
  let service: SmsService;
  let mockProvider: SmsProvider;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockAudit: AuditService;
  let logIdCounter: number;

  beforeEach(() => {
    logIdCounter = 0;
    mockProvider = createMockProvider();
    mockPrisma = createMockPrisma();
    // Return unique IDs for each smsLog.create call
    mockPrisma.smsLog.create = vi.fn<any>().mockImplementation(() => {
      logIdCounter++;
      return Promise.resolve({
        id: `sms-log-${logIdCounter}`,
        operatorId: 'op-1',
        recipientPhone: '09012345678',
        messageBody: 'テスト',
        sendType: logIdCounter === 1 ? 'CUSTOMER' : 'SELF_COPY',
        externalMessageId: `ext-msg-${logIdCounter}`,
        deliveryStatus: 'QUEUED',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });
    mockAudit = createMockAuditService();
    service = new SmsService(mockProvider, mockPrisma, mockAudit);
  });

  it('should send to customer and self when both succeed', async () => {
    const result = await service.sendWithSelfCopy({
      operatorId: 'op-1',
      to: '09012345678',
      body: 'テストメッセージ',
      operatorPhone: '08012345678',
    });

    expect(result.customerResult.success).toBe(true);
    expect(result.selfCopyResult?.success).toBe(true);
    expect(result.partialSuccess).toBe(false);
    expect(mockProvider.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('should send customer with sendType customer and self with self_copy', async () => {
    await service.sendWithSelfCopy({
      operatorId: 'op-1',
      to: '09012345678',
      body: 'テストメッセージ',
      operatorPhone: '08012345678',
    });

    // First call: customer
    expect(mockPrisma.smsLog.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({ sendType: 'CUSTOMER', recipientPhone: '09012345678' }),
    });
    // Second call: self_copy
    expect(mockPrisma.smsLog.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({ sendType: 'SELF_COPY', recipientPhone: '08012345678' }),
    });
  });

  it('should send identical message body to both customer and self', async () => {
    await service.sendWithSelfCopy({
      operatorId: 'op-1',
      to: '09012345678',
      body: '同一メッセージ',
      operatorPhone: '08012345678',
    });

    expect(mockProvider.sendMessage).toHaveBeenNthCalledWith(1, { to: '09012345678', body: '同一メッセージ' });
    expect(mockProvider.sendMessage).toHaveBeenNthCalledWith(2, { to: '08012345678', body: '同一メッセージ' });
  });

  it('should return partialSuccess when self-copy fails but customer succeeds (Requirement 4.4)', async () => {
    let callCount = 0;
    const partialProvider = createMockProvider({
      sendMessage: vi.fn<any>().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ success: true, externalMessageId: 'ext-1', status: 'queued' });
        }
        return Promise.resolve({ success: false, status: 'failed', error: { code: 'PROVIDER_ERROR', message: 'Failed' } });
      }),
    });
    service = new SmsService(partialProvider, mockPrisma, mockAudit);

    const result = await service.sendWithSelfCopy({
      operatorId: 'op-1',
      to: '09012345678',
      body: 'テスト',
      operatorPhone: '08012345678',
    });

    expect(result.customerResult.success).toBe(true);
    expect(result.selfCopyResult?.success).toBe(false);
    expect(result.partialSuccess).toBe(true);
  });

  it('should not send self-copy when customer send fails', async () => {
    const failProvider = createMockProvider({
      sendMessage: vi.fn<any>().mockResolvedValue({
        success: false,
        status: 'failed',
        error: { code: 'PROVIDER_ERROR', message: 'Failed' },
      } satisfies SendMessageResponse),
    });
    service = new SmsService(failProvider, mockPrisma, mockAudit);

    const result = await service.sendWithSelfCopy({
      operatorId: 'op-1',
      to: '09012345678',
      body: 'テスト',
      operatorPhone: '08012345678',
    });

    expect(result.customerResult.success).toBe(false);
    expect(result.selfCopyResult).toBeUndefined();
    expect(result.partialSuccess).toBe(false);
    expect(failProvider.sendMessage).toHaveBeenCalledTimes(1);
  });
});

// --- testSend tests (Task 17.1, Requirements: 5.1, 5.2, 5.4) ---

describe('SmsService - testSend', () => {
  let service: SmsService;
  let mockProvider: SmsProvider;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockAudit: AuditService;

  beforeEach(() => {
    mockProvider = createMockProvider();
    mockPrisma = createMockPrisma();
    mockAudit = createMockAuditService();
    service = new SmsService(mockProvider, mockPrisma, mockAudit);
  });

  it('should prepend [TEST] prefix to message body (Requirement 5.4)', async () => {
    await service.testSend({
      operatorId: 'op-1',
      body: 'テストメッセージ',
      testPhone: '09099999999',
    });

    expect(mockProvider.sendMessage).toHaveBeenCalledWith({
      to: '09099999999',
      body: '[TEST] テストメッセージ',
    });
  });

  it('should send to test phone number, not customer number (Requirement 5.1)', async () => {
    await service.testSend({
      operatorId: 'op-1',
      body: 'テスト',
      testPhone: '07099999999',
    });

    expect(mockProvider.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ to: '07099999999' }),
    );
  });

  it('should record with sendType test (Requirement 5.2)', async () => {
    await service.testSend({
      operatorId: 'op-1',
      body: 'テスト',
      testPhone: '09099999999',
    });

    expect(mockPrisma.smsLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ sendType: 'TEST' }),
    });
  });

  it('should return success result on successful test send', async () => {
    const result = await service.testSend({
      operatorId: 'op-1',
      body: 'テスト',
      testPhone: '09099999999',
    });

    expect(result.success).toBe(true);
    expect(result.externalMessageId).toBe('ext-msg-001');
  });

  it('should return error when test phone is invalid', async () => {
    const result = await service.testSend({
      operatorId: 'op-1',
      body: 'テスト',
      testPhone: '12345',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_PHONE_NUMBER');
  });
});
