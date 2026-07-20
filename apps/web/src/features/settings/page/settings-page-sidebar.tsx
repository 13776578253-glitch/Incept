'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useLanguage } from '@/hooks/use-language';
import { getSettingsPageData } from '../shared/settings-schema';

function SettingsSidebar() {
  const { language } = useLanguage();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const page = getSettingsPageData(language);
  const requestedSection = searchParams.get('section');
  const activeSection = page.sections.some((section) => section.id === requestedSection)
    ? requestedSection
    : 'appearance';

  return (
    <nav aria-label={language === 'zh' ? '设置分区' : 'Settings sections'} className="space-y-1.5">
      {page.sections.map((section) => {
        const active = section.id === activeSection;

        return (
          <Link
            key={section.id}
            href={{ pathname, query: { section: section.id } }}
            scroll={false}
            replace
            aria-current={active ? 'page' : undefined}
            className={`block rounded-[14px] border px-3 py-2.5 transition-colors ${
              active
                ? 'border-[color:color-mix(in_srgb,var(--color-text)_8%,transparent)] bg-[color:color-mix(in_srgb,var(--color-text)_4%,transparent)]'
                : 'border-transparent hover:border-[var(--color-nav-dropdown-border)] hover:bg-[var(--color-nav-item-hover)]'
            }`}
          >
            <p className="text-[0.8125rem] font-medium text-[var(--color-text)]">
              {section.label}
            </p>
            {section.description ? (
              <p className="mt-0.5 text-[0.72rem] leading-5 text-[var(--color-nav-muted)]">
                {section.description}
              </p>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function SettingsPageSidebar() {
  return <SettingsSidebar />;
}
