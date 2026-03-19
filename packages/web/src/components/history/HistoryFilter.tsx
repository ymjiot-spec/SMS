'use client';

/**
 * HistoryFilter - 送信履歴フィルタコンポーネント
 * Requirements: 9.1
 *
 * チケットID、電話番号、日付範囲、配信ステータスでフィルタリング。
 * 水平レイアウト。
 */

import type { DeliveryStatus } from '@zendesk-sms-tool/shared';
import type { SmsLogFilters } from '../../lib/api-client';

export interface HistoryFilterProps {
  filters: SmsLogFilters;
  onChange: (filters: SmsLogFilters) => void;
}

const STATUS_OPTIONS: Array<{ value: DeliveryStatus; label: string }> = [
  { value: 'queued', label: 'キュー中' },
  { value: 'sent', label: '送信済' },
  { value: 'delivered', label: '配信済' },
  { value: 'failed', label: '失敗' },
  { value: 'expired', label: '期限切れ' },
  { value: 'unknown', label: '不明' },
];

const labelStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: '#555',
  marginBottom: '2px',
};

const inputStyle: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: '13px',
  border: '1px solid #ccc',
  borderRadius: '4px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

export function HistoryFilter({ filters, onChange }: HistoryFilterProps) {
  const update = (patch: Partial<SmsLogFilters>) => {
    onChange({ ...filters, ...patch });
  };

  return (
    <div
      role="search"
      aria-label="送信履歴フィルタ"
      style={{
        display: 'flex',
        gap: '12px',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        padding: '12px 0',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: '120px' }}>
        <label htmlFor="filter-ticket" style={labelStyle}>チケットID</label>
        <input
          id="filter-ticket"
          type="text"
          value={filters.ticketId ?? ''}
          onChange={(e) => update({ ticketId: e.target.value || undefined })}
          placeholder="チケットID"
          style={inputStyle}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', minWidth: '140px' }}>
        <label htmlFor="filter-phone" style={labelStyle}>電話番号</label>
        <input
          id="filter-phone"
          type="text"
          value={filters.phone ?? ''}
          onChange={(e) => update({ phone: e.target.value || undefined })}
          placeholder="09012345678"
          style={inputStyle}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', minWidth: '140px' }}>
        <label htmlFor="filter-date-from" style={labelStyle}>日付From</label>
        <input
          id="filter-date-from"
          type="date"
          value={filters.dateFrom ?? ''}
          onChange={(e) => update({ dateFrom: e.target.value || undefined })}
          style={inputStyle}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', minWidth: '140px' }}>
        <label htmlFor="filter-date-to" style={labelStyle}>日付To</label>
        <input
          id="filter-date-to"
          type="date"
          value={filters.dateTo ?? ''}
          onChange={(e) => update({ dateTo: e.target.value || undefined })}
          style={inputStyle}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', minWidth: '120px' }}>
        <label htmlFor="filter-status" style={labelStyle}>配信ステータス</label>
        <select
          id="filter-status"
          value={filters.deliveryStatus ?? ''}
          onChange={(e) =>
            update({
              deliveryStatus: (e.target.value || undefined) as DeliveryStatus | undefined,
            })
          }
          style={{ ...inputStyle, appearance: 'auto' }}
        >
          <option value="">すべて</option>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
