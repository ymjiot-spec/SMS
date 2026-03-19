/**
 * Settings Routes Integration Tests
 * Requirements: 11.4, 14.1
 *
 * Tests that settings endpoints are correctly wired with System_Admin authorization.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { SettingsController } from '../settings-controller.js';
import { createSettingsRoutes } from '../../routes/settings-routes.js';

const mockAdmin = {
  id: 'admin-1',
  email: 'admin@example.com',
  name: 'Admin User',
  phone: '09012345678',
  role: 'SYSTEM_ADMIN' as const,
  companyId: 'company-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockOperator = {
  id: 'user-1',
  email: 'op@example.com',
  name: 'Operator',
  phone: '09011111111',
  role: 'OPERATOR' as const,
  companyId: 'company-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

function fakeAuth(user: typeof mockAdmin) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.user = user;
    next();
  };
}

/** Passthrough middleware (simulates System_Admin check passing) */
function passthrough(_req: Request, _res: Response, next: NextFunction) {
  next();
}

/** Middleware that rejects with 403 (simulates System_Admin check failing) */
function rejectMiddleware(_req: Request, res: Response) {
  res.status(403).json({
    error: { code: 'FORBIDDEN', message: 'この操作を実行する権限がありません。' },
  });
}

async function request(
  app: express.Express,
  method: string,
  path: string,
  body?: unknown,
) {
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

describe('Settings Routes', () => {
  const defaultSettings = {
    smsProvider: { name: 'mock', apiKey: '', endpoint: '' },
    webhook: { url: '', secret: '' },
    testPhoneNumber: '09000000000',
    rateLimitPerMinute: 10,
    zendeskIntegration: { subdomain: '', email: '', apiToken: '' },
  };

  const mockSettingsService = {
    getSettings: vi.fn().mockReturnValue(defaultSettings),
    updateSettings: vi.fn().mockResolvedValue({
      ...defaultSettings,
      testPhoneNumber: '09099999999',
    }),
  };

  let app: express.Express;

  describe('with System_Admin access', () => {
    beforeEach(() => {
      vi.clearAllMocks();

      app = express();
      app.use(express.json());
      app.use(fakeAuth(mockAdmin));

      const settingsController = new SettingsController(mockSettingsService as any);

      app.use(
        '/api/settings',
        createSettingsRoutes({
          settingsController,
          requireSystemAdmin: passthrough,
        }),
      );
    });

    it('GET /api/settings should return current settings', async () => {
      const res = await request(app, 'GET', '/api/settings');

      expect(res.status).toBe(200);
      expect(res.body.settings).toEqual(defaultSettings);
      expect(mockSettingsService.getSettings).toHaveBeenCalledOnce();
    });

    it('PUT /api/settings should update settings', async () => {
      const res = await request(app, 'PUT', '/api/settings', {
        testPhoneNumber: '09099999999',
      });

      expect(res.status).toBe(200);
      expect(res.body.settings.testPhoneNumber).toBe('09099999999');
      expect(mockSettingsService.updateSettings).toHaveBeenCalledWith(
        'admin-1',
        { testPhoneNumber: '09099999999' },
        expect.anything(),
      );
    });

    it('PUT /api/settings should return 400 for empty body', async () => {
      const res = await request(app, 'PUT', '/api/settings', {});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('without System_Admin access', () => {
    beforeEach(() => {
      vi.clearAllMocks();

      app = express();
      app.use(express.json());
      app.use(fakeAuth(mockOperator));

      const settingsController = new SettingsController(mockSettingsService as any);

      app.use(
        '/api/settings',
        createSettingsRoutes({
          settingsController,
          requireSystemAdmin: rejectMiddleware,
        }),
      );
    });

    it('GET /api/settings should return 403 for non-admin', async () => {
      const res = await request(app, 'GET', '/api/settings');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('PUT /api/settings should return 403 for non-admin', async () => {
      const res = await request(app, 'PUT', '/api/settings', {
        testPhoneNumber: '09099999999',
      });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });
});
