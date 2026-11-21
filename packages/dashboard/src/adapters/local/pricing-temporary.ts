import type { UnitPricing } from './types';

// Temporary historical API rates in USD per million tokens, verified 2026-10-13
// https://developers.openai.com/api/docs/models/gpt-5.3-codex
// https://developers.openai.com/api/docs/models/gpt-5.2-codex
// No cache-write price is published; leave it unavailable rather than assume zero
export const TEMPORARY_MODEL_PRICES: Readonly<Record<string, UnitPricing>> = {
  'gpt-5.3-codex': { inputPerMillion: 1.75, outputPerMillion: 14, cacheReadPerMillion: 0.175 },
  'gpt-5.2-codex': { inputPerMillion: 1.75, outputPerMillion: 14, cacheReadPerMillion: 0.175 },
  'gpt-6.2-sol': { inputPerMillion: 2, outputPerMillion: 10, cacheReadPerMillion: 0.1 },
  'gemini-4-hydrogen': { inputPerMillion: 1.5, outputPerMillion: 7.5, cacheReadPerMillion: 0.075 },
  'gemini-4-neon': { inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.15 },
};
