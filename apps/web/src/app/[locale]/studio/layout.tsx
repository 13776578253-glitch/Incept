import type { ReactNode } from 'react';
import { requireOwner } from '@/server/auth';

export default async function StudioLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireOwner();

  return children;
}
