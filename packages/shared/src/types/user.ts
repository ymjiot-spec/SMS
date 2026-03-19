/**
 * ユーザー関連の型定義
 * Requirements: 11.1
 */

/** ユーザーロール */
export type UserRole = 'OPERATOR' | 'SUPERVISOR' | 'SYSTEM_ADMIN';

/** ユーザー */
export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  role: UserRole;
  companyId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
