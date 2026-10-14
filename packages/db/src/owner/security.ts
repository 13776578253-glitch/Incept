import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export const OWNER_TTL_MS = 12 * 60 * 60 * 1000;
export const OWNER_IDLE_MS = 30 * 60 * 1000;
export const RECENT_AUTH_MS = 5 * 60 * 1000;
export const DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const APPROVAL_TTL_MS = 10 * 60 * 1000;

export const hashCredential = (value: string) => createHash('sha256').update(value).digest('hex');
export const randomCredential = (prefix = '') => prefix + randomBytes(32).toString('base64url');

function derivePassword(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 32,
    { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
    (error, result) => error ? reject(error) : resolve(result)));
}

export function validatePassword(password: string) {
  if (Array.from(password).length < 12 || Buffer.byteLength(password) > 1024) {
    throw new Error('Password must contain at least 12 characters and at most 1024 bytes.');
  }
}

// The parameters are stored explicitly so a future upgrade can migrate hashes at sign-in.
export async function hashPassword(password: string) {
  validatePassword(password);
  const salt = randomBytes(16).toString('hex');
  return `scrypt:32768:8:3:${salt}:${(await derivePassword(password, salt)).toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string) {
  if (Buffer.byteLength(password) > 1024) return false;
  const parts = encoded.split(':');
  if (parts.length !== 6 || parts.slice(0, 4).join(':') !== 'scrypt:32768:8:3') return false;
  const expected = Buffer.from(parts[5], 'hex');
  const actual = await derivePassword(password, parts[4]);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function authEncryptionKey() {
  const value = process.env.INCEPT_AUTH_ENCRYPTION_KEY ?? '';
  if (!/^[a-f\d]{64}$/i.test(value)) throw new Error('Configure INCEPT_AUTH_ENCRYPTION_KEY as 32 random bytes in hexadecimal.');
  return Buffer.from(value, 'hex');
}

export function encryptTotp(secret: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', authEncryptionKey(), nonce);
  cipher.setAAD(Buffer.from('incept-owner-totp-v1'));
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return ['v1', nonce.toString('hex'), cipher.getAuthTag().toString('hex'), encrypted.toString('hex')].join(':');
}

export function decryptTotp(value: string) {
  const [version, nonce, tag, encrypted] = value.split(':');
  if (version !== 'v1') throw new Error('Unknown TOTP encryption format.');
  const cipher = createDecipheriv('aes-256-gcm', authEncryptionKey(), Buffer.from(nonce, 'hex'));
  cipher.setAAD(Buffer.from('incept-owner-totp-v1'));
  cipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([cipher.update(Buffer.from(encrypted, 'hex')), cipher.final()]).toString('utf8');
}

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function createTotpSecret() {
  let bits = 0, value = 0, output = '';
  for (const byte of randomBytes(20)) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { output += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  return output;
}

function decodeBase32(secret: string) {
  let bits = 0, value = 0;
  const bytes: number[] = [];
  for (const character of secret.toUpperCase().replace(/=+$/, '')) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new Error('Invalid TOTP secret.');
    value = (value << 5) | digit; bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(bytes);
}

// RFC 6238 with SHA-1, 30-second steps, six digits and a one-step clock tolerance.
export function totpAt(secret: string, step: number, digits = 6) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).padStart(digits, '0');
}

export function verifyTotp(secret: string, code: string, lastStep: number, now = new Date()) {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now.getTime() / 30000);
  for (const step of [current, current - 1, current + 1]) {
    if (step > lastStep && timingSafeEqual(Buffer.from(totpAt(secret, step)), Buffer.from(code))) return step;
  }
  return null;
}

export function networkFingerprint(address: string) {
  return createHmac('sha256', authEncryptionKey()).update(`network:${address}`).digest('hex');
}
