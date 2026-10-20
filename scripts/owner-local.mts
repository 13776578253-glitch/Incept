import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const action = process.argv[2];

async function main() {
  // Secrets travel through stdin, never process arguments or command history.
  const input = JSON.parse(readFileSync(0, 'utf8')) as { password?: string; confirm?: boolean };
  if (!['prepare', 'refresh', 'check'].includes(action) || input.confirm !== true || (['prepare', 'check'].includes(action) && !input.password)) {
    throw new Error('Explicit local operation required');
  }
  for (const file of ['apps/web/.env.local', 'packages/db/.env']) {
    try { process.loadEnvFile(path.join(root, file)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/incept') {
    throw new Error('Only the local incept database is allowed');
  }
  const { prisma } = await import('../packages/db/src/client');
  try {
    const database = await prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
    if (database[0]?.name !== 'incept') throw new Error('Unexpected database');
    const account = await prisma.ownerAccount.findUnique({ where: { id: 'owner' }, select: { username: true, passwordHash: true, totpCiphertext: true } });
    if (action === 'check') {
      const { verifyPassword } = await import('../packages/db/src/owner/security');
      const passwordMatches = !!account && await verifyPassword(input.password!, account.passwordHash);
      const activeSessions = await prisma.accessSession.count({ where: { role: 'owner', revokedAt: null, expiresAt: { gt: new Date() } } });
      const trustedDevices = await prisma.ownerDevice.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } });
      console.log(JSON.stringify({ initialized: !!account, username: account?.username, passwordMatches,
        totpConfigured: !!account?.totpCiphertext, activeSessions, trustedDevices }));
      return;
    }
    const { initializeOwner, refreshSetupPermit } = await import('../packages/db/src/owner/index');
    const result = action === 'refresh' ? await refreshSetupPermit()
      : await initializeOwner(account?.username ?? 'owner', input.password!, !!account);
    console.log(JSON.stringify({ ...result, username: account?.username ?? 'owner' }));
  } finally { await prisma.$disconnect(); }
}

main().catch(() => { console.error('Owner local operation failed; no secret details are printed.'); process.exitCode = 1; });
