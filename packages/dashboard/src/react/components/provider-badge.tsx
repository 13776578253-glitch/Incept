'use client';

import type { ModelProviderFamily } from '../../domain/index';

export function ProviderBadge({
  provider,
}: { provider: ModelProviderFamily }) {
  const map: Record<
    ModelProviderFamily,
    { label: string; bg: string; border: string; fg: string; dot: string }
  > = {
    gemini: {
      label: 'Google',
      bg: 'var(--badge-sky-bg)',
      border: 'var(--badge-sky-border)',
      fg: 'var(--badge-sky-fg)',
      dot: 'var(--badge-sky-dot)',
    },
    claude: {
      label: 'Anthropic',
      bg: 'var(--badge-amber-bg)',
      border: 'var(--badge-amber-border)',
      fg: 'var(--badge-amber-fg)',
      dot: 'var(--badge-amber-dot)',
    },
    openai: {
      label: 'OpenAI',
      bg: 'var(--badge-emerald-bg)',
      border: 'var(--badge-emerald-border)',
      fg: 'var(--badge-emerald-fg)',
      dot: 'var(--badge-emerald-dot)',
    },
    deepseek: {
      label: 'DeepSeek',
      bg: 'var(--badge-indigo-bg)',
      border: 'var(--badge-indigo-border)',
      fg: 'var(--badge-indigo-fg)',
      dot: 'var(--badge-indigo-dot)',
    },
    workbuddy: {
      label: 'WorkBuddy',
      bg: 'var(--badge-indigo-bg)',
      border: 'var(--badge-indigo-border)',
      fg: 'var(--badge-indigo-fg)',
      dot: 'var(--badge-indigo-dot)',
    },
    xiaomi: {
      label: 'Xiaomi',
      bg: 'var(--badge-amber-bg)',
      border: 'var(--badge-amber-border)',
      fg: 'var(--badge-amber-fg)',
      dot: 'var(--badge-amber-dot)',
    },
    zhipu: {
      label: 'Zhipu',
      bg: 'var(--badge-sky-bg)',
      border: 'var(--badge-sky-border)',
      fg: 'var(--badge-sky-fg)',
      dot: 'var(--badge-sky-dot)',
    },
    xai: {
      label: 'Grok',
      bg: 'var(--badge-rose-bg)',
      border: 'var(--badge-rose-border)',
      fg: 'var(--badge-rose-fg)',
      dot: 'var(--badge-rose-dot)',
    },
    other: {
      label: 'Other',
      bg: 'var(--surface-chip-bg)',
      border: 'var(--surface-chip-border)',
      fg: 'var(--color-text-muted)',
      dot: 'var(--color-nav-muted)',
    },
  };

  const cfg = map[provider] ?? map.other;

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[0.64rem] font-medium"
      style={{
        backgroundColor: cfg.bg,
        borderColor: cfg.border,
        color: cfg.fg,
      }}
    >
      <span
        className="size-1.5 rounded-full"
        style={{ backgroundColor: cfg.dot }}
      />
      {cfg.label}
    </span>
  );
}
