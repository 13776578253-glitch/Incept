import type { AppLocale } from '@/i18n/config/locales';

export function withLocalePath(locale: AppLocale, path = '') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (normalizedPath === '/') {
    return `/${locale}`;
  }

  return `/${locale}${normalizedPath}`;
}
