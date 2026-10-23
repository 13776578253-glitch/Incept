import { describe, expect, it } from 'vitest';
import { resolveModelIdentity } from '../domain/model-registry';
import { summarizeUsageEvents } from '../adapters/local/aggregation/summarize';
import type { RawUsageEvent, UnitPricing } from '../adapters/local/types';

describe('Model Identity Normalization and Registry', () => {
  it('normalizes all DeepSeek V4.1 Flash variants to canonicalModelId deepseek-v4.1-flash', () => {
    const variants = [
      'deepseek/deepseek-v4.1-flash',
      'deepseek-v4-flash',
      'deepseek-flash',
      'deepseek-v4.1-flash',
      'deepseek-v4.1-flash-fast',
      'workbuddy/deepseek-v4.1-flash',
      'workbuddy-ai/deepseek-v4.1-flash',
      'ccs-deepseek/deepseek-flash',
    ];

    for (const v of variants) {
      const res = resolveModelIdentity(v);
      expect(res.canonicalModelId).toBe('deepseek-v4.1-flash');
      expect(res.displayName).toBe('DeepSeek V4.1 Flash');
    }
  });

  it('marks pure deepseek-v4-flash and deepseek-flash as DeepSeek Official', () => {
    expect(resolveModelIdentity('deepseek-flash').provider).toBe('DeepSeek Official');
    expect(resolveModelIdentity('deepseek-v4-flash').provider).toBe('DeepSeek Official');
    expect(resolveModelIdentity('deepseek/deepseek-v4.1-flash').provider).toBe('DeepSeek Official');
  });

  it('marks ccs-deepseek/deepseek-flash as CommandCode provider', () => {
    const res = resolveModelIdentity('ccs-deepseek/deepseek-flash');
    expect(res.canonicalModelId).toBe('deepseek-v4.1-flash');
    expect(res.provider).toBe('CommandCode');
  });

  it('normalizes workbuddy/kimi-k3-1 to kimi-k3 and strips workbuddy prefix', () => {
    const res = resolveModelIdentity('workbuddy/kimi-k3-1');
    expect(res.canonicalModelId).toBe('kimi-k3');
    expect(res.displayName).toBe('Kimi K3');
    expect(res.provider).toBe('WorkBuddy');
  });

  it('normalizes codex-auto-review-unpriced by removing the -unpriced suffix', () => {
    const res = resolveModelIdentity('codex-auto-review-unpriced');
    expect(res.canonicalModelId).toBe('codex-auto-review');
    expect(res.displayName).toBe('Codex Auto-review');
    expect(res.provider).toBe('Codex');
  });

  it('normalizes xiaomi/mimo-v2.6-pro to mimo-v2.6-pro with Xiaomi provider', () => {
    const res = resolveModelIdentity('xiaomi/mimo-v2.6-pro');
    expect(res.canonicalModelId).toBe('mimo-v2.6-pro');
    expect(res.displayName).toBe('Mimo V2.6 Pro');
    expect(res.provider).toBe('Xiaomi');
  });

  it('normalizes gpt-6.1-sol to gpt-6.1-sol with OpenAI provider', () => {
    const res = resolveModelIdentity('gpt-6.1-sol');
    expect(res.canonicalModelId).toBe('gpt-6.1-sol');
    expect(res.displayName).toBe('GPT-6.1 Sol');
    expect(res.provider).toBe('OpenAI');
  });

  it('protects experimental models from being merged into base versions', () => {
    const expN = resolveModelIdentity('gemini-3.8-flash-n');
    expect(expN.canonicalModelId).toBe('gemini-3.8-flash-n');
    expect(expN.provider).toBe('Google');

    const expA = resolveModelIdentity('gemini-3.8-flash-exp-a');
    expect(expA.canonicalModelId).toBe('gemini-3.8-flash-exp-a');

    const expTiered = resolveModelIdentity('gemini-3.8-flash-tiered');
    expect(expTiered.canonicalModelId).toBe('gemini-3.8-flash-tiered');
  });
});

describe('Cross-source Model Aggregation in Summarize', () => {
  const pricingMap = new Map<string, UnitPricing>([
    ['deepseek-v4.1-flash', { inputPerMillion: 0.14, outputPerMillion: 0.28, cacheReadPerMillion: 0.014 }],
  ]);

  const timestampMs = Date.parse('2026-10-20T12:00:00Z');

  function makeEvent(id: string, modelName: string, sourceId: any, sourceLabel: string, tokens: number, cost: number): RawUsageEvent {
    return {
      eventId: `event-${id}`,
      sourceId,
      sourceLabel,
      sessionId: `session-${id}`,
      modelName,
      timestampMs,
      dateKey: '2026-10-20',
      monthKey: '2026-10',
      projectKey: 'test-project',
      projectName: 'Test Project',
      inputTokens: tokens,
      outputTokens: Math.floor(tokens / 2),
      cacheReadTokens: Math.floor(tokens / 4),
      cacheCreationTokens: 0,
      reasoningTokens: 0,
      cost,
      costSource: 'calculated',
      missingPricing: false,
    };
  }

  it('aggregates multiple DeepSeek V4.1 Flash variants across sources into a single model entry', () => {
    const events: RawUsageEvent[] = [
      makeEvent('1', 'deepseek/deepseek-v4.1-flash', 'commandcode', 'CommandCode', 1_210_000, 0.35),
      makeEvent('2', 'deepseek-flash', 'opencode', 'OpenCode', 540_000, 0.15),
      makeEvent('3', 'workbuddy/deepseek-v4.1-flash', 'workbuddy', 'WorkBuddy', 430_000, 0.12),
      makeEvent('4', 'ccs-deepseek/deepseek-flash', 'commandcode', 'CommandCode', 250_000, 0.07),
    ];

    const data = summarizeUsageEvents(events, 'test-home', pricingMap, timestampMs);

    // Exactly 1 model entry should exist
    expect(data.models.filter(m => m.slotStatus === 'measured')).toHaveLength(1);

    const model = data.models[0];
    expect(model.modelName).toBe('deepseek-v4.1-flash');
    expect(model.canonicalModelId).toBe('deepseek-v4.1-flash');
    expect(model.displayName).toBe('DeepSeek V4.1 Flash');

    // Token and cost totals must match sum of individual events
    const expectedInput = 1_210_000 + 540_000 + 430_000 + 250_000;
    expect(model.inputTokens).toBe(expectedInput);
    expect(model.cost).toBeCloseTo(0.35 + 0.15 + 0.12 + 0.07);

    // All raw model variants are preserved
    expect(model.rawModels?.sort()).toEqual([
      'ccs-deepseek/deepseek-flash',
      'deepseek-flash',
      'deepseek/deepseek-v4.1-flash',
      'workbuddy/deepseek-v4.1-flash',
    ].sort());

    // Sources used contains only actual collection sources/harnesses (no model vendors like DeepSeek Official)
    expect(model.sourcesUsed?.sort()).toEqual([
      'CommandCode',
      'OpenCode',
      'WorkBuddy',
    ].sort());

    // Strict equality of total tokens and costs across views
    expect(data.totals.cost).toBeCloseTo(model.cost);
    expect(data.totals.inputTokens).toBe(model.inputTokens);
  });
});
