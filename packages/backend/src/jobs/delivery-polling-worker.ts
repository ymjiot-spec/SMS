/**
 * BullMQ Delivery Polling Worker
 * Requirements: 6.3 - 設定可能な間隔でポーリングによる配信ステータス更新
 *
 * SMS送信後に配信ステータスをプロバイダからポーリングで取得し、
 * ステータス変更時に delivery_events に記録する。
 * リトライ戦略: 指数バックオフ、最大5回。
 */

import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import type { DeliveryService } from '../services/delivery-service.js';
import type { SmsProvider, DeliveryStatus } from '@zendesk-sms-tool/shared';

/** ポーリングジョブのデータ型 */
export interface DeliveryPollingJob {
  smsLogId: string;
  externalMessageId: string;
}

/** ポーリングジョブの処理結果 */
export interface PollingResult {
  smsLogId: string;
  externalMessageId: string;
  status: DeliveryStatus;
  changed: boolean;
}

/** キュー名 */
export const DELIVERY_POLLING_QUEUE = 'delivery-polling';

/** デフォルトのポーリング遅延（ミリ秒） */
export const DEFAULT_POLLING_DELAY_MS = 30_000;

/**
 * 配信ポーリングキューを作成する
 */
export function createDeliveryPollingQueue(
  connection: ConnectionOptions,
): Queue<DeliveryPollingJob> {
  return new Queue<DeliveryPollingJob>(DELIVERY_POLLING_QUEUE, {
    connection,
    defaultJobOptions: {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: DEFAULT_POLLING_DELAY_MS,
      },
      removeOnComplete: true,
      removeOnFail: false,
    },
  });
}

/**
 * ポーリングジョブの処理ロジック（テスト可能な純粋関数）
 */
export async function processPollingJob(
  job: Pick<Job<DeliveryPollingJob>, 'data'>,
  deliveryService: DeliveryService,
  provider: SmsProvider,
): Promise<PollingResult> {
  const { smsLogId, externalMessageId } = job.data;

  const response = await provider.getDeliveryStatus(externalMessageId);

  // Terminal statuses don't need further polling
  const currentStatus = response.status;
  const isTerminal = currentStatus === 'delivered' || currentStatus === 'failed' || currentStatus === 'expired';

  // Always record the polled status
  await deliveryService.updateStatus(smsLogId, currentStatus, 'polling', response.rawResponse);

  return {
    smsLogId,
    externalMessageId,
    status: currentStatus,
    changed: true,
  };
}

/**
 * 配信ポーリングワーカーを作成する
 */
export function createDeliveryPollingWorker(
  connection: ConnectionOptions,
  deliveryService: DeliveryService,
  provider: SmsProvider,
): Worker<DeliveryPollingJob, PollingResult> {
  return new Worker<DeliveryPollingJob, PollingResult>(
    DELIVERY_POLLING_QUEUE,
    async (job) => processPollingJob(job, deliveryService, provider),
    { connection },
  );
}

/**
 * ポーリングジョブをキューに追加するヘルパー
 */
export async function addPollingJob(
  queue: Queue<DeliveryPollingJob>,
  smsLogId: string,
  externalMessageId: string,
  delay: number = DEFAULT_POLLING_DELAY_MS,
): Promise<void> {
  await queue.add(
    `poll-${externalMessageId}`,
    { smsLogId, externalMessageId },
    { delay },
  );
}
