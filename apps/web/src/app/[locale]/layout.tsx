import type { ReactNode } from 'react';

import { RootProvider } from '@/components/base/root-provider';
import { AppShell } from '@/components/layouts/containers/app-shell';
import { mountManifest, renderFloatingOverlays, renderLayoutSlot } from '@/mount/registry';

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
      {/* 浮层与命名插槽贡献位（slot: shell-after）：music 的 FloatingOverlay 由此注册 */}
      {renderFloatingOverlays(mountManifest)}
      {renderLayoutSlot(mountManifest, 'shell-after')}
    </RootProvider>
  );
}
