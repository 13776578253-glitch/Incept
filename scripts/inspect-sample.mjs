import fs from 'node:fs';

const filePath = 'C:/Users/86139/.commandcode/projects/d-desktop-code-code-incept/18dd702b-0f6d-4b45-b614-152cdbcaa579.jsonl';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');
let count = 0;
for (const l of lines) {
  if (l.includes('"usage"')) {
    const obj = JSON.parse(l);
    console.log(JSON.stringify({
      id: obj.id,
      timestamp: obj.timestamp,
      model: obj.model,
      usage: obj.usage
    }, null, 2));
    count++;
    if (count >= 5) break;
  }
}
