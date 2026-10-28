import type { AppLocale } from '@/i18n/config/locales';

// 并行加载翻译文件
export async function getLocaleMessages(locale: AppLocale) {
  // 待修改 / 考虑使用动态导入和懒加载的方式，按需加载翻译文件，减少初始加载时间
  const [navigation, docs, notes, about, roadmap, dashboard] = await Promise.all([
    import(`@/messages/${locale}/navigation.json`),
    import(`@/messages/${locale}/docs.json`),
    import(`@/messages/${locale}/notes.json`),
    import(`@/messages/${locale}/about.json`),
    import(`@/messages/${locale}/roadmap.json`),
    locale === 'zh'
      ? import('@incept/dashboard/messages/zh')
      : import('@incept/dashboard/messages/en'),
  ]);

  return {
    navigation: navigation.default,
    docs: docs.default,
    notes: notes.default,
    about: about.default,
    roadmap: roadmap.default,
    dashboard: dashboard.default,
  };
}
