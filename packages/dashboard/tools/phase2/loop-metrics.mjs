import {monitorEventLoopDelay,performance} from 'node:perf_hooks';
import {writeFileSync,readFileSync} from 'node:fs';
import {isMainThread} from 'node:worker_threads';
if(isMainThread){const delay=monitorEventLoopDelay({resolution:10});delay.enable();const start=performance.eventLoopUtilization();let cgroupPeakBytes=0;
  setInterval(()=>{let cgroupBytes=0;try{cgroupBytes=Number(readFileSync('/sys/fs/cgroup/memory.current','utf8'));}catch{}cgroupPeakBytes=Math.max(cgroupPeakBytes,cgroupBytes);
    writeFileSync('/tmp/sync-phase2/loop-metrics.json',JSON.stringify({maxDelayMs:delay.max/1e6,p99DelayMs:delay.percentile(99)/1e6,meanDelayMs:delay.mean/1e6,eventLoopUtilization:performance.eventLoopUtilization(start).utilization,cgroupBytes,cgroupPeakBytes,processRssBytes:process.memoryUsage().rss,cpu:process.cpuUsage()}));},250).unref();}
