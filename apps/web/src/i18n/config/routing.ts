import { defineRouting } from 'next-intl/routing';
import { localeConfig } from '@/i18n/config/locales';

export const routing = defineRouting({
  locales: [...localeConfig.locales],
  defaultLocale: localeConfig.defaultLocale,
});
