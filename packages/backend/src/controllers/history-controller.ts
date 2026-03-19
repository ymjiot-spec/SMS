/**
 * History Controller
 * Requirements: 9.1
 *
 * GET /api/sms/logs     - 送信履歴一覧
 * GET /api/sms/logs/:id - 送信履歴詳細
 */

import type { Request, Response } from 'express';
import type { HistoryService } from '../services/history-service.js';
import type { DeliveryStatus } from '@zendesk-sms-tool/shared';

export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  /**
   * 送信履歴一覧
   * GET /api/sms/logs
   */
  list = async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        ticketId,
        phone,
        operatorId,
        templateId,
        dateFrom,
        dateTo,
        deliveryStatus,
        page,
        limit,
      } = req.query;

      const result = await this.historyService.search({
        ticketId: ticketId as string | undefined,
        phone: phone as string | undefined,
        operatorId: operatorId as string | undefined,
        templateId: templateId as string | undefined,
        dateFrom: dateFrom ? new Date(String(dateFrom)) : undefined,
        dateTo: dateTo ? new Date(String(dateTo)) : undefined,
        deliveryStatus: deliveryStatus as DeliveryStatus | undefined,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      });

      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: '送信履歴の取得中にエラーが発生しました。',
        },
      });
    }
  };

  /**
   * 送信履歴詳細
   * GET /api/sms/logs/:id
   */
  getById = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = String(req.params.id);
      const record = await this.historyService.getById(id);

      if (!record) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: '送信履歴が見つかりません。',
          },
        });
        return;
      }

      res.status(200).json(record);
    } catch (error) {
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: '送信履歴の取得中にエラーが発生しました。',
        },
      });
    }
  };
}
