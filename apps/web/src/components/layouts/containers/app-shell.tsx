import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/layouts/site-header';

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="app-main">{children}</main>
    </div>
  );
}
