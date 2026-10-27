import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
for (const file of ['apps/web/.env.local', 'packages/db/.env']) {
  try { process.loadEnvFile(path.join(root, file)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const args = process.argv.slice(2), command = args[0];
const option = key => { const index = args.indexOf(key); return index < 0 ? undefined : args[index + 1]; };

// Passwords are accepted through a controlled file, stdin, or a non-echoing TTY, never an argument.
async function passwordInput() {
  const file = option('--password-file');
  if (file) return (await fs.readFile(path.resolve(root, file), 'utf8')).replace(/\r?\n$/, '');
  if (!process.stdin.isTTY) {
    let text = '';
    for await (const chunk of process.stdin) { text += chunk.toString('utf8'); if (Buffer.byteLength(text) > 4096) throw new Error('Input too large.'); }
    return text.replace(/\r?\n$/, '');
  }
  process.stderr.write('New Owner password (8+ characters, hidden): ');
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (error) => {
      process.stdin.off('data', read); process.stdin.setRawMode(false); process.stdin.pause(); process.stderr.write('\n');
      if (error) reject(error); else resolve(value);
    };
    const read = chunk => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003') { finish(new Error('Cancelled.')); return; }
        if (character === '\r' || character === '\n') { finish(); return; }
        if (character === '\u007f' || character === '\b') value = Array.from(value).slice(0, -1).join('');
        else value += character;
        if (Buffer.byteLength(value) > 1024) { finish(new Error('Password too long.')); return; }
      }
    };
    process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.on('data', read);
  });
}

async function main() {
  if (args.includes('--password') || args.includes('--secret')) throw new Error('Password arguments are not accepted.');
  const outputArgument = option('--output');
  const output = outputArgument ? path.resolve(root, outputArgument) : undefined;
  if (output) {
    try { await fs.access(output); throw new Error('Output file already exists.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const owner = await import('../packages/db/src/owner/index.ts');
  const { prisma } = await import('../packages/db/src/client.ts');
  try {
    let result;
    if (command === 'init' || command === 'reset') {
      if (command === 'reset' && !args.includes('--confirm')) throw new Error('Reset requires --confirm.');
      result = await owner.initializeOwner(option('--username') ?? 'owner', await passwordInput(), command === 'reset');
    } else if (command === 'setup-code') result = await owner.refreshSetupPermit();
    else if (command === 'approve') result = await owner.issueLoginApproval(option('--challenge') ?? '');
    else if (command === 'status') {
      const account = await prisma.ownerAccount.findUnique({ where: { id: 'owner' }, select: { username: true, totpCiphertext: true } });
      result = { initialized: !!account, username: account?.username, totpConfigured: !!account?.totpCiphertext };
    } else if (command === 'dev-session') {
      if (!args.includes('--confirm')) throw new Error('dev-session requires --confirm.');
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) throw new Error('DATABASE_URL is required.');
      const host = new URL(databaseUrl).hostname;
      if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error('dev-session is local-only.');
      const days = Number(option('--days') ?? 30);
      if (!Number.isInteger(days) || days < 1 || days > 90) throw new Error('--days must be 1-90.');
      const security = await import('../packages/db/src/owner/security.ts');
      let account = await prisma.ownerAccount.findUnique({ where: { id: 'owner' } });
      if (!account) {
        account = await prisma.ownerAccount.create({ data: { id: 'owner', username: 'owner',
          passwordHash: await security.hashPassword(security.randomCredential()),
          totpCiphertext: security.encryptTotp(security.createTotpSecret()) } });
      } else if (!account.totpCiphertext) {
        account = await prisma.ownerAccount.update({ where: { id: 'owner' }, data: {
          totpCiphertext: security.encryptTotp(security.createTotpSecret()), totpLastStep: -1 } });
      }
      const now = new Date();
      const expiresAt = new Date(now.getTime() + days * 86400000);
      const token = security.randomCredential();
      const session = await prisma.accessSession.create({ data: { role: 'owner', tokenHash: security.hashCredential(token),
        ownerAccountId: account.id, credentialVersion: account.credentialVersion, authenticatedAt: expiresAt,
        lastUsedAt: now, expiresAt, deviceLabel: 'local dev session' } });
      await owner.writeSecurityAudit('owner.dev-session', 'success', account.id, session.id);
      result = { username: account.username, cookieName: 'incept-access-session', cookieValue: token,
        cookie: `incept-access-session=${token}`, expiresAt: expiresAt.toISOString(), sessionId: session.id };
    } else throw new Error('Usage: pnpm auth:owner init|reset|setup-code|approve|status|dev-session --confirm [--days N] [--username NAME] [--password-file PATH] [--challenge ID] [--output PATH]');
    if (output) { await fs.writeFile(output, JSON.stringify(result, null, 2) + '\n', { mode: 0o600, flag: 'wx' }); console.log('Owner operation completed; one-time material saved to the specified file.'); }
    else console.log(JSON.stringify(result, null, 2));
  } finally { await prisma.$disconnect(); }
}

main().catch(error => {
  console.error(error.code ?? (error.message?.startsWith('Usage:') ? error.message : 'Owner command failed. Check the action, configuration, or password policy.'));
  process.exitCode = 1;
});
