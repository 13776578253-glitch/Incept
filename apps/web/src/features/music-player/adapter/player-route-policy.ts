import { localeConfig } from '@/i18n/config/locales';

// 路由不渲染播放器 UI
// 匹配方式：先去掉 locale 前缀，再按整段前缀比较（相等或以 "prefix/" 开头）
// 只隐藏 UI，不暂停播放
const HIDDEN_ROUTE_PREFIXES = [
  '/settings',
  '/workspace',
  '/studio',
  '/docs/style-lab',
  '/docs/import-preview',
];

export function toLocaleFreePath(pathname: string): string {
  const matchedLocale = localeConfig.locales.find(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );

  if (!matchedLocale) {
    return pathname;
  }

  return pathname === `/${matchedLocale}` ? '/' : pathname.slice(matchedLocale.length + 1);
}

export function isMusicPlayerHiddenRoute(pathname: string): boolean {
  const localeFreePath = toLocaleFreePath(pathname);

  return HIDDEN_ROUTE_PREFIXES.some(
    (prefix) => localeFreePath === prefix || localeFreePath.startsWith(`${prefix}/`),
  );
}
