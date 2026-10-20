import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

if(process.platform!=='win32')throw Error('WINDOWS_PACKAGING_REQUIRES_WINDOWS');
const root=fileURLToPath(new URL('../',import.meta.url));
const repo=fileURLToPath(new URL('../../../',import.meta.url));
const agent=join(repo,'apps','sync-agent');
const output=join(root,'dist','package');
const zip=join(output,'incept-sync-tray-win-x64.zip');
const staging=join(root,'dist','Incept Sync');

for(const file of ['agent.mjs','collect-worker.mjs']){
  if(!existsSync(join(agent,'dist',file)))throw Error('BUILD_ARTIFACT_MISSING');
}
execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(root,'tools','build.ps1')],{stdio:'inherit'});

rmSync(staging,{recursive:true,force:true});
mkdirSync(join(staging,'agent'),{recursive:true});
mkdirSync(join(staging,'windows'),{recursive:true});
copyFileSync(join(root,'dist','InceptSync.exe'),join(staging,'InceptSync.exe'));
for(const file of ['agent.mjs','collect-worker.mjs'])copyFileSync(join(agent,'dist',file),join(staging,'agent',file));
for(const file of readdirSync(join(agent,'windows')).filter(name=>name.endsWith('.ps1')))copyFileSync(join(agent,'windows',file),join(staging,'windows',file));
copyFileSync(join(root,'README.md'),join(staging,'README.md'));

mkdirSync(output,{recursive:true});
rmSync(zip,{force:true});
const script=`Compress-Archive -LiteralPath '${staging.replaceAll("'","''")}' -DestinationPath '${zip.replaceAll("'","''")}' -CompressionLevel Optimal`;
const result=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{stdio:'inherit'});
const sha256=createHash('sha256').update(readFileSync(zip)).digest('hex');
console.log(JSON.stringify({path:zip,sha256,files:['InceptSync.exe','agent/agent.mjs','agent/collect-worker.mjs','windows/*.ps1','README.md']},null,2));
