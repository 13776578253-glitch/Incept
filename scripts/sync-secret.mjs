import {randomBytes} from 'node:crypto';
import {chmodSync,chownSync,existsSync,mkdirSync,renameSync,rmSync,writeFileSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export function writeSyncRpcSecret(options) {
  if(!isAbsolute(options.output))throw Error('ABSOLUTE_OUTPUT_REQUIRED');
  if(existsSync(options.output)&&!options.rotate)throw Error('OUTPUT_ALREADY_EXISTS');
  mkdirSync(dirname(options.output),{recursive:true,mode:0o700});
  const temporary=options.output+'.partial-'+process.pid;
  rmSync(temporary,{force:true});
  try {
    writeFileSync(temporary,randomBytes(32).toString('hex')+'\n',{encoding:'utf8',flag:'wx',mode:0o600});
    chmodSync(temporary,0o600);
    if(options.uid!==undefined||options.gid!==undefined)chownSync(temporary,options.uid??-1,options.gid??-1);
    if(existsSync(options.output)) {
      const previous=options.output+'.previous-'+process.pid;
      renameSync(options.output,previous);
      try {renameSync(temporary,options.output);}
      catch(error){renameSync(previous,options.output);throw error;}
      rmSync(previous,{force:true});
    } else renameSync(temporary,options.output);
    chmodSync(options.output,0o600);
  } catch(error) {
    rmSync(temporary,{force:true});
    throw error;
  }
  return {ok:true,output:options.output,rotated:!!options.rotate,bytes:65};
}

function main(argv) {
  let output='',rotate=false,uid,gid,confirmed=false;
  for(const arg of argv){
    if(arg==='--rotate')rotate=true;
    else if(arg==='--confirm-owner')confirmed=true;
    else if(arg.startsWith('--output='))output=resolve(arg.slice('--output='.length));
    else if(arg.startsWith('--uid='))uid=Number(arg.slice('--uid='.length));
    else if(arg.startsWith('--gid='))gid=Number(arg.slice('--gid='.length));
    else throw Error('INVALID_ARGUMENT');
  }
  if(!confirmed)throw Error('OWNER_CONFIRMATION_REQUIRED');
  if(!output)throw Error('OUTPUT_REQUIRED');
  if(uid!==undefined&&(!Number.isInteger(uid)||uid<0))throw Error('INVALID_UID');
  if(gid!==undefined&&(!Number.isInteger(gid)||gid<0))throw Error('INVALID_GID');
  return writeSyncRpcSecret({output,rotate,uid,gid});
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{console.log(JSON.stringify(main(process.argv.slice(2))));}
  catch(error){console.error(JSON.stringify({ok:false,error:error instanceof Error?error.message:'SECRET_WRITE_FAILED'}));process.exitCode=1;}
}
