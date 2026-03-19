'use client';

/**
 * HistoryTable - 送信履歴テーブルコンポーネント
 * Requirements: 9.1
 *
 * SMS送信ログをテーブル表示し、ページネーション制御を提供する。
 * 配信ステータスは色分けバッジで表示。
 */

import type { DeliveryStatus } from '@zendesk-sms-tool/shared';
import type { SmsLogEntry } from '../../lib/api-client';

export interface HistoryTableProps {
  items: SmsLogEntry[];
  total: number;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
}

const STATUS_COLORS: Record<DeliveryStatus, { bg: string; text: string }> = {
  queued: { bg: '#e3f2fd', text: '#1565c0' },
  sent: { bg: '#fff3e0', text: '#e65100' },
  delivered: { bg: '#e8f5e9', text: '#2e7d32' },
  failed: { bg: '#ffebee', text: '#c62828' },
  expired: { bg: '#f3e5f5', text: '#6a1b9a' },
  unknown: { bg: '#f5f5f5', text: '#616161' },
};

const STATUS_LABELS: Record<DeliveryStatus, string> = {
  queued: 'キュー中',
  sent: '送信成功',
  delivered: '配信済',
  failed: '送信失敗',
  expired: '期限切れ',
  unknown: '不明',
};

const SEND_TYPE_LABELS: Record<string, string> = {
  customer: '顧客',
  self_copy: '自分コピー',
  test: 'テスト',
};

function truncate(text: string, max: number): string {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function HistoryTable({ items, total, page, limit, onPageChange }: HistoryTableProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit));

  if (items.length === 0) {
    return (
      <div
        role="status"
        style={{ padding: '32px', textAlign: 'center', color: '#888', fontSize: '14px' }}
      >
        送信履歴がありません
      </div>
    );
  }

  const thStyle: React.CSSProperties = {
    padding: '8px 12px',
    textAlign: 'left',
    fontSize: '12px',
    fontWeight: 600,
    color: '#555',
    borderBottom: '2px solid #e0e0e0',
    whiteSpace: 'nowrap',
  };

  const tdStyle: React.CSSProperties = {
    padding: '8px 12px',
    fontSize: '13px',
    color: '#333',
    borderBottom: '1px solid #eee',
  };

  return (
    <div>
      <table
        role="table"
        aria-label="送信履歴"
        style={{ width: '100%', borderCollapse: 'collapse' }}
      >
        <thead>
          <tr>
            <th style={thStyle}>送信日時</th>
            <th style={thStyle}>宛先番号</th>
            <th style={thStyle}>メッセージ</th>
            <th style={thStyle}>送信種別</th>
            <th style={thStyle}>配信ステータス</th>
            <th style={thStyle}>チケットID</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const colors = STATUS_COLORS[item.deliveryStatus] ?? STATUS_COLORS.unknown;
            return (
              <tr key={item.id}>
                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatDate(item.createdAt)}</td>
                <td style={tdStyle}>{item.recipientPhone}</td>
                <td style={{ ...tdStyle, maxWidth: '200px' }} title={item.messageBody}>
                  {truncate(item.messageBody, 30)}
                </td>
                <td style={tdStyle}>{SEND_TYPE_LABELS[item.sendType] ?? item.sendType}</td>
                <td style={tdStyle}>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      backgroundColor: colors.bg,
                      color: colors.text,
                    }}
                  >
                    {STATUS_LABELS[item.deliveryStatus] ?? item.deliveryStatus}
                  </span>
                </td>
                <td style={tdStyle}>{item.ticketId ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 0',
          fontSize: '13px',
          color: '#555',
        }}
      >
        <span>
          {total}件中 {(page - 1) * limit + 1}–{Math.min(page * limit, total)}件
        </span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="前のページ"
            style={{
              padding: '4px 12px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              background: page <= 1 ? '#f5f5f5' : '#fff',
              color: page <= 1 ? '#bbb' : '#333',
              cursor: page <= 1 ? 'not-allowed' : 'pointer',
              fontSize: '13px',
            }}
          >
            前へ
          </button>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            aria-label="次のページ"
            style={{
              padding: '4px 12px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              background: page >= totalPages ? '#f5f5f5' : '#fff',
              color: page >= totalPages ? '#bbb' : '#333',
              cursor: page >= totalPages ? 'not-allowed' : 'pointer',
              fontSize: '13px',
            }}
          >
            次へ
          </button>
        </div>
      </div>
    </div>
  );
}
