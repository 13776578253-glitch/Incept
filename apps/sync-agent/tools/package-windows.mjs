import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

if(process.platform!=='win32')throw Error('WINDOWS_PACKAGING_REQUIRES_WINDOWS');
const root=fileURLToPath(new URL('../',import.meta.url)),output=join(root,'dist','package');
if(existsSync(join(output,'incept-sync-agent-win-node24.zip')))throw Error('PACKAGE_OUTPUT_EXISTS');
mkdirSync(output,{recursive:true});
for(const file of ['agent.mjs','collect-worker.mjs']){
  if(!existsSync(join(root,'dist',file)))throw Error('BUILD_ARTIFACT_MISSING');
}
const staging=join(root,'dist','incept-sync-agent-win-node24');
rmSync(staging,{recursive:true,force:true});
mkdirSync(staging,{recursive:true});
mkdirSync(join(staging,'dist'),{recursive:true});
for(const file of ['agent.mjs','collect-worker.mjs'])copyFileSync(join(root,'dist',file),join(staging,'dist',file));
const windows=join(staging,'windows');mkdirSync(windows,{recursive:true});
for(const file of ['Bind.ps1','Common.ps1','Install.ps1','Invoke-Agent.ps1','Start.ps1','Stop.ps1','Uninstall.ps1'])copyFileSync(join(root,'windows',file),join(windows,file));
copyFileSync(join(root,'README.md'),join(staging,'README.md'));
const zip=join(output,'incept-sync-agent-win-node24.zip');
const script=`Compress-Archive -LiteralPath '${staging.replaceAll("'","''")}' -DestinationPath '${zip.replaceAll("'","''")}' -CompressionLevel Optimal`;
const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,stdio:'inherit'});
if(result.status!==0||!existsSync(zip))throw Error('PACKAGE_ARCHIVE_FAILED');
const sha256=createHash('sha256').update(readFileSync(zip)).digest('hex');
console.log(JSON.stringify({path:zip,sha256,files:['dist/agent.mjs','dist/collect-worker.mjs','windows/*.ps1','README.md']},null,2));
