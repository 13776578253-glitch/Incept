'use client';

import { useMemo, useState } from 'react';

import type { MusicAdminData, MusicAdminLibrary, MusicAdminTrack } from '@/server/music/music-admin';

import { getMusicAdminCopy } from './music-admin-copy';
import { MusicLibraryEditor } from './music-library-editor';
import { MusicTrackTable, type MusicTrackPatch } from './music-track-table';
import { MusicUploadZone } from './music-upload-zone';

function sortLibraries(libraries: MusicAdminLibrary[]): MusicAdminLibrary[] {
  return [...libraries].sort(
    (left, right) => left.position - right.position || left.key.localeCompare(right.key),
  );
}

function sortTracks(tracks: MusicAdminTrack[]): MusicAdminTrack[] {
  return [...tracks].sort(
    (left, right) => left.position - right.position || left.trackKey.localeCompare(right.trackKey),
  );
}

function applyTrackPatch(track: MusicAdminTrack, patch: MusicTrackPatch): MusicAdminTrack {
  return {
    ...track,
    ...(patch.publishedAt !== undefined ? { publishedAt: patch.publishedAt } : {}),
    ...(patch.position !== undefined ? { position: patch.position } : {}),
    ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
    ...(patch.libraries !== undefined ? { libraries: [...patch.libraries] } : {}),
  };
}

function mergeLibrary(libraries: MusicAdminLibrary[], library: MusicAdminLibrary): MusicAdminLibrary[] {
  return sortLibraries([...libraries.filter((entry) => entry.key !== library.key), library]);
}

export function MusicAdminPanel({ locale, data }: { locale: string; data: MusicAdminData }) {
  const copy = useMemo(() => getMusicAdminCopy(locale), [locale]);
  const [state, setState] = useState<MusicAdminData>(data);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preferredLibrary, setPreferredLibrary] = useState('');

  // 成员数从曲目的归属里现算：任何一次编辑之后都不需要再手工维护计数
  const libraries = useMemo(() => {
    const counts = new Map<string, number>();

    for (const track of state.tracks) {
      for (const key of track.libraries) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }

    return state.libraries.map((library) => ({ ...library, memberCount: counts.get(library.key) ?? 0 }));
  }, [state]);

  const activeLibraries = libraries.filter((library) => library.isActive);
  const uploadLibrary = activeLibraries.some((library) => library.key === preferredLibrary)
    ? preferredLibrary
    : (activeLibraries[0]?.key ?? '');

  const request = async (input: string, init: RequestInit) => {
    setIsBusy(true);
    setError(null);

    try {
      const response = await fetch(input, init);
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          payload !== null && typeof payload === 'object' && 'error' in payload
            ? String((payload as { error: unknown }).error)
            : `HTTP ${response.status}`;

        setError(`${copy.failedPrefix} ${message}`);
        return null;
      }

      return (payload ?? {}) as Record<string, unknown>;
    } catch (thrown) {
      setError(
        `${copy.failedPrefix} ${thrown instanceof Error ? thrown.message : 'network error'}`.trim(),
      );
      return null;
    } finally {
      setIsBusy(false);
    }
  };

  const patchTrack = async (trackKey: string, patch: MusicTrackPatch) => {
    const snapshot = state;

    setState((current) => ({
      ...current,
      tracks: current.tracks.map((track) =>
        track.trackKey === trackKey ? applyTrackPatch(track, patch) : track,
      ),
    }));

    const payload = await request(`/api/internal/music/tracks/${encodeURIComponent(trackKey)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const track = payload?.track as MusicAdminTrack | undefined;

    if (!track) {
      setState(snapshot);
      return;
    }

    setState((current) => ({
      ...current,
      tracks: sortTracks(
        current.tracks.map((entry) => (entry.trackKey === trackKey ? track : entry)),
      ),
    }));
  };

  const moveTrack = async (trackKey: string, direction: -1 | 1) => {
    const index = state.tracks.findIndex((track) => track.trackKey === trackKey);
    const neighbor = state.tracks[index + direction];

    if (index === -1 || !neighbor) return;

    const current = state.tracks[index];

    await patchTrack(trackKey, { position: neighbor.position });
    await patchTrack(neighbor.trackKey, { position: current.position });
  };

  const patchLibrary = async (key: string, patch: Record<string, unknown>) => {
    const payload = await request(`/api/internal/music/libraries/${encodeURIComponent(key)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const library = payload?.library as MusicAdminLibrary | undefined;

    if (!library) return null;

    setState((current) => ({ ...current, libraries: mergeLibrary(current.libraries, library) }));

    return library;
  };

  const ensureLibrary = async (name: string): Promise<string> => {
    const payload = await request('/api/internal/music/libraries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const library = payload?.library as MusicAdminLibrary | undefined;

    if (!library) {
      throw new Error(copy.failedPrefix);
    }

    setState((current) => ({ ...current, libraries: mergeLibrary(current.libraries, library) }));

    return library.key;
  };

  // 永久删除：只删行与成员关系，与停用是两条路
  // 只有右键菜单里的二次确认会走到这里，服务端还会再校验一次（owner + 同源）。
  const deleteTrack = async (trackKey: string) => {
    const payload = await request(`/api/internal/music/tracks/${encodeURIComponent(trackKey)}`, {
      method: 'DELETE',
    });

    if (!payload) return;

    setState((current) => ({
      ...current,
      tracks: current.tracks.filter((track) => track.trackKey !== trackKey),
    }));
  };

  const deleteLibrary = async (key: string) => {
    const payload = await request(`/api/internal/music/libraries/${encodeURIComponent(key)}`, {
      method: 'DELETE',
    });

    if (!payload) return;

    setState((current) => ({
      ...current,
      libraries: current.libraries.filter((library) => library.key !== key),
    }));
  };

  const setLibraryActive = async (key: string, isActive: boolean, moveMembersTo?: string) => {
    const library = await patchLibrary(key, {
      isActive,
      ...(moveMembersTo !== undefined ? { moveMembersTo } : {}),
    });

    if (!library || library.isActive) return;

    // 停用后成员已按请求转移：本地把被移除的 key 换成目标库，保持界面与数据库一致
    setState((current) => ({
      ...current,
      tracks: current.tracks.map((track) => {
        if (!track.libraries.includes(key)) return track;

        const remaining = track.libraries.filter((candidate) => candidate !== key);

        return {
          ...track,
          libraries: moveMembersTo ? [...new Set([...remaining, moveMembersTo])] : remaining,
        };
      }),
    }));
  };

  const moveLibrary = async (key: string, direction: -1 | 1) => {
    const index = libraries.findIndex((library) => library.key === key);
    const neighbor = libraries[index + direction];

    if (index === -1 || !neighbor) return;

    await patchLibrary(key, { position: neighbor.position });
    await patchLibrary(neighbor.key, { position: libraries[index].position });
  };

  if (state.status === 'unavailable') {
    return (
      <section className="space-y-2">
        <h3 className="text-[1.0625rem] font-semibold tracking-[-0.01em] text-[var(--color-text)]">
          {copy.heading}
        </h3>
        <p className="max-w-2xl text-[0.8125rem] leading-6 text-[var(--color-nav-dropdown-description)]">
          {copy.unavailablePrefix}
          {state.message}
        </p>
      </section>
    );
  }

  return (
    <section className="max-w-[760px] space-y-6" aria-label={copy.heading}>
      <header className="space-y-1.5">
        <h3 className="text-[1.0625rem] font-semibold tracking-[-0.01em] text-[var(--color-text)]">
          {copy.heading}
        </h3>
        <p className="max-w-2xl text-[0.8125rem] leading-6 text-[var(--color-nav-dropdown-description)]">
          {copy.description}
        </p>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-[10px] border border-[var(--color-nav-dropdown-border)] px-3 py-2 text-[0.8125rem] text-[var(--color-text)]"
        >
          {error}
        </p>
      ) : null}

      <MusicUploadZone
        copy={copy}
        libraries={libraries}
        selectedLibrary={uploadLibrary}
        onSelectLibrary={setPreferredLibrary}
        ensureLibrary={ensureLibrary}
        onUploaded={(track) => {
          // 同名替换而不是直接追加
          setState((current) => ({
            ...current,
            tracks: sortTracks([
              ...current.tracks.filter((entry) => entry.trackKey !== track.trackKey),
              track,
            ]),
          }));
        }}
      />

      <MusicLibraryEditor
        copy={copy}
        libraries={libraries}
        isBusy={isBusy}
        onCreate={(name) => {
          void ensureLibrary(name);
        }}
        onRename={(key, title) => {
          void patchLibrary(key, { title });
        }}
        onMove={(key, direction) => {
          void moveLibrary(key, direction);
        }}
        onSetActive={(key, isActive, moveMembersTo) => {
          void setLibraryActive(key, isActive, moveMembersTo);
        }}
        onDelete={(key) => {
          void deleteLibrary(key);
        }}
      />

      <MusicTrackTable
        copy={copy}
        tracks={state.tracks}
        libraries={libraries}
        isBusy={isBusy}
        onPatch={(trackKey, patch) => {
          void patchTrack(trackKey, patch);
        }}
        onMove={(trackKey, direction) => {
          void moveTrack(trackKey, direction);
        }}
        onDelete={(trackKey) => {
          void deleteTrack(trackKey);
        }}
      />
    </section>
  );
}
