"""Prepare a fixed v4 runtime and display cache, then replace only production App."""
import datetime
import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tarfile
import time
import urllib.request

R = '/srv/incept/releases/v4-20261020-display'
B = '/srv/incept/backups/v2-before-v4-20261020-display'
U = R + '/uploads'
MANIFEST_SHA = '9b0be432dcdea2fc88e00692ceff79f2452041b4cf03bb74c6b7fb4171cdf67e'
sys.path.insert(0, U)
from importlib.util import spec_from_file_location, module_from_spec
spec = spec_from_file_location('deployment_helpers', U + '/deploy-v4-display.py')
helpers = module_from_spec(spec)
spec.loader.exec_module(helpers)
run, sha, write, inspect, compose = helpers.run, helpers.sha, helpers.write, helpers.inspect, helpers.compose

CACHE_CODE = r"""
const fs=require('node:fs'),assert=require('node:assert/strict'),M=require('node:module'),{DatabaseSync}=require('node:sqlite');
const original=M._load;M._load=function(id,...args){return id==='server-only'?{}:original.call(this,id,...args)};
M.createRequire('/app/packages/db/package.json')('tsx/cjs/api').register();
const {projection}=require('/app/packages/dashboard/src/sync/projection.ts');
const {saveDashboardSnapshot,snapshotContext}=require('/app/packages/dashboard/src/adapters/runtime/snapshot-store.ts');
(async()=>{
 const db=new DatabaseSync(process.env.INCEPT_SYNC_DATABASE_FILE,{readOnly:true});db.exec('PRAGMA query_only=ON');
 try{
 const counts=db.prepare('SELECT COUNT(*) scopes,SUM(token_total) tokens FROM sync_scopes').get();
 assert.equal(counts.scopes,362);assert.equal(counts.tokens,4558021501);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM sync_receipts').get().n,362);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM sync_receipts WHERE json_extract(receipt_json,'$.status')='committed'").get().n,362);
 const devices=db.prepare("SELECT DISTINCT json_extract(scope_json,'$.deviceId') id FROM sync_origins").all();assert.deepEqual(devices.map(r=>r.id),[process.env.INCEPT_SYNC_DEVICE_ALLOWLIST]);
 const service={db,revision:()=>db.prepare('SELECT data_revision FROM sync_meta WHERE id=1').get().data_revision};
 const summary={counts:{...counts,receipts:362},ranges:{},databaseFile:process.env.INCEPT_SYNC_DATABASE_FILE,deviceId:devices[0].id,revision:service.revision()};
 for(const range of ['7d','14d','30d','all']){
  const data=projection(service,process.env.INCEPT_DASHBOARD_HOME,range,387,undefined);
  if(range==='all')assert.equal(data.totals.totalTokens,4558021501);
  assert.equal(data.sync.dataRevision,387);await saveDashboardSnapshot(data);
  summary.ranges[range]={tokens:data.totals.totalTokens,sessions:data.sessions.length,revision:data.sync.dataRevision};
 }
 summary.cacheContext=snapshotContext();fs.writeFileSync('/v4-display/projection-report.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
 }finally{db.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
"""

def verify_uploads():
    assert sha(U + '/RELEASE-MANIFEST.json') == MANIFEST_SHA, 'RELEASE_MANIFEST_HASH'
    manifest = json.load(open(U + '/RELEASE-MANIFEST.json'))
    assert manifest['snapshot']['scopes'] == 362 and manifest['snapshot']['receipts'] == 362 and manifest['snapshot']['tokens'] == 4558021501
    assert manifest['snapshot']['syntheticRowsImported'] == 0
    image = manifest['app']['archive']
    image_path = U + '/incept-v4-release-20261020-linux-amd64.tar'
    assert sha(image_path) == image['sha256'], 'APP_UPLOAD_HASH'
    data = next(row for row in manifest['artifacts'] if row['path'].replace('\\', '/').endswith('/v4-release.db'))
    assert sha(U + '/v4-release.db') == data['sha256'], 'DATABASE_UPLOAD_HASH'
    verification = json.load(open(U + '/v4-display-local-frozen-verification.json'))
    assert verification['allPassed'] and verification['manifestSha256'] == MANIFEST_SHA
    assert len(verification['artifacts']) == len(manifest['artifacts']) == 19
    return manifest, image_path

def identity(manifest, image):
    expected = manifest['app']['identity']
    with tarfile.open(U + '/incept-v4-release-20261020-linux-amd64.tar') as tar:
        def blob(digest):
            content = tar.extractfile('blobs/sha256/' + digest.split(':')[1]).read()
            assert 'sha256:' + hashlib.sha256(content).hexdigest() == digest
            return json.loads(content)
        index = blob(expected['manifestListDigest'])
        assert any(row['digest'] == expected['linuxPlatformManifestDigest'] and row.get('platform', {}).get('os') == 'linux' and row.get('platform', {}).get('architecture') == 'amd64' for row in index['manifests'])
        platform = blob(expected['linuxPlatformManifestDigest'])
        assert platform['config']['digest'] == expected['dockerImageConfigId']
        config = blob(expected['dockerImageConfigId'])
    item = json.loads(run(['docker', 'image', 'inspect', '--platform', 'linux/amd64', image]))[0]
    assert item['Id'] in [expected['manifestListDigest'], expected['linuxPlatformManifestDigest'], expected['dockerImageConfigId']]
    assert item['Os'] == 'linux' and item['Architecture'] == 'amd64'
    assert item['RootFS']['Layers'] == config['rootfs']['diff_ids']
    return {'expected': expected, 'platformInspectId': item['Id'], 'rootfsMatched': True}

def prepare():
    assert json.load(open(B + '/BACKUP-MANIFEST.json'))['status'] == 'backup_verified'
    manifest, archive = verify_uploads()
    run(['docker', 'load', '--input', archive], timeout=600)
    image = manifest['app']['identity']['manifestListDigest']
    verified = identity(manifest, image)
    write(R + '/image-identity.json', verified)
    os.makedirs(R + '/runtime/sync', mode=0o700)
    os.makedirs(R + '/runtime/display', mode=0o700)
    for p in [R + '/runtime', R + '/runtime/sync', R + '/runtime/display']:
        os.chown(p, 1000, 1000)
    shutil.copy2(U + '/v4-release.db', R + '/runtime/sync/v4.db')
    assert sha(R + '/runtime/sync/v4.db') == sha(U + '/v4-release.db')
    os.chown(R + '/runtime/sync/v4.db', 1000, 1000)
    os.chmod(R + '/runtime/sync/v4.db', 0o600)
    app = inspect('incept-app-1')
    assert app['Image'] == helpers.EXPECTED_OLD and app['State']['Health']['Status'] == 'healthy'
    old_env = dict(v.split('=', 1) for v in app['Config']['Env'] if '=' in v)
    display_env = {k: v for k, v in old_env.items() if k in ['INCEPT_DASHBOARD_HOME', 'INCEPT_DASHBOARD_IMPORTS_FILE', 'INCEPT_DASHBOARD_OVERRIDES_FILE', 'INCEPT_COMMANDCODE_CATALOG_FILE', 'INCEPT_SYNC_DEVICE_ALLOWLIST']}
    display_env.update({'INCEPT_SYNC_ENABLED': '1', 'INCEPT_SYNC_READ_MODE': 'v2', 'INCEPT_SYNC_TRUSTED_MODE': '1', 'INCEPT_SYNC_REMOTE_ENABLED': '0',
                        'INCEPT_SYNC_DATABASE_FILE': '/data/sync/v4.db', 'INCEPT_DASHBOARD_CACHE_FILE': '/v4-display/snapshots.json'})
    write(R + '/display-environment.json', display_env)
    args = ['docker', 'run', '--rm', '--pull', 'never', '--network', 'none', '--read-only', '--user', '1000:1000', '--memory', '640m', '--memory-swap', '768m', '--cpus', '1',
            '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--tmpfs', '/tmp:uid=1000,gid=1000,mode=1777,size=32m',
            '--mount', 'type=bind,source=' + json.load(open(B + '/plan.json'))['dataDirectory'] + ',target=/data,readonly',
            '--mount', 'type=bind,source=' + R + '/runtime/sync,target=/data/sync,readonly',
            '--mount', 'type=bind,source=' + R + '/runtime/display,target=/v4-display']
    for key, value in display_env.items():
        args += ['--env', key + '=' + value]
    args += ['--entrypoint', 'node', image, '--max-old-space-size=448', '-e', CACHE_CODE]
    # This transient data-to-display conversion has no network or PostgreSQL access.
    projection = json.loads(run(args, timeout=300))
    assert sha(R + '/runtime/sync/v4.db') == sha(U + '/v4-release.db'), 'READONLY_PROJECTION_CHANGED_DATABASE'
    plan = json.load(open(B + '/plan.json'))
    override = {'services': {'app': {'image': image, 'environment': display_env,
        'volumes': [{'type': 'bind', 'source': R + '/runtime/sync', 'target': '/data/sync'},
                    {'type': 'bind', 'source': R + '/runtime/display', 'target': '/v4-display'}]}}}
    write(R + '/compose.v4-display.json', override)
    rendered = json.loads(run(compose(plan, plan['composeFiles'] + [R + '/compose.v4-display.json']) + ['config', '--format', 'json'], cwd=plan['workingDirectory']))
    before = json.load(open(B + '/compose-before.json'))
    for service in before['services']:
        if service != 'app':
            assert before['services'][service] == rendered['services'][service], 'PROTECTED_SERVICE_CONFIG_CHANGED'
    assert rendered['services']['app']['environment']['DATABASE_URL'] == before['services']['app']['environment']['DATABASE_URL']
    assert rendered['services']['app']['environment']['INCEPT_AUTH_ENCRYPTION_KEY'] == before['services']['app']['environment']['INCEPT_AUTH_ENCRYPTION_KEY']
    old_mounts = {m['target']: m for m in before['services']['app']['volumes']}
    new_mounts = {m['target']: m for m in rendered['services']['app']['volumes']}
    assert all(new_mounts[k] == v for k, v in old_mounts.items()), 'ORIGINAL_MOUNT_CHANGED'
    write(R + '/compose-rendered-private.json', rendered)
    write(R + '/PREPARED.json', {'status': 'prepared', 'projection': projection, 'imageIdentity': verified, 'cacheSha256': sha(R + '/runtime/display/snapshots.json'), 'frozenDatabaseSha256': sha(U + '/v4-release.db'), 'protectedServicesUnchanged': True})
    print(json.dumps({'status': 'prepared', 'tokens': projection['counts']['tokens'], 'scopes': projection['counts']['scopes'], 'receipts': projection['counts']['receipts'], 'revision': projection['revision'], 'publicCacheGenerated': True, 'oldAppHealthy': inspect('incept-app-1')['State']['Health']['Status'] == 'healthy'}))

def switch():
    plan = json.load(open(B + '/plan.json'))
    assert json.load(open(R + '/PREPARED.json'))['status'] == 'prepared'
    assert all(sha(p) == value for p, value in plan['protectedConfigHashes'].items())
    expected_pg = json.load(open(B + '/postgres-identity.json'))
    assert helpers.pg_identity()[0] == expected_pg
    expected_others = json.load(open(B + '/protected-containers.json'))
    args = compose(plan, plan['composeFiles'] + [R + '/compose.v4-display.json'])
    try:
        run(args + ['up', '-d', '--no-deps', '--pull', 'never', '--wait', '--wait-timeout', '120', 'app'], cwd=plan['workingDirectory'], timeout=180)
        app = inspect('incept-app-1')
        manifest, _ = verify_uploads()
        expected_identity = manifest['app']['identity']
        assert app['Config']['Image'] == expected_identity['manifestListDigest'], 'RUNNING_IMAGE_REFERENCE_CHANGED'
        assert app['Image'] in [expected_identity['manifestListDigest'], expected_identity['linuxPlatformManifestDigest'], expected_identity['dockerImageConfigId']], 'RUNNING_IMAGE_ID_MISMATCH'
        verified = identity(manifest, expected_identity['manifestListDigest'])
        verified['containerImageId'] = app['Image']
        assert app['State']['Health']['Status'] == 'healthy'
        env = dict(v.split('=', 1) for v in app['Config']['Env'] if '=' in v)
        assert env['INCEPT_SYNC_DATABASE_FILE'] == '/data/sync/v4.db' and env['INCEPT_SYNC_TRUSTED_MODE'] == '1' and env['INCEPT_SYNC_REMOTE_ENABLED'] == '0'
        actual = {m['Destination']: m['Source'] for m in app['Mounts']}
        assert actual['/data/sync'] == R + '/runtime/sync' and actual['/v4-display'] == R + '/runtime/display'
        check = r"""const fs=require('node:fs'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');(async()=>{const db=new DatabaseSync(process.env.INCEPT_SYNC_DATABASE_FILE,{readOnly:true});try{const c=db.prepare('SELECT COUNT(*) scopes,SUM(token_total) tokens FROM sync_scopes').get();assert.equal(c.scopes,362);assert.equal(c.tokens,4558021501);assert.equal(db.prepare('SELECT COUNT(*) n FROM sync_receipts').get().n,362);const ready=await fetch('http://127.0.0.1:3000/api/health/ready');assert(ready.ok);const usage=await fetch('http://127.0.0.1:3000/api/dashboard/usage?range=all');assert(usage.ok);const data=await usage.json();assert.equal(data.totals.totalTokens,4558021501);const page=await fetch('http://127.0.0.1:3000/en/dashboard');assert(page.ok);console.log(JSON.stringify({scopes:c.scopes,receipts:362,tokens:c.tokens,revision:db.prepare('SELECT data_revision FROM sync_meta').get().data_revision,healthStatus:ready.status,usageStatus:usage.status,dashboardStatus:page.status,publicTokens:data.totals.totalTokens}));}finally{db.close();}})().catch(e=>{console.error(e);process.exitCode=1});"""
        result = json.loads(run(['docker', 'exec', 'incept-app-1', 'node', '-e', check], timeout=120))
        assert sha(R + '/runtime/sync/v4.db') == sha(U + '/v4-release.db'), 'RUNTIME_SNAPSHOT_CHANGED'
        proxy_env = dict(v.split('=', 1) for v in inspect('incept-proxy-1')['Config']['Env'] if '=' in v)
        domain = proxy_env.get('INCEPT_DOMAIN', '').strip()
        assert domain and '/' not in domain, 'PUBLIC_DOMAIN_UNAVAILABLE'
        with urllib.request.urlopen('https://' + domain + '/api/dashboard/usage?range=all', timeout=30) as response:
            public_data = json.load(response)
            assert response.status == 200 and public_data['totals']['totalTokens'] == 4558021501, 'PUBLIC_DASHBOARD_TOTAL_MISMATCH'
        with urllib.request.urlopen('https://' + domain + '/en/dashboard', timeout=30) as response:
            assert response.status == 200, 'PUBLIC_DASHBOARD_PAGE_FAILED'
        result['publicUrl'] = 'https://' + domain + '/en/dashboard'
        result['publicHttpsTokens'] = public_data['totals']['totalTokens']
        assert all(inspect(n)['Id'] == value['Id'] and inspect(n)['Image'] == value['Image'] for n, value in expected_others.items()), 'PROTECTED_CONTAINER_REPLACED'
        assert helpers.pg_identity()[0] == expected_pg, 'PG_IDENTITY_CHANGED'
        assert all(sha(p) == value for p, value in plan['protectedConfigHashes'].items()), 'ORIGINAL_CONFIG_CHANGED'
        report = {'status': 'switched_and_checked', 'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'image': verified, 'appContainerId': app['Id'],
                  'checks': result, 'postgresIdentityUnchanged': True, 'caddyAndGatewayUnchanged': True, 'originalConfigUnchanged': True,
                  'v2DataRetained': True, 'formalAgentStarted': False, 'formalStateModified': False,
                  'stats': run(['docker', 'stats', '--no-stream', '--format', '{{.Name}} {{.MemUsage}} {{.CPUPerc}}']).decode(), 'backupDirectory': B, 'releaseDirectory': R}
        write(R + '/SWITCH-RESULT.json', report)
        print(json.dumps(report))
    except Exception as error:
        # Diagnostic failure must never prevent the pinned original App rollback.
        try:
            try:
                write(R + '/SWITCH-FAILURE.json', {'type': type(error).__name__, 'reason': str(error), 'at': datetime.datetime.now(datetime.timezone.utc).isoformat()})
            except Exception:
                pass
            try:
                with open(R + '/failed-app.log', 'wb') as f:
                    subprocess.run(['docker', 'logs', '--tail', '250', 'incept-app-1'], stdout=f, stderr=subprocess.STDOUT, timeout=20)
            except Exception:
                pass
        finally:
            helpers.rollback()
        raise

if __name__ == '__main__':
    os.umask(0o077)
    {'prepare': prepare, 'switch': switch}[sys.argv[1]]()
