import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TemplateService } from '../template-service.js';
import type {
  CreateTemplateInput,
  UpdateTemplateInput,
  TemplateSearchQuery,
} from '@zendesk-sms-tool/shared';

// Mock Prisma client
function createMockPrisma() {
  return {
    template: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    templateFavorite: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  } as any;
}

const NOW = new Date('2024-06-01T00:00:00Z');

function makeTemplateRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tmpl-1',
    name: 'テストテンプレート',
    body: 'こんにちは {{customer_name}} 様',
    companyId: 'company-1',
    brand: 'ブランドA',
    purpose: '挨拶',
    department: 'サポート',
    visibility: 'company',
    createdBy: 'user-1',
    lastUsedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('TemplateService', () => {
  let service: TemplateService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    service = new TemplateService(mockPrisma);
  });

  describe('create()', () => {
    it('should create a template with all fields', async () => {
      const input: CreateTemplateInput = {
        name: '新規テンプレート',
        body: '{{customer_name}} 様、お問い合わせありがとうございます。',
        companyId: 'company-1',
        brand: 'ブランドA',
        purpose: '問い合わせ対応',
        department: 'サポート',
        visibility: 'company',
      };
      const record = makeTemplateRecord({
        id: 'tmpl-new',
        name: input.name,
        body: input.body,
        purpose: input.purpose,
      });
      mockPrisma.template.create.mockResolvedValue(record);

      const result = await service.create(input, 'user-1');

      expect(mockPrisma.template.create).toHaveBeenCalledWith({
        data: {
          name: input.name,
          body: input.body,
          companyId: 'company-1',
          brand: 'ブランドA',
          purpose: '問い合わせ対応',
          department: 'サポート',
          visibility: 'company',
          createdBy: 'user-1',
        },
      });
      expect(result.name).toBe(input.name);
      expect(result.body).toBe(input.body);
    });

    it('should use default visibility when not provided', async () => {
      const input: CreateTemplateInput = {
        name: 'シンプルテンプレート',
        body: 'テスト本文',
      };
      mockPrisma.template.create.mockResolvedValue(
        makeTemplateRecord({ name: input.name, body: input.body }),
      );

      await service.create(input, 'user-1');

      expect(mockPrisma.template.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          visibility: 'company',
          companyId: null,
          brand: null,
          purpose: null,
          department: null,
        }),
      });
    });
  });

  describe('update()', () => {
    it('should update specified fields only', async () => {
      const data: UpdateTemplateInput = {
        name: '更新後テンプレート',
        body: '更新後の本文',
      };
      mockPrisma.template.update.mockResolvedValue(
        makeTemplateRecord({ name: data.name, body: data.body }),
      );

      const result = await service.update('tmpl-1', data);

      expect(mockPrisma.template.update).toHaveBeenCalledWith({
        where: { id: 'tmpl-1' },
        data: { name: '更新後テンプレート', body: '更新後の本文' },
      });
      expect(result.name).toBe('更新後テンプレート');
    });

    it('should not include undefined fields in update data', async () => {
      const data: UpdateTemplateInput = { name: '名前だけ更新' };
      mockPrisma.template.update.mockResolvedValue(
        makeTemplateRecord({ name: data.name }),
      );

      await service.update('tmpl-1', data);

      const callData = mockPrisma.template.update.mock.calls[0][0].data;
      expect(callData).toEqual({ name: '名前だけ更新' });
      expect(callData).not.toHaveProperty('body');
      expect(callData).not.toHaveProperty('brand');
    });
  });

  describe('delete()', () => {
    it('should delete a template by id', async () => {
      mockPrisma.template.delete.mockResolvedValue(makeTemplateRecord());

      await service.delete('tmpl-1');

      expect(mockPrisma.template.delete).toHaveBeenCalledWith({
        where: { id: 'tmpl-1' },
      });
    });
  });

  describe('findById()', () => {
    it('should return a template when found', async () => {
      mockPrisma.template.findUnique.mockResolvedValue(makeTemplateRecord());

      const result = await service.findById('tmpl-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('tmpl-1');
      expect(result!.name).toBe('テストテンプレート');
    });

    it('should return null when not found', async () => {
      mockPrisma.template.findUnique.mockResolvedValue(null);

      const result = await service.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('search()', () => {
    it('should search by keyword across name, body, purpose, brand', async () => {
      mockPrisma.template.findMany.mockResolvedValue([makeTemplateRecord()]);

      await service.search({ keyword: 'テスト' });

      expect(mockPrisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { name: { contains: 'テスト', mode: 'insensitive' } },
              { body: { contains: 'テスト', mode: 'insensitive' } },
              { purpose: { contains: 'テスト', mode: 'insensitive' } },
              { brand: { contains: 'テスト', mode: 'insensitive' } },
            ],
          },
        }),
      );
    });

    it('should filter by companyId', async () => {
      mockPrisma.template.findMany.mockResolvedValue([]);

      await service.search({ companyId: 'company-1' });

      expect(mockPrisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: 'company-1' }),
        }),
      );
    });

    it('should filter by brand, purpose, department, visibility', async () => {
      mockPrisma.template.findMany.mockResolvedValue([]);

      await service.search({
        brand: 'ブランドA',
        purpose: '挨拶',
        department: 'サポート',
        visibility: 'company',
      });

      expect(mockPrisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            brand: 'ブランドA',
            purpose: '挨拶',
            department: 'サポート',
            visibility: 'company',
          }),
        }),
      );
    });

    it('should apply pagination with defaults', async () => {
      mockPrisma.template.findMany.mockResolvedValue([]);

      await service.search({});

      expect(mockPrisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 20,
        }),
      );
    });

    it('should apply custom pagination', async () => {
      mockPrisma.template.findMany.mockResolvedValue([]);

      await service.search({ page: 3, limit: 10 });

      expect(mockPrisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        }),
      );
    });

    it('should order by updatedAt descending', async () => {
      mockPrisma.template.findMany.mockResolvedValue([]);

      await service.search({});

      expect(mockPrisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { updatedAt: 'desc' },
        }),
      );
    });

    it('should combine keyword and filter criteria', async () => {
      mockPrisma.template.findMany.mockResolvedValue([]);

      await service.search({ keyword: 'テスト', companyId: 'company-1', brand: 'ブランドA' });

      const callArgs = mockPrisma.template.findMany.mock.calls[0][0];
      expect(callArgs.where.OR).toBeDefined();
      expect(callArgs.where.companyId).toBe('company-1');
      expect(callArgs.where.brand).toBe('ブランドA');
    });
  });

  describe('duplicate()', () => {
    it('should copy all fields except id, timestamps, and lastUsedAt', async () => {
      const source = makeTemplateRecord({
        lastUsedAt: new Date('2024-05-01'),
      });
      mockPrisma.template.findUnique.mockResolvedValue(source);
      mockPrisma.template.create.mockResolvedValue(
        makeTemplateRecord({ id: 'tmpl-dup', name: 'コピー' }),
      );

      const result = await service.duplicate('tmpl-1', 'コピー', 'user-2');

      expect(mockPrisma.template.create).toHaveBeenCalledWith({
        data: {
          name: 'コピー',
          body: source.body,
          companyId: source.companyId,
          brand: source.brand,
          purpose: source.purpose,
          department: source.department,
          visibility: source.visibility,
          createdBy: 'user-2',
        },
      });
      expect(result.name).toBe('コピー');
    });

    it('should throw when source template not found', async () => {
      mockPrisma.template.findUnique.mockResolvedValue(null);

      await expect(
        service.duplicate('nonexistent', 'コピー', 'user-1'),
      ).rejects.toThrow('Template not found: nonexistent');
    });
  });

  describe('toggleFavorite()', () => {
    it('should add favorite when not yet favorited', async () => {
      mockPrisma.templateFavorite.findUnique.mockResolvedValue(null);
      mockPrisma.templateFavorite.create.mockResolvedValue({ id: 'fav-1' });

      await service.toggleFavorite('tmpl-1', 'user-1');

      expect(mockPrisma.templateFavorite.findUnique).toHaveBeenCalledWith({
        where: { userId_templateId: { userId: 'user-1', templateId: 'tmpl-1' } },
      });
      expect(mockPrisma.templateFavorite.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', templateId: 'tmpl-1' },
      });
      expect(mockPrisma.templateFavorite.delete).not.toHaveBeenCalled();
    });

    it('should remove favorite when already favorited', async () => {
      mockPrisma.templateFavorite.findUnique.mockResolvedValue({
        id: 'fav-1',
        userId: 'user-1',
        templateId: 'tmpl-1',
      });
      mockPrisma.templateFavorite.delete.mockResolvedValue({ id: 'fav-1' });

      await service.toggleFavorite('tmpl-1', 'user-1');

      expect(mockPrisma.templateFavorite.delete).toHaveBeenCalledWith({
        where: { id: 'fav-1' },
      });
      expect(mockPrisma.templateFavorite.create).not.toHaveBeenCalled();
    });
  });

  describe('parseVariables()', () => {
    it('should extract variable names from template body', () => {
      const result = service.parseVariables(
        'こんにちは {{customer_name}} 様、チケット {{ticket_id}} について',
      );
      expect(result).toEqual(['customer_name', 'ticket_id']);
    });

    it('should return empty array when no variables', () => {
      const result = service.parseVariables('変数なしのテキスト');
      expect(result).toEqual([]);
    });
  });

  describe('renderTemplate()', () => {
    it('should replace all provided variables', () => {
      const result = service.renderTemplate(
        '{{customer_name}} 様、チケット #{{ticket_id}} の件',
        { customer_name: '田中太郎', ticket_id: '12345' },
      );
      expect(result.rendered).toBe('田中太郎 様、チケット #12345 の件');
      expect(result.unresolvedVars).toEqual([]);
    });

    it('should report unresolved variables', () => {
      const result = service.renderTemplate(
        '{{customer_name}} 様、{{agent_name}} が対応します',
        { customer_name: '田中太郎' },
      );
      expect(result.rendered).toBe('田中太郎 様、{{agent_name}} が対応します');
      expect(result.unresolvedVars).toEqual(['agent_name']);
    });
  });

  describe('validateVariableFormat()', () => {
    it('should accept valid variable formats', () => {
      const result = service.validateVariableFormat(
        '{{customer_name}} と {{ticket_id}}',
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject invalid variable formats', () => {
      const result = service.validateVariableFormat('{{}} と {{ space }}');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
