/**
 * KeywordDetector - 危険キーワード検出サービス
 * Requirements: 10.2
 *
 * メッセージ本文に含まれる危険キーワードを検出し、警告リストを返す。
 */

import { DANGEROUS_KEYWORDS } from '@zendesk-sms-tool/shared';

export interface KeywordDetectionResult {
  /** 危険キーワードが検出されたかどうか */
  detected: boolean;
  /** 検出されたキーワード一覧 */
  keywords: string[];
}

/**
 * メッセージ本文から危険キーワードを検出する
 */
export function detectDangerousKeywords(messageBody: string): KeywordDetectionResult {
  const detected: string[] = [];

  for (const keyword of DANGEROUS_KEYWORDS) {
    if (messageBody.includes(keyword)) {
      detected.push(keyword);
    }
  }

  return {
    detected: detected.length > 0,
    keywords: detected,
  };
}
