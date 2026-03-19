'use client';

/**
 * ConfirmModal - 送信確認モーダル
 * Requirements: 10.3
 *
 * 送信前に宛先番号・メッセージプレビューを表示して確認を求める。
 */

export interface ConfirmModalProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  phone: string;
  message: string;
  sendType?: string;
  templateName?: string;
}

export function ConfirmModal({
  open,
  onConfirm,
  onCancel,
  phone,
  message,
  sendType,
  templateName,
}: ConfirmModalProps) {
  if (!open) return null;

  const previewMessage = message.length > 100 ? message.slice(0, 100) + '…' : message;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="送信確認"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onCancel}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.4)',
        }}
      />

      {/* Modal content */}
      <div
        style={{
          position: 'relative',
          background: '#fff',
          borderRadius: '8px',
          padding: '24px',
          maxWidth: '480px',
          width: '90%',
          boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
        }}
      >
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
          送信確認
        </h2>

        <dl style={{ fontSize: '14px', lineHeight: '1.8' }}>
          <dt style={{ fontWeight: 600, color: '#555' }}>宛先番号</dt>
          <dd style={{ marginLeft: 0, marginBottom: '8px' }}>{phone}</dd>

          {sendType && (
            <>
              <dt style={{ fontWeight: 600, color: '#555' }}>送信種別</dt>
              <dd style={{ marginLeft: 0, marginBottom: '8px' }}>{sendType}</dd>
            </>
          )}

          {templateName && (
            <>
              <dt style={{ fontWeight: 600, color: '#555' }}>テンプレート</dt>
              <dd style={{ marginLeft: 0, marginBottom: '8px' }}>{templateName}</dd>
            </>
          )}

          <dt style={{ fontWeight: 600, color: '#555' }}>メッセージ</dt>
          <dd
            style={{
              marginLeft: 0,
              marginBottom: '16px',
              padding: '8px 12px',
              background: '#f9f9f9',
              borderRadius: '4px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {previewMessage}
          </dd>
        </dl>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '8px 20px',
              background: '#fff',
              color: '#333',
              border: '1px solid #ccc',
              borderRadius: '6px',
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: '8px 20px',
              background: '#0066cc',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            送信する
          </button>
        </div>
      </div>
    </div>
  );
}
