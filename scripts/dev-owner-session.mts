import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webEnvLocalPath = path.join(root, 'apps', 'web', '.env.local');
const dbEnvPath = path.join(root, 'packages', 'db', '.env');
const DEV_SESSION_TTL_DAYS = 180;
const DEV_DEVICE_LABEL = 'local-dev-reusable';

function loadEnvIfPresent(filePath: string) {
  try {
    process.loadEnvFile(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

function upsertEnvVars(filePath: string, updates: Record<string, string>) {
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const eol = existing.includes('\r\n') ? '\r\n' : '\n';
  const lines = existing ? existing.split(/\r?\n/) : [];
  const remaining = new Map(Object.entries(updates));
  const nextLines = lines.map((line) => {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line);
    if (!match) return line;
    const key = match[1];
    if (!remaining.has(key)) return line;
    const value = remaining.get(key)!;
    remaining.delete(key);
    return `${key}=${value}`;
  });
  while (nextLines.length > 0 && nextLines[nextLines.length - 1] === '') {
    nextLines.pop();
  }
  for (const [key, value] of remaining.entries()) {
    nextLines.push(`${key}=${value}`);
  }
  fs.writeFileSync(filePath, `${nextLines.join(eol)}${eol}`, { encoding: 'utf8', mode: 0o600 });
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

async function main() {
  loadEnvIfPresent(webEnvLocalPath);
  loadEnvIfPresent(dbEnvPath);

  const dbUrl = new URL(process.env.DATABASE_URL ?? '');
  if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(dbUrl.hostname.toLowerCase())) {
    throw new Error('REFUSED_NON_LOCAL_DATABASE');
  }

  const envUpdates: Record<string, string> = {};
  if (!process.env.INCEPT_AUTH_ENCRYPTION_KEY || !/^[a-f\d]{64}$/i.test(process.env.INCEPT_AUTH_ENCRYPTION_KEY)) {
    const generatedKey = randomBytes(32).toString('hex');
    process.env.INCEPT_AUTH_ENCRYPTION_KEY = generatedKey;
    envUpdates.INCEPT_AUTH_ENCRYPTION_KEY = generatedKey;
  }

  const { prisma } = await import('../packages/db/src/client');
  const { createTotpSecret, encryptTotp, hashPassword } = await import('../packages/db/src/owner/security');

  try {
    const dbCheck = await prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
    const dbName = dbCheck[0]?.name ?? '';
    if (!dbName.toLowerCase().includes('incept')) {
      throw new Error(`UNEXPECTED_LOCAL_DATABASE:${dbName}`);
    }

    let owner = await prisma.ownerAccount.findUnique({
      where: { id: 'owner' },
      select: { id: true, username: true, credentialVersion: true, totpCiphertext: true },
    });

    if (!owner) {
      const passwordHash = await hashPassword(`local-dev-${randomBytes(12).toString('hex')}`);
      const totpCiphertext = encryptTotp(createTotpSecret());
      owner = await prisma.ownerAccount.create({
        data: {
          id: 'owner',
          username: 'owner',
          passwordHash,
          totpCiphertext,
          credentialVersion: 1,
        },
        select: { id: true, username: true, credentialVersion: true, totpCiphertext: true },
      });
    } else if (!owner.totpCiphertext) {
      const totpCiphertext = encryptTotp(createTotpSecret());
      owner = await prisma.ownerAccount.update({
        where: { id: 'owner' },
        data: { totpCiphertext },
        select: { id: true, username: true, credentialVersion: true, totpCiphertext: true },
      });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + DEV_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
    const existingToken = process.env.INCEPT_DEV_OWNER_SESSION_TOKEN?.trim();
    let tokenToUse = existingToken && existingToken.length >= 32 ? existingToken : null;
    let sessionId: string | null = null;
    let reused = false;

    if (tokenToUse) {
      const existingSession = await prisma.accessSession.findUnique({
        where: { tokenHash: hashToken(tokenToUse) },
        select: { id: true, role: true, revokedAt: true },
      });
      if (existingSession && existingSession.role === 'owner' && !existingSession.revokedAt) {
        await prisma.accessSession.update({
          where: { id: existingSession.id },
          data: {
            credentialVersion: owner.credentialVersion,
            authenticatedAt: now,
            lastUsedAt: now,
            expiresAt,
            deviceLabel: DEV_DEVICE_LABEL,
          },
        });
        sessionId = existingSession.id;
        reused = true;
      }
    }

    if (!sessionId) {
      tokenToUse = `idev_${randomBytes(32).toString('base64url')}`;
      const created = await prisma.accessSession.create({
        data: {
          role: 'owner',
          tokenHash: hashToken(tokenToUse),
          ownerAccountId: owner.id,
          credentialVersion: owner.credentialVersion,
          authenticatedAt: now,
          lastUsedAt: now,
          expiresAt,
          deviceLabel: DEV_DEVICE_LABEL,
        },
        select: { id: true },
      });
      sessionId = created.id;
    }

    envUpdates.INCEPT_DEV_AUTO_OWNER = '1';
    envUpdates.INCEPT_DEV_OWNER_SESSION_TOKEN = tokenToUse!;
    upsertEnvVars(webEnvLocalPath, envUpdates);

    console.log(
      JSON.stringify(
        {
          ok: true,
          database: dbName,
          ownerUsername: owner.username,
          sessionId,
          reused,
          expiresAt: expiresAt.toISOString(),
          envFile: 'apps/web/.env.local',
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : 'DEV_OWNER_SESSION_FAILED',
    }),
  );
  process.exitCode = 1;
});
