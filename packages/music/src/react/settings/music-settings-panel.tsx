'use client';

import type { MusicAdminData } from '@incept/music/application';
import { SegmentedControl, SettingsGroup, SettingsRow, Switch, UnderlineTabs } from '@incept/ui';
import { SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { MusicLocale } from '../locale';
import type { MusicPlaybackMode } from '../preferences/music-player-preferences-provider';
import { useMusicPlayerPreferences } from '../preferences/use-music-player-preferences';
import { MusicAdminPanel } from './music-admin-panel';

export function getMusicSettingsSectionLabel(locale: MusicLocale): string {
  return locale === 'zh' ? '音乐' : 'Music';
}

export function getMusicSettingsSectionDescription(locale: MusicLocale): string {
  return locale === 'zh' ? '播放器偏好与曲库' : 'Player preferences and libraries';
}

// 分区文案
// history: 原 host 侧 music-schema 的文案已迁移至包内内聚管理
const SECTION_COPY: Record<
  MusicLocale,
  {
    group: string;
    player: { label: string; description: string; enabled: string; disabled: string };
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
    player: { label: '启用音乐播放器', description: '控制当前浏览器所有页面的悬浮播放器', enabled: '开启', disabled: '关闭' },
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
    player: { label: 'Music player', description: 'Show the floating player across this browser', enabled: 'On', disabled: 'Off' },
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

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

// 浏览器播放器开关与偏好；Owner 曲库管理不受播放器开关影响。
export function MusicSettingsPanel({
  locale,
  data,
}: {
  locale: MusicLocale;
  data: MusicAdminData | null;
}) {
  const copy = SECTION_COPY[locale];
  const {
    playerEnabled,
    setPlayerEnabled,
    playbackRateLocked,
    setPlaybackRateLocked,
    rememberPlacement,
    setRememberPlacement,
    playbackMode,
    setPlaybackMode,
    isReady: isMusicPreferencesReady,
  } = useMusicPlayerPreferences();

  const [activeTab, setActiveTab] = useState<'preferences' | 'library'>('preferences');

  useEffect(() => {
    const syncFromUrl = () => {
      const tab = new URLSearchParams(window.location.search).get('tab');
      if (tab === 'library' || tab === 'preferences') {
        setActiveTab(tab);
      }
    };
    syncFromUrl();

    const handleNavigate = (event: Event) => {
      const detail = (event as CustomEvent<{ sectionId?: string; tabId?: string }>).detail;
      if (detail?.sectionId === 'music' && (detail.tabId === 'library' || detail.tabId === 'preferences')) {
        setActiveTab(detail.tabId);
      }
    };
    window.addEventListener('incept:settings-navigate', handleNavigate);
    return () => window.removeEventListener('incept:settings-navigate', handleNavigate);
  }, []);

  const selectTab = (next: 'preferences' | 'library') => {
    setActiveTab(next);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (next === 'preferences') {
        url.searchParams.delete('tab');
      } else {
        url.searchParams.set('tab', next);
      }
      window.history.replaceState(null, '', url.pathname + url.search);
    }
  };

  const trackCount = data?.status === 'ready' ? data.tracks.length : undefined;

  const preferencesGroup = (
    <SettingsGroup
      title={
        <span className="inline-flex items-center gap-2">
          <SlidersHorizontal aria-hidden="true" className="size-4 text-[var(--color-text-muted)]" strokeWidth={1.75} />
          <span>{copy.group}</span>
        </span>
      }
    >
      <SettingsRow
        id="music-player-enabled"
        title={copy.player.label}
        description={copy.player.description}
        control={
          <Switch
            checked={playerEnabled}
            onCheckedChange={setPlayerEnabled}
            disabled={!isMusicPreferencesReady}
            ariaLabel={copy.player.label}
            stateLabel={playerEnabled ? copy.player.enabled : copy.player.disabled}
          />
        }
      />
      <fieldset
        disabled={!playerEnabled}
        className={cx(
          'min-w-0 divide-y divide-[var(--color-border-faint)] border-0 p-0 m-0',
          !playerEnabled && 'opacity-50',
        )}
      >
        <SettingsRow
          id="music-rate-lock"
          title={copy.rateLock.label}
          description={copy.rateLock.description}
          control={
            <Switch
              checked={playbackRateLocked}
              onCheckedChange={setPlaybackRateLocked}
              disabled={!isMusicPreferencesReady || !playerEnabled}
              ariaLabel={playbackRateLocked ? copy.rateLock.enabled : copy.rateLock.disabled}
              stateLabel={playbackRateLocked ? copy.rateLock.enabled : copy.rateLock.disabled}
            />
          }
        />
        <SettingsRow
          id="music-placement"
          title={copy.placement.label}
          description={copy.placement.description}
          control={
            <Switch
              checked={rememberPlacement}
              onCheckedChange={setRememberPlacement}
              disabled={!isMusicPreferencesReady || !playerEnabled}
              ariaLabel={rememberPlacement ? copy.placement.enabled : copy.placement.disabled}
              stateLabel={rememberPlacement ? copy.placement.enabled : copy.placement.disabled}
            />
          }
        />
        <SettingsRow
          id="music-playback-mode"
          title={copy.playbackMode.label}
          description={copy.playbackMode.description}
          control={
            <SegmentedControl<MusicPlaybackMode>
              ariaLabel={copy.playbackMode.label}
              options={copy.playbackMode.options}
              value={isMusicPreferencesReady ? playbackMode : ''}
              onValueChange={setPlaybackMode}
              disabled={!isMusicPreferencesReady || !playerEnabled}
            />
          }
        />
      </fieldset>
    </SettingsGroup>
  );

  return (
    <div className="max-w-[760px] space-y-6">
      <section id="music" className="max-w-[760px] space-y-5">
        <header className="space-y-1">
          <h2 className="text-[length:var(--text-xl)] font-semibold tracking-[-0.025em] text-[var(--color-text)]">
            {getMusicSettingsSectionLabel(locale)}
          </h2>
          <p className="text-[length:var(--text-sm)] leading-relaxed text-[var(--color-text-muted)]">
            {getMusicSettingsSectionDescription(locale)}
          </p>
        </header>

        {data !== null ? (
          <UnderlineTabs<'preferences' | 'library'>
            ariaLabel={locale === 'zh' ? '音乐设置分组' : 'Music sections'}
            value={activeTab}
            onValueChange={selectTab}
            items={[
              { id: 'preferences', label: locale === 'zh' ? '播放器偏好' : 'Player' },
              {
                id: 'library',
                label: locale === 'zh' ? '曲库与曲目' : 'Library & Tracks',
                count: trackCount,
              },
            ]}
          />
        ) : null}

        {data === null || activeTab === 'preferences' ? preferencesGroup : null}
      </section>
      {data !== null && activeTab === 'library' ? <MusicAdminPanel locale={locale} data={data} /> : null}
    </div>
  );
}
