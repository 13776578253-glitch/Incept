'use client';

import {
  deriveFamilyColorVariants,
  FAMILY_COLOR_PALETTES,
  ImportDialog,
  normalizeModelColorKey,
  recordKnownDashboardModels,
  resolveColorSchemeForTheme,
  resolveFamilyModelColor,
  resolveModelFamily,
  toColorFamilyKey,
  useDashboardPreferences,
  useDocumentThemeMode,
  useKnownDashboardModels,
  type ColorFamilyKey,
  type DashboardColorScheme,
  type DashboardPaletteStyle,
  type DashboardThemeMode,
  type KnownDashboardModel,
} from '@incept/dashboard/react';
import { SegmentedControl, SettingsGroup, SettingsRow } from '@incept/ui';
import { Check, ChevronDown, Moon, Palette, Pin, Plus, RotateCcw, Search, Sun, Upload } from 'lucide-react';
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
  swatches: Record<DashboardThemeMode, readonly string[]>;
}> = [
  {
    key: 'DeepSeek',
    label: { zh: 'DeepSeek（蓝系）', en: 'DeepSeek (Blue)' },
    swatches: {
      light: ['#2b82df', '#2563eb', '#0284c7', '#1d4ed8'],
      dark: ['#93c5fd', '#7dd3fc', '#bae6fd', '#60a5fa'],
    },
  },
  {
    key: 'Gemini',
    label: { zh: 'Gemini（青绿系）', en: 'Gemini (Emerald)' },
    swatches: {
      light: ['#16a87a', '#059669', '#0d9488', '#40a02b'],
      dark: ['#6ee7b7', '#86efac', '#5eead4', '#a7f3d0'],
    },
  },
  {
    key: 'GPT',
    label: { zh: 'GPT（靛紫系）', en: 'GPT (Indigo)' },
    swatches: {
      light: ['#6461e0', '#4f46e5', '#7c3aed', '#6366f1'],
      dark: ['#c4b5fd', '#a5b4fc', '#d8b4fe', '#818cf8'],
    },
  },
  {
    key: 'Claude',
    label: { zh: 'Claude（暖杏系）', en: 'Claude (Apricot)' },
    swatches: {
      light: ['#e5773c', '#ea580c', '#d97706', '#c2410c'],
      dark: ['#fdba74', '#fca5a5', '#fcd34d', '#f9a8d4'],
    },
  },
  {
    key: 'Other',
    label: { zh: '其他家族', en: 'Other Families' },
    swatches: {
      light: ['#e05275', '#9333ea', '#ca8a04', '#0891b2'],
      dark: ['#f472b6', '#c084fc', '#fde047', '#67e8f9'],
    },
  },
];

function isColorSchemeCustomized(scheme: DashboardColorScheme): boolean {
  return (
    scheme.paletteStyle !== 'theme' ||
    Object.keys(scheme.familyColors).length > 0 ||
    Object.keys(scheme.modelColors).length > 0
  );
}

const FALLBACK_HEX_MAP: Record<ColorFamilyKey, string> = {
  DeepSeek: '#2b82df',
  Gemini: '#16a87a',
  GPT: '#6461e0',
  Claude: '#e5773c',
  Other: '#e05275',
};

const CROSS_ACCENT_SWATCHES: Record<DashboardThemeMode, readonly string[]> = {
  light: ['#2563eb', '#0d9488', '#7c3aed', '#ea580c', '#db2777', '#ca8a04'],
  dark: ['#60a5fa', '#5eead4', '#c4b5fd', '#fdba74', '#f472b6', '#fde047'],
};

const MAX_PINNED_MODELS = 8;

export function DashboardSettingsPanel({ isOwner = false }: { isOwner?: boolean } = {}) {
  const { language } = useLanguage();
  const isZh = language === 'zh';
  const { preferences, updatePreferences, resetPreferences } = useDashboardPreferences();
  const activeDocumentTheme = useDocumentThemeMode();
  const [editingTheme, setEditingTheme] = useState<DashboardThemeMode>(activeDocumentTheme);
  const prevDocThemeRef = useRef<DashboardThemeMode>(activeDocumentTheme);
  const knownModels = useKnownDashboardModels();
  const probeRef = useRef<HTMLDivElement>(null);
  const [resolvedChartVars, setResolvedChartVars] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [manualModelId, setManualModelId] = useState('');
  const [editingModelKey, setEditingModelKey] = useState<string | null>(null);
  const [hexDraft, setHexDraft] = useState('');
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    if (prevDocThemeRef.current !== activeDocumentTheme) {
      prevDocThemeRef.current = activeDocumentTheme;
      setEditingTheme(activeDocumentTheme);
    }
  }, [activeDocumentTheme]);

  const activeScheme = resolveColorSchemeForTheme(preferences, editingTheme);

  const updateActiveScheme = (
    updater: (scheme: DashboardColorScheme) => DashboardColorScheme,
  ) => {
    updatePreferences((prev) => ({
      ...prev,
      [editingTheme]: updater(prev[editingTheme]),
    }));
  };

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
      const el = probeRef.current;
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
  }, [activeScheme.paletteStyle, editingTheme]);

  const hasCustomizations =
    isColorSchemeCustomized(preferences.light) ||
    isColorSchemeCustomized(preferences.dark) ||
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
    for (const coloredKey of [
      ...Object.keys(preferences.light.modelColors),
      ...Object.keys(preferences.dark.modelColors),
    ]) {
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
  }, [
    knownModels,
    preferences.dark.modelColors,
    preferences.light.modelColors,
    preferences.pinnedModels,
    searchQuery,
  ]);

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

  const editingBadgeLabel =
    editingTheme === 'dark'
      ? isZh
        ? '暗色模式配色'
        : 'Dark theme'
      : isZh
        ? '亮色模式配色'
        : 'Light theme';

  return (
    <div
      data-dashboard-palette={activeScheme.paletteStyle}
      className="space-y-8"
    >
      {/* Hidden theme probe so color inputs reflect the edited Light/Dark theme CSS variables */}
      <div
        ref={probeRef}
        aria-hidden="true"
        className={editingTheme === 'dark' ? 'dark sr-only' : 'sr-only'}
        data-dashboard-palette={activeScheme.paletteStyle}
      />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[length:var(--text-xl)] font-semibold tracking-tight text-[var(--color-text)]">
            {isZh ? '仪表盘' : 'Dashboard'}
          </h1>
          <p className="mt-1 text-[length:var(--text-sm)] text-[var(--color-text-muted)]">
            {isZh
              ? '按亮色与暗色模式独立配置图表色彩、模型家族色系与趋势图固化模型'
              : 'Configure Light/Dark chart palettes, family hues, and pinned trend models'}
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

      {/* Group 1: Light/Dark Theme Scope + Palette Style + Family Hues */}
      <SettingsGroup title={isZh ? '图表配色' : 'Chart palette'}>
        <SettingsRow
          id="dashboard-color-mode"
          title={isZh ? '配色适用主题' : 'Theme color scope'}
          description={
            isZh
              ? '亮色与暗色模式分别保存独立的色板、家族色系及单模型颜色，切换网站外观时自动生效'
              : 'Store separate palette styles, family hues, and model colors for Light and Dark modes'
          }
          control={
            <SegmentedControl<DashboardThemeMode>
              ariaLabel={isZh ? '配色适用主题' : 'Theme color scope'}
              value={editingTheme}
              onValueChange={setEditingTheme}
              options={[
                { id: 'light', label: isZh ? '亮色模式' : 'Light' },
                { id: 'dark', label: isZh ? '暗色模式' : 'Dark' },
              ]}
            />
          }
        />

        <SettingsRow
          id="dashboard-palette"
          title={isZh ? '色彩风格' : 'Palette style'}
          description={isZh ? '在主题自适应色板基础上切换清透饱和度倾向' : 'Choose overall chart saturation relative to your active site theme'}
          hint={
            <span
              className={`mt-1.5 inline-flex flex-wrap items-center gap-3 rounded-lg border px-2.5 py-1.5 text-[length:var(--text-2xs)] ${
                editingTheme === 'dark'
                  ? 'dark border-zinc-700/80 bg-[#16171d] text-zinc-200'
                  : 'border-zinc-200/90 bg-white text-zinc-700'
              }`}
              data-dashboard-palette={activeScheme.paletteStyle}
            >
              <span className="inline-flex items-center gap-1 font-medium opacity-75">
                {editingTheme === 'dark' ? (
                  <Moon className="size-3" strokeWidth={1.75} />
                ) : (
                  <Sun className="size-3" strokeWidth={1.75} />
                )}
                <span>{editingBadgeLabel}</span>
              </span>
              {FAMILY_CONFIG.map((item) => {
                const effectiveColor =
                  activeScheme.familyColors[item.key] ?? FAMILY_COLOR_PALETTES[item.key][0];
                return (
                  <span key={item.key} className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="size-2.5 rounded-full border border-current/20"
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
              value={activeScheme.paletteStyle}
              onValueChange={(value) =>
                updateActiveScheme((scheme) => ({ ...scheme, paletteStyle: value }))
              }
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
          title={
            <span className="inline-flex items-center gap-2">
              <span>{isZh ? '模型家族色系' : 'Family hues'}</span>
              <span className="rounded-full bg-[var(--surface-chip-bg,var(--color-row-bg))] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-muted)]">
                {editingBadgeLabel}
              </span>
            </span>
          }
          description={isZh ? '为不同模型家族指定当前主题下的主色，同家族模型会自动按亮/暗模式派生区分色阶' : 'Set a base hue per model family for the active theme; sibling models auto-derive distinct shades'}
          stacked
          control={
            <div className="space-y-2">
            {FAMILY_CONFIG.map((family) => {
              const customHex = activeScheme.familyColors[family.key];
              const previewCssColor = customHex ?? FAMILY_COLOR_PALETTES[family.key][0];
              const pickerValue =
                customHex ??
                resolveCssExprToHex(
                  resolvedChartVars,
                  FAMILY_COLOR_PALETTES[family.key][0],
                  FALLBACK_HEX_MAP[family.key],
                );
              const modeSwatches = family.swatches[editingTheme];

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
                      {modeSwatches.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          aria-label={`${family.key} ${hex}`}
                          onClick={() =>
                            updateActiveScheme((scheme) => ({
                              ...scheme,
                              familyColors: { ...scheme.familyColors, [family.key]: hex },
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
                        updateActiveScheme((scheme) => ({
                          ...scheme,
                          familyColors: { ...scheme.familyColors, [family.key]: val },
                        }));
                      }}
                      className="h-6 w-7 cursor-pointer rounded border border-[var(--color-border)] bg-transparent p-0.5"
                    />

                    {customHex ? (
                      <button
                        type="button"
                        onClick={() =>
                          updateActiveScheme((scheme) => {
                            const next = { ...scheme.familyColors };
                            delete next[family.key];
                            return { ...scheme, familyColors: next };
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
          title={
            <span className="inline-flex items-center gap-2">
              <span>{isZh ? '模型固定与独立配色' : 'Pin & recolor models'}</span>
              <span className="rounded-full bg-[var(--surface-chip-bg,var(--color-row-bg))] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-muted)]">
                {editingBadgeLabel}
              </span>
            </span>
          }
          description={isZh ? '优先级：单模型自定义色 > 家族自动色阶 > 默认色板；点击右侧色块即可修改当前主题下的单模型颜色' : 'Precedence: per-model override > family auto-shade > default palette; click a swatch to recolor for the selected theme'}
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
              <div className="max-h-[380px] space-y-1.5 overflow-y-auto pr-1">
                {mergedModels.map((item) => {
                  const norm = normalizeModelColorKey(item.modelName);
                  const isPinned = preferences.pinnedModels.some(
                    (m) => normalizeModelColorKey(m) === norm,
                  );
                  const family = resolveModelFamily(item.modelName, item.provider);
                  const familyKey = toColorFamilyKey(family);
                  const customFamilyHex = activeScheme.familyColors[familyKey];
                  const customModelHex = activeScheme.modelColors[norm];
                  const effectiveColor =
                    customModelHex ??
                    resolveFamilyModelColor(
                      item.modelName,
                      family,
                      customFamilyHex,
                      editingTheme,
                    );
                  const familyBaseHex =
                    customFamilyHex ??
                    resolveCssExprToHex(
                      resolvedChartVars,
                      FAMILY_COLOR_PALETTES[familyKey][0],
                      FALLBACK_HEX_MAP[familyKey],
                    );
                  const pickerFallback =
                    customModelHex ??
                    (/^#[0-9a-f]{6}$/i.test(effectiveColor)
                      ? effectiveColor
                      : resolveCssExprToHex(
                          resolvedChartVars,
                          effectiveColor,
                          familyBaseHex,
                        ));
                  const isEditingColor = editingModelKey === norm;
                  const sameFamilySwatches = deriveFamilyColorVariants(
                    familyBaseHex,
                    editingTheme,
                  ).slice(0, 6);
                  const crossSwatches = CROSS_ACCENT_SWATCHES[editingTheme];
                  const normalizedDraft = hexDraft.trim().toLowerCase();
                  const isDraftValidHex = /^#[0-9a-f]{6}$/.test(normalizedDraft);

                  const toggleColorEditor = () => {
                    if (isEditingColor) {
                      setEditingModelKey(null);
                    } else {
                      setEditingModelKey(norm);
                      setHexDraft(pickerFallback);
                    }
                  };

                  const applyModelHex = (hex: string) => {
                    const nextHex = hex.trim().toLowerCase();
                    if (!/^#[0-9a-f]{6}$/.test(nextHex)) return;
                    setHexDraft(nextHex);
                    updateActiveScheme((scheme) => ({
                      ...scheme,
                      modelColors: { ...scheme.modelColors, [norm]: nextHex },
                    }));
                  };

                  return (
                    <div
                      key={item.modelName}
                      className="rounded-[var(--radius-md,10px)] border border-[var(--color-border-faint)] bg-[var(--color-surface-subtle)] px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span
                            aria-hidden="true"
                            className="size-2.5 shrink-0 rounded-full border border-black/10 dark:border-white/15"
                            style={{ backgroundColor: effectiveColor }}
                          />
                          <span className="truncate font-mono text-[length:var(--text-xs)] font-medium text-[var(--color-text)]">
                            {item.displayName || item.modelName}
                          </span>
                          <span className="shrink-0 rounded-full bg-[var(--surface-chip-bg)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-soft)]">
                            {family === '__others__' ? 'Other' : family}
                          </span>
                          {customModelHex ? (
                            <span className="shrink-0 rounded-full border border-[var(--color-accent-border)] bg-[var(--color-accent-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-text)]">
                              {isZh ? '已覆盖' : 'Custom'}
                            </span>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            aria-expanded={isEditingColor}
                            aria-label={
                              isZh ? `${item.modelName} 颜色` : `${item.modelName} color`
                            }
                            onClick={toggleColorEditor}
                            className={`inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[7px] border px-2 text-[length:var(--text-2xs)] transition-colors ${
                              isEditingColor
                                ? 'border-[var(--color-accent-border)] bg-[var(--color-surface)] text-[var(--color-text)]'
                                : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]'
                            }`}
                          >
                            <span
                              aria-hidden="true"
                              className="size-3.5 rounded-[4px] border border-black/15 dark:border-white/20"
                              style={{ backgroundColor: effectiveColor }}
                            />
                            <ChevronDown
                              className={`size-3 transition-transform duration-150 ${
                                isEditingColor ? 'rotate-180' : ''
                              }`}
                              strokeWidth={1.75}
                            />
                          </button>

                          {customModelHex ? (
                            <button
                              type="button"
                              onClick={() =>
                                updateActiveScheme((scheme) => {
                                  const next = { ...scheme.modelColors };
                                  delete next[norm];
                                  return { ...scheme, modelColors: next };
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

                      {isEditingColor ? (
                        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2.5 border-t border-[var(--color-border-faint)] pt-2.5">
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] text-[var(--color-text-soft)]">
                                {isZh ? '同系' : 'Family'}
                              </span>
                              {sameFamilySwatches.map((hex) => (
                                <button
                                  key={`fam-${hex}`}
                                  type="button"
                                  aria-label={`${item.modelName} ${hex}`}
                                  onClick={() => applyModelHex(hex)}
                                  className={`size-4 cursor-pointer rounded-full border transition-transform hover:scale-110 ${
                                    customModelHex === hex
                                      ? 'border-[var(--color-text)] ring-2 ring-[var(--color-ring-focus)]'
                                      : 'border-[var(--color-border)]'
                                  }`}
                                  style={{ backgroundColor: hex }}
                                />
                              ))}
                            </div>

                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] text-[var(--color-text-soft)]">
                                {isZh ? '跨色' : 'Accent'}
                              </span>
                              {crossSwatches.map((hex) => (
                                <button
                                  key={`acc-${hex}`}
                                  type="button"
                                  aria-label={`${item.modelName} ${hex}`}
                                  onClick={() => applyModelHex(hex)}
                                  className={`size-4 cursor-pointer rounded-full border transition-transform hover:scale-110 ${
                                    customModelHex === hex
                                      ? 'border-[var(--color-text)] ring-2 ring-[var(--color-ring-focus)]'
                                      : 'border-[var(--color-border)]'
                                  }`}
                                  style={{ backgroundColor: hex }}
                                />
                              ))}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={hexDraft}
                              maxLength={7}
                              aria-label={isZh ? `${item.modelName} 十六进制颜色` : `${item.modelName} hex color`}
                              placeholder="#rrggbb"
                              onChange={(e) => {
                                const val = e.target.value;
                                setHexDraft(val);
                                if (/^#[0-9a-f]{6}$/i.test(val.trim())) {
                                  applyModelHex(val);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && isDraftValidHex) {
                                  e.preventDefault();
                                  applyModelHex(normalizedDraft);
                                }
                              }}
                              className="h-7 w-[78px] rounded-[6px] border border-[var(--color-border-input)] bg-[var(--color-surface-card,var(--color-bg))] px-2 font-mono text-[11px] text-[var(--color-text)] outline-none focus:border-[var(--color-border-focus)]"
                            />
                            <button
                              type="button"
                              disabled={!isDraftValidHex}
                              aria-label={isZh ? `应用 ${item.modelName} 颜色` : `Apply ${item.modelName} color`}
                              onClick={() => applyModelHex(normalizedDraft)}
                              className="inline-flex h-7 cursor-pointer items-center justify-center rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-[var(--color-text)] hover:bg-[var(--color-row-bg)] disabled:cursor-default disabled:opacity-40"
                            >
                              <Check className="size-3.5" strokeWidth={1.75} />
                            </button>
                            <label
                              title={isZh ? '系统调色盘' : 'System color picker'}
                              className="inline-flex h-7 cursor-pointer items-center justify-center rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-row-bg)] hover:text-[var(--color-text)]"
                            >
                              <Palette className="size-3.5" strokeWidth={1.75} />
                              <input
                                type="color"
                                aria-label={isZh ? `${item.modelName} 系统调色盘` : `${item.modelName} system color`}
                                value={pickerFallback}
                                onChange={(e) => applyModelHex(e.target.value)}
                                className="sr-only"
                              />
                            </label>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          }
        />
      </SettingsGroup>

      {isOwner ? (
        <SettingsGroup title={isZh ? '数据导入' : 'Data import'}>
          <SettingsRow
            id="dashboard-import"
            title={isZh ? '跨机器数据导入' : 'Cross-device import'}
            description={
              isZh
                ? '从其他设备导出文件校验并导入 Token 用量记录，支持按批次回退'
                : 'Validate and import token usage exports from another device with batch rollback'
            }
            control={
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-md,10px)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[length:var(--text-xs)] font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-row-bg)]"
              >
                <Upload className="size-3.5 text-[var(--color-text-muted)]" strokeWidth={1.75} />
                <span>{isZh ? '打开导入' : 'Open import'}</span>
              </button>
            }
          />
        </SettingsGroup>
      ) : null}

      {isOwner && importOpen ? (
        <ImportDialog
          onClose={() => setImportOpen(false)}
          onImported={() => {
            void fetch('/api/dashboard/usage?range=30d&refresh=1').catch(() => {});
          }}
        />
      ) : null}
    </div>
  );
}
