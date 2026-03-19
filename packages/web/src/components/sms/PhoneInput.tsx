'use client';

/**
 * PhoneInput - 電話番号入力コンポーネント
 * Requirements: 1.4, 10.1
 *
 * リアルタイムバリデーション付き電話番号入力。
 * 日本の携帯電話番号フォーマット（070/080/090、11桁）を検証する。
 */

import { validateJapanesePhoneNumber } from '@zendesk-sms-tool/shared';

export interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export function PhoneInput({ value, onChange, error }: PhoneInputProps) {
  const showError = value.length > 0 && !validateJapanesePhoneNumber(value);
  const displayError = error ?? (showError ? '有効な日本の携帯電話番号を入力してください（070/080/090 + 8桁）' : undefined);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label
        htmlFor="phone-input"
        style={{ fontSize: '13px', fontWeight: 600, color: '#333' }}
      >
        宛先電話番号
      </label>
      <input
        id="phone-input"
        type="tel"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="09012345678"
        aria-invalid={!!displayError}
        aria-describedby={displayError ? 'phone-error' : undefined}
        style={{
          padding: '8px 12px',
          fontSize: '14px',
          border: `1px solid ${displayError ? '#d32f2f' : '#ccc'}`,
          borderRadius: '6px',
          outline: 'none',
          transition: 'border-color 0.15s',
        }}
      />
      {displayError && (
        <span
          id="phone-error"
          role="alert"
          style={{ fontSize: '12px', color: '#d32f2f' }}
        >
          {displayError}
        </span>
      )}
    </div>
  );
}
