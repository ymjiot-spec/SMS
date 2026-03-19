/**
 * Template Controller
 * Requirements: 2.1, 2.3, 2.4, 2.5, 2.6, 14.2
 *
 * GET    /api/templates              - テンプレート一覧取得
 * POST   /api/templates              - テンプレート作成
 * GET    /api/templates/search       - テンプレート検索
 * PUT    /api/templates/:id          - テンプレート更新
 * DELETE /api/templates/:id          - テンプレート削除
 * POST   /api/templates/:id/duplicate - テンプレート複製
 * POST   /api/templates/:id/favorite  - お気に入りトグル
 */

import type { Request, Response } from 'express';
import type { TemplateService } from '../services/template-service.js';
import type { AuditService } from '../services/audit-service.js';

export class TemplateController {
  constructor(
    private readonly templateService: TemplateService,
    private readonly auditService?: AuditService,
  ) {}

  /**
   * テンプレート一覧取得
   * GET /api/templates
   */
  list = async (req: Request, res: Response): Promise<void> => {
    try {
      const { companyId, brand, purpose, department, visibility, page, limit } =
        req.query;

      const templates = await this.templateService.search({
        companyId: companyId as string | undefined,
        brand: brand as string | undefined,
        purpose: purpose as string | undefined,
        department: department as string | undefined,
        visibility: visibility as any,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      });

      res.status(200).json({ templates });
    } catch (error) {
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'テンプレート一覧の取得中にエラーが発生しました。',
        },
      });
    }
  };

  /**
   * テンプレート作成
   * POST /api/templates
   */
  create = async (req: Request, res: Response): Promise<void> => {
    try {
      const user = req.user!;
      const { name, body, companyId, brand, purpose, department, visibility } =
        req.body;

      if (!name || !body) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'テンプレート名と本文は必須です。',
          },
        });
        return;
      }

      const template = await this.templateService.create(
        { name, body, companyId, brand, purpose, department, visibility },
        user.id,
      );

      res.status(201).json({ template });
    } catch (error) {
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'テンプレートの作成中にエラーが発生しました。',
        },
      });
    }
  };

  /**
   * テンプレート検索
   * GET /api/templates/search
   */
  search = async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        keyword,
        companyId,
        brand,
        purpose,
        department,
        visibility,
        page,
        limit,
      } = req.query;

      const templates = await this.templateService.search({
        keyword: keyword as string | undefined,
        companyId: companyId as string | undefined,
        brand: brand as string | undefined,
        purpose: purpose as string | undefined,
        department: department as string | undefined,
        visibility: visibility as any,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      });

      res.status(200).json({ templates });
    } catch (error) {
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'テンプレート検索中にエラーが発生しました。',
        },
      });
    }
  };

  /**
   * テンプレート更新
   * PUT /api/templates/:id
   * Requirements: 2.1, 14.2
   */
  update = async (req: Request, res: Response): Promise<void> => {
    try {
      const user = req.user!;
      const id = String(req.params.id);

      const before = await this.templateService.findById(id);
      if (!before) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'テンプレートが見つかりません。' },
        });
        return;
      }

      const template = await this.templateService.update(id, req.body);

      if (this.auditService) {
        try {
          await this.auditService.log({
            userId: user.id,
            action: 'template_update',
            resourceType: 'template',
            resourceId: id,
            details: { before, after: template },
            ipAddress: req.ip,
          });
        } catch { /* audit log failure should not block response */ }
      }

      res.status(200).json({ template });
    } catch (error) {
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'テンプレートの更新中にエラーが発生しました。',
        },
      });
    }
  };

  /**
   * テンプレート削除
   * DELETE /api/templates/:id
   * Requirements: 2.1, 14.2
   */
  delete = async (req: Request, res: Response): Promise<void> => {
    try {
      const user = req.user!;
      const id = String(req.params.id);

      const before = await this.templateService.findById(id);
      if (!before) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'テンプレートが見つかりません。' },
        });
        return;
      }

      await this.templateService.delete(id);

      if (this.auditService) {
        try {
          await this.auditService.log({
            userId: user.id,
            action: 'template_delete',
            resourceType: 'template',
            resourceId: id,
            details: { before },
            ipAddress: req.ip,
          });
        } catch { /* audit log failure should not block response */ }
      }

      res.status(204).send();
    } catch (error) {
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'テンプレートの削除中にエラーが発生しました。',
        },
      });
    }
  };

  /**
   * テンプレート複製
   * POST /api/templates/:id/duplicate
   * Requirements: 2.6, 14.2
   */
  duplicate = async (req: Request, res: Response): Promise<void> => {
    try {
      const user = req.user!;
      const id = String(req.params.id);
      const { name } = req.body;

      if (!name) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: '新しいテンプレート名は必須です。',
          },
        });
        return;
      }

      const template = await this.templateService.duplicate(id, name, user.id);

      if (this.auditService) {
        try {
          await this.auditService.log({
            userId: user.id,
            action: 'template_create',
            resourceType: 'template',
            resourceId: template.id,
            details: { sourceTemplateId: id, duplicatedAs: template },
            ipAddress: req.ip,
          });
        } catch { /* audit log failure should not block response */ }
      }

      res.status(201).json({ template });
    } catch (error: any) {
      if (error?.message?.includes('not found')) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'テンプレートが見つかりません。' },
        });
        return;
      }
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'テンプレートの複製中にエラーが発生しました。',
        },
      });
    }
  };

  /**
   * お気に入りトグル
   * POST /api/templates/:id/favorite
   * Requirements: 2.4
   */
  toggleFavorite = async (req: Request, res: Response): Promise<void> => {
    try {
      const user = req.user!;
      const id = String(req.params.id);

      await this.templateService.toggleFavorite(id, user.id);

      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'お気に入りの切り替え中にエラーが発生しました。',
        },
      });
    }
  };
}

