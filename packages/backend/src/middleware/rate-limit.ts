/**
 * 誤送信防止ミドルウェア
 * Requirements: 10.1, 10.2, 10.4, 10.5
 *
 * - レート制限: 10件/分/オペレーター (in-memory Map)
 * - 重複送信警告: 同一番号5分以内 (sms_logs クエリ)
 * - 危険キーワード検出: メッセージ本文のキーワードチェック
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { PrismaClient } from '@prisma/client';
import { RATE_LIMIT, DUPLICATE_SEND_WINDOW_MS } from '@zendesk-sms-tool/shared';
import { detectDangerousKeywords } from '../services/keyword-detector.js';

/** オペレーターごとの送信タイムスタンプを保持するストア */
export interface RateLimitStore {
  /** operatorId → 送信タイムスタンプ配列 */
  sends: Map<string, number[]>;
}

/**
 * 新しいレート制限ストアを作成する
 */
export function createRateLimitStore(): RateLimitStore {
  return { sends: new Map() };
}

/**
 * レート制限チェック
 * 指定ウィンドウ内の送信数が上限を超えていないか確認する。
 * @returns true = 制限超過（ブロックすべき）
 */
export function isRateLimited(
  store: RateLimitStore,
  operatorId: string,
  now: number = Date.now(),
): boolean {
  const timestamps = store.sends.get(operatorId) ?? [];
  const windowStart = now - RATE_LIMIT.windowMs;

  // ウィンドウ外のタイムスタンプを除去
  const recent = timestamps.filter((t) => t > windowStart);
  store.sends.set(operatorId, recent);

  return recent.length >= RATE_LIMIT.maxSendsPerWindow;
}

/**
 * 送信記録をストアに追加する
 */
export function recordSend(
  store: RateLimitStore,
  operatorId: string,
  now: number = Date.now(),
): void {
  const timestamps = store.sends.get(operatorId) ?? [];
  timestamps.push(now);
  store.sends.set(operatorId, timestamps);
}

/**
 * 重複送信チェック結果
 */
export interface DuplicateCheckResult {
  isDuplicate: boolean;
  lastSentAt?: Date;
}

/**
 * 重複送信チェック
 * 同一オペレーターが同一電話番号に5分以内に送信していないか確認する。
 */
export async function checkDuplicateSend(
  prisma: PrismaClient,
  operatorId: string,
  recipientPhone: string,
): Promise<DuplicateCheckResult> {
  const windowStart = new Date(Date.now() - DUPLICATE_SEND_WINDOW_MS);

  const recentSend = await prisma.smsLog.findFirst({
    where: {
      operatorId,
      recipientPhone,
      createdAt: { gte: windowStart },
    },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  if (recentSend) {
    return { isDuplicate: true, lastSentAt: recentSend.createdAt };
  }

  return { isDuplicate: false };
}

/**
 * SMS送信前の誤送信防止チェック結果
 */
export interface SendGuardResult {
  allowed: boolean;
  warnings: SendGuardWarning[];
  error?: { code: string; message: string };
}

export interface SendGuardWarning {
  type: 'duplicate_send' | 'dangerous_keywords';
  message: string;
  details?: Record<string, unknown>;
}

/**
 * レート制限ミドルウェア
 * SMS送信エンドポイントに適用し、レート制限を強制する。
 * リクエストボディから operatorId（または req.user.id）を取得する。
 */
export function createRateLimitMiddleware(store: RateLimitStore): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const operatorId = req.user?.id;

    if (!operatorId) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: '認証が必要です。',
        },
      });
      return;
    }

    if (isRateLimited(store, operatorId)) {
      res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `送信レート制限を超えました。1分あたり${RATE_LIMIT.maxSendsPerWindow}件までです。`,
        },
      });
      return;
    }

    // 送信を記録してから次へ
    recordSend(store, operatorId);
    next();
  };
}

/**
 * 重複送信警告ミドルウェア
 * 同一番号への5分以内の再送信を検出し、警告をレスポンスヘッダーに付与する。
 * ブロックはせず、警告のみ。
 */
export function createDuplicateSendMiddleware(prisma: PrismaClient): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const operatorId = req.user?.id;
    const recipientPhone = req.body?.to;

    if (!operatorId || !recipientPhone) {
      next();
      return;
    }

    try {
      const result = await checkDuplicateSend(prisma, operatorId, recipientPhone);

      if (result.isDuplicate) {
        // 警告情報をリクエストに付与（ブロックはしない）
        (req as any).sendWarnings = (req as any).sendWarnings ?? [];
        (req as any).sendWarnings.push({
          type: 'duplicate_send' as const,
          message: `この番号には${Math.floor(DUPLICATE_SEND_WINDOW_MS / 60_000)}分以内に送信済みです。`,
          details: { lastSentAt: result.lastSentAt },
        });
      }
    } catch {
      // DB エラーは送信をブロックしない
    }

    next();
  };
}

/**
 * 危険キーワード検出ミドルウェア
 * メッセージ本文に危険キーワードが含まれている場合、警告をリクエストに付与する。
 * ブロックはせず、警告のみ。
 */
export function createKeywordCheckMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const messageBody = req.body?.body;

    if (!messageBody || typeof messageBody !== 'string') {
      next();
      return;
    }

    const result = detectDangerousKeywords(messageBody);

    if (result.detected) {
      (req as any).sendWarnings = (req as any).sendWarnings ?? [];
      (req as any).sendWarnings.push({
        type: 'dangerous_keywords' as const,
        message: `危険なキーワードが検出されました: ${result.keywords.join(', ')}`,
        details: { keywords: result.keywords },
      });
    }

    next();
  };
}
