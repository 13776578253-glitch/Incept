import type { ReactNode } from 'react';
import { AppProviders } from '@/components/base/app-providers';
import './globals.css';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <html suppressHydrationWarning>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
