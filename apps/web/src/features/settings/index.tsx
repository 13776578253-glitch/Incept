'use client';

import { useEffect, useState } from 'react';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLanguage } from '@/hooks/use-language';
import { getSettingsPageMock } from '@/lib/mock/pages/settings/settings-page.mock';
import type {
  MockSettingsAnchor,
  MockSettingsDomain,
  MockSettingsGroup,
  MockSettingsOption,
  MockSettingsRow,
} from '@/lib/mock/shared/mock-types';

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

function useMounted() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted;
}

function SettingsSidebar({ items }: { items: MockSettingsAnchor[] }) {
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

function SettingsSegmentedControl({
  options,
  selected,
  onSelect,
  isInteractive = true,
}: {
  options: MockSettingsOption[];
  selected: string;
  onSelect: (id: string) => void;
  isInteractive?: boolean;
}) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1.5 rounded-[12px] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-nav-dropdown-bg)] p-1">
      {options.map((option) => {
        const active = isInteractive && option.id === selected;

        return (
          <button
            key={option.id}
            type="button"
            disabled={!isInteractive}
            onClick={() => onSelect(option.id)}
            className={cx(
              'rounded-[9px] px-2.5 py-1.5 text-[0.8125rem] transition-colors',
              active
                ? 'bg-[var(--color-nav-item-active)] text-[var(--color-text)]'
                : 'text-[var(--color-nav-dropdown-description)]',
              isInteractive &&
                !active &&
                'hover:bg-[var(--color-nav-item-hover)] hover:text-[var(--color-text)]',
              !isInteractive && 'cursor-default opacity-80',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function SettingsStaticControl({ row }: { row: MockSettingsRow }) {
  const baseClassName =
    'inline-flex min-h-10 items-center justify-between gap-3 rounded-[12px] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-nav-dropdown-bg)] px-3.5 py-2 text-[0.8125rem] text-[var(--color-text)]';
  const mutedClassName =
    'border-[var(--color-nav-dropdown-border)] text-[var(--color-nav-dropdown-description)] opacity-80';

  if (row.controlType === 'status') {
    return (
      <span
        className={cx(
          'inline-flex min-h-10 items-center rounded-full border px-3.5 text-[0.8125rem]',
          row.state === 'locked'
            ? 'border-[var(--color-nav-dropdown-border)] text-[var(--color-nav-dropdown-description)]'
            : 'border-[var(--color-nav-dropdown-border)] text-[var(--color-text)]',
        )}
      >
        {row.value}
      </span>
    );
  }

  if (row.controlType === 'button') {
    return (
      <button
        type="button"
        disabled
        className={cx(baseClassName, mutedClassName, 'min-w-[120px]')}
      >
        {row.actionLabel ?? row.value}
      </button>
    );
  }

  if (row.controlType === 'input') {
    return (
      <div className="flex w-full max-w-[360px] items-center gap-3">
        <input
          disabled
          placeholder={row.placeholder}
          className="min-h-10 w-full rounded-[12px] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-nav-dropdown-bg)] px-3.5 text-[0.8125rem] text-[var(--color-nav-dropdown-description)] outline-none placeholder:text-[var(--color-nav-muted)]"
        />
        {row.actionLabel ? (
          <button
            type="button"
            disabled
            className={cx(baseClassName, mutedClassName, 'shrink-0')}
          >
            {row.actionLabel}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cx(baseClassName, row.state === 'locked' && mutedClassName)}>
      <span>{row.value}</span>
      <span className="text-xs text-[var(--color-nav-muted)]">v</span>
    </div>
  );
}

function SettingsRowControl({
  row,
  theme,
  setTheme,
  isThemeReady,
  language,
  setLanguage,
}: {
  row: MockSettingsRow;
  theme: 'light' | 'dark' | 'system';
  setTheme: (value: 'light' | 'dark' | 'system') => void;
  isThemeReady: boolean;
  language: string;
  setLanguage: (value: 'zh' | 'en') => void;
}) {
  if (row.controlType === 'theme-segmented') {
    const options: MockSettingsOption[] = row.options ?? [
      { id: 'light', label: language === 'zh' ? '亮色' : 'Light' },
      { id: 'dark', label: language === 'zh' ? '暗色' : 'Dark' },
      { id: 'system', label: language === 'zh' ? '跟随系统' : 'System' },
    ];

    return (
      <SettingsSegmentedControl
        options={options}
        selected={isThemeReady ? theme : ''}
        onSelect={(id) => setTheme(id as 'light' | 'dark' | 'system')}
        isInteractive={isThemeReady}
      />
    );
  }

  if (row.controlType === 'language-segmented') {
    return (
      <SettingsSegmentedControl
        options={row.options ?? []}
        selected={language}
        onSelect={(id) => setLanguage(id as 'zh' | 'en')}
      />
    );
  }

  return <SettingsStaticControl row={row} />;
}

function SettingsRow({
  row,
  theme,
  setTheme,
  isThemeReady,
  language,
  setLanguage,
}: {
  row: MockSettingsRow;
  theme: 'light' | 'dark' | 'system';
  setTheme: (value: 'light' | 'dark' | 'system') => void;
  isThemeReady: boolean;
  language: string;
  setLanguage: (value: 'zh' | 'en') => void;
}) {
  return (
    <div className="grid gap-3 px-4 py-3.5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:px-5">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-[0.9375rem] font-medium text-[var(--color-text)]">
            {row.label}
          </h4>
          {row.badge ? (
            <span className="rounded-full border border-[var(--color-nav-dropdown-border)] px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.12em] text-[var(--color-nav-muted)]">
              {row.badge}
            </span>
          ) : null}
        </div>
        <p className="max-w-2xl text-[0.8125rem] leading-6 text-[var(--color-nav-dropdown-description)]">
          {row.description}
        </p>
      </div>

      <div className="md:justify-self-end">
        <SettingsRowControl
          row={row}
          theme={theme}
          setTheme={setTheme}
          isThemeReady={isThemeReady}
          language={language}
          setLanguage={setLanguage}
        />
      </div>
    </div>
  );
}

function SettingsDomainSection({
  domain,
  theme,
  setTheme,
  isThemeReady,
  language,
  setLanguage,
}: {
  domain: MockSettingsDomain;
  theme: 'light' | 'dark' | 'system';
  setTheme: (value: 'light' | 'dark' | 'system') => void;
  isThemeReady: boolean;
  language: string;
  setLanguage: (value: 'zh' | 'en') => void;
}) {
  const domainBody = (
    <div className="max-w-[760px] rounded-[18px] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-nav-dropdown-bg)]">
      {domain.rows.map((row, index) => (
        <div
          key={row.id}
          className={cx(
            index !== 0 && 'border-t border-[var(--color-nav-dropdown-border)]',
          )}
        >
          <SettingsRow
            row={row}
            theme={theme}
            setTheme={setTheme}
            isThemeReady={isThemeReady}
            language={language}
            setLanguage={setLanguage}
          />
        </div>
      ))}
    </div>
  );

  return (
    <section id={domain.anchorId} className="scroll-mt-28 space-y-2.5">
      <div className="space-y-1">
        <h3 className="text-[1.18rem] font-semibold tracking-[-0.03em] text-[var(--color-text)]">
          {domain.label}
        </h3>
        {domain.description ? (
          <p className="max-w-3xl text-[0.8125rem] leading-6 text-[var(--color-nav-dropdown-description)]">
            {domain.description}
          </p>
        ) : null}
      </div>

      {domain.visibility === 'admin' ? (
        <details className="group max-w-[760px]" open={domain.defaultExpanded}>
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-[16px] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-nav-dropdown-bg)] px-4 py-3.5 text-[0.8125rem] text-[var(--color-nav-dropdown-description)] transition-colors hover:bg-[var(--color-nav-item-hover)]">
            <div className="space-y-1">
              <p className="font-medium text-[var(--color-text)]">{domain.label}</p>
              <p>
                {language === 'zh'
                  ? '访客默认折叠显示，后续验证管理员身份后可解锁真实操作。'
                  : 'Collapsed by default for visitors. Admin verification will unlock real controls later.'}
              </p>
            </div>
            <span className="text-xs uppercase tracking-[0.12em] text-[var(--color-nav-muted)] group-open:hidden">
              {language === 'zh' ? '展开' : 'Expand'}
            </span>
            <span className="hidden text-xs uppercase tracking-[0.12em] text-[var(--color-nav-muted)] group-open:inline">
              {language === 'zh' ? '收起' : 'Collapse'}
            </span>
          </summary>
          <div className="mt-3">{domainBody}</div>
        </details>
      ) : (
        domainBody
      )}
    </section>
  );
}

function SettingsGroupSection({
  group,
  theme,
  setTheme,
  isThemeReady,
  language,
  setLanguage,
}: {
  group: MockSettingsGroup;
  theme: 'light' | 'dark' | 'system';
  setTheme: (value: 'light' | 'dark' | 'system') => void;
  isThemeReady: boolean;
  language: string;
  setLanguage: (value: 'zh' | 'en') => void;
}) {
  return (
    <section className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-[1.45rem] font-semibold tracking-[-0.03em] text-[var(--color-text)]">
          {group.title}
        </h2>
        {group.description ? (
          <p className="max-w-3xl text-[0.8125rem] leading-6 text-[var(--color-nav-dropdown-description)]">
            {group.description}
          </p>
        ) : null}
      </header>

      <div className="space-y-7">
        {group.domains.map((domain) => (
          <SettingsDomainSection
            key={domain.id}
            domain={domain}
            theme={theme}
            setTheme={setTheme}
            isThemeReady={isThemeReady}
            language={language}
            setLanguage={setLanguage}
          />
        ))}
      </div>
    </section>
  );
}

export function SettingsPageSidebar() {
  const { language } = useLanguage();
  const settingsPage = getSettingsPageMock(language);

  return <SettingsSidebar items={settingsPage.sidebar} />;
}

export function SettingsPageContent() {
  const mounted = useMounted();
  const { language, setLanguage } = useLanguage();
  const { colorScheme, setColorScheme } = useColorScheme();
  const settingsPage = getSettingsPageMock(language);

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
