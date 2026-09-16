import { localeConfig } from '@/i18n/config/locales';

// Routes where the player does not appear.
//
// These are all "tool" pages: the reader/owner performs concrete actions on the
// page (changing settings, reviewing drafts, browsing the component catalog).
// An overlay would block the content, and there is no "listen while reading"
// scenario anyway.
//
// Criterion: after stripping the locale prefix, a path matches if it equals that
// prefix or starts with "prefix/". So /en/studio/docs/library and
// /zh/settings?returnTo=... are both covered, and the query string does not
// participate in matching (usePathname doesn't return it anyway).
const HIDDEN_ROUTE_PREFIXES = [
  '/settings',
  '/workspace',
  '/studio',
  '/docs/style-lab',
  '/docs/import-preview',
];

// Consistent with the logic inside use-language: folds /zh/docs/x into /docs/x and /zh into /.
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
