import {handleSyncRequest} from '@/server/sync/next';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=handleSyncRequest;
export const POST=handleSyncRequest;
export const PUT=handleSyncRequest;
export const PATCH=handleSyncRequest;
export const DELETE=handleSyncRequest;
