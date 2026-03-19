'use client';

import { useState, useCallback } from 'react';
import type { Folder } from '@zendesk-sms-tool/shared';

interface FolderPanelProps {
  folders: Folder[];
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onCreateFolder: (name: string, parentId?: string | null) => Promise<void>;
  onUpdateFolder: (id: string, name: string) => Promise<void>;
  onDeleteFolder: (id: string) => Promise<void>;
  onMoveFolder: (id: string, parentId: string | null) => Promise<void>;
  onCreateTemplateInFolder?: (folderId: string) => void;
}

export default function FolderPanel({
  folders,
  selectedFolderId,
  onSelectFolder,
  onCreateFolder,
  onUpdateFolder,
  onDeleteFolder,
  onMoveFolder,
  onCreateTemplateInFolder,
}: FolderPanelProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [creatingParentId, setCreatingParentId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newFolderName.trim()) return;
    await onCreateFolder(newFolderName.trim(), creatingParentId);
    setNewFolderName('');
    setIsCreating(false);
    if (creatingParentId) setExpandedIds(p => new Set([...p, creatingParentId]));
    setCreatingParentId(null);
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return;
    await onUpdateFolder(id, editName.trim());
    setEditingId(null);
    setEditName('');
  };

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(p => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }, []);

  const getChildren = useCallback((parentId: string | null): Folder[] =>
    folders.filter(f => ((f as any).parentId ?? null) === parentId),
  [folders]);

  // 子孫チェック
  const isDescendantOf = useCallback((ancestorId: string, checkId: string): boolean => {
    const kids = folders.filter(f => ((f as any).parentId ?? null) === ancestorId);
    return kids.some(c => c.id === checkId || isDescendantOf(c.id, checkId));
  }, [folders]);

  // --- D&D ---
  const onDragStart = useCallback((e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const onDragOver = useCallback((e: React.DragEvent, targetId: string | null) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (targetId !== dragOverId) setDragOverId(targetId);
  }, [dragOverId]);

  const onDragEnd = useCallback(() => {
    setDraggedId(null);
    setDragOverId(null);
  }, []);

  const onDrop = useCallback(async (e: React.DragEvent, targetId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverId(null);
    setDraggedId(null);
    const srcId = e.dataTransfer.getData('text/plain');
    if (!srcId || srcId === targetId) return;
    // 自分の子孫にはドロップ不可
    if (targetId && isDescendantOf(srcId, targetId)) return;
    await onMoveFolder(srcId, targetId);
    if (targetId) setExpandedIds(p => new Set([...p, targetId]));
  }, [onMoveFolder, isDescendantOf]);

  const renderFolder = (folder: Folder, depth: number): React.ReactNode => {
    const expanded = expandedIds.has(folder.id);
    const kids = getChildren(folder.id);
    const hasChildren = kids.length > 0;
    const selected = selectedFolderId === folder.id;
    const isDragOver = dragOverId === folder.id;
    const isDragged = draggedId === folder.id;

    return (
      <div key={folder.id} style={{ marginLeft: depth * 16 }}>
        <div
          draggable
          onDragStart={e => onDragStart(e, folder.id)}
          onDragOver={e => onDragOver(e, folder.id)}
          onDragLeave={() => setDragOverId(null)}
          onDrop={e => onDrop(e, folder.id)}
          onDragEnd={onDragEnd}
          style={{
            padding: '6px 8px',
            borderRadius: '6px',
            cursor: 'grab',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            backgroundColor: isDragOver ? '#dbeafe' : selected ? '#e0edff' : 'transparent',
            color: selected ? '#1a56db' : '#374151',
            fontWeight: selected ? 600 : 400,
            border: isDragOver ? '2px dashed #3b82f6' : '2px solid transparent',
            transition: 'background-color 0.15s',
            position: 'relative',
            opacity: isDragged ? 0.4 : 1,
          }}
        >
          {/* 展開/非展開 ▶ */}
          <button
            onClick={e => { e.stopPropagation(); if (hasChildren) toggleExpand(folder.id); }}
            style={{
              background: 'none', border: 'none',
              cursor: hasChildren ? 'pointer' : 'default',
              padding: 0, width: '16px', fontSize: '10px',
              color: hasChildren ? '#6b7280' : 'transparent',
              flexShrink: 0,
            }}
          >
            {hasChildren ? (expanded ? '▼' : '▶') : '·'}
          </button>

          {editingId === folder.id ? (
            <input
              type="text" value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleUpdate(folder.id);
                if (e.key === 'Escape') { setEditingId(null); setEditName(''); }
              }}
              onBlur={() => handleUpdate(folder.id)}
              autoFocus
              style={{ flex: 1, padding: '2px 6px', fontSize: '13px', border: '1px solid #d1d5db', borderRadius: '4px', outline: 'none' }}
            />
          ) : (
            <>
              <span onClick={() => onSelectFolder(folder.id)} style={{ flex: 1, fontSize: '13px', userSelect: 'none' }}>
                📁 {folder.name}
              </span>
              <span style={{ display: 'flex', gap: '2px', opacity: 0.3, fontSize: '11px', flexShrink: 0 }}>
                {/* ➕ = このフォルダ内にテンプレート作成 */}
                {onCreateTemplateInFolder && (
                  <button onClick={e => { e.stopPropagation(); onCreateTemplateInFolder(folder.id); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }} title="このフォルダにテンプレート作成">➕</button>
                )}
                <button onClick={e => { e.stopPropagation(); setEditingId(folder.id); setEditName(folder.name); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }} title="名前を編集">✏️</button>
                <button onClick={e => { e.stopPropagation(); setDeletingId(folder.id); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }} title="削除">🗑️</button>
              </span>
            </>
          )}

          {deletingId === folder.id && (
            <div onClick={e => e.stopPropagation()} style={{
              position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 10,
              background: '#fff3e0', border: '1px solid #ffb74d', borderRadius: '6px',
              padding: '8px 10px', fontSize: '12px', marginTop: '2px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            }}>
              <div style={{ color: '#e65100', marginBottom: '6px' }}>
                「{folder.name}」を削除？{hasChildren ? '（子フォルダも削除）' : ''}
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={() => { onDeleteFolder(folder.id); setDeletingId(null); }}
                  style={{ padding: '3px 8px', fontSize: '11px', background: '#c62828', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>削除</button>
                <button onClick={() => setDeletingId(null)}
                  style={{ padding: '3px 8px', fontSize: '11px', background: '#fff', color: '#333', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer' }}>キャンセル</button>
              </div>
            </div>
          )}
        </div>
        {expanded && kids.map(c => renderFolder(c, depth + 1))}
      </div>
    );
  };

  const rootFolders = getChildren(null);

  return (
    <div style={{ width: '240px', borderRight: '1px solid #e5e7eb', padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: '2px', height: '100%', backgroundColor: '#f9fafb', overflowY: 'auto' }}>
      <div style={{ fontSize: '12px', fontWeight: 700, color: '#6b7280', padding: '4px 8px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        フォルダ
      </div>

      {/* すべて */}
      <div
        onClick={() => onSelectFolder(null)}
        onDragOver={e => onDragOver(e, 'root')}
        onDragLeave={() => setDragOverId(null)}
        onDrop={e => onDrop(e, null)}
        role="button" tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && onSelectFolder(null)}
        style={{
          padding: '6px 8px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
          backgroundColor: selectedFolderId === null ? '#e0edff' : dragOverId === 'root' ? '#dbeafe' : 'transparent',
          color: selectedFolderId === null ? '#1a56db' : '#374151',
          fontWeight: selectedFolderId === null ? 600 : 400,
          border: dragOverId === 'root' ? '2px dashed #3b82f6' : '2px solid transparent',
        }}
      >
        📁 すべて
      </div>

      <div style={{ borderTop: '1px solid #e5e7eb', margin: '4px 0' }} />

      {rootFolders.map(f => renderFolder(f, 0))}

      {isCreating ? (
        <div style={{ padding: '4px 8px', marginLeft: creatingParentId ? 16 : 0 }}>
          <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '2px' }}>
            {creatingParentId ? `${folders.find(f => f.id === creatingParentId)?.name} 内` : '新規フォルダ'}
          </div>
          <input type="text" value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') { setIsCreating(false); setNewFolderName(''); setCreatingParentId(null); }
            }}
            onBlur={() => { if (newFolderName.trim()) handleCreate(); else { setIsCreating(false); setNewFolderName(''); setCreatingParentId(null); } }}
            placeholder="フォルダ名..." autoFocus
            style={{ width: '100%', padding: '4px 8px', fontSize: '13px', border: '1px solid #d1d5db', borderRadius: '4px', outline: 'none' }}
          />
        </div>
      ) : (
        <button onClick={() => { setCreatingParentId(null); setIsCreating(true); setNewFolderName(''); }}
          style={{ margin: '4px 8px', padding: '6px 10px', fontSize: '12px', color: '#6b7280', backgroundColor: 'transparent', border: '1px dashed #d1d5db', borderRadius: '6px', cursor: 'pointer', textAlign: 'center' }}>
          + 新規フォルダ
        </button>
      )}
    </div>
  );
}
