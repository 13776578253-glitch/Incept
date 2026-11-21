# Docs Collection `--replace` 与 Import Preview 鉴权调整记录（2026-11-15）

## 状态

- 2026-11-15 22:20（UTC+8）云端 Web App 更新至 `incept-v4-release:20261115-docs-import`，镜像 ID 为 `sha256:09330f54dc5524658e8dbc64196aea85d877b5c15b774d12441f56fe38e719cb`。以正在运行的公式和表格镜像为构建基线，叠加合集预览、Replace 和确认权限的 11 个源文件与回归测试文件。
- 仅重建 Web App。PostgreSQL、Caddy 和 Sync Gateway 容器 ID 校验一致。本次通过 SSH 传输镜像，未推送 Git。
- 已发布合集仍为中英文模块 0，模块 1 处于待审阅状态。当前批次草稿为中文 `3add09ba-9704-4e3f-99b9-f7405f645760`、英文 `14fc4568-0137-4d71-ab66-33aa35786a4f`，均含两篇文章、零校验错误，发布前后草稿 SHA-256 一致。之前的 `329fd371-8658-44c6-8bb6-481e27dcffc2` 与 `f6dae422-280a-470e-bfe4-9feceb9cf860` 已有确认记录。

## 修复内容

### 1. 合集目录 `--replace` 调整结构时的位置冲突（`packages/db/src/docs/import.ts`）

- **问题现象**：将合集文章从文件夹移出到父级同序号位置（例如把 `folder-root-01` 下的文章移到根节点 `position: 1`，并随 `--replace` 停用 `folder-root-01`）时，确认导入返回 `500`，服务端日志报错：`Error: The collection position 1 is already used by another article in "nlp-text-classification".`。
- **根因**：`importDocsCollectionDirectory` 先循环调用 `upsertDocsCollectionArticle`，在事务末尾才执行 `if (replace)` 停用已移除节点；同时 `upsertDocsCollectionArticle` 中的 `conflictingPosition` 查询未过滤 `isActive: true`，导致正在被移除或已停用的文件夹/节点仍占据目标 `position`。
- **修复**：
  - 在 `upsertDocsCollectionArticle` 的 `conflictingPosition` 查询中增加 `isActive: true` 过滤条件。
  - 在 `importDocsCollectionDirectory` 中，当 `replace` 为 `true` 时先将不在目标树中的旧节点标记为 `isActive: false`（记录为 `removed` 变更），并在同一批更新前对发生 `parentId` / `position` 变动的留存节点先临时置为 `position: 0`，使目录退层与同级重排均可原子完成。

### 2. Import Preview 确认不再要求二次验证身份，非 Owner 直接拒绝请求

- **`apps/web/src/app/[locale]/docs/import-preview/[draftId]/confirm/route.ts`**：
  - 移除 `requireRecentOwnerSession(viewer.sessionId)` 与未使用的 `OwnerAuthError` 引用，保留有效 `Owner` 会话校验（`viewer.role === 'owner'`）、同源校验（`hasSameOrigin`）以及 `writeSecurityAudit('docs.publish', ...)` 发布审计。
  - 跨站来源与非 Owner（Guest / Pro）请求直接返回 `403`（`Forbidden.`），在读取草稿和写入数据库前拒绝。
- **`apps/web/src/app/[locale]/docs/import-preview/[draftId]/page.tsx`**：
  - 在页面服务端组件顶部显式调用 `await requireOwner()`（配合同目录 `layout.tsx` 的 `requireOwner()` 守卫），确保非 Owner 访问在读取草稿文件之前即被拒绝。

### 3. 合集草稿内切换文章

- 批次列表通过 `?article=<slug>` 在同一个草稿里选择文章。切换时同步显示正文、章节目录、导入位置和目标路径。缺省或无效选择回到第一篇。
- `Confirm batch import` 对整个合集草稿执行确认，当前文章选择仅用于预览。

## 新增回归测试

- `apps/web/src/server/docs/__tests__/collection-directory-replace.test.ts`：覆盖从待删除文件夹迁移文章到根节点 `position: 1` 的 `--replace` 场景，以及同级文章 `01 <-> 02` 位置互换场景。
- `apps/web/src/server/docs/__tests__/import-preview-confirm.test.ts`：覆盖 `import-preview` 页面对 Guest/Pro 的拒绝逻辑，以及 `/confirm` 对跨站、Guest/Pro 返回 `403` 且对常规 Owner 会话无需二次验证即可完成确认与审计写入的行为。
- `apps/web/src/features/docs/import-preview/collection-preview.test.tsx`：覆盖预览第二篇时正文、右侧目录和目标路径同步切换，确认仍提交原批次。

## 发布验证与清理

- 生产 Dockerfile 完成类型检查、Lint、工作区测试、运维测试和 Next.js 构建。Lint 为 0 错误、8 条既有警告，依赖外部环境的测试按现有配置跳过。
- 同一候选镜像使用隔离 PostgreSQL 验证了真实 HTTP 流程。Owner 可打开第二篇，以无近期身份验证的有效会话确认整批并得到 `303`。测试中旧文件夹停用，文章迁移至根目录并保留正确顺序，发布审计落库。游客和跨站请求被拒绝。
- 云端 `/api/health/live`、`/api/health/ready` 及中英文 Docs 首页均返回 `200`。两份草稿的游客访问返回 `404`，游客确认返回 `403`。线上 Owner 预览和正式确认留待站长操作。
- 已清理云端上传暂存目录及镜像归档（388,512,256 字节），以及本次本机构建暂存、开发日志、Owner 登录辅助脚本、测试缓存与本地 QA 草稿。保留旧生产镜像 `incept-v4-release:20261115` 和 `/srv/incept/.env.production.bak-pre-20261115-docs-import` 作为回滚入口。
