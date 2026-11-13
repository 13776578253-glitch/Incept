import { DatabaseSync } from 'node:sqlite';
import { readFileSync, realpathSync } from 'node:fs';
import { UsageIdentityIndex } from '../adapters/local/usage-identity-index';
import { usageAnchorKinds, type UsageAnchor } from '../domain/usage-identity';
import { hash } from '../adapters/local/imports/identity';

type Decision = {
  origin: string;
  anchor: UsageAnchor;
  members: { scope: string; position: number; observation: string; replacement: UsageAnchor }[];
};

/** Replace a quarantined anchor with one evidenced, distinct anchor per member. */
export function resolveIdentityConflict(path: string, decisionPath: string, actor: string, evidence: string) {
  const decision = JSON.parse(readFileSync(decisionPath, 'utf8')) as Decision;
  const nonblank = (value: unknown) => typeof value === 'string' && !!value.trim();
  const validAnchor = (value: UsageAnchor | undefined) =>
    value && nonblank(value.value) && usageAnchorKinds.includes(value.kind);
  if (!nonblank(decision?.origin) || !validAnchor(decision.anchor)
    || !Array.isArray(decision.members) || decision.members.some(member => !nonblank(member?.scope)
      || !Number.isSafeInteger(member.position) || member.position < 0 || !nonblank(member.observation)
      || !validAnchor(member.replacement))
    || !actor.trim() || !evidence.trim()) throw Error('INVALID_IDENTITY_CONFLICT_DECISION');
  const { origin, anchor } = decision;
  const members = [...decision.members].sort((a, b) => a.scope.localeCompare(b.scope, 'en') || a.position - b.position)
    .map(({ scope, position, observation, replacement }) =>
      ({ scope, position, observation, replacement: { kind: replacement.kind, value: replacement.value } }));
  const resolution = hash(['usage-conflict-resolution/1', origin, anchor.kind, anchor.value, members]);
  const db = new DatabaseSync(realpathSync(path));
  try {
    db.exec('PRAGMA busy_timeout=5000; BEGIN IMMEDIATE');
    try {
      const progress = db.prepare('SELECT scan_complete FROM usage_identity_backfill_v2 WHERE id=1').get();
      if (!progress?.scan_complete || db.prepare("SELECT 1 FROM usage_ledger_identity_disposition WHERE disposition='pending' LIMIT 1").get()) {
        throw Error('IDENTITY_BACKFILL_INCOMPLETE');
      }
      db.exec(`CREATE TABLE IF NOT EXISTS usage_conflict_resolutions (
        id TEXT PRIMARY KEY, origin TEXT NOT NULL, old_kind TEXT NOT NULL, old_value TEXT NOT NULL,
        decision_json TEXT NOT NULL, actor TEXT NOT NULL, evidence TEXT NOT NULL, resolved_at INTEGER NOT NULL
      );`);
      if (db.prepare('SELECT 1 FROM usage_conflict_resolutions WHERE id=?').get(resolution)) {
        db.exec('COMMIT');
        return { ok: true, resolution, members: members.length, reused: true };
      }
      const collision = db.prepare('SELECT members FROM usage_identity_conflicts WHERE origin=? AND kind=? AND value=?')
        .get(origin, anchor.kind, anchor.value);
      const find = db.prepare(`SELECT observation FROM usage_ledger_identity
        WHERE scope=? AND position=? AND origin=? AND anchor_kind=? AND anchor_value=?`);
      if (!collision || Number(collision.members) !== members.length || members.length < 2
        || new Set(members.map(member => JSON.stringify([member.scope, member.position]))).size !== members.length
        || new Set(members.map(member => JSON.stringify(member.replacement))).size !== members.length
        || members.some(member => find.get(member.scope, member.position, origin, anchor.kind, anchor.value)?.observation !== member.observation)) {
        throw Error('IDENTITY_CONFLICT_MEMBERS_CHANGED');
      }
      const index = new UsageIdentityIndex(db);
      const update = db.prepare('UPDATE usage_ledger_identity SET anchor_kind=?,anchor_value=? WHERE scope=? AND position=?');
      for (const member of members) {
        if (index.lookup(origin, member.replacement)) throw Error('IDENTITY_REPLACEMENT_ALREADY_BOUND');
        const binding = index.resolve(origin, [member.replacement], { actor, reference: resolution });
        if (binding.status !== 'resolved') throw Error('IDENTITY_REPLACEMENT_CONFLICT');
        update.run(member.replacement.kind, member.replacement.value, member.scope, member.position);
      }
      // Keep the old anchor quarantined so later observations cannot reuse it.
      db.prepare('INSERT INTO usage_conflict_resolutions VALUES (?,?,?,?,?,?,?,?)')
        .run(resolution, origin, anchor.kind, anchor.value, JSON.stringify(members), actor, evidence, Date.now());
      db.exec('COMMIT');
      return { ok: true, resolution, members: members.length, reused: false };
    } catch (error) {
      if (db.isTransaction) db.exec('ROLLBACK');
      throw error;
    }
  } finally { db.close(); }
}
