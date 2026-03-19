import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { SmsService } from '../sms-service.js';
import type { SendParams } from '../sms-service.js';

describe('SmsService (Property Tests)', () => {

    const validPhoneArb = fc.stringMatching(/^0[789]0\d{8}$/);
    const validBodyArb = fc.string({ minLength: 1 }).filter(s => s.trim().length > 0);

    it('Property 2 & 12 & 19: SMS send results, logging, and sendType consistency', async () => {
        const sendParamsArb = fc.record({
            operatorId: fc.uuid(),
            to: validPhoneArb,
            body: validBodyArb,
            templateId: fc.option(fc.uuid(), { nil: undefined }),
            ticketId: fc.option(fc.string(), { nil: undefined }),
            sendType: fc.constantFrom<'customer' | 'self_copy' | 'test'>('customer', 'self_copy', 'test'),
        });

        // Provider outcome: success or failure
        const providerOutcomeArb = fc.record({
            success: fc.boolean(),
            externalMessageId: fc.string(),
            error: fc.option(fc.record({ code: fc.string(), message: fc.string() }), { nil: undefined })
        });

        await fc.assert(
            fc.asyncProperty(sendParamsArb, providerOutcomeArb, async (params, outcome) => {
                const mockProvider = {
                    sendMessage: vi.fn().mockResolvedValue(outcome)
                } as any;

                const mockPrisma = {
                    smsLog: {
                        create: vi.fn().mockImplementation(async (args) => {
                            return { id: 'log-123', ...args.data };
                        })
                    }
                } as any;

                const mockAudit = {
                    log: vi.fn().mockResolvedValue({})
                } as any;

                const service = new SmsService(mockProvider, mockPrisma, mockAudit);

                const result = await service.send(params as SendParams);

                // 1. Result Structure (Property 2)
                expect(result.success).toBe(outcome.success);
                if (outcome.success) {
                    expect(result.externalMessageId).toBe(outcome.externalMessageId);
                } else {
                    expect(result.error).toBeDefined(); // Provider error mapping
                }

                // 2. Logging Completeness (Property 19) & sendType (Property 12)
                expect(mockPrisma.smsLog.create).toHaveBeenCalledOnce();
                const prismaCreateArgs = mockPrisma.smsLog.create.mock.calls[0][0];

                expect(prismaCreateArgs.data.sendType).toBe(params.sendType.toUpperCase());
                expect(prismaCreateArgs.data.recipientPhone).toBe(params.to);

                // Audit Log must also fire
                expect(mockAudit.log).toHaveBeenCalledOnce();
                const auditLogArgs = mockAudit.log.mock.calls[0][0];
                expect(auditLogArgs.action).toBe(outcome.success ? 'sms_send' : 'sms_send_failed');
                expect(auditLogArgs.details.sendType).toBe(params.sendType);
            })
        );
    });

    it('Property 3: Empty or whitespace message rejection', async () => {
        const emptyBodyArb = fc.string().filter(s => s.trim().length === 0);

        await fc.assert(
            fc.asyncProperty(emptyBodyArb, async (body) => {
                const mockProvider = { sendMessage: vi.fn() } as any;
                const mockPrisma = { smsLog: { create: vi.fn() } } as any;
                const mockAudit = { log: vi.fn() } as any;

                const service = new SmsService(mockProvider, mockPrisma, mockAudit);

                const result = await service.send({
                    operatorId: 'op-1',
                    to: '09012345678',
                    body,
                    sendType: 'customer'
                });

                expect(result.success).toBe(false);
                expect(result.error?.code).toBe('EMPTY_MESSAGE_BODY');
                expect(mockProvider.sendMessage).not.toHaveBeenCalled();
            })
        );
    });

    it('Property 13: Self-copy sends identical message body', async () => {
        const bodyArb = validBodyArb;

        await fc.assert(
            fc.asyncProperty(bodyArb, async (body) => {
                const mockProvider = { sendMessage: vi.fn().mockResolvedValue({ success: true, externalMessageId: 'ext-1' }) } as any;
                const mockPrisma = { smsLog: { create: vi.fn().mockResolvedValue({ id: 'log-1' }) } } as any;
                const mockAudit = { log: vi.fn() } as any;

                const service = new SmsService(mockProvider, mockPrisma, mockAudit);

                // Spying on service.send internally is hard since it's the module instance method
                // But we can check the arguments sent to provider.sendMessage 
                // which must be called twice with the SAME BODY!

                await service.sendWithSelfCopy({
                    operatorId: 'op-1',
                    to: '09012345678',
                    operatorPhone: '08087654321',
                    body
                });

                expect(mockProvider.sendMessage).toHaveBeenCalledTimes(2);

                const call1 = mockProvider.sendMessage.mock.calls[0][0];
                const call2 = mockProvider.sendMessage.mock.calls[1][0];

                expect(call1.to).toBe('09012345678');
                expect(call2.to).toBe('08087654321');

                // Exact same body 
                expect(call1.body).toBe(body);
                expect(call2.body).toBe(body);
            })
        );
    });

    it('Property 14: Test send uses configured test number and [TEST] prefix', async () => {
        const bodyArb = validBodyArb;
        const testPhoneArb = validPhoneArb;

        await fc.assert(
            fc.asyncProperty(bodyArb, testPhoneArb, async (body, testPhone) => {
                const mockProvider = { sendMessage: vi.fn().mockResolvedValue({ success: true, externalMessageId: 'ext-1' }) } as any;
                const mockPrisma = { smsLog: { create: vi.fn().mockResolvedValue({ id: 'log-1' }) } } as any;
                const mockAudit = { log: vi.fn() } as any;

                const service = new SmsService(mockProvider, mockPrisma, mockAudit);

                await service.testSend({
                    operatorId: 'op-1',
                    body,
                    testPhone
                });

                expect(mockProvider.sendMessage).toHaveBeenCalledOnce();
                const providerCall = mockProvider.sendMessage.mock.calls[0][0];

                expect(providerCall.to).toBe(testPhone);
                expect(providerCall.body).toBe(`[TEST] ${body}`);
            })
        );
    });
});
