import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const ENV_FILES = [path.join('apps', 'web', '.env.local'), path.join('packages', 'db', '.env')];
const WORKTREES_DIRECTORY = '.worktrees';
const MANAGED_DIRECTORY_PREFIX = 'Incept-';
const MANAGED_BRANCH_PREFIX = 'feature/';
const REGISTRY_DIRECTORY = '.agents';
const REGISTRY_FILE = path.join(REGISTRY_DIRECTORY, 'worktree.json');
const RULES_FILE = path.join(REGISTRY_DIRECTORY, 'worktree-rules.md');
const PLANS_DIRECTORY = path.join(REGISTRY_DIRECTORY, 'plans');
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const BRANCH_PATTERN = /^[A-Za-z0-9._/-]+$/;
const SCHEMA_PATTERN = /^[a-z_][a-z0-9_]*$/;
const DATABASE_URL_LINE = /^(?<prefix>[^\r\n]*?DATABASE_URL[^\r\n]*?=\s*)(?<quote>["']?)(?<url>[^"'\r\n]+)\k<quote>[^\r\n]*$/m;

function printUsage() {
  console.log('Usage:');
  console.log('  pnpm wt:new <name> [--base <ref>] [--branch <name>] [--existing-branch] [--port <n>] [--db-schema <name>] [--no-install] [--no-fetch] [--accept-base-mismatch]');
  console.log('  pnpm wt:adopt <name> --base <ref> [--branch <name>]');
  console.log('  pnpm wt:status');
  console.log('  pnpm wt:remove <name> [--force] [--keep-branch]');
}

function parseArgs(argv) {
  const [command = '', ...rest] = argv;
  const args = {
    command,
    name: '',
    force: false,
    existingBranch: false,
    noInstall: false,
    noFetch: false,
    keepBranch: false,
    acceptBaseMismatch: false,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];

    if (value === '--force') {
      args.force = true;
      continue;
    }

    if (value === '--existing-branch') {
      args.existingBranch = true;
      continue;
    }

    if (value === '--no-install') {
      args.noInstall = true;
      continue;
    }

    if (value === '--no-fetch') {
      args.noFetch = true;
      continue;
    }

    if (value === '--keep-branch') {
      args.keepBranch = true;
      continue;
    }

    if (value === '--accept-base-mismatch') {
      args.acceptBaseMismatch = true;
      continue;
    }

    if (value.startsWith('--')) {
      args[value.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = rest[index + 1] ?? '';
      index += 1;
      continue;
    }

    if (!args.name) {
      args.name = value;
    }
  }

  return args;
}

function runGit(args, { cwd = projectRoot, allowFailure = false } = {}) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });

  if (result.error) {
    throw new Error(`git ${args.join(' ')} could not be executed: ${result.error.message}`);
  }

  if (!allowFailure && result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`git ${args.join(' ')} failed: ${detail}`);
  }

  return result;
}

function gitOutput(args, options) {
  return runGit(args, options).stdout.trim();
}

function runPnpm(args, cwd) {
  console.log('');
  console.log(`> pnpm ${args.join(' ')} (in ${cwd})`);
  const result = spawnSync('pnpm', args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });

  if (result.status !== 0) {
    throw new Error(`pnpm ${args.join(' ')} failed in ${cwd}.`);
  }
}

function normalizePath(value) {
  const resolved = path.resolve(value).replace(/\\/g, '/');
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function samePath(left, right) {
  return normalizePath(left) === normalizePath(right);
}

function shortCommit(commit) {
  return commit.slice(0, 7);
}

function repositoryRoot() {
  return gitOutput(['rev-parse', '--show-toplevel']);
}

function readWorktrees() {
  const entries = [];
  let current = null;

  for (const line of gitOutput(['worktree', 'list', '--porcelain']).split('\n')) {
    if (line.startsWith('worktree ')) {
      current = { path: line.slice('worktree '.length), head: '', branch: null, detached: false };
      entries.push(current);
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length);
    }

    if (line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
    }

    if (line === 'detached') {
      current.detached = true;
    }
  }

  return entries;
}

function mainWorktreePath() {
  return readWorktrees()[0].path;
}

function currentWorktreePath() {
  return gitOutput(['rev-parse', '--show-toplevel'], { cwd: process.cwd() });
}

function assertManagedName(name) {
  if (!name) {
    throw new Error('A worktree name is required.');
  }

  if (!NAME_PATTERN.test(name)) {
    throw new Error(`Worktree name "${name}" must match ^[a-z0-9][a-z0-9-]*$ (for example "music").`);
  }
}

function assertMainWorktree(command) {
  const current = currentWorktreePath();
  const main = mainWorktreePath();

  if (!samePath(current, main)) {
    throw new Error(`${command} must run from the main worktree (${main}). Current worktree: ${current}.`);
  }
}

function managedWorktreePath(name) {
  return path.join(repositoryRoot(), WORKTREES_DIRECTORY, name);
}

function resolveExistingManagedWorktree(name) {
  const primaryTarget = managedWorktreePath(name);
  const worktrees = readWorktrees();
  const directMatch = worktrees.find((candidate) => samePath(candidate.path, primaryTarget));

  if (directMatch) {
    return { path: directMatch.path, entry: directMatch };
  }

  const legacyTarget = path.join(path.dirname(repositoryRoot()), `${MANAGED_DIRECTORY_PREFIX}${name}`);
  const legacyMatch = worktrees.find((candidate) => samePath(candidate.path, legacyTarget));

  if (legacyMatch) {
    return { path: legacyMatch.path, entry: legacyMatch };
  }

  return { path: primaryTarget, entry: null };
}

function managedBranch(name) {
  return `${MANAGED_BRANCH_PREFIX}${name}`;
}

function isManagedWorktreePath(candidate) {
  const root = normalizePath(repositoryRoot());
  const target = normalizePath(candidate);
  const worktreesDir = `${root}/${WORKTREES_DIRECTORY}`;

  if (path.dirname(target) === worktreesDir) {
    return true;
  }

  const parent = normalizePath(path.dirname(repositoryRoot()));
  const base = path.basename(target).toLowerCase();
  return path.dirname(target) === parent && base.startsWith(MANAGED_DIRECTORY_PREFIX.toLowerCase());
}

function listBranchNames() {
  const names = gitOutput(['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes'])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((name) => !name.endsWith('/HEAD'));

  return [...new Set(names)];
}

function localBranchExists(branch) {
  return runGit(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { allowFailure: true }).status === 0;
}

function resolveCommit(ref) {
  const result = runGit(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { allowFailure: true });

  if (result.status !== 0) {
    const candidates = listBranchNames().filter((name) => name.includes(ref)).slice(0, 5);
    const hint = candidates.length > 0 ? ` Existing branches containing "${ref}": ${candidates.join(', ')}.` : '';
    throw new Error(`Base ref "${ref}" cannot be resolved.${hint} The command stops here and never falls back to another base.`);
  }

  return result.stdout.trim();
}

function maskCredentials(url) {
  return url.replace(/\/\/([^:/@]+):[^@]*@/, '//$1:***@');
}

function rewriteSchema(content, schema) {
  if (!SCHEMA_PATTERN.test(schema)) {
    throw new Error(`--db-schema "${schema}" must match ^[a-z_][a-z0-9_]*$ (for example "wt_login").`);
  }

  const match = content.match(DATABASE_URL_LINE);

  if (!match) {
    return { changed: false, reason: 'DATABASE_URL was not found' };
  }

  const url = match.groups.url;

  if (!/^postgres(ql)?:\/\//i.test(url)) {
    return { changed: false, reason: 'the URL is not a postgres:// or postgresql:// URL' };
  }

  if (!/[?&]schema=/.test(url)) {
    return { changed: false, reason: 'the URL has no schema parameter (?schema= or &schema=) to rewrite' };
  }

  const nextUrl = url.replace(/([?&]schema=)[^&\s]*/, `$1${schema}`);
  const nextContent = content.replace(match[0], `${match.groups.prefix}${match.groups.quote}${nextUrl}${match.groups.quote}`);

  return { changed: true, content: nextContent, url: maskCredentials(nextUrl) };
}

function planEnvironmentFiles(targetPath, dbSchema) {
  const files = [];
  const warnings = [];

  for (const relativePath of ENV_FILES) {
    const sourcePath = path.join(projectRoot, relativePath);
    const targetFile = path.join(targetPath, relativePath);

    if (!existsSync(sourcePath)) {
      warnings.push(`${relativePath} is missing in the main checkout; configure it manually in the new worktree`);
      continue;
    }

    const content = readFileSync(sourcePath, 'utf8');

    if (!dbSchema) {
      files.push({ targetFile, content });
      continue;
    }

    const rewritten = rewriteSchema(content, dbSchema);

    if (!rewritten.changed) {
      throw new Error(`--db-schema ${dbSchema} cannot be applied to ${relativePath}: ${rewritten.reason}. Nothing was created; configure DATABASE_URL manually instead of letting the script guess.`);
    }

    files.push({ targetFile, content: rewritten.content });
    console.log(`Schema rewrite: ${relativePath} -> ${rewritten.url}`);
  }

  return { files, warnings };
}

function resolveWorktreeBase(args) {
  if (args.base) {
    return { ref: args.base, sha: resolveCommit(args.base) };
  }

  if (!args.noFetch) {
    const fetch = runGit(['fetch', 'origin'], { allowFailure: true });

    if (fetch.status !== 0) {
      console.log('WARNING: git fetch origin failed; continuing with the current origin/main state.');
    }
  }

  const related = listBranchNames().filter((candidate) => candidate.toLowerCase().includes(args.name.toLowerCase()));

  if (related.length > 0) {
    throw new Error(`No --base was given, but branches related to "${args.name}" exist: ${related.join(', ')}. Continuation work must state its base explicitly, for example: pnpm wt:new ${args.name} --base <ref>.`);
  }

  const names = listBranchNames();
  const defaultBase = names.includes('origin/main') ? 'origin/main' : 'main';

  return { ref: defaultBase, sha: resolveCommit(defaultBase) };
}

function describeBaseRelation(base, branch, branchSha) {
  if (branchSha === base.sha) {
    console.log(`Existing branch ${branch} head matches base ${base.ref} @ ${shortCommit(base.sha)}.`);
    return;
  }

  const descends = runGit(['merge-base', '--is-ancestor', base.sha, branchSha], { allowFailure: true }).status === 0;

  if (descends) {
    const ahead = gitOutput(['rev-list', '--count', `${base.sha}..${branchSha}`]);
    console.log(`WARNING: existing branch ${branch} is ${ahead} commit(s) ahead of base ${base.ref} @ ${shortCommit(base.sha)}.`);
    return;
  }

  throw new Error(`Existing branch ${branch} does not descend from base ${base.ref} @ ${shortCommit(base.sha)}. Nothing was created. Re-run with --accept-base-mismatch only if you are certain.`);
}

function isMergedIntoOriginMain(branch) {
  return runGit(['merge-base', '--is-ancestor', branch, 'origin/main'], { allowFailure: true }).status === 0;
}

function defaultPort() {
  const managed = readWorktrees().filter((entry) => isManagedWorktreePath(entry.path)).length;
  return 3000 + managed + 1;
}

function readRegistry(worktreePath) {
  const registryPath = path.join(worktreePath, REGISTRY_FILE);

  if (!existsSync(registryPath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(registryPath, 'utf8'));
  } catch {
    return null;
  }
}

function writeRegistration(registry) {
  const directory = path.join(registry.path, REGISTRY_DIRECTORY);
  mkdirSync(directory, { recursive: true });
  // 计划写在 worktree 自己的 .agents/ 里（已被 gitignore），随 worktree 销毁。
  // 预先建出来，让功能 AI 一眼看到它该写哪，而不是去写 docs/plans/。
  mkdirSync(path.join(registry.path, PLANS_DIRECTORY), { recursive: true });
  writeFileSync(path.join(registry.path, REGISTRY_FILE), `${JSON.stringify(registry, null, 2)}\n`);
  writeFileSync(path.join(registry.path, RULES_FILE), buildRules(registry));
}

function buildRules(registry) {
  return `# Worktree Rules

Branch: ${registry.branch}
Base: ${registry.baseRef} @ ${shortCommit(registry.baseSha)}
Path: ${registry.path}
Dev port: ${registry.port}
Database schema: ${registry.dbSchema ?? 'public (shared with the main checkout)'}

## 你的身份与共用规则

这个 worktree 与这条分支由一个**名称**唯一标识（分支同刻只能被一个 worktree 签出）。

**可以多个执行 AI 共用一个 worktree**，但仅在两者同时成立时：

1. 各自负责的**区域互不重叠**（例如一个只改样式令牌与 CSS，一个只改某个组件；不是"都改前端"）
2. 开工前已把**边界声明**贴出来（见下一节）

不成立时就不要共用：默认仍是「一个 worktree 一个 AI，同一时间一个」。区域重叠、或边界说不清楚的，拆成两个 worktree。

共用时最容易出问题的是**提交**：多人交替提交会让 \`git log\` 失去可读性，也无法归属。各自提交时在信息里带上自己的区域。

## 开工前必须声明的边界

必须先贴出这段，再动任何文件。凡是无法填写的项，就是还没想清楚，先别开工。

\`\`\`text
AI:              <你自称的名字>
区域:            <你只改什么——具体到文件或目录>
不碰:            <你明确不碰什么>
共享资源:        <是否会用：pnpm dev / DB migration / docs:import / music:import>
                  用到哪个，就必须写它的具体值（端口 / schema 名 / 目标目录）
\`\`\`

## 跨 worktree 共享的东西（这些不受隔离保护）

隔离只覆盖**文件与分支**。以下资源在**所有 worktree 之间共享**，越界即互相破坏：

- **本 worktree 的 dev 端口**：上面 Dev port 就是分给你的。Next 在端口被占用时会**静默换一个**，你会对着另一个实例调试。永远显式指定 \`--port <上面那个值>\`。
- **数据库**：默认与主 checkout 共享 \`public\` schema，**同一时刻只能有一个 worktree 跑 \`db:deploy\` / \`db:migrate\`**。migration 属主控，未经明确授权不要跑。
- **仓库外的媒体目录**：\`DOCS_CONTENT_ROOT\` / \`MUSIC_CONTENT_ROOT\` 指向仓库外绝对路径，所有 worktree 共用一份。同时跑 \`docs:import\` / \`music:import\` / \`music:manifest\` 会互相覆盖。
- **git 的 refs / object store / hooks**：\`git push\`、\`git reset --hard\`、删分支会穿透隔离。这也是 push 与 merge 属于主控的原因。
- **\`.env\` 里的凭据**：\`DATABASE_URL\`、\`INCEPT_AUTH_ENCRYPTION_KEY\`、\`GITHUB_ACTIVITY_TOKEN\` 是真凭据。不得提交、不得传给外部 AI、不得贴进日志或工单。

## 开工自检（先执行，并把结果贴出来）

- \`pwd\`
- \`git branch --show-current\`
- \`git worktree list\`

确认你当前目录就是上面 Path，分支就是上面 Branch。若发现自己在主 worktree（仓库根目录），立即停止并报告。

## 允许

- 读写本目录内的文件
- 运行本仓库的检查命令
- \`git add\` / \`git commit\`（提交到本分支）

## 禁止（职责隔离：这些动作属于主控）

- \`git push\`（refs 与远端是共享的，push 会穿透 worktree 隔离）
- \`git merge\` / \`git rebase\` 到其它分支
- \`git checkout\` / \`git switch\` 换分支
- \`git worktree add\` / \`git worktree remove\`
- 在主 worktree 目录里工作
- 写 \`docs/plans/\`（那是主控的计划缓冲区。你的计划写在任务已经确定之后，且出自可能误读任务的同一个 AI，结构上抓不到这种误读；必须在执行前存在的计划属于主控）
- \`pnpm db:deploy\` / \`db:migrate\`（数据库默认与主 checkout 共享，未经主控明确授权不要跑 migration）

## 你的计划写在哪

写在 \`.agents/plans/\`（该目录已被 gitignore，随 worktree 一并销毁，不需要任何清理步骤）。

它记的是设计理由：为什么这样做、否决了哪些替代方案、执行中的发现。它是**执行记录**，不是给主控预先审阅的任务计划。

## 刻意未做与受阻的条目

**必须写进 \`docs/BACKLOG.md\`，不能只写在交付报告里。** 验收只看 git（工作树是否干净、领先基点多少、能否无冲突合并），明确不采信 AI 自述。只留在报告里的待办会随 worktree 一起消失。

同样，改动留下的 TODO 也照仓库规则处理：完成的在源码里改写为 \`history: <被什么取代>\`，未做成的进 \`BACKLOG.md\`。

## 提交要求

- 小步提交，信息沿用仓库风格（feat / fix / docs / refactor）
- 交付前工作区必须干净，不留未提交改动；未提交的改动会在回收时挡住 \`wt:remove\`

## 本仓库检查命令

\`\`\`powershell
pnpm typecheck
pnpm test
pnpm lint
\`\`\`

## 交付时向主控报告

- 分支名与本 worktree 路径
- \`git log --oneline ${registry.baseRef}..${registry.branch}\` 的结果
- 跑过的检查与结果
- 已知未完成项与风险
`;
}

function printPromptBlock(registry) {
  console.log('');
  console.log('Paste this prompt into the feature AI session:');
  console.log('---');
  console.log(`你在 worktree ${registry.path} 中工作，分支 ${registry.branch}。`);
  console.log('先读 .agents/worktree-rules.md，并执行开工自检：pwd / git branch --show-current / git worktree list。');
  console.log('只在这个目录里改代码并提交；不要 push、不要 merge、不要切换分支、不要删 worktree。');
  console.log('完成后报告：提交列表、跑过的检查与结果、未完成项。');
  console.log('任务：<在这里写这次要做的事>');
  console.log('---');
}

function commandNew(args) {
  assertManagedName(args.name);
  assertMainWorktree('wt:new');

  const targetPath = managedWorktreePath(args.name);
  const branch = args.branch || managedBranch(args.name);

  if (!BRANCH_PATTERN.test(branch)) {
    throw new Error(`--branch "${branch}" is not a valid branch name.`);
  }

  if (existsSync(targetPath)) {
    throw new Error(`Directory already exists: ${targetPath}. Remove it or choose another name.`);
  }

  if (readWorktrees().some((entry) => samePath(entry.path, targetPath))) {
    throw new Error(`A worktree is already registered at ${targetPath}.`);
  }

  const branchExists = localBranchExists(branch);

  if (branchExists && !args.existingBranch) {
    throw new Error(`Branch ${branch} already exists. Either delete it first (git branch -D ${branch}) or re-run with --existing-branch to reuse it.`);
  }

  if (!branchExists && args.existingBranch) {
    throw new Error(`--existing-branch was given, but branch ${branch} does not exist.`);
  }

  const base = resolveWorktreeBase(args);

  if (branchExists) {
    describeBaseRelation(base, branch, gitOutput(['rev-parse', `${branch}^{commit}`]));
  }

  const envPlan = planEnvironmentFiles(targetPath, args.dbSchema);

  const port = args.port ? Number(args.port) : defaultPort();

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`--port "${args.port}" is not a valid TCP port.`);
  }

  if (branchExists) {
    runGit(['worktree', 'add', targetPath, branch]);
  } else {
    runGit(['worktree', 'add', targetPath, '-b', branch, base.ref]);
  }

  for (const file of envPlan.files) {
    mkdirSync(path.dirname(file.targetFile), { recursive: true });
    writeFileSync(file.targetFile, file.content);
  }

  for (const warning of envPlan.warnings) {
    console.log(`WARNING: ${warning}`);
  }

  const registry = {
    name: args.name,
    branch,
    path: targetPath,
    baseRef: base.ref,
    baseSha: base.sha,
    port,
    dbSchema: args.dbSchema ?? null,
    createdAt: new Date().toISOString(),
  };

  writeRegistration(registry);

  if (args.noInstall) {
    console.log('');
    console.log('Skipped dependency setup (--no-install). Run inside the worktree: pnpm install && pnpm db:generate');
  } else {
    runPnpm(['install'], targetPath);
    runPnpm(['db:generate'], targetPath);
  }

  console.log('');
  console.log('Worktree ready');
  console.log(`- Path: ${registry.path}`);
  console.log(`- Branch: ${registry.branch}`);
  console.log(`- Base: ${registry.baseRef} @ ${shortCommit(registry.baseSha)}`);
  console.log(`- Dev port: ${registry.port}  (pnpm --filter web dev -- --port ${registry.port})`);
  console.log(`- Database schema: ${registry.dbSchema ?? 'public (shared)'}`);
  console.log(`- Rules: ${path.join(registry.path, RULES_FILE)}`);
  console.log('');
  console.log(`Next: pnpm wt:status    /    pnpm wt:remove ${registry.name}`);
  printPromptBlock(registry);
}

function commandAdopt(args) {
  assertManagedName(args.name);

  if (!args.base) {
    throw new Error('--base <ref> is required: record the base this worktree continues from.');
  }

  const { path: targetPath, entry } = resolveExistingManagedWorktree(args.name);

  if (!entry) {
    throw new Error(`No managed worktree at ${targetPath}. Create it first (pnpm wt:new or git worktree add).`);
  }

  if (!entry.branch) {
    throw new Error(`Worktree at ${targetPath} is in detached HEAD state; check out a branch before adopting it.`);
  }

  if (args.branch && args.branch !== entry.branch) {
    throw new Error(`--branch ${args.branch} does not match the branch this worktree holds (${entry.branch}).`);
  }

  const branch = entry.branch;

  const baseSha = resolveCommit(args.base);
  const existing = readRegistry(targetPath);
  const registry = {
    name: args.name,
    branch,
    path: targetPath,
    baseRef: args.base,
    baseSha,
    port: existing?.port ?? defaultPort(),
    dbSchema: existing?.dbSchema ?? null,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    adoptedAt: new Date().toISOString(),
  };

  writeRegistration(registry);

  console.log('');
  console.log(`${existing ? 'Registration updated' : 'Worktree adopted'}`);
  console.log(`- Path: ${registry.path}`);
  console.log(`- Branch: ${registry.branch}`);
  console.log(`- Base: ${registry.baseRef} @ ${shortCommit(registry.baseSha)}`);
  console.log(`- Rules: ${path.join(registry.path, RULES_FILE)}`);
}

function commandStatus() {
  const worktrees = readWorktrees();
  const current = currentWorktreePath();
  const main = mainWorktreePath();

  console.log(`Main worktree: ${main}`);
  console.log(`Registered worktrees: ${worktrees.length}`);

  for (const entry of worktrees) {
    const removed = !existsSync(entry.path);
    const isMain = samePath(entry.path, main);
    const isCurrent = samePath(entry.path, current);
    const registry = removed ? null : readRegistry(entry.path);
    const head = gitOutput(['log', '-1', '--format=%h %s'], { cwd: entry.path, allowFailure: true }).trim();
    const dirty = removed ? '' : gitOutput(['status', '--porcelain'], { cwd: entry.path, allowFailure: true }).trim();

    console.log('');
    console.log(`${isCurrent ? '*' : '-'} ${entry.path}${isMain ? ' (main)' : ''}`);
    console.log(`    Branch: ${entry.branch ?? '(detached HEAD)'}`);
    console.log(`    HEAD: ${head || '(unknown)'}`);
    console.log(`    Dirty: ${dirty ? `${dirty.split('\n').length} file(s) — not committed yet` : 'no'}`);

    if (removed) {
      console.log('    WARNING: directory is missing; run "git worktree prune" to drop the stale record');
      continue;
    }

    if (isMain) {
      continue;
    }

    if (entry.branch) {
      const merged = runGit(['merge-base', '--is-ancestor', entry.branch, 'main'], { allowFailure: true }).status === 0;
      console.log(`    Merged into main: ${merged ? 'yes' : 'no'}`);

      if (!merged && isMergedIntoOriginMain(entry.branch)) {
        console.log('    Merged into origin/main: yes — run "git pull" in the main checkout before reclaiming');
      }
    }

    if (!registry) {
      console.log('    Base: unregistered — record it with "pnpm wt:adopt <name> --base <ref>"');
      continue;
    }

    console.log(`    Base: ${registry.baseRef} @ ${shortCommit(registry.baseSha)}`);
    console.log(`    Dev port: ${registry.port}    Database schema: ${registry.dbSchema ?? 'public (shared)'}`);

    if (registry.branch && registry.branch !== entry.branch) {
      console.log(`    WARNING: the registration records branch ${registry.branch}, the worktree holds ${entry.branch}; re-run "pnpm wt:adopt ${registry.name} --base ${registry.baseRef}"`);
    }

    if (entry.branch && registry.baseRef) {
      const counts = gitOutput(['rev-list', '--left-right', '--count', `${registry.baseRef}...${entry.branch}`], { allowFailure: true }).trim();

      if (counts) {
        const [behind, ahead] = counts.split(/\s+/);
        console.log(`    vs base: ${ahead} ahead, ${behind} behind`);
      }
    }
  }
}

function commandRemove(args) {
  assertManagedName(args.name);
  assertMainWorktree('wt:remove');

  const { path: targetPath, entry } = resolveExistingManagedWorktree(args.name);

  if (!entry) {
    const stale = readWorktrees().some((candidate) => !existsSync(candidate.path));
    throw new Error(`No managed worktree at ${targetPath}.${stale ? ' A stale record exists; run "git worktree prune".' : ''}`);
  }

  if (samePath(entry.path, currentWorktreePath())) {
    throw new Error('Refusing to remove the worktree this command runs in.');
  }

  if (!entry.branch) {
    throw new Error(`Worktree at ${targetPath} is in detached HEAD state; reclaim it manually with "git worktree remove".`);
  }

  const branch = entry.branch;
  const dirty = gitOutput(['status', '--porcelain'], { cwd: targetPath, allowFailure: true }).trim();

  if (dirty && !args.force) {
    console.log(dirty.split('\n').map((line) => `    ${line}`).join('\n'));
    throw new Error('Worktree has uncommitted or untracked files. Nothing was removed. Commit them, or re-run with --force to discard them.');
  }

  if (dirty && args.force) {
    console.log('WARNING: uncommitted or untracked files will be discarded because --force was given.');
  }

  const merged = entry.branch ? runGit(['merge-base', '--is-ancestor', branch, 'main'], { allowFailure: true }).status === 0 : false;

  if (!merged && !args.keepBranch && !args.force) {
    const remoteHint = isMergedIntoOriginMain(branch)
      ? ' That branch is already in origin/main: run "git pull" in the main checkout, then re-run.'
      : '';

    throw new Error(`Branch ${branch} is not merged into local main. Nothing was removed.${remoteHint} Otherwise re-run with --force to remove only the directory (the branch and its commits stay).`);
  }

  runGit(['worktree', 'remove', ...(args.force ? ['--force'] : []), targetPath]);
  console.log(`Worktree directory removed: ${targetPath}`);

  if (args.keepBranch) {
    console.log(`Branch kept (--keep-branch): ${branch}`);
    return;
  }

  const deleted = runGit(['branch', '-d', branch], { allowFailure: true });

  if (deleted.status === 0) {
    console.log(`Branch deleted: ${branch}`);
    return;
  }

  console.log(`WARNING: branch ${branch} kept — "git branch -d" refused, because the commits are not merged.`);
  console.log(`WARNING: this command never runs "git branch -D". Discard the branch manually when you are sure: git branch -D ${branch}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.command || args.command === 'help' || args.command === '--help') {
    printUsage();
    return;
  }

  if (args.command === 'new') {
    commandNew(args);
    return;
  }

  if (args.command === 'adopt') {
    commandAdopt(args);
    return;
  }

  if (args.command === 'status') {
    commandStatus();
    return;
  }

  if (args.command === 'remove') {
    commandRemove(args);
    return;
  }

  printUsage();
  throw new Error(`Unknown command "${args.command}".`);
}

main().catch((error) => {
  console.error('');
  console.error(`ERROR: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
