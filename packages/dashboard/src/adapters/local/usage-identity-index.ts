import type { DatabaseSync } from 'node:sqlite';
import type { IdentityEvidence, IdentityResolution, UsageAnchor } from '../../domain/usage-identity';
import { hash } from './imports/identity';

export class UsageIdentityIndex {
  constructor(private readonly db: DatabaseSync) {}

  static initialize(db: DatabaseSync): UsageIdentityIndex {
    db.exec(`
      CREATE TABLE IF NOT EXISTS usage_events (
        origin TEXT NOT NULL, event_id TEXT NOT NULL, PRIMARY KEY (origin, event_id)
      );
      CREATE TABLE IF NOT EXISTS usage_event_anchors (
        origin TEXT NOT NULL, kind TEXT NOT NULL, value TEXT NOT NULL, event_id TEXT NOT NULL,
        PRIMARY KEY (origin, kind, value),
        FOREIGN KEY (origin, event_id) REFERENCES usage_events (origin, event_id)
      );
      CREATE TABLE IF NOT EXISTS usage_identity_conflicts (
        origin TEXT NOT NULL, kind TEXT NOT NULL, value TEXT NOT NULL, members INTEGER NOT NULL,
        PRIMARY KEY (origin, kind, value)
      );
      CREATE TABLE IF NOT EXISTS usage_identity_audit (
        id INTEGER PRIMARY KEY, origin TEXT NOT NULL, kind TEXT NOT NULL, value TEXT NOT NULL,
        previous_event_id TEXT, event_id TEXT NOT NULL, actor TEXT NOT NULL, evidence TEXT NOT NULL,
        changed_at INTEGER NOT NULL
      );
    `);
    return new UsageIdentityIndex(db);
  }

  lookup(origin: string, anchor: UsageAnchor): string | undefined {
    return this.db.prepare('SELECT event_id FROM usage_event_anchors WHERE origin=? AND kind=? AND value=?')
      .get(origin, anchor.kind, anchor.value)?.event_id as string | undefined;
  }

  resolve(origin: string, anchors: readonly UsageAnchor[], evidence: IdentityEvidence): IdentityResolution {
    if (!origin.trim() || !anchors.length || anchors.some(anchor => !anchor.value.trim())
      || !evidence.actor.trim() || !evidence.reference.trim()) {
      throw Error('IDENTITY_EVIDENCE_REQUIRED');
    }
    return this.atomic(() => {
      const conflicts = this.db.prepare('SELECT 1 FROM usage_identity_conflicts WHERE origin=? AND kind=? AND value=?');
      const blocked = anchors.find(anchor => conflicts.get(origin, anchor.kind, anchor.value));
      if (blocked) return { status: 'unresolved-anchor', anchor: blocked };
      const eventIds = new Set(anchors.map(anchor => this.lookup(origin, anchor)).filter(id => id !== undefined));
      if (eventIds.size > 1) return { status: 'conflict', eventIds: [...eventIds].sort() };

      // Sort only for initial allocation. New aliases reuse the persisted binding.
      const [first] = anchors.map(anchor => JSON.stringify([anchor.kind, anchor.value])).sort();
      const eventId = [...eventIds][0] ?? hash(['usage-event/1', origin, first]);
      this.db.prepare('INSERT OR IGNORE INTO usage_events VALUES (?, ?)').run(origin, eventId);
      for (const anchor of anchors) {
        if (this.lookup(origin, anchor) === eventId) continue;
        this.db.prepare('INSERT INTO usage_event_anchors VALUES (?, ?, ?, ?)').run(origin, anchor.kind, anchor.value, eventId);
        this.audit(origin, anchor, null, eventId, evidence);
      }
      return { status: 'resolved', eventId };
    });
  }

  correctBinding(input: {
    origin: string;
    anchor: UsageAnchor;
    expectedEventId: string;
    eventId: string;
    evidence: IdentityEvidence;
    split?: true;
  }): boolean {
    const { origin, anchor, expectedEventId, eventId, evidence } = input;
    if (!origin.trim() || !anchor.value.trim() || !expectedEventId.trim() || !eventId.trim()
      || !evidence.actor.trim() || !evidence.reference.trim()) throw Error('IDENTITY_EVIDENCE_REQUIRED');
    return this.atomic(() => {
      const current = this.lookup(origin, anchor);
      if (current === eventId) return false;
      if (!current || current !== expectedEventId) throw Error('IDENTITY_BINDING_CHANGED');
      const target = this.db.prepare('SELECT 1 FROM usage_events WHERE origin=? AND event_id=?').get(origin, eventId);
      if (input.split && target) throw Error('IDENTITY_SPLIT_TARGET_EXISTS');
      if (input.split) this.db.prepare('INSERT INTO usage_events VALUES (?, ?)').run(origin, eventId);
      else if (!target) throw Error('IDENTITY_TARGET_NOT_FOUND');
      this.db.prepare('UPDATE usage_event_anchors SET event_id=? WHERE origin=? AND kind=? AND value=?')
        .run(eventId, origin, anchor.kind, anchor.value);
      this.audit(origin, anchor, current, eventId, evidence);
      return true;
    });
  }

  private audit(origin: string, anchor: UsageAnchor, previous: string | null, next: string, evidence: IdentityEvidence) {
    this.db.prepare(`INSERT INTO usage_identity_audit (origin,kind,value,previous_event_id,event_id,actor,evidence,changed_at)
      VALUES (?,?,?,?,?,?,?,?)`).run(origin, anchor.kind, anchor.value, previous, next, evidence.actor, evidence.reference, Date.now());
  }

  private atomic<T>(action: () => T): T {
    // Standalone calls acquire a write lock before reading. A batch can supply
    // its own BEGIN IMMEDIATE and roll back identity, audit, and cursor together.
    const nested = this.db.isTransaction;
    this.db.exec(nested ? 'SAVEPOINT usage_identity' : 'BEGIN IMMEDIATE');
    try {
      const result = action();
      this.db.exec(nested ? 'RELEASE usage_identity' : 'COMMIT');
      return result;
    } catch (error) {
      if (this.db.isTransaction) this.db.exec(nested ? 'ROLLBACK TO usage_identity; RELEASE usage_identity' : 'ROLLBACK');
      throw error;
    }
  }
}
