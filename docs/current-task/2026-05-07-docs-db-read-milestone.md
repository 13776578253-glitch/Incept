[2026-05-07 16:00] - Update by AI完成改动:
- 建立了 docs 的数据库读链路基线，`/{locale}/docs`、`/{locale}/docs/[slug]`、`/{locale}/docs/reference` 已切换到数据库读取。
- 新增 `packages/db` docs 查询层、`apps/web/src/server/docs` loader / mapper 层，并清理了 docs 主链路中的 mock 类型依赖。
- 建立了新的 docs 固定目录规范：`docs/decisions/`、`docs/current-task/`、`docs/finish-task/`、`docs/runbooks/`、`docs/modules/docs/`。

## 已完成链路

- 本地 PostgreSQL 已通过 Docker 跑通
- Prisma schema / migration / seed 已建立
- docs 首页已改为数据库读取
- docs canonical 详情页已改为数据库读取
- `/reference` 已作为 alias 复用 canonical loader
- `bodyJson` 结构已统一为 `{ sections: [...] }`
- 详情查询已不再限制为 `kind = reference`

## 当前真实可访问页面

- `/{locale}/docs`
- `/{locale}/docs/document-shells`
- `/{locale}/docs/reference`

当前已验证的主要访问路径：

- `/en/docs`
- `/en/docs/reference`
- `/en/docs/reference-shell` 在旧日志中出现过，但当前 canonical 规则应以 `/document-shells` 为准

## 当前数据库种子数据范围

当前 seed 覆盖：

- `en` / `zh`
- `guest` / `member` / `pro`
- `reference` / `article` / `note`
- 2026 与 2025 两组 docs 首页数据
- 至少一篇完整 sidebar-mode 文章
- 多篇最小正文结构文章

## 已知限制

- 当前 viewer role 仍为开发期固定值，不是真实登录态
- docs 首页 intro 仍保留在 web 静态层
- `/docs/archive` 尚未实现
- create / edit / publish 写链路尚未开始
- 当前旧目录 `docs archive/` 与 `plan-docs/` 保留不动，后续作为历史上下文参考

遗留问题:
- 下一阶段需要开始规划 docs create/admin 最小写链路，并继续补充 runbook 与模块文档。

Commit 建议: milestone: docs db read flow baseline and documentation rules
