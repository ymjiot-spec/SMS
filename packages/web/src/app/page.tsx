'use client';

// Zendesk Apps Framework SDK type (loaded via <Script> tag)
declare const ZAFClient: { init: () => { get: (paths: string[]) => Promise<Record<string, unknown>>; invoke: (cmd: string, opts?: Record<string, unknown>) => void; on: (event: string, cb: (data: unknown) => void) => void } };

/**
 * SMS送信メインページ
 * Requirements: 13.1, 13.2, 13.3, 10.6
 *
 * レイアウト構成:
 * - 上部: チケット情報
 * - 中央: テンプレート選択 + メッセージ編集
 * - 下部: 送信ボタン + 結果表示
 * - 最近の送信履歴（チケットコンテキスト時）
 */

import { useState, useEffect, useCallback } from 'react';
import type { Template, Folder } from '@zendesk-sms-tool/shared';
import { validateJapanesePhoneNumber } from '@zendesk-sms-tool/shared';
import { PhoneInput, MessageEditor, SendButton, ConfirmModal, SendResult, TestSendModal } from '../components/sms';
import type { SendResultData } from '../components/sms';
import { TemplateSearch, TemplateList, TemplatePreview } from '../components/template';
import { HistoryTable } from '../components/history';
import {
  sendSms,
  sendSmsWithSelfCopy,
  testSendSms,
  searchTemplates,
  getTemplates,
  getSmsLogs,
  getFolders,
  setUserId,
} from '../lib/api-client';
import type { SmsLogEntry } from '../lib/api-client';

export default function Home() {
  // SMS form state
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [testSendModalOpen, setTestSendModalOpen] = useState(false);
  const [sendResult, setSendResult] = useState<SendResultData | null>(null);
  const [sendSelfCopy, setSendSelfCopy] = useState(false);
  const [testSendLoading, setTestSendLoading] = useState(false);

  // Template state
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [templateSearch, setTemplateSearch] = useState('');

  // Folder state
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());

  // Ticket context state (for Zendesk integration)
  const [ticketId, setTicketId] = useState<string | null>(null);

  // Recent history for ticket context
  const [recentHistory, setRecentHistory] = useState<SmsLogEntry[]>([]);
  const [recentHistoryTotal, setRecentHistoryTotal] = useState(0);

  // Initialize ZAF client and load ticket context
  useEffect(() => {
    if (typeof ZAFClient === 'undefined') return;
    try {
      const client = ZAFClient.init();
      // Resize sidebar
      client.invoke('resize', { width: '100%', height: '600px' });
      // Fetch ticket info
      client.get(['ticket.id', 'ticket.requester.phone']).then((data) => {
        const id = data['ticket.id'];
        const reqPhone = data['ticket.requester.phone'];
        if (id) setTicketId(String(id));
        if (reqPhone && typeof reqPhone === 'string') setPhone(reqPhone);
      }).catch(() => {/* not in Zendesk context */ });
    } catch {
      // Not in Zendesk context (e.g., standalone browser)
    }
  }, []);

  // Load templates
  const loadTemplates = useCallback(async () => {
    try {
      setUserId('demo-agent');
      const filters: Record<string, string> = {};
      if (selectedFolderId) filters.folderId = selectedFolderId;
      const result = templateSearch
        ? await searchTemplates({ keyword: templateSearch })
        : await getTemplates(filters);
      setTemplates(result.items ?? []);
    } catch {
      // Silently fail
    }
  }, [templateSearch, selectedFolderId]);

  // Load folders
  const loadFolders = useCallback(async () => {
    try {
      const result = await getFolders();
      setFolders(result);
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  // Load recent history when ticket context is available
  useEffect(() => {
    if (!ticketId) return;
    (async () => {
      try {
        const result = await getSmsLogs({ ticketId, limit: 5 });
        setRecentHistory(result.items);
        setRecentHistoryTotal(result.total);
      } catch {
        // Silently fail
      }
    })();
  }, [ticketId]);

  // Template selection handler
  const handleTemplateSelect = (template: Template) => {
    setSelectedTemplate(template);
    setMessage(template.body);
  };

  // Send flow
  const canSend = validateJapanesePhoneNumber(phone) && message.trim().length > 0;

  const handleSendClick = () => {
    setSendResult(null);
    setConfirmModalOpen(true);
  };

  const handleConfirmSend = async () => {
    setConfirmModalOpen(false);
    setLoading(true);
    setSendResult(null);
    try {
      if (sendSelfCopy) {
        // 自分にも送信付き (Requirements: 4.1, 4.4)
        const result = await sendSmsWithSelfCopy({
          to: phone,
          body: message,
          templateId: selectedTemplate?.id,
          ticketId: ticketId ?? undefined,
        });
        setSendResult({
          success: result.success,
          smsLogId: result.smsLogId,
          error: result.error?.message,
          warnings: [
            ...(result.warnings?.map((w) => w.message) ?? []),
            ...(result.partialSuccess
              ? ['自分への送信に失敗しましたが、顧客への送信は成功しました。']
              : []),
          ].filter(Boolean),
        });
      } else {
        const result = await sendSms({
          to: phone,
          body: message,
          templateId: selectedTemplate?.id,
          ticketId: ticketId ?? undefined,
        });
        setSendResult({
          success: result.success,
          smsLogId: result.smsLogId,
          error: result.error?.message,
          warnings: result.warnings?.map((w) => w.message),
        });
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '送信中にエラーが発生しました';
      setSendResult({ success: false, error: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  // テスト送信ハンドラー (Requirements: 5.1, 5.3)
  const handleTestSendClick = () => {
    if (!message.trim()) return;
    setSendResult(null);
    setTestSendModalOpen(true);
  };

  const handleConfirmTestSend = async (testPhone: string) => {
    setTestSendModalOpen(false);
    setTestSendLoading(true);
    setSendResult(null);
    try {
      const result = await testSendSms({
        body: message,
        testPhone,
        templateId: selectedTemplate?.id,
        ticketId: ticketId ?? undefined,
      });
      setSendResult({
        success: result.success,
        smsLogId: result.smsLogId,
        error: result.error?.message,
        warnings: result.success ? ['テスト送信が完了しました（テスト用電話番号に送信済み）'] : undefined,
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'テスト送信中にエラーが発生しました';
      setSendResult({ success: false, error: errorMessage });
    } finally {
      setTestSendLoading(false);
    }
  };

  const sectionStyle: React.CSSProperties = {
    background: '#fff',
    borderRadius: '8px',
    padding: '16px 20px',
    border: '1px solid #e0e0e0',
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: '14px',
    fontWeight: 600,
    marginBottom: '12px',
    color: '#555',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* チケット情報セクション */}
      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>チケット情報</h2>
        {ticketId ? (
          <p style={{ fontSize: '13px', color: '#333' }}>チケットID: {ticketId}</p>
        ) : (
          <p style={{ fontSize: '13px', color: '#888' }}>
            Zendeskチケットから開くと、チケット情報が自動表示されます。
          </p>
        )}
      </section>

      {/* テンプレート選択 + メッセージ編集セクション */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* テンプレート選択 */}
        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>テンプレート選択</h2>
          <TemplateSearch value={templateSearch} onChange={setTemplateSearch} />

          <div style={{ display: 'flex', marginTop: '12px', gap: '0', border: '1px solid #eee', borderRadius: '6px', overflow: 'hidden', height: '280px' }}>
            {/* フォルダサイドバー */}
            <div style={{ width: '140px', borderRight: '1px solid #eee', backgroundColor: '#f9fafb', overflowY: 'auto', flexShrink: 0, fontSize: '12px' }}>
              <div
                onClick={() => setSelectedFolderId(null)}
                style={{
                  padding: '6px 10px', cursor: 'pointer',
                  backgroundColor: selectedFolderId === null ? '#e0edff' : 'transparent',
                  color: selectedFolderId === null ? '#1a56db' : '#555',
                  fontWeight: selectedFolderId === null ? 600 : 400,
                }}
              >
                📁 すべて
              </div>
              <div style={{ borderTop: '1px solid #e5e7eb' }} />
              {folders.filter(f => !f.parentId).map(folder => {
                const children = folders.filter(f => f.parentId === folder.id);
                const hasChildren = children.length > 0;
                const isExpanded = expandedFolderIds.has(folder.id);
                return (
                  <div key={folder.id}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      {hasChildren && (
                        <button
                          onClick={() => setExpandedFolderIds(prev => {
                            const n = new Set(prev);
                            n.has(folder.id) ? n.delete(folder.id) : n.add(folder.id);
                            return n;
                          })}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px 0 6px', fontSize: '9px', color: '#9ca3af', flexShrink: 0 }}
                        >
                          {isExpanded ? '▼' : '▶'}
                        </button>
                      )}
                      <div
                        onClick={() => setSelectedFolderId(folder.id)}
                        style={{
                          flex: 1, padding: hasChildren ? '6px 8px 6px 2px' : '6px 8px 6px 18px', cursor: 'pointer',
                          backgroundColor: selectedFolderId === folder.id ? '#e0edff' : 'transparent',
                          color: selectedFolderId === folder.id ? '#1a56db' : '#555',
                          fontWeight: selectedFolderId === folder.id ? 600 : 400,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}
                        title={folder.name}
                      >
                        📁 {folder.name}
                      </div>
                    </div>
                    {isExpanded && children.map(child => (
                      <div
                        key={child.id}
                        onClick={() => setSelectedFolderId(child.id)}
                        style={{
                          padding: '5px 8px 5px 28px', cursor: 'pointer',
                          backgroundColor: selectedFolderId === child.id ? '#e0edff' : 'transparent',
                          color: selectedFolderId === child.id ? '#1a56db' : '#777',
                          fontWeight: selectedFolderId === child.id ? 600 : 400,
                          fontSize: '11px',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}
                        title={child.name}
                      >
                        📄 {child.name}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            {/* テンプレート一覧 */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <TemplateList
                templates={templates}
                onSelect={handleTemplateSelect}
                selectedId={selectedTemplate?.id}
              />
            </div>
          </div>

          <div style={{ marginTop: '12px' }}>
            <TemplatePreview template={selectedTemplate} />
          </div>
        </section>

        {/* メッセージ編集 */}
        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>メッセージ編集</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <PhoneInput value={phone} onChange={setPhone} />
            <MessageEditor value={message} onChange={setMessage} />
          </div>
        </section>
      </div>

      {/* 送信ボタン + 結果表示セクション */}
      <section style={{ ...sectionStyle, display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ ...sectionTitleStyle, marginBottom: 0 }}>送信</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* 自分にも送信チェックボックス (Requirements: 4.1) */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#555', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={sendSelfCopy}
                onChange={(e) => setSendSelfCopy(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              自分にも送信
            </label>
            {/* テスト送信ボタン (Requirements: 5.3) */}
            <button
              type="button"
              onClick={handleTestSendClick}
              disabled={!message.trim() || testSendLoading}
              aria-busy={testSendLoading}
              style={{
                padding: '10px 24px',
                background: !message.trim() || testSendLoading ? '#ffe0b2' : '#f57c00',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: !message.trim() || testSendLoading ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
              }}
            >
              {testSendLoading ? 'テスト送信中...' : 'テスト送信'}
            </button>
            <SendButton onClick={handleSendClick} disabled={!canSend} loading={loading} />
          </div>
        </div>
        <SendResult result={sendResult} />
      </section>

      {/* 最近の送信履歴（チケットコンテキスト時） */}
      {ticketId && recentHistory.length > 0 && (
        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>最近の送信履歴（このチケット）</h2>
          <HistoryTable
            items={recentHistory}
            total={recentHistoryTotal}
            page={1}
            limit={5}
            onPageChange={() => { }}
          />
        </section>
      )}

      {/* 送信確認モーダル */}
      <ConfirmModal
        open={confirmModalOpen}
        onConfirm={handleConfirmSend}
        onCancel={() => setConfirmModalOpen(false)}
        phone={phone}
        message={message}
        templateName={selectedTemplate?.name}
      />

      {/* テスト送信モーダル */}
      <TestSendModal
        open={testSendModalOpen}
        onConfirm={handleConfirmTestSend}
        onCancel={() => setTestSendModalOpen(false)}
        message={message}
      />
    </div>
  );
}
