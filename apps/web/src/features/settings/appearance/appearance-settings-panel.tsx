'use client';

import {
  SegmentedControl,
  Select,
  SettingsGroup,
  SettingsRow,
  THEME_PRESETS,
  ACCENT_PRESETS,
  UI_FONTS,
  UI_FONT_SIZES,
  DOCS_FONT_SIZES,
  DOCS_LINE_HEIGHTS,
  type AccentPresetId,
  type ColorScheme,
  type ContrastMode,
  type DocsCodeAccentId,
  type DocsFontId,
  type DocsFontSizeId,
  type DocsInlineCodeAccentId,
  type DocsLineHeightId,
  type ThemePresetId,
  type UiFontId,
  type UiFontSizeId,
} from '@incept/ui';
import { Check, ChevronRight, Code2, Monitor, Moon, Sun } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useDocsCodePaletteContext } from '@/components/base/docs-code-palette-provider';
import {
  docsCodePaletteIds,
  type DocsCodePalette,
} from '@/features/docs/code-highlighting/palette';
import { useAppearance } from '@/hooks/use-appearance';
import { useLanguage } from '@/hooks/use-language';

const CODE_PALETTE_LABELS: Record<DocsCodePalette, { zh: string; en: string }> = {
  auto: { zh: '跟随主题', en: 'Follow theme' },
  vscode: { zh: 'VS Code', en: 'VS Code-like' },
  github: { zh: 'GitHub', en: 'GitHub-like' },
  vitesse: { zh: 'Vitesse', en: 'Vitesse' },
};

const CODE_PREVIEW_PALETTES: Record<
  string,
  { bg: string; border: string; text: string; keyword: string; string: string; fn: string; comment: string }
> = {
  'vscode-light': {
    bg: '#ffffff',
    border: 'rgba(0, 0, 0, 0.1)',
    text: '#000000',
    keyword: '#0000ff',
    string: '#a31515',
    fn: '#795e26',
    comment: '#008000',
  },
  'vscode-dark': {
    bg: '#1e1e1e',
    border: 'rgba(255, 255, 255, 0.12)',
    text: '#d4d4d4',
    keyword: '#569cd6',
    string: '#ce9178',
    fn: '#dcdcaa',
    comment: '#6a9955',
  },
  'github-light': {
    bg: '#ffffff',
    border: 'rgba(31, 35, 40, 0.12)',
    text: '#24292e',
    keyword: '#d73a49',
    string: '#032f62',
    fn: '#6f42c1',
    comment: '#6a737d',
  },
  'github-dark': {
    bg: '#24292e',
    border: 'rgba(225, 228, 232, 0.14)',
    text: '#e1e4e8',
    keyword: '#f97583',
    string: '#9ecbff',
    fn: '#b392f0',
    comment: '#6a737d',
  },
  'vitesse-light': {
    bg: '#ffffff',
    border: 'rgba(57, 58, 52, 0.12)',
    text: '#393a34',
    keyword: '#1e754f',
    string: '#b56959',
    fn: '#59873a',
    comment: '#a0ada0',
  },
  'vitesse-dark': {
    bg: '#121212',
    border: 'rgba(219, 215, 202, 0.12)',
    text: '#dbd7ca',
    keyword: '#4d9375',
    string: '#c98a7d',
    fn: '#80a665',
    comment: '#758575',
  },
  'warm-paper': {
    bg: '#faf4ed',
    border: 'rgba(94, 77, 59, 0.14)',
    text: '#575279',
    keyword: '#286983',
    string: '#ea9d34',
    fn: '#b4637a',
    comment: '#9893a5',
  },
  'catppuccin-latte': {
    bg: '#eff1f5',
    border: 'rgba(76, 79, 105, 0.14)',
    text: '#4c4f69',
    keyword: '#8839ef',
    string: '#40a02b',
    fn: '#1e66f5',
    comment: '#8c8fa1',
  },
  'catppuccin-mocha': {
    bg: '#1e1e2e',
    border: 'rgba(180, 190, 254, 0.14)',
    text: '#cdd6f4',
    keyword: '#cba6f7',
    string: '#a6e3a1',
    fn: '#89b4fa',
    comment: '#6c7086',
  },
  'rose-pine-dawn': {
    bg: '#faf4ed',
    border: 'rgba(87, 82, 121, 0.14)',
    text: '#575279',
    keyword: '#286983',
    string: '#ea9d34',
    fn: '#d7827e',
    comment: '#9893a5',
  },
  'rose-pine': {
    bg: '#191724',
    border: 'rgba(224, 222, 244, 0.12)',
    text: '#e0def4',
    keyword: '#31748f',
    string: '#f6c177',
    fn: '#ebbcba',
    comment: '#6e6a86',
  },
};

function resolveCodePreviewColors(
  preset: ThemePresetId,
  polarity: 'light' | 'dark',
  codePalette: DocsCodePalette,
) {
  if (codePalette === 'auto') {
    if (preset === 'default') {
      return polarity === 'dark'
        ? CODE_PREVIEW_PALETTES['github-dark']
        : CODE_PREVIEW_PALETTES['github-light'];
    }
    return CODE_PREVIEW_PALETTES[preset] ?? CODE_PREVIEW_PALETTES['github-light'];
  }
  return (
    CODE_PREVIEW_PALETTES[`${codePalette}-${polarity}`] ??
    (polarity === 'dark' ? CODE_PREVIEW_PALETTES['github-dark'] : CODE_PREVIEW_PALETTES['github-light'])
  );
}

export function AppearanceSettingsPanel() {
  const { language } = useLanguage();
  const router = useRouter();
  const isZh = language === 'zh';
  const {
    preset,
    colorScheme,
    resolvedPolarity,
    accent,
    contrast,
    font,
    fontSize,
    docsFont,
    docsFontSize,
    docsLineHeight,
    docsCodeAccent,
    docsInlineCodeAccent,
    isReady,
    setPreset,
    setThemeMode,
    setAccent,
    setContrast,
    setFont,
    setFontSize,
    setDocsFont,
    setDocsFontSize,
    setDocsLineHeight,
    setDocsCodeAccent,
    setDocsInlineCodeAccent,
  } = useAppearance();
  const { codePalette, setCodePalette, isCodePaletteReady } = useDocsCodePaletteContext();
  const [codePreviewOpen, setCodePreviewOpen] = useState(false);

  const activePresetSpec = THEME_PRESETS.find((item) => item.id === preset) ?? THEME_PRESETS[0];
  const isFixedPreset = activePresetSpec.polarity !== 'system';
  const activePresetSwatch =
    activePresetSpec.id === 'default' && resolvedPolarity === 'dark' && activePresetSpec.preview.dark
      ? activePresetSpec.preview.dark
      : activePresetSpec.preview.light;
  const codeColors = resolveCodePreviewColors(preset, resolvedPolarity, codePalette);
  const activeCodePaletteLabel = isZh ? CODE_PALETTE_LABELS[codePalette].zh : CODE_PALETTE_LABELS[codePalette].en;
  const previewPaletteId = codePalette === 'auto' ? preset : `${codePalette}-${resolvedPolarity}`;

  const codeAccentOptions = [
    {
      value: 'inherit' as DocsCodeAccentId,
      label: isZh ? '跟随全局' : 'Follow Global',
      leading: (
        <span
          aria-hidden="true"
          className="size-2.5 shrink-0 rounded-full border border-black/10 dark:border-white/15"
          style={{ forcedColorAdjust: 'none', backgroundColor: 'var(--color-accent)' }}
        />
      ),
    },
    {
      value: 'none' as DocsCodeAccentId,
      label: isZh ? '关闭' : 'Off',
      leading: (
        <span
          aria-hidden="true"
          className="size-2.5 shrink-0 rounded-full border border-[var(--color-border-strong)] bg-transparent"
        />
      ),
    },
    ...ACCENT_PRESETS.filter((item) => item.id !== 'theme').map((item) => ({
      value: item.id as DocsCodeAccentId,
      label: isZh ? item.label.zh : item.label.en,
      leading: (
        <span
          aria-hidden="true"
          className="size-2.5 shrink-0 rounded-full border border-black/10 dark:border-white/15"
          style={{
            forcedColorAdjust: 'none',
            backgroundColor: resolvedPolarity === 'dark' ? item.swatch.dark : item.swatch.light,
          }}
        />
      ),
    })),
  ];

  return (
    <section id="appearance" className="max-w-[760px] space-y-7">
      <header className="space-y-1">
        <h2 className="text-[length:var(--text-xl)] font-semibold tracking-[-0.025em] text-[var(--color-text)]">
          {isZh ? '外观' : 'Appearance'}
        </h2>
        <p className="text-[length:var(--text-sm)] leading-relaxed text-[var(--color-text-muted)]">
          {isZh
            ? '定制站点配色方案、强调色、对比度与全局排版'
            : 'Configure color schemes, accents, contrast, and typography'}
        </p>
      </header>

      {/* Group 1: Color Scheme & Polarity */}
      <SettingsGroup
        title={isZh ? '视觉风格' : 'Color Scheme'}
        description={
          isZh
            ? '“默认”跟随下方明暗模式；其余预设自带完整亮暗配色'
            : '“Default” follows the mode below; curated presets define their own light/dark palette'
        }
      >
        <div id="appearance-preset" className="py-4">
          <div
            role="radiogroup"
            aria-label={isZh ? '配色方案' : 'Color scheme'}
            className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6"
          >
            {THEME_PRESETS.map((item) => {
              const selected = preset === item.id;
              const swatch =
                item.id === 'default' && resolvedPolarity === 'dark' && item.preview.dark
                  ? item.preview.dark
                  : item.preview.light;

              return (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={!isReady}
                  onClick={() => setPreset(item.id)}
                  className={`group relative flex cursor-pointer flex-col items-center justify-start gap-1.5 rounded-[var(--radius-md,10px)] p-2 text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)] disabled:cursor-not-allowed disabled:opacity-60 ${
                    selected
                      ? 'border-[1.5px] border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                      : 'border border-[var(--color-border-subtle)] bg-[var(--color-surface)] hover:border-[var(--color-border-strong)]'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="relative flex h-11 w-full shrink-0 items-center justify-center rounded-[7px] border"
                    style={{
                      forcedColorAdjust: 'none',
                      backgroundColor: swatch.bg,
                      borderColor: swatch.border,
                    }}
                  >
                    <span
                      className="inline-flex items-center gap-1 rounded-full border px-2 py-1 shadow-xs"
                      style={{
                        backgroundColor: swatch.surface,
                        borderColor: swatch.border,
                      }}
                    >
                      {swatch.dots.map((dot, index) => (
                        <span
                          key={index}
                          className="size-2 rounded-full"
                          style={{ backgroundColor: dot }}
                        />
                      ))}
                    </span>
                    {selected ? (
                      <span
                        className="absolute right-1 top-1 flex size-3.5 items-center justify-center rounded-full"
                        style={{ backgroundColor: swatch.accent, color: swatch.surface }}
                      >
                        <Check className="size-2.5" strokeWidth={2.6} />
                      </span>
                    ) : null}
                  </span>
                  <span className="flex min-h-7 w-full items-center justify-center text-[length:var(--text-2xs)] font-medium leading-3.5 text-[var(--color-text)]">
                    {isZh ? item.label.zh : item.label.en}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <SettingsRow
          id="appearance-mode"
          title={isZh ? '明暗模式' : 'Theme Mode'}
          description={
            isZh
              ? '在跟随系统、亮色与暗色之间切换'
              : 'Switch between system, light, and dark modes'
          }
          hint={
            isFixedPreset
              ? isZh
                ? '当前预设已锁定明暗；点选此处将切回“默认”方案'
                : 'Active preset sets its own polarity; selecting a mode switches back to Default'
              : undefined
          }
          control={
            <SegmentedControl<ColorScheme>
              ariaLabel={isZh ? '明暗模式' : 'Theme Mode'}
              value={isReady ? (isFixedPreset ? '' : colorScheme) : ''}
              disabled={!isReady}
              onValueChange={setThemeMode}
              options={[
                {
                  id: 'system',
                  label: isZh ? '跟随系统' : 'System',
                  icon: <Monitor className="size-3.5" strokeWidth={1.75} />,
                },
                {
                  id: 'light',
                  label: isZh ? '亮色' : 'Light',
                  icon: <Sun className="size-3.5" strokeWidth={1.75} />,
                },
                {
                  id: 'dark',
                  label: isZh ? '暗色' : 'Dark',
                  icon: <Moon className="size-3.5" strokeWidth={1.75} />,
                },
              ]}
            />
          }
        />
      </SettingsGroup>

      {/* Group 2: Accent & Contrast */}
      <SettingsGroup title={isZh ? '强调色与对比度' : 'Accent & Contrast'}>
        <SettingsRow
          id="appearance-accent"
          title={isZh ? '强调色' : 'Accent Color'}
          description={
            isZh
              ? '克制点缀主操作按钮、高亮选中项与聚焦轮廓'
              : 'Subtly tint primary buttons, active highlights, and focus rings'
          }
          control={
            <Select<AccentPresetId>
              ariaLabel={isZh ? '强调色' : 'Accent Color'}
              value={accent}
              disabled={!isReady}
              onValueChange={setAccent}
              options={ACCENT_PRESETS.map((item) => {
                const dotColor =
                  item.id === 'theme'
                    ? activePresetSwatch.accent
                    : resolvedPolarity === 'dark'
                      ? item.swatch.dark
                      : item.swatch.light;

                return {
                  value: item.id,
                  label: isZh ? item.label.zh : item.label.en,
                  leading: (
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-full border border-black/10 dark:border-white/15"
                      style={{ forcedColorAdjust: 'none', backgroundColor: dotColor }}
                    />
                  ),
                };
              })}
            />
          }
        />

        <SettingsRow
          id="appearance-contrast"
          title={isZh ? '界面对比度' : 'Contrast'}
          description={
            isZh
              ? '增强次要文字与边框轮廓，提升低对比配色清晰度'
              : 'Strengthen secondary text and subtle borders for sharper visual separation'
          }
          control={
            <SegmentedControl<ContrastMode>
              ariaLabel={isZh ? '界面对比度' : 'Contrast'}
              value={isReady ? contrast : 'default'}
              disabled={!isReady}
              onValueChange={setContrast}
              options={[
                { id: 'default', label: isZh ? '默认' : 'Default' },
                { id: 'strong', label: isZh ? '增强' : 'Strong' },
              ]}
            />
          }
        />
      </SettingsGroup>

      {/* Group 3: Interface Typography */}
      <SettingsGroup title={isZh ? '界面排版' : 'Interface Typography'}>
        <SettingsRow
          id="appearance-font"
          title={isZh ? '界面字体' : 'Font'}
          description={
            isZh
              ? '切换全局导航与常规界面的字体风格'
              : 'Choose the primary typeface used across navigation and controls'
          }
          control={
            <Select<UiFontId>
              ariaLabel={isZh ? '界面字体' : 'Font'}
              value={font}
              disabled={!isReady}
              onValueChange={setFont}
              options={UI_FONTS.map((item) => ({
                value: item.id,
                label: isZh ? item.label.zh : item.label.en,
                leading: (
                  <span
                    className="inline-flex w-5 justify-center text-[length:var(--text-xs)] font-medium text-[var(--color-text-muted)]"
                    style={{ fontFamily: item.previewStack }}
                  >
                    Aa
                  </span>
                ),
              }))}
            />
          }
        />

        <SettingsRow
          id="appearance-font-size"
          title={isZh ? '全局字号' : 'Font Size'}
          description={
            isZh
              ? '调整常规界面与控件的基础文字大小'
              : 'Adjust the base text size across controls and navigation'
          }
          control={
            <Select<UiFontSizeId>
              ariaLabel={isZh ? '全局字号' : 'Font Size'}
              value={fontSize}
              disabled={!isReady}
              onValueChange={setFontSize}
              options={UI_FONT_SIZES.map((item) => ({
                value: item.id,
                label: item.label,
              }))}
            />
          }
        />
      </SettingsGroup>

      {/* Group 4: Docs Reading & Code */}
      <SettingsGroup title={isZh ? '文档阅读与代码' : 'Docs Reading & Code'}>
        <SettingsRow
          id="appearance-docs-font"
          title={isZh ? '文档字体' : 'Docs Font'}
          description={
            isZh
              ? '单独设定文档长文阅读字体，默认跟随界面字体'
              : 'Choose an independent reading typeface for docs or follow UI font'
          }
          control={
            <Select<DocsFontId>
              ariaLabel={isZh ? '文档字体' : 'Docs Font'}
              value={docsFont}
              disabled={!isReady}
              onValueChange={setDocsFont}
              options={[
                {
                  value: 'inherit',
                  label: isZh ? '跟随界面' : 'Follow UI',
                },
                ...UI_FONTS.map((item) => ({
                  value: item.id,
                  label: isZh ? item.label.zh : item.label.en,
                  leading: (
                    <span
                      className="inline-flex w-5 justify-center text-[length:var(--text-xs)] font-medium text-[var(--color-text-muted)]"
                      style={{ fontFamily: item.previewStack }}
                    >
                      Aa
                    </span>
                  ),
                })),
              ]}
            />
          }
        />

        <SettingsRow
          id="appearance-docs-font-size"
          title={isZh ? '文档字号' : 'Docs Font Size'}
          description={
            isZh
              ? '独立设定文档正文字号；手机端自动温和微缩约 1px'
              : 'Set long-form article base size; gently tapers on mobile viewports'
          }
          control={
            <Select<DocsFontSizeId>
              ariaLabel={isZh ? '文档字号' : 'Docs Font Size'}
              value={docsFontSize}
              disabled={!isReady}
              onValueChange={setDocsFontSize}
              options={DOCS_FONT_SIZES.map((item) => ({
                value: item.id,
                label: isZh ? item.label.zh : item.label.en,
              }))}
            />
          }
        />

        <SettingsRow
          id="appearance-docs-line-height"
          title={isZh ? '文档行距' : 'Docs Line Height'}
          description={
            isZh
              ? '调节段落行间呼吸感，兼顾长文节奏与一屏密度'
              : 'Tune paragraph line spacing for comfortable long-form reading'
          }
          control={
            <SegmentedControl<DocsLineHeightId>
              ariaLabel={isZh ? '文档行距' : 'Docs Line Height'}
              value={isReady ? docsLineHeight : 'comfortable'}
              disabled={!isReady}
              onValueChange={setDocsLineHeight}
              options={DOCS_LINE_HEIGHTS.map((item) => ({
                id: item.id,
                label: isZh ? item.label.zh : item.label.en,
              }))}
            />
          }
        />

        <SettingsRow
          id="appearance-code-palette"
          title={isZh ? '代码块配色' : 'Code Palette'}
          description={
            isZh
              ? '默认跟随当前站点主题自动匹配，也可手动指定编辑器配色'
              : 'Automatically matches your theme by default or uses a manual editor palette'
          }
          control={
            <Select<DocsCodePalette>
              ariaLabel={isZh ? '代码块配色' : 'Code Palette'}
              value={codePalette}
              disabled={!isCodePaletteReady}
              onValueChange={(next) => {
                setCodePalette(next);
                router.refresh();
              }}
              options={docsCodePaletteIds.map((id) => ({
                value: id,
                label: isZh ? CODE_PALETTE_LABELS[id].zh : CODE_PALETTE_LABELS[id].en,
              }))}
            />
          }
        />

        <SettingsRow
          id="appearance-docs-inline-code-accent"
          title={isZh ? '行内代码强调色' : 'Inline Code Accent'}
          description={
            isZh
              ? '柔和点缀正文内的术语与行内代码胶囊，默认跟随全局强调色，也可关闭'
              : 'Subtly tints inline code pills in docs; follows global accent or can be turned off'
          }
          control={
            <Select<DocsInlineCodeAccentId>
              ariaLabel={isZh ? '行内代码强调色' : 'Inline Code Accent'}
              value={docsInlineCodeAccent}
              disabled={!isReady}
              onValueChange={setDocsInlineCodeAccent}
              options={codeAccentOptions}
            />
          }
        />

        <SettingsRow
          id="appearance-docs-code-accent"
          title={isZh ? '代码块强调色' : 'Code Accent'}
          description={
            isZh
              ? '以极细侧边条与工具栏点缀代码块，默认跟随全局强调色，也可关闭'
              : 'Subtly accents code blocks; follows global accent by default or can be turned off'
          }
          control={
            <Select<DocsCodeAccentId>
              ariaLabel={isZh ? '代码块强调色' : 'Code Accent'}
              value={docsCodeAccent}
              disabled={!isReady}
              onValueChange={setDocsCodeAccent}
              options={codeAccentOptions}
            />
          }
        />

        {/* Quiet expandable Code Preview disclosure row */}
        <div className="py-3.5">
          <button
            type="button"
            aria-expanded={codePreviewOpen}
            onClick={() => setCodePreviewOpen((prev) => !prev)}
            className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-[8px] py-0.5 text-[length:var(--text-sm)] font-medium text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)]"
          >
            <span className="inline-flex items-center gap-2">
              <Code2 aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
              <span>{isZh ? '代码预览' : 'Code Preview'}</span>
            </span>
            <ChevronRight
              aria-hidden="true"
              className={`size-4 text-[var(--color-text-soft)] transition-transform duration-150 ${codePreviewOpen ? 'rotate-90' : ''}`}
            />
          </button>

          {codePreviewOpen ? (
            <div className="relative mt-3 overflow-hidden rounded-[10px]">
              <span
                aria-hidden="true"
                className="docs-code-accent-decor pointer-events-none absolute bottom-0 left-0 top-0 z-10 w-[2px] opacity-65"
                style={{ backgroundColor: 'var(--docs-code-accent)' }}
              />
              <pre
                data-preview-palette={previewPaletteId}
                className="overflow-x-auto rounded-[10px] border p-3.5 pl-4 font-mono text-[length:var(--text-xs)] leading-6"
                style={{
                  forcedColorAdjust: 'none',
                  backgroundColor: codeColors.bg,
                  borderColor: codeColors.border,
                  color: codeColors.text,
                }}
              >
                <code>
                  <span style={{ color: codeColors.comment }}>
                    {isZh ? `// 代码块配色：${activeCodePaletteLabel}` : `// Code palette: ${activeCodePaletteLabel}`}
                  </span>
                  {'\n'}
                  <span style={{ color: codeColors.keyword }}>const</span>{' '}
                  <span>theme</span> ={' '}
                  <span style={{ color: codeColors.fn }}>useAppearance</span>();{'\n'}
                  <span style={{ color: codeColors.keyword }}>export const</span>{' '}
                  <span>preset</span> ={' '}
                  <span style={{ color: codeColors.string }}>&apos;{preset}&apos;</span>;
                </code>
              </pre>
            </div>
          ) : null}
        </div>
      </SettingsGroup>
    </section>
  );
}
