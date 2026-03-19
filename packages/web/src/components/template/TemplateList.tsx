'use client';

/**
 * TemplateList - テンプレート一覧表示コンポーネント
 * Requirements: 2.3, 3.1, 3.2, 3.4, 4.1, 4.2, 4.3, 4.6, 5.1, 5.2, 5.5, 5.6
 *
 * テンプレート一覧を表示し、選択状態をハイライトする。
 * ドラッグ&ドロップ並び替え、お気に入り固定表示、InlineEditor統合を提供。
 */

import { useState } from 'react';
import type { Template } from '@zendesk-sms-tool/shared';
import InlineEditor from './InlineEditor';

export interface TemplateListProps {
  templates: Template[];
  onSelect: (template: Template) => void;
  selectedId?: string;
  favoriteIds?: Set<string>;
  onToggleFavorite?: (id: string) => void;
  onReorder?: (items: Array<{ id: string; sortOrder: number }>) => void;
  onUpdateTemplate?: (id: string, field: 'name' | 'body', value: string) => Promise<void>;
}

export function TemplateList({
  templates,
  onSelect,
  selectedId,
  favoriteIds = new Set(),
  onToggleFavorite,
  onReorder,
  onUpdateTemplate,
}: TemplateListProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  if (!templates || templates.length === 0) {
    return (
      <div
        role="status"
        style={{ padding: '24px', textAlign: 'center', color: '#888', fontSize: '14px' }}
      >
        テンプレートがありません
      </div>
    );
  }

  const favorites = templates.filter(t => favoriteIds.has(t.id));
  const others = templates.filter(t => !favoriteIds.has(t.id));

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(id);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain');
    if (!sourceId || sourceId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }

    const allItems = [...favorites, ...others];
    const sourceIdx = allItems.findIndex(t => t.id === sourceId);
    const targetIdx = allItems.findIndex(t => t.id === targetId);
    if (sourceIdx === -1 || targetIdx === -1) return;

    const reordered = [...allItems];
    const [moved] = reordered.splice(sourceIdx, 1);
    reordered.splice(targetIdx, 0, moved);

    onReorder?.(reordered.map((t, i) => ({ id: t.id, sortOrder: i })));
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  const renderRow = (tpl: Template) => {
    const isSelected = tpl.id === selectedId;
    const isDragged = tpl.id === draggedId;
    const isDragOver = tpl.id === dragOverId;
    const isFav = favoriteIds.has(tpl.id);

    return (
      <li
        key={tpl.id}
        role="option"
        aria-selected={isSelected}
        draggable
        onDragStart={(e) => handleDragStart(e, tpl.id)}
        onDragOver={(e) => handleDragOver(e, tpl.id)}
        onDrop={(e) => handleDrop(e, tpl.id)}
        onDragEnd={handleDragEnd}
        style={{
          padding: '10px 12px',
          borderBottom: '1px solid #eee',
          backgroundColor: isDragOver
            ? '#dbeafe'
            : isSelected
              ? '#e3f2fd'
              : isDragged
                ? '#f3f4f6'
                : 'transparent',
          opacity: isDragged ? 0.5 : 1,
          transition: 'background-color 0.15s',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px',
        }}
      >
        {/* Drag handle */}
        <div
          style={{
            cursor: 'grab',
            color: '#9ca3af',
            fontSize: '16px',
            padding: '2px 0',
            userSelect: 'none',
            flexShrink: 0,
          }}
          title="ドラッグして並び替え"
        >
          ⠿
        </div>

        {/* Star toggle */}
        {onToggleFavorite && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(tpl.id);
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px',
              fontSize: '16px',
              color: isFav ? '#f59e0b' : '#d1d5db',
              flexShrink: 0,
            }}
            title={isFav ? 'お気に入り解除' : 'お気に入りに追加'}
          >
            {isFav ? '★' : '☆'}
          </button>
        )}

        {/* Content - 題名のみ表示 */}
        <div style={{ flex: 1, minWidth: 0 }} onClick={() => onSelect(tpl)}>
          {onUpdateTemplate ? (
            <InlineEditor
              value={tpl.name}
              field="name"
              onSave={async (val) => onUpdateTemplate(tpl.id, 'name', val)}
              placeholder="テンプレート名"
            />
          ) : (
            <div style={{ fontWeight: 600, fontSize: '14px', color: '#222' }}>
              {tpl.name}
            </div>
          )}
        </div>
      </li>
    );
  };

  return (
    <div>
      {favorites.length > 0 && (
        <>
          <div
            style={{
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: 700,
              color: '#f59e0b',
              backgroundColor: '#fffbeb',
              borderBottom: '1px solid #fde68a',
            }}
          >
            ★ お気に入り
          </div>
          <ul
            role="listbox"
            aria-label="お気に入りテンプレート"
            style={{ listStyle: 'none', margin: 0, padding: 0 }}
          >
            {favorites.map(renderRow)}
          </ul>
          <div style={{ borderBottom: '2px solid #e5e7eb', margin: '0' }} />
        </>
      )}
      <ul
        role="listbox"
        aria-label="テンプレート一覧"
        style={{ listStyle: 'none', margin: 0, padding: 0 }}
      >
        {others.map(renderRow)}
      </ul>
    </div>
  );
}
