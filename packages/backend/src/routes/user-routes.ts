/**
 * User Routes
 *
 * GET /api/users/me - 自分の情報取得
 */

import { Router } from 'express';
import type { UserController } from '../controllers/user-controller.js';

export interface UserRoutesOptions {
  userController: UserController;
}

export function createUserRoutes(options: UserRoutesOptions): Router {
  const router = Router();

  // GET /api/users/me
  router.get('/me', options.userController.getMe);

  return router;
}
