import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

function printUsage() {
  console.log('Usage: pnpm auth:revoke-owner-sessions --dry-run | --confirm');
}

function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
    confirm: argv.includes('--confirm'),
  };
}

function printSessions(sessions) {
  console.log('');
  console.log(`Owner sessions to revoke: ${sessions.length}`);

  for (const session of sessions) {
    console.log(`- Session ID: ${session.id}`);
    console.log(`  Created: ${session.createdAt.toISOString()}`);
    console.log(`  Expires: ${session.expiresAt?.toISOString() ?? 'none'}`);
    console.log(`  Last used: ${session.lastUsedAt?.toISOString() ?? 'never'}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.dryRun === args.confirm) {
    printUsage();
    throw new Error('Use exactly one of --dry-run or --confirm.');
  }

  const accessModule = await import(
    pathToFileURL(path.join(projectRoot, 'packages/db/src/access/index.ts')).href,
  );
  const sessions = await accessModule.listRevocableOwnerAccessSessions();

  printSessions(sessions);

  if (args.dryRun) {
    console.log('');
    console.log('Dry run: no sessions were revoked.');
    return;
  }

  const result = await accessModule.revokeAllOwnerAccessSessions();

  console.log('');
  console.log(`Owner sessions revoked: ${result.count}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
