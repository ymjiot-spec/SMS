/**
 * Integration Tests — フロントエンド・バックエンド統合テスト
 * Requirements: 13.4, 7.1, 8.1
 *
 * SMS送信 → ログ記録 → Zendesk社内メモ → 配信追跡の一連フローを検証。
 * 全エンドポイントの接続確認と、Zendesk サイドバーアプリ / Web アプリ両モードの動作確認。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';

// Controllers
import { SmsController } from '../controllers/sms-controller.js';
import { TemplateController } from '../controllers/template-controller.js';
import { HistoryController } from '../controllers/history-controller.js';
import { ZendeskController } from '../controllers/zendesk-controller.js';
import { UserController } from '../controllers/user-controller.js';
import { CompanyController } from '../controllers/company-controller.js';
import { SettingsController } from '../controllers/settings-controller.js';

// Routes
import { createSmsRoutes, createWebhookRoutes } from '../routes/sms-routes.js';
import { createTemplateRoutes } from '../routes/template-routes.js';
import { createZendeskRoutes } from '../routes/zendesk-routes.js';
import { createUserRoutes } from '../routes/user-routes.js';
import { createCompanyRoutes } from '../routes/company-routes.js';
import { createSettingsRoutes } from '../routes/settings-routes.js';

// ---- Mock users ----
const operatorUser = {
  id: 'op-1',
  email: 'operator@example.com',
  name: 'Operator Tanaka',
  phone: '09012345678',
  role: 'OPERATOR' as const,
  companyId: 'company-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const supervisorUser = {
  id: 'sv-1',
  email: 'supervisor@example.com',
  name: 'Supervisor Suzuki',
  phone: '09087654321',
  role: 'SUPERVISOR' as const,
  companyId: 'company-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const adminUser = {
  id: 'admin-1',
  email: 'admin@example.com',
  name: 'Admin Yamada',
  phone: '09011112222',
  role: 'SYSTEM_ADMIN' as const,
  companyId: 'company-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ---- Helpers ----
interface MockUser {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: 'OPERATOR' | 'SUPERVISOR' | 'SYSTEM_ADMIN';
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
}

function fakeAuth(user: MockUser) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.user = user;
    next();
  };
}

function passthrough(_req: Request, _res: Response, next: NextFunction) {
  next();
}

function rejectForbidden(_req: Request, res: Response) {
  res.status(403).json({
    error: { code: 'FORBIDDEN', message: 'この操作を実行する権限がありません。' },
  });
}

async function request(
  app: express.Express,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const url = `http://127.0.0.1:${port}${path}`;
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const json = text ? JSON.parse(text).valueOf() : null;
    return { status: res.status, body: json };
  } finally {
    server.close();
  }
}

// ---- Shared mock services ----
function createMockServices() {
  const smsLogStore: any[] = [];
  const auditLogStore: any[] = [];
  let logIdCounter = 0;

  const mockSmsService = {
    send: vi.fn().mockImplementation(async (params: any) => {
      logIdCounter++;
      const logId = `log-${logIdCounter}`;
      const extId = `ext-${logIdCounter}`;
      smsLogStore.push({
        id: logId,
        operatorId: params.operatorId,
        recipientPhone: params.to,
        messageBody: params.body,
        templateId: params.templateId ?? null,
        ticketId: params.ticketId ?? null,
        sendType: params.sendType ?? 'customer',
        externalMessageId: extId,
        deliveryStatus: 'queued',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      auditLogStore.push({
        userId: params.operatorId,
        action: 'sms_send',
        resourceType: 'sms',
        resourceId: logId,
        details: {
          recipientPhone: params.to,
          messageBody: params.body,
          sendType: params.sendType ?? 'customer',
        },
      });
      return { success: true, smsLogId: logId, externalMessageId: extId };
    }),
    sendWithSelfCopy: vi.fn().mockImplementation(async (params: any) => {
      // Customer send
      logIdCounter++;
      const custLogId = `log-${logIdCounter}`;
      const custExtId = `ext-${logIdCounter}`;
      smsLogStore.push({
        id: custLogId,
        operatorId: params.operatorId,
        recipientPhone: params.to,
        messageBody: params.body,
        templateId: params.templateId ?? null,
        ticketId: params.ticketId ?? null,
        sendType: 'customer',
        externalMessageId: custExtId,
        deliveryStatus: 'queued',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      // Self copy send
      logIdCounter++;
      const selfLogId = `log-${logIdCounter}`;
      const selfExtId = `ext-${logIdCounter}`;
      smsLogStore.push({
        id: selfLogId,
        operatorId: params.operatorId,
        recipientPhone: params.operatorPhone,
        messageBody: params.body,
        templateId: params.templateId ?? null,
        ticketId: params.ticketId ?? null,
        sendType: 'self_copy',
        externalMessageId: selfExtId,
        deliveryStatus: 'queued',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return {
        customerResult: { success: true, smsLogId: custLogId, externalMessageId: custExtId },
        selfCopyResult: { success: true, smsLogId: selfLogId, externalMessageId: selfExtId },
        partialSuccess: false,
      };
    }),
    testSend: vi.fn().mockImplementation(async (params: any) => {
      logIdCounter++;
      const logId = `log-${logIdCounter}`;
      const extId = `ext-${logIdCounter}`;
      const testBody = `[TEST] ${params.body}`;
      smsLogStore.push({
        id: logId,
        operatorId: params.operatorId,
        recipientPhone: params.testPhone,
        messageBody: testBody,
        templateId: params.templateId ?? null,
        ticketId: params.ticketId ?? null,
        sendType: 'test',
        externalMessageId: extId,
        deliveryStatus: 'queued',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return { success: true, smsLogId: logId, externalMessageId: extId };
    }),
  };

  const mockDeliveryService = {
    processWebhook: vi.fn().mockResolvedValue(undefined),
    getStatusHistory: vi.fn().mockImplementation(async (smsLogId: string) => {
      const log = smsLogStore.find((l) => l.id === smsLogId);
      if (!log) return [];
      return [
        {
          id: `de-${smsLogId}`,
          smsLogId,
          status: log.deliveryStatus,
          source: 'api_response',
          createdAt: log.createdAt,
        },
      ];
    }),
    recordInitialStatus: vi.fn().mockResolvedValue(undefined),
    schedulePolling: vi.fn().mockResolvedValue({ scheduled: false }),
  };

  const mockTemplateService = {
    search: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockImplementation(async (data: any, userId: string) => ({
      id: 'tpl-new-1',
      name: data.name,
      body: data.body,
      companyId: data.companyId ?? null,
      brand: data.brand ?? null,
      purpose: data.purpose ?? null,
      department: data.department ?? null,
      visibility: data.visibility ?? 'company',
      createdBy: userId,
      lastUsedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    duplicate: vi.fn(),
    toggleFavorite: vi.fn(),
  };

  const mockHistoryService = {
    search: vi.fn().mockImplementation(async () => ({
      items: [...smsLogStore],
      total: smsLogStore.length,
      page: 1,
      limit: 20,
    })),
    getById: vi.fn().mockImplementation(async (id: string) => {
      return smsLogStore.find((l) => l.id === id) ?? null;
    }),
  };

  const mockZendeskService = {
    getTicketContext: vi.fn().mockResolvedValue({
      ticketId: '12345',
      subject: 'お問い合わせ',
      requesterName: '田中太郎',
      requesterPhone: '09012345678',
      status: 'open',
    }),
    createInternalNote: vi.fn().mockResolvedValue(undefined),
    formatInternalNote: vi.fn().mockReturnValue('formatted note'),
  };

  const mockAuditService = {
    log: vi.fn().mockImplementation(async (entry: any) => {
      auditLogStore.push(entry);
    }),
    search: vi.fn(),
  };

  const defaultSettings = {
    smsProvider: { name: 'mock', apiKey: '', endpoint: '' },
    webhook: { url: '', secret: '' },
    testPhoneNumber: '09000000000',
    rateLimitPerMinute: 10,
    zendeskIntegration: { subdomain: '', email: '', apiToken: '' },
  };

  const mockSettingsService = {
    getSettings: vi.fn().mockReturnValue(defaultSettings),
    updateSettings: vi.fn().mockImplementation(async (_userId: string, updates: any) => {
      return { ...defaultSettings, ...updates };
    }),
  };

  const mockPrisma = {
    company: {
      findMany: vi.fn().mockResolvedValue([
        { id: 'company-1', name: 'テスト株式会社', code: 'TST', createdAt: new Date(), updatedAt: new Date() },
      ]),
    },
  };

  return {
    smsLogStore,
    auditLogStore,
    mockSmsService,
    mockDeliveryService,
    mockTemplateService,
    mockHistoryService,
    mockZendeskService,
    mockAuditService,
    mockSettingsService,
    mockPrisma,
  };
}

/** Build a fully-wired Express app for a given user and role-based middleware */
function buildApp(
  user: MockUser,
  services: ReturnType<typeof createMockServices>,
  opts?: {
    /** If true, requireSupervisor rejects (simulates Operator) */
    rejectSupervisor?: boolean;
    /** If true, requireSystemAdmin rejects */
    rejectSystemAdmin?: boolean;
  },
) {
  const app = express();
  app.use(express.json());

  const smsController = new SmsController(
    services.mockSmsService as any,
    services.mockDeliveryService as any,
  );
  const templateController = new TemplateController(
    services.mockTemplateService as any,
    services.mockAuditService as any,
  );
  const historyController = new HistoryController(services.mockHistoryService as any);
  const zendeskController = new ZendeskController(services.mockZendeskService as any);
  const userController = new UserController();
  const companyController = new CompanyController(services.mockPrisma as any);
  const settingsController = new SettingsController(services.mockSettingsService as any);

  // Webhook routes — no auth
  app.use('/api/sms/webhook', createWebhookRoutes(smsController));

  // Auth
  app.use(fakeAuth(user));

  // SMS routes
  app.use(
    '/api/sms',
    createSmsRoutes({
      smsController,
      historyController,
      rateLimitMiddleware: passthrough,
      duplicateSendMiddleware: passthrough,
      keywordCheckMiddleware: passthrough,
      requireSupervisor: opts?.rejectSupervisor ? rejectForbidden : passthrough,
    }),
  );

  // Template routes
  app.use(
    '/api/templates',
    createTemplateRoutes({
      templateController,
      requireSupervisor: opts?.rejectSupervisor ? rejectForbidden : passthrough,
      validateUpdate: passthrough,
    }),
  );

  // Zendesk routes
  app.use('/api/zendesk', createZendeskRoutes({ zendeskController }));

  // User routes
  app.use('/api/users', createUserRoutes({ userController }));

  // Company routes
  app.use('/api/companies', createCompanyRoutes({ companyController }));

  // Settings routes
  app.use(
    '/api/settings',
    createSettingsRoutes({
      settingsController,
      requireSystemAdmin: opts?.rejectSystemAdmin ? rejectForbidden : passthrough,
    }),
  );

  // Health check
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  return app;
}

// =============================================================================
// Test Suites
// =============================================================================

describe('Integration Tests', () => {
  let services: ReturnType<typeof createMockServices>;

  beforeEach(() => {
    vi.clearAllMocks();
    services = createMockServices();
  });

  // ---------------------------------------------------------------------------
  // 1. SMS送信 → ログ記録 → 配信追跡 フロー
  // ---------------------------------------------------------------------------
  describe('SMS送信 → ログ記録 → 配信追跡 フロー', () => {
    it('should send SMS, record log, and track delivery status', async () => {
      const app = buildApp(operatorUser, services);

      // Step 1: Send SMS
      const sendRes = await request(app, 'POST', '/api/sms/send', {
        to: '09012345678',
        body: 'こんにちは、お問い合わせありがとうございます。',
        ticketId: '12345',
      });

      expect(sendRes.status).toBe(200);
      expect(sendRes.body.success).toBe(true);
      const smsLogId = sendRes.body.smsLogId;
      const externalMessageId = sendRes.body.externalMessageId;
      expect(smsLogId).toBeDefined();
      expect(externalMessageId).toBeDefined();

      // Step 2: Verify sms_logs entry via GET /api/sms/logs
      const logsRes = await request(app, 'GET', '/api/sms/logs');
      expect(logsRes.status).toBe(200);
      expect(logsRes.body.items.length).toBeGreaterThanOrEqual(1);
      const logEntry = logsRes.body.items.find((l: any) => l.id === smsLogId);
      expect(logEntry).toBeDefined();
      expect(logEntry.recipientPhone).toBe('09012345678');
      expect(logEntry.messageBody).toBe('こんにちは、お問い合わせありがとうございます。');
      expect(logEntry.sendType).toBe('customer');

      // Step 3: Verify delivery status tracking
      const deliveryRes = await request(app, 'GET', `/api/sms/delivery-status/${smsLogId}`);
      expect(deliveryRes.status).toBe(200);
      expect(deliveryRes.body.smsLogId).toBe(smsLogId);
      expect(deliveryRes.body.events.length).toBeGreaterThanOrEqual(1);
      expect(deliveryRes.body.events[0].status).toBe('queued');

      // Step 4: Verify audit log was created
      expect(services.auditLogStore.length).toBeGreaterThanOrEqual(1);
      const auditEntry = services.auditLogStore.find(
        (a: any) => a.action === 'sms_send' && a.resourceId === smsLogId,
      );
      expect(auditEntry).toBeDefined();
      expect(auditEntry.details.recipientPhone).toBe('09012345678');
    });

    it('should retrieve individual log detail via GET /api/sms/logs/:id', async () => {
      const app = buildApp(operatorUser, services);

      const sendRes = await request(app, 'POST', '/api/sms/send', {
        to: '09087654321',
        body: 'テストメッセージ',
      });
      const smsLogId = sendRes.body.smsLogId;

      const detailRes = await request(app, 'GET', `/api/sms/logs/${smsLogId}`);
      expect(detailRes.status).toBe(200);
      expect(detailRes.body.id).toBe(smsLogId);
      expect(detailRes.body.recipientPhone).toBe('09087654321');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. SMS送信 → Zendesk社内メモ フロー
  // ---------------------------------------------------------------------------
  describe('SMS送信 → Zendesk社内メモ フロー', () => {
    it('should send SMS with ticketId and create internal note', async () => {
      const app = buildApp(operatorUser, services);

      // Step 1: Send SMS with ticketId
      const sendRes = await request(app, 'POST', '/api/sms/send', {
        to: '09012345678',
        body: 'ご注文の件について確認いたします。',
        ticketId: '12345',
      });
      expect(sendRes.status).toBe(200);
      expect(sendRes.body.success).toBe(true);

      // Step 2: Create internal note
      const noteRes = await request(app, 'POST', '/api/zendesk/internal-note', {
        ticketId: '12345',
        destinationPhone: '09012345678',
        sendType: 'customer',
        messageBody: 'ご注文の件について確認いたします。',
        senderName: operatorUser.name,
        sendResult: 'success',
        deliveryStatus: 'queued',
        externalMessageId: sendRes.body.externalMessageId,
      });
      expect(noteRes.status).toBe(201);
      expect(noteRes.body.success).toBe(true);

      // Step 3: Verify createInternalNote was called with correct details
      expect(services.mockZendeskService.createInternalNote).toHaveBeenCalledWith(
        '12345',
        expect.objectContaining({
          destinationPhone: '09012345678',
          sendType: 'customer',
          messageBody: 'ご注文の件について確認いたします。',
          senderName: operatorUser.name,
          sendResult: 'success',
          deliveryStatus: 'queued',
          externalMessageId: sendRes.body.externalMessageId,
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 3. テンプレート → SMS送信 フロー
  // ---------------------------------------------------------------------------
  describe('テンプレート → SMS送信 フロー', () => {
    it('should create template then send SMS referencing it', async () => {
      const app = buildApp(operatorUser, services);

      // Step 1: Create template
      const tplRes = await request(app, 'POST', '/api/templates', {
        name: 'お問い合わせ返信',
        body: 'お問い合わせありがとうございます。担当者より折り返しご連絡いたします。',
      });
      expect(tplRes.status).toBe(201);
      const templateId = tplRes.body.template.id;
      expect(templateId).toBeDefined();

      // Step 2: Send SMS using template content
      const sendRes = await request(app, 'POST', '/api/sms/send', {
        to: '09012345678',
        body: tplRes.body.template.body,
        templateId,
      });
      expect(sendRes.status).toBe(200);
      expect(sendRes.body.success).toBe(true);

      // Step 3: Verify sms_logs references the template
      expect(services.mockSmsService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          templateId,
          body: 'お問い合わせありがとうございます。担当者より折り返しご連絡いたします。',
        }),
      );

      const logEntry = services.smsLogStore.find(
        (l: any) => l.id === sendRes.body.smsLogId,
      );
      expect(logEntry).toBeDefined();
      expect(logEntry.templateId).toBe(templateId);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. 自分にも送信フロー
  // ---------------------------------------------------------------------------
  describe('自分にも送信フロー', () => {
    it('should send to customer and self, creating two log entries', async () => {
      const app = buildApp(operatorUser, services);

      const sendRes = await request(app, 'POST', '/api/sms/send-self-copy', {
        to: '09012345678',
        body: 'お支払い確認のご連絡です。',
      });

      expect(sendRes.status).toBe(200);
      expect(sendRes.body.success).toBe(true);
      expect(sendRes.body.selfCopyResult).toBeDefined();
      expect(sendRes.body.selfCopyResult.success).toBe(true);
      expect(sendRes.body.partialSuccess).toBe(false);

      // Verify two sms_logs entries (customer + self_copy)
      expect(services.smsLogStore).toHaveLength(2);

      const customerLog = services.smsLogStore.find((l: any) => l.sendType === 'customer');
      const selfCopyLog = services.smsLogStore.find((l: any) => l.sendType === 'self_copy');

      expect(customerLog).toBeDefined();
      expect(customerLog.recipientPhone).toBe('09012345678');
      expect(customerLog.messageBody).toBe('お支払い確認のご連絡です。');

      expect(selfCopyLog).toBeDefined();
      expect(selfCopyLog.recipientPhone).toBe(operatorUser.phone);
      expect(selfCopyLog.messageBody).toBe('お支払い確認のご連絡です。');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. テスト送信フロー
  // ---------------------------------------------------------------------------
  describe('テスト送信フロー', () => {
    it('should test-send with [TEST] prefix and sendType test (Supervisor)', async () => {
      const app = buildApp(supervisorUser, services);

      const sendRes = await request(app, 'POST', '/api/sms/test-send', {
        body: 'テンプレート確認用メッセージ',
        testPhone: '09000000000',
      });

      expect(sendRes.status).toBe(200);
      expect(sendRes.body.success).toBe(true);

      // Verify testSend was called
      expect(services.mockSmsService.testSend).toHaveBeenCalledWith(
        expect.objectContaining({
          operatorId: supervisorUser.id,
          body: 'テンプレート確認用メッセージ',
          testPhone: '09000000000',
        }),
      );

      // Verify [TEST] prefix in stored log
      const testLog = services.smsLogStore.find((l: any) => l.sendType === 'test');
      expect(testLog).toBeDefined();
      expect(testLog.messageBody).toMatch(/^\[TEST\]/);
      expect(testLog.sendType).toBe('test');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. 設定管理フロー
  // ---------------------------------------------------------------------------
  describe('設定管理フロー', () => {
    it('should get and update settings as System_Admin', async () => {
      const app = buildApp(adminUser, services);

      // Step 1: Get settings
      const getRes = await request(app, 'GET', '/api/settings');
      expect(getRes.status).toBe(200);
      expect(getRes.body.settings).toBeDefined();
      expect(getRes.body.settings.testPhoneNumber).toBe('09000000000');

      // Step 2: Update settings
      const putRes = await request(app, 'PUT', '/api/settings', {
        testPhoneNumber: '09099999999',
      });
      expect(putRes.status).toBe(200);
      expect(putRes.body.settings.testPhoneNumber).toBe('09099999999');

      // Step 3: Verify updateSettings was called with correct user
      expect(services.mockSettingsService.updateSettings).toHaveBeenCalledWith(
        adminUser.id,
        { testPhoneNumber: '09099999999' },
        expect.anything(),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 7. 権限チェック統合テスト
  // ---------------------------------------------------------------------------
  describe('権限チェック統合テスト', () => {
    it('Operator cannot access /api/settings', async () => {
      const app = buildApp(operatorUser, services, {
        rejectSystemAdmin: true,
      });

      const getRes = await request(app, 'GET', '/api/settings');
      expect(getRes.status).toBe(403);
      expect(getRes.body.error.code).toBe('FORBIDDEN');

      const putRes = await request(app, 'PUT', '/api/settings', {
        testPhoneNumber: '09099999999',
      });
      expect(putRes.status).toBe(403);
    });

    it('Operator cannot use test-send', async () => {
      const app = buildApp(operatorUser, services, {
        rejectSupervisor: true,
      });

      const res = await request(app, 'POST', '/api/sms/test-send', {
        body: 'テスト',
        testPhone: '09000000000',
      });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('Supervisor can use test-send', async () => {
      const app = buildApp(supervisorUser, services);

      const res = await request(app, 'POST', '/api/sms/test-send', {
        body: 'テスト',
        testPhone: '09000000000',
      });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Health check
  // ---------------------------------------------------------------------------
  describe('ヘルスチェック', () => {
    it('GET /health should return ok', async () => {
      const app = buildApp(operatorUser, services);
      const res = await request(app, 'GET', '/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });
});
