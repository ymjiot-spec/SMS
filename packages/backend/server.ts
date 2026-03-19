/**
 * Standalone backend server with real MediaSMS provider
 * Usage: USE_REAL_SMS=true npx tsx server.ts
 */
import express from 'express';
import cors from 'cors';
import type { Request, Response, NextFunction } from 'express';
import { Media4uProvider } from './src/providers/media4u-provider.js';
import { MockProvider } from './src/providers/mock-provider.js';

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

const USE_REAL_SMS = process.env.USE_REAL_SMS === 'true' || !!process.env.MEDIASMS_USERNAME;
const PORT = Number(process.env.PORT) || 3001;

const provider = USE_REAL_SMS
  ? new Media4uProvider({
    username: process.env.MEDIASMS_USERNAME ?? 'jcn_u',
    password: process.env.MEDIASMS_PASSWORD ?? 'TtqxAhh59',
  })
  : new MockProvider();

const app = express();
app.use(cors());
app.use(express.json());

// In-memory logs (field names match SmsLogEntry type in api-client.ts)
const smsLogs: Array<{
  id: string; recipientPhone: string; messageBody: string; sendType: string;
  templateName?: string; ticketId?: string; operatorId: string; sentBy: string;
  createdAt: string; updatedAt: string; success: boolean; externalMessageId?: string;
  errorCode?: string; errorMessage?: string; deliveryStatus: string;
}> = [];

// Fake auth
app.use((req: Request, _res: Response, next: NextFunction) => {
  req.user = {
    id: 'demo-agent', email: 'agent@example.com', name: 'オペレーター山田',
    phone: '08043118132', role: 'AGENT', companyId: 'demo-co',
    createdAt: new Date(), updatedAt: new Date(),
  };
  // APIクライアントがX-User-Idを送信してきた場合はそれを優先する（本番互換）
  if (req.headers['x-user-id']) {
    req.user.id = req.headers['x-user-id'] as string;
  }
  next();
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// --- SMS Send ---
app.post('/api/sms/send', async (req: Request, res: Response) => {
  const { to, body, ticketId, sendType, templateName, selfCopy, selfPhone, senderName } = req.body;
  const agent = req.user!;
  console.log(`📱 SMS送信: to=${to}, type=${sendType ?? 'customer'}, ticket=${ticketId ?? '-'}`);

  const result = await provider.sendMessage({ to, body });
  const now = new Date().toISOString();
  const logEntry = {
    id: `log_${Date.now()}`,
    recipientPhone: to, messageBody: body, sendType: sendType ?? 'customer',
    templateName, ticketId, operatorId: agent.id, sentBy: senderName || agent.name,
    createdAt: now, updatedAt: now,
    success: result.success,
    externalMessageId: result.externalMessageId,
    errorCode: result.error?.code,
    errorMessage: result.error?.message,
    deliveryStatus: result.success ? 'sent' : 'failed',
  };
  smsLogs.unshift(logEntry);

  // Self copy — use selfPhone from request first, fall back to agent.phone
  const selfTarget = selfPhone || agent.phone;
  if (result.success && selfCopy && selfTarget) {
    console.log(`  📋 自分にも送信: ${selfTarget}`);
    const selfResult = await provider.sendMessage({ to: selfTarget, body });
    smsLogs.unshift({
      ...logEntry,
      id: `log_${Date.now()}_self`,
      recipientPhone: selfTarget,
      sendType: 'self_copy',
      success: selfResult.success,
      externalMessageId: selfResult.externalMessageId,
      deliveryStatus: selfResult.success ? 'sent' : 'failed',
    });
  }

  if (result.success) {
    console.log(`  ✅ 成功: ${result.externalMessageId}`);
    res.json({ success: true, externalMessageId: result.externalMessageId, smsLogId: logEntry.id });
  } else {
    console.log(`  ❌ 失敗: ${result.error?.message}`);
    res.status(400).json({ success: false, error: result.error });
  }
});

// --- Test Send ---
app.post('/api/sms/test-send', async (req: Request, res: Response) => {
  const { body, templateName, senderName } = req.body;
  const agent = req.user!;
  const testPhone = agent.phone ?? '08043118132';
  console.log(`🧪 テスト送信: to=${testPhone}`);

  const testBody = `【テスト送信】\n${body}`;
  const result = await provider.sendMessage({ to: testPhone, body: testBody });
  const now = new Date().toISOString();
  smsLogs.unshift({
    id: `log_${Date.now()}_test`,
    recipientPhone: testPhone, messageBody: testBody, sendType: 'test',
    templateName, ticketId: undefined, operatorId: agent.id, sentBy: senderName || agent.name,
    createdAt: now, updatedAt: now,
    success: result.success,
    externalMessageId: result.externalMessageId,
    deliveryStatus: result.success ? 'sent' : 'failed',
  });

  if (result.success) {
    res.json({ success: true, externalMessageId: result.externalMessageId });
  } else {
    res.status(400).json({ success: false, error: result.error });
  }
});

// --- Logs ---
app.get('/api/sms/logs', (_req: Request, res: Response) => {
  res.json({ items: smsLogs, total: smsLogs.length, page: 1, limit: 50 });
});

// --- Templates ---
const templates: Array<{
  id: string; companyId: string; brand: string; purpose: string;
  name: string; body: string; visibility: string; createdBy: string;
  createdAt: string; updatedAt: string; lastUsedAt: string | null;
  folderId: string | null; sortOrder: number;
  department?: string | null;
}> = [];




app.get('/api/templates', (req: Request, res: Response) => {
  let filtered = [...templates];
  const { company, category, search, folderId } = req.query;
  if (company && company !== 'all') filtered = filtered.filter(t => t.companyId === company);
  if (category && category !== 'all') filtered = filtered.filter(t => t.purpose === category);
  if (search) {
    const q = String(search).toLowerCase();
    filtered = filtered.filter(t => t.name.toLowerCase().includes(q) || t.body.toLowerCase().includes(q));
  }
  // folderId filtering (子孫フォルダも含む)
  if (folderId !== undefined) {
    if (folderId === 'null' || folderId === '') {
      filtered = filtered.filter(t => !t.folderId);
    } else {
      // 選択フォルダ + 子孫フォルダのIDを収集
      const getDescendantIds = (parentId: string): string[] => {
        const children = folders.filter(f => f.parentId === parentId);
        return children.flatMap(c => [c.id, ...getDescendantIds(c.id)]);
      };
      const allFolderIds = [String(folderId), ...getDescendantIds(String(folderId))];
      filtered = filtered.filter(t => t.folderId && allFolderIds.includes(t.folderId));
    }
  }
  // Sort by sortOrder
  filtered.sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));
  res.json({ items: filtered, total: filtered.length, page: 1, limit: 50 });
});

app.get('/api/templates/companies', (_req: Request, res: Response) => {
  const companies = [...new Set(templates.map(t => t.companyId))];
  res.json({ items: companies });
});

app.get('/api/templates/categories', (_req: Request, res: Response) => {
  const categories = [...new Set(templates.map(t => t.purpose))];
  res.json({ items: categories });
});

app.get('/api/templates/search', (req: Request, res: Response) => {
  let filtered = [...templates];
  const { keyword } = req.query;
  if (keyword) {
    const q = String(keyword).toLowerCase();
    filtered = filtered.filter(t => t.name.toLowerCase().includes(q) || t.body.toLowerCase().includes(q));
  }
  res.json({ items: filtered, total: filtered.length, page: 1, limit: 50 });
});

// --- Template CRUD ---

// reorder は :id より前に配置（Expressのルートマッチング順序）
app.put('/api/templates/reorder', (req: Request, res: Response) => {
  const { items } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'items配列が必要です' } });
  for (const item of items) {
    const idx = templates.findIndex(t => t.id === item.id);
    if (idx !== -1) {
      templates[idx].sortOrder = item.sortOrder;
      if (item.folderId !== undefined) templates[idx].folderId = item.folderId;
    }
  }
  res.json({ success: true });
});

app.get('/api/templates/:id', (req: Request, res: Response) => {
  const tpl = templates.find(t => t.id === req.params.id);
  if (!tpl) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'テンプレートが見つかりません' } });
  res.json(tpl);
});

app.post('/api/templates', (req: Request, res: Response) => {
  const { name, body, companyId, brand, purpose, department, visibility, folderId } = req.body;
  const now = new Date().toISOString();
  const newTpl = {
    id: `tpl_${Date.now()}`, name, body,
    companyId: companyId ?? null, brand: brand ?? null, purpose: purpose ?? null,
    department: department ?? null, visibility: visibility ?? 'global',
    createdBy: req.user!.id, createdAt: now, updatedAt: now, lastUsedAt: null,
    folderId: folderId ?? null, sortOrder: templates.length,
  };
  templates.push(newTpl);
  res.status(201).json(newTpl);
});

app.put('/api/templates/:id', (req: Request, res: Response) => {
  const idx = templates.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'テンプレートが見つかりません' } });
  const { name, body, companyId, brand, purpose, department, visibility, folderId, sortOrder } = req.body;
  const now = new Date().toISOString();
  templates[idx] = {
    ...templates[idx],
    ...(name !== undefined && { name }),
    ...(body !== undefined && { body }),
    ...(companyId !== undefined && { companyId }),
    ...(brand !== undefined && { brand }),
    ...(purpose !== undefined && { purpose }),
    ...(department !== undefined && { department }),
    ...(visibility !== undefined && { visibility }),
    ...(folderId !== undefined && { folderId }),
    ...(sortOrder !== undefined && { sortOrder }),
    updatedAt: now,
  };
  res.json(templates[idx]);
});

app.delete('/api/templates/:id', (req: Request, res: Response) => {
  const idx = templates.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'テンプレートが見つかりません' } });
  templates.splice(idx, 1);
  res.json({ success: true });
});

app.post('/api/templates/:id/duplicate', (req: Request, res: Response) => {
  const original = templates.find(t => t.id === req.params.id);
  if (!original) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'テンプレートが見つかりません' } });
  const now = new Date().toISOString();
  const dup = {
    ...original,
    id: `tpl_${Date.now()}`,
    name: req.body.name ?? `${original.name}（コピー）`,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null,
  };
  templates.push(dup);
  res.status(201).json(dup);
});

// --- In-memory folders ---
const folders: Array<{
  id: string;
  name: string;
  parentId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}> = [];

const favoritesByUser = new Map<string, Set<string>>();
app.post('/api/templates/:id/favorite', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const userId = req.user!.id;
  if (!templates.find(t => t.id === id)) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'テンプレートが見つかりません' } });
  if (!favoritesByUser.has(userId)) favoritesByUser.set(userId, new Set());
  const userFavs = favoritesByUser.get(userId)!;
  if (userFavs.has(id)) { userFavs.delete(id); res.json({ favorited: false }); }
  else { userFavs.add(id); res.json({ favorited: true }); }
});

app.get('/api/favorites', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const userFavs = favoritesByUser.get(userId) ?? new Set();
  res.json({ items: [...userFavs] });
});

// --- Folders ---
app.get('/api/folders', (_req: Request, res: Response) => {
  res.json({ items: folders });
});

app.post('/api/folders', (req: Request, res: Response) => {
  const { name, parentId } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'フォルダ名は必須です' } });
  }
  if (parentId && !folders.find(f => f.id === parentId)) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: '親フォルダが見つかりません' } });
  }
  const now = new Date().toISOString();
  const folder = {
    id: `folder_${Date.now()}`,
    name: name.trim(),
    parentId: parentId ?? null,
    createdBy: req.user!.id,
    createdAt: now,
    updatedAt: now,
  };
  folders.push(folder);
  res.status(201).json(folder);
});

app.put('/api/folders/:id', (req: Request, res: Response) => {
  const idx = folders.findIndex(f => f.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'フォルダが見つかりません' } });
  const { name, parentId } = req.body;
  if (name !== undefined && (!name || !name.trim())) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'フォルダ名は必須です' } });
  }
  // 自分自身を親にはできない
  if (parentId === req.params.id) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: '自分自身を親フォルダにはできません' } });
  }
  // 循環参照チェック
  if (parentId) {
    let current = parentId;
    while (current) {
      if (current === req.params.id) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: '循環参照になるため移動できません' } });
      }
      const parent = folders.find(f => f.id === current);
      current = parent?.parentId ?? null as any;
    }
  }
  folders[idx] = {
    ...folders[idx],
    ...(name !== undefined && { name: name.trim() }),
    ...(parentId !== undefined && { parentId: parentId }),
    updatedAt: new Date().toISOString(),
  };
  res.json(folders[idx]);
});

app.delete('/api/folders/:id', (req: Request, res: Response) => {
  const idx = folders.findIndex(f => f.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'フォルダが見つかりません' } });
  const folderId = folders[idx].id;
  // 子孫フォルダIDを全て収集
  const getDescendantIds = (parentId: string): string[] => {
    const children = folders.filter(f => f.parentId === parentId);
    return children.flatMap(c => [c.id, ...getDescendantIds(c.id)]);
  };
  const allIds = [folderId, ...getDescendantIds(folderId)];
  // テンプレートも削除
  for (let i = templates.length - 1; i >= 0; i--) {
    if (allIds.includes(templates[i].folderId as string)) {
      templates.splice(i, 1);
    }
  }
  // 子孫フォルダも削除
  for (let i = folders.length - 1; i >= 0; i--) {
    if (allIds.includes(folders[i].id)) {
      folders.splice(i, 1);
    }
  }
  res.json({ success: true });
});

// Zendesk internal note (stub)
app.post('/api/zendesk/internal-note', (req: Request, res: Response) => {
  console.log('📝 社内メモ作成:', JSON.stringify(req.body, null, 2));
  res.json({ success: true });
});

// Current user
app.get('/api/users/me', (req: Request, res: Response) => {
  res.json(req.user);
});

app.listen(PORT, () => {
  console.log(`\n🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`   Provider: ${USE_REAL_SMS ? 'MediaSMS (実API)' : 'MockProvider'}`);
  console.log(`   CORS: enabled\n`);
});
