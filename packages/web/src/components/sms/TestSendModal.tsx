'use client';

/**
 * TestSendModal - テスト送信用の電話番号入力モーダル
 *
 * テスト送信時に使用するカスタム電話番号を入力するためのモーダル。
 */

import { useState, useEffect } from 'react';
import { validateJapanesePhoneNumber } from '@zendesk-sms-tool/shared';

export interface TestSendModalProps {
  open: boolean;
  onConfirm: (phone: string) => void;
  onCancel: () => void;
  message: string;
}

export function TestSendModal({
  open,
  onConfirm,
  onCancel,
  message,
}: TestSendModalProps) {
  const [testPhone, setTestPhone] = useState('');
  const [error, setError] = useState('');

  // モーダルが開くたびに状態をリセットする
  useEffect(() => {
    if (open) {
      setTestPhone('');
      setError('');
    }
  }, [open]);

  if (!open) return null;

  const previewMessage = message.length > 100 ? message.slice(0, 100) + '…' : message;

  const handleConfirm = () => {
    if (!testPhone.trim()) {
      setError('テスト用電話番号を入力してください。');
      return;
    }

    if (!validateJapanesePhoneNumber(testPhone)) {
      setError('有効な日本の電話番号を入力してください。（例: 09012345678）');
      return;
    }

    onConfirm(testPhone);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="テスト送信"
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
          テスト送信
        </h2>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#555', marginBottom: '8px' }}>
            テスト用宛先番号
          </label>
          <input
            type="tel"
            value={testPhone}
            onChange={(e) => {
              setTestPhone(e.target.value);
              setError('');
            }}
            placeholder="09012345678 (ハイフンなしなし・あり両対応)"
            style={{
              width: '100%',
              padding: '10px 12px',
              fontSize: '14px',
              border: `1px solid ${error ? '#d32f2f' : '#ccc'}`,
              borderRadius: '6px',
              boxSizing: 'border-box',
            }}
          />
          {error && (
            <p style={{ color: '#d32f2f', fontSize: '12px', marginTop: '4px', marginBottom: 0 }}>
              {error}
            </p>
          )}
        </div>

        <dl style={{ fontSize: '14px', lineHeight: '1.8' }}>
          <dt style={{ fontWeight: 600, color: '#555' }}>メッセージプレビュー</dt>
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
            onClick={handleConfirm}
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
            テスト送信する
          </button>
        </div>
      </div>
    </div>
  );
}
