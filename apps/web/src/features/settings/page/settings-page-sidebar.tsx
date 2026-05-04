'use client';

import { useLanguage } from '@/hooks/use-language';
import { getSettingsPageData } from '../shared/settings-schema';

function SettingsSidebar({
  items,
}: {
  items: Array<{ id: string; label: string; description?: string }>;
}) {
  return (
    <nav className="space-y-1.5">
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className="block rounded-[14px] border border-transparent px-3 py-2.5 transition-colors hover:border-[var(--color-nav-dropdown-border)] hover:bg-[var(--color-nav-item-hover)]"
        >
          <p className="text-[0.8125rem] font-medium text-[var(--color-text)]">
            {item.label}
          </p>
          {item.description ? (
            <p className="mt-0.5 text-[0.72rem] leading-5 text-[var(--color-nav-muted)]">
              {item.description}
            </p>
          ) : null}
        </a>
      ))}
    </nav>
  );
}

export function SettingsPageSidebar() {
  const { language } = useLanguage();
  const settingsPage = getSettingsPageData(language);

  return <SettingsSidebar items={settingsPage.sidebar} />;
}
