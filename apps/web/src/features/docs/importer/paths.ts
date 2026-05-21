import fs from 'node:fs';
import path from 'node:path';

// 提供与文件系统相关的实用函数，用于定位仓库根目录、管理文档导入草稿的存储路径等，确保在整个文档导入流程中能够正确地处理文件路径和数据持久化
function readPackageName(packageJsonPath: string) {
  try {
    const raw = fs.readFileSync(packageJsonPath, 'utf8');
    const parsed = JSON.parse(raw) as { name?: string };
    return parsed.name;
  } catch {
    return undefined;
  }
}

// 通过向上遍历目录结构查找包含特定 package.json 的目录来定位仓库根目录，确保在处理相对路径时能够正确地解析到项目的根位置
export function findRepoRoot(startDir = process.cwd()) {
  let currentDir = path.resolve(startDir);

  while (true) {
    const packageJsonPath = path.join(currentDir, 'package.json');

    if (fs.existsSync(packageJsonPath) && readPackageName(packageJsonPath) === 'incept') {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);

    if (parentDir === currentDir) {
      throw new Error('Unable to locate the Incept repository root.');
    }

    currentDir = parentDir;
  }
}

// 获取文档导入草稿的存储目录路径，默认在仓库根目录下的 .docs-import-drafts 目录，确保所有草稿文件集中存放，便于管理和清理
export function getDocsImportDraftsDir(startDir = process.cwd()) {
  return path.join(findRepoRoot(startDir), '.docs-import-drafts');
}

// 确保文档导入草稿的存储目录存在，如果不存在则创建，返回该目录的路径，以便在后续的草稿读写操作中使用
export function ensureDocsImportDraftsDir(startDir = process.cwd()) {
  const draftsDir = getDocsImportDraftsDir(startDir);
  fs.mkdirSync(draftsDir, { recursive: true });
  return draftsDir;
}
