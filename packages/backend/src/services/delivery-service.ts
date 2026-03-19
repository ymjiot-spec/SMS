/**
 * DeliveryService - 配信追跡サービス
 * Requirements: 6.2, 6.3, 6.4, 6.6
 *
 * SMS配信ステータスの記録・更新・Webhook処理・ポーリングスケジュール・履歴取得を提供する。
 */

import {
  DeliveryStatus as PrismaDeliveryStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import type { Queue } from 'bullmq';
import type { DeliveryStatus, DeliveryEvent, SmsProvider } from '@zendesk-sms-tool/shared';
import type { DeliveryPollingJob } from '../jobs/delivery-polling-worker.js';
import { addPollingJob } from '../jobs/delivery-polling-worker.js';

/** Map shared lowercase DeliveryStatus to Prisma enum */
const STATUS_TO_PRISMA: Record<DeliveryStatus, PrismaDeliveryStatus> = {
  queued: PrismaDeliveryStatus.QUEUED,
  sent: PrismaDeliveryStatus.SENT,
  delivered: PrismaDeliveryStatus.DELIVERED,
  failed: PrismaDeliveryStatus.FAILED,
  expired: PrismaDeliveryStatus.EXPIRED,
  unknown: PrismaDeliveryStatus.UNKNOWN,
};

/** Map Prisma enum back to shared lowercase DeliveryStatus */
const PRISMA_TO_STATUS: Record<PrismaDeliveryStatus, DeliveryStatus> = {
  [PrismaDeliveryStatus.QUEUED]: 'queued',
  [PrismaDeliveryStatus.SENT]: 'sent',
  [PrismaDeliveryStatus.DELIVERED]: 'delivered',
  [PrismaDeliveryStatus.FAILED]: 'failed',
  [PrismaDeliveryStatus.EXPIRED]: 'expired',
  [PrismaDeliveryStatus.UNKNOWN]: 'unknown',
};

/** Webhook payload for delivery status updates */
export interface ProcessWebhookPayload {
  externalMessageId: string;
  status: DeliveryStatus;
  rawPayload?: unknown;
}

/** Polling job info returned by schedulePolling */
export interface PollingJobInfo {
  smsLogId: string;
  externalMessageId: string;
  scheduled: boolean;
  message: string;
}

export class DeliveryService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly provider: SmsProvider,
  ) {}

  /**
   * 初期ステータスを記録する
   * Requirements: 6.2 - SMS送信後に初期ステータスを delivery_events に記録
   */
  async recordInitialStatus(smsLogId: string, status: DeliveryStatus): Promise<void> {
    await this.prisma.deliveryEvent.create({
      data: {
        smsLogId,
        status: STATUS_TO_PRISMA[status],
        source: 'api_response',
        rawPayload: Prisma.JsonNull,
      },
    });
  }

  /**
   * ステータスを更新し delivery_events に記録する
   * Requirements: 6.6 - 全ステータス変更イベントをタイムスタンプ付きで記録
   */
  async updateStatus(
    smsLogId: string,
    providerStatus: DeliveryStatus,
    source: 'polling' | 'webhook',
    rawPayload?: unknown,
  ): Promise<void> {
    await this.prisma.deliveryEvent.create({
      data: {
        smsLogId,
        status: STATUS_TO_PRISMA[providerStatus],
        source,
        rawPayload: rawPayload != null ? (rawPayload as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });

    await this.prisma.smsLog.update({
      where: { id: smsLogId },
      data: {
        deliveryStatus: STATUS_TO_PRISMA[providerStatus],
      },
    });
  }

  /**
   * Webhook ペイロードを処理する
   * Requirements: 6.4 - Webhook経由の配信ステータス更新を受け付け処理する
   */
  async processWebhook(payload: ProcessWebhookPayload): Promise<void> {
    const smsLog = await this.prisma.smsLog.findFirst({
      where: { externalMessageId: payload.externalMessageId },
    });

    if (!smsLog) {
      throw new Error(`SmsLog not found for externalMessageId: ${payload.externalMessageId}`);
    }

    await this.updateStatus(smsLog.id, payload.status, 'webhook', payload.rawPayload);
  }

  /**
   * ポーリングジョブをスケジュールする
   * Requirements: 6.3 - 設定可能な間隔でポーリング
   * queue が渡されない場合はスケジュールをスキップする（テスト・開発用）
   */
  async schedulePolling(
    smsLogId: string,
    externalMessageId: string,
    queue?: Queue<DeliveryPollingJob>,
  ): Promise<PollingJobInfo> {
    if (!queue) {
      return {
        smsLogId,
        externalMessageId,
        scheduled: false,
        message: 'No queue provided. Polling job not scheduled.',
      };
    }

    await addPollingJob(queue, smsLogId, externalMessageId);
    return {
      smsLogId,
      externalMessageId,
      scheduled: true,
      message: 'Polling job scheduled.',
    };
  }

  /**
   * ステータス変更履歴を取得する
   * Requirements: 6.6 - 全ステータス変更イベントをタイムスタンプ付きで記録
   */
  async getStatusHistory(smsLogId: string): Promise<DeliveryEvent[]> {
    const events = await this.prisma.deliveryEvent.findMany({
      where: { smsLogId },
      orderBy: { createdAt: 'asc' },
    });

    return events.map((event) => ({
      id: event.id,
      smsLogId: event.smsLogId,
      status: PRISMA_TO_STATUS[event.status],
      rawPayload: event.rawPayload ?? undefined,
      source: event.source as DeliveryEvent['source'],
      createdAt: event.createdAt,
    }));
  }
}
