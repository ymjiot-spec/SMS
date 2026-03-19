'use client';

/**
 * TemplateForm - テンプレート作成・編集フォーム
 * Requirements: 2.1, 2.7
 *
 * テンプレートの作成・編集フォーム。変数フォーマットバリデーション付き。
 * mode: template が渡されれば編集モード、なければ作成モード。
 */

import { useState, useCallback } from 'react';
import type { Template, TemplateVisibility } from '@zendesk-sms-tool/shared';
import { validateVariableFormat } from '@zendesk-sms-tool/shared';

export interface TemplateFormProps {
  template?: Template;
  onSubmit: (data: TemplateFormData) => void;
  onCancel: () => void;
}

export interface TemplateFormData {
  name: string;
  body: string;
  companyId?: string;
  brand?: string;
  purpose?: string;
  department?: string;
  visibility: TemplateVisibility;
}

const VISIBILITY_OPTIONS: { value: TemplateVisibility; label: string }[] = [
  { value: 'company', label: '企業内' },
  { value: 'personal', label: '個人' },
  { value: 'global', label: 'グローバル' },
];

export function TemplateForm({ template, onSubmit, onCancel }: TemplateFormProps) {
  const isEdit = !!template;

  const [name, setName] = useState(template?.name ?? '');
  const [body, setBody] = useState(template?.body ?? '');
  const [companyId, setCompanyId] = useState(template?.companyId ?? '');
  const [brand, setBrand] = useState(template?.brand ?? '');
  const [purpose, setPurpose] = useState(template?.purpose ?? '');
  const [department, setDepartment] = useState(template?.department ?? '');
  const [visibility, setVisibility] = useState<TemplateVisibility>(template?.visibility ?? 'company');
  const [bodyErrors, setBodyErrors] = useState<string[]>([]);

  const handleBodyChange = useCallback((value: string) => {
    setBody(value);
    const result = validateVariableFormat(value);
    setBodyErrors(result.errors);
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim() || !body.trim()) return;
      const result = validateVariableFormat(body);
      if (!result.valid) {
        setBodyErrors(result.errors);
        return;
      }
      onSubmit({
        name: name.trim(),
        body,
        companyId: companyId || undefined,
        brand: brand || undefined,
        purpose: purpose || undefined,
        department: department || undefined,
        visibility,
      });
    },
    [name, body, companyId, brand, purpose, department, visibility, onSubmit],
  );

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '12px',
    fontWeight: 600,
    color: '#555',
    marginBottom: '4px',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    fontSize: '14px',
    border: '1px solid #ccc',
    borderRadius: '6px',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const fieldGap: React.CSSProperties = { marginBottom: '12px' };

  return (
    <form onSubmit={handleSubmit} style={{ padding: '4px 0' }}>
      <div style={fieldGap}>
        <label style={labelStyle}>テンプレート名 *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="テンプレート名を入力"
          aria-label="テンプレート名"
          style={inputStyle}
        />
      </div>

      <div style={fieldGap}>
        <label style={labelStyle}>本文 *</label>
        <textarea
          value={body}
          onChange={(e) => handleBodyChange(e.target.value)}
          required
          rows={5}
          placeholder="メッセージ本文を入力（変数: {{customer_name}} 等）"
          aria-label="テンプレート本文"
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
        {bodyErrors.length > 0 && (
          <div role="alert" style={{ marginTop: '4px', fontSize: '12px', color: '#c62828' }}>
            {bodyErrors.map((err, i) => (
              <div key={i}>{err}</div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', ...fieldGap }}>
        <div>
          <label style={labelStyle}>企業ID</label>
          <input
            type="text"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            placeholder="企業ID"
            aria-label="企業ID"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>ブランド</label>
          <input
            type="text"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="ブランド"
            aria-label="ブランド"
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', ...fieldGap }}>
        <div>
          <label style={labelStyle}>用途</label>
          <input
            type="text"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="用途"
            aria-label="用途"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>部署</label>
          <input
            type="text"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder="部署"
            aria-label="部署"
            style={inputStyle}
          />
        </div>
      </div>

      <div style={fieldGap}>
        <label style={labelStyle}>公開範囲</label>
        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as TemplateVisibility)}
          aria-label="公開範囲"
          style={inputStyle}
        >
          {VISIBILITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '8px 16px',
            fontSize: '14px',
            border: '1px solid #ccc',
            borderRadius: '6px',
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          キャンセル
        </button>
        <button
          type="submit"
          disabled={!name.trim() || !body.trim() || bodyErrors.length > 0}
          style={{
            padding: '8px 16px',
            fontSize: '14px',
            border: 'none',
            borderRadius: '6px',
            background: !name.trim() || !body.trim() || bodyErrors.length > 0 ? '#ccc' : '#1976d2',
            color: '#fff',
            cursor: !name.trim() || !body.trim() || bodyErrors.length > 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {isEdit ? '更新' : '作成'}
        </button>
      </div>
    </form>
  );
}
