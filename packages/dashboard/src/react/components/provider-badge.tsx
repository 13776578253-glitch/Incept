'use client';

import type { ModelProviderFamily } from '../../domain/index';

type ProviderToneConfig = {
  label: string;
  tone?: string;
};

const PROVIDER_META: Record<ModelProviderFamily, ProviderToneConfig> = {
  gemini: { label: 'Google', tone: '#5c8fb8' },
  claude: { label: 'Anthropic', tone: '#b8825a' },
  openai: { label: 'OpenAI', tone: '#52997e' },
  deepseek: { label: 'DeepSeek', tone: '#6f77b8' },
  workbuddy: { label: 'WorkBuddy', tone: '#8478b5' },
  xiaomi: { label: 'Xiaomi', tone: '#b38c52' },
  zhipu: { label: 'Zhipu', tone: '#5a96a8' },
  xai: { label: 'Grok', tone: '#b57282' },
  other: { label: 'Other' },
};

export function ProviderBadge({
  provider,
}: { provider: ModelProviderFamily }) {
  const cfg = PROVIDER_META[provider] ?? PROVIDER_META.other;
  const style = cfg.tone
    ? {
        backgroundColor: `color-mix(in oklab, ${cfg.tone} 9%, var(--color-surface-card))`,
        borderColor: `color-mix(in oklab, ${cfg.tone} 20%, var(--color-border-subtle))`,
        color: `color-mix(in oklab, ${cfg.tone} 52%, var(--color-text-muted))`,
      }
    : {
        backgroundColor: 'var(--surface-chip-bg)',
        borderColor: 'var(--surface-chip-border)',
        color: 'var(--color-text-muted)',
      };
  const dotStyle = cfg.tone
    ? { backgroundColor: `color-mix(in oklab, ${cfg.tone} 72%, var(--color-text-muted))` }
    : { backgroundColor: 'var(--color-nav-muted)' };

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[0.64rem] font-medium"
      style={style}
    >
      <span
        className="size-1.5 rounded-full"
        style={dotStyle}
      />
      {cfg.label}
    </span>
  );
}
