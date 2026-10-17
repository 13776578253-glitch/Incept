import { chmodSync, existsSync, mkdirSync, createReadStream, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { backup, DatabaseSync } from 'node:sqlite';

export async function backupSqlite(source,out) {
  if(!isAbsolute(source)||!isAbsolute(out))throw Error('ABSOLUTE_PATH_REQUIRED');
  if(resolve(source)===resolve(out))throw Error('DISTINCT_COPY_REQUIRED');
  if(!existsSync(source))throw Error('SOURCE_NOT_FOUND');
  if(existsSync(out))throw Error('OUTPUT_EXISTS');
  mkdirSync(dirname(out),{recursive:true,mode:0o700});
  const db=new DatabaseSync(source,{readOnly:true});
  try{await backup(db,out,{rate:100});}
  finally{db.close();}
  chmodSync(out,0o600);
  const copy=new DatabaseSync(out,{readOnly:true});
  try{
    const integrity=String(copy.prepare('PRAGMA integrity_check').get().integrity_check);
    if(integrity!=='ok')throw Error('BACKUP_INTEGRITY_FAILED');
    const hash=createHash('sha256');for await(const chunk of createReadStream(out))hash.update(chunk);
    return {source,out,bytes:statSync(out).size,sha256:hash.digest('hex'),
      integrity,pageCount:Number(copy.prepare('PRAGMA page_count').get().page_count)};
  } finally {copy.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2),get=(name)=>{const index=args.indexOf(name);return index>=0?args[index+1]:undefined;};
  try{
    const result=await backupSqlite(get('--source'),get('--out'));
    console.log(JSON.stringify(result,null,2));
  }catch(error){console.error(JSON.stringify({error:error instanceof Error?error.message:'BACKUP_FAILED'}));process.exitCode=1;}
}
