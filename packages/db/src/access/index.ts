import {
  AccessGrantType,
  AccessPrincipalType,
  AccessSessionRole,
} from '../../generated/client/index.js';
import { prisma } from '../client';
import { redeemTemporaryProGrant, writeSecurityAudit } from '../owner';
import { OWNER_TTL_MS } from '../owner/security';

export const OWNER_SESSION_TTL_MS = OWNER_TTL_MS;

type AccessNowOptions = {
  now?: Date;
};

type ActivePeriod = {
  expiresAt: Date | null;
  revokedAt: Date | null;
};

function isExpired(expiresAt: Date | null, now: Date) {
  return Boolean(expiresAt && expiresAt <= now);
}

function isActive(period: ActivePeriod, now: Date) {
  return !period.revokedAt && !isExpired(period.expiresAt, now);
}

function toExpiryDate(now: Date, ttlMs: number) {
  return new Date(now.getTime() + ttlMs);
}

function assertFutureExpiry(expiresAt: Date | undefined, label: string) {
  if (expiresAt && expiresAt <= new Date()) {
    throw new Error(`${label} expiry must be in the future.`);
  }
}

function isValidInvitationGrant(
  grant: {
    type: AccessGrantType;
    principalId: string | null;
    principal: { type: AccessPrincipalType } | null;
  },
) {
  return (
    grant.type === AccessGrantType.invitation &&
    grant.principalId !== null &&
    grant.principal?.type === AccessPrincipalType.invited
  );
}

function isValidSharedGrant(grant: {
  type: AccessGrantType;
  principalId: string | null;
}) {
  return (
    grant.type === AccessGrantType.sharedCode && grant.principalId === null
  );
}

export async function createIndividualInvitation({
  label,
  credentialHash,
  grantExpiresAt,
  principalExpiresAt,
}: {
  label: string;
  credentialHash: string;
  grantExpiresAt?: Date;
  principalExpiresAt?: Date;
}) {
  assertFutureExpiry(grantExpiresAt, 'Access grant');
  assertFutureExpiry(principalExpiresAt, 'Access principal');

  return prisma.$transaction(async (tx) => {
    const principal = await tx.accessPrincipal.create({
      data: {
        type: AccessPrincipalType.invited,
        label,
        expiresAt: principalExpiresAt,
      },
    });

    const grant = await tx.accessGrant.create({
      data: {
        type: AccessGrantType.invitation,
        label,
        credentialHash,
        principalId: principal.id,
        expiresAt: grantExpiresAt,
      },
    });

    return { principal, grant };
  });
}

export async function createSharedAccessGrant({
  label,
  credentialHash,
  expiresAt,
}: {
  label: string;
  credentialHash: string;
  expiresAt?: Date;
}) {
  assertFutureExpiry(expiresAt, 'Access grant');

  return prisma.accessGrant.create({
    data: {
      type: AccessGrantType.sharedCode,
      label,
      credentialHash,
      expiresAt,
    },
  });
}

export async function findActiveAccessGrantByCredentialHash(
  credentialHash: string,
  { now = new Date() }: AccessNowOptions = {},
) {
  const grant = await prisma.accessGrant.findUnique({
    where: { credentialHash },
    include: { principal: true },
  });

  if (!grant || !isActive(grant, now)) {
    return null;
  }

  if (grant.type === AccessGrantType.invitation) {
    return (
      isValidInvitationGrant(grant) &&
      grant.principal !== null &&
      isActive(grant.principal, now)
    )
      ? grant
      : null;
  }

  return isValidSharedGrant(grant) ? grant : null;
}

export async function revokeAccessGrant(
  grantId: string,
  { now = new Date() }: AccessNowOptions = {},
) {
  return prisma.$transaction(async (tx) => {
    const grant = await tx.accessGrant.update({
      where: { id: grantId },
      data: { revokedAt: now },
    });

    await tx.accessSession.updateMany({
      where: {
        grantId,
        revokedAt: null,
      },
      data: { revokedAt: now },
    });

    return grant;
  });
}

export async function revokeAccessPrincipal(
  principalId: string,
  { now = new Date() }: AccessNowOptions = {},
) {
  return prisma.$transaction(async (tx) => {
    const principal = await tx.accessPrincipal.update({
      where: { id: principalId },
      data: { revokedAt: now },
    });

    await tx.accessSession.updateMany({
      where: {
        principalId,
        revokedAt: null,
      },
      data: { revokedAt: now },
    });

    await tx.accessGrant.updateMany({
      where: {
        principalId,
        revokedAt: null,
      },
      data: { revokedAt: now },
    });

    return principal;
  });
}

export async function createOwnerAccessSession({
  tokenHash,
  expiresAt,
  now = new Date(),
}: {
  tokenHash: string;
  expiresAt?: Date;
  now?: Date;
}) {
  const sessionExpiry = expiresAt ?? toExpiryDate(now, OWNER_SESSION_TTL_MS);
  assertFutureExpiry(sessionExpiry, 'Owner session');

  return prisma.accessSession.create({
    data: {
      role: AccessSessionRole.owner,
      tokenHash,
      expiresAt: sessionExpiry,
    },
  });
}

export async function redeemIndividualInvitation({
  credentialHash,
  tokenHash,
  now = new Date(),
}: {
  credentialHash: string;
  tokenHash: string;
  now?: Date;
}) {
  const grant = await findActiveAccessGrantByCredentialHash(credentialHash, {
    now,
  });

  if (!grant || !isValidInvitationGrant(grant) || !grant.principalId) {
    return null;
  }

  return prisma.accessSession.create({
    data: {
      role: AccessSessionRole.pro,
      tokenHash,
      principalId: grant.principalId,
      grantId: grant.id,
    },
  });
}

export async function redeemSharedAccessGrant({
  credentialHash,
  tokenHash,
  principalLabel = 'Anonymous shared access',
  deviceHash = tokenHash,
  now = new Date(),
}: {
  credentialHash: string;
  tokenHash: string;
  principalLabel?: string;
  deviceHash?: string;
  now?: Date;
}) {
  const grant = await findActiveAccessGrantByCredentialHash(credentialHash, {
    now,
  });

  if (!grant || !isValidSharedGrant(grant)) {
    return null;
  }

  if (grant.mode) return redeemTemporaryProGrant(credentialHash, tokenHash, deviceHash, now);

  return prisma.$transaction(async (tx) => {
    const principal = await tx.accessPrincipal.create({
      data: {
        type: AccessPrincipalType.anonymous,
        label: principalLabel,
      },
    });

    const session = await tx.accessSession.create({
      data: {
        role: AccessSessionRole.pro,
        tokenHash,
        principalId: principal.id,
        grantId: grant.id,
      },
    });

    return { principal, session };
  });
}

export async function findActiveAccessSessionByTokenHash(
  tokenHash: string,
  { now = new Date() }: AccessNowOptions = {},
) {
  const session = await prisma.accessSession.findUnique({
    where: { tokenHash },
    include: {
      grant: {
        include: { principal: true },
      },
      principal: true,
      ownerAccount: { select: { credentialVersion: true, totpCiphertext: true } },
    },
  });

  if (!session || !isActive(session, now)) {
    return null;
  }

  if (session.role === AccessSessionRole.owner) {
    if (session.grantId || session.principalId || !session.ownerAccount?.totpCiphertext
      || session.credentialVersion !== session.ownerAccount.credentialVersion || !session.expiresAt) return null;
    const touched = await prisma.accessSession.updateMany({ where: { id: session.id, revokedAt: null,
      credentialVersion: session.credentialVersion, expiresAt: { gt: now } }, data: { lastUsedAt: now } });
    return touched.count ? session : null;
  }

  if (
    session.role !== AccessSessionRole.pro ||
    !session.grant ||
    !session.principal ||
    !isActive(session.grant, now) ||
    !isActive(session.principal, now)
  ) {
    return null;
  }

  if (session.grant.type === AccessGrantType.invitation) {
    return isValidInvitationGrant(session.grant) &&
      session.grant.principalId === session.principal.id
      ? session
      : null;
  }

  return isValidSharedGrant(session.grant) &&
    session.principal.type === AccessPrincipalType.anonymous
    ? session
    : null;
}

export async function touchAccessSession(
  sessionId: string,
  { now = new Date() }: AccessNowOptions = {},
) {
  return prisma.accessSession.updateMany({
    where: {
      id: sessionId,
      revokedAt: null,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: now } },
      ],
    },
    data: { lastUsedAt: now },
  });
}

export async function renewAccessSession({
  sessionId,
  expiresAt,
  now = new Date(),
}: {
  sessionId: string;
  expiresAt: Date;
  now?: Date;
}) {
  assertFutureExpiry(expiresAt, 'Access session');

  const session = await prisma.accessSession.findUnique({
    where: { id: sessionId },
  });

  if (
    !session ||
    session.role !== AccessSessionRole.owner ||
    !isActive(session, now) ||
    session.grantId ||
    session.principalId
  ) {
    return null;
  }

  return prisma.accessSession.update({
    where: { id: sessionId },
    data: { expiresAt, lastUsedAt: now },
  });
}

export async function revokeAccessSession(
  sessionId: string,
  { now = new Date() }: AccessNowOptions = {},
) {
  return prisma.accessSession.update({
    where: { id: sessionId },
    data: { revokedAt: now },
  });
}

export async function listRevocableOwnerAccessSessions() {
  return prisma.accessSession.findMany({
    where: {
      role: AccessSessionRole.owner,
      revokedAt: null,
    },
    select: {
      id: true,
      createdAt: true,
      expiresAt: true,
      lastUsedAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });
}

export async function revokeAllOwnerAccessSessions(
  { now = new Date() }: AccessNowOptions = {},
) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM owner_accounts WHERE id = 'owner' FOR UPDATE`;
    await tx.ownerDevice.updateMany({ where: { revokedAt: null }, data: { revokedAt: now } });
    await tx.ownerChallenge.updateMany({ where: { consumedAt: null }, data: { consumedAt: now, pendingTotpCiphertext: null } });
    await tx.ownerPermit.updateMany({ where: { revokedAt: null }, data: { revokedAt: now } });
    const result = await tx.accessSession.updateMany({
    where: {
      role: AccessSessionRole.owner,
      revokedAt: null,
    },
    data: { revokedAt: now },
    });
    await writeSecurityAudit('owner.sessions.revoke-cli', 'success', undefined, undefined, tx);
    return result;
  });
}

export async function listAccessGrants({
  includeRevoked = false,
}: {
  includeRevoked?: boolean;
} = {}) {
  return prisma.accessGrant.findMany({
    where: includeRevoked ? undefined : { revokedAt: null },
    select: {
      id: true,
      type: true,
      label: true,
      principalId: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
      updatedAt: true,
      principal: {
        select: {
          label: true,
          revokedAt: true,
        },
      },
      _count: {
        select: {
          sessions: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function findAccessGrantForManagement(grantId: string) {
  return prisma.accessGrant.findUnique({
    where: { id: grantId },
    select: {
      id: true,
      type: true,
      label: true,
      expiresAt: true,
      revokedAt: true,
    },
  });
}

export async function rotateSharedAccessGrant({
  grantId,
  credentialHash,
  label,
  expiresAt,
  now = new Date(),
}: {
  grantId: string;
  credentialHash: string;
  label?: string;
  expiresAt?: Date;
  now?: Date;
}) {
  assertFutureExpiry(expiresAt, 'Access grant');

  return prisma.$transaction(async (tx) => {
    const existingGrant = await tx.accessGrant.findUnique({
      where: { id: grantId },
      select: {
        id: true,
        type: true,
        label: true,
        expiresAt: true,
        revokedAt: true,
        mode: true,
      },
    });

    if (!existingGrant || existingGrant.type !== AccessGrantType.sharedCode) {
      throw new Error('Only an existing shared-code grant can be rotated.');
    }

    if (existingGrant.mode) {
      throw new Error('Temporary Pro grants must be revoked and recreated through Owner settings.');
    }

    if (existingGrant.revokedAt) {
      throw new Error('A revoked shared-code grant cannot be rotated.');
    }

    const nextExpiry = expiresAt ?? existingGrant.expiresAt ?? undefined;
    assertFutureExpiry(nextExpiry, 'Access grant');

    await tx.accessGrant.update({
      where: { id: grantId },
      data: { revokedAt: now },
    });

    await tx.accessSession.updateMany({
      where: {
        grantId,
        revokedAt: null,
      },
      data: { revokedAt: now },
    });

    return tx.accessGrant.create({
      data: {
        type: AccessGrantType.sharedCode,
        label: label ?? existingGrant.label,
        credentialHash,
        expiresAt: nextExpiry,
      },
    });
  });
}
