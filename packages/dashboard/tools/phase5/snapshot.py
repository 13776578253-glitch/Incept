"""Phase 5 source snapshot. Excludes runtime data, credentials and build output."""
import hashlib, json, pathlib, subprocess, tarfile
root = pathlib.Path.cwd().resolve()
output = root / '.scratch/sync-agent-phase5'
output.mkdir(parents=True, exist_ok=True)
paths = subprocess.check_output(['git', '-c', 'core.fsmonitor=false', 'ls-files', '-z', '--cached', '--others', '--exclude-standard']).decode().split('\0')
excluded = {'.git', '.agents', '.codex', '.aws', '.commandcode', '.worktrees', '.pnpm-store', 'node_modules', '.next', 'dist', 'generated', '.scratch', '.playwright-cli', '.docs-import-drafts', '.docs-media', 'output'}
entries = []
with tarfile.open(output / 'source.tar', 'w') as archive:
    for name in sorted(set(filter(None, paths))):
        path = pathlib.PurePosixPath(name)
        if any(p in excluded for p in path.parts): continue
        if path.name.startswith(('.env', 'token-export-', 'dashboard-imports.db', 'dashboard-snapshots.json')) or path.name.endswith(('.tsbuildinfo', '.log', '.dpapi')) or path.name == 'dashboard.local.json': continue
        if name.startswith(('apps/web/public/_docs-media/', 'apps/web/public/_music-media/', 'apps/web/public/mock/audio/', 'apps/web/src/features/docs/importer/docs-push/')): continue
        absolute = (root / name).resolve()
        if not absolute.is_relative_to(root) or not absolute.is_file(): continue
        archive.add(absolute, arcname=name, recursive=False)
        entries.append({'path': name, 'sha256': hashlib.sha256(absolute.read_bytes()).hexdigest()})
(output / 'source-files.json').write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps({'files': len(entries), 'bytes': (output / 'source.tar').stat().st_size}))
