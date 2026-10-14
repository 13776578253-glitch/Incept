import { localeConfig, type AppLocale } from '@/i18n/config/locales';

export const DOCUMENT_LANGUAGE_COOKIE = 'incept-document-language';
export const isDocumentLanguage = (value: unknown): value is AppLocale => value === 'zh' || value === 'en';

export function readBrowserDocumentLanguage(): AppLocale | null {
  const value = document.cookie.split('; ').find(part => part.startsWith(`${DOCUMENT_LANGUAGE_COOKIE}=`))?.split('=')[1];
  return isDocumentLanguage(value) ? value : null;
}

export function writeBrowserDocumentLanguage(locale: AppLocale) {
  if (!localeConfig.locales.includes(locale)) return;
  document.cookie = `${DOCUMENT_LANGUAGE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
}
