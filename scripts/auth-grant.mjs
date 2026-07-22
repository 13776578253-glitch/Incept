import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

function printUsage() {
  console.log('Usage:');
  console.log('  pnpm auth:grant create-invitation --label <label> --base-url <url> --locale <en|zh> [--expires-at <ISO>]');
  console.log('  pnpm auth:grant create-shared-code --label <label> [--expires-at <ISO>]');
  console.log('  pnpm auth:grant list [--include-revoked]');
  console.log('  pnpm auth:grant revoke --grant-id <id> --confirm');
  console.log('  pnpm auth:grant rotate-shared-code --grant-id <id> [--label <label>] [--expires-at <ISO>] --confirm');
}

function parseArgs(argv) {
  const [command = '', ...rest] = argv;
  const args = { command, confirm: false, includeRevoked: false };

  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];

    if (value === '--confirm') {
      args.confirm = true;
      continue;
    }

    if (value === '--include-revoked') {
      args.includeRevoked = true;
      continue;
    }

    if (value.startsWith('--')) {
      args[value.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = rest[index + 1] ?? '';
      index += 1;
    }
  }

  return args;
}

function hashCredential(value) {
  return createHash('sha256').update(value).digest('hex');
}

function createCredential(prefix) {
  return `${prefix}_${randomBytes(32).toString('base64url')}`;
}

function parseExpiry(value) {
  if (!value) {
    return undefined;
  }

  const expiry = new Date(value);

  if (Number.isNaN(expiry.getTime()) || expiry <= new Date()) {
    throw new Error('--expires-at must be a future ISO-8601 date.');
  }

  return expiry;
}

function parseBaseUrl(value) {
  if (!value) {
    throw new Error('--base-url is required for invitation links.');
  }

  const url = new URL(value);

  if (!['http:', 'https:'].includes(url.protocol) || url.search || url.hash || url.pathname !== '/') {
    throw new Error('--base-url must be an http(s) origin without a path, query, or hash.');
  }

  return url.origin;
}

function requireValue(args, key) {
  if (!args[key]) {
    throw new Error(`--${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} is required.`);
  }

  return args[key];
}

function printGrant(grant) {
  console.log(`- Grant ID: ${grant.id}`);
  console.log(`- Type: ${grant.type}`);
  console.log(`- Label: ${grant.label}`);
  console.log(`- Principal ID: ${grant.principalId ?? 'none'}`);
  console.log(`- Principal: ${grant.principal?.label ?? 'shared access'}`);
  console.log(`- Expires: ${grant.expiresAt?.toISOString() ?? 'never'}`);
  console.log(`- Revoked: ${grant.revokedAt?.toISOString() ?? 'no'}`);
  console.log(`- Sessions issued: ${grant._count.sessions}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const accessModule = await import(
    pathToFileURL(path.join(projectRoot, 'packages/db/src/access/index.ts')).href,
  );

  if (!args.command || args.command === 'help' || args.command === '--help') {
    printUsage();
    return;
  }

  if (args.command === 'create-invitation') {
    const label = requireValue(args, 'label');
    const locale = requireValue(args, 'locale');

    if (!['en', 'zh'].includes(locale)) {
      throw new Error('--locale must be en or zh.');
    }

    const baseUrl = parseBaseUrl(args.baseUrl);
    const credential = createCredential('invite');
    const result = await accessModule.createIndividualInvitation({
      label,
      credentialHash: hashCredential(credential),
      grantExpiresAt: parseExpiry(args.expiresAt),
    });

    console.log('');
    console.log('Invitation created');
    console.log(`- Principal ID: ${result.principal.id}`);
    console.log(`- Grant ID: ${result.grant.id}`);
    console.log(`- Label: ${result.grant.label}`);
    console.log(`- Invitation URL: ${baseUrl}/${locale}/settings/access/${credential}`);
    console.log('- Save this URL now. Its raw credential will not be shown again.');
    return;
  }

  if (args.command === 'create-shared-code') {
    const credential = createCredential('pro');
    const grant = await accessModule.createSharedAccessGrant({
      label: requireValue(args, 'label'),
      credentialHash: hashCredential(credential),
      expiresAt: parseExpiry(args.expiresAt),
    });

    console.log('');
    console.log('Shared access code created');
    console.log(`- Grant ID: ${grant.id}`);
    console.log(`- Label: ${grant.label}`);
    console.log(`- Access code: ${credential}`);
    console.log('- Save this code now. Its raw credential will not be shown again.');
    return;
  }

  if (args.command === 'list') {
    const grants = await accessModule.listAccessGrants({
      includeRevoked: args.includeRevoked,
    });

    console.log('');
    console.log(`Access grants: ${grants.length}`);
    for (const grant of grants) {
      printGrant(grant);
    }
    return;
  }

  if (args.command === 'revoke') {
    if (!args.confirm) {
      throw new Error('Revoking a grant requires --confirm.');
    }

    const grant = await accessModule.findAccessGrantForManagement(requireValue(args, 'grantId'));

    if (!grant) {
      throw new Error('Access grant was not found.');
    }

    await accessModule.revokeAccessGrant(grant.id);
    console.log(`Grant revoked: ${grant.id}`);
    return;
  }

  if (args.command === 'rotate-shared-code') {
    if (!args.confirm) {
      throw new Error('Rotating a shared code requires --confirm.');
    }

    const credential = createCredential('pro');
    const grant = await accessModule.rotateSharedAccessGrant({
      grantId: requireValue(args, 'grantId'),
      credentialHash: hashCredential(credential),
      label: args.label || undefined,
      expiresAt: parseExpiry(args.expiresAt),
    });

    console.log('');
    console.log('Shared access code rotated');
    console.log(`- New grant ID: ${grant.id}`);
    console.log(`- Label: ${grant.label}`);
    console.log(`- Access code: ${credential}`);
    console.log('- The previous shared grant and its sessions were revoked.');
    return;
  }

  printUsage();
  throw new Error(`Unknown command "${args.command}".`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
