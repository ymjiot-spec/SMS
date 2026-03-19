import { describe, it, expect } from 'vitest';
import { detectDangerousKeywords } from '../keyword-detector.js';
import { DANGEROUS_KEYWORDS } from '@zendesk-sms-tool/shared';

describe('detectDangerousKeywords', () => {
  describe('キーワード検出 (Requirement 10.2)', () => {
    it('should detect a single dangerous keyword', () => {
      const result = detectDangerousKeywords('この件について解約をお願いします');
      expect(result.detected).toBe(true);
      expect(result.keywords).toContain('解約');
    });

    it('should detect multiple dangerous keywords', () => {
      const result = detectDangerousKeywords('返金と解約の手続きについて');
      expect(result.detected).toBe(true);
      expect(result.keywords).toContain('解約');
      expect(result.keywords).toContain('返金');
      expect(result.keywords).toHaveLength(2);
    });

    it('should return detected=false for safe messages', () => {
      const result = detectDangerousKeywords('お問い合わせありがとうございます。');
      expect(result.detected).toBe(false);
      expect(result.keywords).toHaveLength(0);
    });

    it('should return detected=false for empty message', () => {
      const result = detectDangerousKeywords('');
      expect(result.detected).toBe(false);
      expect(result.keywords).toHaveLength(0);
    });

    it('should detect each predefined dangerous keyword', () => {
      for (const keyword of DANGEROUS_KEYWORDS) {
        const result = detectDangerousKeywords(`テスト${keyword}テスト`);
        expect(result.detected).toBe(true);
        expect(result.keywords).toContain(keyword);
      }
    });

    it('should detect パスワード keyword', () => {
      const result = detectDangerousKeywords('パスワードを教えてください');
      expect(result.detected).toBe(true);
      expect(result.keywords).toContain('パスワード');
    });

    it('should detect クレジットカード keyword', () => {
      const result = detectDangerousKeywords('クレジットカード番号を確認します');
      expect(result.detected).toBe(true);
      expect(result.keywords).toContain('クレジットカード');
    });

    it('should not flag partial matches that are not keywords', () => {
      // 'キャンセル' is a keyword, but a message without it should be safe
      const result = detectDangerousKeywords('お支払いの確認をお願いします');
      expect(result.detected).toBe(false);
    });
  });
});
