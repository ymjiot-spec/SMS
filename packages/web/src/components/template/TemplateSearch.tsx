'use client';

/**
 * TemplateSearch - テンプレート検索コンポーネント
 * Requirements: 2.3
 *
 * キーワード入力でテンプレートをフィルタリングする検索UI。
 */

export interface TemplateSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function TemplateSearch({ value, onChange }: TemplateSearchProps) {
  return (
    <div style={{ position: 'relative' }}>
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: '10px',
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: '14px',
          color: '#999',
          pointerEvents: 'none',
        }}
      >
        🔍
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="テンプレートを検索..."
        aria-label="テンプレートを検索"
        style={{
          width: '100%',
          padding: '8px 12px 8px 32px',
          fontSize: '14px',
          border: '1px solid #ccc',
          borderRadius: '6px',
          outline: 'none',
          boxSizing: 'border-box',
          transition: 'border-color 0.15s',
        }}
      />
    </div>
  );
}
