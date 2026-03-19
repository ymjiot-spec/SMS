/**
 * Zendesk SMS Tool – v4
 * Folder-based templates | Compact history | Full validation | Internal notes
 */
import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { initZafClient, getTicketInfo } from './lib/zaf-client';
import type { TicketInfo } from './lib/zaf-client';
import './styles.css';

const API = import.meta.env.VITE_API_URL ?? 'https://sms-2ftz.onrender.com';
type Tab = 'send' | 'templates' | 'history';

// ── Types ───────────────────────────────────────
interface Folder { id: string; name: string; parentId: string | null; }
interface Template { id: string; name: string; body: string; folderId: string | null; brand?: string; purpose?: string; createdAt?: string; updatedAt?: string; }
interface Log { id: string; recipientPhone: string; messageBody: string; sendType: string; templateName?: string; sentBy: string; createdAt: string; success: boolean; deliveryStatus: string; }

// ── Helpers ─────────────────────────────────────
const strip = (v: string) => v.replace(/[^\d]/g, '');
const phoneErr = (p: string) => {
  if (!p) return '電話番号を入力してください';
  if (p.length !== 10 && p.length !== 11) return '10桁または11桁で入力してください';
  return '';
};
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// ── Design tokens ───────────────────────────────
const C = {
  bg: '#f6f7fb', card: '#ffffff', border: '#e5e7eb',
  text: '#111827', sub: '#6b7280', accent: '#6366f1',
  success: '#16a34a', danger: '#dc2626', warn: '#d97706',
};

// ── Inline style helpers ─────────────────────────
const input = (err?: boolean): React.CSSProperties => ({
  height: 40, width: '100%', padding: '0 12px', boxSizing: 'border-box',
  border: `1px solid ${err ? C.danger : C.border}`, borderRadius: 8,
  background: err ? '#fef2f2' : C.card, fontSize: 13, color: C.text, outline: 'none',
});
const textarea = (err?: boolean): React.CSSProperties => ({
  width: '100%', padding: '10px 12px', boxSizing: 'border-box',
  border: `1px solid ${err ? C.danger : C.border}`, borderRadius: 8,
  background: err ? '#fef2f2' : C.card, fontSize: 13, color: C.text, resize: 'none', outline: 'none', lineHeight: 1.6,
});
const focusStyle = (node: HTMLInputElement | HTMLTextAreaElement | null, err?: boolean) => {
  if (!node) return;
  node.addEventListener('focus', () => { node.style.borderColor = C.accent; node.style.boxShadow = `0 0 0 3px ${C.accent}26`; });
  node.addEventListener('blur', () => { node.style.borderColor = err ? C.danger : C.border; node.style.boxShadow = 'none'; });
};

// ── Reusable UI ─────────────────────────────────
const Inp: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { err?: boolean }> = ({ err, style, ...p }) => {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => focusStyle(ref.current, err), [err]);
  return <input ref={ref} {...p} style={{ ...input(err), ...style }} />;
};

const Txta: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement> & { err?: boolean }> = ({ err, style, ...p }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => focusStyle(ref.current, err), [err]);
  return <textarea ref={ref} {...p} style={{ ...textarea(err), ...style }} />;
};

const Lbl: React.FC<{ children: React.ReactNode; req?: boolean }> = ({ children, req }) => (
  <p style={{ fontSize: 11, fontWeight: 600, color: C.sub, textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 3 }}>
    {children}{req && <span style={{ color: C.danger }}>*</span>}
  </p>
);

const FG: React.FC<{ label?: string; req?: boolean; err?: string; hint?: string; children: React.ReactNode }> = ({ label, req, err, hint, children }) => (
  <div>
    {label && <Lbl req={req}>{label}</Lbl>}
    {children}
    {err && <p style={{ fontSize: 11, color: C.danger, marginTop: 3, fontWeight: 500 }}>{err}</p>}
    {hint && !err && <p style={{ fontSize: 11, color: C.sub, marginTop: 3 }}>{hint}</p>}
  </div>
);

const Btn: React.FC<{ label: React.ReactNode; primary?: boolean; danger?: boolean; disabled?: boolean; onClick?: () => void; style?: React.CSSProperties }> = ({ label, primary, danger, disabled, onClick, style }) => (
  <button onClick={onClick} disabled={disabled} style={{
    height: 40, padding: '0 16px', borderRadius: 8, border: primary || danger ? 'none' : `1px solid ${C.border}`,
    background: disabled ? '#e5e7eb' : danger ? C.danger : primary ? `linear-gradient(90deg, ${C.accent}, #4f46e5)` : C.card,
    color: primary || danger ? '#fff' : C.sub, fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
    boxShadow: primary && !disabled ? '0 2px 8px rgba(99,102,241,.25)' : 'none',
    transition: 'opacity .15s', whiteSpace: 'nowrap', ...style,
  }}>{label}</button>
);

// ── Inline Modal (position:absolute within relative parent) ────
const Modal: React.FC<{ children: React.ReactNode; onClose?: () => void }> = ({ children, onClose }) => (
  <div style={{ position: 'fixed', inset: 0, zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
    <div style={{ background: C.card, borderRadius: '12px', width: 'calc(100% - 24px)', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,.18)', pointerEvents: 'all' }}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}>
      {children}
    </div>
  </div>
);

// ── Folder / Template Form ───────────────────────
const FolderForm: React.FC<{ initial?: string; onSave: (name: string) => void; onClose: () => void }> = ({ initial, onSave, onClose }) => {
  const [name, setName] = useState(initial ?? '');
  return (
    <Modal>
      <div style={{ padding: '14px 20px 8px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{initial !== undefined ? 'フォルダ名を変更' : '新しいフォルダ'}</span>
        <button onMouseDown={e => e.preventDefault()} onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 18, color: C.sub }}>✕</button>
      </div>
      <div style={{ padding: '14px 20px' }}>
        <FG label="フォルダ名" req><Inp value={name} onChange={e => setName(e.target.value)} placeholder="例：本人確認" autoFocus /></FG>
      </div>
      <div style={{ padding: '0 20px 24px', display: 'flex', gap: 8 }}>
        <button onMouseDown={e => e.preventDefault()} onClick={onClose} style={{ flex: 1, height: 40, borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.sub, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>キャンセル</button>
        <button onMouseDown={e => e.preventDefault()} disabled={!name.trim()} onClick={() => onSave(name.trim())} style={{ flex: 1, height: 40, borderRadius: 8, border: 'none', background: !name.trim() ? '#e5e7eb' : `linear-gradient(90deg,${C.accent},#4f46e5)`, color: '#fff', fontSize: 13, fontWeight: 600, cursor: !name.trim() ? 'not-allowed' : 'pointer' }}>保存する</button>
      </div>
    </Modal>
  );
};

const TplForm: React.FC<{
  initial?: Partial<Template>;
  folders: Folder[];
  onSave: (d: { name: string; body: string; folderId: string | null }) => void;
  onClose: () => void;
}> = ({ initial, folders, onSave, onClose }) => {
  const [name, setName] = useState(initial?.name ?? '');
  const [folderId, setFolderId] = useState<string | null>(initial?.folderId ?? null);
  const [body, setBody] = useState(initial?.body ?? '');
  const valid = name.trim() && body.trim();
  return (
    <Modal>
      <div style={{ padding: '14px 20px 8px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{initial?.id ? 'テンプレートを編集' : '新規テンプレート'}</span>
        <button onMouseDown={e => e.preventDefault()} onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 18, color: C.sub }}>✕</button>
      </div>
      <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '55vh', overflowY: 'auto' }}>
        <FG label="テンプレート名" req><Inp value={name} onChange={e => setName(e.target.value)} placeholder="例：MNP手続き案内" autoFocus /></FG>
        <FG label="所属フォルダ">
          <select value={folderId ?? ''} onChange={e => setFolderId(e.target.value || null)} style={{ ...input(), fontSize: 13 }}>
            <option value="">フォルダなし</option>
            {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </FG>
        <FG label="本文" req>
          <Txta value={body} onChange={e => setBody(e.target.value)} rows={5} placeholder={'{{customer_name}}様\ndmobileです。'} />
          <p style={{ fontSize: 11, color: C.sub, marginTop: 3 }}>{body.length}字{body.length > 70 ? ` · ${Math.ceil(body.length / 70)}通` : ''}</p>
        </FG>
      </div>
      <div style={{ padding: '0 20px 24px', display: 'flex', gap: 8 }}>
        <button onMouseDown={e => e.preventDefault()} onClick={onClose} style={{ flex: 1, height: 40, borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.sub, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>キャンセル</button>
        <button onMouseDown={e => e.preventDefault()} disabled={!valid} onClick={() => valid && onSave({ name: name.trim(), body: body.trim(), folderId })} style={{ flex: 1, height: 40, borderRadius: 8, border: 'none', background: !valid ? '#e5e7eb' : `linear-gradient(90deg,${C.accent},#4f46e5)`, color: '#fff', fontSize: 13, fontWeight: 600, cursor: !valid ? 'not-allowed' : 'pointer' }}>保存する</button>
      </div>
    </Modal>
  );
};

// ── Confirm Dialog ───────────────────────────────
const Confirm: React.FC<{ msg: string; sub?: string; ok?: string; onOk: () => void; onCancel: () => void; danger?: boolean }> = ({ msg, sub, ok = '削除する', onOk, onCancel, danger }) => (
  <Modal>
    <div style={{ padding: 24 }}>
      <p style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6, textAlign: 'center' }}>{msg}</p>
      {sub && <p style={{ fontSize: 12, color: C.sub, textAlign: 'center', marginBottom: 20 }}>{sub}</p>}
      {!sub && <div style={{ height: 14 }} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button onMouseDown={e => e.preventDefault()} onClick={onOk} style={{ width: '100%', height: 44, borderRadius: 8, border: 'none', background: danger ? C.danger : `linear-gradient(90deg,${C.accent},#4f46e5)`, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{ok}</button>
        <button onMouseDown={e => e.preventDefault()} onClick={onCancel} style={{ width: '100%', height: 40, border: 'none', background: 'transparent', color: C.sub, fontSize: 13, fontWeight: 600, cursor: 'pointer', borderRadius: 8 }}>キャンセル</button>
      </div>
    </div>
  </Modal>
);

// ── SMS Confirm Sheet ────────────────────────────
const SendConfirm: React.FC<{ phone: string; onOk: () => void; onCancel: () => void }> = ({ phone, onOk, onCancel }) => (
  <Modal>
    <div style={{ padding: '20px 24px 32px', textAlign: 'center' }}>
      <div style={{ width: 32, height: 4, background: '#e5e7eb', borderRadius: 2, margin: '0 auto 20px' }} />
      <p style={{ fontSize: 11, fontWeight: 700, color: C.sub, textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 10 }}>送信確認</p>
      <p style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: 1, marginBottom: 4 }}>{phone}</p>
      <p style={{ fontSize: 13, color: C.sub, marginBottom: 24 }}>この番号にSMSを送信します</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button onMouseDown={e => e.preventDefault()} onClick={onOk} style={{ width: '100%', height: 48, borderRadius: 8, border: 'none', background: `linear-gradient(90deg,${C.accent},#4f46e5)`, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(99,102,241,.3)' }}>送信する</button>
        <button onMouseDown={e => e.preventDefault()} onClick={onCancel} style={{ border: 'none', background: 'none', cursor: 'pointer', color: C.sub, fontSize: 13, fontWeight: 600, height: 40 }}>キャンセル</button>
      </div>
    </div>
  </Modal>
);

// ── Templates Tab ────────────────────────────────
const TemplatesTab: React.FC<{
  folders: Folder[];
  templates: Template[];
  onSelect: (t: Template) => void;
  onRefresh: () => void;
}> = ({ folders, templates, onSelect, onRefresh }) => {
  const [search, setSearch] = useState('');
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [editFolder, setEditFolder] = useState<Folder | null>(null);
  const [delFolder, setDelFolder] = useState<Folder | null>(null);
  const [showTplForm, setShowTplForm] = useState(false);
  const [editTpl, setEditTpl] = useState<Template | null>(null);
  const [delTpl, setDelTpl] = useState<Template | null>(null);
  const [defaultFolderId, setDefaultFolderId] = useState<string | null>(null);

  const toggle = (id: string) => setOpenFolders(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const searchLc = search.toLowerCase();
  const matched = searchLc
    ? templates.filter(t =>
      t.name.toLowerCase().includes(searchLc) ||
      t.body.toLowerCase().includes(searchLc) ||
      folders.find(f => f.id === t.folderId)?.name.toLowerCase().includes(searchLc)
    )
    : null;

  const saveFolder = async (name: string) => {
    if (editFolder) {
      await fetch(`${API}/api/folders/${editFolder.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    } else {
      await fetch(`${API}/api/folders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    }
    setShowFolderForm(false); setEditFolder(null); onRefresh();
  };

  const deleteFolder = async () => {
    if (!delFolder) return;
    await fetch(`${API}/api/folders/${delFolder.id}`, { method: 'DELETE' });
    setDelFolder(null); onRefresh();
  };

  const saveTpl = async (data: { name: string; body: string; folderId: string | null }) => {
    if (editTpl) {
      await fetch(`${API}/api/templates/${editTpl.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    } else {
      await fetch(`${API}/api/templates`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    }
    setShowTplForm(false); setEditTpl(null); onRefresh();
    if (data.folderId) setOpenFolders(prev => new Set([...prev, data.folderId!]));
  };

  const deleteTpl = async () => {
    if (!delTpl) return;
    await fetch(`${API}/api/templates/${delTpl.id}`, { method: 'DELETE' });
    setDelTpl(null); onRefresh();
  };

  const TplRow: React.FC<{ t: Template }> = ({ t }) => (
    <div style={{ display: 'flex', alignItems: 'center', padding: '8px 14px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer', transition: 'background .12s' }}
      onClick={() => onSelect(t)}
      onMouseEnter={e => (e.currentTarget.style.background = '#f5f3ff')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      <span style={{ flex: 1, fontSize: 13, color: C.text, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>{t.name}</span>
      <span onClick={e => { e.stopPropagation(); setEditTpl(t); setShowTplForm(true); }}
        style={{ fontSize: 12, color: C.sub, padding: '2px 6px', cursor: 'pointer', borderRadius: 4 }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = C.accent; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = C.sub; }}>✏️</span>
      <span onClick={e => { e.stopPropagation(); setDelTpl(t); }}
        style={{ fontSize: 12, color: C.sub, padding: '2px 6px', cursor: 'pointer', borderRadius: 4 }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = C.danger; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = C.sub; }}>🗑️</span>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{ padding: '10px 16px', background: C.card, borderBottom: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="テンプレートを検索…"
            style={{ ...input(), flex: 1, background: C.bg }}
            onFocus={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.background = C.card; }}
            onBlur={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.bg; }} />
          <Btn label="＋テンプレ" primary onClick={() => { setEditTpl(null); setDefaultFolderId(null); setShowTplForm(true); }} style={{ height: 40, padding: '0 12px', fontSize: 12 }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={() => { setEditFolder(null); setShowFolderForm(true); }}
            style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: C.accent, fontWeight: 600, padding: 0 }}>
            📁 フォルダを追加
          </button>
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {/* Search results */}
        {matched !== null ? (
          matched.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '32px 16px', fontSize: 13, color: C.sub }}>検索に一致するテンプレートがありません</p>
          ) : matched.map(t => (
            <div key={t.id} style={{ padding: '0 16px' }}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 6 }}>
                <TplRow t={t} />
              </div>
            </div>
          ))
        ) : (
          <>
            {/* Folders */}
            {folders.length === 0 && templates.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <p style={{ fontSize: 13, color: C.sub, marginBottom: 12 }}>フォルダとテンプレートがありません</p>
                <Btn label="📁 フォルダを追加" primary onClick={() => setShowFolderForm(true)} />
              </div>
            ) : (
              <>
                {folders.map(folder => {
                  const tpls = templates.filter(t => t.folderId === folder.id);
                  const isOpen = openFolders.has(folder.id);
                  return (
                    <div key={folder.id} style={{ marginBottom: 2 }}>
                      {/* Folder header */}
                      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', cursor: 'pointer', userSelect: 'none' }}
                        onClick={() => toggle(folder.id)}>
                        <span style={{ fontSize: 12, color: C.sub, marginRight: 6, transition: 'transform .15s', display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0)' }}>▶</span>
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.text }}>{folder.name}</span>
                        <span style={{ fontSize: 11, color: C.sub, marginRight: 8 }}>{tpls.length}件</span>
                        <span onClick={e => { e.stopPropagation(); setEditTpl(null); setDefaultFolderId(folder.id); setShowTplForm(true); }}
                          style={{ fontSize: 12, padding: '2px 6px', cursor: 'pointer', color: C.sub }}
                          title="テンプレート追加"
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = C.accent; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = C.sub; }}>＋</span>
                        <span onClick={e => { e.stopPropagation(); setEditFolder(folder); setShowFolderForm(true); }}
                          style={{ fontSize: 12, padding: '2px 6px', cursor: 'pointer', color: C.sub }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = C.accent; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = C.sub; }}>✏️</span>
                        <span onClick={e => { e.stopPropagation(); setDelFolder(folder); }}
                          style={{ fontSize: 12, padding: '2px 6px', cursor: 'pointer', color: C.sub }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = C.danger; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = C.sub; }}>🗑️</span>
                      </div>
                      {/* Templates in folder */}
                      {isOpen && (
                        <div style={{ margin: '0 16px 4px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
                          {tpls.length === 0 ? (
                            <p style={{ padding: '10px 14px', fontSize: 12, color: C.sub }}>テンプレートがありません</p>
                          ) : tpls.map(t => <TplRow key={t.id} t={t} />)}
                        </div>
                      )}
                    </div>
                  );
                })}
                {/* Templates without folder */}
                {templates.filter(t => !t.folderId).length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ padding: '6px 16px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: C.sub, textTransform: 'uppercase', letterSpacing: '.5px' }}>フォルダなし</span>
                    </div>
                    <div style={{ margin: '0 16px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
                      {templates.filter(t => !t.folderId).map(t => <TplRow key={t.id} t={t} />)}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {(showFolderForm || editFolder) && (
        <FolderForm initial={editFolder?.name} onSave={saveFolder} onClose={() => { setShowFolderForm(false); setEditFolder(null); }} />
      )}
      {delFolder && (() => {
        const count = templates.filter(t => t.folderId === delFolder.id).length;
        return (
          <Confirm
            msg={count > 0 ? '⚠️ フォルダとテンプレートを削除しますか？' : 'このフォルダを削除しますか？'}
            sub={count > 0 ? `「${delFolder.name}」内の${count}件のテンプレートも全て削除されます。この操作は取り消せません。` : `「${delFolder.name}」`}
            ok={count > 0 ? `${count}件ごと削除する` : '削除する'}
            danger
            onOk={deleteFolder}
            onCancel={() => setDelFolder(null)}
          />
        );
      })()}
      {showTplForm && (
        <TplForm
          initial={editTpl ? editTpl : defaultFolderId ? { folderId: defaultFolderId } : undefined}
          folders={folders}
          onSave={saveTpl}
          onClose={() => { setShowTplForm(false); setEditTpl(null); setDefaultFolderId(null); }}
        />
      )}
      {delTpl && (
        <Confirm msg="このテンプレートを削除しますか？" sub={`「${delTpl.name}」`} ok="削除する" danger onOk={deleteTpl} onCancel={() => setDelTpl(null)} />
      )}
    </div>
  );
};

// ── History Tab ───────────────────────────────────
const HistoryTab: React.FC<{ logs: Log[] }> = ({ logs }) => {
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return logs.filter(l => {
      const d = l.createdAt.slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return !q || l.recipientPhone.includes(q) || l.messageBody.toLowerCase().includes(q)
        || l.sentBy.toLowerCase().includes(q) || (l.templateName ?? '').toLowerCase().includes(q);
    });
  }, [logs, search, from, to]);

  const downloadCsv = () => {
    const hdr = '日時,宛先,種別,ステータス,テンプレート,送信者,本文';
    const rows = filtered.map(l =>
      `"${new Date(l.createdAt).toLocaleString('ja-JP')}","${l.recipientPhone}","${l.sendType === 'test' ? 'テスト' : '本番'}","${l.success ? '成功' : '失敗'}","${l.templateName ?? ''}","${l.sentBy}","${l.messageBody.replace(/"/g, '""').replace(/\n/g, ' ')}"`
    );
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob(['\uFEFF' + [hdr, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' })),
      download: `sms_${from || 'all'}_${to || 'all'}.csv`,
    }); a.click();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{ padding: '10px 16px', background: C.card, borderBottom: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="電話番号・本文・送信者・テンプレートを検索…"
          style={{ ...input(), width: '100%', background: C.bg }}
          onFocus={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.background = C.card; }}
          onBlur={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.bg; }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            style={{ flex: 1, minWidth: 0, height: 34, padding: '0 8px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11, outline: 'none', background: C.bg, boxSizing: 'border-box' }} />
          <span style={{ color: C.sub, fontSize: 11 }}>〜</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            style={{ flex: 1, minWidth: 0, height: 34, padding: '0 8px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11, outline: 'none', background: C.bg, boxSizing: 'border-box' }} />
          <button onClick={() => { setFrom(''); setTo(''); }}
            style={{ flexShrink: 0, height: 34, padding: '0 8px', border: `1px solid ${C.border}`, borderRadius: 6, background: C.card, color: C.sub, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            ✕
          </button>
          <button onClick={downloadCsv}
            style={{ flexShrink: 0, height: 34, padding: '0 10px', border: `1px solid ${C.border}`, borderRadius: 6, background: C.card, color: C.sub, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            CSV
          </button>
        </div>
      </div>
      {/* Compact list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <p style={{ textAlign: 'center', padding: '40px 16px', fontSize: 13, color: C.sub }}>履歴がありません</p>
        ) : filtered.map(log => (
          <div key={log.id} style={{
            borderBottom: `1px solid ${C.border}`,
            borderLeft: `3px solid ${log.success ? C.success : C.danger}`,
            padding: '6px 14px', display: 'flex', flexDirection: 'column', gap: 2,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: C.text }}>{log.recipientPhone}</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: log.sendType === 'test' ? '#fef3c7' : '#dbeafe', color: log.sendType === 'test' ? '#92400e' : '#1e40af' }}>
                {log.sendType === 'test' ? 'テスト' : '本番'}
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, color: log.success ? C.success : C.danger, marginLeft: 'auto', flexShrink: 0 }}>
                {log.success ? '✓ 成功' : '✗ 失敗'}
              </span>
              <span style={{ fontSize: 10, color: C.sub, flexShrink: 0 }}>{fmtDate(log.createdAt)}</span>
            </div>
            <p style={{ fontSize: 12, color: C.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{log.messageBody}</p>
            {(log.templateName || log.sentBy) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {log.templateName && <span style={{ fontSize: 10, color: C.sub }}>📋 {log.templateName}</span>}
                <span style={{ fontSize: 10, color: '#d1d5db', marginLeft: 'auto' }}>{log.sentBy}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Template Picker (Send tab) ───────────────────
const TemplatePicker: React.FC<{
  folders: Folder[];
  templates: Template[];
  groupedTpls: { folders: { folder: Folder; items: Template[] }[]; noFolder: Template[] };
  onSelect: (t: Template) => void;
}> = ({ folders, templates, groupedTpls, onSelect }) => {
  const [q, setQ] = useState('');
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setOpenIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const ql = q.toLowerCase();

  const filtered = ql
    ? templates.filter(t => t.name.toLowerCase().includes(ql) || t.body.toLowerCase().includes(ql) || folders.find(f => f.id === t.folderId)?.name.toLowerCase().includes(ql))
    : null;

  const TplItem: React.FC<{ t: Template }> = ({ t }) => (
    <button onClick={() => onSelect(t)}
      style={{ width: '100%', textAlign: 'left', padding: '7px 12px', border: 'none', borderTop: `1px solid ${C.border}`, background: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2 }}
      onMouseEnter={e => (e.currentTarget.style.background = '#f5f3ff')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      <span style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{t.name}</span>
      <span style={{ fontSize: 10, color: C.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{t.body}</span>
    </button>
  );

  return (
    <div style={{ border: `1px solid ${C.border}`, borderTop: 'none', borderRadius: '0 0 8px 8px', background: C.card, maxHeight: 280, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 テンプレートを検索…" autoFocus
          style={{ width: '100%', height: 30, padding: '0 8px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11, outline: 'none', background: C.bg, boxSizing: 'border-box' }}
          onFocus={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.background = C.card; }}
          onBlur={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.bg; }} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {templates.length === 0 && folders.length === 0 ? (
          <p style={{ padding: '12px', fontSize: 12, color: C.sub, textAlign: 'center' }}>テンプレートがありません</p>
        ) : filtered !== null ? (
          filtered.length === 0 ? (
            <p style={{ padding: '12px', fontSize: 12, color: C.sub, textAlign: 'center' }}>一致するテンプレートがありません</p>
          ) : filtered.map(t => <TplItem key={t.id} t={t} />)
        ) : (
          <>
            {groupedTpls.folders.map(({ folder, items }) => {
              const isOpen = openIds.has(folder.id);
              return (
                <div key={folder.id}>
                  <div onClick={() => toggle(folder.id)}
                    style={{ padding: '6px 12px', background: C.bg, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, borderTop: `1px solid ${C.border}`, userSelect: 'none' }}>
                    <span style={{ fontSize: 9, color: C.sub, transition: 'transform .15s', display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0)' }}>▶</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.sub }}>📁 {folder.name}</span>
                    <span style={{ fontSize: 10, color: '#d1d5db', marginLeft: 'auto' }}>{items.length}</span>
                  </div>
                  {isOpen && (items.length > 0 ? items.map(t => <TplItem key={t.id} t={t} />) : <p style={{ padding: '6px 16px', fontSize: 11, color: '#d1d5db' }}>テンプレートなし</p>)}
                </div>
              );
            })}
            {groupedTpls.noFolder.map(t => <TplItem key={t.id} t={t} />)}
          </>
        )}
      </div>
    </div>
  );
};

// ── Main App ──────────────────────────────────────
const App = () => {
  const zafRef = useRef<any>(null);
  const [ticketInfo, setTicketInfo] = useState<TicketInfo | null>(null);
  const [agentPhone, setAgentPhone] = useState('');
  const [tab, setTab] = useState<Tab>('send');

  // Send form state
  const [sender, setSender] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [selfCopy, setSelfCopy] = useState(false);
  const [selfPhone, setSelfPhone] = useState('');
  const [selTpl, setSelTpl] = useState<Template | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [err, setErr] = useState<{ sender?: string; phone?: string; msg?: string }>({});

  // Data
  const [folders, setFolders] = useState<Folder[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  // Mini template picker open state
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    const c = initZafClient();
    if (c) {
      zafRef.current = c;
      c.invoke('resize', { width: '100%', height: '700px' });
      getTicketInfo(c).then(info => {
        if (!info) return;
        setTicketInfo(info);
        if (info.requesterPhone) setPhone(strip(info.requesterPhone));
      });
    }
    fetch(`${API}/api/users/me`).then(r => r.json()).then(d => { setAgentPhone(d.phone ?? ''); }).catch(() => { });
    refresh();
  }, []);

  const refresh = useCallback(async () => {
    const [fRes, tRes, lRes] = await Promise.all([
      fetch(`${API}/api/folders`).then(r => r.json()).catch(() => ({ items: [] })),
      fetch(`${API}/api/templates`).then(r => r.json()).catch(() => ({ items: [] })),
      fetch(`${API}/api/sms/logs`).then(r => r.json()).catch(() => ({ items: [] })),
    ]);
    setFolders(fRes.items ?? []);
    setTemplates((tRes.items ?? []).sort((a: Template, b: Template) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')));
    setLogs(lRes.items ?? []);
  }, []);

  const postNote = async (text: string) => {
    const c = zafRef.current; const tid = ticketInfo?.ticketId;
    if (!c || !tid) return;
    try {
      await c.request({ url: `/api/v2/tickets/${tid}.json`, type: 'PUT', contentType: 'application/json', secure: true, data: JSON.stringify({ ticket: { comment: { body: text, public: false } } }) });
    } catch (e) { console.error('[SMS] note err:', e); }
  };

  const validate = () => {
    const e: typeof err = {};
    if (!sender.trim()) e.sender = '送信者名を入力してください';
    const pe = phoneErr(phone); if (pe) e.phone = pe;
    if (!message.trim()) e.msg = 'メッセージを入力してください';
    setErr(e); return !Object.keys(e).length;
  };

  const doSend = async () => {
    setShowConfirm(false); setSending(true); setResult(null);
    const now = new Date().toLocaleString('ja-JP');
    try {
      const res = await fetch(`${API}/api/sms/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: phone, body: message, ticketId: ticketInfo?.ticketId, sendType: 'customer', templateName: selTpl?.name, selfCopy, selfPhone: selfPhone || agentPhone, senderName: sender })
      });
      const d = await res.json();
      if (d.success) {
        setResult({ ok: true, msg: 'SMS送信が完了しました' });
        await postNote(`SMS送信\n\n送信結果　成功\n送信者　${sender}\n送信先　${phone}${selTpl ? `\nテンプレート　${selTpl.name}` : ''}\n\n本文\n${message}\n\n送信日時　${now}`);
        setMessage(''); setSelTpl(null); refresh();
      } else {
        const m = d.error?.message ?? '送信に失敗しました';
        setResult({ ok: false, msg: m });
        await postNote(`SMS送信\n\n送信結果　失敗\n送信者　${sender}\n送信先　${phone}\nエラー　${m}\n\n送信日時　${now}`);
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : '送信エラー';
      setResult({ ok: false, msg: m });
      await postNote(`SMS送信\n\n送信結果　失敗\n送信者　${sender}\n送信先　${phone}\nエラー　${m}\n\n送信日時　${now}`);
    } finally { setSending(false); }
  };


  const applyTemplate = (t: Template) => { setSelTpl(t); setMessage(t.body); setPickerOpen(false); setResult(null); };

  const TABS: [Tab, string][] = [['send', '送信'], ['templates', 'テンプレート'], ['history', '履歴']];

  // Grouped templates for mini-picker
  const groupedTpls = useMemo(() => {
    const noFolder = templates.filter(t => !t.folderId);
    return { folders: folders.map(f => ({ folder: f, items: templates.filter(t => t.folderId === f.id) })), noFolder };
  }, [folders, templates]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', background: C.bg, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", WebkitFontSmoothing: 'antialiased', overflow: 'hidden' }}>

      {/* HEADER */}
      <div style={{ flexShrink: 0, background: C.card, borderBottom: `1px solid ${C.border}`, padding: '0 16px', height: 48, display: 'flex', alignItems: 'center' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>SMS送信ツール</span>
      </div>

      {/* TABS */}
      <div style={{ flexShrink: 0, background: C.card, borderBottom: `1px solid ${C.border}`, display: 'flex', padding: '0 8px' }}>
        {TABS.map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '0 14px', height: 40, fontSize: 14, fontWeight: 600, border: 'none', background: 'transparent', cursor: 'pointer',
            color: tab === t ? C.accent : C.sub, borderBottom: `2px solid ${tab === t ? C.accent : 'transparent'}`, transition: 'all .15s',
          }}>{label}</button>
        ))}
      </div>

      {/* CONTENT */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>

        {/* ── SEND TAB ── */}
        {tab === 'send' && (
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

            <FG label="送信者名" req err={err.sender}>
              <Inp value={sender} placeholder="例：オペレーター山田" err={!!err.sender}
                onChange={e => { setSender(e.target.value); err.sender && setErr(p => ({ ...p, sender: undefined })); }} />
            </FG>

            <FG label="宛先電話番号" req err={err.phone} hint="ハイフンは自動で除去されます">
              <Inp type="tel" value={phone} placeholder="例：09012345678" err={!!err.phone}
                onChange={e => { const v = strip(e.target.value); setPhone(v); err.phone && setErr(p => ({ ...p, phone: phoneErr(v) || undefined })); }} />
            </FG>

            {/* ─ Template Picker ─ */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <Lbl>テンプレート</Lbl>
                <div style={{ display: 'flex', gap: 8 }}>
                  {selTpl && (
                    <button onClick={() => { setSelTpl(null); setMessage(''); }}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 11, color: C.danger, fontWeight: 600 }}>解除</button>
                  )}
                  <button onClick={() => setTab('templates')}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 11, color: C.accent, fontWeight: 600 }}>一覧 →</button>
                </div>
              </div>
              {selTpl ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '8px 12px' }}>
                  <span>📋</span>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#3730a3', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selTpl.name}</span>
                    <span style={{ fontSize: 11, color: '#6366f1', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>{selTpl.body}</span>
                  </div>
                </div>
              ) : (
                <div>
                  <button onClick={() => setPickerOpen(!pickerOpen)}
                    style={{ width: '100%', textAlign: 'left', height: 40, padding: '0 12px', border: `1px solid ${C.border}`, borderRadius: pickerOpen ? '8px 8px 0 0' : 8, background: C.card, cursor: 'pointer', fontSize: 13, color: C.sub, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>テンプレートを選択…</span>
                    <span style={{ fontSize: 11, transform: pickerOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▼</span>
                  </button>
                  {pickerOpen && <TemplatePicker folders={folders} templates={templates} groupedTpls={groupedTpls} onSelect={applyTemplate} />}
                </div>
              )}
            </div>

            {/* Message body */}
            <FG label="メッセージ本文" req err={err.msg}>
              <div style={{ position: 'relative' }}>
                <Txta value={message} rows={5} err={!!err.msg}
                  placeholder="メッセージを入力、またはテンプレートを選択"
                  onChange={e => { setMessage(e.target.value); err.msg && setErr(p => ({ ...p, msg: undefined })); }} />
                <span style={{
                  position: 'absolute', bottom: 6, right: 8, fontSize: 10, fontWeight: 600, pointerEvents: 'none',
                  color: message.length > 670 ? C.danger : message.length > 70 ? C.warn : '#d1d5db',
                }}>{message.length}字{message.length > 70 ? ` · ${Math.ceil(message.length / 70)}通` : ''}</span>
              </div>
            </FG>

            {/* Self copy */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer' }}>
                <input type="checkbox" checked={selfCopy} onChange={e => setSelfCopy(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: C.accent, cursor: 'pointer' }} />
                <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>自分にも送信</span>
              </label>
              {selfCopy && (
                <div style={{ padding: '0 12px 12px' }}>
                  <Inp type="tel" value={selfPhone} onChange={e => setSelfPhone(strip(e.target.value))}
                    placeholder={agentPhone || '例：08012345678'} style={{ height: 38 }} />
                </div>
              )}
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button disabled={sending} onClick={() => { if (validate()) setShowConfirm(true); }} style={{
                flex: 1, height: 44, borderRadius: 8, border: 'none', cursor: sending ? 'not-allowed' : 'pointer',
                background: sending ? '#e5e7eb' : `linear-gradient(90deg, ${C.accent}, #4f46e5)`,
                color: '#fff', fontSize: 14, fontWeight: 700, boxShadow: sending ? 'none' : '0 2px 8px rgba(99,102,241,.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                {sending ? '⏳ 送信中…' : '📱 SMS送信'}
              </button>

            </div>

            {result && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                background: result.ok ? '#f0fdf4' : '#fef2f2', border: `1px solid ${result.ok ? '#bbf7d0' : '#fca5a5'}`,
                color: result.ok ? '#15803d' : '#b91c1c',
              }}>
                <span>{result.ok ? '✅' : '❌'}</span>{result.msg}
              </div>
            )}
          </div>
        )}

        {/* ── TEMPLATES TAB ── */}
        {tab === 'templates' && (
          <TemplatesTab folders={folders} templates={templates} onSelect={t => { applyTemplate(t); setTab('send'); }} onRefresh={refresh} />
        )}

        {/* ── HISTORY TAB ── */}
        {tab === 'history' && <HistoryTab logs={logs} />}
      </div>

      {/* Modals */}
      {showConfirm && <SendConfirm phone={phone} onOk={doSend} onCancel={() => setShowConfirm(false)} />}
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<App />);
