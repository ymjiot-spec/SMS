import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validateJapanesePhoneNumber } from '../phone.js';

const digits = '0123456789'.split('');
const validPrefixes = ['070', '080', '090'];

describe('validateJapanesePhoneNumber (Property Tests)', () => {
    it('Property 1: Accepts valid Japanese mobile phone numbers (070/080/090 + 8 digits)', () => {
        const eightDigitsArbitrary = fc.array(fc.constantFrom(...digits), { minLength: 8, maxLength: 8 }).map(a => a.join(''));
        const validPhoneNumberArbitrary = fc.tuple(
            fc.constantFrom(...validPrefixes),
            eightDigitsArbitrary
        ).map(([prefix, rest]) => prefix + rest);

        fc.assert(
            fc.property(validPhoneNumberArbitrary, (phone) => {
                expect(validateJapanesePhoneNumber(phone)).toBe(true);
            })
        );
    });

    it('Property 1 (Negative): Rejects strings that are too short or too long', () => {
        const invalidLengthArbitrary = fc.array(fc.constantFrom(...digits), { maxLength: 15 })
            .filter(a => a.length !== 8)
            .map(a => a.join(''));

        const invalidLengthPhoneNumberArbitrary = fc.tuple(
            fc.constantFrom(...validPrefixes),
            invalidLengthArbitrary
        ).map(([prefix, rest]) => prefix + rest);

        fc.assert(
            fc.property(invalidLengthPhoneNumberArbitrary, (phone) => {
                expect(validateJapanesePhoneNumber(phone)).toBe(false);
            })
        );
    });

    it('Property 1 (Negative): Rejects strings with non-numeric characters', () => {
        // Generate valid looking numbers short by 1, and insert an invalid character
        const sevenDigitsArbitrary = fc.array(fc.constantFrom(...digits), { minLength: 7, maxLength: 7 }).map(a => a.join(''));

        // An ascii character that is not a digit
        const asciiChars = Array.from({ length: 128 }, (_, i) => String.fromCharCode(i));
        const nonDigitChars = asciiChars.filter(c => !/[0-9]/.test(c));
        const nonNumericCharArbitrary = fc.constantFrom(...nonDigitChars);

        const invalidPhoneNumberArbitrary = fc.tuple(
            fc.constantFrom(...validPrefixes),
            sevenDigitsArbitrary,
            nonNumericCharArbitrary
        ).map(([prefix, rest, invalidChar]) => {
            const chars = (prefix + rest).split('');
            const insertPos = Math.floor(Math.random() * (chars.length + 1));
            chars.splice(insertPos, 0, invalidChar);
            return chars.join('');
        });

        fc.assert(
            fc.property(invalidPhoneNumberArbitrary, (phone) => {
                expect(validateJapanesePhoneNumber(phone)).toBe(false);
            })
        );
    });

    it('Property 1 (Negative): Rejects numbers with invalid prefixes', () => {
        const invalidPrefixArbitrary = fc.array(fc.constantFrom(...digits), { minLength: 3, maxLength: 3 })
            .map(a => a.join(''))
            .filter(prefix => !validPrefixes.includes(prefix));

        const eightDigitsArbitrary = fc.array(fc.constantFrom(...digits), { minLength: 8, maxLength: 8 }).map(a => a.join(''));

        const phoneWithInvalidPrefixArbitrary = fc.tuple(
            invalidPrefixArbitrary,
            eightDigitsArbitrary
        ).map(([prefix, rest]) => prefix + rest);

        fc.assert(
            fc.property(phoneWithInvalidPrefixArbitrary, (phone) => {
                expect(validateJapanesePhoneNumber(phone)).toBe(false);
            })
        );
    });
});
