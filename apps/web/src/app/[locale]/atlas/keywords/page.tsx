import { WorkspaceShell } from '@/components/layouts/containers/workspace-shell';
import { AtlasPlaceholderScreen } from '@/features/atlas';
import type { AppLocale } from '@/i18n/config/locales';
import { getTranslations } from 'next-intl/server';

// 关键词图：尚未绘制，本文件就是它完成后的接线位置
export default async function KeywordsMapPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'atlas' });

  return (
    <WorkspaceShell>
      <AtlasPlaceholderScreen locale={locale} t={t} title={t('items.keywords.label')} />
    </WorkspaceShell>
  );
}
