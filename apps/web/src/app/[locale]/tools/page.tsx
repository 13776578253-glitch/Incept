import { redirect } from 'next/navigation';
import type { AppLocale } from '@/i18n/config/locales';

// 该路由曾作为「工具」栏目短暂出现在前台导航，现已改名为「图谱」。
// 保留重定向而不是直接 404，避免已存在的链接失效。
export default async function ToolsRedirectPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;

  redirect(`/${locale}/atlas`);
}
