'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Template, Folder } from '@zendesk-sms-tool/shared';
import {
  TemplateSearch,
  TemplateList,
  TemplatePreview,
  TemplateForm,
  TemplateActions,
} from '../../components/template';
import type { TemplateFormData } from '../../components/template';
import FolderPanel from '../../components/template/FolderPanel';
import {
  searchTemplates,
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  duplicateTemplate,
  toggleFavorite,
  getFolders,
  createFolder,
  updateFolder as updateFolderApi,
  deleteFolder as deleteFolderApi,
  moveFolder as moveFolderApi,
  reorderTemplates,
  getFavorites,
} from '../../lib/api-client';

type FormMode = 'closed' | 'create';

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<FormMode>('closed');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoadError(null);
    try {
      const filters: Record<string, string> = {};
      if (searchQuery) filters.keyword = searchQuery;
      if (selectedFolderId) {
        filters.folderId = selectedFolderId;
      }
      const result = searchQuery
        ? await searchTemplates({ keyword: searchQuery })
        : await getTemplates(filters);
      setTemplates(result.items ?? []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'テンプレートの取得に失敗しました';
      setLoadError(msg);
      setTemplates([]);
    }
  }, [searchQuery, selectedFolderId]);

  const loadFolders = useCallback(async () => {
    try {
      const result = await getFolders();
      setFolders(result);
    } catch {
      // Silently fail - folders are optional
    }
  }, []);

  const loadFavorites = useCallback(async () => {
    try {
      const result = await getFavorites();
      setFavorites(new Set(result.items));
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);
  useEffect(() => { loadFolders(); loadFavorites(); }, [loadFolders, loadFavorites]);

  const clearActionError = useCallback(() => setActionError(null), []);

  const handleCreateFolder = useCallback(async (name: string, parentId?: string | null) => {
    try {
      await createFolder(name, parentId);
      await loadFolders();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'フォルダの作成に失敗しました');
    }
  }, [loadFolders]);

  const handleUpdateFolder = useCallback(async (id: string, name: string) => {
    try {
      await updateFolderApi(id, name);
      await loadFolders();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'フォルダの更新に失敗しました');
    }
  }, [loadFolders]);

  const handleMoveFolder = useCallback(async (id: string, parentId: string | null) => {
    try {
      await moveFolderApi(id, parentId);
      await loadFolders();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'フォルダの移動に失敗しました');
    }
  }, [loadFolders]);

  const handleDeleteFolder = useCallback(async (id: string) => {
    try {
      await deleteFolderApi(id);
      if (selectedFolderId === id) setSelectedFolderId(null);
      await loadFolders();
      await loadTemplates();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'フォルダの削除に失敗しました');
    }
  }, [selectedFolderId, loadFolders, loadTemplates]);

  const handleCreate = useCallback(async (data: TemplateFormData) => {
    clearActionError();
    try {
      // 選択中のフォルダ内に作成（uncategorizedやnullの場合はfolderId無し）
      const folderId = selectedFolderId ? selectedFolderId : undefined;
      await createTemplate({ ...data, folderId } as any);
      setFormMode('closed');
      await loadTemplates();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'テンプレートの作成に失敗しました');
    }
  }, [loadTemplates, clearActionError, selectedFolderId]);

  const handleDelete = useCallback(async (id: string) => {
    clearActionError();
    try {
      await deleteTemplate(id);
      if (selectedTemplate?.id === id) setSelectedTemplate(null);
      await loadTemplates();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'テンプレートの削除に失敗しました');
    }
  }, [selectedTemplate, loadTemplates, clearActionError]);

  const handleDuplicate = useCallback(async (id: string) => {
    clearActionError();
    try {
      await duplicateTemplate(id, '');
      await loadTemplates();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'テンプレートの複製に失敗しました');
    }
  }, [loadTemplates, clearActionError]);

  const handleToggleFavorite = useCallback(async (id: string) => {
    clearActionError();
    try {
      const result = await toggleFavorite(id);
      setFavorites((prev) => {
        const next = new Set(prev);
        if (result.favorited) next.add(id);
        else next.delete(id);
        return next;
      });
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'お気に入りの切り替えに失敗しました');
    }
  }, [clearActionError]);

  const handleReorder = useCallback(async (items: Array<{ id: string; sortOrder: number }>) => {
    try {
      await reorderTemplates(items);
      await loadTemplates();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : '並び替えに失敗しました');
    }
  }, [loadTemplates]);

  const handleUpdateTemplate = useCallback(async (id: string, field: 'name' | 'body', value: string) => {
    await updateTemplate(id, { [field]: value });
    await loadTemplates();
    if (selectedTemplate?.id === id) {
      setSelectedTemplate(prev => prev ? { ...prev, [field]: value } : null);
    }
  }, [loadTemplates, selectedTemplate]);

  const handleFormCancel = useCallback(() => {
    setFormMode('closed');
    clearActionError();
  }, [clearActionError]);

  const handleCreateTemplateInFolder = useCallback((folderId: string) => {
    setSelectedFolderId(folderId);
    setFormMode('create');
    clearActionError();
  }, [clearActionError]);

  const sectionStyle: React.CSSProperties = {
    background: '#fff',
    borderRadius: '8px',
    padding: '16px 20px',
    border: '1px solid #e0e0e0',
  };

  return (
    <div style={{ display: 'flex', gap: '0', height: 'calc(100vh - 120px)' }}>
      <FolderPanel
        folders={folders}
        selectedFolderId={selectedFolderId}
        onSelectFolder={setSelectedFolderId}
        onCreateFolder={handleCreateFolder}
        onUpdateFolder={handleUpdateFolder}
        onDeleteFolder={handleDeleteFolder}
        onMoveFolder={handleMoveFolder}
        onCreateTemplateInFolder={handleCreateTemplateInFolder}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', padding: '20px', overflowY: 'auto' }}>
        <section style={sectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#555', margin: 0 }}>
              テンプレート管理
            </h2>
            {formMode === 'closed' && (
              <button
                type="button"
                onClick={() => { setFormMode('create'); clearActionError(); }}
                style={{
                  padding: '6px 14px', fontSize: '13px', border: 'none',
                  borderRadius: '6px', background: '#1976d2', color: '#fff', cursor: 'pointer',
                }}
              >
                + 新規作成{selectedFolderId ? `（${folders.find(f => f.id === selectedFolderId)?.name ?? ''}内）` : ''}
              </button>
            )}
          </div>
          <TemplateSearch value={searchQuery} onChange={setSearchQuery} />
        </section>

        {(loadError || actionError) && (
          <div role="alert" style={{
            padding: '12px 16px', background: '#ffebee', border: '1px solid #ef9a9a',
            borderRadius: '6px', color: '#c62828', fontSize: '14px',
          }}>
            {loadError || actionError}
          </div>
        )}

        {formMode === 'create' && (
          <section style={sectionStyle}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#555', marginBottom: '8px' }}>
              テンプレート作成
            </h3>
            <TemplateForm onSubmit={handleCreate} onCancel={handleFormCancel} />
          </section>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', flex: 1 }}>
          <section style={sectionStyle}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#555', marginBottom: '8px' }}>
              テンプレート一覧
            </h3>
            <div style={{ maxHeight: '500px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '6px' }}>
              <TemplateList
                templates={templates}
                onSelect={setSelectedTemplate}
                selectedId={selectedTemplate?.id}
                favoriteIds={favorites}
                onToggleFavorite={handleToggleFavorite}
                onReorder={handleReorder}
                onUpdateTemplate={handleUpdateTemplate}
              />
            </div>
          </section>

          <section style={sectionStyle}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#555', marginBottom: '8px' }}>
              プレビュー
            </h3>
            <TemplatePreview template={selectedTemplate} />
            {selectedTemplate && (
              <div style={{ marginTop: '12px', borderTop: '1px solid #eee', paddingTop: '12px' }}>
                <TemplateActions
                  template={selectedTemplate}
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
                />
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
