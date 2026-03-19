import { describe, it, expect } from 'vitest';
import { validateJapanesePhoneNumber } from '../phone.js';

describe('validateJapanesePhoneNumber', () => {
  it('accepts valid 080 numbers', () => {
    expect(validateJapanesePhoneNumber('08012345678')).toBe(true);
  });

  it('accepts valid 090 numbers', () => {
    expect(validateJapanesePhoneNumber('09012345678')).toBe(true);
  });

  it('accepts valid 070 numbers', () => {
    expect(validateJapanesePhoneNumber('07012345678')).toBe(true);
  });

  it('rejects numbers with wrong prefix', () => {
    expect(validateJapanesePhoneNumber('06012345678')).toBe(false);
    expect(validateJapanesePhoneNumber('05012345678')).toBe(false);
    expect(validateJapanesePhoneNumber('03012345678')).toBe(false);
  });

  it('rejects numbers that are too short', () => {
    expect(validateJapanesePhoneNumber('0801234567')).toBe(false);
  });

  it('rejects numbers that are too long', () => {
    expect(validateJapanesePhoneNumber('080123456789')).toBe(false);
  });

  it('rejects non-numeric strings', () => {
    expect(validateJapanesePhoneNumber('080abcdefgh')).toBe(false);
    expect(validateJapanesePhoneNumber('hello')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(validateJapanesePhoneNumber('')).toBe(false);
  });

  it('rejects strings with spaces or hyphens', () => {
    expect(validateJapanesePhoneNumber('080-1234-5678')).toBe(false);
    expect(validateJapanesePhoneNumber('080 1234 5678')).toBe(false);
  });
});
