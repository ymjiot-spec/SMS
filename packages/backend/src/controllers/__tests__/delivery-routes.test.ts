/**
 * Delivery Routes Integration Tests
 * Requirements: 6.4, 6.5
 *
 * Tests for webhook delivery endpoint and delivery-status endpoint.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { SmsController } from '../sms-controller.js';
import { HistoryController } from '../history-controller.js';
import { createSmsRoutes, createWebhookRoutes } from '../../routes/sms-routes.js';

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

function fakeAuth(req: Request, _res: Response, next: NextFunction) {
  req.user = mockUser;
  next();
}

function passthrough(_req: Request, _res: Response, next: NextFunction) {
  next();
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
    const json = await res.json().catch(() => null);
    return { status: res.status, body: json };
  } finally {
    server.close();
  }
}

describe('Delivery Routes', () => {
  const mockSmsService = {
    send: vi.fn().mockResolvedValue({ success: true, smsLogId: 'log-1', externalMessageId: 'ext-1' }),
  };

  const mockDeliveryService = {
    processWebhook: vi.fn().mockResolvedValue(undefined),
    getStatusHistory: vi.fn().mockResolvedValue([]),
    recordInitialStatus: vi.fn().mockResolvedValue(undefined),
    schedulePolling: vi.fn().mockResolvedValue({ scheduled: false, message: 'no queue' }),
  };

  const mockHistoryService = {
    search: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 }),
    getById: vi.fn().mockResolvedValue(null),
  };

  let app: express.Express;
  let smsController: SmsController;

  beforeEach(() => {
    vi.clearAllMocks();

    smsController = new SmsController(mockSmsService as any, mockDeliveryService as any);
    const historyController = new HistoryController(mockHistoryService as any);

    app = express();
    app.use(express.json());

    // Webhook routes — no auth (before auth middleware)
    app.use('/api/sms/webhook', createWebhookRoutes(smsController));

    // Auth middleware for other routes
    app.use(fakeAuth);
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
  });

  describe('POST /api/sms/webhook/delivery', () => {
    it('should process valid webhook payload', async () => {
      const res = await request(app, 'POST', '/api/sms/webhook/delivery', {
        externalMessageId: 'ext-msg-001',
        status: 'delivered',
        rawPayload: { raw: 'data' },
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockDeliveryService.processWebhook).toHaveBeenCalledWith({
        externalMessageId: 'ext-msg-001',
        status: 'delivered',
        rawPayload: { raw: 'data' },
      });
    });

    it('should return 400 when externalMessageId is missing', async () => {
      const res = await request(app, 'POST', '/api/sms/webhook/delivery', {
        status: 'delivered',
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when status is invalid', async () => {
      const res = await request(app, 'POST', '/api/sms/webhook/delivery', {
        externalMessageId: 'ext-msg-001',
        status: 'invalid_status',
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 404 when sms log not found', async () => {
      mockDeliveryService.processWebhook.mockRejectedValueOnce(
        new Error('SmsLog not found for externalMessageId: unknown-id'),
      );

      const res = await request(app, 'POST', '/api/sms/webhook/delivery', {
        externalMessageId: 'unknown-id',
        status: 'delivered',
      });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should not require auth (webhook is external)', async () => {
      // The webhook route is mounted before auth middleware,
      // so it should work without X-User-Id header
      const res = await request(app, 'POST', '/api/sms/webhook/delivery', {
        externalMessageId: 'ext-msg-001',
        status: 'sent',
      });

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/sms/delivery-status/:id', () => {
    it('should return delivery status events', async () => {
      const now = new Date('2024-01-01T00:00:00Z');
      mockDeliveryService.getStatusHistory.mockResolvedValueOnce([
        {
          id: 'de-1',
          smsLogId: 'sms-log-1',
          status: 'queued',
          source: 'api_response',
          createdAt: now,
        },
      ]);

      const res = await request(app, 'GET', '/api/sms/delivery-status/sms-log-1');

      expect(res.status).toBe(200);
      expect(res.body.smsLogId).toBe('sms-log-1');
      expect(res.body.events).toHaveLength(1);
      expect(res.body.events[0].status).toBe('queued');
      expect(mockDeliveryService.getStatusHistory).toHaveBeenCalledWith('sms-log-1');
    });

    it('should return empty events array when no events exist', async () => {
      const res = await request(app, 'GET', '/api/sms/delivery-status/nonexistent');

      expect(res.status).toBe(200);
      expect(res.body.events).toEqual([]);
    });
  });
});
