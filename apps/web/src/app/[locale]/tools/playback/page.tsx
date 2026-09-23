import { redirect } from 'next/navigation';
import type { AppLocale } from '@/i18n/config/locales';

// 回放已移出图谱栏目：它是听内容的方式，而不是阅读项目的方式。
// 播放偏好与曲库都在设置页，因此直接指向那里。
export default async function PlaybackRedirectPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;

  redirect(`/${locale}/settings`);
}
