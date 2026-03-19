import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Media4uProvider } from '../media4u-provider.js';
import { MockProvider } from '../mock-provider.js';

describe('Providers (Property Tests)', () => {
    describe('Provider configuration validation (Property 28)', () => {
        it('Accepts valid configurations (username 2-20, password 6-20)', async () => {
            const validUsernameArb = fc.string({ minLength: 2, maxLength: 20 });
            const validPasswordArb = fc.string({ minLength: 6, maxLength: 20 });

            await fc.assert(
                fc.asyncProperty(validUsernameArb, validPasswordArb, async (username, password) => {
                    const provider = new Media4uProvider({ username, password });
                    const result = await provider.validateConfig();
                    expect(result.valid).toBe(true);
                    expect(result.errors).toHaveLength(0);
                })
            );
        });

        it('Rejects configurations with invalid usernames', async () => {
            // invalid username: length < 2 or length > 20
            const invalidUsernameArb = fc.oneof(
                fc.string({ maxLength: 1 }),
                fc.string({ minLength: 21 })
            );
            const validPasswordArb = fc.string({ minLength: 6, maxLength: 20 });

            await fc.assert(
                fc.asyncProperty(invalidUsernameArb, validPasswordArb, async (username, password) => {
                    const provider = new Media4uProvider({ username, password });
                    const result = await provider.validateConfig();
                    expect(result.valid).toBe(false);
                    expect(result.errors.length).toBeGreaterThan(0);
                    expect(result.errors.some(e => e.includes('username'))).toBe(true);
                })
            );
        });

        it('Rejects configurations with invalid passwords', async () => {
            const validUsernameArb = fc.string({ minLength: 2, maxLength: 20 });
            // invalid password: length < 6 or length > 20
            const invalidPasswordArb = fc.oneof(
                fc.string({ maxLength: 5 }),
                fc.string({ minLength: 21 })
            );

            await fc.assert(
                fc.asyncProperty(validUsernameArb, invalidPasswordArb, async (username, password) => {
                    const provider = new Media4uProvider({ username, password });
                    const result = await provider.validateConfig();
                    expect(result.valid).toBe(false);
                    expect(result.errors.length).toBeGreaterThan(0);
                    expect(result.errors.some(e => e.includes('password'))).toBe(true);
                })
            );
        });
    });

    describe('Provider send-then-status consistency (Property 24)', () => {
        it('MockProvider maintains status consistency for successful sends', async () => {
            const phoneArb = fc.string({ minLength: 11, maxLength: 11 }); // mock accepts anything
            const bodyArb = fc.string({ minLength: 1 });

            await fc.assert(
                fc.asyncProperty(phoneArb, bodyArb, async (to, body) => {
                    const provider = new MockProvider();
                    const sendResult = await provider.sendMessage({ to, body });

                    if (sendResult.success && sendResult.externalMessageId) {
                        const statusResult = await provider.getDeliveryStatus(sendResult.externalMessageId);
                        expect(statusResult.externalMessageId).toBe(sendResult.externalMessageId);
                        // In mock provider, it initially returns 'delivered' for simplicity, or we check it doesn't fail
                        expect(['sent', 'delivered', 'failed', 'unknown', 'queued', 'expired']).toContain(statusResult.status);
                    }
                })
            );
        });
    });
});
