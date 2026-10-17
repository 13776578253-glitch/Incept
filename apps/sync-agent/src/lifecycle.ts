import {createServer,createConnection,type Server} from 'node:net';
import {join,resolve} from 'node:path';
import {existsSync,unlinkSync} from 'node:fs';
import {hash} from '../../../packages/dashboard/src/adapters/local/imports/identity';
export const lockPath=(directory:string)=>process.platform==='win32'?'\\\\.\\pipe\\incept-sync-agent-'+hash(resolve(directory).toLowerCase()):join(directory,'agent.sock');
export async function isRunning(directory:string){return new Promise<boolean>(yes=>{const socket=createConnection(lockPath(directory));const timer=setTimeout(()=>{socket.destroy();yes(false);},500);socket.once('connect',()=>{clearTimeout(timer);socket.destroy();yes(true);});socket.once('error',()=>{clearTimeout(timer);socket.destroy();yes(false);});});}
export async function acquireInstance(directory:string):Promise<Server>{
  const path=lockPath(directory);
  if(process.platform!=='win32'&&existsSync(path)){if(await isRunning(directory))throw Error('ALREADY_RUNNING');unlinkSync(path);}
  return new Promise((yes,no)=>{const server=createServer(socket=>socket.destroy());server.once('error',()=>no(Error('ALREADY_RUNNING')));server.listen(path,()=>yes(server));});
}
