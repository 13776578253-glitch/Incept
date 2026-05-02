import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import { localeConfig } from '@/i18n/config/locales';
import { getLocaleMessages } from '@/i18n/loaders/get-messages';

export default getRequestConfig(async ({ locale }) => {
  if (!hasLocale(localeConfig.locales, locale)) {
    notFound();
  }

  return {
    locale,
    messages: await getLocaleMessages(locale),
    timeZone: localeConfig.timeZone,
  };
});
