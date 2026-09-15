import { localeConfig } from '@/i18n/config/locales';

// 播放器不出现的路由。
//
// 这些都是"工具型"页面：读者/所有者在页面上做具体操作（改设置、审草稿、看组件目录），
// 一个浮层既会挡住内容，也没有"边听边读"的场景。
//
// 判据：把 locale 前缀去掉后，路径等于该前缀、或以 "前缀/" 开头都算命中。
// 因此 /en/studio/docs/library 与 /zh/settings?returnTo=... 都会被覆盖，
// 查询串不参与匹配（usePathname 本来也不返回它）。
const HIDDEN_ROUTE_PREFIXES = [
  '/settings',
  '/workspace',
  '/studio',
  '/docs/style-lab',
  '/docs/import-preview',
];

// 与 use-language 内部那份逻辑一致：把 /zh/docs/x 折成 /docs/x，把 /zh 折成 /。
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
