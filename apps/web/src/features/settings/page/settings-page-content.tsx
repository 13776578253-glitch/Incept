'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { findSettingsSectionContribution, mountManifest } from '@/mount/registry';
import { useEyeComfortFilter } from '@/hooks/use-eye-comfort-filter';
import { useDocsCodePaletteContext } from '@/components/base/docs-code-palette-provider';
import { useLanguage } from '@/hooks/use-language';
import { useMusicPlayerPreferences } from '@/hooks/use-music-player-preferences';
import type { MusicPlaybackMode } from '@/components/base/music-player-preferences-provider';

import { localeConfig, type AppLocale } from '@/i18n/config/locales';
import { withLocalePath } from '@/i18n/utils/locale-path';

import { AccountSettingsPanel } from '../account/account-settings-panel';
import { MusicAdminPanel } from '../music/music-admin-panel';
import { SettingsSectionPanel } from '../shared/settings-renderer';
import { getSettingsPageData } from '../shared/settings-schema';

import type { MusicAdminData } from '@incept/music/application';
import type { SettingsSection } from '../shared/settings-types';

function useMounted() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted;
}

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

// 曲目与曲库管理是音乐分区的一部分，只对 owner 出现 /数据由服务端页面传下来，非 owner 为 null
function MusicManagerBlock({
  section,
  locale,
  data,
}: {
  section: SettingsSection;
  locale: AppLocale;
  data: MusicAdminData | null;
}) {
  if (section.id !== 'music' || data === null) {
    return null;
  }

  return <MusicAdminPanel locale={locale} data={data} />;
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
  musicAdminData,
  settingsContributionData,
}: {
  viewerRole: 'guest' | 'pro' | 'owner';
  // 只有 owner 会拿到；其余角色为 null，管理区不渲染
  musicAdminData: MusicAdminData | null;
  // 注册表贡献分区的 loader 数据：owner 门控，非 owner 为 null
  settingsContributionData: Record<string, unknown>;
}) {
  const mounted = useMounted();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language, setLanguage } = useLanguage();
  const { colorScheme, setColorScheme } = useColorScheme();
  const {
    eyeComfortFilterEnabled,
    setEyeComfortFilter,
    isEyeComfortFilterReady,
  } = useEyeComfortFilter();
  const {
    codePalette,
    setCodePalette,
    isCodePaletteReady,
  } = useDocsCodePaletteContext();
  const {
    playbackRateLocked: musicPlaybackRateLocked,
    rememberPlacement: musicRememberPlacement,
    playbackMode: musicPlaybackMode,
    isReady: isMusicPreferencesReady,
    setPlaybackRateLocked: setMusicPlaybackRateLocked,
    setRememberPlacement: setMusicRememberPlacement,
    setPlaybackMode: setMusicPlaybackMode,
  } = useMusicPlayerPreferences();
  const page = getSettingsPageData(language);
  const requestedSection = searchParams.get('section');
  const returnTo = searchParams.get('returnTo');
  const selectedSection =
    page.sections.find((section) => section.id === requestedSection) ??
    page.sections[0];
  const interactions = {
    theme: colorScheme,
    setTheme: setColorScheme,
    isThemeReady: mounted,
    eyeComfortFilterEnabled,
    setEyeComfortFilter,
    isEyeComfortFilterReady,
    codePalette,
    setCodePalette,
    isCodePaletteReady,
    language,
    setLanguage,
    musicPlaybackRateLocked,
    setMusicPlaybackRateLocked,
    musicRememberPlacement,
    setMusicRememberPlacement,
    musicPlaybackMode,
    // 渲染层的分段控件只接受 string，这里把值收窄回播放模式
    setMusicPlaybackMode: (value: string) => setMusicPlaybackMode(value as MusicPlaybackMode),
    isMusicPreferencesReady,
  };
  const handleBack = () => {
    const returnPath = getLocalizedReturnPath(returnTo, language);

    if (returnPath) {
      router.replace(returnPath);
      return;
    }

    router.replace(`/${language}`);
  };

  return (
    <div className="min-h-[calc(100vh-var(--navbar-height))] max-w-[820px] pb-10">
      <button
        type="button"
        onClick={handleBack}
        className="mb-5 inline-flex items-center gap-2 rounded-[8px] px-1.5 py-1 text-[0.8125rem] font-medium text-[var(--color-nav-dropdown-description)] transition-colors hover:bg-[var(--color-nav-item-hover)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-text-soft)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
      >
        <span aria-hidden="true" className="text-[1.125rem] leading-none">
          &larr;
        </span>
        {language === 'zh' ? '返回' : 'Back'}
      </button>
      <header className="mb-10 space-y-1.5">
        <h1 className="text-[1.45rem] font-semibold tracking-[-0.03em] text-[var(--color-text)]">
          {page.title}
        </h1>
        <p className="max-w-3xl text-[0.8125rem] leading-6 text-[var(--color-nav-dropdown-description)]">
          {page.description}
        </p>
      </header>

      <div className="hidden lg:block">
        {selectedSection.id === 'account' ? (
          <AccountSettingsPanel language={language} viewerRole={viewerRole} />
        ) : findSettingsSectionContribution(mountManifest, selectedSection.id) ? (
          <ContributionSectionPanel section={selectedSection} data={settingsContributionData} />
        ) : (
          <div className="space-y-8">
            <SettingsSectionPanel section={selectedSection} {...interactions} />
            <MusicManagerBlock section={selectedSection} locale={language} data={musicAdminData} />
          </div>
        )}
      </div>

      <div className="space-y-12 lg:hidden">
        {page.sections.map((section) => (
          section.id === 'account' ? (
            <AccountSettingsPanel key={section.id} language={language} viewerRole={viewerRole} />
          ) : findSettingsSectionContribution(mountManifest, section.id) ? (
            <ContributionSectionPanel key={section.id} section={section} data={settingsContributionData} />
          ) : (
            <div key={section.id} className="space-y-8">
              <SettingsSectionPanel section={section} {...interactions} />
              <MusicManagerBlock section={section} locale={language} data={musicAdminData} />
            </div>
          )
        ))}
      </div>
    </div>
  );
}
