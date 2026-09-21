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
  musicPlaybackRateLocked: boolean;
  setMusicPlaybackRateLocked: (value: boolean) => void;
  musicRememberPlacement: boolean;
  setMusicRememberPlacement: (value: boolean) => void;
  musicPlaybackMode: string;
  setMusicPlaybackMode: (value: string) => void;
  isMusicPreferencesReady: boolean;
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
    <div className="inline-flex flex-wrap items-center gap-1.5 rounded-[12px] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-nav-dropdown-bg)] p-1">
      {options.map((option) => {
        const active = option.id === selected;

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

function SettingsStaticControl({ row }: { row: SettingsRow }) {
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
        'inline-flex rounded-[12px] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-nav-dropdown-bg)] p-1 text-[0.8125rem] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-text-soft)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]',
        !enabled &&
          'hover:border-[var(--color-nav-search-hover-border)] hover:text-[var(--color-text)]',
        !isInteractive && 'cursor-default opacity-80',
      )}
    >
      <span
        className={cx(
          'inline-flex min-h-8 items-center justify-center rounded-[8px] px-3 py-1 text-[var(--color-nav-dropdown-description)] transition-colors',
          enabled && 'bg-[var(--color-nav-item-active)] text-[var(--color-text)]',
        )}
      >
        {enabled ? labels.enabled : labels.disabled}
      </span>
    </button>
  );
}

// 开关文案由各分区在 options 里给出：同一个开关控件在不同分区含义不同，不能写死。
// 兜底值只在分区漏配时生效。
function resolveToggleLabels(row: SettingsRow, enabledFallback: string, disabledFallback: string) {
  const enabled = row.options?.find((option) => option.id === 'enabled')?.label;
  const disabled = row.options?.find((option) => option.id === 'disabled')?.label;

  return {
    enabled: enabled ?? enabledFallback,
    disabled: disabled ?? disabledFallback,
  };
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
  musicPlaybackRateLocked,
  setMusicPlaybackRateLocked,
  musicRememberPlacement,
  setMusicRememberPlacement,
  musicPlaybackMode,
  setMusicPlaybackMode,
  isMusicPreferencesReady,
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

  if (row.controlType === 'music-rate-lock-toggle') {
    return (
      <SettingsBooleanToggle
        enabled={musicPlaybackRateLocked}
        onToggle={() => setMusicPlaybackRateLocked(!musicPlaybackRateLocked)}
        isInteractive={isMusicPreferencesReady}
        labels={resolveToggleLabels(row, 'Locked', 'Unlocked')}
      />
    );
  }

  if (row.controlType === 'music-placement-toggle') {
    return (
      <SettingsBooleanToggle
        enabled={musicRememberPlacement}
        onToggle={() => setMusicRememberPlacement(!musicRememberPlacement)}
        isInteractive={isMusicPreferencesReady}
        labels={resolveToggleLabels(row, 'Remembered', 'Default')}
      />
    );
  }

  if (row.controlType === 'music-playback-mode-segmented') {
    return (
      <SettingsSegmentedControl
        options={row.options ?? []}
        selected={isMusicPreferencesReady ? musicPlaybackMode : ''}
        onSelect={setMusicPlaybackMode}
        isInteractive={isMusicPreferencesReady}
      />
    );
  }

  return <SettingsStaticControl row={row} />;
}

function SettingsRowView({ row, ...interactions }: { row: SettingsRow } & SettingsInteractionProps) {
  return (
    <div className="grid gap-4 px-0 py-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[0.9375rem] font-medium text-[var(--color-text)]">
            {row.label}
          </h3>
          {row.badge ? (
            <span className="rounded-full border border-[var(--color-nav-dropdown-border)] px-2 py-0.5 text-[0.62rem] uppercase tracking-[0.12em] text-[var(--color-nav-muted)] opacity-80">
              {row.badge}
            </span>
          ) : null}
        </div>
        <p className="max-w-2xl text-[0.8125rem] leading-6 text-[var(--color-nav-dropdown-description)]">
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
    <div className="max-w-[760px]">
      {rowGroups.map((group, index) => (
        // 首段不加上间距，否则分区标题下会多出一块空白
        <div key={group.label ?? `ungrouped-${index}`} className={index === 0 ? undefined : 'pt-8'}>
          {group.label ? (
            <h3 className="pb-3 text-[1.0625rem] font-semibold tracking-[-0.01em] text-[var(--color-text)]">
              {group.label}
            </h3>
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
  ...interactions
}: { section: SettingsSection } & SettingsInteractionProps) {
  return (
    <section id={section.id} className="space-y-3">
      <header className="space-y-1.5">
        <h2 className="text-[1.18rem] font-semibold tracking-[-0.03em] text-[var(--color-text)]">
          {section.label}
        </h2>
        {section.description ? (
          <p className="max-w-3xl text-[0.8125rem] leading-6 text-[var(--color-nav-dropdown-description)]">
            {section.description}
          </p>
        ) : null}
      </header>
      <SettingsRows section={section} {...interactions} />
    </section>
  );
}
