'use client';

/**
 * TemplatePreview - テンプレートプレビューコンポーネント
 * Requirements: 3.2, 3.3
 *
 * テンプレートの変数展開プレビューを表示する。
 * 未解決変数（values mapに含まれない変数）をオレンジ/黄色でハイライトする。
 */

import type { Template } from '@zendesk-sms-tool/shared';
import { renderTemplate } from '@zendesk-sms-tool/shared';

export interface TemplatePreviewProps {
  template: Template | null;
  variables?: Record<string, string>;
}

/**
 * テンプレート本文を、未解決変数をハイライトしたReactノードの配列に変換する。
 */
function renderBodyWithHighlights(body: string, variables: Record<string, string>) {
  const { rendered, unresolvedVars } = renderTemplate(body, variables);

  if (unresolvedVars.length === 0) {
    return <span>{rendered}</span>;
  }

  // 未解決変数パターンで分割してハイライト
  const unresolvedSet = new Set(unresolvedVars);
  // rendered text still contains {{var}} for unresolved — split on them
  const pattern = /(\{\{\w+\}\})/g;
  const parts = rendered.split(pattern);

  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(/^\{\{(\w+)\}\}$/);
        if (match && unresolvedSet.has(match[1])) {
          return (
            <mark
              key={i}
              style={{
                backgroundColor: '#fff3cd',
                color: '#856404',
                padding: '1px 3px',
                borderRadius: '3px',
                border: '1px solid #ffc107',
              }}
            >
              {part}
            </mark>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

export function TemplatePreview({ template, variables = {} }: TemplatePreviewProps) {
  if (!template) {
    return (
      <div
        role="status"
        style={{
          padding: '24px',
          textAlign: 'center',
          color: '#888',
          fontSize: '14px',
        }}
      >
        テンプレートを選択してください
      </div>
    );
  }

  return (
    <div style={{ padding: '12px' }}>
      <div
        style={{
          fontWeight: 600,
          fontSize: '14px',
          color: '#333',
          marginBottom: '8px',
        }}
      >
        {template.name}
      </div>
      <div
        style={{
          fontSize: '14px',
          lineHeight: 1.6,
          color: '#222',
          whiteSpace: 'pre-wrap',
          padding: '10px',
          backgroundColor: '#f9f9f9',
          border: '1px solid #eee',
          borderRadius: '6px',
        }}
      >
        {renderBodyWithHighlights(template.body, variables)}
      </div>
    </div>
  );
}
