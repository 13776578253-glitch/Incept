'use client';

import { useContext } from 'react';

import {
  MusicPlayerPreferencesContext,
  type MusicPlayerPreferencesValue,
} from './music-player-preferences-provider';

export function useMusicPlayerPreferences(): MusicPlayerPreferencesValue {
  const value = useContext(MusicPlayerPreferencesContext);

  if (value === null) {
    throw new Error('useMusicPlayerPreferences must be used inside MusicPlayerPreferencesProvider.');
  }

  return value;
}
