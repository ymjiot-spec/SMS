'use client';

/**
 * HistoryExport - CSVエクスポートボタン
 * Requirements: 9.3
 *
 * フィルタ結果をCSVとしてエクスポートするボタン。
 */

export interface HistoryExportProps {
  onClick: () => void;
  disabled?: boolean;
}

export function HistoryExport({ onClick, disabled }: HistoryExportProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="CSVエクスポート"
      style={{
        padding: '6px 16px',
        background: disabled ? '#e0e0e0' : '#fff',
        color: disabled ? '#999' : '#333',
        border: `1px solid ${disabled ? '#e0e0e0' : '#ccc'}`,
        borderRadius: '4px',
        fontSize: '13px',
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        transition: 'background 0.15s',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: '15px' }}>⬇</span>
      CSVエクスポート
    </button>
  );
}
