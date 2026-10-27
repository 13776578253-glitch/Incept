"""Explicitly approved fixed-snapshot display deployment. No migrations or Agent work."""
import datetime
import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tarfile

RELEASE = '/srv/incept/releases/v4-20261020-display'
BACKUP = '/srv/incept/backups/v2-before-v4-20261020-display'
APP = 'incept-app-1'
PG = 'incept-postgres-1'
EXPECTED_OLD = 'sha256:e4b13d8ca5bfb3779eff1b8d65e44a364506e7e7732727ee1cac91733f2e8276'

def run(args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, timeout=kwargs.pop('timeout', 120), **kwargs).stdout

def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def write(name, value):
    with open(name, 'x', encoding='utf-8') as f:
        json.dump(value, f, indent=2)
        f.write('\n')
    os.chmod(name, 0o600)

def inspect(name):
    return json.loads(run(['docker', 'inspect', name]))[0]

def compose(plan, files=None):
    args = ['docker', 'compose', '--project-name', 'incept', '--env-file', plan['envFile'], '--profile', 'sync']
    for path in files or plan['composeFiles']:
        args += ['-f', path]
    return args

def pg_identity():
    env = dict(v.split('=', 1) for v in inspect(PG)['Config']['Env'] if '=' in v)
    db, user = env.get('POSTGRES_DB', 'incept'), env['POSTGRES_USER']
    sql = """SELECT json_build_object('database',current_database(),'user',current_user,
      'systemIdentifier',(SELECT system_identifier::text FROM pg_control_system()),
      'agentIdentityHash',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t)-'lastUsedAt'-'updatedAt' ORDER BY id)::text,'')) FROM agent_devices t),
      'ownerIdentityHash',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t)-'updatedAt' ORDER BY id)::text,'')) FROM owner_accounts t));"""
    result = json.loads(run(['docker', 'exec', '-i', PG, 'psql', '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-U', user, '-d', db], input=sql.encode()))
    return result, db, user

def backup():
    assert not os.path.exists(BACKUP) and not os.path.exists(RELEASE), 'DEPLOYMENT_TARGET_EXISTS'
    app = inspect(APP)
    assert app['Image'] == EXPECTED_OLD and app['State']['Health']['Status'] == 'healthy', 'V2_IDENTITY_CHANGED'
    assert os.path.realpath('/srv/incept') == '/srv/incept'
    data = next(m['Source'] for m in app['Mounts'] if m['Destination'] == '/data')
    size = int(run(['du', '-sb', data]).split()[0])
    assert shutil.disk_usage('/srv/incept').free >= size + 3 * 1024**3, 'BACKUP_DISK_HEADROOM'
    with open('/proc/meminfo') as f:
        mem = {k: int(v.strip().split()[0]) * 1024 for k, v in (line.split(':', 1) for line in f)}
    # A replacement, not another always-on App; cap transient preparation memory.
    assert mem['MemAvailable'] >= 640 * 1024**2 and mem['SwapFree'] >= 512 * 1024**2, 'REPLACEMENT_MEMORY_HEADROOM'
    os.makedirs(BACKUP, mode=0o700)
    os.makedirs(RELEASE, mode=0o700)
    os.makedirs(RELEASE + '/uploads', mode=0o700)
    labels = app['Config']['Labels']
    plan = {'oldImage': app['Image'], 'dataDirectory': data,
            'composeFiles': labels['com.docker.compose.project.config_files'].split(','),
            'envFile': labels['com.docker.compose.project.environment_file'],
            'workingDirectory': labels['com.docker.compose.project.working_dir']}
    write(BACKUP + '/app-inspect.json', app)
    identity, db, user = pg_identity()
    write(BACKUP + '/postgres-identity.json', identity)
    others = {n: inspect(n) for n in ['incept-proxy-1', PG, 'incept-sync-gateway-1']}
    write(BACKUP + '/protected-containers.json', others)
    original_files = list(dict.fromkeys(plan['composeFiles'] + [plan['envFile'], '/srv/incept/current/deployment/Caddyfile', '/srv/incept/current/deployment/compose.sh']))
    plan['protectedConfigHashes'] = {p: sha(p) for p in original_files}
    os.mkdir(BACKUP + '/config', 0o700)
    for index, path in enumerate(original_files):
        shutil.copy2(path, BACKUP + '/config/' + str(index) + '-' + os.path.basename(path))
    rendered = run(compose(plan) + ['config', '--format', 'json'], cwd=plan['workingDirectory'])
    write(BACKUP + '/compose-before.json', json.loads(rendered))
    write(BACKUP + '/rollback-image.json', {'services': {'app': {'image': app['Image']}}})
    rollback_render = json.loads(run(compose(plan, plan['composeFiles'] + [BACKUP + '/rollback-image.json']) + ['config', '--format', 'json'], cwd=plan['workingDirectory']))
    before_render = json.loads(rendered)
    # Only pin the exact already-running image for rollback.
    rollback_render['services']['app']['image'] = before_render['services']['app']['image']
    assert rollback_render['services'] == before_render['services'], 'ROLLBACK_CONFIG_NOT_EQUIVALENT'
    write(BACKUP + '/plan.json', plan)
    with open(BACKUP + '/v2-app-image.tar', 'xb') as f:
        subprocess.run(['docker', 'image', 'save', app['Image']], stdout=f, check=True, timeout=600)
    with tarfile.open(BACKUP + '/v2-app-image.tar') as tar:
        assert tar.getmember('manifest.json').isfile()
        saved = json.load(tar.extractfile('manifest.json'))
        assert len(saved) >= 1 and saved[0]['Layers'], 'OLD_IMAGE_BACKUP_INVALID'
    with open(BACKUP + '/shared-data.tar', 'xb') as f:
        subprocess.run(['tar', '--one-file-system', '-C', data, '-cpf', '-', '.'], stdout=f, check=True, timeout=600)
    with tarfile.open(BACKUP + '/shared-data.tar') as tar:
        assert len(tar.getmembers()) > 0
    os.mkdir(BACKUP + '/sqlite', 0o700)
    sqlites = []
    for relative in ['sync/v2.db', 'dashboard/imports.db']:
        source = os.path.join(data, relative)
        if not os.path.isfile(source):
            assert relative != 'sync/v2.db', 'ORIGINAL_V2_DATABASE_MISSING'
            continue
        destination = BACKUP + '/sqlite/' + relative.replace('/', '-')
        src = sqlite3.connect('file:' + source + '?mode=ro', uri=True)
        dst = sqlite3.connect(destination)
        try:
            src.backup(dst)
            assert dst.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
            sqlites.append({'source': source, 'backup': destination, 'integrity': 'ok', 'sha256': sha(destination)})
        finally:
            dst.close()
            src.close()
    with open(BACKUP + '/production.pgdump', 'xb') as f:
        subprocess.run(['docker', 'exec', PG, 'pg_dump', '-U', user, '-d', db, '-Fc'], stdout=f, check=True, timeout=300)
    with open(BACKUP + '/production.pgdump', 'rb') as f:
        listing = run(['docker', 'exec', '-i', PG, 'pg_restore', '--list'], stdin=f)
        assert b'TABLE DATA' in listing, 'PG_BACKUP_NO_DATA'
    with open(BACKUP + '/postgres-globals.sql', 'xb') as f:
        subprocess.run(['docker', 'exec', PG, 'pg_dumpall', '-U', user, '--globals-only'], stdout=f, check=True, timeout=120)
    files = []
    for directory, _, names in os.walk(BACKUP):
        for name in names:
            path = os.path.join(directory, name)
            os.chmod(path, 0o600)
            files.append({'path': os.path.relpath(path, BACKUP), 'bytes': os.path.getsize(path), 'sha256': sha(path)})
    assert pg_identity()[0] == identity, 'PG_IDENTITY_CHANGED_DURING_BACKUP'
    assert all(sha(p) == value for p, value in plan['protectedConfigHashes'].items())
    result = {'status': 'backup_verified', 'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'backupDirectory': BACKUP,
              'releaseDirectory': RELEASE, 'files': files, 'sqliteSnapshots': sqlites, 'postgresIdentity': identity,
              'rollbackConfigEquivalent': True, 'originalDataRetained': True, 'originalAppStillHealthy': inspect(APP)['State']['Health']['Status'] == 'healthy'}
    write(BACKUP + '/BACKUP-MANIFEST.json', result)
    print(json.dumps({'status': result['status'], 'backupDirectory': BACKUP, 'files': len(files), 'sqliteSnapshots': len(sqlites), 'postgresBackupReadable': True, 'appHealthy': result['originalAppStillHealthy']}))

def rollback():
    plan = json.load(open(BACKUP + '/plan.json'))
    assert all(sha(p) == value for p, value in plan['protectedConfigHashes'].items()), 'ORIGINAL_CONFIG_CHANGED'
    args = compose(plan, plan['composeFiles'] + [BACKUP + '/rollback-image.json'])
    run(args + ['up', '-d', '--no-deps', '--pull', 'never', '--wait', '--wait-timeout', '120', 'app'], cwd=plan['workingDirectory'], timeout=180)
    app = inspect(APP)
    assert app['Image'] == plan['oldImage'] and app['State']['Health']['Status'] == 'healthy', 'ROLLBACK_FAILED'
    print(json.dumps({'status': 'rolled_back', 'image': app['Image'], 'originalDataRestoredByUnchangedMount': True}))

if __name__ == '__main__':
    os.umask(0o077)
    {'backup': backup, 'rollback': rollback}[sys.argv[1]]()
