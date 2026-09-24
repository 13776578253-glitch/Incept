// 路由不渲染播放器 UI
// 匹配方式：先去掉 locale 前缀，再按整段前缀比较（相等或以 "prefix/" 开头）
// 只隐藏 UI，不暂停播放
export type MusicPlayerRoutePolicyConfig = {
  locales: readonly string[];
  hiddenRoutePrefixes: readonly string[];
};

export function toLocaleFreePath(pathname: string, locales: readonly string[]): string {
  const matchedLocale = locales.find(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );

  if (!matchedLocale) {
    return pathname;
  }

  return pathname === `/${matchedLocale}` ? '/' : pathname.slice(matchedLocale.length + 1);
}

// locales 与隐藏路由清单由 mount 配置传入
// history: 隐藏路由清单原为包内内置，现由宿主 mount 配置显式传入
export function createMusicPlayerRoutePolicy(config: MusicPlayerRoutePolicyConfig) {
  return {
    isMusicPlayerHiddenRoute(pathname: string): boolean {
      const localeFreePath = toLocaleFreePath(pathname, config.locales);

      return config.hiddenRoutePrefixes.some(
        (prefix) => localeFreePath === prefix || localeFreePath.startsWith(`${prefix}/`),
      );
    },
  };
}
