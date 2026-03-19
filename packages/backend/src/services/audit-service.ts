/**
 * AuditService - 監査ログサービス
 * Requirements: 14.1, 14.2, 14.3, 14.5
 *
 * SMS送信、テンプレート変更、権限拒否の各アクションタイプに対応した
 * 監査ログの記録と検索を提供する。
 */

import { AuditAction as PrismaAuditAction, Prisma, PrismaClient } from '@prisma/client';
import type {
  AuditAction,
  AuditLogEntry,
  AuditSearchQuery,
  PaginatedResult,
} from '@zendesk-sms-tool/shared';

/** AuditLog record returned from the database */
export interface AuditLog {
  id: string;
  userId: string;
  action: AuditAction;
  resourceType: string;
  resourceId: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: Date;
}

/** Map shared lowercase AuditAction to Prisma enum */
const ACTION_TO_PRISMA: Record<AuditAction, PrismaAuditAction> = {
  sms_send: PrismaAuditAction.SMS_SEND,
  sms_send_failed: PrismaAuditAction.SMS_SEND_FAILED,
  template_create: PrismaAuditAction.TEMPLATE_CREATE,
  template_update: PrismaAuditAction.TEMPLATE_UPDATE,
  template_delete: PrismaAuditAction.TEMPLATE_DELETE,
  permission_denied: PrismaAuditAction.PERMISSION_DENIED,
  config_change: PrismaAuditAction.CONFIG_CHANGE,
};

/** Map Prisma enum back to shared lowercase AuditAction */
const PRISMA_TO_ACTION: Record<PrismaAuditAction, AuditAction> = {
  [PrismaAuditAction.SMS_SEND]: 'sms_send',
  [PrismaAuditAction.SMS_SEND_FAILED]: 'sms_send_failed',
  [PrismaAuditAction.TEMPLATE_CREATE]: 'template_create',
  [PrismaAuditAction.TEMPLATE_UPDATE]: 'template_update',
  [PrismaAuditAction.TEMPLATE_DELETE]: 'template_delete',
  [PrismaAuditAction.PERMISSION_DENIED]: 'permission_denied',
  [PrismaAuditAction.CONFIG_CHANGE]: 'config_change',
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

export class AuditService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * 監査ログを記録する
   * Requirements: 14.1 (SMS送信), 14.2 (テンプレート変更), 14.3 (権限拒否), 14.5 (パース可能な形式)
   */
  async log(entry: AuditLogEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        userId: entry.userId,
        action: ACTION_TO_PRISMA[entry.action],
        resourceType: entry.resourceType,
        resourceId: entry.resourceId ?? null,
        details: entry.details as Prisma.InputJsonValue,
        ipAddress: entry.ipAddress ?? null,
      },
    });
  }

  /**
   * 監査ログを検索する（ページネーション付き）
   * userId, action, resourceType, dateRange でフィルタリング可能
   */
  async search(query: AuditSearchQuery): Promise<PaginatedResult<AuditLog>> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {};

    if (query.userId) {
      where.userId = query.userId;
    }
    if (query.action) {
      where.action = ACTION_TO_PRISMA[query.action];
    }
    if (query.resourceType) {
      where.resourceType = query.resourceType;
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

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items: items.map((item) => ({
        id: item.id,
        userId: item.userId,
        action: PRISMA_TO_ACTION[item.action],
        resourceType: item.resourceType,
        resourceId: item.resourceId,
        details: item.details as Record<string, unknown>,
        ipAddress: item.ipAddress,
        createdAt: item.createdAt,
      })),
      total,
      page,
      limit,
    };
  }
}
