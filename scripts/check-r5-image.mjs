import {readFileSync} from 'node:fs';
import {verifyR5ImageIdentity} from '../apps/sync-agent/dist/library.mjs';
try {
  const result = verifyR5ImageIdentity(JSON.parse(readFileSync(process.argv[2], 'utf8')));
  console.log(JSON.stringify(result));
  if (!result.passed) process.exitCode = 2;
} catch {
  console.error(JSON.stringify({passed: false, errors: ['IMAGE_EVIDENCE_READ_FAILED']}));
  process.exitCode = 1;
}
