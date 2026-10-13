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
};

export function ProjectsSection({
  data,
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
      <ProjectAttributionTable
        selectedProjectKey={selectedProjectKey}
        setSelectedProjectKey={setSelectedProjectKey}
        maxProjectTokens={maxProjectTokens}
        data={data}
      />

      {/* Sessions Master-Detail Explorer */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        {/* Left: Sessions Table */}
        <SessionsTable
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
        />

        {/* Right: Session Detail Inspector */}
        <SessionInspector inspectedSession={inspectedSession} />
      </div>
    </section>
  );
}
