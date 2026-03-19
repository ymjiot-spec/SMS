/**
 * Express Application
 * Requirements: 1.1, 1.6, 7.1, 7.4, 8.1, 9.1
 *
 * ミドルウェアチェーン: JSON parsing → auth → routes
 * SMS送信エンドポイントにはレート制限・重複送信・キーワードチェックを適用
 */

import express from 'express';
import cors from 'cors';
import { prisma } from './lib/prisma.js';
import { MockProvider } from './providers/mock-provider.js';
import { Media4uProvider } from './providers/media4u-provider.js';
import type { SmsProvider } from './providers/sms-provider.js';

// Services
import { AuditService } from './services/audit-service.js';
import { SmsService } from './services/sms-service.js';
import { TemplateService } from './services/template-service.js';
import { HistoryService } from './services/history-service.js';
import { ZendeskService } from './services/zendesk-service.js';
import { DeliveryService } from './services/delivery-service.js';
import { SettingsService } from './services/settings-service.js';

// Middleware
import { createAuthMiddleware, requireRole } from './middleware/auth.js';
import { globalErrorHandler } from './middleware/error-handler.js';
import {
  createRateLimitStore,
  createRateLimitMiddleware,
  createDuplicateSendMiddleware,
  createKeywordCheckMiddleware,
} from './middleware/rate-limit.js';
import { validate, templateUpdateSchema } from './middleware/validation.js';

// Controllers
import { SmsController } from './controllers/sms-controller.js';
import { TemplateController } from './controllers/template-controller.js';
import { HistoryController } from './controllers/history-controller.js';
import { ZendeskController } from './controllers/zendesk-controller.js';
import { UserController } from './controllers/user-controller.js';
import { CompanyController } from './controllers/company-controller.js';
import { SettingsController } from './controllers/settings-controller.js';

// Routes
import { createSmsRoutes, createWebhookRoutes } from './routes/sms-routes.js';
import { createTemplateRoutes } from './routes/template-routes.js';
import { createZendeskRoutes } from './routes/zendesk-routes.js';
import { createUserRoutes } from './routes/user-routes.js';
import { createCompanyRoutes } from './routes/company-routes.js';
import { createSettingsRoutes } from './routes/settings-routes.js';

export function createApp(deps?: {
  prismaClient?: typeof prisma;
  smsProvider?: SmsProvider;
  zendeskService?: ZendeskService;
}) {
  const app = express();
  const db = deps?.prismaClient ?? prisma;

  // --- Services ---
  const auditService = new AuditService(db);
  const smsProvider = deps?.smsProvider ?? (() => {
    const username = process.env.MEDIASMS_USERNAME?.trim();
    const password = process.env.MEDIASMS_PASSWORD?.trim();
    if (username && password) {
      return new Media4uProvider({ username, password });
    }
    return new MockProvider();
  })();
  console.log(`SMS Provider: ${smsProvider.constructor.name}`);
  const deliveryService = new DeliveryService(db, smsProvider);
  const smsService = new SmsService(smsProvider, db, auditService, deliveryService);
  const templateService = new TemplateService(db);
  const historyService = new HistoryService(db);
  const zendeskService =
    deps?.zendeskService ??
    new ZendeskService({
      subdomain: process.env.ZENDESK_SUBDOMAIN ?? 'example',
      email: process.env.ZENDESK_EMAIL ?? 'agent@example.com',
      apiToken: process.env.ZENDESK_API_TOKEN ?? 'token',
    });

  // --- Controllers ---
  const smsController = new SmsController(smsService, deliveryService);
  const templateController = new TemplateController(templateService, auditService);
  const historyController = new HistoryController(historyService);
  const zendeskController = new ZendeskController(zendeskService);
  const userController = new UserController();
  const companyController = new CompanyController(db);
  const settingsService = new SettingsService(auditService);
  const settingsController = new SettingsController(settingsService);

  // --- Middleware ---
  const authMiddleware = createAuthMiddleware(db);
  const rateLimitStore = createRateLimitStore();
  const rateLimitMiddleware = createRateLimitMiddleware(rateLimitStore);
  const duplicateSendMiddleware = createDuplicateSendMiddleware(db);
  const keywordCheckMiddleware = createKeywordCheckMiddleware();

  // --- Global middleware ---
  app.use(cors());
  app.use(express.json());

  // --- Health check (no auth) ---
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // --- Webhook routes (no auth — called by external SMS provider) ---
  app.use('/api/sms/webhook', createWebhookRoutes(smsController));

  // --- Auth middleware for all /api routes (except webhook above) ---
  app.use('/api', authMiddleware);

  // --- Routes ---
  app.use(
    '/api/sms',
    createSmsRoutes({
      smsController,
      historyController,
      rateLimitMiddleware,
      duplicateSendMiddleware,
      keywordCheckMiddleware,
      requireSupervisor: requireRole(auditService, 'SUPERVISOR'),
    }),
  );

  app.use(
    '/api/templates',
    createTemplateRoutes({
      templateController,
      requireSupervisor: requireRole(auditService, 'SUPERVISOR'),
      validateUpdate: validate(templateUpdateSchema),
    }),
  );

  app.use(
    '/api/zendesk',
    createZendeskRoutes({ zendeskController }),
  );

  app.use(
    '/api/users',
    createUserRoutes({ userController }),
  );

  app.use(
    '/api/companies',
    createCompanyRoutes({ companyController }),
  );

  app.use(
    '/api/settings',
    createSettingsRoutes({
      settingsController,
      requireSystemAdmin: requireRole(auditService, 'SYSTEM_ADMIN'),
    }),
  );

  // --- Global error handler (must be LAST middleware) ---
  app.use(globalErrorHandler);

  return app;
}

// Default export for backward compatibility
const app = createApp();
export default app;
