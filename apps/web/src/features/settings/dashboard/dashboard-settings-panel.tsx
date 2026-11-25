'use client';

import {
  FAMILY_COLOR_PALETTES,
  normalizeModelColorKey,
  recordKnownDashboardModels,
  resolveModelFamily,
  resolveStableModelColor,
  toColorFamilyKey,
  useDashboardPreferences,
  useKnownDashboardModels,
  type ColorFamilyKey,
  type DashboardPaletteStyle,
  type KnownDashboardModel,
} from '@incept/dashboard/react';
import { SegmentedControl, SettingsGroup, SettingsRow } from '@incept/ui';
import { Pin, Plus, RotateCcw, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '@/hooks/use-language';

const CHART_VAR_NAMES = [
  '--chart-deepseek-1', '--chart-deepseek-2', '--chart-deepseek-3', '--chart-deepseek-4',
  '--chart-gemini-1', '--chart-gemini-2', '--chart-gemini-3', '--chart-gemini-4',
  '--chart-gpt-1', '--chart-gpt-2', '--chart-gpt-3', '--chart-gpt-4',
  '--chart-claude-1', '--chart-claude-2', '--chart-claude-3', '--chart-claude-4',
  '--chart-other-1', '--chart-other-2', '--chart-other-3', '--chart-other-4',
] as const;

function resolveCssExprToHex(
  resolvedVars: Record<string, string>,
  cssExpr: string,
  fallbackHex: string,
): string {
  const varMatch = cssExpr.match(/var\((--[^,)]+)/);
  if (varMatch?.[1]) {
    const val = resolvedVars[varMatch[1]];
    if (val && /^#[0-9a-f]{6}$/i.test(val)) {
      return val.toLowerCase();
    }
  }
  const literalHex = cssExpr.match(/#[0-9a-f]{6}/i);
  return literalHex ? literalHex[0].toLowerCase() : fallbackHex;
}

const FAMILY_CONFIG: ReadonlyArray<{
  key: ColorFamilyKey;
  label: { zh: string; en: string };
  swatches: readonly string[];
}> = [
  {
    key: 'DeepSeek',
    label: { zh: 'DeepSeek（蓝系）', en: 'DeepSeek (Blue)' },
    swatches: ['#2b82df', '#54a3f0', '#0284c7', '#1e66f5'],
  },
  {
    key: 'Gemini',
    label: { zh: 'Gemini（青绿系）', en: 'Gemini (Emerald)' },
    swatches: ['#16a87a', '#43c49b', '#0d9488', '#40a02b'],
  },
  {
    key: 'GPT',
    label: { zh: 'GPT（靛紫系）', en: 'GPT (Indigo)' },
    swatches: ['#6461e0', '#8684ee', '#7287fd', '#8b5cf6'],
  },
  {
    key: 'Claude',
    label: { zh: 'Claude（暖杏系）', en: 'Claude (Apricot)' },
    swatches: ['#e5773c', '#f29866', '#ea580c', '#d7827e'],
  },
  {
    key: 'Other',
    label: { zh: '其他家族', en: 'Other Families' },
    swatches: ['#e05275', '#9b5de5', '#d99b26', '#1ca6b8'],
  },
];

const FALLBACK_HEX_MAP: Record<ColorFamilyKey, string> = {
  DeepSeek: '#2b82df',
  Gemini: '#16a87a',
  GPT: '#6461e0',
  Claude: '#e5773c',
  Other: '#e05275',
};

const MAX_PINNED_MODELS = 8;

export function DashboardSettingsPanel() {
  const { language } = useLanguage();
  const isZh = language === 'zh';
  const { preferences, updatePreferences, resetPreferences } = useDashboardPreferences();
  const knownModels = useKnownDashboardModels();
  const panelRef = useRef<HTMLDivElement>(null);
  const [resolvedChartVars, setResolvedChartVars] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [manualModelId, setManualModelId] = useState('');

  useEffect(() => {
    if (knownModels.length > 0 || typeof fetch !== 'function') {
      return;
    }

    let cancelled = false;
    void fetch('/api/dashboard/usage?range=all')
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (cancelled || !payload || !Array.isArray(payload.models)) return;
        const observed = payload.models
          .filter(
            (m: { modelName?: string; slotStatus?: string; totalTokens?: number }) =>
              typeof m?.modelName === 'string' && m.slotStatus !== 'configured',
          )
          .map((m: { modelName: string; displayName?: string; provider?: string }) => ({
            modelName: m.modelName,
            displayName: m.displayName || m.modelName,
            provider: m.provider || 'other',
          }));
        if (observed.length > 0) {
          recordKnownDashboardModels(observed);
        }
      })
      .catch(() => {
        // Offline / unauthenticated fallback stays silent
      });

    return () => {
      cancelled = true;
    };
  }, [knownModels.length]);

  useEffect(() => {
    const syncResolvedVars = () => {
      const el = panelRef.current;
      if (!el || typeof window === 'undefined') return;
      const styles = window.getComputedStyle(el);
      const next: Record<string, string> = {};
      for (const name of CHART_VAR_NAMES) {
        const val = styles.getPropertyValue(name).trim();
        if (/^#[0-9a-f]{6}$/i.test(val)) {
          next[name] = val.toLowerCase();
        }
      }
      setResolvedChartVars(next);
    };

    const rafId = typeof window !== 'undefined' ? window.requestAnimationFrame(syncResolvedVars) : 0;
    const observer =
      typeof MutationObserver !== 'undefined' && typeof document !== 'undefined'
        ? new MutationObserver(() => syncResolvedVars())
        : null;
    if (observer && typeof document !== 'undefined') {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'data-theme-preset', 'data-accent', 'data-accent-contrast'],
      });
    }
    return () => {
      if (rafId && typeof window !== 'undefined') window.cancelAnimationFrame(rafId);
      observer?.disconnect();
    };
  }, [preferences.paletteStyle]);

  const hasCustomizations =
    preferences.paletteStyle !== 'theme' ||
    Object.keys(preferences.familyColors).length > 0 ||
    Object.keys(preferences.modelColors).length > 0 ||
    preferences.pinnedModels.length > 0;

  // Merge known observed models + pinned/colored models so custom entries always remain visible
  const mergedModels = useMemo(() => {
    const map = new Map<string, KnownDashboardModel>();
    for (const item of knownModels) {
      map.set(normalizeModelColorKey(item.modelName), item);
    }
    for (const pinned of preferences.pinnedModels) {
      const norm = normalizeModelColorKey(pinned);
      if (!map.has(norm)) {
        map.set(norm, { modelName: pinned, displayName: pinned, provider: 'other' });
      }
    }
    for (const coloredKey of Object.keys(preferences.modelColors)) {
      const norm = normalizeModelColorKey(coloredKey);
      if (!map.has(norm)) {
        map.set(norm, { modelName: coloredKey, displayName: coloredKey, provider: 'other' });
      }
    }

    const pinnedSet = new Set(preferences.pinnedModels.map(normalizeModelColorKey));
    const q = searchQuery.trim().toLowerCase();

    return Array.from(map.values())
      .filter((item) => {
        if (!q) return true;
        return (
          item.modelName.toLowerCase().includes(q) ||
          item.displayName.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const aPin = pinnedSet.has(normalizeModelColorKey(a.modelName)) ? 0 : 1;
        const bPin = pinnedSet.has(normalizeModelColorKey(b.modelName)) ? 0 : 1;
        if (aPin !== bPin) return aPin - bPin;
        return a.displayName.localeCompare(b.displayName);
      });
  }, [knownModels, preferences.modelColors, preferences.pinnedModels, searchQuery]);

  const handleTogglePin = (modelName: string) => {
    const norm = normalizeModelColorKey(modelName);
    updatePreferences((prev) => {
      const exists = prev.pinnedModels.some((m) => normalizeModelColorKey(m) === norm);
      if (exists) {
        return {
          ...prev,
          pinnedModels: prev.pinnedModels.filter((m) => normalizeModelColorKey(m) !== norm),
        };
      }
      if (prev.pinnedModels.length >= MAX_PINNED_MODELS) {
        return prev;
      }
      return {
        ...prev,
        pinnedModels: [...prev.pinnedModels, modelName],
      };
    });
  };

  const handleAddManualModel = () => {
    const trimmed = manualModelId.trim();
    if (!trimmed) return;
    recordKnownDashboardModels([{ modelName: trimmed, displayName: trimmed, provider: 'other' }]);
    updatePreferences((prev) => {
      const norm = normalizeModelColorKey(trimmed);
      if (prev.pinnedModels.some((m) => normalizeModelColorKey(m) === norm)) {
        return prev;
      }
      if (prev.pinnedModels.length >= MAX_PINNED_MODELS) {
        return prev;
      }
      return {
        ...prev,
        pinnedModels: [...prev.pinnedModels, trimmed],
      };
    });
    setManualModelId('');
  };

  return (
    <div
      ref={panelRef}
      data-dashboard-palette={preferences.paletteStyle}
      className="space-y-8"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[length:var(--text-xl)] font-semibold tracking-tight text-[var(--color-text)]">
            {isZh ? '仪表盘' : 'Dashboard'}
          </h1>
          <p className="mt-1 text-[length:var(--text-sm)] text-[var(--color-text-muted)]">
            {isZh
              ? '统一配置图表色彩风格、模型家族色系与趋势图固化模型'
              : 'Configure chart palette style, family hues, and pinned trend models'}
          </p>
        </div>

        {hasCustomizations ? (
          <button
            type="button"
            onClick={() => resetPreferences()}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[length:var(--text-xs)] font-medium text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
          >
            <RotateCcw className="size-3" strokeWidth={1.75} />
            <span>{isZh ? '恢复默认设置' : 'Reset defaults'}</span>
          </button>
        ) : null}
      </header>

      {/* Group 1: Palette Style + Family Hues */}
      <SettingsGroup title={isZh ? '图表配色' : 'Chart palette'}>
        <SettingsRow
          id="dashboard-palette"
          title={isZh ? '色彩风格' : 'Palette style'}
          description={isZh ? '在主题自适应色板基础上切换清透饱和度倾向' : 'Choose overall chart saturation relative to your active site theme'}
          hint={
            <span className="inline-flex flex-wrap items-center gap-3 pt-1">
              {FAMILY_CONFIG.map((item) => {
                const effectiveColor =
                  preferences.familyColors[item.key] ?? FAMILY_COLOR_PALETTES[item.key][0];
                return (
                  <span key={item.key} className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="size-2.5 rounded-full border border-[var(--color-border-subtle)]"
                      style={{ backgroundColor: effectiveColor }}
                    />
                    <span>{item.key}</span>
                  </span>
                );
              })}
            </span>
          }
          control={
            <SegmentedControl<DashboardPaletteStyle>
              ariaLabel={isZh ? '色彩风格' : 'Palette style'}
              value={preferences.paletteStyle}
              onValueChange={(value) => updatePreferences({ paletteStyle: value })}
              options={[
                { id: 'theme', label: isZh ? '跟随主题' : 'Theme' },
                { id: 'vivid', label: isZh ? '清透活力' : 'Vivid' },
                { id: 'pastel', label: isZh ? '柔和粉彩' : 'Pastel' },
              ]}
            />
          }
        />

        <SettingsRow
          id="dashboard-family-colors"
          title={isZh ? '模型家族色系' : 'Family hues'}
          description={isZh ? '为不同模型家族指定固定颜色，覆盖默认主题色板' : 'Override default hues per model family across charts and tables'}
          stacked
          control={
            <div className="space-y-2">
            {FAMILY_CONFIG.map((family) => {
              const customHex = preferences.familyColors[family.key];
              const previewCssColor = customHex ?? FAMILY_COLOR_PALETTES[family.key][0];
              const pickerValue =
                customHex ??
                resolveCssExprToHex(
                  resolvedChartVars,
                  FAMILY_COLOR_PALETTES[family.key][0],
                  FALLBACK_HEX_MAP[family.key],
                );

              return (
                <div
                  key={family.key}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md,10px)] border border-[var(--color-border-faint)] bg-[var(--color-surface-subtle)] px-3 py-2"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      className="size-3.5 shrink-0 rounded-full border border-[var(--color-border-subtle)]"
                      style={{ backgroundColor: previewCssColor }}
                    />
                    <span className="text-[length:var(--text-sm)] font-medium text-[var(--color-text)]">
                      {isZh ? family.label.zh : family.label.en}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      {family.swatches.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          aria-label={`${family.key} ${hex}`}
                          onClick={() =>
                            updatePreferences((prev) => ({
                              ...prev,
                              familyColors: { ...prev.familyColors, [family.key]: hex },
                            }))
                          }
                          className={`size-4 cursor-pointer rounded-full border transition-transform hover:scale-110 ${
                            customHex === hex
                              ? 'border-[var(--color-text)] ring-2 ring-[var(--color-ring-focus)]'
                              : 'border-[var(--color-border)]'
                          }`}
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>

                    <input
                      type="color"
                      aria-label={isZh ? `${family.key} 自定义颜色` : `${family.key} custom color`}
                      value={pickerValue}
                      onChange={(e) => {
                        const val = e.target.value;
                        updatePreferences((prev) => ({
                          ...prev,
                          familyColors: { ...prev.familyColors, [family.key]: val },
                        }));
                      }}
                      className="h-6 w-7 cursor-pointer rounded border border-[var(--color-border)] bg-transparent p-0.5"
                    />

                    {customHex ? (
                      <button
                        type="button"
                        onClick={() =>
                          updatePreferences((prev) => {
                            const next = { ...prev.familyColors };
                            delete next[family.key];
                            return { ...prev, familyColors: next };
                          })
                        }
                        className="cursor-pointer rounded px-1.5 py-0.5 text-[length:var(--text-2xs)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-row-bg)] hover:text-[var(--color-text)]"
                      >
                        {isZh ? '重置' : 'Reset'}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          }
        />
      </SettingsGroup>

      {/* Group 2: Pinned Models & Per-Model Color Overrides */}
      <SettingsGroup
        title={
          isZh
            ? `固化模型与单模型配色（${preferences.pinnedModels.length} / ${MAX_PINNED_MODELS}）`
            : `Pinned models & overrides (${preferences.pinnedModels.length} / ${MAX_PINNED_MODELS})`
        }
      >
        <SettingsRow
          id="dashboard-pinned-models"
          title={isZh ? '模型固定与独立配色' : 'Pin & recolor models'}
          description={isZh ? '在「模型走势 · 阶段主力」中始终保留已固化模型，并为任意型号指定专属颜色' : 'Always retain pinned models in Model Trends and customize individual model colors'}
          stacked
          control={
            <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-text-soft)]"
                  strokeWidth={1.75}
                />
                <input
                  type="search"
                  value={searchQuery}
                  aria-label={isZh ? '筛选模型' : 'Filter models'}
                  placeholder={isZh ? '筛选已记录模型…' : 'Filter observed models…'}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 w-full rounded-[var(--radius-md,10px)] border border-[var(--color-border-input)] bg-[var(--color-surface-card,var(--color-bg))] pl-8 pr-3 text-[length:var(--text-xs)] text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-soft)] focus:border-[var(--color-border-focus)]"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={manualModelId}
                  aria-label={isZh ? '手动添加模型 ID' : 'Add model ID'}
                  placeholder={isZh ? '手动输入模型 ID' : 'Add model ID'}
                  onChange={(e) => setManualModelId(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddManualModel();
                    }
                  }}
                  className="h-8 w-44 rounded-[var(--radius-md,10px)] border border-[var(--color-border-input)] bg-[var(--color-surface-card,var(--color-bg))] px-2.5 font-mono text-[length:var(--text-xs)] text-[var(--color-text)] outline-none placeholder:font-sans placeholder:text-[var(--color-text-soft)] focus:border-[var(--color-border-focus)]"
                />
                <button
                  type="button"
                  disabled={!manualModelId.trim()}
                  onClick={handleAddManualModel}
                  className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-[var(--radius-md,10px)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-[length:var(--text-xs)] font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-row-bg)] disabled:cursor-default disabled:opacity-40"
                >
                  <Plus className="size-3.5" strokeWidth={1.75} />
                  <span>{isZh ? '添加并固化' : 'Add & Pin'}</span>
                </button>
              </div>
            </div>

            {mergedModels.length === 0 ? (
              <p className="rounded-[var(--radius-md,10px)] border border-dashed border-[var(--color-border-subtle)] py-6 text-center text-[length:var(--text-xs)] text-[var(--color-text-soft)]">
                {isZh
                  ? '暂无已发现模型，访问一次仪表盘或上方手动输入模型 ID 即可配置'
                  : 'No observed models yet; visit Dashboard or add a model ID above'}
              </p>
            ) : (
              <div className="max-h-[320px] space-y-1.5 overflow-y-auto pr-1">
                {mergedModels.map((item) => {
                  const norm = normalizeModelColorKey(item.modelName);
                  const isPinned = preferences.pinnedModels.some(
                    (m) => normalizeModelColorKey(m) === norm,
                  );
                  const family = resolveModelFamily(item.modelName, item.provider);
                  const familyKey = toColorFamilyKey(family);
                  const customModelHex = preferences.modelColors[norm];
                  const defaultModelExpr = resolveStableModelColor(item.modelName, family);
                  const effectiveColor =
                    customModelHex ??
                    preferences.familyColors[familyKey] ??
                    defaultModelExpr;
                  const pickerFallback =
                    customModelHex ??
                    preferences.familyColors[familyKey] ??
                    resolveCssExprToHex(
                      resolvedChartVars,
                      defaultModelExpr,
                      FALLBACK_HEX_MAP[familyKey],
                    );

                  return (
                    <div
                      key={item.modelName}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md,10px)] border border-[var(--color-border-faint)] bg-[var(--color-surface-subtle)] px-3 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          aria-hidden="true"
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: effectiveColor }}
                        />
                        <span className="truncate font-mono text-[length:var(--text-xs)] font-medium text-[var(--color-text)]">
                          {item.displayName || item.modelName}
                        </span>
                        <span className="shrink-0 rounded-full bg-[var(--surface-chip-bg)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-soft)]">
                          {family === '__others__' ? 'Other' : family}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          aria-label={
                            isZh ? `${item.modelName} 颜色` : `${item.modelName} color`
                          }
                          value={pickerFallback}
                          onChange={(e) => {
                            const val = e.target.value;
                            updatePreferences((prev) => ({
                              ...prev,
                              modelColors: { ...prev.modelColors, [norm]: val },
                            }));
                          }}
                          className="h-6 w-7 cursor-pointer rounded border border-[var(--color-border)] bg-transparent p-0.5"
                        />

                        {customModelHex ? (
                          <button
                            type="button"
                            onClick={() =>
                              updatePreferences((prev) => {
                                const next = { ...prev.modelColors };
                                delete next[norm];
                                return { ...prev, modelColors: next };
                              })
                            }
                            className="cursor-pointer rounded px-1.5 py-0.5 text-[length:var(--text-2xs)] text-[var(--color-text-muted)] hover:bg-[var(--color-row-bg)] hover:text-[var(--color-text)]"
                          >
                            {isZh ? '重置' : 'Reset'}
                          </button>
                        ) : null}

                        <button
                          type="button"
                          aria-pressed={isPinned}
                          disabled={!isPinned && preferences.pinnedModels.length >= MAX_PINNED_MODELS}
                          onClick={() => handleTogglePin(item.modelName)}
                          className={`inline-flex h-7 cursor-pointer items-center gap-1 rounded-full border px-2.5 text-[length:var(--text-2xs)] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                            isPinned
                              ? 'border-[var(--color-accent-border)] bg-[var(--color-accent-soft)] text-[var(--color-text)]'
                              : 'border-[var(--color-border-subtle)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                          }`}
                        >
                          <Pin className="size-3" strokeWidth={1.75} />
                          <span>{isPinned ? (isZh ? '已固化' : 'Pinned') : (isZh ? '固化' : 'Pin')}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          }
        />
      </SettingsGroup>
    </div>
  );
}
