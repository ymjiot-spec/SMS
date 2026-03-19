/**
 * SMS Routes
 * Requirements: 1.1, 1.6, 4.1, 4.4, 5.1, 5.4, 6.4, 6.5, 9.1
 *
 * POST /api/sms/send                - SMS送信 (rate limit + duplicate check + keyword check)
 * POST /api/sms/send-self-copy      - 自分にも送信付きSMS送信
 * POST /api/sms/test-send           - テスト送信 (Supervisor+)
 * POST /api/sms/webhook/delivery    - 配信Webhook受信 (no auth, external service)
 * GET  /api/sms/delivery-status/:id - 配信ステータス取得
 * GET  /api/sms/logs                - 送信履歴一覧
 * GET  /api/sms/logs/:id            - 送信履歴詳細
 */

import { Router } from 'express';
import type { SmsController } from '../controllers/sms-controller.js';
import type { HistoryController } from '../controllers/history-controller.js';
import type { RequestHandler } from 'express';

export interface SmsRoutesOptions {
  smsController: SmsController;
  historyController: HistoryController;
  rateLimitMiddleware: RequestHandler;
  duplicateSendMiddleware: RequestHandler;
  keywordCheckMiddleware: RequestHandler;
  requireSupervisor?: RequestHandler;
}

export function createSmsRoutes(options: SmsRoutesOptions): Router {
  const router = Router();

  // POST /api/sms/send — with rate limit, duplicate check, keyword check
  router.post(
    '/send',
    options.rateLimitMiddleware,
    options.duplicateSendMiddleware,
    options.keywordCheckMiddleware,
    options.smsController.send,
  );

  // POST /api/sms/send-self-copy — 自分にも送信付きSMS送信 (Requirements: 4.1, 4.4)
  router.post(
    '/send-self-copy',
    options.rateLimitMiddleware,
    options.duplicateSendMiddleware,
    options.keywordCheckMiddleware,
    options.smsController.sendWithSelfCopy,
  );

  // POST /api/sms/test-send — テスト送信 (Supervisor+ 権限, Requirements: 5.1, 5.4)
  const testSendMiddlewares: RequestHandler[] = [];
  if (options.requireSupervisor) {
    testSendMiddlewares.push(options.requireSupervisor);
  }
  router.post(
    '/test-send',
    ...testSendMiddlewares,
    options.smsController.testSend,
  );

  // GET /api/sms/delivery-status/:id — 配信ステータス取得
  router.get('/delivery-status/:id', options.smsController.getDeliveryStatus);

  // GET /api/sms/logs — 送信履歴一覧
  router.get('/logs', options.historyController.list);

  // GET /api/sms/logs/:id — 送信履歴詳細
  router.get('/logs/:id', options.historyController.getById);

  return router;
}

/**
 * Webhook routes — mounted outside auth middleware
 * POST /api/sms/webhook/delivery
 */
export function createWebhookRoutes(smsController: SmsController): Router {
  const router = Router();

  router.post('/delivery', smsController.webhookDelivery);

  return router;
}
