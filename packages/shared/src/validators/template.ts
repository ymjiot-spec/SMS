/**
 * テンプレート変数パース・レンダリング・バリデーション
 * Requirements: 2.7, 3.4, 3.5
 */

import { VARIABLE_PATTERN } from '../constants.js';
import type { RenderResult, ValidationResult } from '../types/template.js';

/**
 * テンプレート本文から全ての {{variable_name}} パターンを抽出する
 * @param body - テンプレート本文
 * @returns 変数名の配列
 */
export function parseVariables(body: string): string[] {
  const regex = new RegExp(VARIABLE_PATTERN.source, VARIABLE_PATTERN.flags);
  const matches = body.matchAll(regex);
  return [...matches].map((m) => m[1]);
}

/**
 * テンプレート本文の変数を値で置換する
 * 未解決の変数はそのまま残す
 * @param body - テンプレート本文
 * @param values - 変数名と値のマップ
 * @returns レンダリング結果と未解決変数のリスト
 */
export function renderTemplate(
  body: string,
  values: Record<string, string>,
): RenderResult {
  const unresolvedVars: string[] = [];
  const regex = new RegExp(VARIABLE_PATTERN.source, VARIABLE_PATTERN.flags);
  const rendered = body.replace(regex, (match, varName: string) => {
    if (values[varName] !== undefined && values[varName] !== '') {
      return values[varName];
    }
    unresolvedVars.push(varName);
    return match;
  });
  return { rendered, unresolvedVars };
}

/**
 * テンプレート本文内の {{...}} パターンが有効なフォーマットかを検証する
 * 有効: {{word_characters}} — \w+ にマッチするもの
 * 無効: {{}}、{{ }}、中に非ワード文字を含むもの
 * @param body - テンプレート本文
 * @returns バリデーション結果
 */
export function validateVariableFormat(body: string): ValidationResult {
  const errors: string[] = [];
  // Match all {{ ... }} patterns including malformed ones
  const allBracketPattern = /\{\{([^}]*)\}\}/g;
  const validVarPattern = /^\w+$/;

  let match: RegExpExecArray | null;
  while ((match = allBracketPattern.exec(body)) !== null) {
    const inner = match[1];
    if (!validVarPattern.test(inner)) {
      errors.push(`Invalid variable format: {{${inner}}}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
