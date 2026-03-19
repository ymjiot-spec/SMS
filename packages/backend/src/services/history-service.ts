/**
 * HistoryService - 履歴管理サービス
 * Requirements: 9.1, 9.2, 9.3
 *
 * SMS送信履歴の検索、取得、CSV出力を提供する。
 */

import {
  DeliveryStatus as PrismaDeliveryStatus,
  SendType as PrismaSendType,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import type {
  DeliveryStatus,
  SendType,
  PaginatedResult,
} from '@zendesk-sms-tool/shared';

/** HistoryService が返す SMS ログレコード */
export interface SmsLogRecord {
  id: string;
  operatorId: string;
  recipientPhone: string;
  messageBody: string;
  templateId: string | null;
  ticketId: string | null;
  sendType: SendType;
  externalMessageId: string | null;
  deliveryStatus: DeliveryStatus;
  resultMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** 履歴検索クエリ */
export interface HistorySearchQuery {
  ticketId?: string;
  phone?: string;
  operatorId?: string;
  templateId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  deliveryStatus?: DeliveryStatus;
  page?: number;
  limit?: number;
}

/** Map shared lowercase DeliveryStatus to Prisma enum */
const DELIVERY_STATUS_TO_PRISMA: Record<DeliveryStatus, PrismaDeliveryStatus> = {
  queued: PrismaDeliveryStatus.QUEUED,
  sent: PrismaDeliveryStatus.SENT,
  delivered: PrismaDeliveryStatus.DELIVERED,
  failed: PrismaDeliveryStatus.FAILED,
  expired: PrismaDeliveryStatus.EXPIRED,
  unknown: PrismaDeliveryStatus.UNKNOWN,
};

/** Map Prisma DeliveryStatus enum to shared lowercase */
const PRISMA_TO_DELIVERY_STATUS: Record<PrismaDeliveryStatus, DeliveryStatus> = {
  [PrismaDeliveryStatus.QUEUED]: 'queued',
  [PrismaDeliveryStatus.SENT]: 'sent',
  [PrismaDeliveryStatus.DELIVERED]: 'delivered',
  [PrismaDeliveryStatus.FAILED]: 'failed',
  [PrismaDeliveryStatus.EXPIRED]: 'expired',
  [PrismaDeliveryStatus.UNKNOWN]: 'unknown',
};

/** Map Prisma SendType enum to shared lowercase */
const PRISMA_TO_SEND_TYPE: Record<PrismaSendType, SendType> = {
  [PrismaSendType.CUSTOMER]: 'customer',
  [PrismaSendType.SELF_COPY]: 'self_copy',
  [PrismaSendType.TEST]: 'test',
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

/** CSV columns for export */
const CSV_COLUMNS = [
  'ID',
  '送信日時',
  '送信者',
  '送信先',
  'メッセージ',
  'テンプレートID',
  'チケットID',
  '送信種別',
  '配信ステータス',
  '外部メッセージID',
] as const;

export class HistoryService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * SMS送信履歴を検索する（ページネーション付き）
   * Requirements: 9.1, 9.2
   */
  async search(query: HistorySearchQuery): Promise<PaginatedResult<SmsLogRecord>> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    const where = this.buildWhereClause(query);

    const [items, total] = await Promise.all([
      this.prisma.smsLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.smsLog.count({ where }),
    ]);

    return {
      items: items.map((item) => this.mapToSmsLogRecord(item)),
      total,
      page,
      limit,
    };
  }

  /**
   * IDで SMS ログを取得する
   */
  async getById(id: string): Promise<SmsLogRecord | null> {
    const record = await this.prisma.smsLog.findUnique({ where: { id } });
    return record ? this.mapToSmsLogRecord(record) : null;
  }

  /**
   * フィルタ結果をCSV出力する
   * UTF-8 BOM 付きで Excel 互換
   * Requirements: 9.3
   */
  async exportCsv(query: HistorySearchQuery): Promise<Buffer> {
    const where = this.buildWhereClause(query);

    const items = await this.prisma.smsLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const rows = items.map((item) => this.toCsvRow(this.mapToSmsLogRecord(item)));
    const header = CSV_COLUMNS.join(',');
    const body = rows.join('\n');
    const csvContent = `${header}\n${body}`;

    // UTF-8 BOM for Excel compatibility
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const content = Buffer.from(csvContent, 'utf-8');
    return Buffer.concat([bom, content]);
  }

  /** Build Prisma where clause from query */
  private buildWhereClause(query: HistorySearchQuery): Prisma.SmsLogWhereInput {
    const where: Prisma.SmsLogWhereInput = {};

    if (query.ticketId) {
      where.ticketId = query.ticketId;
    }
    if (query.phone) {
      where.recipientPhone = query.phone;
    }
    if (query.operatorId) {
      where.operatorId = query.operatorId;
    }
    if (query.templateId) {
      where.templateId = query.templateId;
    }
    if (query.deliveryStatus) {
      where.deliveryStatus = DELIVERY_STATUS_TO_PRISMA[query.deliveryStatus];
    }
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) {
        where.createdAt.gte = query.dateFrom;
      }
      if (query.dateTo) {
        where.createdAt.lte = query.dateTo;
      }
    }

    return where;
  }

  /** Map Prisma SmsLog record to SmsLogRecord */
  private mapToSmsLogRecord(record: {
    id: string;
    operatorId: string;
    recipientPhone: string;
    messageBody: string;
    templateId: string | null;
    ticketId: string | null;
    sendType: PrismaSendType;
    externalMessageId: string | null;
    deliveryStatus: PrismaDeliveryStatus;
    resultMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): SmsLogRecord {
    return {
      id: record.id,
      operatorId: record.operatorId,
      recipientPhone: record.recipientPhone,
      messageBody: record.messageBody,
      templateId: record.templateId,
      ticketId: record.ticketId,
      sendType: PRISMA_TO_SEND_TYPE[record.sendType],
      externalMessageId: record.externalMessageId,
      deliveryStatus: PRISMA_TO_DELIVERY_STATUS[record.deliveryStatus],
      resultMessage: record.resultMessage,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  /** Convert SmsLogRecord to CSV row string */
  private toCsvRow(record: SmsLogRecord): string {
    const fields = [
      record.id,
      record.createdAt.toISOString(),
      record.operatorId,
      record.recipientPhone,
      record.messageBody,
      record.templateId ?? '',
      record.ticketId ?? '',
      record.sendType,
      record.deliveryStatus,
      record.externalMessageId ?? '',
    ];
    return fields.map((f) => this.escapeCsvField(f)).join(',');
  }

  /** Escape a CSV field value (wrap in quotes if it contains comma, quote, or newline) */
  private escapeCsvField(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
