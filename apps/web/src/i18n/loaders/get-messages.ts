import type { AppLocale } from '@/i18n/config/locales';

// 并行加载翻译文件
export async function getLocaleMessages(locale: AppLocale) {
  // 待修改 / 考虑使用动态导入和懒加载的方式，按需加载翻译文件，减少初始加载时间
  const [navigation, home, docs, notes, about] = await Promise.all([
    import(`@/messages/${locale}/navigation.json`),
    import(`@/messages/${locale}/home.json`),
    import(`@/messages/${locale}/docs.json`),
    import(`@/messages/${locale}/notes.json`),
    import(`@/messages/${locale}/about.json`),
  ]);

  return {
    navigation: navigation.default,
    home: home.default,
    docs: docs.default,
    notes: notes.default,
    about: about.default,
  };
}
