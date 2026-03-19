'use client';

/**
 * 送信履歴ページ
 * Requirements: 13.2, 9.1, 9.3
 *
 * HistoryFilter, HistoryTable, HistoryExport を統合。
 * フィルタ変更・ページ変更で getSmsLogs を呼び出し。
 * CSVエクスポート: API呼び出し → ダウンロード。
 */

import { useState, useEffect, useCallback } from 'react';
import { HistoryFilter, HistoryTable, HistoryExport } from '../../components/history';
import { getSmsLogs } from '../../lib/api-client';
import type { SmsLogFilters, SmsLogEntry } from '../../lib/api-client';

const PAGE_LIMIT = 20;

export default function HistoryPage() {
  const [filters, setFilters] = useState<SmsLogFilters>({});
  const [items, setItems] = useState<SmsLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoadError(null);
    try {
      const result = await getSmsLogs({ ...filters, page, limit: PAGE_LIMIT });
      setItems(result.items);
      setTotal(result.total);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '履歴の取得に失敗しました';
      setLoadError(msg);
      setItems([]);
      setTotal(0);
    }
  }, [filters, page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleFilterChange = (newFilters: SmsLogFilters) => {
    setFilters(newFilters);
    setPage(1); // Reset to first page on filter change
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handleExport = async () => {
    try {
      // Build query string from current filters
      const params = new URLSearchParams();
      if (filters.ticketId) params.set('ticketId', filters.ticketId);
      if (filters.phone) params.set('phone', filters.phone);
      if (filters.operatorId) params.set('operatorId', filters.operatorId);
      if (filters.templateId) params.set('templateId', filters.templateId);
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);
      if (filters.deliveryStatus) params.set('deliveryStatus', filters.deliveryStatus);
      params.set('format', 'csv');

      const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
      const url = `${baseUrl}/api/sms/logs?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('CSVエクスポートに失敗しました');

      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `sms-history-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch {
      // Export error — could show a toast, but keeping it simple
    }
  };

  const sectionStyle: React.CSSProperties = {
    background: '#fff',
    borderRadius: '8px',
    padding: '16px 20px',
    border: '1px solid #e0e0e0',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* フィルタ + エクスポート */}
      <section style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#555', marginBottom: '8px' }}>
            送信履歴
          </h2>
          <HistoryExport onClick={handleExport} disabled={total === 0} />
        </div>
        <HistoryFilter filters={filters} onChange={handleFilterChange} />
      </section>

      {/* エラー表示 */}
      {loadError && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
            background: '#ffebee',
            border: '1px solid #ef9a9a',
            borderRadius: '6px',
            color: '#c62828',
            fontSize: '14px',
          }}
        >
          {loadError}
        </div>
      )}

      {/* テーブル */}
      <section style={sectionStyle}>
        <HistoryTable
          items={items}
          total={total}
          page={page}
          limit={PAGE_LIMIT}
          onPageChange={handlePageChange}
        />
      </section>
    </div>
  );
}
