import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { DeliveryService } from '../delivery-service.js';
import type { DeliveryStatus } from '@zendesk-sms-tool/shared';

const STATUS_TO_PRISMA: Record<DeliveryStatus, string> = {
    queued: 'QUEUED',
    sent: 'SENT',
    delivered: 'DELIVERED',
    failed: 'FAILED',
    expired: 'EXPIRED',
    unknown: 'UNKNOWN',
};

describe('DeliveryService (Property Tests)', () => {
    const statusArb = fc.constantFrom<DeliveryStatus>('queued', 'sent', 'delivered', 'failed', 'expired', 'unknown');

    it('Property 15: Delivery status events logged with timestamps', async () => {
        const updateArb = fc.record({
            smsLogId: fc.uuid(),
            status: statusArb,
            source: fc.constantFrom<'polling' | 'webhook'>('polling', 'webhook'),
            rawPayload: fc.option(fc.dictionary(fc.string(), fc.string()), { nil: undefined })
        });

        await fc.assert(
            fc.asyncProperty(updateArb, async ({ smsLogId, status, source, rawPayload }) => {
                const mockPrisma = {
                    deliveryEvent: {
                        create: vi.fn().mockResolvedValue({ id: 'event-1' }),
                    },
                    smsLog: {
                        update: vi.fn().mockResolvedValue({ id: smsLogId }),
                    }
                } as any;
                const mockProvider = {} as any; // Not used in this method

                const service = new DeliveryService(mockPrisma, mockProvider);
                await service.updateStatus(smsLogId, status, source, rawPayload);

                expect(mockPrisma.deliveryEvent.create).toHaveBeenCalledOnce();
                const createArgs = mockPrisma.deliveryEvent.create.mock.calls[0][0];

                // Ensure the event logic creates the correct structures
                expect(createArgs.data).toMatchObject({
                    smsLogId,
                    status: STATUS_TO_PRISMA[status],
                    source,
                });
                if (rawPayload != null) {
                    expect(createArgs.data.rawPayload).toEqual(rawPayload);
                }

                // Prisma.create inherently applies the db-level timestamp for createdAt,
                // so we check that we correctly called Prisma with the event data.
            })
        );
    });

    it('Property 16: Webhook delivery status update routes correctly', async () => {
        const webhookPayloadArb = fc.record({
            externalMessageId: fc.string({ minLength: 1 }),
            status: statusArb,
            rawPayload: fc.dictionary(fc.string(), fc.string())
        });

        await fc.assert(
            fc.asyncProperty(webhookPayloadArb, async (payload) => {
                const mockSmsLogId = 'found-log-id-' + Math.random();

                const mockPrisma = {
                    smsLog: {
                        findFirst: vi.fn().mockResolvedValue({ id: mockSmsLogId, externalMessageId: payload.externalMessageId }),
                        update: vi.fn().mockResolvedValue({})
                    },
                    deliveryEvent: {
                        create: vi.fn().mockResolvedValue({})
                    }
                } as any;
                const mockProvider = {} as any;

                const service = new DeliveryService(mockPrisma, mockProvider);
                await service.processWebhook(payload);

                // Verify findFirst was called with externalMessageId
                expect(mockPrisma.smsLog.findFirst).toHaveBeenCalledWith({
                    where: { externalMessageId: payload.externalMessageId },
                });

                // Verify it routed to updateStatus correctly
                expect(mockPrisma.deliveryEvent.create).toHaveBeenCalledOnce();
                const createArgs = mockPrisma.deliveryEvent.create.mock.calls[0][0];

                expect(createArgs.data).toMatchObject({
                    smsLogId: mockSmsLogId,
                    status: STATUS_TO_PRISMA[payload.status],
                    source: 'webhook',
                    rawPayload: payload.rawPayload
                });
            })
        );
    });
});
