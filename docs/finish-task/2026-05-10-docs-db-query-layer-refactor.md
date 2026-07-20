[2026-05-10 15:20] - Update by AI完成改动:
- 重构了 `packages/db/src/docs` 查询层结构，将原本集中在单个 `queries.ts` 内的逻辑拆分为 `article / collection / home / shared` 四个模块。
- 将 docs 首页的年份分组逻辑从 db 层移出，改由 `apps/web/src/server/docs/mappers.ts` 负责，明确了“db 只返回数据条目，web 再做页面分组”的职责边界。
- 移除了 docs 查询层中的 `$queryRawUnsafe` 读取路径，改为 Prisma 显式 `select` + 受控内存组装，降低原生 SQL 与 ORM 混用带来的理解成本和风险。

本轮重点收口:
- `packages/db/src/docs/queries/article.ts`
  - 只负责 standalone article 查询
- `packages/db/src/docs/queries/collection.ts`
  - 只负责 collection article 查询与同合集文章列表组装
- `packages/db/src/docs/queries/home.ts`
  - 只负责 docs 首页条目读取
- `packages/db/src/docs/queries/shared.ts`
  - 只负责 `bodyJson` / `sidebarJson` 校验与通用排序 helper

结构改动说明:
- `packages/db/src/docs/queries.ts`
  - 现在仅作为轻量 re-export 入口，不再承载大段实现逻辑
- `packages/db/src/docs/types.ts`
  - 新增 `DbDocsSidebar`
  - 删除 db 层分组 DTO，首页返回改为 flat entries
- `apps/web/src/server/docs/mappers.ts`
  - 新增按年份分组逻辑
  - `mapDocsHomeGroupsToPageGroups` 调整为 `mapDocsHomeEntriesToPageGroups`
- `apps/web/src/server/docs/access.ts`
  - 对接新的 flat home entry 读取结果

遗留问题:
- collection / home 查询已经完全转为 Prisma 路径，但仍建议你本地实际跑一轮页面链路，重点确认：
- `/en/docs`
- `/en/docs/[slug]`
- `/en/docs/series/document-shells/shell-foundations`
- docs 首页年份分组与 collection 首篇文章跳转
- 如果后续 docs collection 查询继续变复杂，可以再考虑在 `packages/db/src/docs` 内继续细分“DTO mapper”和“query executor”，但本轮先控制在最小可读重构范围内。

Commit 建议: refactor: split docs db query layer and remove unsafe raw reads

[2026-05-10 15:34] - Update by AI完成改动:
- 移除了 `packages/db/src/docs/queries.ts` 这一层中转 re-export。
- `packages/db/src/docs/index.ts` 现已直接导出 `queries/article`、`queries/collection`、`queries/home`，减少了一层无实际价值的跳转。
- 这次调整不改变 `@incept/db/docs` 的公开使用方式，只是进一步收紧内部结构。

遗留问题:
- 建议本地再做一次最小回归，确认 `@incept/db/docs` 导入路径在 web 侧没有受到影响。

Commit 建议: refactor: remove redundant docs queries re-export shim
