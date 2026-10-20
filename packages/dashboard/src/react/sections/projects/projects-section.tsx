'use client';

import { useTranslations } from 'next-intl';
import type { TokenDashboardData } from '../../../domain/index';
import { SectionHeader } from '../../components/section-header';
import { useProjectsState } from './use-projects-state';
import { ProjectAttributionTable } from './project-attribution-table';
import { SessionsTable } from './sessions-table';
import { SessionInspector } from './session-inspector';

type ProjectsSectionProps = {
  data: TokenDashboardData;
  canViewDetails?: boolean;
};

function RestrictedPanel({ title, message }: { title: string; message: string }) {
  return <div className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-card)]">
    <div className="border-b border-[var(--color-border)] px-5 py-3.5">
      <h3 className="text-[0.95rem] font-semibold text-[var(--color-text)]">{title}</h3>
    </div>
    <p className="flex min-h-40 items-center justify-center px-5 py-8 text-sm text-[var(--color-nav-muted)]">{message}</p>
  </div>;
}

export function ProjectsSection({
  data,
  canViewDetails = true,
}: ProjectsSectionProps) {
  const t = useTranslations('dashboard');
  const {
    selectedProjectKey,
    setSelectedProjectKey,
    sessionSearch,
    setSessionSearch,
    sessionSort,
    setSessionSort,
    showAllSessions,
    toggleSessions,
    inspectedSessionId,
    setInspectedSessionId,
    maxProjectTokens,
    filteredSessions,
    visibleSessions,
    maxSessionTokens,
    inspectedSession,
  } = useProjectsState(data);

  return (
    <section
      aria-labelledby="projects"
      className="space-y-5 border-t border-[var(--color-border)] pt-10"
    >
      <SectionHeader
        id="projects"
        eyebrow={t('projects.eyebrow')}
        title={t('projects.title')}
        description={t('projects.description')}
        accentColor="var(--badge-amber-dot)"
      />

      {/* Flat Project Attribution Ranking Table */}
      {canViewDetails ? <ProjectAttributionTable
        selectedProjectKey={selectedProjectKey}
        setSelectedProjectKey={setSelectedProjectKey}
        maxProjectTokens={maxProjectTokens}
        data={data}
      /> : <RestrictedPanel title={t('projects.attribution.title')} message={t('projects.noAccess')} />}

      {/* Sessions Master-Detail Explorer */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        {/* Left: Sessions Table */}
        {canViewDetails ? <SessionsTable
          sessionSearch={sessionSearch}
          setSessionSearch={setSessionSearch}
          sessionSort={sessionSort}
          setSessionSort={setSessionSort}
          showAllSessions={showAllSessions}
          toggleSessions={toggleSessions}
          setInspectedSessionId={setInspectedSessionId}
          filteredSessions={filteredSessions}
          visibleSessions={visibleSessions}
          maxSessionTokens={maxSessionTokens}
          inspectedSession={inspectedSession}
        /> : <RestrictedPanel title={t('projects.sessions.title')} message={t('projects.noAccess')} />}

        {/* Right: Session Detail Inspector */}
        {canViewDetails ? <SessionInspector inspectedSession={inspectedSession} />
          : <RestrictedPanel title={t('projects.sessions.inspector.title')} message={t('projects.noAccess')} />}
      </div>
    </section>
  );
}
