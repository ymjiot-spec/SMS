/**
 * SMS Controller
 * Requirements: 1.1, 1.6, 6.4, 6.5
 *
 * POST /api/sms/send                - SMS送信
 * POST /api/sms/webhook/delivery    - 配信Webhook受信
 * GET  /api/sms/delivery-status/:id - 配信ステータス取得
 */

import type { Request, Response } from 'express';
import type { SmsService } from '../services/sms-service.js';
import type { DeliveryService } from '../services/delivery-service.js';
import type { DeliveryStatus } from '@zendesk-sms-tool/shared';

const VALID_DELIVERY_STATUSES: DeliveryStatus[] = [
  'queued', 'sent', 'delivered', 'failed', 'expired', 'unknown',
];

export class SmsController {
  constructor(
    private readonly smsService: SmsService,
    private readonly deliveryService?: DeliveryService,
  ) {}

  /**
   * SMS送信
   * POST /api/sms/send
   */
  send = async (req: Request, res: Response): Promise<void> => {
    try {
      const user = req.user!;
      const { to, body, templateId, ticketId, sendType } = req.body;

      if (!to || !body) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: '宛先電話番号とメッセージ本文は必須です。',
          },
        });
        return;
      }

      const result = await this.smsService.send({
        operatorId: user.id,
        to,
        body,
        templateId,
        ticketId,
        sendType: sendType ?? 'customer',
      });

      // Collect warnings from middleware (duplicate send, dangerous keywords)
      const warnings = (req as any).sendWarnings ?? [];

      if (result.success) {
        res.status(200).json({
          success: true,
          smsLogId: result.smsLogId,
          externalMessageId: result.externalMessageId,
          warnings,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
          warnings,
        });
      }
    } catch (error) {
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'SMS送信中にエラーが発生しました。',
        },
      });
    }
  };

  /**
   * 自分にも送信付きSMS送信
   * POST /api/sms/send-self-copy
   * Requirements: 4.1, 4.2, 4.3, 4.4
   */
  sendWithSelfCopy = async (req: Request, res: Response): Promise<void> => {
    try {
      const user = req.user!;
      const { to, body, templateId, ticketId } = req.body;

      if (!to || !body) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: '宛先電話番号とメッセージ本文は必須です。',
          },
        });
        return;
      }

      if (!user.phone) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'オペレーターの電話番号が登録されていません。自分にも送信するには電話番号の登録が必要です。',
          },
        });
        return;
      }

      const result = await this.smsService.sendWithSelfCopy({
        operatorId: user.id,
        to,
        body,
        operatorPhone: user.phone,
        templateId,
        ticketId,
      });

      const warnings = (req as any).sendWarnings ?? [];

      if (!result.customerResult.success) {
        res.status(400).json({
          success: false,
          error: result.customerResult.error,
          warnings,
        });
        return;
      }

      res.status(200).json({
        success: true,
        smsLogId: result.customerResult.smsLogId,
        externalMessageId: result.customerResult.externalMessageId,
        selfCopyResult: result.selfCopyResult,
        partialSuccess: result.partialSuccess,
        warnings: result.partialSuccess
          ? [...warnings, { type: 'self_copy_failed', message: '自分への送信に失敗しましたが、顧客への送信は成功しました。' }]
          : warnings,
      });
    } catch (error) {
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'SMS送信中にエラーが発生しました。',
        },
      });
    }
  };

  /**
   * テスト送信
   * POST /api/sms/test-send
   * Requirements: 5.1, 5.2, 5.4
   */
  testSend = async (req: Request, res: Response): Promise<void> => {
    try {
      const user = req.user!;
      const { body, testPhone, templateId, ticketId } = req.body;

      if (!body) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'メッセージ本文は必須です。',
          },
        });
        return;
      }

      const phone = testPhone || process.env.TEST_PHONE_NUMBER;
      if (!phone) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'テスト用電話番号が指定されていません。',
          },
        });
        return;
      }

      const result = await this.smsService.testSend({
        operatorId: user.id,
        body,
        testPhone: phone,
        templateId,
        ticketId,
      });

      if (result.success) {
        res.status(200).json({
          success: true,
          smsLogId: result.smsLogId,
          externalMessageId: result.externalMessageId,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'テスト送信中にエラーが発生しました。',
        },
      });
    }
  };

  /**
   * 配信Webhook受信
   * POST /api/sms/webhook/delivery
   * Requirements: 6.4
   */
  webhookDelivery = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!this.deliveryService) {
        res.status(503).json({
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: '配信追跡サービスが利用できません。',
          },
        });
        return;
      }

      const { externalMessageId, status, rawPayload } = req.body;

      if (!externalMessageId || typeof externalMessageId !== 'string') {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'externalMessageId は必須です。',
          },
        });
        return;
      }

      if (!status || !VALID_DELIVERY_STATUSES.includes(status)) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: `status は ${VALID_DELIVERY_STATUSES.join(', ')} のいずれかである必要があります。`,
          },
        });
        return;
      }

      await this.deliveryService.processWebhook({
        externalMessageId,
        status,
        rawPayload,
      });

      res.status(200).json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('not found')) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message,
          },
        });
        return;
      }
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Webhook処理中にエラーが発生しました。',
        },
      });
    }
  };

  /**
   * 配信ステータス取得
   * GET /api/sms/delivery-status/:id
   * Requirements: 6.5
   */
  getDeliveryStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!this.deliveryService) {
        res.status(503).json({
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: '配信追跡サービスが利用できません。',
          },
        });
        return;
      }

      const smsLogId = String(req.params.id);
      const events = await this.deliveryService.getStatusHistory(smsLogId);

      res.status(200).json({ smsLogId, events });
    } catch (error) {
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: '配信ステータスの取得中にエラーが発生しました。',
        },
      });
    }
  };
}
