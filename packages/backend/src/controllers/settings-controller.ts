/**
 * Settings Controller
 * Requirements: 11.4, 14.1
 *
 * GET /api/settings - 設定取得（System_Admin 権限）
 * PUT /api/settings - 設定更新（System_Admin 権限）
 */

import type { Request, Response } from 'express';
import type { SettingsService } from '../services/settings-service.js';

export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /**
   * 設定取得
   * GET /api/settings
   */
  getSettings = (_req: Request, res: Response): void => {
    try {
      const settings = this.settingsService.getSettings();
      res.status(200).json({ settings });
    } catch {
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: '設定の取得中にエラーが発生しました。',
        },
      });
    }
  };

  /**
   * 設定更新
   * PUT /api/settings
   */
  updateSettings = async (req: Request, res: Response): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: '認証が必要です。' },
        });
        return;
      }

      const updates = req.body;
      if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: '更新する設定を指定してください。',
          },
        });
        return;
      }

      const settings = await this.settingsService.updateSettings(
        user.id,
        updates,
        req.ip,
      );

      res.status(200).json({ settings });
    } catch {
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: '設定の更新中にエラーが発生しました。',
        },
      });
    }
  };
}
