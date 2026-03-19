/**
 * TemplateService - テンプレート管理サービス
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3
 *
 * テンプレートのCRUD操作、検索、複製、お気に入り管理、
 * およびテンプレート変数の展開機能を提供する。
 */

import { Prisma, PrismaClient } from '@prisma/client';
import type {
  CreateTemplateInput,
  UpdateTemplateInput,
  TemplateSearchQuery,
  Template,
  RenderResult,
  ValidationResult,
} from '@zendesk-sms-tool/shared';
import {
  parseVariables as sharedParseVariables,
  renderTemplate as sharedRenderTemplate,
  validateVariableFormat as sharedValidateVariableFormat,
} from '@zendesk-sms-tool/shared';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

export class TemplateService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * テンプレートを作成する
   * Requirements: 2.1, 2.2
   */
  async create(data: CreateTemplateInput, createdBy: string): Promise<Template> {
    const record = await this.prisma.template.create({
      data: {
        name: data.name,
        body: data.body,
        companyId: data.companyId ?? null,
        brand: data.brand ?? null,
        purpose: data.purpose ?? null,
        department: data.department ?? null,
        visibility: data.visibility ?? 'company',
        createdBy,
      },
    });
    return this.mapToTemplate(record);
  }

  /**
   * テンプレートを更新する
   * Requirements: 2.1
   */
  async update(id: string, data: UpdateTemplateInput): Promise<Template> {
    const record = await this.prisma.template.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.body !== undefined && { body: data.body }),
        ...(data.companyId !== undefined && { companyId: data.companyId }),
        ...(data.brand !== undefined && { brand: data.brand }),
        ...(data.purpose !== undefined && { purpose: data.purpose }),
        ...(data.department !== undefined && { department: data.department }),
        ...(data.visibility !== undefined && { visibility: data.visibility }),
      },
    });
    return this.mapToTemplate(record);
  }

  /**
   * テンプレートを削除する
   * Requirements: 2.1
   */
  async delete(id: string): Promise<void> {
    await this.prisma.template.delete({ where: { id } });
  }

  /**
   * IDでテンプレートを取得する
   * Requirements: 2.1
   */
  async findById(id: string): Promise<Template | null> {
    const record = await this.prisma.template.findUnique({ where: { id } });
    return record ? this.mapToTemplate(record) : null;
  }

  /**
   * テンプレートを検索する
   * キーワード検索は name, body, purpose, brand フィールドを対象とする
   * companyId, brand, purpose, department, visibility でフィルタリング可能
   * Requirements: 2.2, 2.3
   */
  async search(query: TemplateSearchQuery): Promise<Template[]> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    const where: Prisma.TemplateWhereInput = {};

    if (query.keyword) {
      where.OR = [
        { name: { contains: query.keyword, mode: 'insensitive' } },
        { body: { contains: query.keyword, mode: 'insensitive' } },
        { purpose: { contains: query.keyword, mode: 'insensitive' } },
        { brand: { contains: query.keyword, mode: 'insensitive' } },
      ];
    }

    if (query.companyId) {
      where.companyId = query.companyId;
    }
    if (query.brand) {
      where.brand = query.brand;
    }
    if (query.purpose) {
      where.purpose = query.purpose;
    }
    if (query.department) {
      where.department = query.department;
    }
    if (query.visibility) {
      where.visibility = query.visibility;
    }

    const records = await this.prisma.template.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limit,
    });

    return records.map((r) => this.mapToTemplate(r));
  }

  /**
   * テンプレートを複製する
   * id, createdAt, updatedAt, lastUsedAt 以外の全フィールドをコピーする
   * Requirements: 2.6
   */
  async duplicate(id: string, newName: string, createdBy: string): Promise<Template> {
    const source = await this.prisma.template.findUnique({ where: { id } });
    if (!source) {
      throw new Error(`Template not found: ${id}`);
    }

    const record = await this.prisma.template.create({
      data: {
        name: newName,
        body: source.body,
        companyId: source.companyId,
        brand: source.brand,
        purpose: source.purpose,
        department: source.department,
        visibility: source.visibility,
        createdBy,
      },
    });
    return this.mapToTemplate(record);
  }

  /**
   * テンプレートのお気に入りをトグルする
   * 既にお気に入りの場合は解除、そうでなければ追加する
   * Requirements: 2.4
   */
  async toggleFavorite(templateId: string, userId: string): Promise<void> {
    const existing = await this.prisma.templateFavorite.findUnique({
      where: {
        userId_templateId: { userId, templateId },
      },
    });

    if (existing) {
      await this.prisma.templateFavorite.delete({
        where: { id: existing.id },
      });
    } else {
      await this.prisma.templateFavorite.create({
        data: { userId, templateId },
      });
    }
  }

  /**
   * テンプレート本文から変数名を抽出する（shared validatorsに委譲）
   * Requirements: 3.4
   */
  parseVariables(templateBody: string): string[] {
    return sharedParseVariables(templateBody);
  }

  /**
   * テンプレート本文の変数を値で置換する（shared validatorsに委譲）
   * Requirements: 3.2, 3.3
   */
  renderTemplate(
    templateBody: string,
    variables: Record<string, string>,
  ): RenderResult {
    return sharedRenderTemplate(templateBody, variables);
  }

  /**
   * テンプレート本文の変数フォーマットを検証する（shared validatorsに委譲）
   * Requirements: 2.7
   */
  validateVariableFormat(templateBody: string): ValidationResult {
    return sharedValidateVariableFormat(templateBody);
  }

  /** Prisma record を Template 型にマッピングする */
  private mapToTemplate(record: {
    id: string;
    name: string;
    body: string;
    companyId: string | null;
    brand: string | null;
    purpose: string | null;
    department: string | null;
    visibility: string;
    createdBy: string;
    lastUsedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): Template {
    return {
      id: record.id,
      name: record.name,
      body: record.body,
      companyId: record.companyId,
      brand: record.brand,
      purpose: record.purpose,
      department: record.department,
      visibility: record.visibility as Template['visibility'],
      createdBy: record.createdBy,
      lastUsedAt: record.lastUsedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
