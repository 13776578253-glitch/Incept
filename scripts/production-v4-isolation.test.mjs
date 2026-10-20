import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkV4Isolation } from './check-v4-isolation.mjs';

const template = JSON.parse(readFileSync(new URL('../deployment/compose.v4-acceptance.json', import.meta.url), 'utf8'));
function fixture() {
  const replacements = {
    INCEPT_V4_APP_IMAGE: `sha256:${'a'.repeat(64)}`,
    INCEPT_V4_POSTGRES_IMAGE: `postgres:16-alpine@sha256:${'b'.repeat(64)}`,
    INCEPT_V4_PG_PASSWORD: 'isolated_acceptance_password_0123456789',
    INCEPT_V4_PG_ADMIN_PASSWORD: 'isolated_restore_admin_password_0123456789',
    INCEPT_V4_AUTH_ENCRYPTION_KEY: 'ab'.repeat(32),
    INCEPT_V4_DEVICE_ID: '00000000-0000-4000-8000-000000000001',
  };
  const config = JSON.parse(JSON.stringify(template).replace(/\$\{([A-Z0-9_]+):\?[^}]+\}/g, (_, key) => replacements[key]));
  // Include generated names and normalized network/port forms from Compose rendering.
  for (const [key, volume] of Object.entries(config.volumes)) volume.name = `${config.name}_${key}`;
  for (const [key, network] of Object.entries(config.networks)) {
    network.name = `${config.name}_${key}`;
    network.ipam = {};
    if (network.internal === false) delete network.internal;
  }
  for (const service of Object.values(config.services)) {
    if (Array.isArray(service.networks)) service.networks = Object.fromEntries(service.networks.map(name => [name, null]));
    service.command ??= null;
    service.entrypoint ??= null;
    for (const dependency of Object.values(service.depends_on ?? {})) dependency.required = true;
  }
  config.services.entry.ports[0].mode = 'ingress';
  config.services.entry.volumes[0].source = fileURLToPath(new URL('../deployment/v4-http-entry.mjs', import.meta.url));
  return config;
}

test('isolated rendered configuration accepts local image config ID and pinned registry references', () => {
  const config = fixture();
  assert.equal(checkV4Isolation(config).ok, true);
  config.services.app.image = `registry.example/incept:r5@sha256:${'c'.repeat(64)}`;
  assert.equal(checkV4Isolation(config).ok, true);
});

test('resource limits accept template mebibytes and Compose rendered byte numbers', () => {
  const config = fixture();
  assert.equal(checkV4Isolation(config).ok, true);
  for (const service of Object.values(config.services)) {
    service.mem_limit = Number.parseInt(service.mem_limit, 10) * 1024 * 1024;
    service.memswap_limit = service.mem_limit;
  }
  assert.equal(checkV4Isolation(config).ok, true);
  for (const service of Object.values(config.services)) {
    service.mem_limit = String(service.mem_limit);
    service.memswap_limit = String(service.memswap_limit);
  }
  assert.equal(checkV4Isolation(config).ok, true);
});

const invalid = [
  ['project override', c => { c.name = 'incept'; }],
  ['extra service', c => { c.services.agent = {}; }],
  ['mutable app tag', c => { c.services.app.image = 'incept:r5'; }],
  ['mutable postgres tag', c => { c.services.postgres.image = 'postgres:16-alpine'; }],
  ['config ID misused as postgres registry identity', c => { c.services.postgres.image = `sha256:${'b'.repeat(64)}`; }],
  ['external production volume', c => { c.volumes.v4_data.external = true; }],
  ['fixed production volume name', c => { c.volumes.pg_data.name = 'incept_postgres_data'; }],
  ['host volume driver override', c => { c.volumes.v4_data.driver_opts = { device: '/srv/incept/shared', type: 'none', o: 'bind' }; }],
  ['external network', c => { c.networks.acceptance.external = true; }],
  ['custom network IPAM', c => { c.networks.acceptance.ipam = { config: [{ subnet: '10.0.0.0/8' }] }; }],
  ['noninternal network', c => { c.networks.acceptance.internal = false; }],
  ['fixed production network name', c => { c.networks.acceptance.name = 'incept_default'; }],
  ['host network', c => { c.services.app.network_mode = 'host'; }],
  ['production bind', c => { c.services.app.volumes[0] = { type: 'bind', source: '/srv/incept/shared', target: '/data' }; }],
  ['production secrets bind', c => { c.services.app.volumes[1].source = '/srv/incept/secrets'; }],
  ['Docker socket', c => { c.services.app.volumes.push({ type: 'bind', source: '/var/run/docker.sock', target: '/var/run/docker.sock' }); }],
  ['secret writable', c => { c.services.app.volumes[1].read_only = false; }],
  ['mount subpath override', c => { c.services.app.volumes[0].volume.subpath = '../shared'; }],
  ['volume copy-up', c => { c.services.app.volumes[0].volume.nocopy = false; }],
  ['app port published', c => { c.services.app.ports = [{host_ip:'127.0.0.1',published:'3305',target:3000,protocol:'tcp'}]; }],
  ['public entry port', c => { c.services.entry.ports[0].host_ip = '0.0.0.0'; }],
  ['postgres published', c => { c.services.postgres.ports = ['5432:5432']; }],
  ['root app', c => { c.services.app.user = '0:0'; }],
  ['writable app root', c => { c.services.app.read_only = false; }],
  ['privileged app', c => { c.services.app.privileged = true; }],
  ['restart on reboot', c => { c.services.app.restart = 'always'; }],
  ['alternate architecture', c => { c.services.app.platform = 'linux/arm64'; }],
  ['remote sync', c => { c.services.app.environment.INCEPT_SYNC_REMOTE_ENABLED = '1'; }],
  ['untrusted mode', c => { c.services.app.environment.INCEPT_SYNC_TRUSTED_MODE = '0'; }],
  ['v2 database', c => { c.services.app.environment.INCEPT_SYNC_DATABASE_FILE = '/data/sync/v2.db'; }],
  ['wrong read mode', c => { c.services.app.environment.INCEPT_SYNC_READ_MODE = 'v1'; }],
  ['production database host', c => { c.services.app.environment.DATABASE_URL = 'postgresql://incept_app:password@production:5432/incept'; }],
  ['production database role', c => { c.services.postgres.environment.POSTGRES_USER = 'incept_app'; }],
  ['short credential', c => { c.services.postgres.environment.POSTGRES_PASSWORD = 'password'; }],
  ['command override', c => { c.services.app.command = ['sh']; }],
  ['missing postgres command', c => { c.services.postgres.command = null; }],
  ['postgres command string', c => { c.services.postgres.command = c.services.postgres.command.join(' '); }],
  ['postgres command reordering', c => { c.services.postgres.command.reverse(); }],
  ['postgres command extra option', c => { c.services.postgres.command.push('-c', 'fsync=off'); }],
  ['postgres connection limit override', c => { c.services.postgres.command[2] = 'max_connections=100'; }],
  ['entrypoint override', c => { c.services.app.entrypoint = ['sh']; }],
  ['production env file', c => { c.services.app.env_file = ['/srv/incept/.env']; }],
  ['environment injection', c => { c.services.app.environment.LD_PRELOAD = '/data/evil.so'; }],
  ['node preload', c => { c.services.app.environment.NODE_OPTIONS = '--import=/data/evil.mjs'; }],
];
for (const service of ['app', 'postgres', 'entry']) {
  for (const limit of ['mem_limit', 'memswap_limit', 'cpus']) {
    invalid.push([`${service} missing ${limit}`, c => { delete c.services[service][limit]; }]);
    invalid.push([`${service} oversized ${limit}`, c => { c.services[service][limit] = limit === 'cpus' ? 4 : '1g'; }]);
    invalid.push([`${service} malformed numeric ${limit}`, c => { c.services[service][limit] = limit === 'cpus' ? String(c.services[service][limit]) : `0${Number.parseInt(c.services[service][limit], 10) * 1024 * 1024}`; }]);
  }
  invalid.push([`${service} deploy resource override`, c => { c.services[service].deploy = { resources: { limits: { memory: '2g' } } }; }]);
}
invalid.push(
  ['app entry network not internal', c => { c.networks.app_entry.internal = false; }],
  ['ingress wrongly internal', c => { c.networks.ingress.internal = true; }],
  ['ingress arbitrary driver', c => { c.networks.ingress.driver = 'macvlan'; }],
  ['app external attachment', c => { c.services.app.networks.ingress = {}; }],
  ['PG proxy network attachment', c => { c.services.postgres.networks.app_entry = {}; }],
  ['entry PG network attachment', c => { c.services.entry.networks.acceptance = {}; }],
  ['entry missing ingress', c => { delete c.services.entry.networks.ingress; }],
  ['entry wrong gateway priority', c => { c.services.entry.networks.ingress.gw_priority = 0; }],
  ['entry route injection', c => { c.services.entry.networks.app_entry = {gw_priority:2}; }],
  ['entry extra host injection', c => { c.services.entry.extra_hosts = ['app:1.1.1.1']; }],
  ['entry DNS override', c => { c.services.entry.dns = ['1.1.1.1']; }],
  ['entry mutable image', c => { c.services.entry.image = 'node:24'; }],
  ['entry different pinned image', c => { c.services.entry.image = `node:24@sha256:${'a'.repeat(64)}`; }],
  ['entry command injection', c => { c.services.entry.command = ['sh']; }],
  ['entry entrypoint injection', c => { c.services.entry.entrypoint = ['sh']; }],
  ['entry secret environment', c => { c.services.entry.environment = { TOKEN:'secret' }; }],
  ['entry environment file', c => { c.services.entry.env_file = ['secret.env']; }],
  ['entry secret mount', c => { c.services.entry.volumes.push(c.services.app.volumes[1]); }],
  ['entry production source bind', c => { c.services.entry.volumes[0].source = 'C:/production/entry.mjs'; }],
  ['entry relative source bind', c => { c.services.entry.volumes[0].source = './v4-http-entry.mjs'; }],
  ['entry writable bind', c => { c.services.entry.volumes[0].read_only = false; }],
  ['entry bind autocreate', c => { c.services.entry.volumes[0].bind.create_host_path = true; }],
  ['entry bind propagation', c => { c.services.entry.volumes[0].bind.propagation = 'rshared'; }],
  ['entry root', c => { c.services.entry.user = '0:0'; }],
  ['entry writable rootfs', c => { c.services.entry.read_only = false; }],
  ['entry extra capability', c => { c.services.entry.cap_add = ['NET_ADMIN']; }],
  ['entry missing caps drop', c => { delete c.services.entry.cap_drop; }],
  ['entry privileges escalation', c => { c.services.entry.security_opt = []; }],
  ['entry no PID limit', c => { delete c.services.entry.pids_limit; }],
  ['entry excessive PID limit', c => { c.services.entry.pids_limit = 128; }],
  ['entry IPv4 forwarding', c => { c.services.entry.sysctls['net.ipv4.ip_forward'] = '1'; }],
  ['entry IPv6 forwarding', c => { c.services.entry.sysctls['net.ipv6.conf.all.forwarding'] = '1'; }],
  ['entry extra sysctl', c => { c.services.entry.sysctls['net.ipv4.conf.all.proxy_arp'] = '1'; }],
  ['entry extra port', c => { c.services.entry.ports.push({...c.services.entry.ports[0],published:'3306'}); }],
  ['entry wrong upstream port', c => { c.services.entry.ports[0].target = 3000; }],
  ['entry healthcheck command injection', c => { c.services.entry.healthcheck.test = ['CMD-SHELL','curl example.com']; }],
  ['app healthcheck command injection', c => { c.services.app.healthcheck.test.push('injected'); }],
  ['PG healthcheck command injection', c => { c.services.postgres.healthcheck.test[1] += '; malicious'; }],
  ['entry missing health dependency', c => { c.services.entry.depends_on = {}; }],
  ['entry wrong health dependency', c => { c.services.entry.depends_on.postgres = {condition:'service_healthy'}; }],
  ['entry unhealthy dependency accepted', c => { c.services.entry.depends_on.app.condition = 'service_started'; }],
  ['entry dependency optional', c => { c.services.entry.depends_on.app.required = false; }],
  ['entry healthcheck unknown option', c => { c.services.entry.healthcheck.disable = true; }],
  ['PG injected runtime user', c => { c.services.postgres.user = '0:0'; }],
);
for (const [name, mutate] of invalid) test(`reject ${name}`, () => {
  const config = fixture();
  mutate(config);
  assert.throws(() => checkV4Isolation(config), /V4_ISOLATION_/);
});

test('CLI fails closed and never prints credentials', () => {
  const directory = mkdtempSync(join(tmpdir(), 'incept-v4-isolation-'));
  try {
    const file = join(directory, 'compose.json');
    const config = fixture();
    writeFileSync(file, JSON.stringify(config));
    const script = new URL('./check-v4-isolation.mjs', import.meta.url);
    const invoke = () => spawnSync(process.execPath, [fileURLToPath(script), file], { encoding: 'utf8' });
    assert.equal(invoke().status, 0);
    config.services.app.environment.INCEPT_SYNC_REMOTE_ENABLED = '1';
    writeFileSync(file, JSON.stringify(config));
    const result = invoke();
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout + result.stderr, /isolated_acceptance_password/);
    writeFileSync(file, '{bad json');
    assert.equal(invoke().status, 1);
    writeFileSync(file, JSON.stringify(template));
    assert.equal(invoke().status, 1);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
