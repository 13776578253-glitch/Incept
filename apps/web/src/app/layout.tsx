import type { ReactNode } from 'react';
import { AppProviders } from '@/components/base/app-providers';
import { mountManifest, renderProviderWrappers } from '@/mount/registry';
import './globals.css';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <html suppressHydrationWarning>
      <body>
        <AppProviders>
          {/* 根布局包裹贡献位（root-layout 深度，有序）：music 的 RuntimeMount wrapper 由此注册 */}
          {renderProviderWrappers(mountManifest, 'root-layout', children)}
        </AppProviders>
      </body>
    </html>
  );
}
