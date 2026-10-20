'use client';

import { useEffect, useState } from 'react';
import { useMounted } from './use-mounted';

import {
  DOCS_CODE_PALETTE_COOKIE,
  DOCS_CODE_PALETTE_DATA_ATTRIBUTE,
  DOCS_CODE_PALETTE_STORAGE_KEY,
  isDocsCodePalette,
  type DocsCodePalette,
} from '@/features/docs/code-highlighting/palette';

const DEFAULT_PALETTE: DocsCodePalette = 'vscode';

function applyDocsCodePalette(palette: DocsCodePalette) {
  document.documentElement.setAttribute(DOCS_CODE_PALETTE_DATA_ATTRIBUTE, palette);
  document.cookie = `${DOCS_CODE_PALETTE_COOKIE}=${palette}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function useDocsCodePalette() {
  const isCodePaletteReady = useMounted();
  const [selection, setCodePaletteState] = useState<DocsCodePalette | null>(null);
  const storedValue = isCodePaletteReady ? window.localStorage.getItem(DOCS_CODE_PALETTE_STORAGE_KEY) : null;
  const codePalette = selection ?? (isDocsCodePalette(storedValue) ? storedValue : DEFAULT_PALETTE);

  useEffect(() => {
    if (isCodePaletteReady) applyDocsCodePalette(codePalette);
  }, [codePalette, isCodePaletteReady]);

  const setCodePalette = (nextPalette: DocsCodePalette) => {
    setCodePaletteState(nextPalette);
    window.localStorage.setItem(DOCS_CODE_PALETTE_STORAGE_KEY, nextPalette);
    applyDocsCodePalette(nextPalette);
  };

  return {
    codePalette,
    setCodePalette,
    isCodePaletteReady,
  };
}
