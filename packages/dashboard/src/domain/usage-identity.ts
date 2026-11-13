export const usageAnchorKinds = ['native/2', 'point/2', 'response/1', 'message/1', 'log-position/1', 'usage-row/1'] as const;

export type UsageAnchor = Readonly<{
  kind: typeof usageAnchorKinds[number];
  value: string;
}>;

export type IdentityEvidence = Readonly<{
  actor: string;
  reference: string;
}>;

export type IdentityResolution =
  | { status: 'resolved'; eventId: string }
  | { status: 'unresolved-anchor'; anchor: UsageAnchor }
  | { status: 'conflict'; eventIds: string[] };
