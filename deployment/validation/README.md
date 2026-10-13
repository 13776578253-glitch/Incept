# Isolated production acceptance

These runners use synthetic data and loopback endpoints. Keep generated cookies, SSH keys, passwords and raw backups out of Git. Use Node from `.node-version`.

`scripts/production-integration.ts` requires `INCEPT_TEST_DEPLOYMENT=1` and a database named `incept_readiness`; `seed` refuses an existing dataset. Use an independent Compose project and volumes:

```sh
docker compose <fixture options> run --rm --no-deps -T --entrypoint pnpm \
  -e INCEPT_TEST_DEPLOYMENT=1 -e NODE_OPTIONS=--conditions=react-server app \
  --filter @incept/db exec tsx ../../scripts/production-integration.ts <mode>
```

Modes: `seed`, `transactions`, `http`, `reading`, `restore`. They test PostgreSQL rollback/concurrent confirmation, role/media gates, live upload/retry, bilingual reading, and restored PostgreSQL/SQLite/media. Never target an existing development database.

For real systemd user units on Linux/WSL, run as a regular user:

```sh
INCEPT_TEST_DEPLOYMENT=1 INCEPT_VALIDATION_NODE=/absolute/path/to/node \
  sh deployment/validation/systemd-check.sh
```

It creates a private `/var/tmp/incept-readiness-systemd-*` directory and transient user units, binds loopback port 30344, verifies trusted local TLS, failure deduplication, recovery, overdue backup, disk threshold without filling the disk, and SIGKILL/restart. It stops only its own units and preserves evidence in the printed directory. It installs no Docker integration, host certificate trust or production services.

The proxy runner uses the retained `ops-complete` fixture: `context.json` with project `incept-ops-*`, `issued-root-ca.pem`, and `browser-owner-api.json` from synthetic Owner login. Only loopback ports 33643/33280 and `incept.test` are used:

Run the `reading` fixture mode first so both highlighted articles exist; proxy acceptance checks the real bilingual document SSR as well as the health endpoint, including generated runtime module aliases.

```sh
INCEPT_TEST_DEPLOYMENT=1 INCEPT_VALIDATION_ROOT=/absolute/path/to/ops-complete \
  node deployment/validation/https-proxy.mjs
```

Check proxy logs separately: the synthetic `readiness-redaction-marker` must appear only as `/invitation/redacted`, for HTTP/HTTPS and with/without locale. Exercise a native document confirmation form in a browser: API-only POSTs cannot reveal Referrer-Policy effects on Origin.

`pnpm test:ops` tests alert retry/deduplication and backup checksum rejection. Use a private ACME CA with real challenge validation, pinned SSH host keys and a separate encrypted repository for certificate/retention drills. Containers on the same machine do not prove off-host failure isolation; mobile emulation does not prove 4G/5G access.

For the 2GB resource profile, `memory-check.mjs` requires the same disposable database guard. Run `heap` inside the running app (stdin or a read-only mounted file); it checks main/Worker V8 limits, cgroup memory/swap limits and both tmpfs sizes. Run `http` from a separate client container with the synthetic /data fixture: it exercises bilingual highlighted SSR, a real Owner Worker refresh, a 128MiB WAV upload, Range and ten concurrent reads. Run the integration `reading` mode first. Never put the upload client inside the app's cgroup, since real visitors do not consume the server's container allocation.

```sh
cat deployment/validation/memory-check.mjs | docker compose <fixture options> exec -T \
  -e INCEPT_TEST_DEPLOYMENT=1 app node --input-type=module - heap
docker compose <fixture options> run --rm --no-deps -T --entrypoint node \
  -v "$PWD/deployment/validation/memory-check.mjs:/probe/memory-check.mjs:ro" \
  -e INCEPT_TEST_DEPLOYMENT=1 app /probe/memory-check.mjs http
```

Inspect PG settings, migration cgroup limits, memory.peak/events and restart counts separately. These scoped tests are not a long-duration leak test or a capacity guarantee for arbitrary imported histories and simultaneous uploads.
