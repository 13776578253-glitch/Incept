import type { ReactNode } from 'react';

import { RootProvider } from '@/components/base/root-provider';
import { AppShell } from '@/components/layouts/containers/app-shell';

import { hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import { getLocaleMessages } from '@/i18n/loaders/get-messages';
import { localeConfig } from '@/i18n/config/locales';

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(localeConfig.locales, locale)) {
    notFound();
  }

  const messages = await getLocaleMessages(locale);

  return (
    <RootProvider
      locale={locale}
      messages={messages}
      timeZone={localeConfig.timeZone}
    >
      <AppShell>{children}</AppShell>
    </RootProvider>
  );
}
