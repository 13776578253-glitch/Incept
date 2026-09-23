# Roadmap 模块化计划

## Status

草案，2026-09-23。Phase 0 随本文件落档同轮完成；Phase 1–4 逐批批准，未批准不执行；Gate（二次讨论）是显式关卡。决策依据：`docs/decisions/roadmap-integration-surface.md`（en/zh 对）及其同轮修订的 `docs/decisions/internal-surfaces-not-in-public-nav.md`。

## 背景与目标

`/atlas/roadmap` 现为占位页。目标形态：`packages/roadmap`（`@incept/roadmap`）进程内 feature 包——存储人写内容、高度抽象、跨项目集成界面、完整双语对等。模块边界沿用 music 包模板（music worktree 分支 `feat/music-Plugin` 的 `music-package-boundaries` 决策与 `packages/music`；该分支由主控合入，本分支尚未包含，所依赖规则已在 `roadmap-integration-surface` 决策内逐条重述，无悬空引用）。宿主只保留 `/atlas/roadmap` 页面 stub、装配与既有导航条目；写入面留 studio/内部路径，不进 atlas 子树。

存储与著述机制未定（Gate），本计划在该关卡之前只允许 fixture。

## 目标形态

- `packages/roadmap` 分层（exports 按层）：domain（纯类型与校验，含 LocalizedText 对）、ports（RoadmapRepository 读端口先行，写端口随著述决策落地）、adapters（存储适配；Gate 前只有 fixture/内存适配）、application、react、next、cli（著述定案后）、testing。
- 边界强制：package `exports` + 分层 tsconfig + pnpm 隔离 + 包独立 typecheck（music 同款）。
- 宿主接线面：`apps/web/src/app/[locale]/atlas/roadmap/page.tsx` stub、装配（存储连接注入）、`messages/{en,zh}` UI 框架文案。不新增 mount 贡献类型（核实触点出现前不加注册面）。

## Phase 划分

### Phase 0 — 落档（本轮）

- 新增 `docs/decisions/{en,zh}/roadmap-integration-surface.md`。
- 修订 `docs/decisions/{en,zh}/internal-surfaces-not-in-public-nav.md`（追加 2026-09-23 Update 段）。
- 纠偏 `messages/{en,zh}/atlas.json` 的 roadmap 卡片注记（文案，不是功能代码）。
- 本文件落 `docs/plans/`。

### Gate — 二次讨论（显式关卡）

议程即 `roadmap-integration-surface` 开放问题 1–4：存储、著述、内容模型字段、`/atlas/roadmap` 归属（归属以 internal-surfaces「若还想再放一个非'图'的条目，那就是重新审视栏目是否成立的时点」为框架裁定）。未裁定不进入 Phase 2/3。

### Phase 1 — 包骨架与 fixture 读链（批准后）

- `packages/roadmap` 骨架：分层 exports、分层 tsconfig、包独立 typecheck。
- domain 类型与校验（LocalizedText `{ en, zh }` 对、缺半边即拒）、ports 读端口、testing fixture。
- react 组件 + `/atlas/roadmap` 接线（fixture 数据）。
- **诚实标注（强制）**：卡片与页面标注"示例数据，尚未接入存储"（Sample data — not yet connected to storage），与决策条目 3、internal-surfaces 更新段同措辞。

### Phase 2 — 存储读链（Gate 后按定案）

- 存储适配落地，替换 fixture；接通后撤下示例数据标注（撤除本身按更新段要求核对）。
- 双语对等校验随适配落地（缺半边即拒）。

### Phase 3 — 写入面（Gate 后按定案）

- 形态按定案（studio UI / CLI / 手工编辑）。
- **边界（强制）**：不挂 `/atlas/roadmap`、不进 atlas 子树、不从 atlas 卡片链接（internal-surfaces 更新段绑定条款）。

### Phase 4 — 验收冻结

- grep 不变量（口径现在定死，与决策条目 3 同措辞）：**grep 只扫 `apps/web/src/messages/**`**（查内容手抄进 messages）；**fixture 只允许存在于 `packages/roadmap/src/testing/`，不在扫描面内**。
- 双语缺一即拒的校验回归（红灯→绿灯探针）。
- 删除演练：摘除 stub/装配，构建仅在接线处报错（music A5 同款）。
- `apps/web` 不 import 包内部实现（stub/装配除外，music A1/A4 同款）。

## 验收要点（草案，随 Phase 细化）

| # | 不变量 | 验证方式 |
| --- | --- | --- |
| B1 | 内容不进 messages / 代码常量 | grep 只扫 `apps/web/src/messages/**`，零命中 |
| B2 | fixture 豁免面固定 | fixture 仅存在于 `packages/roadmap/src/testing/` |
| B3 | 双语对等 | 缺半边即拒，校验红灯→绿灯探针 |
| B4 | 宿主最小面 | 残留清单核对（仅 stub/装配/文案） |
| B5 | 删除演练 | 摘除接线后仅接线处报错 |
| B6 | fixture 诚实标注 | 卡片与页面文案核对（Phase 1–2 期间） |

## 风险登记（草案）

| # | 风险 | 缓解 |
| --- | --- | --- |
| R1 | 内容模型过度设计 | Gate 前只有 fixture，不建表；字段在开放问题 3 定案 |
| R2 | atlas 准则拉伸引发栏目定位争论 | 更新段点名处置（en:148 整句 supersede、en:150 登记重新审视）；归属开放问题 4 收口 |
| R3 | 双语对等提高著述成本 | 用户知情选择（决策"后果"节明示） |
| R4 | fixture 被误当真实内容 | 决策条目 3 诚实标注 + Phase 2 撤除核对 |

## 执行环境提示

- `pnpm test` 需一次性提权到 danger-full-access（vitest worker 与 node:test 均起管道子进程，默认沙箱 EPERM）；执行 AI 不得把沙箱拒绝误判为代码缺陷。
- 基线（2026-09-23 本机实测）：`pnpm typecheck` 绿；`pnpm test` = web 189（22 文件）/ core 73/73。docs-only 轮任何漂移即回归。
- `pnpm lint` 不运行：仓库无 `eslint.config.*` / `.eslintrc*`（ESLint 9 已装但无 flat config，pre-existing condition，见 `docs/current-task/2026-09-23-atlas-section-and-route-skeleton.md`）。

## 记录

[2026-09-23] - Update by AI完成改动:
- Roadmap 重定位落档：定为人写内容、高度抽象、跨项目集成界面（自动读取任务记录的原承诺否决）；完整双语对等定案（新约束，非既有惯例）；模块化定为 `packages/roadmap` 沿用 music 包模板；internal-surfaces 追加更新段（en:148 点名 supersede、en:32 改写对 hub 的适用性、en:149 扩展 fixture 诚实规则、en:147+31 绑定写入面、en:150 登记重新审视）；atlas 卡片派生承诺文案同轮纠偏。
- 遗留问题: 存储/著述/内容模型/atlas 归属待二次讨论（Gate）；Phase 1–4 待批准；music 包模板（`feat/music-Plugin`）待主控合入。
- Commit 建议: [docs]: reposition the roadmap as a curated integration surface；[fix(web)]: align the roadmap card note with the curated-surface decision；[docs]: add the roadmap modularization plan
