import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { HistoryService } from '../history-service.js';
import type { HistorySearchQuery } from '../history-service.js';
import type { DeliveryStatus } from '@zendesk-sms-tool/shared';

describe('HistoryService (Property Tests)', () => {

    const deliveryStatusArb = fc.constantFrom<DeliveryStatus>('queued', 'sent', 'delivered', 'failed', 'expired', 'unknown');

    it('Property 17: History filter creates exact match Prisma where clauses', async () => {
        const queryArbitrary = fc.record({
            ticketId: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
            phone: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
            operatorId: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
            templateId: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
            deliveryStatus: fc.option(deliveryStatusArb, { nil: undefined }),
            page: fc.option(fc.integer({ min: 1, max: 100 }), { nil: undefined }),
            limit: fc.option(fc.integer({ min: 1, max: 100 }), { nil: undefined }),
        });

        await fc.assert(
            fc.asyncProperty(queryArbitrary, async (query) => {
                const mockPrisma = {
                    smsLog: {
                        findMany: vi.fn().mockResolvedValue([]),
                        count: vi.fn().mockResolvedValue(0)
                    }
                } as any;
                const service = new HistoryService(mockPrisma);

                await service.search(query);

                expect(mockPrisma.smsLog.findMany).toHaveBeenCalledOnce();
                const callArgs = mockPrisma.smsLog.findMany.mock.calls[0][0];

                // Check the where clause
                const where = callArgs.where;

                if (query.ticketId) expect(where.ticketId).toBe(query.ticketId);
                if (query.phone) expect(where.recipientPhone).toBe(query.phone);
                if (query.operatorId) expect(where.operatorId).toBe(query.operatorId);
                if (query.templateId) expect(where.templateId).toBe(query.templateId);
                if (query.deliveryStatus) {
                    // Check it is mapped to uppercase equivalent in Prisma
                    expect(where.deliveryStatus).toBe(query.deliveryStatus.toUpperCase());
                }
            })
        );
    });

    it('Property 18: CSV export safely escapes special characters', async () => {
        // Generate valid records with arbitrary content that might break CSV (newlines, quotes, commas)
        const smsLogArb = fc.record({
            id: fc.uuid(),
            operatorId: fc.string(),
            recipientPhone: fc.string(),
            messageBody: fc.string(),
            templateId: fc.option(fc.uuid(), { nil: null }),
            ticketId: fc.option(fc.string(), { nil: null }),
            sendType: fc.constantFrom('CUSTOMER', 'SELF_COPY', 'TEST'),
            externalMessageId: fc.option(fc.string(), { nil: null }),
            deliveryStatus: fc.constantFrom('QUEUED', 'SENT', 'FAILED'),
            resultMessage: fc.option(fc.string(), { nil: null }),
            createdAt: fc.date(),
            updatedAt: fc.date()
        });

        await fc.assert(
            fc.asyncProperty(fc.array(smsLogArb, { maxLength: 10 }), async (items) => {
                const mockPrisma = {
                    smsLog: {
                        findMany: vi.fn().mockResolvedValue(items),
                    }
                } as any;
                const service = new HistoryService(mockPrisma);

                const csvBuffer = await service.exportCsv({});
                const csvString = csvBuffer.toString('utf-8');

                // It should have BOM
                expect(csvBuffer.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(true);

                const lines = csvString.slice(3).trim().split('\n');

                // 1 header line + items
                expect(lines.length).toBe(items.length + 1);

                // Any returned valid string field should not break the CSV format.
                // A naive validation: counts of unescaped quotes should always be even per line.
                for (const line of lines) {
                    let inQuote = false;
                    for (let i = 0; i < line.length; i++) {
                        if (line[i] === '"') {
                            if (i + 1 < line.length && line[i + 1] === '"') {
                                // Escaped quote, skip next
                                i++;
                            } else {
                                inQuote = !inQuote;
                            }
                        }
                    }
                    expect(inQuote).toBe(false); // Should close all quotes
                }
            })
        );
    });
});
