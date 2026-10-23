// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import type { SessionUsageItem } from '../domain';
import en from '../messages/en.json';
import { SessionsTable } from '../react/sections/projects/sessions-table';

afterEach(() => { cleanup(); });

const baseTokens = {
  inputTokens: 100,
  outputTokens: 50,
  cacheReadTokens: 200,
  cacheCreationTokens: 0,
  reasoningTokens: 0,
  totalTokens: 350,
  cost: 0.05,
  missingPricing: false,
};

describe('SessionsTable project truncation and source visibility', () => {
  it('truncates project names longer than 30 characters and hides empty source badges', () => {
    const sessions: SessionUsageItem[] = [
      {
        ...baseTokens,
        sessionId: 'session-1',
        projectKey: 'incept',
        projectName: 'Incept · Initial baseline enrollment: deepseekHarness:session-7a920d51-1769-40b2-bda3-1d837bcdd0d7',
        source: '', // No provider/source
        firstActivity: '2026-10-17T14:26:19.018Z',
        lastActivity: '2026-10-19T11:17:36.353Z',
        durationMinutes: 60,
        modelsUsed: ['gpt-4'],
        modelBreakdowns: [],
      },
      {
        ...baseTokens,
        sessionId: 'session-2',
        projectKey: 'incept',
        projectName: 'Incept · Auto-enrolled session',
        source: 'Codex CLI',
        firstActivity: '2026-10-17T14:26:19.018Z',
        lastActivity: '2026-10-19T11:17:36.353Z',
        durationMinutes: 30,
        modelsUsed: ['gpt-4'],
        modelBreakdowns: [],
      },
      {
        ...baseTokens,
        sessionId: 'session-3',
        projectKey: 'long',
        projectName: 'ThisIsAVeryLongProjectNameThatExceedsThirtyCharactersClearly',
        source: '—', // Dash / unassigned source
        firstActivity: '2026-10-17T14:26:19.018Z',
        lastActivity: '2026-10-19T11:17:36.353Z',
        durationMinutes: 10,
        modelsUsed: ['gpt-4'],
        modelBreakdowns: [],
      },
    ];

    render(
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={{ dashboard: en }}>
        <SessionsTable
          sessionSearch=""
          setSessionSearch={() => {}}
          sessionSort="tokens"
          setSessionSort={() => {}}
          showAllSessions={false}
          toggleSessions={() => {}}
          setInspectedSessionId={() => {}}
          filteredSessions={sessions}
          visibleSessions={sessions}
          maxSessionTokens={1000}
          inspectedSession={sessions[0]}
        />
      </NextIntlClientProvider>
    );

    // 1. Check baseline enrollment truncation matches exact example
    expect(screen.getByText('Incept · Initial baseline enrollme...')).toBeDefined();
    const truncatedChip = screen.getByText('Incept · Initial baseline enrollme...');
    expect(truncatedChip.getAttribute('title')).toBe(
      'Incept · Initial baseline enrollment: deepseekHarness:session-7a920d51-1769-40b2-bda3-1d837bcdd0d7'
    );

    // 2. Check general string > 30 chars truncation (30 chars + ...)
    const generalTruncated = screen.getByText('ThisIsAVeryLongProjectNameThat...');
    expect(generalTruncated).toBeDefined();

    // 3. Check strings <= 30 chars are not truncated
    expect(screen.getByText('Incept · Auto-enrolled session')).toBeDefined();

    // 4. Check source badge: Codex CLI is rendered
    expect(screen.getByText('Codex CLI')).toBeDefined();

    // 5. Check empty/dash sources are NOT rendered
    expect(screen.queryByText('—')).toBeNull();
  });
});
