'use client';

import { ExpandRowsButton } from '../../components/expand-rows-button';
import { DashboardTableFrame } from '../../components/dashboard-table-frame';
import { useTranslations } from 'next-intl';
import { formatKnownCost, formatCompactTokens, formatUsd, formatShortDate, formatDuration } from '../../formatters';
import type { ProjectsState } from './use-projects-state';

type SessionsTableProps = Pick<ProjectsState,
  'sessionSearch'
  | 'setSessionSearch'
  | 'sessionSort'
  | 'setSessionSort'
  | 'showAllSessions'
  | 'toggleSessions'
  | 'setInspectedSessionId'
  | 'filteredSessions'
  | 'visibleSessions'
  | 'maxSessionTokens'
  | 'inspectedSession'
>;

function formatSessionProject(name: string): string {
  if (!name) return '';
  if (name.length <= 30) return name;
  if (name.startsWith('Incept · Initial baseline enrollment:')) {
    return 'Incept · Initial baseline enrollme...';
  }
  return `${name.slice(0, 30)}...`;
}

export function SessionsTable({
  sessionSearch,
  setSessionSearch,
  sessionSort,
  setSessionSort,
  showAllSessions,
  toggleSessions,
  setInspectedSessionId,
  filteredSessions,
  visibleSessions,
  maxSessionTokens,
  inspectedSession,
}: SessionsTableProps) {
  const t = useTranslations('dashboard');

  return (
    <div className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-card)]">
      <div className="dashboard-sessions-header">
        <div className="flex items-center gap-2">
          <h3 className="text-[0.95rem] font-semibold text-[var(--color-text)]">{t('projects.sessions.title')}</h3>
          <span className="rounded-md border border-[var(--surface-chip-border)] bg-[var(--surface-chip-bg)] px-2 py-0.5 font-mono text-[0.7rem] tabular-nums text-[var(--color-text-muted)]">
            {filteredSessions.length}
          </span>
        </div>
        <div className="dashboard-session-controls">
          <label className="dashboard-session-search">
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" />
            </svg>
            <input type="search" aria-label={t('projects.sessions.searchLabel')} value={sessionSearch}
              onChange={event => setSessionSearch(event.target.value)} placeholder={t('projects.sessions.searchPlaceholder')} />
          </label>
          <div className="dashboard-session-sort" role="group" aria-label={t('projects.sessions.sortLabel')}>
            {([
              { id: 'tokens', label: 'sortTokens', short: 'sortTokensShort' },
              { id: 'cost', label: 'sortCost', short: 'sortCostShort' },
              { id: 'recent', label: 'sortRecent', short: 'sortRecentShort' },
              { id: 'duration', label: 'sortDuration', short: 'sortDurationShort' },
            ] as const).map(item => (
              <button key={item.id} type="button" aria-label={t('projects.sessions.' + item.label)}
                aria-pressed={sessionSort === item.id} data-active={sessionSort === item.id} onClick={() => setSessionSort(item.id)}>
                <span className="hidden sm:inline">{t('projects.sessions.' + item.label)}</span>
                <span className="sm:hidden">{t('projects.sessions.' + item.short)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <DashboardTableFrame rowLimit={12} expanded={showAllSessions}>
        <table aria-label={t("projects.sessions.title")} className="dashboard-data-table w-full min-w-[680px] border-collapse text-left text-[0.78rem]">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[var(--color-nav-muted)]">
              <th className="py-2.5 pr-3">{t('projects.sessions.colSession')}</th>
              <th className="px-2.5 py-2.5">{t('projects.sessions.colProject')}</th>
              <th className="px-2.5 py-2.5">{t('projects.sessions.colBreakdown')}</th>
              <th className="px-2.5 py-2.5 text-right">
                {t('projects.sessions.colTotal')}
              </th>
              <th className="py-2.5 pl-2.5 text-right">
                {t('projects.sessions.colCost')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)] tabular-nums">
            {visibleSessions.map((session) => {
              const shortId = session.sessionId.slice(0, 8);
              const isInspected = (inspectedSession?.sessionKey ?? inspectedSession?.sessionId) === (session.sessionKey ?? session.sessionId);
              const relativeWidth = Math.max(
                3,
                Math.round((session.totalTokens / maxSessionTokens) * 100),
              );
              return (
                <tr
                  key={`${session.source}-${session.sessionId}`}
                  onClick={() => setInspectedSessionId(session.sessionKey ?? session.sessionId)}
                  data-selected={isInspected}
                  aria-selected={isInspected}
                  className="cursor-pointer"
                >
                  <td className="max-w-[240px] py-3 pr-3">
                    <div className="truncate font-medium text-[var(--color-text)]">
                      {session.title ??
                        t('projects.sessions.untitledSession', {
                          source: session.source,
                          id: shortId,
                        })}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[0.68rem] text-[var(--color-nav-muted)]">
                      <span>{shortId}</span>
                      <span>·</span>
                      <span>{formatShortDate(session.lastActivity)}</span>
                      <span>·</span>
                      <span>{session.timestampPrecision === 'day' ? t('projects.sessions.dailySummary') : formatDuration(session.durationMinutes)}</span>
                    </div>
                  </td>
                  <td className="px-2.5 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        title={session.projectName}
                        className="inline-flex items-center rounded-md border border-[var(--surface-chip-border)] bg-[var(--surface-chip-bg)] px-2 py-0.5 text-[0.7rem] font-medium text-[var(--color-text)]"
                      >
                        {formatSessionProject(session.projectName)}
                      </span>
                      {Boolean(session.source && session.source.trim() && session.source.trim() !== '—') && (
                        <span className="rounded border border-[var(--color-border)] bg-[var(--color-row-bg)] px-1.5 py-0.5 font-mono text-[0.64rem] text-[var(--color-nav-muted)]">
                          {session.source}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-2.5 py-3 font-mono text-[0.7rem] text-[var(--color-text-muted)]">
                    <div>
                      {formatCompactTokens(session.inputTokens)} /{' '}
                      {formatCompactTokens(session.cacheReadTokens)} /{' '}
                      {formatCompactTokens(session.outputTokens)}
                    </div>
                    <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-[var(--color-row-bg)]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${relativeWidth}%`,
                          backgroundColor: 'var(--badge-sky-dot)',
                        }}
                      />
                    </div>
                  </td>
                  <td className="px-2.5 py-3 text-right font-mono font-semibold text-[var(--color-text)]">
                    {formatCompactTokens(session.totalTokens)}
                  </td>
                  <td className="py-3 pl-2.5 text-right font-mono font-semibold text-[var(--color-text)]">
                    {formatKnownCost(session.cost, session.missingPricing)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredSessions.length === 0 ? (
          <div className="py-10 text-center text-[0.8rem] text-[var(--color-nav-muted)]">
            {t('projects.sessions.empty')}
          </div>
        ) : null}
      </DashboardTableFrame>

      <ExpandRowsButton preservePagePosition expanded={showAllSessions} count={filteredSessions.length} limit={12}
        onToggle={toggleSessions}
        expandLabel={t('projects.sessions.showAll', { count: filteredSessions.length })}
        collapseLabel={t('projects.sessions.showLess')} />
    </div>
  );
}
