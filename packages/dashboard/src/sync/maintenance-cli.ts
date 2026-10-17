import {runMaintenance} from '../../tools/phase5/maintenance';
runMaintenance().then(result=>{
  console.log(JSON.stringify(result));
  if('ok' in result&&!result.ok)process.exitCode=2;
}).catch(()=>{
  console.error(JSON.stringify({ok:false,error:'MAINTENANCE_FAILED'}));process.exitCode=1;
});
