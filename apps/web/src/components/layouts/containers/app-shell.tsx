import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/layouts/site-header';

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="app-shell">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[calc(var(--z-header,50)+10)] focus:rounded-[9px] focus:border focus:border-[var(--color-border-strong)] focus:bg-[var(--color-surface-card)] focus:px-3 focus:py-1.5 focus:text-[length:var(--text-xs)] focus:font-medium focus:text-[var(--color-text)] focus:shadow-[var(--shadow-card-sm)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring-focus)]"
      >
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main-content" className="app-main">
        {children}
      </main>
    </div>
  );
}
