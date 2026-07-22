import 'server-only';

import { notFound } from 'next/navigation';
import { getCurrentViewer } from './viewer';

export async function requireOwner() {
  const viewer = await getCurrentViewer();

  if (viewer.role !== 'owner') {
    notFound();
  }

  return viewer;
}
