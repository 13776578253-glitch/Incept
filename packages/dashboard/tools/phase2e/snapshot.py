import hashlib, json, pathlib, subprocess, tarfile
root=pathlib.Path.cwd().resolve()
paths=subprocess.check_output(['git','-c','core.fsmonitor=false','ls-files','-z','--cached','--others','--exclude-standard']).decode('utf8').split('\0')
excluded_dirs={'.git','.agents','.codex','.commandcode','.worktrees','.pnpm-store','node_modules','.next','dist','generated','.scratch','.playwright-cli','.docs-import-drafts','.docs-media','output'}
entries=[]
with tarfile.open(root/'.scratch/sync-agent-phase2e/source.tar','w') as archive:
    for name in sorted(set(filter(None,paths))):
        path=pathlib.PurePosixPath(name)
        if any(p in excluded_dirs for p in path.parts): continue
        if path.name.startswith('.env') or path.name.endswith(('.tsbuildinfo','.log')): continue
        if path.name in {'dashboard.local.json'} or path.name.startswith(('token-export-','dashboard-imports.db','dashboard-snapshots.json')): continue
        if name.startswith(('apps/web/public/_docs-media/','apps/web/public/_music-media/','apps/web/public/mock/audio/','apps/web/src/features/docs/importer/docs-push/')): continue
        absolute=(root/name).resolve()
        if not absolute.is_relative_to(root) or not absolute.is_file(): continue
        archive.add(absolute,arcname=name,recursive=False)
        entries.append({'path':name,'sha256':hashlib.sha256(absolute.read_bytes()).hexdigest()})
(root/'.scratch/sync-agent-phase2e/source-files.json').write_text(json.dumps(entries,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'files':len(entries),'archiveBytes':(root/'.scratch/sync-agent-phase2e/source.tar').stat().st_size,'sha256':hashlib.sha256((root/'.scratch/sync-agent-phase2e/source.tar').read_bytes()).hexdigest(),'envFiles':sum(pathlib.PurePosixPath(e['path']).name.startswith('.env') for e in entries)}))
