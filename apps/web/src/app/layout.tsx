import type { ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';
import { DocsCodePaletteProvider } from '@/components/base/docs-code-palette-provider';
import { EyeComfortFilterProvider } from '@/components/base/eye-comfort-filter-provider';
import './globals.css';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <html suppressHydrationWarning>
      <head />
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <DocsCodePaletteProvider>
            <EyeComfortFilterProvider />
            {children}
          </DocsCodePaletteProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
