'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

const TABS = [
  { href: '/', label: 'SMS送信' },
  { href: '/templates', label: 'テンプレート管理' },
  { href: '/history', label: '送信履歴' },
];

export function NavTabs() {
  const pathname = usePathname();

  return (
    <nav className="tab-nav" aria-label="メインナビゲーション">
      {TABS.map((tab) => {
        const isActive = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
        return (
          <Link key={tab.href} href={tab.href} data-active={isActive ? 'true' : 'false'}>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
