import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const checkModule = await import(
  pathToFileURL(path.join(projectRoot, 'apps/web/src/server/activity/github-check.ts')).href,
);

await checkModule.runGitHubActivityChecks();
console.log('GitHub activity checks passed.');
