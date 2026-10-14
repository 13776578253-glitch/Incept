'use client';

import type { MusicAdminData } from '@incept/music/application';

import type { MusicLocale } from '../locale';
import type { MusicPlaybackMode } from '../preferences/music-player-preferences-provider';
import { useMusicPlayerPreferences } from '../preferences/use-music-player-preferences';
import { MusicAdminPanel } from './music-admin-panel';

export function getMusicSettingsSectionLabel(locale: MusicLocale): string {
  return locale === 'zh' ? '音乐' : 'Music';
}

export function getMusicSettingsSectionDescription(locale: MusicLocale): string {
  return locale === 'zh' ? '播放器偏好与曲库' : 'Player preferences and libraries.';
}

// 分区文案
// history: 原 host 侧 music-schema 的文案已迁移至包内内聚管理
const SECTION_COPY: Record<
  MusicLocale,
  {
    group: string;
    rateLock: { label: string; description: string; enabled: string; disabled: string };
    placement: { label: string; description: string; enabled: string; disabled: string };
    playbackMode: {
      label: string;
      description: string;
      options: Array<{ id: MusicPlaybackMode; label: string }>;
    };
  }
> = {
  zh: {
    group: '播放器',
    rateLock: {
      label: '倍速锁定',
      description:
        '锁定后播放器固定在 1x，速度按钮仍可见但点击不会改变档位；解除后可切换 0.5x 到 2x',
      enabled: '锁定',
      disabled: '切换',
    },
    placement: {
      label: '记住悬浮位置',
      description: '记住播放器的吸附边、垂直位置与收起形态；关闭后回到默认位置，并且不再记忆',
      enabled: '开启',
      disabled: '关闭',
    },
    playbackMode: {
      label: '默认播放模式',
      description: '顺序播放在列表播完后暂停；列表循环回到第一首继续；单曲循环重复当前一首；随机播放永不停止',
      options: [
        { id: 'off', label: '顺序' },
        { id: 'all', label: '循环' },
        { id: 'one', label: '单曲' },
        { id: 'shuffle', label: '随机' },
      ],
    },
  },
  en: {
    group: 'Player',
    rateLock: {
      label: 'Speed lock',
      description:
        'Locked pins the player at 1x: the speed control stays visible but pressing it changes nothing; unlocking restores the 0.5x to 2x cycle',
      enabled: 'Locked',
      disabled: 'Switch',
    },
    placement: {
      label: 'Remember floating position',
      description:
        'Remembers the edge, vertical offset and collapsed shape; turning it off returns the player to its default position and stops remembering',
      enabled: 'On',
      disabled: 'Off',
    },
    playbackMode: {
      label: 'Default playback mode',
      description:
        'Sequential pauses when the list ends, repeat list continues from the first track, repeat one holds the current track, and shuffle never stops',
      options: [
        { id: 'off', label: 'Sequential' },
        { id: 'all', label: 'Repeat list' },
        { id: 'one', label: 'Repeat one' },
        { id: 'shuffle', label: 'Shuffle' },
      ],
    },
  },
};

// 控件与行布局沿用原 settings-renderer 的标记（随组件迁移，视觉零差）
function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

function SettingsSegmentedControl({
  options,
  selected,
  onSelect,
  isInteractive = true,
}: {
  options: Array<{ id: string; label: string }>;
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
              'rounded-full px-3 py-1.5 text-[0.78rem] transition-all duration-150 outline-none focus:outline-none',
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

function PreferenceRow({
  label,
  description,
  control,
}: {
  label: string;
  description: string;
  control: React.ReactNode;
}) {
  return (
    <div className="grid gap-3 py-3.5 sm:py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[0.875rem] font-medium tracking-[-0.01em] text-[var(--color-text)]">{label}</h3>
        </div>
        <p className="max-w-2xl text-[0.8125rem] leading-relaxed text-[var(--color-nav-dropdown-description)]">
          {description}
        </p>
      </div>

      <div className="md:justify-self-end">{control}</div>
    </div>
  );
}

// music 分区整块面板：3 行播放器偏好 + 整块曲库管理（owner 门控：data 为 null 时不渲染管理区）
// 7 个偏好字段在面板内部经 useMusicPlayerPreferences 读写
// history: 原 settings-renderer 的 7 个 props 现已内移至面板内部聚合读写
export function MusicSettingsPanel({
  locale,
  data,
}: {
  locale: MusicLocale;
  data: MusicAdminData | null;
}) {
  const copy = SECTION_COPY[locale];
  const {
    playbackRateLocked,
    setPlaybackRateLocked,
    rememberPlacement,
    setRememberPlacement,
    playbackMode,
    setPlaybackMode,
    isReady: isMusicPreferencesReady,
  } = useMusicPlayerPreferences();

  return (
    <div className="max-w-[760px] space-y-8">
      <section id="music" className="max-w-[760px] space-y-4">
        <header className="space-y-1.5">
          <h2 className="text-[1.18rem] font-semibold tracking-[-0.03em] text-[var(--color-text)]">
            {getMusicSettingsSectionLabel(locale)}
          </h2>
        </header>
        <div className="space-y-4 rounded-2xl bg-[color:var(--color-row-bg)] p-4 sm:p-5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg)] text-[var(--badge-violet-icon)] shadow-[var(--shadow-card-sm)]">
              <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 4h11M2.5 8h11M2.5 12h11M5 2.5v3M11 6.5v3M7 10.5v3" />
              </svg>
            </span>
            <h4 className="text-[0.9375rem] font-medium text-[var(--color-text)]">
              {copy.group}
            </h4>
          </div>

          <div className="divide-y divide-[var(--color-nav-dropdown-border)] pt-1">
            <PreferenceRow
              label={copy.rateLock.label}
              description={copy.rateLock.description}
              control={
                <SettingsBooleanToggle
                  enabled={playbackRateLocked}
                  onToggle={() => setPlaybackRateLocked(!playbackRateLocked)}
                  isInteractive={isMusicPreferencesReady}
                  labels={{ enabled: copy.rateLock.enabled, disabled: copy.rateLock.disabled }}
                />
              }
            />
            <PreferenceRow
              label={copy.placement.label}
              description={copy.placement.description}
              control={
                <SettingsBooleanToggle
                  enabled={rememberPlacement}
                  onToggle={() => setRememberPlacement(!rememberPlacement)}
                  isInteractive={isMusicPreferencesReady}
                  labels={{ enabled: copy.placement.enabled, disabled: copy.placement.disabled }}
                />
              }
            />
            <PreferenceRow
              label={copy.playbackMode.label}
              description={copy.playbackMode.description}
              control={
                <SettingsSegmentedControl
                  options={copy.playbackMode.options}
                  selected={isMusicPreferencesReady ? playbackMode : ''}
                  onSelect={(id) => setPlaybackMode(id as MusicPlaybackMode)}
                  isInteractive={isMusicPreferencesReady}
                />
              }
            />
          </div>
        </div>
      </section>
      {data === null ? null : <MusicAdminPanel locale={locale} data={data} />}
    </div>
  );
}
