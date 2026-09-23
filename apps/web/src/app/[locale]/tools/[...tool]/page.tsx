import { notFound, redirect } from 'next/navigation';
import type { AppLocale } from '@/i18n/config/locales';

// 「工具」更名为「图谱」后，架构 / 路线图 / 关键词三条路径整体搬到 /atlas 下。
// 用 catch-all 而不是三个近重复文件；未在本表中的路径仍按 404 处理，不静默兜底。
const MOVED_TO_ATLAS = new Set(['architecture', 'roadmap', 'keywords']);

export default async function ToolsSplatRedirectPage({
  params,
}: {
  params: Promise<{ locale: AppLocale; tool: string[] }>;
}) {
  const { locale, tool } = await params;
  const segment = tool[0];

  if (segment && MOVED_TO_ATLAS.has(segment)) {
    redirect(`/${locale}/atlas/${segment}`);
  }

  notFound();
}
