import { dashboardImportCommitPost } from '@incept/dashboard/next';
import { withSensitiveOwnerAction } from '@/server/auth/sensitive-action';
import { getRequestOrigin } from '@/server/auth/request-origin';
export const runtime = 'nodejs';
export const POST = withSensitiveOwnerAction('dashboard.import.commit', async (request: Request) => dashboardImportCommitPost(request, getRequestOrigin(request)));
