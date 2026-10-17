import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const windows=fileURLToPath(new URL('../windows/',import.meta.url));
test('Windows scripts parse; install/uninstall default to no changes', {skip:process.platform!=='win32'},()=>{
  const script=`$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';$root=$env:INCEPT_AGENT_SCRIPT_TEST_ROOT;Get-ChildItem -LiteralPath $root -Filter '*.ps1'|ForEach-Object {$tok=$null;$err=$null;[Management.Automation.Language.Parser]::ParseFile($_.FullName,[ref]$tok,[ref]$err)|Out-Null;if($err.Count){throw 'SCRIPT_PARSE_FAILED'}};& (Join-Path $root 'Install.ps1');& (Join-Path $root 'Uninstall.ps1')`;
  const output=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,encoding:'utf8',env:{...process.env,INCEPT_AGENT_SCRIPT_TEST_ROOT:windows}});
  assert.match(output,/No task installed/);assert.match(output,/No changes/);
});
