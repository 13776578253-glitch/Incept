'use client';

import { useEffect, useState } from 'react';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLanguage } from '@/hooks/use-language';
import { SettingsGroupSection } from '../shared/settings-renderer';
import { getSettingsPageData } from '../shared/settings-schema';

function useMounted() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted;
}

export function SettingsPageContent() {
  const mounted = useMounted();
  const { language, setLanguage } = useLanguage();
  const { colorScheme, setColorScheme } = useColorScheme();
  const settingsPage = getSettingsPageData(language);

  return (
    <div className="min-h-[calc(100vh-var(--navbar-height))] max-w-[820px] pb-10">
      <div className="space-y-10">
        {settingsPage.groups.map((group) => (
          <SettingsGroupSection
            key={group.id}
            group={group}
            theme={colorScheme}
            setTheme={setColorScheme}
            isThemeReady={mounted}
            language={language}
            setLanguage={setLanguage}
          />
        ))}
      </div>
    </div>
  );
}
