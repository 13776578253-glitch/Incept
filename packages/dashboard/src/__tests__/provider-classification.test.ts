import { describe, expect, it } from 'vitest';
import { classifyProvider } from '../adapters/local/normalization';

describe('service provider classification', () => {
  it.each([
    'workbuddy/deepseek-v4.1-flash',
    'workbuddy/glm-5.3',
    'workbuddy/kimi-k3-1',
    'workbuddy/gpt-6.1-sol',
    'workbuddy/gemini-new',
    'workbuddy/claude-new',
    'workbuddy/new-model',
    'workbuddy-ai/deepseek-v4.1-flash',
    'workbuddy-ai/deepseek-v4.1-flash-sg',
    ' WorkBuddy/GLM-5.3 ',
  ])('keeps explicit WorkBuddy provider for %s', model => {
    expect(classifyProvider(model)).toBe('workbuddy');
  });

  it.each([
    ['deepseek/deepseek-v4.1-flash', 'deepseek'],
    ['gpt-6.1-sol', 'openai'],
    ['gemini-3.8-flash-n', 'gemini'],
    ['glm-5.3', 'zhipu'],
    ['my-workbuddy-model', 'other'],
    ['other/workbuddy/new-model', 'other'],
  ])('preserves ordinary classification for %s', (model, provider) => {
    expect(classifyProvider(model)).toBe(provider);
  });
});
