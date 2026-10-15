import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const home = os.homedir();
const projectsRoot = path.join(home, '.commandcode', 'projects');

let otherEvents = 0;
for (const p of fs.readdirSync(projectsRoot)) {
  const pPath = path.join(projectsRoot, p);
  if (!fs.statSync(pPath).isDirectory()) continue;
  for (const f of fs.readdirSync(pPath)) {
    if (!f.endsWith('.jsonl') || f.endsWith('.checkpoints.jsonl')) continue;
    const content = fs.readFileSync(path.join(pPath, f), 'utf8');
    for (const l of content.split('\n')) {
      if (!l.includes('"usage"')) continue;
      try {
        const obj = JSON.parse(l);
        const rawTs = obj.timestamp ?? obj.message?.meta?.createdAt;
        if (!rawTs) continue;
        const d = new Date(typeof rawTs === 'number' ? rawTs : Date.parse(rawTs));
        const dt = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (['2026-10-13', '2026-10-14', '2026-10-15'].includes(dt)) {
          if (p !== 'd-desktop-code-code-incept') {
            console.log('Found event in other project:', p, f, obj.model, obj.usage);
            otherEvents++;
          }
        }
      } catch (e) {}
    }
  }
}
console.log('Total events in other projects on 10/13-10/15:', otherEvents);
