import type { ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';
import { EyeComfortFilterProvider } from '@/components/base/eye-comfort-filter-provider';
import './globals.css';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <html suppressHydrationWarning>
      <head />
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <EyeComfortFilterProvider />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
