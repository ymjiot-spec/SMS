import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseVariables, renderTemplate, validateVariableFormat } from '../template.js';

describe('Template Validators (Property Tests)', () => {

    const validChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_'.split('');
    const validVariableNameArbitrary = fc.array(fc.constantFrom(...validChars), { minLength: 1 }).map(a => a.join(''));

    it('Property 7: validateVariableFormat format validation', () => {
        fc.assert(
            fc.property(validVariableNameArbitrary, (varName) => {
                const template = `Hello {{${varName}}}`;
                const result = validateVariableFormat(template);
                expect(result.valid).toBe(true);
                expect(result.errors).toHaveLength(0);
            })
        );
    });

    it('Property 7 (Negative): validateVariableFormat detects bad formats', () => {
        // Bad formats: characters not in validChars
        const badVarNameArbitrary = fc.string().filter(s => {
            // Must not contain `}` so the regex `{{([^}]*)}}` can match it
            if (s.includes('}')) return false;
            // Must have bad character or be empty
            return s.length === 0 || /[^a-zA-Z0-9_]/.test(s);
        });

        fc.assert(
            fc.property(badVarNameArbitrary, (varName) => {
                // We only test if they contain {{ ... }} but the content is invalid
                if (/\{\{\w+\}\}/.test(`{{${varName}}}`)) return;

                const template = `Hello {{${varName}}}`;
                const result = validateVariableFormat(template);
                expect(result.valid).toBe(false);
                expect(result.errors.length).toBeGreaterThan(0);
            })
        );
    });

    it('Property 8: parseVariables extracts all valid variables', () => {
        const listArbitrary = fc.array(validVariableNameArbitrary, { minLength: 1, maxLength: 10 });

        fc.assert(
            fc.property(listArbitrary, (varNames) => {
                const template = varNames.map(v => `Value is {{${v}}}.`).join(' ');
                const extracted = parseVariables(template);
                expect(extracted).toEqual(varNames);
            })
        );
    });

    it('Property 9: Template parse-render-parse round-trip', () => {
        const listArbitrary = fc.array(validVariableNameArbitrary, { minLength: 1, maxLength: 5 });
        const dictArbitrary = fc.dictionary(validVariableNameArbitrary, fc.string().filter(s => !s.includes('{{') && !s.includes('}}')));

        fc.assert(
            fc.property(listArbitrary, dictArbitrary, (varNames, values) => {
                varNames.forEach(v => {
                    if (!values[v]) values[v] = 'dummy';
                });

                const template = varNames.map(v => `Test {{${v}}}`).join(' ');
                const initialVars = parseVariables(template);
                expect(initialVars).toEqual(varNames);

                const { rendered } = renderTemplate(template, values);
                const finalVars = parseVariables(rendered);
                expect(finalVars).toHaveLength(0);
            })
        );
    });

    it('Property 10: renderTemplate detects unresolved variables', () => {
        const listArbitrary = fc.array(validVariableNameArbitrary, { minLength: 1, maxLength: 5 });
        const emptyValues = {};

        fc.assert(
            fc.property(listArbitrary, (varNames) => {
                const template = varNames.map(v => `Test {{${v}}}`).join(' ');
                const { unresolvedVars, rendered } = renderTemplate(template, emptyValues);

                expect(unresolvedVars).toEqual(varNames);
                expect(rendered).toBe(template);
            })
        );
    });

    it('Property 11: Template rendering replaces all provided variables exactly', () => {
        // values must be non-empty, because empty string values are treated as UNRESOLVED by design
        const valueArb = fc.string({ minLength: 1 }).filter(s => !s.includes('{{') && !s.includes('}}'));
        const pairsArb = fc.array(fc.tuple(validVariableNameArbitrary, valueArb), { minLength: 1, maxLength: 5 });

        fc.assert(
            fc.property(pairsArb, (pairs) => {
                const template = pairs.map(([name, _val]) => `Here is {{${name}}}`).join(' - ');

                const valuesRecord: Record<string, string> = {};
                pairs.forEach(([name, val]) => {
                    valuesRecord[name] = val;
                });

                const trueExpected = pairs.map(([name, _val]) => `Here is ${valuesRecord[name]}`).join(' - ');

                const { rendered, unresolvedVars } = renderTemplate(template, valuesRecord);
                expect(rendered).toBe(trueExpected);
                expect(unresolvedVars).toHaveLength(0);
            })
        );
    });

});
