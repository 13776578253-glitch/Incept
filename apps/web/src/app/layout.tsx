import type { ReactNode } from 'react';
import { AppProviders } from '@/components/base/app-providers';
import { MusicPlayerRuntimeMount } from '@/features/music-player';
import './globals.css';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <html suppressHydrationWarning>
      <body>
        <AppProviders>
          <MusicPlayerRuntimeMount>{children}</MusicPlayerRuntimeMount>
        </AppProviders>
      </body>
    </html>
  );
}
