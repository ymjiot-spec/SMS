/**
 * API Routes Integration Tests
 * Requirements: 1.1, 1.6, 7.1, 7.4, 8.1, 9.1
 *
 * Tests that all Phase 1 API endpoints are correctly wired and respond.
 * Uses mocked services to isolate routing/controller logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';

// Controllers
import { SmsController } from '../sms-controller.js';
import { TemplateController } from '../template-controller.js';
import { HistoryController } from '../history-controller.js';
import { ZendeskController } from '../zendesk-controller.js';
import { UserController } from '../user-controller.js';
import { CompanyController } from '../company-controller.js';

// Routes
import { createSmsRoutes } from '../../routes/sms-routes.js';
import { createTemplateRoutes } from '../../routes/template-routes.js';
import { createZendeskRoutes } from '../../routes/zendesk-routes.js';
import { createUserRoutes } from '../../routes/user-routes.js';
import { createCompanyRoutes } from '../../routes/company-routes.js';

/** Minimal mock user for auth */
const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  phone: '09012345678',
  role: 'OPERATOR' as const,
  companyId: 'company-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

/** Fake auth middleware that attaches mock user */
function fakeAuth(req: Request, _res: Response, next: NextFunction) {
  req.user = mockUser;
  next();
}

/** Passthrough middleware */
function passthrough(_req: Request, _res: Response, next: NextFunction) {
  next();
}

/** Helper to make requests to the test app */
async function request(
  app: express.Express,
  method: string,
  path: string,
  body?: unknown,
) {
  // Use node's built-in fetch against a temporary server
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
    const json = await res.json().catch(() => null);
    return { status: res.status, body: json };
  } finally {
    server.close();
  }
}

describe('API Routes', () => {
  // --- Mock services ---
  const mockSmsService = {
    send: vi.fn().mockResolvedValue({
      success: true,
      smsLogId: 'log-1',
      externalMessageId: 'ext-1',
    }),
    sendWithSelfCopy: vi.fn().mockResolvedValue({
      customerResult: { success: true, smsLogId: 'log-1', externalMessageId: 'ext-1' },
      selfCopyResult: { success: true, smsLogId: 'log-2', externalMessageId: 'ext-2' },
      partialSuccess: false,
    }),
    testSend: vi.fn().mockResolvedValue({
      success: true,
      smsLogId: 'log-3',
      externalMessageId: 'ext-3',
    }),
  };

  const mockTemplateService = {
    search: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({
      id: 'tpl-1',
      name: 'Test',
      body: 'Hello',
      createdBy: 'user-1',
      visibility: 'company',
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  };

  const mockHistoryService = {
    search: vi.fn().mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    }),
    getById: vi.fn().mockResolvedValue(null),
  };

  const mockZendeskService = {
    getTicketContext: vi.fn().mockResolvedValue({
      ticketId: '123',
      subject: 'Test Ticket',
      requesterName: 'Customer',
      status: 'open',
    }),
    createInternalNote: vi.fn().mockResolvedValue(undefined),
    formatInternalNote: vi.fn().mockReturnValue('formatted note'),
  };

  const mockPrisma = {
    company: {
      findMany: vi.fn().mockResolvedValue([
        { id: 'c-1', name: 'Company A', code: 'CA', createdAt: new Date(), updatedAt: new Date() },
      ]),
    },
  };

  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use(fakeAuth);

    const smsController = new SmsController(mockSmsService as any);
    const templateController = new TemplateController(mockTemplateService as any);
    const historyController = new HistoryController(mockHistoryService as any);
    const zendeskController = new ZendeskController(mockZendeskService as any);
    const userController = new UserController();
    const companyController = new CompanyController(mockPrisma as any);

    app.use(
      '/api/sms',
      createSmsRoutes({
        smsController,
        historyController,
        rateLimitMiddleware: passthrough,
        duplicateSendMiddleware: passthrough,
        keywordCheckMiddleware: passthrough,
      }),
    );
    app.use('/api/templates', createTemplateRoutes({ templateController }));
    app.use('/api/zendesk', createZendeskRoutes({ zendeskController }));
    app.use('/api/users', createUserRoutes({ userController }));
    app.use('/api/companies', createCompanyRoutes({ companyController }));
  });

  describe('POST /api/sms/send', () => {
    it('should send SMS and return success', async () => {
      const res = await request(app, 'POST', '/api/sms/send', {
        to: '09012345678',
        body: 'Hello',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.smsLogId).toBe('log-1');
      expect(res.body.externalMessageId).toBe('ext-1');
      expect(mockSmsService.send).toHaveBeenCalledOnce();
    });

    it('should return 400 when to or body is missing', async () => {
      const res = await request(app, 'POST', '/api/sms/send', { to: '09012345678' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/templates', () => {
    it('should return template list', async () => {
      const res = await request(app, 'GET', '/api/templates');
      expect(res.status).toBe(200);
      expect(res.body.templates).toEqual([]);
      expect(mockTemplateService.search).toHaveBeenCalledOnce();
    });
  });

  describe('POST /api/templates', () => {
    it('should create a template', async () => {
      const res = await request(app, 'POST', '/api/templates', {
        name: 'Test',
        body: 'Hello {{customer_name}}',
      });
      expect(res.status).toBe(201);
      expect(res.body.template.id).toBe('tpl-1');
      expect(mockTemplateService.create).toHaveBeenCalledOnce();
    });

    it('should return 400 when name or body is missing', async () => {
      const res = await request(app, 'POST', '/api/templates', { name: 'Test' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/templates/search', () => {
    it('should search templates by keyword', async () => {
      const res = await request(app, 'GET', '/api/templates/search?keyword=hello');
      expect(res.status).toBe(200);
      expect(mockTemplateService.search).toHaveBeenCalledOnce();
    });
  });

  describe('GET /api/sms/logs', () => {
    it('should return paginated history', async () => {
      const res = await request(app, 'GET', '/api/sms/logs');
      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([]);
      expect(res.body.total).toBe(0);
    });
  });

  describe('GET /api/sms/logs/:id', () => {
    it('should return 404 when log not found', async () => {
      const res = await request(app, 'GET', '/api/sms/logs/nonexistent');
      expect(res.status).toBe(404);
    });

    it('should return log when found', async () => {
      mockHistoryService.getById.mockResolvedValueOnce({
        id: 'log-1',
        operatorId: 'user-1',
        recipientPhone: '09012345678',
        messageBody: 'Hello',
        sendType: 'customer',
        deliveryStatus: 'sent',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app, 'GET', '/api/sms/logs/log-1');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('log-1');
    });
  });

  describe('GET /api/zendesk/ticket/:id/context', () => {
    it('should return ticket context', async () => {
      const res = await request(app, 'GET', '/api/zendesk/ticket/123/context');
      expect(res.status).toBe(200);
      expect(res.body.ticketId).toBe('123');
      expect(mockZendeskService.getTicketContext).toHaveBeenCalledWith('123');
    });
  });

  describe('POST /api/zendesk/internal-note', () => {
    it('should create internal note', async () => {
      const res = await request(app, 'POST', '/api/zendesk/internal-note', {
        ticketId: '123',
        destinationPhone: '09012345678',
        messageBody: 'Hello',
        senderName: 'Agent',
      });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(mockZendeskService.createInternalNote).toHaveBeenCalledOnce();
    });

    it('should return 400 when required fields are missing', async () => {
      const res = await request(app, 'POST', '/api/zendesk/internal-note', {
        ticketId: '123',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/users/me', () => {
    it('should return current user', async () => {
      const res = await request(app, 'GET', '/api/users/me');
      expect(res.status).toBe(200);
      expect(res.body.user.id).toBe('user-1');
      expect(res.body.user.email).toBe('test@example.com');
    });
  });

  describe('GET /api/companies', () => {
    it('should return company list', async () => {
      const res = await request(app, 'GET', '/api/companies');
      expect(res.status).toBe(200);
      expect(res.body.companies).toHaveLength(1);
      expect(res.body.companies[0].name).toBe('Company A');
    });
  });
});
