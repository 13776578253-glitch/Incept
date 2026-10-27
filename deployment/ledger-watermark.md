# Authoritative ledger watermark

The production web container verifies the authoritative sync ledger (`v4.db`) before it
starts accepting traffic. When `INCEPT_SYNC_ENABLED=1`, `scripts/production-start.mjs`
calls `validateAuthoritativeLedgerGate()`, which reads a watermark file next to the
ledger and refuses to boot when the ledger is older, smaller or structurally different
from the recorded baseline.

A missing watermark is not a warning: the container exits with
`{"event":"production_configuration_invalid","error":"EXTERNAL_WATERMARK_MISSING"}`.
Because `sync-gateway` declares `depends_on: app: service_healthy`, a rejected app also
keeps the gateway down and the site returns 502. Create the watermark **before**
deploying an image that contains the gate.

## Location

`<dirname of INCEPT_SYNC_DATABASE_FILE>/ledger-watermark.json`

With the production compose file that resolves to:

| Context | Path |
| --- | --- |
| Host | `${INCEPT_DATA_DIR}/sync/ledger-watermark.json` |
| Container | `/data/sync/ledger-watermark.json` |

The file must be readable by the container user (`node`, uid 1000). Generate it through
the container so the ownership and `0600` mode are correct.

## Schema

Flat keys only — this is the exact shape `generate` writes and the gate reads:

| Key | Type | Enforced as |
| --- | --- | --- |
| `canonicalLedger` | string | `INCEPT_SYNC_DATABASE_FILE` must end with this value |
| `minRevision` | number | `sync_meta.data_revision >= minRevision` |
| `anchorBatchId` | string | the batch must exist in `sync_receipts` |
| `anchorPayloadHash` | string | its `payload_hash` must match exactly |
| `minScopes` | number | `COUNT(sync_scopes) >= minScopes` |
| `minTokens` | number | `SUM(sync_scopes.token_total) >= minTokens` |
| `minVisibleRecords` | number | `COUNT(sync_current) >= minVisibleRecords` |
| `createdAt` / `updatedAt` | string | informational only |

Unknown keys are ignored, so an extra `comment` is harmless. There is **no** `version`
field and **no** nested `anchorReceipt` object: a watermark written as
`{"anchorReceipt":{"batchId":…,"payloadHash":…}}` parses fine and passes the gate while
verifying no anchor at all. Always use the flat `anchorBatchId` / `anchorPayloadHash`
pair, or let `generate` write it.

Every numeric floor is optional; the gate skips any key that is absent or zero.

## Gate order and error codes

| Step | Failure code |
| --- | --- |
| watermark file present | `EXTERNAL_WATERMARK_MISSING` |
| file parses as JSON | `EXTERNAL_WATERMARK_CORRUPTED` |
| ledger file name matches `canonicalLedger` | `CANONICAL_LEDGER_MISMATCH` |
| ledger file present | `LEDGER_DATABASE_NOT_FOUND` |
| `PRAGMA quick_check` returns `ok` | `SQLITE_INTEGRITY_FAILED` |
| revision at or above the floor | `REVISION_BELOW_WATERMARK` |
| anchor batch present | `ANCHOR_RECEIPT_MISSING` |
| anchor hash matches | `ANCHOR_PAYLOAD_HASH_MISMATCH` |
| scope count at or above the floor | `SCOPES_BELOW_BASELINE` |
| token total at or above the floor | `TOKENS_BELOW_BASELINE` |
| visible record count at or above the floor | `VISIBLE_RECORDS_BELOW_BASELINE` |

A read-only connection, including on a WAL ledger with a leftover `-wal` or `-shm`, is
supported; the gate never writes to the database.

## CLI

```bash
node scripts/ledger-watermark.mjs check    [dbFile] [watermarkFile]
node scripts/ledger-watermark.mjs generate [dbFile] [watermarkFile] [--force]
node scripts/ledger-watermark.mjs advance  [dbFile] [watermarkFile]
```

Defaults: `dbFile` is `$INCEPT_SYNC_DATABASE_FILE` or `/data/sync/v4.db`; `watermarkFile`
is `ledger-watermark.json` beside the ledger.

All three actions use the explicitly supplied `watermarkFile`; only when it is omitted do
they fall back to the file beside the ledger.

- `check` runs the real startup gate, then prints the live metrics next to each floor.
- `generate` snapshots the ledger: revision, scope count, token total, visible records
  and the newest receipt as the anchor. It **refuses** to lower any existing floor
  (`WATERMARK_DOWNGRADE_REJECTED`), refuses to overwrite a corrupt file
  (`EXTERNAL_WATERMARK_CORRUPTED`) and refuses an anchor batch the ledger does not hold
  (`ANCHOR_RECEIPT_MISSING`); pass `--force` to re-baseline deliberately.
- `advance` raises the floors to the current height and never lowers them
  (`WATERMARK_REGRESSION_REJECTED`).

## Operational rules

1. **Never copy `ledger-watermark.example.json`** into the data directory. Its anchor
   batch almost certainly does not exist in the live ledger, and the app will not boot.
2. Generate against the live ledger while it is quiet; the snapshot is a floor, so
   concurrent writes only make the next check safer.
3. `minRevision` is safe: `data_revision` is strictly increasing.
   `minScopes` is nearly monotonic. `minTokens` and `minVisibleRecords` are **not** —
   a legitimate manifest rotation or source-side cleanup rewrites `sync_current` and
   `token_total` and can shrink them, which then blocks the next restart. If such a
   shrink is expected, omit those two keys or re-baseline with `--force` and note why.
4. Regenerate after a deliberate ledger restore, and never with `--force` against a
   ledger you have not inspected.

## Running it before the image ships

The two files are plain ESM with `node:` builtins only, so any Node 24 container can run
them — including the currently deployed image that predates this tool:

```bash
cd /srv/incept
./deployment/compose.sh run --rm --no-deps -v /srv/incept/incoming/wm:/ops:ro \
  --entrypoint node app /ops/ledger-watermark.mjs generate /data/sync/v4.db
./deployment/compose.sh run --rm --no-deps -v /srv/incept/incoming/wm:/ops:ro \
  --entrypoint node app /ops/ledger-watermark.mjs check /data/sync/v4.db
```

`check` must print `[PASS] Authoritative ledger gate passed successfully!` together with
the metric table before the new image is deployed.
