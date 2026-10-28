# Repository Guidelines

## Project Structure & Module Organization

Incept uses pnpm, Next.js, React, TypeScript, Prisma, and PostgreSQL.
- `apps/web/src/`: localized App Router pages, features, server handlers, and shared UI; static assets live in `apps/web/public/`.
- `packages/`: reusable `music`, `roadmap`, and `dashboard` modules, plus `db` with its Prisma schema and migrations.
- `scripts/`: import, maintenance, production checks, and worktree utilities.
- `docs/`: architecture decisions, runbooks, task records, and documentation assets; `deployment/` holds deployment configuration.

Keep domain rules independent of adapters and UI. Follow package exports when importing across workspaces.

## Build, Test, and Development Commands

Use Node.js 24.15+ (below 25) and pnpm 10.30.3.
- `pnpm install`: install workspace dependencies.
- `pnpm dev`: start web development; automatically build the Dashboard runtime worker.
- `pnpm build`: create the production web build, including its worker.
- `pnpm lint` / `pnpm typecheck`: run web ESLint and workspace TypeScript checks.
- `pnpm test`: run workspace test suites.
- `pnpm test:ops`: run production utility tests with Node's test runner.
- `pnpm --filter @incept/roadmap test`: test one package.
- `pnpm db:generate` / `pnpm db:migrate`: generate Prisma bindings or apply development migrations.

## Coding Style & Naming Conventions

Follow surrounding TypeScript: two-space indentation, single quotes, semicolons, and explicit types at boundaries. Use PascalCase for React components/types, camelCase for functions/variables, and existing kebab-case file conventions. Web linting uses ESLint's Next.js Core Web Vitals and TypeScript presets. Preserve English/Chinese localization pairs. For frontend Chinese copy, omit Chinese full stops (。) unless explicitly requested. Read `apps/web/AGENTS.md` and installed Next.js guides before web changes.

## Testing Guidelines

Use Vitest; React tests use Testing Library and jsdom. Name tests `*.test.ts` or `*.test.tsx`, colocated or under `__tests__/`. Cover regressions. PostgreSQL auth integration tests require `INCEPT_AUTH_TEST_DATABASE_URL`; report skipped suites. Run relevant tests and typechecks before review, plus `git diff --check` for documentation.

## Commit & Pull Request Guidelines

Follow history: `fix(ops): ...`, `fix(web): ...`, or `docs: ...`. Preserve unrelated work. Before committing, inspect `git diff --cached --name-status` and `git diff --cached --check`. PRs should explain behavior, link relevant issues, record validation, and include screenshots for UI changes. Keep secrets and local exports out of commits.

## Multi-Agent Delegation

The main agent is the orchestrator and may spawn subagents when useful. Delegate bounded exploration, implementation, test creation, and verification. Keep architecture decisions, critical-path work, security-sensitive changes, and final review with the main agent. Use the configured default subagent model unless explicitly instructed otherwise. Avoid subagents for trivial tasks and concurrent edits to the same files.
