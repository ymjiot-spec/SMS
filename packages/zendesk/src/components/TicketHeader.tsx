/**
 * TicketHeader — チケット情報表示コンポーネント
 * Requirements: 7.4
 *
 * Zendesk サイドバー幅（~350px）に最適化されたコンパクトレイアウト。
 */

import React from 'react';
import type { TicketInfo } from '../lib/zaf-client';

interface TicketHeaderProps {
  ticketInfo: TicketInfo | null;
}

export const TicketHeader: React.FC<TicketHeaderProps> = ({ ticketInfo }) => {
  if (!ticketInfo) {
    return (
      <div style={styles.container}>
        <p style={styles.noData}>チケット情報を取得できません</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.row}>
        <span style={styles.label}>チケット</span>
        <span style={styles.value}>#{ticketInfo.ticketId}</span>
      </div>
      {ticketInfo.subject && (
        <div style={styles.row}>
          <span style={styles.label}>件名</span>
          <span style={styles.subjectValue}>{ticketInfo.subject}</span>
        </div>
      )}
      <div style={styles.row}>
        <span style={styles.label}>依頼者</span>
        <span style={styles.value}>{ticketInfo.requesterName || '—'}</span>
      </div>
      <div style={styles.row}>
        <span style={styles.label}>電話番号</span>
        <span style={styles.phoneValue}>
          {ticketInfo.requesterPhone || '未登録'}
        </span>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '8px 12px',
    borderBottom: '1px solid #e0e0e0',
    backgroundColor: '#f8f9fa',
    fontSize: '13px',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    padding: '2px 0',
  },
  label: {
    color: '#666',
    flexShrink: 0,
    marginRight: '8px',
  },
  value: {
    fontWeight: 600,
    textAlign: 'right' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  subjectValue: {
    textAlign: 'right' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    maxWidth: '220px',
  },
  phoneValue: {
    fontWeight: 600,
    fontFamily: 'monospace',
    textAlign: 'right' as const,
  },
  noData: {
    color: '#999',
    margin: 0,
    textAlign: 'center' as const,
  },
};
