import 'server-only';

import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

export function hashAccessCredential(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function createAccessSessionToken() {
  return randomBytes(32).toString('base64url');
}

// 恒定时间比较 / 防止计时攻击
export function isConstantTimeMatch(left: string, right: string) {
  const leftHash = Buffer.from(hashAccessCredential(left), 'hex');
  const rightHash = Buffer.from(hashAccessCredential(right), 'hex');

  return timingSafeEqual(leftHash, rightHash);
}
