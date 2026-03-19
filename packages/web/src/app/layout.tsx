/**
 * Root Layout
 * Requirements: 13.1, 13.2
 *
 * 共通レイアウト: ヘッダー + タブナビゲーション（SMS送信 / テンプレート管理 / 送信履歴）
 */

import type { Metadata } from 'next';
import Script from 'next/script';
import { NavTabs } from '../components/NavTabs';

export const metadata: Metadata = {
  title: 'Zendesk SMS Tool',
  description: 'SMS sending and management tool with Zendesk integration',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        {/* Zendesk Apps Framework SDK */}
        <Script src="https://static.zdassets.com/zendesk_app_framework_sdk/2.0/zaf_sdk.min.js" strategy="beforeInteractive" />
        <style>{`
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            color: #1a1a1a;
            background: #f5f5f5;
            line-height: 1.6;
          }
          .app-header {
            background: #fff;
            border-bottom: 1px solid #e0e0e0;
            padding: 0 24px;
          }
          .app-header h1 {
            font-size: 18px;
            font-weight: 600;
            padding: 12px 0 0;
          }
          .tab-nav {
            display: flex;
            gap: 0;
            margin-top: 8px;
          }
          .tab-nav a {
            display: inline-block;
            padding: 8px 20px;
            text-decoration: none;
            color: #555;
            font-size: 14px;
            font-weight: 500;
            border-bottom: 2px solid transparent;
            transition: color 0.15s, border-color 0.15s;
          }
          .tab-nav a:hover {
            color: #0066cc;
          }
          .tab-nav a[data-active="true"] {
            color: #0066cc;
            border-bottom-color: #0066cc;
          }
          .app-main {
            max-width: 1200px;
            margin: 0 auto;
            padding: 24px;
          }
        `}</style>
      </head>
      <body>
        <header className="app-header">
          <h1>Zendesk SMS Tool</h1>
          <NavTabs />
        </header>
        <main className="app-main">
          {children}
        </main>
      </body>
    </html>
  );
}
