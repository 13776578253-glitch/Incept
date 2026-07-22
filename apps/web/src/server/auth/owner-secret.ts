import 'server-only';

import { isConstantTimeMatch } from './crypto';

const OWNER_ACCESS_SECRET_MIN_LENGTH = 32;

function getOwnerAccessSecret() {
  const secret = process.env.OWNER_ACCESS_SECRET;

  return secret && secret.length >= OWNER_ACCESS_SECRET_MIN_LENGTH
    ? secret
    : null;
}

export function isOwnerAccessConfigured() {
  return getOwnerAccessSecret() !== null;
}

export function verifyOwnerAccessSecret(candidate: string) {
  const secret = getOwnerAccessSecret();

  return Boolean(secret && isConstantTimeMatch(secret, candidate));
}
