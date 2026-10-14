export type OwnerChallengeState = { stage: 'setup' | 'enroll' | 'totp' | 'approval'; challengeId?: string; expiresAt: string; secret?: string; username?: string };
export type ProGrantRecord = { id: string; label: string; mode: 'single' | 'shared' | null; codeHint: string | null; redeemExpiresAt: string | null;
  expiresAt: string | null; entitlementSeconds: number | null; maxRedemptions: number | null; redeemedCount: number; revokedAt: string | null };
export type OwnerManagementState = {
  username: string; sessionId: string; recentAuthUntil: string;
  sessions: Array<{ id: string; deviceLabel: string | null; createdAt: string; lastUsedAt: string | null; expiresAt: string | null }>;
  devices: Array<{ id: string; label: string; expiresAt: string }>;
  challenges: Array<{ id: string; deviceLabel: string; expiresAt: string }>;
  permits: Array<{ id: string; challengeId: string | null; codeHint: string; expiresAt: string }>;
  grants: ProGrantRecord[];
  audits: Array<{ id: string; action: string; result: string; targetId: string | null; createdAt: string }>;
};
export type OwnerAccountState = { role: 'guest' | 'pro' | 'owner'; configured: boolean; challenge: OwnerChallengeState | null; management?: OwnerManagementState };
