import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { TemplateService } from '../template-service.js';
import type { CreateTemplateInput, UpdateTemplateInput, TemplateSearchQuery } from '@zendesk-sms-tool/shared';

describe('TemplateService (Property Tests)', () => {

    const templateInputArb = fc.record({
        name: fc.string({ minLength: 1, maxLength: 100 }),
        body: fc.string({ minLength: 1, maxLength: 500 }),
        companyId: fc.option(fc.string(), { nil: undefined }),
        brand: fc.option(fc.string(), { nil: undefined }),
        purpose: fc.option(fc.string(), { nil: undefined }),
        department: fc.option(fc.string(), { nil: undefined }),
        visibility: fc.constantFrom<'company' | 'department' | 'private'>('company', 'department', 'private')
    });

    it('Property 4 & 5: Template CRUD round-trip & classification preservation', async () => {
        await fc.assert(
            fc.asyncProperty(templateInputArb, fc.string(), async (input, createdBy) => {
                const mockDbRecord = {
                    id: 'tmpl-' + Math.random(),
                    ...input,
                    companyId: input.companyId ?? null,
                    brand: input.brand ?? null,
                    purpose: input.purpose ?? null,
                    department: input.department ?? null,
                    visibility: input.visibility ?? 'company',
                    createdBy,
                    lastUsedAt: null,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                const mockPrisma = {
                    template: {
                        create: vi.fn().mockResolvedValue(mockDbRecord),
                        update: vi.fn().mockResolvedValue(mockDbRecord),
                        delete: vi.fn().mockResolvedValue({}),
                        findUnique: vi.fn().mockResolvedValue(mockDbRecord),
                    }
                } as any;

                const service = new TemplateService(mockPrisma);

                // CREATE
                const created = await service.create(input as CreateTemplateInput, createdBy);
                expect(created.name).toBe(input.name);
                expect(created.body).toBe(input.body);
                expect(created.visibility).toBe(input.visibility ?? 'company');
                expect(created.purpose).toBe(input.purpose ?? null); // Property 5 preserved

                // UPDATE (partial)
                const updateInput = { name: input.name + ' updated' };
                await service.update(created.id, updateInput);
                expect(mockPrisma.template.update).toHaveBeenCalledWith({
                    where: { id: created.id },
                    data: { name: updateInput.name } // Only updated field is passed
                });

                // VIEW
                const viewed = await service.findById(created.id);
                expect(viewed?.id).toBe(created.id);

                // DELETE
                await service.delete(created.id);
                expect(mockPrisma.template.delete).toHaveBeenCalledWith({
                    where: { id: created.id }
                });
            })
        );
    });

    it('Property 6: Template search returns matching results (where query construction)', async () => {
        const searchArb = fc.record({
            keyword: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
            companyId: fc.option(fc.string(), { nil: undefined }),
            brand: fc.option(fc.string(), { nil: undefined }),
            purpose: fc.option(fc.string(), { nil: undefined }),
            department: fc.option(fc.string(), { nil: undefined }),
            visibility: fc.option(fc.constantFrom<'company' | 'department' | 'private'>('company', 'department', 'private'), { nil: undefined }),
        });

        await fc.assert(
            fc.asyncProperty(searchArb, async (query) => {
                const mockPrisma = {
                    template: {
                        findMany: vi.fn().mockResolvedValue([])
                    }
                } as any;

                const service = new TemplateService(mockPrisma);
                await service.search(query as TemplateSearchQuery);

                expect(mockPrisma.template.findMany).toHaveBeenCalledOnce();
                const callWhere = mockPrisma.template.findMany.mock.calls[0][0].where;

                if (query.keyword) {
                    expect(callWhere.OR).toEqual([
                        { name: { contains: query.keyword, mode: 'insensitive' } },
                        { body: { contains: query.keyword, mode: 'insensitive' } },
                        { purpose: { contains: query.keyword, mode: 'insensitive' } },
                        { brand: { contains: query.keyword, mode: 'insensitive' } },
                    ]);
                }

                if (query.companyId) expect(callWhere.companyId).toBe(query.companyId);
                if (query.brand) expect(callWhere.brand).toBe(query.brand);
                if (query.purpose) expect(callWhere.purpose).toBe(query.purpose);
                if (query.department) expect(callWhere.department).toBe(query.department);
                if (query.visibility) expect(callWhere.visibility).toBe(query.visibility);
            })
        );
    });
});
