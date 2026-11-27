import 'server-only';

export const DEV_GUEST_OVERRIDE_COOKIE_NAME = 'incept-dev-guest';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function isLocalLoopbackDatabaseUrl(databaseUrl: string | undefined): boolean {
  if (!databaseUrl) {
    return false;
  }
  try {
    const parsed = new URL(databaseUrl);
    return LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Local-only development Owner session injection.
 * Strictly disabled unless ALL four guards pass:
 * 1. NODE_ENV === 'development' (never active in production builds or tests)
 * 2. INCEPT_DEV_AUTO_OWNER === '1' (explicit opt-in in untracked .env.local)
 * 3. DATABASE_URL points strictly to a local loopback host
 * 4. INCEPT_DEV_OWNER_SESSION_TOKEN is a non-trivial high-entropy token
 */
export function readDevAutoOwnerToken(
  env: Record<string, string | undefined> = process.env,
): string | null {
  if (env.NODE_ENV !== 'development') {
    return null;
  }
  if (env.INCEPT_DEV_AUTO_OWNER !== '1') {
    return null;
  }
  if (!isLocalLoopbackDatabaseUrl(env.DATABASE_URL)) {
    return null;
  }
  const token = env.INCEPT_DEV_OWNER_SESSION_TOKEN?.trim();
  if (!token || token.length < 32) {
    return null;
  }
  return token;
}
