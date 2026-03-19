'use client';

import { useState, useRef, useEffect } from 'react';

interface InlineEditorProps {
  value: string;
  field: 'name' | 'body';
  onSave: (value: string) => Promise<void>;
  onCancel?: () => void;
  placeholder?: string;
}

/** Validate {{variable_name}} patterns in text */
function validateVariables(text: string): string | null {
  // Find all {{ ... }} patterns
  const pattern = /\{\{([^}]*)\}\}/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const inner = match[1];
    // Must be non-empty and match variable_name format (letters, numbers, underscores)
    if (!inner || !inner.trim() || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(inner.trim())) {
      return `無効な変数フォーマット: ${match[0]}`;
    }
  }
  // Check for unclosed {{ without }}
  const openCount = (text.match(/\{\{/g) || []).length;
  const closeCount = (text.match(/\}\}/g) || []).length;
  if (openCount !== closeCount) {
    return '変数の括弧が閉じられていません';
  }
  return null;
}

export default function InlineEditor({
  value,
  field,
  onSave,
  onCancel,
  placeholder,
}: InlineEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const startEdit = () => {
    setEditValue(value);
    setError(null);
    setIsEditing(true);
  };

  const cancel = () => {
    setIsEditing(false);
    setEditValue(value);
    setError(null);
    onCancel?.();
  };

  const save = async () => {
    if (editValue === value) {
      setIsEditing(false);
      return;
    }
    // Validate variables for body field
    if (field === 'body') {
      const validationError = validateVariables(editValue);
      if (validationError) {
        setError(validationError);
        return;
      }
    }
    setSaving(true);
    try {
      await onSave(editValue);
      setIsEditing(false);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      cancel();
      return;
    }
    if (field === 'name' && e.key === 'Enter') {
      e.preventDefault();
      save();
    }
    if (field === 'body' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      save();
    }
  };

  if (!isEditing) {
    return (
      <div
        onClick={startEdit}
        style={{
          cursor: 'pointer',
          padding: field === 'body' ? '8px' : '4px 8px',
          borderRadius: '4px',
          minHeight: field === 'body' ? '60px' : 'auto',
          whiteSpace: field === 'body' ? 'pre-wrap' : 'nowrap',
          color: value ? '#1f2937' : '#9ca3af',
          fontSize: field === 'name' ? '15px' : '14px',
          fontWeight: field === 'name' ? 600 : 400,
          lineHeight: '1.5',
          transition: 'background-color 0.15s',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '#f3f4f6'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && startEdit()}
        title="クリックして編集"
      >
        {value || placeholder || '(空)'}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      {field === 'name' ? (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
          value={editValue}
          onChange={(e) => { setEditValue(e.target.value); setError(null); }}
          onKeyDown={handleKeyDown}
          onBlur={save}
          disabled={saving}
          style={{
            width: '100%',
            padding: '4px 8px',
            fontSize: '15px',
            fontWeight: 600,
            border: '2px solid #3b82f6',
            borderRadius: '4px',
            outline: 'none',
            backgroundColor: '#fff',
          }}
        />
      ) : (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={editValue}
          onChange={(e) => { setEditValue(e.target.value); setError(null); }}
          onKeyDown={handleKeyDown}
          onBlur={save}
          disabled={saving}
          rows={4}
          style={{
            width: '100%',
            padding: '8px',
            fontSize: '14px',
            border: '2px solid #3b82f6',
            borderRadius: '4px',
            outline: 'none',
            resize: 'vertical',
            fontFamily: 'inherit',
            lineHeight: '1.5',
            backgroundColor: '#fff',
          }}
        />
      )}
      {error && (
        <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px', padding: '0 4px' }}>
          {error}
        </div>
      )}
      <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px', padding: '0 4px' }}>
        {field === 'name' ? 'Enter で保存 / Esc でキャンセル' : 'Ctrl+Enter で保存 / Esc でキャンセル'}
      </div>
    </div>
  );
}

export { validateVariables };
