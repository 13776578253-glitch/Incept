export const localeConfig = {
  locales: ['en', 'zh'] as const,
  defaultLocale: 'zh' as const,
  timeZone: 'Asia/Shanghai',
};

export type AppLocale = (typeof localeConfig.locales)[number];
