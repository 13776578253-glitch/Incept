'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import type { AppLocale } from '@/i18n/config/locales';
import { localeConfig } from '@/i18n/config/locales';
import { withLocalePath } from '@/i18n/utils/locale-path';

function stripLocalePrefix(pathname: string, locale: AppLocale) {
  if (pathname === `/${locale}`) {
    return '/';
  }

  if (pathname.startsWith(`/${locale}/`)) {
    return pathname.slice(locale.length + 1);
  }

  return pathname;
}

export function useLanguage() {
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const pathname = usePathname();

  const setLanguage = (nextLocale: AppLocale) => {
    if (!localeConfig.locales.includes(nextLocale)) {
      return;
    }

    const nextPath = withLocalePath(
      nextLocale,
      stripLocalePrefix(pathname, locale),
    );

    router.push(nextPath);
  };

  return {
    language: locale,
    locales: localeConfig.locales,
    setLanguage,
  };
}
