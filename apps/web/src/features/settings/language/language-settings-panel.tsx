'use client';

import { SegmentedControl, SettingsGroup, SettingsRow } from '@incept/ui';
import { BookOpen } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { writeBrowserDocumentLanguage } from '@/features/docs/language/preference';
import { useLanguage } from '@/hooks/use-language';
import type { AppLocale } from '@/i18n/config/locales';

export function LanguageSettingsPanel({ documentLanguage }: { documentLanguage: AppLocale }) {
  const { language, setLanguage } = useLanguage();
  const router = useRouter();
  const [readingLanguage, setReadingLanguage] = useState(documentLanguage);
  const isZh = language === 'zh';

  const rows = [
    {
      id: 'language-ui',
      label: isZh ? '界面语言' : 'Interface language',
      description: isZh ? '切换当前界面的主要显示语言' : 'Choose the language of the interface.',
      value: language,
      select: setLanguage,
    },
    {
      id: 'language-docs',
      label: isZh ? '文档语言' : 'Document language',
      description: isZh ? '优先展示所选语言的文档版本' : 'Prefer this language when reading documents.',
      value: readingLanguage,
      select: (value: AppLocale) => {
        setReadingLanguage(value);
        writeBrowserDocumentLanguage(value);
        router.refresh();
      },
    },
  ];

  const options = [
    { id: 'zh' as const, label: isZh ? '简体中文' : 'Simplified Chinese' },
    { id: 'en' as const, label: 'English' },
  ];

  return (
    <section id="language" className="max-w-[760px] space-y-7">
      <header className="space-y-1">
        <h2 className="text-[length:var(--text-xl)] font-semibold tracking-[-0.025em] text-[var(--color-text)]">
          {isZh ? '语言' : 'Language'}
        </h2>
        <p className="text-[length:var(--text-sm)] leading-relaxed text-[var(--color-text-muted)]">
          {isZh ? '分别设置站点界面和文档阅读的首选语言' : 'Configure display language for the interface and documents'}
        </p>
      </header>

      <SettingsGroup
        title={
          <span className="inline-flex items-center gap-2">
            <BookOpen aria-hidden="true" className="size-4 text-[var(--color-text-muted)]" strokeWidth={1.75} />
            <span>{isZh ? '阅读偏好' : 'Reading preferences'}</span>
          </span>
        }
      >
        {rows.map((row) => (
          <SettingsRow
            key={row.label}
            id={row.id}
            title={row.label}
            description={row.description}
            control={
              <SegmentedControl<AppLocale>
                ariaLabel={row.label}
                value={row.value}
                onValueChange={row.select}
                options={options}
              />
            }
          />
        ))}
      </SettingsGroup>
    </section>
  );
}
