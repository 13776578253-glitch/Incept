import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { ensureDocsImportDraftsDir, getDocsImportDraftsDir } from './paths';
import type { DocsImportDraft } from './types';

// 管理文档导入草稿的存储，包括创建、读取、写入和删除草稿文件，草稿数据以 JSON 格式保存在指定目录下，确保在导入流程中可以持久化和恢复用户的操作状态
function getDraftPath(draftId: string, startDir = process.cwd()) {
  if (!/^[a-f0-9-]{36}$/i.test(draftId)) throw new Error('Invalid draft identifier.');
  return path.join(getDocsImportDraftsDir(startDir), `${draftId}.json`);
}

export function writeDocsImportDraft(draft: DocsImportDraft, startDir = process.cwd()) {
  ensureDocsImportDraftsDir(startDir);
  const draftPath = getDraftPath(draft.id, startDir);
  const temporary = `${draftPath}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(draft, null, 2), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, draftPath);
  } finally { fs.rmSync(temporary, { force: true }); }
  return draftPath;
}

export function readDocsImportDraft(draftId: string, startDir = process.cwd()) {
  const draftPath = getDraftPath(draftId, startDir);

  if (!fs.existsSync(draftPath)) {
    return null;
  }

  const raw = fs.readFileSync(draftPath, 'utf8');
  return JSON.parse(raw) as DocsImportDraft;
}

export function deleteDocsImportDraft(draftId: string, startDir = process.cwd()) {
  const draftPath = getDraftPath(draftId, startDir);

  if (fs.existsSync(draftPath)) {
    fs.unlinkSync(draftPath);
  }
}
