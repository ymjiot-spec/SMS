/**
 * Template Routes
 * Requirements: 2.1, 2.3, 2.4, 2.5, 2.6, 14.2
 *
 * GET    /api/templates              - テンプレート一覧取得
 * POST   /api/templates              - テンプレート作成 (Operator+)
 * GET    /api/templates/search       - テンプレート検索
 * PUT    /api/templates/:id          - テンプレート更新 (Supervisor+)
 * DELETE /api/templates/:id          - テンプレート削除 (Supervisor+)
 * POST   /api/templates/:id/duplicate - テンプレート複製 (Operator+)
 * POST   /api/templates/:id/favorite  - お気に入りトグル (Operator+)
 */

import { Router, type RequestHandler } from 'express';
import type { TemplateController } from '../controllers/template-controller.js';

export interface TemplateRoutesOptions {
  templateController: TemplateController;
  requireSupervisor?: RequestHandler;
  validateUpdate?: RequestHandler;
}

export function createTemplateRoutes(options: TemplateRoutesOptions): Router {
  const router = Router();

  // GET /api/templates/search — must be before /:id to avoid conflict
  router.get('/search', options.templateController.search);

  // GET /api/templates
  router.get('/', options.templateController.list);

  // POST /api/templates
  router.post('/', options.templateController.create);

  // PUT /api/templates/:id — Supervisor+ with validation
  const updateMiddleware: RequestHandler[] = [];
  if (options.requireSupervisor) updateMiddleware.push(options.requireSupervisor);
  if (options.validateUpdate) updateMiddleware.push(options.validateUpdate);
  router.put('/:id', ...updateMiddleware, options.templateController.update);

  // DELETE /api/templates/:id — Supervisor+
  if (options.requireSupervisor) {
    router.delete('/:id', options.requireSupervisor, options.templateController.delete);
  } else {
    router.delete('/:id', options.templateController.delete);
  }

  // POST /api/templates/:id/duplicate — Operator+
  router.post('/:id/duplicate', options.templateController.duplicate);

  // POST /api/templates/:id/favorite — Operator+
  router.post('/:id/favorite', options.templateController.toggleFavorite);

  return router;
}
