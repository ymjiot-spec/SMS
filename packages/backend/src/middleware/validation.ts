/**
 * バリデーションミドルウェア
 * Requirements: 1.4, 1.5, 2.7
 *
 * Zod スキーマベースのリクエストボディバリデーション。
 * SMS送信、テンプレート作成/更新リクエストのスキーマを定義。
 */

import { z } from 'zod';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * 日本の携帯電話番号パターン（070/080/090 + 8桁）
 */
const JAPANESE_MOBILE_PATTERN = /^0[789]0\d{8}$/;

/**
 * テンプレート変数フォーマットパターン
 */
const TEMPLATE_VARIABLE_PATTERN = /\{\{([^}]*)\}\}/g;
const VALID_VARIABLE_NAME = /^\w+$/;

/**
 * テンプレート本文内の変数フォーマットを検証するカスタムリファインメント
 */
function hasValidVariableFormats(body: string): boolean {
  const regex = new RegExp(TEMPLATE_VARIABLE_PATTERN.source, TEMPLATE_VARIABLE_PATTERN.flags);
  let match: RegExpExecArray | null;
  while ((match = regex.exec(body)) !== null) {
    if (!VALID_VARIABLE_NAME.test(match[1])) {
      return false;
    }
  }
  return true;
}

// --- Zod Schemas ---

/**
 * SMS送信リクエストスキーマ
 * Requirements: 1.4, 1.5
 */
export const smsSendSchema = z.object({
  to: z
    .string({ required_error: '電話番号は必須です。' })
    .regex(JAPANESE_MOBILE_PATTERN, '日本の携帯電話番号形式（070/080/090 + 8桁）で入力してください。'),
  body: z
    .string({ required_error: 'メッセージ本文は必須です。' })
    .transform((val) => val.trim())
    .pipe(z.string().min(1, 'メッセージ本文を入力してください。')),
  templateId: z.string().optional(),
  ticketId: z.string().optional(),
  sendType: z.enum(['customer', 'self_copy', 'test']).optional(),
});

/**
 * テンプレート作成リクエストスキーマ
 * Requirements: 2.7
 */
export const templateCreateSchema = z.object({
  name: z
    .string({ required_error: 'テンプレート名は必須です。' })
    .trim()
    .min(1, 'テンプレート名を入力してください。'),
  body: z
    .string({ required_error: 'テンプレート本文は必須です。' })
    .trim()
    .min(1, 'テンプレート本文を入力してください。')
    .refine(hasValidVariableFormats, 'テンプレート変数のフォーマットが不正です。{{variable_name}} 形式を使用してください。'),
  companyId: z.string().optional(),
  brand: z.string().optional(),
  purpose: z.string().optional(),
  department: z.string().optional(),
  visibility: z.enum(['company', 'personal', 'global']).optional(),
});

/**
 * テンプレート更新リクエストスキーマ（全フィールドオプショナル）
 * Requirements: 2.7
 */
export const templateUpdateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'テンプレート名を入力してください。')
    .optional(),
  body: z
    .string()
    .trim()
    .min(1, 'テンプレート本文を入力してください。')
    .refine(hasValidVariableFormats, 'テンプレート変数のフォーマットが不正です。{{variable_name}} 形式を使用してください。')
    .optional(),
  companyId: z.string().optional(),
  brand: z.string().optional(),
  purpose: z.string().optional(),
  department: z.string().optional(),
  visibility: z.enum(['company', 'personal', 'global']).optional(),
});

// --- Middleware ---

/**
 * Zod スキーマベースのバリデーションミドルウェアファクトリ
 * req.body をスキーマで検証し、失敗時は 400 を返す。
 * 成功時は req.body をパース済みの値で上書きする。
 */
export function validate(schema: z.ZodSchema): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const path = issue.path.join('.') || '_root';
        if (!fieldErrors[path]) {
          fieldErrors[path] = issue.message;
        }
      }

      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'リクエストのバリデーションに失敗しました。',
          details: fieldErrors,
        },
      });
      return;
    }

    // パース済みの値で req.body を上書き（trim 等の transform が反映される）
    req.body = result.data;
    next();
  };
}
