"""Read-only production resource/identity sampling; no configuration or data writes."""
import datetime
import json
import os
import shutil
import subprocess

def command(args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=20, check=True)
    return result.stdout

memory = {}
with open('/proc/meminfo', encoding='utf-8') as source:
    for line in source:
        key, value = line.split(':', 1)
        memory[key] = int(value.strip().split()[0]) * 1024
names = command(['docker', 'ps', '-a', '--format', '{{.Names}}']).splitlines()
containers = []
for name in names:
    if not name.startswith('incept'):
        continue
    item = json.loads(command(['docker', 'inspect', name]))[0]
    containers.append({
        'name': name, 'id': item['Id'], 'image': item['Image'],
        'status': item['State']['Status'], 'health': item['State'].get('Health', {}).get('Status'),
        'restarts': item['RestartCount'], 'user': item['Config'].get('User'),
        'readOnlyRoot': item['HostConfig'].get('ReadonlyRootfs'),
        'mounts': [{'destination': m['Destination'], 'source': m.get('Source'), 'writable': m['RW']} for m in item['Mounts']],
    })
space = shutil.disk_usage('/srv/incept')
required = 1536 * 1024 * 1024
report = {
    'capturedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'host': os.environ.get('INCEPT_PRODUCTION_HOST', '<production-host>'), 'readOnly': True, 'remoteMutationsExecuted': False,
    'engineVersion': json.loads(command(['docker', 'version', '--format', '{{json .Server}}']))['Version'],
    'composeVersion': command(['docker', 'compose', 'version', '--short']).strip(),
    'memoryTotalBytes': memory['MemTotal'], 'memoryAvailableBytes': memory['MemAvailable'],
    'memoryRequiredAvailableBytes': required, 'memoryGatePassed': memory['MemAvailable'] >= required,
    'diskFreeBytes': space.free, 'diskGatePassed': space.free >= 2 * 1024**3,
    'port3305Listening': ':3305 ' in command(['ss', '-H', '-ltn']),
    'containers': containers,
    'releaseDecision': 'NO-GO',
}
print(json.dumps(report, ensure_ascii=False))
