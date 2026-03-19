/**
 * Company Controller
 *
 * GET /api/companies - 企業一覧取得
 */

import type { Request, Response } from 'express';
import type { PrismaClient } from '@prisma/client';

export class CompanyController {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * 企業一覧取得
   * GET /api/companies
   */
  list = async (req: Request, res: Response): Promise<void> => {
    try {
      const companies = await this.prisma.company.findMany({
        orderBy: { name: 'asc' },
      });

      res.status(200).json({ companies });
    } catch (error) {
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: '企業一覧の取得中にエラーが発生しました。',
        },
      });
    }
  };
}
