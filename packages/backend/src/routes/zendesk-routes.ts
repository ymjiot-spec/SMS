/**
 * Zendesk Routes
 * Requirements: 7.1, 7.4, 8.1
 *
 * POST /api/zendesk/internal-note        - 社内メモ作成
 * GET  /api/zendesk/ticket/:id/context   - チケット情報取得
 */

import { Router } from 'express';
import type { ZendeskController } from '../controllers/zendesk-controller.js';

export interface ZendeskRoutesOptions {
  zendeskController: ZendeskController;
}

export function createZendeskRoutes(options: ZendeskRoutesOptions): Router {
  const router = Router();

  // POST /api/zendesk/internal-note
  router.post('/internal-note', options.zendeskController.createInternalNote);

  // GET /api/zendesk/ticket/:id/context
  router.get('/ticket/:id/context', options.zendeskController.getTicketContext);

  return router;
}
