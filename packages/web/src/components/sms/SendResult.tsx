'use client';

/**
 * SendResult - 送信結果表示
 * Requirements: 1.1, 1.6
 *
 * 成功: 緑メッセージ + ログID
 * エラー: 赤メッセージ + エラー詳細
 * 警告: 黄色メッセージ
 */

export interface SendResultData {
  success: boolean;
  smsLogId?: string;
  error?: string;
  warnings?: string[];
}

export interface SendResultProps {
  result: SendResultData | null;
}

export function SendResult({ result }: SendResultProps) {
  if (!result) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {result.success ? (
        <div
          role="status"
          style={{
            padding: '12px 16px',
            background: '#e8f5e9',
            border: '1px solid #a5d6a7',
            borderRadius: '6px',
            color: '#2e7d32',
            fontSize: '14px',
          }}
        >
          ✓ 送信が完了しました
          {result.smsLogId && (
            <span style={{ marginLeft: '8px', fontSize: '12px', color: '#558b2f' }}>
              (ログID: {result.smsLogId})
            </span>
          )}
        </div>
      ) : (
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
          ✗ 送信に失敗しました
          {result.error && (
            <span style={{ display: 'block', marginTop: '4px', fontSize: '12px' }}>
              {result.error}
            </span>
          )}
        </div>
      )}

      {result.warnings && result.warnings.length > 0 && (
        <div
          role="status"
          style={{
            padding: '12px 16px',
            background: '#fff8e1',
            border: '1px solid #ffe082',
            borderRadius: '6px',
            color: '#f57f17',
            fontSize: '13px',
          }}
        >
          {result.warnings.map((warning, i) => (
            <div key={i}>⚠ {warning}</div>
          ))}
        </div>
      )}
    </div>
  );
}
