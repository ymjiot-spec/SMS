'use client';

/**
 * TemplateActions - テンプレートアクションコンポーネント
 * Requirements: 5.7, 1.1
 *
 * 複製、削除ボタン。
 * 削除時はインライン確認ダイアログを表示。
 * 最終使用日時を表示。
 * 「編集」ボタンはインライン編集に置換のため削除。
 * お気に入りボタンは TemplateList の行内に移動済みのため削除。
 */

import { useState, useCallback } from 'react';
import type { Template } from '@zendesk-sms-tool/shared';

export interface TemplateActionsProps {
  template: Template;
  onDelete: (templateId: string) => void;
  onDuplicate: (templateId: string) => void;
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '未使用';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '未使用';
  return d.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const btnBase: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: '12px',
  border: '1px solid #ccc',
  borderRadius: '4px',
  background: '#fff',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

export function TemplateActions({ template, onDelete, onDuplicate }: TemplateActionsProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDeleteClick = useCallback(() => setShowDeleteConfirm(true), []);
  const handleDeleteConfirm = useCallback(() => {
    setShowDeleteConfirm(false);
    onDelete(template.id);
  }, [onDelete, template.id]);
  const handleDeleteCancel = useCallback(() => setShowDeleteConfirm(false), []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* 最終使用日時 */}
      <div style={{ fontSize: '11px', color: '#888' }}>
        最終使用: {formatDate(template.lastUsedAt)}
      </div>

      {/* アクションボタン */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => onDuplicate(template.id)}
          aria-label="テンプレートを複製"
          style={{ ...btnBase, borderColor: '#388e3c', color: '#388e3c' }}
        >
          複製
        </button>

        <button
          type="button"
          onClick={handleDeleteClick}
          aria-label="テンプレートを削除"
          style={{ ...btnBase, borderColor: '#c62828', color: '#c62828' }}
        >
          削除
        </button>
      </div>

      {/* 削除確認ダイアログ（インライン） */}
      {showDeleteConfirm && (
        <div
          role="alertdialog"
          aria-label="削除確認"
          style={{
            padding: '10px 12px',
            background: '#fff3e0',
            border: '1px solid #ffb74d',
            borderRadius: '6px',
            fontSize: '13px',
          }}
        >
          <div style={{ marginBottom: '8px', color: '#e65100' }}>
            「{template.name}」を削除しますか？この操作は取り消せません。
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={handleDeleteConfirm}
              style={{
                ...btnBase,
                background: '#c62828',
                color: '#fff',
                border: 'none',
              }}
            >
              削除する
            </button>
            <button
              type="button"
              onClick={handleDeleteCancel}
              style={btnBase}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
