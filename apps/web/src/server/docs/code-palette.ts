import { cookies } from 'next/headers';

import {
  DOCS_CODE_PALETTE_COOKIE,
  isDocsCodePalette,
  type DocsCodePalette,
} from '@/features/docs/code-highlighting/palette';

export async function getDocsCodePalette(): Promise<DocsCodePalette> {
  const storedPalette = (await cookies()).get(DOCS_CODE_PALETTE_COOKIE)?.value;
  return isDocsCodePalette(storedPalette) ? storedPalette : 'vscode';
}
