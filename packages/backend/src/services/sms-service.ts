/**
 * SmsService - SMS送信サービス
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 *
 * 電話番号バリデーション → SMS_Provider.sendMessage() → sms_logs記録 → audit_logs記録
 * 送信結果（成功時: externalMessageId、失敗時: エラー理由）を返す
 */

import {
  SendType as PrismaSendType,
  DeliveryStatus as PrismaDeliveryStatus,
  PrismaClient,
} from '@prisma/client';
import type { SmsProvider, SendType } from '@zendesk-sms-tool/shared';
import { validateJapanesePhoneNumber } from '@zendesk-sms-tool/shared';
import { AuditService } from './audit-service.js';
import type { DeliveryService } from './delivery-service.js';

/** SMS送信結果 */
export interface SendResult {
  success: boolean;
  smsLogId?: string;
  externalMessageId?: string;
  error?: { code: string; message: string };
}

/** 自分にも送信結果 (Requirements: 4.1, 4.4) */
export interface SendWithCopyResult {
  customerResult: SendResult;
  selfCopyResult?: SendResult;
  /** 部分成功: 顧客送信成功 + 自分送信失敗 */
  partialSuccess: boolean;
}

/** SMS送信パラメータ */
export interface SendParams {
  operatorId: string;
  to: string;
  body: string;
  templateId?: string;
  ticketId?: string;
  sendType: SendType;
}

/** テスト送信パラメータ (Requirements: 5.1, 5.2, 5.4) */
export interface TestSendParams {
  operatorId: string;
  body: string;
  testPhone: string;
  templateId?: string;
  ticketId?: string;
}

/** Map shared SendType to Prisma enum */
const SEND_TYPE_TO_PRISMA: Record<SendType, PrismaSendType> = {
  customer: PrismaSendType.CUSTOMER,
  self_copy: PrismaSendType.SELF_COPY,
  test: PrismaSendType.TEST,
};

/** Map shared DeliveryStatus string to Prisma enum */
function toPrismaDeliveryStatus(status: string): PrismaDeliveryStatus {
  const map: Record<string, PrismaDeliveryStatus> = {
    queued: PrismaDeliveryStatus.QUEUED,
    sent: PrismaDeliveryStatus.SENT,
    delivered: PrismaDeliveryStatus.DELIVERED,
    failed: PrismaDeliveryStatus.FAILED,
    expired: PrismaDeliveryStatus.EXPIRED,
    unknown: PrismaDeliveryStatus.UNKNOWN,
  };
  return map[status] ?? PrismaDeliveryStatus.UNKNOWN;
}

export class SmsService {
  constructor(
    private readonly provider: SmsProvider,
    private readonly prisma: PrismaClient,
    private readonly auditService: AuditService,
    private readonly deliveryService?: DeliveryService,
  ) {}

  /**
   * SMS送信
   * 1. 電話番号バリデーション
   * 2. メッセージ本文バリデーション
   * 3. SMS_Provider.sendMessage() 呼び出し
   * 4. sms_logs に記録
   * 5. audit_logs に記録
   * 6. 送信結果を返す
   */
  async send(params: SendParams): Promise<SendResult> {
    // 1. 電話番号バリデーション (Requirement 1.4)
    if (!validateJapanesePhoneNumber(params.to)) {
      return {
        success: false,
        error: {
          code: 'INVALID_PHONE_NUMBER',
          message: '電話番号が日本の携帯電話番号形式（070/080/090 + 8桁）ではありません',
        },
      };
    }

    // 2. メッセージ本文バリデーション (Requirement 1.5)
    if (!params.body || params.body.trim().length === 0) {
      return {
        success: false,
        error: {
          code: 'EMPTY_MESSAGE_BODY',
          message: 'メッセージ本文が空です',
        },
      };
    }

    // 3. SMS_Provider.sendMessage() 呼び出し (Requirement 1.1)
    const providerResponse = await this.provider.sendMessage({
      to: params.to,
      body: params.body,
    });

    if (providerResponse.success) {
      // 4. sms_logs に記録 (成功時)
      const smsLog = await this.prisma.smsLog.create({
        data: {
          operatorId: params.operatorId,
          recipientPhone: params.to,
          messageBody: params.body,
          templateId: params.templateId ?? null,
          ticketId: params.ticketId ?? null,
          sendType: SEND_TYPE_TO_PRISMA[params.sendType],
          externalMessageId: providerResponse.externalMessageId ?? null,
          deliveryStatus: toPrismaDeliveryStatus(providerResponse.status),
          resultMessage: null,
        },
      });

      // 5. audit_logs に記録 (成功時)
      await this.auditService.log({
        userId: params.operatorId,
        action: 'sms_send',
        resourceType: 'sms',
        resourceId: smsLog.id,
        details: {
          recipientPhone: params.to,
          messageBody: params.body,
          templateId: params.templateId ?? null,
          ticketId: params.ticketId ?? null,
          sendType: params.sendType,
          externalMessageId: providerResponse.externalMessageId ?? null,
          resultStatus: 'success',
        },
      });

      // 6. 配信追跡: 初期ステータス記録 + ポーリングスケジュール (Requirement 6.2)
      // 配信追跡の失敗はSMS送信結果に影響させない
      if (this.deliveryService) {
        try {
          await this.deliveryService.recordInitialStatus(
            smsLog.id,
            providerResponse.status as import('@zendesk-sms-tool/shared').DeliveryStatus,
          );
          if (providerResponse.externalMessageId) {
            await this.deliveryService.schedulePolling(
              smsLog.id,
              providerResponse.externalMessageId,
            );
          }
        } catch {
          // 配信追跡の失敗はSMS送信をブロックしない
        }
      }

      // 7. 成功結果を返す (Requirement 1.2)
      return {
        success: true,
        smsLogId: smsLog.id,
        externalMessageId: providerResponse.externalMessageId,
      };
    }

    // プロバイダエラー時
    // sms_logs に記録 (失敗時)
    const smsLog = await this.prisma.smsLog.create({
      data: {
        operatorId: params.operatorId,
        recipientPhone: params.to,
        messageBody: params.body,
        templateId: params.templateId ?? null,
        ticketId: params.ticketId ?? null,
        sendType: SEND_TYPE_TO_PRISMA[params.sendType],
        externalMessageId: null,
        deliveryStatus: PrismaDeliveryStatus.FAILED,
        resultMessage: providerResponse.error?.message ?? 'Unknown error',
      },
    });

    // audit_logs に記録 (失敗時)
    await this.auditService.log({
      userId: params.operatorId,
      action: 'sms_send_failed',
      resourceType: 'sms',
      resourceId: smsLog.id,
      details: {
        recipientPhone: params.to,
        messageBody: params.body,
        templateId: params.templateId ?? null,
        ticketId: params.ticketId ?? null,
        sendType: params.sendType,
        errorCode: providerResponse.error?.code ?? 'UNKNOWN',
        errorMessage: providerResponse.error?.message ?? 'Unknown error',
        resultStatus: 'failed',
      },
    });

    // 失敗結果を返す (Requirement 1.3)
    return {
      success: false,
      smsLogId: smsLog.id,
      error: providerResponse.error ?? {
        code: 'PROVIDER_ERROR',
        message: 'SMS送信に失敗しました',
      },
    };
  }

  /**
   * 自分にも送信付きSMS送信
   * Requirements: 4.1, 4.2, 4.3, 4.4
   *
   * 1. 顧客向け送信 (sendType: 'customer')
   * 2. 自分向け送信 (sendType: 'self_copy') — 失敗しても顧客送信は成功扱い
   * 3. 両方の結果を返す
   */
  async sendWithSelfCopy(params: {
    operatorId: string;
    to: string;
    body: string;
    operatorPhone: string;
    templateId?: string;
    ticketId?: string;
  }): Promise<SendWithCopyResult> {
    // 1. 顧客向け送信
    const customerResult = await this.send({
      operatorId: params.operatorId,
      to: params.to,
      body: params.body,
      templateId: params.templateId,
      ticketId: params.ticketId,
      sendType: 'customer',
    });

    // 顧客送信が失敗した場合、自分送信はスキップ
    if (!customerResult.success) {
      return { customerResult, partialSuccess: false };
    }

    // 2. 自分向け送信（同一メッセージ本文）
    let selfCopyResult: SendResult | undefined;
    try {
      selfCopyResult = await this.send({
        operatorId: params.operatorId,
        to: params.operatorPhone,
        body: params.body,
        templateId: params.templateId,
        ticketId: params.ticketId,
        sendType: 'self_copy',
      });
    } catch {
      selfCopyResult = {
        success: false,
        error: { code: 'SELF_COPY_ERROR', message: '自分への送信中にエラーが発生しました' },
      };
    }

    // 3. 部分成功判定: 顧客成功 + 自分失敗
    const partialSuccess = customerResult.success && !!selfCopyResult && !selfCopyResult.success;

    return { customerResult, selfCopyResult, partialSuccess };
  }

  /**
   * テスト送信
   * Requirements: 5.1, 5.2, 5.4
   *
   * 1. メッセージ本文に "[TEST] " プレフィックス追加
   * 2. テスト用電話番号に送信
   * 3. sendType: 'test' で記録
   */
  async testSend(params: TestSendParams): Promise<SendResult> {
    const testBody = `[TEST] ${params.body}`;

    return this.send({
      operatorId: params.operatorId,
      to: params.testPhone,
      body: testBody,
      templateId: params.templateId,
      ticketId: params.ticketId,
      sendType: 'test',
    });
  }

}
