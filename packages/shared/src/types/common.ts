/**
 * 共通型定義
 */

/** ページネーション結果 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
