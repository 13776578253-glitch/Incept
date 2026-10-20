'use client';

import type { SettingsOption, SettingsRow, SettingsSection } from './settings-types';

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

type SettingsInteractionProps = {
  theme: 'light' | 'dark' | 'system';
  setTheme: (value: 'light' | 'dark' | 'system') => void;
  isThemeReady: boolean;
  eyeComfortFilterEnabled: boolean;
  setEyeComfortFilter: (value: boolean) => void;
  isEyeComfortFilterReady: boolean;
  codePalette: 'vscode' | 'github' | 'vitesse';
  setCodePalette: (value: 'vscode' | 'github' | 'vitesse') => void;
  isCodePaletteReady: boolean;
  language: string;
  setLanguage: (value: 'zh' | 'en') => void;
};

function SettingsSegmentedControl({
  options,
  selected,
  onSelect,
  isInteractive = true,
}: {
  options: SettingsOption[];
  selected: string;
  onSelect: (id: string) => void;
  isInteractive?: boolean;
}) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1 rounded-full p-0.5">
      {options.map((option) => {
        const active = option.id === selected;

        return (
          <button
            key={option.id}
            type="button"
            disabled={!isInteractive}
            onClick={() => onSelect(option.id)}
            className={cx(
              'rounded-full px-3.5 py-1.5 text-[0.78rem] transition-all duration-150 outline-none focus:outline-none',
              active
                ? 'bg-[var(--color-bg)] font-medium text-[var(--color-text)] shadow-[var(--shadow-card-sm)]'
                : 'text-[var(--color-nav-dropdown-description)] hover:text-[var(--color-text)]',
              isInteractive && !active && 'hover:bg-[var(--color-bg)]/60',
              !isInteractive && 'cursor-default opacity-50',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function SettingsStaticControl({ row }: { row: SettingsRow }) {
  const baseClassName =
    'inline-flex min-h-9 items-center justify-between gap-3 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3.5 py-1.5 text-[0.8125rem] text-[var(--color-text)] shadow-[var(--shadow-card-sm)]';
  const mutedClassName =
    'border-[var(--color-border)] text-[var(--color-nav-dropdown-description)] opacity-80';

  if (row.controlType === 'status') {
    const isLocked = row.state === 'locked';

    return (
      <span
        className="inline-flex min-h-8 items-center gap-2 rounded-full border px-3 text-[0.78rem] font-medium shadow-[var(--shadow-card-sm)]"
        style={{
          color: isLocked ? 'var(--badge-amber-fg)' : 'var(--badge-emerald-fg)',
          backgroundColor: isLocked ? 'var(--badge-amber-bg)' : 'var(--badge-emerald-bg)',
          borderColor: isLocked ? 'var(--badge-amber-border)' : 'var(--badge-emerald-border)',
        }}
      >
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full"
          style={{
            backgroundColor: isLocked ? 'var(--badge-amber-dot)' : 'var(--badge-emerald-dot)',
          }}
        />
        <span>{row.value}</span>
      </span>
    );
  }

  if (row.controlType === 'button') {
    return (
      <button
        type="button"
        disabled
        className={cx(baseClassName, mutedClassName, 'min-w-[120px] rounded-full')}
      >
        {row.actionLabel ?? row.value}
      </button>
    );
  }

  if (row.controlType === 'input') {
    return (
      <div className="flex w-full max-w-[360px] items-center gap-2.5">
        <input
          disabled
          placeholder={row.placeholder}
          className="min-h-9 w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-[0.8125rem] text-[var(--color-nav-dropdown-description)] outline-none shadow-[var(--shadow-card-sm)] placeholder:text-[var(--color-nav-muted)]"
        />
        {row.actionLabel ? (
          <button
            type="button"
            disabled
            className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-4 text-[0.8125rem] font-medium text-[var(--color-nav-dropdown-description)] shadow-[var(--shadow-card-sm)] opacity-80"
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

function SettingsBooleanToggle({
  enabled,
  onToggle,
  isInteractive,
  labels,
}: {
  enabled: boolean;
  onToggle: () => void;
  isInteractive: boolean;
  labels: { enabled: string; disabled: string };
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={!isInteractive}
      onClick={onToggle}
      className={cx(
        'inline-flex min-h-7.5 items-center justify-center gap-1.5 rounded-full bg-[var(--color-bg)] px-3.5 text-[0.75rem] font-medium shadow-[var(--shadow-card-sm)] transition-all hover:bg-[color:var(--color-row-hover-bg)] active:scale-[0.98] focus:outline-none disabled:cursor-default disabled:opacity-50',
        enabled ? 'text-[var(--color-text)]' : 'text-[var(--color-nav-dropdown-description)]',
      )}
    >
      <span
        aria-hidden="true"
        className="size-1.5 rounded-full transition-colors"
        style={{
          backgroundColor: enabled ? 'var(--badge-emerald-dot)' : 'var(--color-nav-muted)',
        }}
      />
      <span>{enabled ? labels.enabled : labels.disabled}</span>
    </button>
  );
}

function SettingsRowControl({
  row,
  theme,
  setTheme,
  isThemeReady,
  eyeComfortFilterEnabled,
  setEyeComfortFilter,
  isEyeComfortFilterReady,
  codePalette,
  setCodePalette,
  isCodePaletteReady,
  language,
  setLanguage,
}: { row: SettingsRow } & SettingsInteractionProps) {
  if (row.controlType === 'theme-segmented') {
    const options: SettingsOption[] = row.options ?? [
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

  if (row.controlType === 'code-palette-segmented') {
    return (
      <SettingsSegmentedControl
        options={row.options ?? []}
        selected={isCodePaletteReady ? codePalette : ''}
        onSelect={(id) => setCodePalette(id as 'vscode' | 'github' | 'vitesse')}
        isInteractive={isCodePaletteReady && !eyeComfortFilterEnabled}
      />
    );
  }

  if (row.controlType === 'boolean-toggle') {
    const enabledLabel =
      row.options?.find((option) => option.id === 'enabled')?.label ?? 'On';
    const disabledLabel =
      row.options?.find((option) => option.id === 'disabled')?.label ?? 'Off';

    return (
      <SettingsBooleanToggle
        enabled={eyeComfortFilterEnabled}
        onToggle={() => setEyeComfortFilter(!eyeComfortFilterEnabled)}
        isInteractive={isEyeComfortFilterReady}
        labels={{ enabled: enabledLabel, disabled: disabledLabel }}
      />
    );
  }

  return <SettingsStaticControl row={row} />;
}

function SettingsRowView({ row, ...interactions }: { row: SettingsRow } & SettingsInteractionProps) {
  return (
    <div className="grid gap-3 py-3.5 sm:py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[0.875rem] font-medium tracking-[-0.01em] text-[var(--color-text)]">
            {row.label}
          </h3>
          {row.badge ? (
            <span className="rounded-full border border-[var(--surface-chip-border)] bg-[var(--surface-chip-bg)] px-2.5 py-0.5 text-[0.625rem] font-medium uppercase tracking-[0.08em] text-[var(--color-nav-muted)]">
              {row.badge}
            </span>
          ) : null}
        </div>
        <p className="max-w-2xl text-[0.8125rem] leading-relaxed text-[var(--color-nav-dropdown-description)]">
          {row.description}
        </p>
        {row.disabledHint && interactions.eyeComfortFilterEnabled ? (
          <p className="max-w-2xl text-[0.75rem] leading-5 text-[var(--color-text-soft)]">
            {row.disabledHint}
          </p>
        ) : null}
      </div>

      <div className="md:justify-self-end">
        <SettingsRowControl row={row} {...interactions} />
      </div>
    </div>
  );
}

function SettingsGroupIcon({ sectionId }: { sectionId: string }) {
  if (sectionId === 'appearance') {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="size-3.5"
        fill="none"
      >
        <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8 2.5v11a5.5 5.5 0 0 0 0-11Z" fill="currentColor" />
      </svg>
    );
  }

  if (sectionId === 'language') {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="size-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 3.5A2 2 0 0 1 4 2h4v10.5H4a2 2 0 0 0-2 1.5V3.5Z" />
        <path d="M14 3.5A2 2 0 0 0 12 2H8v10.5h4a2 2 0 0 1 2 1.5V3.5Z" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="8" r="5.5" />
    </svg>
  );
}

function SettingsRows({
  section,
  ...interactions
}: { section: SettingsSection } & SettingsInteractionProps) {
  // 二级分组：按出现顺序把连续同组的行切成若干段，段前插一个二级标题
  // 未标 group 的行沿用原来的一段连续列表，所以既有分区不受影响
  const rowGroups = section.rows.reduce<Array<{ label: string | null; rows: SettingsRow[] }>>(
    (accumulator, row) => {
      const label = row.group ?? null;
      const last = accumulator[accumulator.length - 1];

      if (last && last.label === label) {
        last.rows.push(row);
        return accumulator;
      }

      accumulator.push({ label, rows: [row] });
      return accumulator;
    },
    [],
  );

  const rows = (
    <div className="max-w-[760px] space-y-6">
      {rowGroups.map((group, index) => (
        <div
          key={group.label ?? `ungrouped-${index}`}
          className="space-y-4 rounded-2xl bg-[color:var(--color-row-bg)] p-4 sm:p-5"
        >
          {group.label ? (
            <div className="flex items-center gap-2.5">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg)] text-[var(--color-text)] shadow-[var(--shadow-card-sm)]">
                <SettingsGroupIcon sectionId={section.id} />
              </span>
              <h3 className="text-[0.9375rem] font-medium text-[var(--color-text)]">
                {group.label}
              </h3>
            </div>
          ) : null}
          <div className="divide-y divide-[var(--color-nav-dropdown-border)]">
            {group.rows.map((row) => (
              <SettingsRowView key={row.id} row={row} {...interactions} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  if (section.visibility !== 'admin') {
    return rows;
  }

  return (
    <details className="group max-w-[760px]">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-6 py-4 text-[0.8125rem] text-[var(--color-nav-dropdown-description)] transition-colors">
        <p>
          {interactions.language === 'zh'
            ? '访客默认折叠显示，后续验证管理员身份后可解锁真实操作'
            : 'Collapsed for visitors. Administrator verification will unlock these controls later.'}
        </p>
        <span className="shrink-0 text-xs uppercase tracking-[0.12em] text-[var(--color-nav-muted)] group-open:hidden">
          {interactions.language === 'zh' ? '展开' : 'Expand'}
        </span>
        <span className="hidden shrink-0 text-xs uppercase tracking-[0.12em] text-[var(--color-nav-muted)] group-open:inline">
          {interactions.language === 'zh' ? '收起' : 'Collapse'}
        </span>
      </summary>
      <div className="border-t border-[var(--color-nav-dropdown-border)] pt-1">
        {rows}
      </div>
    </details>
  );
}

export function SettingsSectionPanel({
  section,
  showDescription = true,
  ...interactions
}: { section: SettingsSection; showDescription?: boolean } & SettingsInteractionProps) {
  return (
    <section id={section.id} className="space-y-4">
      <header className="space-y-1.5">
        <h2 className="text-[1.18rem] font-semibold tracking-[-0.03em] text-[var(--color-text)]">
          {section.label}
        </h2>
        {showDescription && section.description ? (
          <p className="max-w-3xl text-[0.8125rem] leading-6 text-[var(--color-nav-dropdown-description)]">
            {section.description}
          </p>
        ) : null}
      </header>
      <SettingsRows section={section} {...interactions} />
    </section>
  );
}
