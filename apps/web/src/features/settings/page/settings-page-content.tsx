'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useEyeComfortFilter } from '@/hooks/use-eye-comfort-filter';
import { useDocsCodePaletteContext } from '@/components/base/docs-code-palette-provider';
import { useLanguage } from '@/hooks/use-language';
import { AccountSettingsPanel } from '../account/account-settings-panel';
import { SettingsSectionPanel } from '../shared/settings-renderer';
import { getSettingsPageData } from '../shared/settings-schema';

function useMounted() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted;
}

export function SettingsPageContent({
  viewerRole,
}: {
  viewerRole: 'guest' | 'pro' | 'owner';
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
  const page = getSettingsPageData(language);
  const requestedSection = searchParams.get('section');
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
  };
  const handleBack = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push(`/${language}`);
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
        ) : (
          <SettingsSectionPanel section={selectedSection} {...interactions} />
        )}
      </div>

      <div className="space-y-12 lg:hidden">
        {page.sections.map((section) => (
          section.id === 'account' ? (
            <AccountSettingsPanel key={section.id} language={language} viewerRole={viewerRole} />
          ) : (
            <SettingsSectionPanel key={section.id} section={section} {...interactions} />
          )
        ))}
      </div>
    </div>
  );
}
