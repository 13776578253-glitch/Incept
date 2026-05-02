import type { AppLocale } from '@/i18n/config/locales';

// 并行加载翻译文件
export async function getLocaleMessages(locale: AppLocale) {
  // 待修改 / 如果翻译文件较多，可以考虑使用动态导入和懒加载的方式，按需加载翻译文件，减少初始加载时间
  const [common, navigation, home, workspace, settings] = await Promise.all([
    import(`@/messages/${locale}/common.json`),
    import(`@/messages/${locale}/navigation.json`),
    import(`@/messages/${locale}/home.json`),
    import(`@/messages/${locale}/workspace.json`),
    import(`@/messages/${locale}/settings.json`),
  ]);

  return {
    common: common.default,
    navigation: navigation.default,
    home: home.default,
    workspace: workspace.default,
    settings: settings.default,
  };
}
