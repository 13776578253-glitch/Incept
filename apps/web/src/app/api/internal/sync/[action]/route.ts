import {remoteSync} from '@/server/sync/next';
export const runtime='nodejs';
export async function POST(request:Request){try{const remote=remoteSync();return remote?remote.internal(request):Response.json({error:'NOT_FOUND'},{status:404});}catch{return Response.json({error:'RPC_UNAVAILABLE'},{status:503});}}
