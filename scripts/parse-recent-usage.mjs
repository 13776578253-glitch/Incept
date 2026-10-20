import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const projectsRoot = path.join(os.homedir(), '.commandcode', 'projects');
const dates = {};

for (const p of fs.readdirSync(projectsRoot)) {
  const pPath = path.join(projectsRoot, p);
  if (!fs.statSync(pPath).isDirectory()) continue;
  for (const f of fs.readdirSync(pPath)) {
    if (!f.endsWith('.jsonl') || f.endsWith('.checkpoints.jsonl')) continue;
    const filePath = path.join(pPath, f);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    for (const l of lines) {
      if (!l.includes('"usage"')) continue;
      try {
        const obj = JSON.parse(l);
        if (!obj.usage || !obj.model) continue;
        const ts = obj.timestamp ?? obj.message?.meta?.createdAt;
        if (!ts) continue;
        const d = new Date(ts);
        // Using local time
        const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (!dates[dateKey]) {
          dates[dateKey] = {
            count: 0,
            models: {},
            totalRawInput: 0,
            totalCacheRead: 0,
            totalCacheWrite: 0,
            totalOutput: 0,
            recordedCost: 0,
          };
        }
        const data = dates[dateKey];
        data.count++;
        data.totalRawInput += Number(obj.usage.inputTokens || 0);
        data.totalCacheRead += Number(obj.usage.cacheReadTokens || 0);
        data.totalCacheWrite += Number(obj.usage.cacheWriteTokens || 0);
        data.totalOutput += Number(obj.usage.outputTokens || 0);
        if (obj.usage.costUsd) data.recordedCost += Number(obj.usage.costUsd);
        data.models[obj.model] = (data.models[obj.model] || 0) + 1;
      } catch (e) {}
    }
  }
}

console.log(JSON.stringify(dates, null, 2));
