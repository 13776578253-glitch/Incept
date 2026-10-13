import { useMemo, useState } from 'react';
import { useExpandableRows } from '../../hooks/use-expandable-rows';
import type { TokenDashboardData } from '../../../domain/index';

export function useProjectsState(data: TokenDashboardData) {
  const [selectedProjectKey, setSelectedProjectKey] = useState<string>('all');

  const [sessionSearch, setSessionSearch] = useState<string>('');

  const [sessionSort, setSessionSort] = useState<'tokens' | 'cost' | 'recent' | 'duration'>(
    'tokens',
  );

  const [inspectedSessionId, setInspectedSessionId] = useState<string | null>(
    data.sessions[0]?.sessionKey ?? data.sessions[0]?.sessionId ?? null,
  );

  const maxProjectTokens = useMemo(
    () => Math.max(1, ...data.projects.map((p) => p.totalTokens)),
    [data.projects],
  );

  const filteredSessions = useMemo(() => {
    const query = sessionSearch.trim().toLowerCase();
    return data.sessions
      .filter((s) => {
        if(selectedProjectKey !== 'all' && s.projectKey !== selectedProjectKey) {
          return false;
        }
        if(!query) return true;
        return (
          s.sessionId.toLowerCase().includes(query) ||
          (s.title?.toLowerCase().includes(query) ?? false) ||
          s.projectName.toLowerCase().includes(query) ||
          s.source.toLowerCase().includes(query) ||
          s.modelsUsed.some((m) => m.toLowerCase().includes(query))
        );
      })
      .sort((a, b) => {
        if(sessionSort === 'cost') return b.cost - a.cost;
        if(sessionSort === 'recent') return b.lastActivity.localeCompare(a.lastActivity);
        if(sessionSort === 'duration') return b.durationMinutes - a.durationMinutes;
        return b.totalTokens - a.totalTokens;
      });
  }, [data.sessions, selectedProjectKey, sessionSearch, sessionSort]);

  const { expanded: showAllSessions, visibleRows: visibleSessions, toggle: toggleSessions } = useExpandableRows(
    filteredSessions, 12, JSON.stringify([data.range ?? 'all', selectedProjectKey, sessionSearch.trim().toLowerCase()]),
  );

  const maxSessionTokens = Math.max(1, ...filteredSessions.map((s) => s.totalTokens));

  const inspectedSession = useMemo(() => {
    if(!inspectedSessionId) return filteredSessions[0] ?? null;
    return (
      filteredSessions.find((s) => (s.sessionKey ?? s.sessionId) === inspectedSessionId) ??
      filteredSessions[0] ??
      null
    );
  }, [data.sessions, filteredSessions, inspectedSessionId]);

  return { selectedProjectKey, setSelectedProjectKey, sessionSearch, setSessionSearch, sessionSort, setSessionSort, showAllSessions, toggleSessions, inspectedSessionId, setInspectedSessionId, maxProjectTokens, filteredSessions, visibleSessions, maxSessionTokens, inspectedSession };
}

export type ProjectsState = ReturnType<typeof useProjectsState>;
