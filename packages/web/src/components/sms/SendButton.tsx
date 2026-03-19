'use client';

/**
 * SendButton - 送信ボタン
 * Requirements: 1.1, 1.6
 *
 * プライマリ送信ボタン。ローディング状態対応。
 */

export interface SendButtonProps {
  onClick: () => void;
  disabled: boolean;
  loading?: boolean;
}

export function SendButton({ onClick, disabled, loading }: SendButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading}
      style={{
        padding: '10px 32px',
        background: disabled || loading ? '#90caf9' : '#0066cc',
        color: '#fff',
        border: 'none',
        borderRadius: '6px',
        fontSize: '14px',
        fontWeight: 600,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        transition: 'background 0.15s',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
      }}
    >
      {loading && (
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: '14px',
            height: '14px',
            border: '2px solid rgba(255,255,255,0.3)',
            borderTopColor: '#fff',
            borderRadius: '50%',
            animation: 'spin 0.6s linear infinite',
          }}
        />
      )}
      {loading ? '送信中...' : 'SMS送信'}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}
