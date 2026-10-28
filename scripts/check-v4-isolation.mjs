import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isAbsolute, resolve } from 'node:path';

const project = 'incept-v4-acceptance';
const digest = 'sha256:[a-f0-9]{64}';
const immutableImage = new RegExp(`^(?:${digest}|[^\\s@]+@${digest})$`);
const postgresImage = new RegExp(`^(?:[^\\s/]+/)?(?:library/)?postgres:16(?:[.][0-9]+)*(?:-alpine(?:[.][0-9]+)*)?@${digest}$`);
const fail = (code) => { throw new Error(`V4_ISOLATION_${code}`); };
const requireValue = (condition, code) => { if (!condition) fail(code); };
const keys = (object, expected, code) => requireValue(object && typeof object === 'object'
  && !Array.isArray(object) && Object.keys(object).every(key => expected.includes(key)), code);
const exactly = (actual, expected, code) => requireValue(JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort()), code);
const postgresCommand = ['postgres', '-c', 'max_connections=20', '-c', 'shared_buffers=64MB', '-c', 'work_mem=2MB', '-c', 'max_parallel_workers=0', '-c', 'jit=off'];
const entryImage = 'node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20';
const entrySource = fileURLToPath(new URL('../deployment/v4-http-entry.mjs', import.meta.url));
const memoryMatches = (actual, mebibytes) => actual === `${mebibytes}m`
  || actual === mebibytes * 1024 * 1024 || actual === String(mebibytes * 1024 * 1024);

// Consume only `docker compose ... config --format json` output. Never print credentials.
// This gate validates isolation, not the contents or provenance of copied databases.
export function checkV4Isolation(config) {
  keys(config, ['name', 'services', 'volumes', 'networks'], 'TOP_LEVEL');
  requireValue(config.name === project, 'PROJECT');
  exactly(Object.keys(config.services ?? {}), ['app', 'postgres', 'entry'], 'SERVICES');
  exactly(Object.keys(config.volumes ?? {}), ['v4_data', 'pg_data', 'acceptance_secrets'], 'VOLUMES');
  for (const [name, volume] of Object.entries(config.volumes)) {
    keys(volume, ['name'], 'VOLUME_OPTIONS');
    requireValue(!volume.name || volume.name === `${project}_${name}`, 'VOLUME_NAME');
  }
  exactly(Object.keys(config.networks ?? {}), ['acceptance', 'app_entry', 'ingress'], 'NETWORKS');
  for (const [name, network] of Object.entries(config.networks)) {
    keys(network, ['name', 'internal', 'ipam', 'driver'], 'NETWORK_OPTIONS');
    requireValue(network.ipam === undefined || Object.keys(network.ipam).length === 0, 'NETWORK_IPAM');
    requireValue((name === 'ingress' ? network.internal !== true : network.internal === true)
      && (!network.name || network.name === `${project}_${name}`), 'NETWORK');
    requireValue(name === 'ingress' ? network.driver === 'bridge' : network.driver === undefined || network.driver === 'bridge', 'NETWORK_DRIVER');
  }
  const { app, postgres, entry } = config.services;
  for (const service of [app, postgres, entry]) {
    keys(service, ['image', 'platform', 'restart', 'environment', 'volumes', 'networks', 'healthcheck',
      'ports', 'command', 'entrypoint', 'mem_limit', 'memswap_limit', 'cpus',
      ...(service === postgres ? [] : ['user', 'init', 'read_only', 'cap_drop', 'security_opt', 'tmpfs', 'depends_on']),
      ...(service === entry ? ['pids_limit', 'sysctls'] : [])], 'SERVICE_OPTIONS');
    requireValue(service === entry ? JSON.stringify(service.entrypoint) === JSON.stringify(['node', '/entry/v4-http-entry.mjs']) : service.entrypoint == null, 'SERVICE_COMMAND');
    const memory = service === app ? 768 : service === postgres ? 384 : 64;
    requireValue(memoryMatches(service.mem_limit, memory) && memoryMatches(service.memswap_limit, memory)
      && service.cpus === (service === app ? 2 : service === postgres ? 1 : 0.25), 'SERVICE_RESOURCE_LIMITS');
    requireValue(service.platform === 'linux/amd64' && service.restart === 'no', 'SERVICE_RUNTIME');
    const networks = Array.isArray(service.networks) ? service.networks : Object.keys(service.networks ?? {});
    exactly(networks, service === app ? ['acceptance', 'app_entry'] : service === postgres ? ['acceptance'] : ['app_entry', 'ingress'], 'SERVICE_NETWORK');
    if (service === entry) requireValue(!Array.isArray(service.networks), 'NETWORK_ATTACHMENT');
    if (!Array.isArray(service.networks)) for (const [name, attachment] of Object.entries(service.networks)) {
      if (service === entry && name === 'ingress') {
        keys(attachment, ['gw_priority'], 'NETWORK_ATTACHMENT');
        requireValue(attachment.gw_priority === 1, 'NETWORK_GATEWAY');
      } else requireValue(attachment === null || Object.keys(attachment).length === 0, 'NETWORK_ATTACHMENT');
    }
    requireValue(immutableImage.test(service.image ?? ''), 'IMMUTABLE_IMAGE');
  }
  for (const [name, service] of Object.entries(config.services)) {
    const health = service.healthcheck;
    keys(health, ['test', 'interval', 'timeout', 'retries', 'start_period'], 'HEALTHCHECK_OPTIONS');
    const expectedTest = name === 'postgres'
      ? ['CMD-SHELL', 'pg_isready -U incept_v4_restore -d incept_v4_acceptance']
      : ['CMD', 'node', '-e', `fetch('http://127.0.0.1:${name === 'app' ? 3000 : 8080}/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))`];
    requireValue(JSON.stringify(health.test) === JSON.stringify(expectedTest)
      && health.interval === (name === 'postgres' ? '5s' : '15s')
      && health.timeout === (name === 'postgres' ? '3s' : '5s')
      && health.retries === (name === 'postgres' ? 20 : 3)
      && health.start_period === (name === 'postgres' ? undefined : name === 'app' ? '30s' : '10s'), 'HEALTHCHECK');
    if (name !== 'postgres') {
      const dependencyName = name === 'app' ? 'postgres' : 'app';
      keys(service.depends_on, [dependencyName], 'DEPENDENCIES');
      const dependency = service.depends_on[dependencyName];
      keys(dependency, ['condition', 'required'], 'DEPENDENCY_OPTIONS');
      requireValue(dependency.condition === 'service_healthy'
        && (dependency.required === undefined || dependency.required === true), 'DEPENDENCY');
    }
  }
  requireValue(app.command == null && entry.command == null && JSON.stringify(postgres.command) === JSON.stringify(postgresCommand), 'SERVICE_COMMAND');
  requireValue(postgresImage.test(postgres.image), 'POSTGRES_IMAGE');
  for (const service of [app, entry]) {
    requireValue(service.user === '1000:1000' && service.read_only === true && service.init === true, 'APP_USER_ROOTFS');
    exactly(service.cap_drop ?? [], ['ALL'], 'APP_CAPS');
    exactly(service.security_opt ?? [], ['no-new-privileges:true'], 'APP_SECURITY');
  }
  requireValue(entry.image === entryImage && entry.pids_limit === 32, 'ENTRY_RUNTIME');
  keys(entry.sysctls, ['net.ipv4.ip_forward', 'net.ipv6.conf.all.forwarding'], 'ENTRY_SYSCTLS');
  for (const name of ['net.ipv4.ip_forward', 'net.ipv6.conf.all.forwarding']) requireValue(entry.sysctls[name] === '0', 'ENTRY_FORWARDING');
  requireValue(entry.environment === undefined && entry.tmpfs === undefined, 'ENTRY_ENVIRONMENT');
  requireValue(postgres.ports === undefined || postgres.ports.length === 0, 'POSTGRES_PORTS');
  requireValue(app.ports === undefined || app.ports.length === 0, 'APP_PORTS');
  requireValue(entry.ports?.length === 1, 'ENTRY_PORTS');
  const port = entry.ports[0];
  keys(port, ['host_ip', 'published', 'target', 'protocol', 'mode'], 'PORT_OPTIONS');
  requireValue(port.host_ip === '127.0.0.1' && String(port.published) === '3305'
    && port.target === 8080 && port.protocol === 'tcp' && (!port.mode || port.mode === 'ingress'), 'ENTRY_PORT');
  requireValue(entry.volumes?.length === 1, 'ENTRY_MOUNTS');
  const entryMount = entry.volumes[0];
  keys(entryMount, ['type', 'source', 'target', 'read_only', 'bind'], 'ENTRY_MOUNT_OPTIONS');
  keys(entryMount.bind, ['create_host_path'], 'ENTRY_BIND_OPTIONS');
  requireValue(entryMount.type === 'bind' && typeof entryMount.source === 'string' && isAbsolute(entryMount.source)
    && resolve(entryMount.source) === resolve(entrySource) && entryMount.target === '/entry/v4-http-entry.mjs'
    && entryMount.read_only === true && entryMount.bind.create_host_path === false, 'ENTRY_MOUNT');
  const mounts = (service, expected) => {
    requireValue(Array.isArray(service.volumes) && service.volumes.length === expected.length, 'MOUNTS');
    for (const item of expected) {
      const mount = service.volumes.find(value => value.target === item.target);
      requireValue(mount?.type === 'volume' && mount.source === item.source
        && Boolean(mount.read_only) === Boolean(item.read_only), 'MOUNT_IDENTITY');
      keys(mount, ['type', 'source', 'target', 'read_only', 'volume'], 'MOUNT_OPTIONS');
      keys(mount.volume, ['nocopy'], 'VOLUME_MOUNT_OPTIONS');
      requireValue(mount.volume.nocopy === true, 'MOUNT_NOCOPY');
    }
  };
  mounts(app, [{ source: 'v4_data', target: '/data' }, { source: 'acceptance_secrets', target: '/run/incept-v4-secrets', read_only: true }]);
  mounts(postgres, [{ source: 'pg_data', target: '/var/lib/postgresql/data' }]);
  exactly(app.tmpfs ?? [], ['/tmp:uid=1000,gid=1000,mode=1777,size=64m', '/app/apps/web/.next/cache:uid=1000,gid=1000,mode=0700,size=64m'], 'APP_TMPFS');
  requireValue(postgres.tmpfs === undefined, 'POSTGRES_TMPFS');
  const env = app.environment ?? {};
  keys(env, ['NODE_ENV', 'NEXT_TELEMETRY_DISABLED', 'DATABASE_URL', 'INCEPT_AUTH_ENCRYPTION_KEY', 'NODE_OPTIONS',
    'INCEPT_DOCS_MEDIA_DIR', 'INCEPT_DOCS_DRAFTS_DIR', 'INCEPT_MUSIC_MEDIA_DIR', 'INCEPT_DASHBOARD_HOME',
    'INCEPT_DASHBOARD_IMPORTS_FILE', 'INCEPT_DASHBOARD_CACHE_FILE', 'INCEPT_DASHBOARD_OVERRIDES_FILE',
    'INCEPT_SYNC_ENABLED', 'INCEPT_SYNC_TRUSTED_MODE', 'INCEPT_SYNC_REMOTE_ENABLED', 'INCEPT_SYNC_READ_MODE',
    'INCEPT_SYNC_DATABASE_FILE', 'INCEPT_SYNC_RPC_KEY_FILE', 'INCEPT_SYNC_DEVICE_ALLOWLIST', 'INCEPT_SYNC_POLL_MS',
    'INCEPT_SYNC_MAX_QUEUE', 'INCEPT_SYNC_MAX_BATCH_RECORDS', 'INCEPT_SYNC_MEMORY_PERCENT'], 'APP_ENVIRONMENT');
  for (const [key, value] of Object.entries({ NODE_ENV: 'production', INCEPT_SYNC_ENABLED: '1', INCEPT_SYNC_TRUSTED_MODE: '1',
    INCEPT_SYNC_REMOTE_ENABLED: '0', INCEPT_SYNC_READ_MODE: 'v2', INCEPT_SYNC_DATABASE_FILE: '/data/sync/v4.db',
    INCEPT_SYNC_RPC_KEY_FILE: '/run/incept-v4-secrets/sync-rpc.key', INCEPT_DOCS_MEDIA_DIR: '/data/docs-media',
    INCEPT_DOCS_DRAFTS_DIR: '/data/docs-drafts', INCEPT_MUSIC_MEDIA_DIR: '/data/music-media', INCEPT_DASHBOARD_HOME: '/data/dashboard',
    INCEPT_DASHBOARD_IMPORTS_FILE: '/data/dashboard/imports.db', INCEPT_DASHBOARD_CACHE_FILE: '/data/dashboard/snapshots.json',
    INCEPT_DASHBOARD_OVERRIDES_FILE: '/data/dashboard/overrides.json', INCEPT_SYNC_POLL_MS: '300000',
    INCEPT_SYNC_MAX_QUEUE: '4', INCEPT_SYNC_MAX_BATCH_RECORDS: '100000', INCEPT_SYNC_MEMORY_PERCENT: '85',
    NODE_OPTIONS: '--max-old-space-size=256 --max-semi-space-size=8' })) requireValue(env[key] === value, `ENV_${key}`);
  requireValue(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(env.INCEPT_SYNC_DEVICE_ALLOWLIST ?? ''), 'DEVICE_ID');
  requireValue(/^[a-f0-9]{64}$/i.test(env.INCEPT_AUTH_ENCRYPTION_KEY ?? '') && !/^(.)\1+$/.test(env.INCEPT_AUTH_ENCRYPTION_KEY), 'AUTH_KEY');
  const pg = postgres.environment ?? {};
  keys(pg, ['POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD'], 'POSTGRES_ENVIRONMENT');
  requireValue(pg.POSTGRES_DB === 'incept_v4_acceptance' && pg.POSTGRES_USER === 'incept_v4_restore'
    && /^[A-Za-z0-9_-]{32,}$/.test(pg.POSTGRES_PASSWORD ?? ''), 'POSTGRES_CREDENTIAL');
  let url;
  try { url = new URL(env.DATABASE_URL); } catch { fail('DATABASE_URL'); }
  requireValue(url.protocol === 'postgresql:' && url.hostname === 'postgres' && url.port === '5432'
    && url.pathname === '/incept_v4_acceptance' && url.username === 'incept_v4_acceptance'
    && /^[A-Za-z0-9_-]{32,}$/.test(decodeURIComponent(url.password)) && decodeURIComponent(url.password) !== pg.POSTGRES_PASSWORD && !url.hash
    && url.search === '?connection_limit=5&pool_timeout=10&connect_timeout=5', 'DATABASE_URL');
  return { ok: true, project, services: ['app', 'postgres', 'entry'], productionWrites: false, remoteSyncEnabled: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) fail('USAGE_RENDERED_COMPOSE_JSON_REQUIRED');
    console.log(JSON.stringify(checkV4Isolation(JSON.parse(readFileSync(process.argv[2], 'utf8')))));
  } catch (error) {
    console.error(error.message?.startsWith('V4_ISOLATION_') ? error.message : 'V4_ISOLATION_INPUT_INVALID');
    process.exitCode = 1;
  }
}
