'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/hooks/use-language';
import type { AppLocale } from '@/i18n/config/locales';
import { writeBrowserDocumentLanguage } from '@/features/docs/language/preference';

export function LanguageSettingsPanel({ documentLanguage }: { documentLanguage: AppLocale }) {
  const { language, setLanguage } = useLanguage();
  const router = useRouter();
  const [readingLanguage, setReadingLanguage] = useState(documentLanguage);
  const isZh = language === 'zh';
  const rows = [
    { label: isZh ? '界面语言' : 'Interface language', description: isZh ? '切换当前界面的主要显示语言' : 'Choose the language of the interface.',
      value: language, select: setLanguage },
    { label: isZh ? '文档语言' : 'Document language', description: isZh ? '优先展示所选语言的文档版本' : 'Prefer this language when reading documents.',
      value: readingLanguage, select: (value: AppLocale) => { setReadingLanguage(value); writeBrowserDocumentLanguage(value); router.refresh(); } },
  ];
  return <section id="language" className="space-y-4">
    <h2 className="text-[1.18rem] font-semibold tracking-[-0.03em] text-[var(--color-text)]">{isZh ? '语言' : 'Language'}</h2>
    <div className="max-w-[760px] space-y-5 rounded-2xl bg-[color:var(--color-row-bg)] p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg)] text-[var(--color-text)] shadow-[var(--shadow-card-sm)]">
          <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3.5A2 2 0 0 1 4 2h4v10.5H4a2 2 0 0 0-2 1.5V3.5Z" />
            <path d="M14 3.5A2 2 0 0 0 12 2H8v10.5h4a2 2 0 0 1 2 1.5V3.5Z" />
          </svg>
        </span>
        <h3 className="text-[0.9375rem] font-medium text-[var(--color-text)]">{isZh ? '阅读偏好' : 'Reading preferences'}</h3>
      </div>
      <div className="divide-y divide-[var(--color-nav-dropdown-border)]">
        {rows.map(row => <div key={row.label} className="grid gap-4 py-4 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="space-y-1.5">
            <h4 className="text-[0.9375rem] font-medium text-[var(--color-text)]">{row.label}</h4>
            <p className="text-[0.8125rem] leading-relaxed text-[var(--color-nav-dropdown-description)]">{row.description}</p>
          </div>
          <div role="group" aria-label={row.label} className="inline-flex w-fit items-center gap-1 rounded-full p-0.5">
            {(['zh', 'en'] as const).map(value => <button key={value} type="button" aria-pressed={row.value === value} onClick={() => row.select(value)}
              className={`rounded-full px-3.5 py-1.5 text-[0.78rem] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-text-soft)] ${row.value === value ? 'bg-[var(--color-bg)] font-medium text-[var(--color-text)] shadow-[var(--shadow-card-sm)]' : 'text-[var(--color-nav-dropdown-description)] hover:bg-[var(--color-bg)]/60 hover:text-[var(--color-text)]'}`}>
              {value === 'zh' ? isZh ? '简体中文' : 'Simplified Chinese' : 'English'}
            </button>)}
          </div>
        </div>)}
      </div>
    </div>
  </section>;
}
