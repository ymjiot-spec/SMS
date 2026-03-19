/**
 * Settings Routes
 * Requirements: 11.4, 14.1
 *
 * GET /api/settings - 設定取得（System_Admin 権限）
 * PUT /api/settings - 設定更新（System_Admin 権限）
 */

import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { SettingsController } from '../controllers/settings-controller.js';

export interface SettingsRoutesOptions {
  settingsController: SettingsController;
  requireSystemAdmin: RequestHandler;
}

export function createSettingsRoutes(options: SettingsRoutesOptions): Router {
  const router = Router();

  // System_Admin 権限を全ルートに適用
  router.use(options.requireSystemAdmin);

  // GET /api/settings
  router.get('/', options.settingsController.getSettings);

  // PUT /api/settings
  router.put('/', options.settingsController.updateSettings);

  return router;
}
