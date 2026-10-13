'use client';

import { ExpandRowsButton } from '../../components/expand-rows-button';
import { useExpandableRows } from '../../hooks/use-expandable-rows';
import { DashboardTableFrame } from '../../components/dashboard-table-frame';
import { useTranslations } from 'next-intl';
import type { TokenDashboardData } from '../../../domain/index';
import { formatKnownCost, formatCompactTokens, formatUsd, formatPercent, formatShortDate } from '../../formatters';
import { MODEL_COLORS } from '../../model-colors';
import type { ProjectsState } from './use-projects-state';

type ProjectAttributionTableProps = {
  data: TokenDashboardData;
} & Pick<ProjectsState, 'selectedProjectKey' | 'setSelectedProjectKey' | 'maxProjectTokens'>;

export function ProjectAttributionTable({
  selectedProjectKey,
  setSelectedProjectKey,
  maxProjectTokens,
  data,
}: ProjectAttributionTableProps) {
  const t = useTranslations('dashboard');
  const { expanded, visibleRows, toggle } = useExpandableRows(data.projects, 10, data.range ?? 'all');

  return (
    <div className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-card)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] px-5 py-3.5">
        <div>
          <h3 className="text-[0.95rem] font-semibold text-[var(--color-text)]">
            {t('projects.attribution.title')}
          </h3>
          <p className="text-[0.73rem] text-[var(--color-nav-muted)]">
            {t('projects.attribution.subtitle')}
          </p>
        </div>
        {selectedProjectKey !== 'all' ? (
          <button
            type="button"
            onClick={() => setSelectedProjectKey('all')}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-row-bg)] px-2.5 py-1 text-[0.72rem] font-medium text-[var(--color-text)] hover:bg-[var(--color-nav-item-hover)]"
          >
            {t('projects.attribution.allProjects', {
              count: data.totals.sessionCount,
            })}
          </button>
        ) : null}
      </div>

      <DashboardTableFrame rowLimit={10} expanded={expanded}>
        <table aria-label={t("projects.attribution.title")} className="dashboard-data-table w-full min-w-[680px] border-collapse text-left text-[0.8rem]">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[var(--color-nav-muted)]">
              <th className="py-2.5 pr-4">{t('projects.attribution.colProject')}</th>
              <th className="px-3 py-2.5 text-right">
                {t('projects.attribution.colSessions')}
              </th>
              <th className="px-3 py-2.5 text-right">
                {t('projects.attribution.colLastActive')}
              </th>
              <th className="px-4 py-2.5">{t('projects.attribution.colTokens')}</th>
              <th className="px-3 py-2.5 text-right">
                {t('projects.attribution.colShare')}
              </th>
              <th className="py-2.5 pl-3 text-right">
                {t('projects.attribution.colCost')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)] tabular-nums">
            {visibleRows.map((proj, idx) => {
              const isSelected = selectedProjectKey === proj.projectKey;
              const relToTop = Math.max(
                3,
                Math.round((proj.totalTokens / maxProjectTokens) * 100),
              );
              return (
                <tr
                  key={proj.projectKey}
                  onClick={() =>
                    setSelectedProjectKey((cur) =>
                      cur === proj.projectKey ? 'all' : proj.projectKey,
                    )
                  }
                  data-selected={isSelected}
                  aria-selected={isSelected}
                  className="cursor-pointer"
                >
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-2.5">
                      <span className="w-5 font-mono text-[0.7rem] text-[var(--color-nav-muted)]">
                        #{idx + 1}
                      </span>
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor: MODEL_COLORS[idx % MODEL_COLORS.length],
                        }}
                      />
                      <div>
                        <div className="font-semibold text-[var(--color-text)]">
                          {proj.projectName}
                        </div>
                        {proj.workspacePath ? (
                          <div className="font-mono text-[0.68rem] text-[var(--color-nav-muted)]">
                            {proj.workspacePath}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[var(--color-text-muted)]">
                    {proj.sessionCount}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[var(--color-text-muted)]">
                    {formatShortDate(proj.lastActivity)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="w-16 font-mono font-semibold text-[var(--color-text)]">
                        {formatCompactTokens(proj.totalTokens)}
                      </span>
                      <div className="h-1.5 w-36 overflow-hidden rounded-full bg-[var(--color-row-bg)]">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${relToTop}%`,
                            backgroundColor: MODEL_COLORS[idx % MODEL_COLORS.length],
                          }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[var(--color-text-muted)]">
                    {formatPercent(proj.shareOfTokens, 1)}
                  </td>
                  <td className="py-2.5 pl-3 text-right font-mono font-semibold text-[var(--color-text)]">
                    {formatKnownCost(proj.cost, proj.missingPricing)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </DashboardTableFrame>
      <ExpandRowsButton preservePagePosition expanded={expanded} count={data.projects.length} limit={10} onToggle={toggle}
        expandLabel={t('projects.attribution.showAll', { count: data.projects.length })}
        collapseLabel={t('projects.attribution.showLess')} />
    </div>
  );
}
