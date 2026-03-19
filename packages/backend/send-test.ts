/**
 * 実SMS送信テストスクリプト
 * MediaSMS-CONSOLE API を使って実際にSMSを送信する
 *
 * Usage: npx tsx send-test.ts
 */
import { Media4uProvider } from './src/providers/media4u-provider.js';

const PHONE_NUMBER = '08043118132';
const MESSAGE = 'Zendesk SMS Tool テスト送信です。このメッセージが届いていれば、MediaSMS連携は正常に動作しています。';

async function testSendSMS(testPhone: string = PHONE_NUMBER) {
  console.log('='.repeat(60));
  console.log('📱 MediaSMS-CONSOLE 実SMS送信テスト (testSendSMS)');
  console.log('='.repeat(60));

  const provider = new Media4uProvider({
    username: process.env.MEDIASMS_USERNAME ?? 'jcn_u',
    password: process.env.MEDIASMS_PASSWORD ?? 'TtqxAhh59',
  });

  // 1. 設定バリデーション
  console.log('\n--- 1. 設定バリデーション ---');
  const validation = await provider.validateConfig();
  console.log(`  Valid: ${validation.valid}`);
  if (!validation.valid) {
    console.error('  Errors:', validation.errors);
    process.exit(1);
  }

  // 2. SMS送信
  console.log(`\n--- 2. SMS送信 ---`);
  console.log(`  宛先: ${testPhone}`);
  console.log(`  本文: ${MESSAGE}`);
  console.log('  送信中...');

  const result = await provider.sendMessage({
    to: testPhone,
    body: MESSAGE,
  });

  console.log(`\n  結果:`);
  console.log(`  success: ${result.success}`);
  console.log(`  status: ${result.status}`);

  if (result.success) {
    console.log(`  externalMessageId: ${result.externalMessageId}`);
    console.log('\n  ✅ 送信成功！SMSが届くか確認してください。');
  } else {
    console.log(`  error: ${result.error?.code} - ${result.error?.message}`);
    console.log('\n  ❌ 送信失敗');
  }

  console.log('\n' + '='.repeat(60));
}

// 実行
testSendSMS().catch(console.error);
