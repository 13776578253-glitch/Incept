import type { ReactNode } from 'react';
import { requireOwner } from '@/server/auth';

export default async function DocsImportPreviewLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireOwner();

  return children;
}
