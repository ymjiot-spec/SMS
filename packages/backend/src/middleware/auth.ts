/**
 * 認証・認可ミドルウェア
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
 *
 * - authMiddleware: リクエストからユーザーを特定し req.user にアタッチ
 * - requireRole: ロール階層に基づく認可チェック
 * - hasPermission: ロール階層の比較ヘルパー
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { UserRole, User } from '@zendesk-sms-tool/shared';
import type { AuditService } from '../services/audit-service.js';

/**
 * Express Request にユーザー情報を拡張
 */
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/**
 * ロール階層の数値マッピング（大きいほど上位権限）
 * OPERATOR < SUPERVISOR < SYSTEM_ADMIN
 */
const ROLE_HIERARCHY: Record<UserRole, number> = {
  OPERATOR: 1,
  SUPERVISOR: 2,
  SYSTEM_ADMIN: 3,
};

/**
 * ユーザーのロールが要求ロール以上かどうかを判定する
 */
export function hasPermission(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

/**
 * 認証ミドルウェア
 * X-User-Id ヘッダーからユーザーを特定し、req.user にアタッチする。
 * 有効なユーザーが見つからない場合は 401 を返す。
 */
export function createAuthMiddleware(prisma: PrismaClient): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.headers['x-user-id'];

    if (!userId || typeof userId !== 'string') {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: '認証が必要です。X-User-Id ヘッダーを指定してください。',
        },
      });
      return;
    }

    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });

      if (!user) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'ユーザーが見つかりません。',
          },
        });
        return;
      }

      req.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role as UserRole,
        companyId: user.companyId,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };

      next();
    } catch {
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: '認証処理中にエラーが発生しました。',
        },
      });
    }
  };
}

/**
 * 認可ミドルウェア
 * 指定されたロール（またはそれ以上の権限）を持つユーザーのみアクセスを許可する。
 * ロール階層: OPERATOR ⊂ SUPERVISOR ⊂ SYSTEM_ADMIN
 * 権限拒否時は監査ログに記録する。
 */
export function requireRole(auditService: AuditService, ...roles: UserRole[]): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = req.user;

    if (!user) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: '認証が必要です。',
        },
      });
      return;
    }

    // 要求ロールの中で最も低い権限レベルを基準にする
    const minRequiredLevel = Math.min(...roles.map((r) => ROLE_HIERARCHY[r]));
    const userLevel = ROLE_HIERARCHY[user.role];

    if (userLevel >= minRequiredLevel) {
      next();
      return;
    }

    // 権限拒否 → 監査ログ記録
    try {
      await auditService.log({
        userId: user.id,
        action: 'permission_denied',
        resourceType: req.baseUrl + req.path,
        details: {
          attemptedAction: `${req.method} ${req.baseUrl}${req.path}`,
          requiredRoles: roles,
          actualRole: user.role,
        },
        ipAddress: req.ip,
      });
    } catch {
      // 監査ログ記録失敗はリクエスト処理をブロックしない
    }

    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'この操作を実行する権限がありません。',
        details: {
          requiredRoles: roles.join(', '),
          currentRole: user.role,
        },
      },
    });
  };
}
