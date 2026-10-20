import { existsSync, statSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, basename, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root=process.cwd(),target=resolve(process.argv[2]),report=resolve(process.argv[3]);
if(existsSync(target)||existsSync(report))throw Error('FROZEN_OUTPUT_EXISTS');
const git=args=>execFileSync('git',['-c','core.fsmonitor=false',...args],{cwd:root,encoding:'utf8'});
const files=[];
for(const value of git(['ls-files','-z','--cached','--others','--exclude-standard']).split('\0')){
  if(!value||value.split('/').some(x=>['node_modules','.next','dist','output','.git','.agents','.scratch'].includes(x))||basename(value).startsWith('.env'))continue;
  const source=join(root,value);
  if(!existsSync(source)||!statSync(source).isFile())continue;
  const data=readFileSync(source),dest=join(target,value);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,data,{flag:'wx'});
  files.push({path:value,size:data.length,sha256:createHash('sha256').update(data).digest('hex')});
}
files.sort((a,b)=>a.path.localeCompare(b.path));
writeFileSync(report,JSON.stringify({createdAt:new Date().toISOString(),head:git(['rev-parse','HEAD']).trim(),dirty:git(['status','--porcelain']),context:target,files},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({files:files.length,bytes:files.reduce((a,f)=>a+f.size,0),target,report}));
