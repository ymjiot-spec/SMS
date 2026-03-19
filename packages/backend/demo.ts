/**
 * Demo script — MockProvider + インメモリでAPIを叩くデモ
 * Usage: npx tsx demo.ts
 */

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { MockProvider } from './src/providers/mock-provider.js';
import { SmsService } from './src/services/sms-service.js';
import { SettingsService } from './src/services/settings-service.js';
import { SettingsController } from './src/controllers/settings-controller.js';
import { SmsController } from './src/controllers/sms-controller.js';
import { createSettingsRoutes } from './src/routes/settings-routes.js';
import { globalErrorHandler } from './src/middleware/error-handler.js';

// --- Minimal in-memory audit service ---
const auditLogs: any[] = [];
const auditService = {
  log: async (entry: any) => {
    auditLogs.push({ ...entry, createdAt: new Date().toISOString() });
    console.log('  📝 Audit:', entry.action, entry.resourceType);
  },
  search: async () => auditLogs,
};

// --- SMS Provider (Mock) ---
const provider = new MockProvider();

// --- Services ---
const smsService = new SmsService(provider, null as any, auditService as any);
const settingsService = new SettingsService(auditService as any);

// --- Controllers ---
const settingsController = new SettingsController(settingsService);
const smsController = new SmsController(smsService as any, null as any);

// --- Express App ---
const app = express();
app.use(express.json());

// Fake auth — always admin
app.use((req: Request, _res: Response, next: NextFunction) => {
  req.user = {
    id: 'demo-admin',
    email: 'admin@demo.com',
    name: 'Demo Admin',
    phone: '09012345678',
    role: 'SYSTEM_ADMIN',
    companyId: 'demo-co',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  next();
});

// SMS send (simplified — skips DB)
app.post('/api/sms/send', async (req: Request, res: Response) => {
  const { to, body } = req.body;
  console.log(`\n📱 SMS送信リクエスト: to=${to}`);
  const result = await provider.sendMessage({ to, body });
  if (result.success) {
    console.log(`  ✅ 送信成功: externalMessageId=${result.externalMessageId}`);
    res.json({ success: true, externalMessageId: result.externalMessageId, status: result.status });
  } else {
    console.log(`  ❌ 送信失敗: ${result.error?.message}`);
    res.status(400).json({ success: false, error: result.error });
  }
});

// Settings
const passthrough = (_req: Request, _res: Response, next: NextFunction) => next();
app.use('/api/settings', createSettingsRoutes({ settingsController, requireSystemAdmin: passthrough }));

// Health
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Error handler
app.use(globalErrorHandler);

// --- Start ---
const PORT = 3456;
const server = app.listen(PORT, async () => {
  console.log(`\n🚀 Demo server running on http://localhost:${PORT}\n`);
  console.log('='.repeat(60));

  const base = `http://localhost:${PORT}`;
  const headers = { 'Content-Type': 'application/json' };

  // 1. Health check
  console.log('\n--- 1. ヘルスチェック ---');
  const health = await fetch(`${base}/health`);
  console.log(`  GET /health → ${health.status}`, await health.json());

  // 2. SMS送信
  console.log('\n--- 2. SMS送信 ---');
  const smsRes = await fetch(`${base}/api/sms/send`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      to: '09012345678',
      body: 'こんにちは！お問い合わせありがとうございます。',
    }),
  });
  console.log(`  POST /api/sms/send → ${smsRes.status}`, await smsRes.json());

  // 3. 設定取得
  console.log('\n--- 3. 設定取得 ---');
  const getSettings = await fetch(`${base}/api/settings`);
  const settingsData = await getSettings.json();
  console.log(`  GET /api/settings → ${getSettings.status}`);
  console.log(`  Provider: ${settingsData.settings.smsProvider.name}`);
  console.log(`  Test Phone: ${settingsData.settings.testPhoneNumber}`);
  console.log(`  Rate Limit: ${settingsData.settings.rateLimitPerMinute}/min`);

  // 4. 設定更新
  console.log('\n--- 4. 設定更新 ---');
  const putSettings = await fetch(`${base}/api/settings`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ testPhoneNumber: '09099999999', rateLimitPerMinute: 20 }),
  });
  const updated = await putSettings.json();
  console.log(`  PUT /api/settings → ${putSettings.status}`);
  console.log(`  Updated Test Phone: ${updated.settings.testPhoneNumber}`);
  console.log(`  Updated Rate Limit: ${updated.settings.rateLimitPerMinute}/min`);

  // 5. MockProvider — 送信済みメッセージ確認
  console.log('\n--- 5. MockProvider 送信済みメッセージ ---');
  const messages = provider.getAllMessages();
  console.log(`  送信済み: ${messages.size}件`);
  for (const [id, m] of messages) {
    console.log(`  [${id}] to=${m.request.to}, body="${m.request.body.substring(0, 30)}...", status=${m.status}`);
  }

  // 6. 監査ログ確認
  console.log('\n--- 6. 監査ログ ---');
  console.log(`  記録数: ${auditLogs.length}件`);
  auditLogs.forEach((a, i) => {
    console.log(`  [${i + 1}] ${a.action} (${a.resourceType}) at ${a.createdAt}`);
  });

  console.log('\n' + '='.repeat(60));
  console.log('✨ Demo完了！\n');

  server.close();
});
