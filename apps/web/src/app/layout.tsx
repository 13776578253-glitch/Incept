import type { ReactNode } from 'react';
import { AppProviders } from '@/components/base/app-providers';
import { MusicPlayerRuntimeMount } from '@incept/music/react';
import { mountManifest, renderProviderWrappers } from '@/mount/registry';
import './globals.css';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <html suppressHydrationWarning>
      <body>
        <AppProviders>
          {/* 根布局包裹贡献位（root-layout 深度，有序）：music 在挂载收编阶段注册 RuntimeMount wrapper */}
          {renderProviderWrappers(
            mountManifest,
            'root-layout',
            <MusicPlayerRuntimeMount>{children}</MusicPlayerRuntimeMount>,
          )}
        </AppProviders>
      </body>
    </html>
  );
}
