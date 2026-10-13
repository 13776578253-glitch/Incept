# Dashboard package

`@incept/dashboard` owns the Token dashboard, its repeatable local collectors, pricing and presentation in the same process as the Web app.

## Entry points

| Export | Responsibility |
| --- | --- |
| `@incept/dashboard/domain` | Framework-free usage types |
| `@incept/dashboard/adapters` | Server-only local filesystem / SQLite loader and its existing cache |
| `@incept/dashboard/react` | Client dashboard accepting `TokenDashboardData` |
| `@incept/dashboard/next` | Server component that loads data and mounts the client dashboard |
| `@incept/dashboard/messages/en`, `/messages/zh` | Package-owned `dashboard` translations |

The Web host owns `/[locale]/dashboard`, `WorkspaceShell`, navigation, the `NextIntlClientProvider`, and the global theme. It loads the package messages under the `dashboard` namespace, transpiles the package, and includes its source in Tailwind's scan. The package has no imports from `apps/web` or the host's `@/` alias. The client export never imports the local adapter.

## Layers and runtime

`domain` has no Node, React or Next dependencies. `adapters/local` separates collection, pricing and aggregation; its Node-only typecheck excludes browser libraries. `react` uses React and the host's next-intl provider. `next` composes the server adapter and client component and is checked with JSX/browser types. Server entry points retain the `server-only` guard.

## Internal modules

The React entry point only assembles the toolbar and four sections. `hooks/use-dashboard-window` owns the existing shared time-window and selected-period state. Each section keeps its own state hook and display panels:

- `sections/overview`: usage metrics, trend/calendar/model-matrix analysis, and model ranking.
- `sections/models`: token-type breakdown, source distribution, and the sortable model table.
- `sections/costs`: cost metrics, price coverage, and model pricing.
- `sections/projects`: project attribution, searchable/sortable sessions, and the session inspector.
- `components`, `formatters`, and `model-colors`: shared visual primitives and display helpers.

The local adapter caches a raw event snapshot for 15 seconds and aggregates the selected time range on every request. Collectors read CommandCode, Codex, Gemini and Claude Code session files; Antigravity IDE/CLI conversation databases; OpenCode messages; and ZCode model-usage records. Database WAL changes are included. Native files/sessions replace indexed copies, including duplicate Codex fork history. Antigravity generation/step copies are merged by request identities while retries remain separate. Model names come from stored metadata; numeric model IDs have no hardcoded name table. Rates can be associated with another stored name only when native records explicitly share the same model ID and the known rates agree.

If native records cannot be collected, the bundled `ccusage` executable queries offline, timezone-aware daily session reports. Only uncovered sessions are accepted, and a partial query never replaces an indexed history. Day-level fallback timestamps are labelled as daily summaries. Existing aiusage records are the last historical fallback when original files and ccusage reports cannot supply that history. `collectionIssues` and each source's `collectionMode` distinguish native collection, reports and historical indexes; pricing coverage alone does not establish source completeness.

Pricing reads the local aiusage registry and its explicit aliases/overrides, the installed CommandCode model catalog's literal rates, and dashboard-local overrides. `pricing-temporary` supplies a small historical rate fallback when a local catalog lacks those entries. The CommandCode CLI is neither executed nor imported to read its catalog. Recorded fees remain separate from reference rates and take precedence in cost totals. Missing cache rates remain unknown rather than being interpreted as zero. Explicit Gemini Flash pricing variants can reuse configured base rates while retaining their original model identities. `aggregation/accumulate` owns counters, `aggregation/configured-models` appends configured slots, and `aggregation/summarize` builds the selected-window payload.

All shares and rates use fractions (0–1), with percentage conversion performed at display time. Price coverage is measured per event, including unknown portions of mixed-price models. Cost precision is retained until formatting. Native session timestamps describe records inside the selected window; tool fallback is explicitly marked as a daily summary. Days without activity are included in the calendar; active-day counts remain separate from calendar-day averages.

## Refresh and time window

`/api/dashboard/usage?range=7d|14d|30d|all` returns a fresh aggregation with `Cache-Control: no-store`. `refresh=1` bypasses the raw snapshot cache. The client checks 60 seconds after the previous request finishes while visible, refreshes on returning to the page, and offers manual refresh. Old requests are aborted on range changes; failed refreshes retain the previous successful payload.

Every section uses the same request-time window in `Asia/Singapore` (UTC+8), anchored to the current calendar day. The page and endpoint default to 30 days. `updatedAt` tracks source/configuration modification times; `checkedAt` tracks the latest check.

Local collection resolves the server process's home directory. SQLite uses Node's `node:sqlite`; the runtime also needs the platform-specific ccusage executable installed by the package dependency. The usage page stays readable; import previews, commits and history require Owner identity, and write requests require the same origin.

## Cross-device imports

Run `corepack pnpm dashboard:build-tools` from the repository root. Copy the resulting `packages/dashboard/dist/dashboard-data.mjs` and `export-tokens.cmd` to the other computer (Node 24 LTS required), then double-click the command file. Export reuses raw Codex/CommandCode collectors, including archived Codex sessions. It captures numeric usage, model identity, session/project metadata and known reference rates without copying conversation bodies or credentials. Read failures and file-mtime timestamps are disclosed as collector warnings.

The Owner toolbar offers a file preview, explicit project mapping, validation and confirmation. A versioned transfer format, bounded numeric fields, file limit and checksum validate the upload; the checksum detects damage, not authenticity. Raw event identities suppress copied logs and repeated snapshots. Usage/model mismatches block commits. Alias normalization and receiver prices remain authoritative; captured rates only fill missing references. Recorded CommandCode costs survive transfer. Missing prices do not prevent importing real usage.

The import store defaults to `~/.incept/dashboard-imports.db`, configurable with `INCEPT_DASHBOARD_IMPORTS_FILE`. Transactions persist independent batches and an audit index. Imported projects and sessions retain device identity; merging with a local project requires explicit mapping. The active batch layer is reread on every dashboard request outside the 15-second native cache. Rollback never edits local logs and does not remove records held by other active batches. Import failure leaves native collection available with an issue message.

`corepack pnpm dashboard:imports history` lists batch IDs. `corepack pnpm dashboard:imports rollback <batch-id>` disables one batch and retains its index; refresh the dashboard to see the result. Preview tokens expire after 30 minutes, and relevant matching changes require another preview. Reimporting an already active snapshot is idempotent; importing after rollback creates a new batch. This is repeatable snapshot transfer, not automatic remote polling. See [the portable guide](tools/TRANSFER.md) for CLI import and custom paths.

## Small server-local overrides

`packages/dashboard/dashboard.local.json` is ignored by Git and read only by the server. Start from `dashboard.local.example.json`. `INCEPT_DASHBOARD_OVERRIDES_FILE` can select another local file; `INCEPT_COMMANDCODE_CATALOG_FILE` and `INCEPT_DASHBOARD_CCUSAGE_BIN` are optional installation-path overrides. The configuration is reread when the snapshot expires or on manual refresh; it never imports fixed usage totals or quotas.

- `modelAliases`: explicit recorded/request names mapped to the desired model identity. Exact names and provider-qualified names are supported; alias cycles are rejected.
- `prices`: only exceptional missing/incorrect rates, keyed by model name. Values use `inputPerMillion`, `outputPerMillion`, and optional `cacheReadPerMillion` / `cacheWritePerMillion`, in USD per million tokens. An omitted cache rate is unknown, while an explicit zero is free.

Automatic sources stay enabled when the override file is absent or invalid. Invalid overrides produce a collection issue. Keep this file small: automatic model identity and catalog prices are the normal path. Machine-specific overrides remain private and are excluded from Git.

Styles use Tailwind classes, the package stylesheet and inline chart styles. The host supplies the existing `--color-*`, `--badge-{sky,amber,indigo,emerald,rose}-*`, `--surface-chip-*` and `--shadow-pill-active` theme variables. The header follows the Roadmap page's title hierarchy and keeps only source-update metadata. Overview stacks a full-width analysis panel above the ranking. Analysis views and ranking lists scroll within fixed-height frames, so switching views or expanding the ranking does not move later sections. The import dialog reuses Roadmap theme variables and a split layout; its initial focus stays on the title, and keyboard navigation retains visible focus indicators.

## Follow-up discussion

Collection performs a full scan when the snapshot expires. Deleted native logs cannot be reconstructed by a tool report that also cannot read them; remaining historical indexes are explicitly identified. Provider billing validation and historical price versions remain separate from local recorded estimates.

## Checks

`pnpm --filter @incept/dashboard typecheck` checks the pure types, Node adapter and complete package separately. `pnpm --filter @incept/dashboard test` uses isolated local fixtures and package exports; it never reads the user's actual usage logs.
