import {readFileSync} from 'node:fs';
import {isAbsolute} from 'node:path';

export function readRpcSecret(env:NodeJS.ProcessEnv=process.env):string {
  const file=env.INCEPT_SYNC_RPC_KEY_FILE;
  if(file&&!isAbsolute(file))throw new Error('RPC_SECRET_FILE_REQUIRED');
  const value=file?readFileSync(file,'utf8').trim():env.INCEPT_SYNC_RPC_KEY??'';
  if(!/^[a-f\d]{64,128}$/i.test(value)||/^(.)\1+$/.test(value))throw new Error('RPC_SECRET_INVALID');
  return value;
}
