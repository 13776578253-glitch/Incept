import { dashboardImportsGet } from '@incept/dashboard/next';
import { requireOwner } from '@/server/auth/guards';
export const runtime = 'nodejs';
export async function GET() { await requireOwner(); return dashboardImportsGet(); }
