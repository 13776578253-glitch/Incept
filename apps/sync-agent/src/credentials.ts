import {execFileSync} from 'node:child_process';
import {mkdirSync,lstatSync,readFileSync,writeFileSync,renameSync,openSync,fsyncSync,closeSync,existsSync,realpathSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
const run=(script:string,input?:unknown)=>execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{input:input===undefined?undefined:JSON.stringify(input),encoding:'utf8',windowsHide:true,timeout:15_000,stdio:['pipe','pipe','pipe']}).trim();
export function protectDirectory(directory:string){let parent=resolve(directory);while(!existsSync(parent)&&dirname(parent)!==parent)parent=dirname(parent);parent=realpathSync(parent);while(true){if(existsSync(join(parent,'.git')))throw Error('STATE_IN_REPOSITORY');if(dirname(parent)===parent)break;parent=dirname(parent);}
  mkdirSync(directory,{recursive:true,mode:0o700});if(lstatSync(directory).isSymbolicLink())throw Error('UNSAFE_STATE_DIRECTORY');
  if(process.platform==='win32')run(`$ErrorActionPreference='Stop'; $v=[Console]::In.ReadToEnd()|ConvertFrom-Json; $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User;
    $acl=New-Object Security.AccessControl.DirectorySecurity; $acl.SetOwner($sid);$acl.SetAccessRuleProtection($true,$false);
    $rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow');$acl.AddAccessRule($rule);[IO.Directory]::SetAccessControl($v.path,$acl)`,{path:directory});}
export function atomicJson(path:string,value:unknown){const temp=path+'.'+randomUUID()+'.tmp';writeFileSync(temp,JSON.stringify(value)+'\n',{mode:0o600,flag:'wx'});const fd=openSync(temp,'r+');try{fsyncSync(fd);}finally{closeSync(fd);}renameSync(temp,path);}
const dpapi=`$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $v=[Console]::In.ReadToEnd()|ConvertFrom-Json; $e=[Text.Encoding]::UTF8.GetBytes('Incept Sync Agent v1');
if($v.op -eq 'protect'){$b=[Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($v.token),$e,[Security.Cryptography.DataProtectionScope]::CurrentUser);[IO.File]::WriteAllBytes($v.path,$b);$s=[IO.File]::Open($v.path,'Open','ReadWrite','None');try{$s.Flush($true)}finally{$s.Dispose()};[Console]::Write('OK')}
elseif($v.op -eq 'read'){[Console]::Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($v.path),$e,[Security.Cryptography.DataProtectionScope]::CurrentUser)))}else{throw 'Invalid operation'}`;
export function storeToken(directory:string,token:string){if(process.platform!=='win32')throw Error('WINDOWS_DPAPI_REQUIRED');if(!/^isync_[A-Za-z0-9_-]{43}$/.test(token))throw Error('INVALID_DEVICE_TOKEN');
  protectDirectory(directory);const file=join(directory,'credential.dpapi'),temp=file+'.'+randomUUID()+'.tmp';run(dpapi,{op:'protect',path:temp,token});renameSync(temp,file);}
export function loadToken(directory:string){if(process.platform!=='win32')throw Error('WINDOWS_DPAPI_REQUIRED');const token=Buffer.from(run(dpapi,{op:'read',path:join(directory,'credential.dpapi')}),'base64').toString('utf8');if(!/^isync_[A-Za-z0-9_-]{43}$/.test(token))throw Error('INVALID_DEVICE_TOKEN');return token;}
export function readConfig<T>(directory:string):T{return JSON.parse(readFileSync(join(directory,'config.json'),'utf8'));}
