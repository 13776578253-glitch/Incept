'use client';

import { useSyncExternalStore } from 'react';
import {
  normalizeModelColorKey,
  toColorFamilyKey,
  type ColorFamilyKey,
} from './model-colors';

export type DashboardPaletteStyle = 'theme' | 'vivid' | 'pastel';

export type DashboardPreferences = {
  paletteStyle: DashboardPaletteStyle;
  familyColors: Partial<Record<ColorFamilyKey, string>>;
  modelColors: Record<string, string>;
  pinnedModels: string[];
};

export type KnownDashboardModel = {
  modelName: string;
  displayName: string;
  provider: string;
};

export const DASHBOARD_PREFERENCES_STORAGE_KEY = 'incept-dashboard-preferences-v1';
export const DASHBOARD_KNOWN_MODELS_STORAGE_KEY = 'incept-dashboard-known-models-v1';
export const DASHBOARD_PREFERENCES_CHANGE_EVENT = 'incept:dashboard-preferences-change';
export const DASHBOARD_KNOWN_MODELS_CHANGE_EVENT = 'incept:dashboard-known-models-change';

const EMPTY_KNOWN_MODELS: KnownDashboardModel[] = [];
let cachedPrefRaw: string | null | undefined = undefined;
let cachedPrefValue: DashboardPreferences = {
  paletteStyle: 'theme',
  familyColors: {},
  modelColors: {},
  pinnedModels: [],
};
let cachedModelsRaw: string | null | undefined = undefined;
let cachedModelsValue: KnownDashboardModel[] = EMPTY_KNOWN_MODELS;

export const DEFAULT_DASHBOARD_PREFERENCES: DashboardPreferences = {
  paletteStyle: 'theme',
  familyColors: {},
  modelColors: {},
  pinnedModels: [],
};

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const MAX_PINNED_MODELS = 8;

function sanitizeHex(value: unknown): string | null {
  return typeof value === 'string' && HEX_COLOR_PATTERN.test(value.trim())
    ? value.trim().toLowerCase()
    : null;
}

function sanitizePreferences(raw: unknown): DashboardPreferences {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_DASHBOARD_PREFERENCES;
  }
  const obj = raw as Record<string, unknown>;
  const paletteStyle: DashboardPaletteStyle =
    obj.paletteStyle === 'vivid' || obj.paletteStyle === 'pastel'
      ? obj.paletteStyle
      : 'theme';

  const familyColors: Partial<Record<ColorFamilyKey, string>> = {};
  if (obj.familyColors && typeof obj.familyColors === 'object') {
    for (const [k, v] of Object.entries(obj.familyColors as Record<string, unknown>)) {
      const hex = sanitizeHex(v);
      if (hex) {
        familyColors[toColorFamilyKey(k)] = hex;
      }
    }
  }

  const modelColors: Record<string, string> = {};
  if (obj.modelColors && typeof obj.modelColors === 'object') {
    for (const [k, v] of Object.entries(obj.modelColors as Record<string, unknown>)) {
      const normKey = normalizeModelColorKey(k);
      const hex = sanitizeHex(v);
      if (normKey && hex) {
        modelColors[normKey] = hex;
      }
    }
  }

  const pinnedModels: string[] = [];
  if (Array.isArray(obj.pinnedModels)) {
    const seen = new Set<string>();
    for (const item of obj.pinnedModels) {
      if (typeof item !== 'string') continue;
      const trimmed = item.trim();
      const norm = normalizeModelColorKey(trimmed);
      if (!trimmed || !norm || seen.has(norm)) continue;
      seen.add(norm);
      pinnedModels.push(trimmed);
      if (pinnedModels.length >= MAX_PINNED_MODELS) break;
    }
  }

  return { paletteStyle, familyColors, modelColors, pinnedModels };
}

export function readDashboardPreferences(): DashboardPreferences {
  if (typeof window === 'undefined') {
    return DEFAULT_DASHBOARD_PREFERENCES;
  }
  try {
    const stored = window.localStorage.getItem(DASHBOARD_PREFERENCES_STORAGE_KEY);
    if (!stored) return DEFAULT_DASHBOARD_PREFERENCES;
    return sanitizePreferences(JSON.parse(stored));
  } catch {
    return DEFAULT_DASHBOARD_PREFERENCES;
  }
}

export function writeDashboardPreferences(
  nextOrUpdater:
    | Partial<DashboardPreferences>
    | ((prev: DashboardPreferences) => DashboardPreferences),
): DashboardPreferences {
  const prev = readDashboardPreferences();
  const merged =
    typeof nextOrUpdater === 'function'
      ? nextOrUpdater(prev)
      : {
          paletteStyle: nextOrUpdater.paletteStyle ?? prev.paletteStyle,
          familyColors: nextOrUpdater.familyColors ?? prev.familyColors,
          modelColors: nextOrUpdater.modelColors ?? prev.modelColors,
          pinnedModels: nextOrUpdater.pinnedModels ?? prev.pinnedModels,
        };
  const sanitized = sanitizePreferences(merged);
  if (typeof window !== 'undefined') {
    cachedPrefRaw = undefined;
    try {
      window.localStorage.setItem(DASHBOARD_PREFERENCES_STORAGE_KEY, JSON.stringify(sanitized));
    } catch {
      // Ignore quota / privacy mode failures
    }
    window.dispatchEvent(
      new CustomEvent<DashboardPreferences>(DASHBOARD_PREFERENCES_CHANGE_EVENT, {
        detail: sanitized,
      }),
    );
  }
  return sanitized;
}

export function resetDashboardPreferences(): DashboardPreferences {
  if (typeof window !== 'undefined') {
    cachedPrefRaw = undefined;
    try {
      window.localStorage.removeItem(DASHBOARD_PREFERENCES_STORAGE_KEY);
    } catch {
      // Ignore storage failures
    }
    window.dispatchEvent(
      new CustomEvent<DashboardPreferences>(DASHBOARD_PREFERENCES_CHANGE_EVENT, {
        detail: DEFAULT_DASHBOARD_PREFERENCES,
      }),
    );
  }
  return DEFAULT_DASHBOARD_PREFERENCES;
}

function getPreferencesSnapshot(): DashboardPreferences {
  if (typeof window === 'undefined') {
    return DEFAULT_DASHBOARD_PREFERENCES;
  }
  try {
    const raw = window.localStorage.getItem(DASHBOARD_PREFERENCES_STORAGE_KEY);
    if (raw === cachedPrefRaw) {
      return cachedPrefValue;
    }
    cachedPrefRaw = raw;
    cachedPrefValue = raw ? sanitizePreferences(JSON.parse(raw)) : DEFAULT_DASHBOARD_PREFERENCES;
    return cachedPrefValue;
  } catch {
    return DEFAULT_DASHBOARD_PREFERENCES;
  }
}

function subscribePreferences(callback: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }
  const onCustom = () => callback();
  const onStorage = (event: StorageEvent) => {
    if (event.key === DASHBOARD_PREFERENCES_STORAGE_KEY) {
      callback();
    }
  };
  window.addEventListener(DASHBOARD_PREFERENCES_CHANGE_EVENT, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(DASHBOARD_PREFERENCES_CHANGE_EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}

export function useDashboardPreferences(): {
  preferences: DashboardPreferences;
  updatePreferences: (
    nextOrUpdater:
      | Partial<DashboardPreferences>
      | ((prev: DashboardPreferences) => DashboardPreferences),
  ) => DashboardPreferences;
  resetPreferences: () => DashboardPreferences;
} {
  const preferences = useSyncExternalStore(
    subscribePreferences,
    getPreferencesSnapshot,
    () => DEFAULT_DASHBOARD_PREFERENCES,
  );

  return {
    preferences,
    updatePreferences: writeDashboardPreferences,
    resetPreferences: resetDashboardPreferences,
  };
}

function getKnownModelsSnapshot(): KnownDashboardModel[] {
  if (typeof window === 'undefined') {
    return EMPTY_KNOWN_MODELS;
  }
  try {
    const raw = window.localStorage.getItem(DASHBOARD_KNOWN_MODELS_STORAGE_KEY);
    if (raw === cachedModelsRaw) {
      return cachedModelsValue;
    }
    cachedModelsRaw = raw;
    if (!raw) {
      cachedModelsValue = EMPTY_KNOWN_MODELS;
      return cachedModelsValue;
    }
    const parsed = JSON.parse(raw);
    cachedModelsValue = Array.isArray(parsed)
      ? parsed.filter(
          (item): item is KnownDashboardModel =>
            Boolean(item) &&
            typeof item === 'object' &&
            typeof (item as KnownDashboardModel).modelName === 'string' &&
            typeof (item as KnownDashboardModel).displayName === 'string' &&
            typeof (item as KnownDashboardModel).provider === 'string',
        )
      : EMPTY_KNOWN_MODELS;
    return cachedModelsValue;
  } catch {
    return EMPTY_KNOWN_MODELS;
  }
}

function subscribeKnownModels(callback: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }
  const onCustom = () => callback();
  const onStorage = (event: StorageEvent) => {
    if (event.key === DASHBOARD_KNOWN_MODELS_STORAGE_KEY) {
      callback();
    }
  };
  window.addEventListener(DASHBOARD_KNOWN_MODELS_CHANGE_EVENT, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(DASHBOARD_KNOWN_MODELS_CHANGE_EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}

export function useKnownDashboardModels(): KnownDashboardModel[] {
  return useSyncExternalStore(
    subscribeKnownModels,
    getKnownModelsSnapshot,
    () => EMPTY_KNOWN_MODELS,
  );
}

export function readKnownDashboardModels(): KnownDashboardModel[] {
  return getKnownModelsSnapshot();
}

export function recordKnownDashboardModels(
  models: ReadonlyArray<{ modelName: string; displayName?: string; provider?: string }>,
): void {
  if (typeof window === 'undefined' || models.length === 0) return;
  try {
    const existing = readKnownDashboardModels();
    const byKey = new Map<string, KnownDashboardModel>();
    for (const item of existing) {
      byKey.set(normalizeModelColorKey(item.modelName), item);
    }
    for (const m of models) {
      if (!m.modelName?.trim()) continue;
      const key = normalizeModelColorKey(m.modelName);
      byKey.set(key, {
        modelName: m.modelName.trim(),
        displayName: (m.displayName || m.modelName).trim(),
        provider: (m.provider || 'other').trim(),
      });
    }
    const serialized = JSON.stringify(Array.from(byKey.values()));
    window.localStorage.setItem(DASHBOARD_KNOWN_MODELS_STORAGE_KEY, serialized);
    cachedModelsRaw = null;
    window.dispatchEvent(new CustomEvent(DASHBOARD_KNOWN_MODELS_CHANGE_EVENT));
  } catch {
    // Ignore storage failures
  }
}
