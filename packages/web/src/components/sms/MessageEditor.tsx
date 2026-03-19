'use client';

/**
 * MessageEditor - メッセージ編集エリア
 * Requirements: 1.5
 *
 * 文字数カウント付きテキストエリア。
 * SMS日本語は通常70文字が目安。空メッセージ時にエラー表示。
 */

export interface MessageEditorProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

const SMS_CHAR_LIMIT = 70;

export function MessageEditor({ value, onChange, error }: MessageEditorProps) {
  const charCount = value.length;
  const isOverLimit = charCount > SMS_CHAR_LIMIT;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label
        htmlFor="message-editor"
        style={{ fontSize: '13px', fontWeight: 600, color: '#333' }}
      >
        メッセージ本文
      </label>
      <textarea
        id="message-editor"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="メッセージを入力してください"
        rows={5}
        aria-invalid={!!error}
        aria-describedby="message-info"
        style={{
          padding: '8px 12px',
          fontSize: '14px',
          border: `1px solid ${error ? '#d32f2f' : '#ccc'}`,
          borderRadius: '6px',
          outline: 'none',
          resize: 'vertical',
          fontFamily: 'inherit',
          lineHeight: '1.5',
          transition: 'border-color 0.15s',
        }}
      />
      <div
        id="message-info"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '12px',
        }}
      >
        {error ? (
          <span role="alert" style={{ color: '#d32f2f' }}>{error}</span>
        ) : (
          <span />
        )}
        <span style={{ color: isOverLimit ? '#e65100' : '#888' }}>
          {charCount} / {SMS_CHAR_LIMIT}文字
        </span>
      </div>
    </div>
  );
}
