/**
 * User Controller
 *
 * GET /api/users/me - 自分の情報取得
 */

import type { Request, Response } from 'express';

export class UserController {
  /**
   * 自分の情報取得
   * GET /api/users/me
   */
  getMe = (req: Request, res: Response): void => {
    const user = req.user;

    if (!user) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: '認証が必要です。',
        },
      });
      return;
    }

    res.status(200).json({ user });
  };
}
