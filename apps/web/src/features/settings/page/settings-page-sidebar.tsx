'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useLanguage } from '@/hooks/use-language';
import { getSettingsPageData } from '../shared/settings-schema';

function SectionIcon({ id, active }: { id: string; active: boolean }) {
  const colorClass = active
    ? 'text-[var(--badge-sky-icon)]'
    : 'text-[var(--color-nav-muted)] group-hover:text-[var(--color-text)]';

  if (id === 'appearance') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" className={`size-3.5 shrink-0 transition-colors ${colorClass}`} fill="none">
        <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8 2.5v11a5.5 5.5 0 0 0 0-11Z" fill="currentColor" fillOpacity="0.24" />
      </svg>
    );
  }

  if (id === 'language') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" className={`size-3.5 shrink-0 transition-colors ${colorClass}`} fill="none">
        <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M2.75 8h10.5M8 2.5c1.6 1.5 2.4 3.4 2.4 5.5S9.6 12 8 13.5C6.4 12 5.6 10.1 5.6 8S6.4 4 8 2.5Z" stroke="currentColor" strokeWidth="1.25" />
      </svg>
    );
  }

  if (id === 'account') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" className={`size-3.5 shrink-0 transition-colors ${colorClass}`} fill="none">
        <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M3.5 13.25c.7-2.1 2.4-3.25 4.5-3.25s3.8 1.15 4.5 3.25" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }

  if (id === 'music') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" className={`size-3.5 shrink-0 transition-colors ${colorClass}`} fill="none">
        <path d="M6.5 11.5V4.2l6-1.2v7.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="5" cy="11.5" r="1.5" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="11" cy="10.3" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={`size-3.5 shrink-0 transition-colors ${colorClass}`} fill="none">
      <rect x="2.75" y="2.75" width="10.5" height="10.5" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.75 8h4.5M8 5.75v4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

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
    <nav aria-label={language === 'zh' ? '设置分区' : 'Settings sections'} className="space-y-1">
      {page.sections.map((section) => {
        const active = section.id === activeSection;
        const nextSearchParams = new URLSearchParams(searchParams.toString());

        nextSearchParams.set('section', section.id);

        return (
          <Link
            key={section.id}
            href={`${pathname}?${nextSearchParams.toString()}`}
            scroll={false}
            replace
            aria-current={active ? 'page' : undefined}
            className={`group block rounded-[12px] px-3 py-2.5 transition-colors ${
              active
                ? 'bg-[color:var(--color-row-hover-bg)]'
                : 'hover:bg-[color:var(--color-nav-item-hover)]'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-[0.8125rem] font-medium text-[var(--color-text)]">
                <SectionIcon id={section.id} active={active} />
                <span>{section.label}</span>
              </span>
              {active ? (
                <span
                  aria-hidden="true"
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: 'var(--badge-sky-dot)' }}
                />
              ) : null}
            </div>
            {section.description ? (
              <p className="mt-0.5 pl-5.5 text-[0.72rem] leading-5 text-[var(--color-nav-muted)]">
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
