import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import { localeConfig } from '@/i18n/config/locales';
import { getLocaleMessages } from '@/i18n/loaders/get-messages';

export default getRequestConfig(async ({ locale, requestLocale }) => {
  const resolvedLocale = locale ?? (await requestLocale);

  if (!resolvedLocale || !hasLocale(localeConfig.locales, resolvedLocale)) {
    notFound();
  }

  return {
    locale: resolvedLocale,
    messages: await getLocaleMessages(resolvedLocale),
    timeZone: localeConfig.timeZone,
  };
});
