export type UsageAnchor = Readonly<{
  kind: 'native/2' | 'point/2' | 'response/1' | 'message/1' | 'log-position/1' | 'usage-row/1';
  value: string;
}>;

export type IdentityEvidence = Readonly<{
  actor: string;
  reference: string;
}>;

export type IdentityResolution =
  | { status: 'resolved'; eventId: string }
  | { status: 'conflict'; eventIds: string[] };
