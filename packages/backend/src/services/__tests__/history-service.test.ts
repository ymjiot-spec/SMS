import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HistoryService } from '../history-service.js';
import type { HistorySearchQuery } from '../history-service.js';

// Mock Prisma client
function createMockPrisma() {
  return {
    smsLog: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
    },
  } as any;
}

const NOW = new Date('2024-06-01T10:00:00Z');
const UPDATED = new Date('2024-06-01T10:05:00Z');

function makeSmsLogRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sms-1',
    operatorId: 'user-1',
    recipientPhone: '09012345678',
    messageBody: 'テストメッセージ',
    templateId: 'tmpl-1',
    ticketId: 'ticket-100',
    sendType: 'CUSTOMER',
    externalMessageId: 'ext-msg-1',
    deliveryStatus: 'DELIVERED',
    resultMessage: null,
    createdAt: NOW,
    updatedAt: UPDATED,
    ...overrides,
  };
}

describe('HistoryService', () => {
  let service: HistoryService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    service = new HistoryService(mockPrisma);
  });

  describe('search()', () => {
    it('should return paginated results with defaults', async () => {
      const records = [makeSmsLogRecord(), makeSmsLogRecord({ id: 'sms-2' })];
      mockPrisma.smsLog.findMany.mockResolvedValue(records);
      mockPrisma.smsLog.count.mockResolvedValue(2);

      const result = await service.search({});

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should map Prisma enums to shared lowercase values', async () => {
      mockPrisma.smsLog.findMany.mockResolvedValue([makeSmsLogRecord()]);
      mockPrisma.smsLog.count.mockResolvedValue(1);

      const result = await service.search({});

      expect(result.items[0].deliveryStatus).toBe('delivered');
      expect(result.items[0].sendType).toBe('customer');
    });

    it('should map all SendType values correctly', async () => {
      const records = [
        makeSmsLogRecord({ id: 'sms-1', sendType: 'CUSTOMER' }),
        makeSmsLogRecord({ id: 'sms-2', sendType: 'SELF_COPY' }),
        makeSmsLogRecord({ id: 'sms-3', sendType: 'TEST' }),
      ];
      mockPrisma.smsLog.findMany.mockResolvedValue(records);
      mockPrisma.smsLog.count.mockResolvedValue(3);

      const result = await service.search({});

      expect(result.items[0].sendType).toBe('customer');
      expect(result.items[1].sendType).toBe('self_copy');
      expect(result.items[2].sendType).toBe('test');
    });

    it('should map all DeliveryStatus values correctly', async () => {
      const statuses = ['QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'EXPIRED', 'UNKNOWN'];
      const expected = ['queued', 'sent', 'delivered', 'failed', 'expired', 'unknown'];
      const records = statuses.map((s, i) =>
        makeSmsLogRecord({ id: `sms-${i}`, deliveryStatus: s }),
      );
      mockPrisma.smsLog.findMany.mockResolvedValue(records);
      mockPrisma.smsLog.count.mockResolvedValue(records.length);

      const result = await service.search({});

      result.items.forEach((item, i) => {
        expect(item.deliveryStatus).toBe(expected[i]);
      });
    });

    it('should filter by ticketId', async () => {
      mockPrisma.smsLog.findMany.mockResolvedValue([]);
      mockPrisma.smsLog.count.mockResolvedValue(0);

      await service.search({ ticketId: 'ticket-100' });

      expect(mockPrisma.smsLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ ticketId: 'ticket-100' }),
        }),
      );
    });

    it('should filter by phone', async () => {
      mockPrisma.smsLog.findMany.mockResolvedValue([]);
      mockPrisma.smsLog.count.mockResolvedValue(0);

      await service.search({ phone: '09012345678' });

      expect(mockPrisma.smsLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ recipientPhone: '09012345678' }),
        }),
      );
    });

    it('should filter by operatorId', async () => {
      mockPrisma.smsLog.findMany.mockResolvedValue([]);
      mockPrisma.smsLog.count.mockResolvedValue(0);

      await service.search({ operatorId: 'user-1' });

      expect(mockPrisma.smsLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ operatorId: 'user-1' }),
        }),
      );
    });

    it('should filter by templateId', async () => {
      mockPrisma.smsLog.findMany.mockResolvedValue([]);
      mockPrisma.smsLog.count.mockResolvedValue(0);

      await service.search({ templateId: 'tmpl-1' });

      expect(mockPrisma.smsLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ templateId: 'tmpl-1' }),
        }),
      );
    });

    it('should filter by deliveryStatus (mapping lowercase to Prisma enum)', async () => {
      mockPrisma.smsLog.findMany.mockResolvedValue([]);
      mockPrisma.smsLog.count.mockResolvedValue(0);

      await service.search({ deliveryStatus: 'failed' });

      expect(mockPrisma.smsLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deliveryStatus: 'FAILED' }),
        }),
      );
    });

    it('should filter by date range', async () => {
      mockPrisma.smsLog.findMany.mockResolvedValue([]);
      mockPrisma.smsLog.count.mockResolvedValue(0);

      const dateFrom = new Date('2024-01-01');
      const dateTo = new Date('2024-03-31');

      await service.search({ dateFrom, dateTo });

      expect(mockPrisma.smsLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: dateFrom, lte: dateTo },
          }),
        }),
      );
    });

    it('should filter by dateFrom only', async () => {
      mockPrisma.smsLog.findMany.mockResolvedValue([]);
      mockPrisma.smsLog.count.mockResolvedValue(0);

      const dateFrom = new Date('2024-01-01');
      await service.search({ dateFrom });

      expect(mockPrisma.smsLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: dateFrom },
          }),
        }),
      );
    });

    it('should filter by dateTo only', async () => {
      mockPrisma.smsLog.findMany.mockResolvedValue([]);
      mockPrisma.smsLog.count.mockResolvedValue(0);

      const dateTo = new Date('2024-03-31');
      await service.search({ dateTo });

      expect(mockPrisma.smsLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { lte: dateTo },
          }),
        }),
      );
    });

    it('should combine multiple filters', async () => {
      mockPrisma.smsLog.findMany.mockResolvedValue([]);
      mockPrisma.smsLog.count.mockResolvedValue(0);

      await service.search({
        ticketId: 'ticket-100',
        operatorId: 'user-1',
        deliveryStatus: 'delivered',
      });

      expect(mockPrisma.smsLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            ticketId: 'ticket-100',
            operatorId: 'user-1',
            deliveryStatus: 'DELIVERED',
          },
        }),
      );
    });

    it('should apply custom pagination', async () => {
      mockPrisma.smsLog.findMany.mockResolvedValue([]);
      mockPrisma.smsLog.count.mockResolvedValue(50);

      const result = await service.search({ page: 3, limit: 10 });

      expect(mockPrisma.smsLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        }),
      );
      expect(result.page).toBe(3);
      expect(result.limit).toBe(10);
    });

    it('should order results by createdAt descending', async () => {
      mockPrisma.smsLog.findMany.mockResolvedValue([]);
      mockPrisma.smsLog.count.mockResolvedValue(0);

      await service.search({});

      expect(mockPrisma.smsLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('should preserve all record fields in mapped output', async () => {
      const record = makeSmsLogRecord();
      mockPrisma.smsLog.findMany.mockResolvedValue([record]);
      mockPrisma.smsLog.count.mockResolvedValue(1);

      const result = await service.search({});
      const item = result.items[0];

      expect(item.id).toBe('sms-1');
      expect(item.operatorId).toBe('user-1');
      expect(item.recipientPhone).toBe('09012345678');
      expect(item.messageBody).toBe('テストメッセージ');
      expect(item.templateId).toBe('tmpl-1');
      expect(item.ticketId).toBe('ticket-100');
      expect(item.externalMessageId).toBe('ext-msg-1');
      expect(item.resultMessage).toBeNull();
      expect(item.createdAt).toEqual(NOW);
      expect(item.updatedAt).toEqual(UPDATED);
    });
  });

  describe('getById()', () => {
    it('should return a record when found', async () => {
      mockPrisma.smsLog.findUnique.mockResolvedValue(makeSmsLogRecord());

      const result = await service.getById('sms-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('sms-1');
      expect(result!.deliveryStatus).toBe('delivered');
      expect(result!.sendType).toBe('customer');
    });

    it('should return null when not found', async () => {
      mockPrisma.smsLog.findUnique.mockResolvedValue(null);

      const result = await service.getById('nonexistent');

      expect(result).toBeNull();
    });

    it('should call findUnique with correct id', async () => {
      mockPrisma.smsLog.findUnique.mockResolvedValue(null);

      await service.getById('sms-42');

      expect(mockPrisma.smsLog.findUnique).toHaveBeenCalledWith({
        where: { id: 'sms-42' },
      });
    });
  });

  describe('exportCsv()', () => {
    it('should generate CSV with UTF-8 BOM', async () => {
      mockPrisma.smsLog.findMany.mockResolvedValue([makeSmsLogRecord()]);

      const buffer = await service.exportCsv({});

      // Check BOM
      expect(buffer[0]).toBe(0xef);
      expect(buffer[1]).toBe(0xbb);
      expect(buffer[2]).toBe(0xbf);
    });

    it('should include correct CSV header', async () => {
      mockPrisma.smsLog.findMany.mockResolvedValue([]);

      const buffer = await service.exportCsv({});
      const csv = buffer.toString('utf-8').replace(/^\uFEFF/, '');

      expect(csv.startsWith('ID,送信日時,送信者,送信先,メッセージ,テンプレートID,チケットID,送信種別,配信ステータス,外部メッセージID')).toBe(true);
    });

    it('should include data rows with correct field mapping', async () => {
      mockPrisma.smsLog.findMany.mockResolvedValue([makeSmsLogRecord()]);

      const buffer = await service.exportCsv({});
      const csv = buffer.toString('utf-8').replace(/^\uFEFF/, '');
      const lines = csv.split('\n');

      expect(lines).toHaveLength(2); // header + 1 data row
      const dataRow = lines[1];
      expect(dataRow).toContain('sms-1');
      expect(dataRow).toContain('user-1');
      expect(dataRow).toContain('09012345678');
      expect(dataRow).toContain('テストメッセージ');
      expect(dataRow).toContain('tmpl-1');
      expect(dataRow).toContain('ticket-100');
      expect(dataRow).toContain('customer');
      expect(dataRow).toContain('delivered');
      expect(dataRow).toContain('ext-msg-1');
    });

    it('should handle null fields as empty strings', async () => {
      const record = makeSmsLogRecord({
        templateId: null,
        ticketId: null,
        externalMessageId: null,
      });
      mockPrisma.smsLog.findMany.mockResolvedValue([record]);

      const buffer = await service.exportCsv({});
      const csv = buffer.toString('utf-8').replace(/^\uFEFF/, '');
      const lines = csv.split('\n');
      const fields = lines[1].split(',');

      // templateId (index 5), ticketId (index 6), externalMessageId (index 9)
      expect(fields[5]).toBe('');
      expect(fields[6]).toBe('');
      expect(fields[9]).toBe('');
    });

    it('should escape CSV fields containing commas', async () => {
      const record = makeSmsLogRecord({
        messageBody: 'こんにちは,世界',
      });
      mockPrisma.smsLog.findMany.mockResolvedValue([record]);

      const buffer = await service.exportCsv({});
      const csv = buffer.toString('utf-8').replace(/^\uFEFF/, '');

      expect(csv).toContain('"こんにちは,世界"');
    });

    it('should escape CSV fields containing double quotes', async () => {
      const record = makeSmsLogRecord({
        messageBody: 'テスト"メッセージ"です',
      });
      mockPrisma.smsLog.findMany.mockResolvedValue([record]);

      const buffer = await service.exportCsv({});
      const csv = buffer.toString('utf-8').replace(/^\uFEFF/, '');

      expect(csv).toContain('"テスト""メッセージ""です"');
    });

    it('should escape CSV fields containing newlines', async () => {
      const record = makeSmsLogRecord({
        messageBody: '行1\n行2',
      });
      mockPrisma.smsLog.findMany.mockResolvedValue([record]);

      const buffer = await service.exportCsv({});
      const csv = buffer.toString('utf-8').replace(/^\uFEFF/, '');

      expect(csv).toContain('"行1\n行2"');
    });

    it('should apply filters when exporting', async () => {
      mockPrisma.smsLog.findMany.mockResolvedValue([]);

      await service.exportCsv({ ticketId: 'ticket-100', deliveryStatus: 'sent' });

      expect(mockPrisma.smsLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            ticketId: 'ticket-100',
            deliveryStatus: 'SENT',
          },
        }),
      );
    });

    it('should order export results by createdAt descending', async () => {
      mockPrisma.smsLog.findMany.mockResolvedValue([]);

      await service.exportCsv({});

      expect(mockPrisma.smsLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('should export multiple rows', async () => {
      const records = [
        makeSmsLogRecord({ id: 'sms-1' }),
        makeSmsLogRecord({ id: 'sms-2', deliveryStatus: 'FAILED', sendType: 'TEST' }),
      ];
      mockPrisma.smsLog.findMany.mockResolvedValue(records);

      const buffer = await service.exportCsv({});
      const csv = buffer.toString('utf-8').replace(/^\uFEFF/, '');
      const lines = csv.split('\n');

      expect(lines).toHaveLength(3); // header + 2 data rows
      expect(lines[1]).toContain('sms-1');
      expect(lines[2]).toContain('sms-2');
      expect(lines[2]).toContain('failed');
      expect(lines[2]).toContain('test');
    });
  });
});
