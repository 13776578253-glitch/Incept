'use client';

import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';

type RootProviderProps = {
  children: ReactNode;
  locale: string;
  messages: Record<string, unknown>;
  timeZone?: string;
};

export function RootProvider({
  children,
  locale,
  messages,
  timeZone,
}: RootProviderProps) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
      {children}
    </NextIntlClientProvider>
  );
}
