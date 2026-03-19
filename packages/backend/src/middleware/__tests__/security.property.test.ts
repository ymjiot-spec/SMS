import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { detectDangerousKeywords } from '../../services/keyword-detector.js';
import { isRateLimited, checkDuplicateSend } from '../rate-limit.js';
import { hasPermission } from '../auth.js';
import { DANGEROUS_KEYWORDS, RATE_LIMIT, DUPLICATE_SEND_WINDOW_MS } from '@zendesk-sms-tool/shared';
import type { UserRole } from '@zendesk-sms-tool/shared';

describe('Security Middlewares (Property Tests)', () => {

    it('Property 20: Dangerous keyword detection', () => {
        const keywordArb = fc.constantFrom(...DANGEROUS_KEYWORDS);
        const textArb = fc.string({ maxLength: 100 });

        // Generate messages that definitely contain a dangerous keyword
        const messageWithKeywordArb = fc.tuple(textArb, keywordArb, textArb).map(([prefix, keyword, suffix]) => ({
            message: prefix + keyword + suffix,
            keyword
        }));

        fc.assert(
            fc.property(messageWithKeywordArb, ({ message, keyword }) => {
                const result = detectDangerousKeywords(message);
                expect(result.detected).toBe(true);
                expect(result.keywords).toContain(keyword);
            })
        );
    });

    it('Property 21: Rate limit enforcement', () => {
        // Generate an arbitrary number of timestamps relative to 'now'
        const now = 1000000000000;
        const windowStart = now - RATE_LIMIT.windowMs;

        // Generate timestamps: some inside the window, some outside
        const timestampsArb = fc.array(
            fc.integer({ min: now - RATE_LIMIT.windowMs * 2, max: now }),
            { maxLength: 50 }
        );

        fc.assert(
            fc.property(timestampsArb, (timestamps) => {
                const store = { sends: new Map([['operator-1', timestamps]]) };

                const isLimited = isRateLimited(store, 'operator-1', now);
                const countInWindow = timestamps.filter(t => t > windowStart).length;

                expect(isLimited).toBe(countInWindow >= RATE_LIMIT.maxSendsPerWindow);
            })
        );
    });

    it('Property 22: Duplicate send warning', async () => {
        // If Prisma returns a record, then it's a duplicate. If not, it's not.
        const recordArb = fc.option(fc.record({ createdAt: fc.date() }), { nil: null, freq: 2 });

        await fc.assert(
            fc.asyncProperty(recordArb, async (record) => {
                const mockPrisma = {
                    smsLog: {
                        findFirst: vi.fn().mockResolvedValue(record)
                    }
                } as any;

                const result = await checkDuplicateSend(mockPrisma, 'op-1', '09012345678');

                if (record) {
                    expect(result.isDuplicate).toBe(true);
                    expect(result.lastSentAt).toEqual(record.createdAt);
                } else {
                    expect(result.isDuplicate).toBe(false);
                }
            })
        );
    });

    it('Property 23: Role-based permission enforcement', () => {
        const roles: UserRole[] = ['OPERATOR', 'SUPERVISOR', 'SYSTEM_ADMIN'];
        const hierarchy: Record<UserRole, number> = { OPERATOR: 1, SUPERVISOR: 2, SYSTEM_ADMIN: 3 };

        const roleArb = fc.constantFrom<UserRole>(...roles);

        fc.assert(
            fc.property(roleArb, roleArb, (userRole, requiredRole) => {
                const hasAccess = hasPermission(userRole, requiredRole);
                const expected = hierarchy[userRole] >= hierarchy[requiredRole];
                expect(hasAccess).toBe(expected);
            })
        );
    });
});
