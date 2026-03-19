/**
 * Zendesk Controller
 * Requirements: 7.1, 7.4, 8.1
 *
 * POST /api/zendesk/internal-note        - 社内メモ作成
 * GET  /api/zendesk/ticket/:id/context   - チケット情報取得
 */

import type { Request, Response } from 'express';
import type { ZendeskService } from '../services/zendesk-service.js';

export class ZendeskController {
  constructor(private readonly zendeskService: ZendeskService) {}

  /**
   * チケット情報取得
   * GET /api/zendesk/ticket/:id/context
   */
  getTicketContext = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const context = await this.zendeskService.getTicketContext(String(id));
      res.status(200).json(context);
    } catch (error) {
      res.status(500).json({
        error: {
          code: 'ZENDESK_ERROR',
          message: 'チケット情報の取得中にエラーが発生しました。',
        },
      });
    }
  };

  /**
   * 社内メモ作成
   * POST /api/zendesk/internal-note
   */
  createInternalNote = async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        ticketId,
        destinationPhone,
        sendType,
        templateName,
        messageBody,
        senderName,
        sendTimestamp,
        sendResult,
        deliveryStatus,
        externalMessageId,
      } = req.body;

      if (!ticketId || !destinationPhone || !messageBody || !senderName) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'ticketId, destinationPhone, messageBody, senderName は必須です。',
          },
        });
        return;
      }

      await this.zendeskService.createInternalNote(ticketId, {
        destinationPhone,
        sendType: sendType ?? 'customer',
        templateName,
        messageBody,
        senderName,
        sendTimestamp: sendTimestamp ? new Date(sendTimestamp) : new Date(),
        sendResult: sendResult ?? 'success',
        deliveryStatus: deliveryStatus ?? 'queued',
        externalMessageId,
      });

      res.status(201).json({ success: true });
    } catch (error) {
      // Requirement 8.3: 社内メモ作成失敗は警告のみ
      res.status(500).json({
        error: {
          code: 'ZENDESK_ERROR',
          message: '社内メモの作成中にエラーが発生しました。',
        },
      });
    }
  };
}
