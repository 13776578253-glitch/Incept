// Test-only Node preload. Never imported by the application or production config.
import {isMainThread} from 'node:worker_threads';
import {monitorEventLoopDelay, performance} from 'node:perf_hooks';
import {readFileSync, writeFileSync, renameSync, mkdirSync} from 'node:fs';
if (isMainThread && process.argv[1]?.includes('/next/')) {
  const dir=process.env.PHASE2E_METRICS_DIR;
  if(!dir?.startsWith('/data/phase2e-'))throw new Error('ISOLATED_METRICS_REQUIRED');
  mkdirSync(dir,{recursive:true});
  const lag=monitorEventLoopDelay({resolution:10});lag.enable();
  const read=name=>readFileSync('/sys/fs/cgroup/'+name,'utf8').trim();
  const fields=name=>Object.fromEntries(read(name).split('\n').map(line=>line.split(' ')).map(([key,value])=>[key,Number(value)]));
  setInterval(()=>{
    const row={at:Date.now(),pid:process.pid,rss:process.memoryUsage().rss,heapUsed:process.memoryUsage().heapUsed,cpu:process.cpuUsage(),
      current:Number(read('memory.current')),peak:Number(read('memory.peak')),max:read('memory.max'),swapMax:read('memory.swap.max'),
      events:fields('memory.events'),stat:fields('memory.stat'),lagMaxMs:lag.max/1e6,lagP99Ms:lag.percentile(99)/1e6,elu:performance.eventLoopUtilization()};
    const file=dir+'/next.json';writeFileSync(file+'.tmp',JSON.stringify(row));renameSync(file+'.tmp',file);lag.reset();
  },100).unref();
}
