import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { AuditService } from '../audit-service.js';
import type { AuditLogEntry, AuditAction } from '@zendesk-sms-tool/shared';

// Prisma mapping constants from service
const ACTION_TO_PRISMA: Record<AuditAction, string> = {
    sms_send: 'SMS_SEND',
    sms_send_failed: 'SMS_SEND_FAILED',
    template_create: 'TEMPLATE_CREATE',
    template_update: 'TEMPLATE_UPDATE',
    template_delete: 'TEMPLATE_DELETE',
    permission_denied: 'PERMISSION_DENIED',
    config_change: 'CONFIG_CHANGE',
};

describe('AuditService (Property Tests)', () => {
    it('Property 26: Audit log entries contain required fields when saving to Prisma', async () => {
        const auditEntryArbitrary = fc.record({
            userId: fc.string({ minLength: 1 }),
            action: fc.constantFrom<AuditAction>(
                'sms_send', 'sms_send_failed', 'template_create',
                'template_update', 'template_delete', 'permission_denied', 'config_change'
            ),
            resourceType: fc.string({ minLength: 1 }),
            resourceId: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
            details: fc.dictionary(fc.string({ minLength: 1 }), fc.string({ minLength: 1 })),
            ipAddress: fc.option(fc.string({ minLength: 1 }), { nil: undefined })
        });

        await fc.assert(
            fc.asyncProperty(auditEntryArbitrary, async (entry) => {
                const mockPrisma = {
                    auditLog: {
                        create: vi.fn().mockResolvedValue({ id: 'mock-id' }),
                    }
                } as any;
                const service = new AuditService(mockPrisma);

                await service.log(entry);

                expect(mockPrisma.auditLog.create).toHaveBeenCalledOnce();
                const callArg = mockPrisma.auditLog.create.mock.calls[0][0];

                // Ensure required fields are structurally present
                expect(callArg.data).toMatchObject({
                    userId: entry.userId,
                    action: ACTION_TO_PRISMA[entry.action],
                    resourceType: entry.resourceType,
                    resourceId: entry.resourceId ?? null,
                    details: entry.details,
                    ipAddress: entry.ipAddress ?? null,
                });
            })
        );
    });

    it('Property 27: Audit log serialization round-trip', async () => {
        const jsonArbitrary = fc.record({
            key1: fc.string(),
            key2: fc.integer()
        }); // Simple json objects

        const auditEntryArbitrary = fc.record({
            userId: fc.string({ minLength: 1 }),
            action: fc.constantFrom<AuditAction>(
                'sms_send', 'sms_send_failed', 'template_create',
                'template_update', 'template_delete', 'permission_denied', 'config_change'
            ),
            resourceType: fc.string({ minLength: 1 }),
            resourceId: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
            details: jsonArbitrary,
            ipAddress: fc.option(fc.string({ minLength: 1 }), { nil: undefined })
        });

        await fc.assert(
            fc.asyncProperty(auditEntryArbitrary, async (entry) => {
                // Simulate an in-memory database
                let savedData: any = null;

                const mockPrisma = {
                    auditLog: {
                        create: vi.fn().mockImplementation(async (args) => {
                            // Serialize strings through JSON to simulate database text round-trip
                            savedData = JSON.parse(JSON.stringify({
                                id: 'db-id-123',
                                ...args.data,
                                createdAt: new Date().toISOString()
                            }));
                            return savedData;
                        }),
                        findMany: vi.fn().mockImplementation(async () => {
                            return [
                                {
                                    ...savedData,
                                    createdAt: new Date(savedData.createdAt)
                                }
                            ];
                        }),
                        count: vi.fn().mockResolvedValue(1)
                    }
                } as any;
                const service = new AuditService(mockPrisma);

                // 1. Log the entry
                await service.log(entry);

                // 2. Search and retrieve the entry
                const results = await service.search({});

                expect(results.items).toHaveLength(1);
                const retrieved = results.items[0];

                // 3. Verify the round-trip exactly preserves our fields
                expect(retrieved.userId).toBe(entry.userId);
                expect(retrieved.action).toBe(entry.action);
                expect(retrieved.resourceType).toBe(entry.resourceType);
                expect(retrieved.resourceId).toBe(entry.resourceId ?? null);
                expect(retrieved.details).toEqual(entry.details); // JSON round-trip
                expect(retrieved.ipAddress).toBe(entry.ipAddress ?? null);
            })
        );
    });
});
