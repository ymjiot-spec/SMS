/**
 * テンプレート関連の型定義
 * Requirements: 2.1, 2.2, 2.7, 3.1, 3.4
 */

/** テンプレートの公開範囲 */
export type TemplateVisibility = 'company' | 'personal' | 'global';

/** テンプレート */
export interface Template {
  id: string;
  name: string;
  body: string;
  companyId?: string | null;
  brand?: string | null;
  purpose?: string | null;
  department?: string | null;
  visibility: TemplateVisibility;
  createdBy: string;
  lastUsedAt?: Date | null;
  folderId?: string | null;   // 所属フォルダID（nullは未分類）
  sortOrder?: number;          // 表示順（0始まり、小さいほど上）
  createdAt: Date;
  updatedAt: Date;
}

/** テンプレート作成入力 */
export interface CreateTemplateInput {
  name: string;
  body: string;
  companyId?: string;
  brand?: string;
  purpose?: string;
  department?: string;
  visibility?: TemplateVisibility;
}

/** テンプレート更新入力 */
export interface UpdateTemplateInput {
  name?: string;
  body?: string;
  companyId?: string;
  brand?: string;
  purpose?: string;
  department?: string;
  visibility?: TemplateVisibility;
}

/** テンプレート検索クエリ */
export interface TemplateSearchQuery {
  keyword?: string;
  companyId?: string;
  brand?: string;
  purpose?: string;
  department?: string;
  visibility?: TemplateVisibility;
  page?: number;
  limit?: number;
}

/** テンプレートレンダリング結果 */
export interface RenderResult {
  rendered: string;
  unresolvedVars: string[];
}

/** テンプレートバリデーション結果 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** フォルダ */
export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/** フォルダ作成入力 */
export interface CreateFolderInput {
  name: string;
  parentId?: string | null;
}

/** フォルダ更新入力 */
export interface UpdateFolderInput {
  name?: string;
  parentId?: string | null;
}
