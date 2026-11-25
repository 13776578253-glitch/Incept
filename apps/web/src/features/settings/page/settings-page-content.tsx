'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { localeConfig, type AppLocale } from '@/i18n/config/locales';
import { withLocalePath } from '@/i18n/utils/locale-path';
import { useLanguage } from '@/hooks/use-language';
import { findSettingsSectionContribution, mountManifest } from '@/mount/registry';
import { AccountSettingsPanel } from '../account/account-settings-panel';
import { AppearanceSettingsPanel } from '../appearance/appearance-settings-panel';
import { DashboardSettingsPanel } from '../dashboard/dashboard-settings-panel';
import { DocsSettingsPanel } from '../docs/docs-settings-panel';
import type { DocsLibraryPageModel } from '../docs/types';
import { LanguageSettingsPanel } from '../language/language-settings-panel';
import { ProjectSurfacesPanel } from '../projects/project-surfaces-panel';
import { getSettingsPageData } from '../shared/settings-schema';
import type { SettingsSection } from '../shared/settings-types';
import { useSettingsAnchorHighlight } from '../shared/use-settings-anchor-highlight';
import { SettingsMobileTabs } from './settings-page-sidebar';

function getLocalizedReturnPath(returnTo: string | null, locale: AppLocale) {
  if (!returnTo?.startsWith('/') || returnTo.startsWith('//')) {
    return null;
  }

  const [pathname, query = ''] = returnTo.split('?', 2);
  const sourceLocale = localeConfig.locales.find(
    (candidate) => pathname === `/${candidate}` || pathname.startsWith(`/${candidate}/`),
  );
  const localeFreePath = sourceLocale
    ? pathname === `/${sourceLocale}`
      ? '/'
      : pathname.slice(sourceLocale.length + 1)
    : pathname;

  // Never use a settings URL as a return destination: it would recreate the loop this button avoids.
  if (localeFreePath === '/settings' || localeFreePath.startsWith('/settings/')) {
    return null;
  }

  const localizedPath = withLocalePath(locale, localeFreePath);

  return query ? `${localizedPath}?${query}` : localizedPath;
}

// 注册表贡献分区：整块面板替代行渲染，数据来自服务端 loader
function ContributionSectionPanel({
  section,
  data,
}: {
  section: SettingsSection;
  data: Record<string, unknown>;
}) {
  const contribution = findSettingsSectionContribution(mountManifest, section.id);

  if (!contribution) {
    return null;
  }

  const Panel = contribution.panel;

  return <Panel data={data[section.id] ?? null} />;
}

export function SettingsPageContent({
  viewerRole,
  settingsContributionData,
  projects,
  documentLanguage,
  docs,
}: {
  viewerRole: 'guest' | 'pro' | 'owner';
  documentLanguage: AppLocale;
  docs: DocsLibraryPageModel | null;
  // 注册表贡献分区的 loader 数据：owner 门控，非 owner 为 null
  settingsContributionData: Record<string, unknown>;
  projects: Array<{ key: string; name: { en: string; zh: string }; roadmapEnabled: boolean; atlasEnabled: boolean }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language } = useLanguage();
  const page = getSettingsPageData(language, viewerRole === 'owner');
  const requestedSection = searchParams.get('section');
  const returnTo = searchParams.get('returnTo');
  const selectedSection =
    page.sections.find((section) => section.id === requestedSection) ??
    page.sections[0];

  useSettingsAnchorHighlight(selectedSection.id);

  const handleBack = () => {
    const returnPath = getLocalizedReturnPath(returnTo, language);

    if (returnPath) {
      router.replace(returnPath);
      return;
    }

    router.replace(`/${language}`);
  };

  return (
    <div className="min-h-[calc(100vh-var(--navbar-height))] max-w-[760px] pb-14">
      <button
        type="button"
        onClick={handleBack}
        className="-ml-2 mb-4 inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-md,10px)] px-2 py-1 text-[length:var(--text-sm)] font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-nav-item-hover)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)]"
      >
        <ArrowLeft aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
        <span>{language === 'zh' ? '返回' : 'Back'}</span>
      </button>

      <SettingsMobileTabs sections={page.sections} activeSectionId={selectedSection.id} />

      <div>
        {selectedSection.id === 'appearance' ? (
          <AppearanceSettingsPanel />
        ) : selectedSection.id === 'dashboard' ? (
          <DashboardSettingsPanel />
        ) : selectedSection.id === 'docs' && viewerRole === 'owner' && docs ? (
          <DocsSettingsPanel page={docs} />
        ) : selectedSection.id === 'projects' && viewerRole === 'owner' ? (
          <ProjectSurfacesPanel initialProjects={projects} language={language} />
        ) : selectedSection.id === 'language' ? (
          <LanguageSettingsPanel documentLanguage={documentLanguage} />
        ) : selectedSection.id === 'account' ? (
          <AccountSettingsPanel language={language} viewerRole={viewerRole} />
        ) : findSettingsSectionContribution(mountManifest, selectedSection.id) ? (
          <ContributionSectionPanel section={selectedSection} data={settingsContributionData} />
        ) : null}
      </div>
    </div>
  );
}
