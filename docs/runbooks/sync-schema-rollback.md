# Sync SQLite schema rollback drill

This runbook covers a failed app rollout when production `sync/v4.db` is on schema 3 but the target image only writes schema 2.

## Rule

Do not roll back only the image. Schema-2 code reads a schema-3 database in `status`, but a write path fails closed with `SCHEMA_VERSION_MISMATCH`. A code rollback therefore requires either a compatible image or restoring a schema-2 database backup.

## Verified drill (2026-10-28, isolated copies)

- Schema-2 backup: `/srv/incept/backups/phase0b-repair-20261028T061500Z/v4.db` (revision 869, schema 2).
- Old image `sha256:9f0d…`:
  - `status` on the schema-2 copy: OK, revision 869.
  - `maintain` on the schema-2 copy: OK, checkpointed.
  - `status` on a schema-3 copy: OK (read-only view).
  - `maintain` on a schema-3 copy: `SCHEMA_VERSION_MISMATCH` (write refused).
- Current image `sha256:51e38a56…`:
  - `maintain` on a schema-2 copy: OK; schema version became 3 and revision stayed 869.
  - `status` on production schema 3: OK.

## Rollback procedure

1. Stop `app` and `sync-gateway`; leave Postgres and proxy.
2. Take a final schema-3 backup if any writes must be preserved.
3. Restore the last schema-2 `v4.db` together with its `v4.db-wal` and `v4.db-shm` (use a SQLite backup API for live consistency).
4. Pin the previous app image in `.env.production`, point `current` at its release directory, and start app/gateway/proxy.
5. Verify `/api/health/ready`, `sync-maintenance status`, `/api/dashboard/usage?range=7d`, and an idempotent `maintain`.
6. If validation fails, stop the old image and restore the schema-3 backup; do not run both images against one file.

## Future compatibility

Use expand/contract: first ship a version that reads and writes both schema 2 and 3, migrate, then remove schema 2 support only after the rollback window closes. Do not make a destructive schema change in the same release as the first schema-3 deployment.
