# 路线图是人写内容的跨项目集成界面

## 状态

Accepted on 2026-09-23。暂缓的实施阶段登记在 `docs/BACKLOG.md`（B-28）。

## 背景

`/atlas/roadmap` 是已声明的占位页：其页面是明确的"尚未实现"屏，其图谱卡片原携注记 "Planned: milestones and open work read from the task records rather than retyped."（计划：里程碑与待办直接读自任务记录，而不是重新抄写一遍）。
该承诺在任何实现开始之前被审查并否决。路线图存储的是人写的内容：高度抽象，绝不从 `docs/NEXT.md`、`docs/BACKLOG.md` 或 `docs/finish-task/` 自动派生。
它不只记录本仓库的进度。它是跨项目的集成界面。

模块模板是正在进行的 music 包迁移（music worktree 分支 `feat/music-Plugin`）：`@incept/music` feature 包及其 `music-package-boundaries` 决策。该分支由主控负责合入，本决策所依赖的每条规则都在下文重述，因此不存在悬空引用。
`docs/decisions/internal-surfaces-not-in-public-nav.md` 中有两句话约束这个界面：图谱栏目"不新增任何数据访问"，且条目必须是"从已有内容派生的一个视图"。
两句都在该文档今天的更新段中被修订，连同管理占位页的挂载诚实规则。
存储与著述机制被有意留空，需要二次讨论；其议程即下方"开放问题"一节。

## 决策

1. **路线图存储人写的内容。** 高度抽象，跨项目作为集成界面，绝不从任务记录自动派生条目。
2. **完整双语对等——本决策新增的更严约束，不是延续仓库惯例。** 决策文档自身今日并不对等（见 `docs/INDEX.md` 的 "Known bilingual gaps" 表），因此不得把新约束描述成既有做法。每个内容条目以 `{ en, zh }` 成对存储与提供；校验拒绝缺半边的条目。UI 框架文案照旧在 `messages` 双语维护。
3. **内容与著述属于端口后的独立存储通道；内容绝不手写进 `messages` JSON 或代码常量。** fixture 例外与诚实性规则（与计划 Phase 4 的 grep 规则同措辞）：fixture 只允许存在于 `packages/roadmap/src/testing/`；fixture 作为数据源期间，图谱卡片与路线图页面都必须标注"示例数据，尚未接入存储"；存储接通前不得声称已接入。
4. **存储与著述留待二次讨论（deferred）。** 该延期是刻意的；见"开放问题"。
5. **路线图以进程内 feature 包 `packages/roadmap`（`@incept/roadmap`）交付**，沿用 music 包模板：分层梯度（domain 与 ports 禁 React/Next/Node；application 是 Node 可用编排层；react 认 React；next 认 Next；cli 与 adapters 认 Node）、边界强制（package `exports`、分层 tsconfig、pnpm 隔离、包独立 typecheck）、路径与配置注入、最小宿主面。本文档只记录 roadmap 特有增量。
6. **分层草案：** domain（纯类型与校验，含 LocalizedText 对）、ports（RoadmapRepository 读端口先行；写端口随著述决策落地）、adapters（存储适配——此前只有 fixture/内存适配）、application、react、next、cli（著述定案后）、testing。
7. **宿主触点**包括 `/atlas/roadmap` 页面与装配、owner 门控的 studio 页面及内部 API stub。本轮项目扩展新增 `/api/internal/roadmap/projects` 与 `/api/internal/roadmap/projects/[key]` 两个明确的宿主触点。2026-09-26 项目表面扩展还具名登记 `apps/web/src/features/settings/projects/project-surfaces-panel.tsx`（owner 设置页 CRUD 与表面开关）、`apps/web/src/features/settings/shared/settings-schema.ts`、`apps/web/src/features/settings/page/settings-page-content.tsx`、`apps/web/src/features/settings/page/settings-page-sidebar.tsx`、`apps/web/src/app/[locale]/settings/page.tsx`、`apps/web/src/features/atlas/components/surface-navigation.tsx`；公开路由消费者为 `/atlas`、`/atlas/architecture`、`/atlas/keywords`、`/atlas/roadmap`。不新增 mount 贡献类型。`?locked=<surface>` 是禁用目标的可选导航提示，不是状态真源或访问控制；服务端渲染状态由项目持久化的 `atlasEnabled` / `roadmapEnabled` 字段决定。Atlas 目录/内容仍来自现有静态 `atlas-registry.ts`；尚未实现按项目持久化的 Atlas 内容模型，后续讨论已登记在 B-28。著述面留在 studio/内部路径，绝不进入 atlas 子树，也不从 atlas 卡片链接。

## 被否决的方案

| 方案 | 否决理由 |
| --- | --- |
| 从任务记录自动派生条目（原卡片注记） | 产品层面否决：路线图存储人写的内容。 |
| 把内容放进 `messages` JSON 或代码常量 | messages 只放 UI 框架文案；内容属于存储通道，手抄的里程碑会腐化。 |
| 把双语对等说成既有惯例 | 不实：决策文档今日并不对等；本决策为路线图内容收紧规则。 |

## 后果

- 图谱卡片上"直接读自任务记录"的注记在本决策落档同轮纠偏。
- 存储定案之前，实现只用 fixture，且只限 `packages/roadmap/src/testing/`，卡片与页面按决策第 3 条标注示例数据。
- 著述面无论何种形态，都不挂 `/atlas/roadmap`、不进前台导航。
- 跨项目拉伸触发 `docs/decisions/internal-surfaces-not-in-public-nav.md` 点名的栏目一致性重新审视；该审视登记在今天的更新段中，归属按开放问题 4 收口。
- 完整对等提高著述成本（每条写两遍）。这是本决策的知情选择。

## 开放问题

本节是体例增量：既有决策文档只有 状态/背景/决策/被否决的方案/后果（部分含 边界）。以下四个问题是二次讨论的议程。

1. **存储：** Prisma（docs/notes 共享 `@incept/db` 的模式）、仓库内 markdown/JSON、还是仓库外 content root（`DOCS_CONTENT_ROOT` 约定）。**2026-09-23 定案（T3）：**Prisma 共享 `@incept/db`，按 music 式分层封装——包拥有仓储规则与端口后的 Prisma 适配器，`@incept/db` 保留 schema、migration 与 Prisma client。
2. **著述：** owner 门控的 studio 界面、CLI、还是手工编辑文件。无论哪种，决策第 7 条都把它排除在 atlas 子树之外。`metrics {votes, comments}` 的来源也在此一并裁定：手录计数会腐坏（「读而非抄」陷阱的新形态），外部导入则是一条本 gate 必须定义的数据通道。**2026-09-23 定案（T4）：**owner 门控的 studio 界面。暂不做投票/评论交互——界面完成后另行讨论功能添加——计数亦非当前议题：上句 metrics 来源问题随该次讨论一并搁置。
3. **内容模型字段：** 条目粒度、时间轴抽象、状态词汇、跨项目登记方式（项目注册表？）。参考界面 Featurebase Roadmap（`astrbot.featurebase.app/roadmap`）把稳定状态枚举（reviewing / unstarted / active / completed / canceled）映射为每板显示名；这种拆分值得借用，列结构与词汇可按项目不同。**2026-09-23 定案（T1）：**采用稳定状态枚举 + 每板显示名映射，已由 `@incept/roadmap` domain 类型实现。
4. **`/atlas/roadmap` 归属：** 留在 atlas 还是升为顶级界面。以 "If a second non-map entry is ever wanted here, that is the point to reconsider whether the section is still coherent"（若还想再放一个非"图"的条目，那就是重新审视栏目是否仍然成立的时点）为框架：跨项目集成界面正是那个时点；在存储 gate 裁定。**2026-09-23 定案（T2）：**多 roadmap + 切换器，留在 `/atlas/roadmap`。**2026-09-26 扩展：**跨项目轴现在由 `RoadmapProject` 承载，`Roadmap` 收窄为项目内的一块板（`?project=<key>&rd=<key>`）。这是对 T2 多 roadmap 决策的扩展，不是推翻；T2 的每板列结构隔离项目状态词汇依然成立，所以列继续挂在每块 Roadmap 上。
5. **界面术语保留与顶栏操作区（2026-09-25 定案；项目下拉语义于 2026-09-26 被 supersede）：** 页眉 eyebrow 固定为英文产品标识 `Roadmap`（与 `/docs` 的 `Docs` 对齐），标题精炼为 `开发路线` / `Milestones & Backlog`；阶段列名与类型/优先级标签保留英文工程标识；板切换胶囊去除「示例 / Sample」前缀；同一水平基线右侧配置「导入（Import）」按钮与「选择项目（Select project）」下拉。旧裁定中将下拉描述为「导入与跨项目筛选能力的入口」已被本轮语义取代：下拉切换 `RoadmapProject`（`?project=<key>`），左侧切换器仅显示所选项目内的板。

**2026-09-27 语义修订：** 每个项目当前只有一个路线图工作面；路线图页面不再显示项目内的单板切换器。图谱是独立的项目阅读面，图谱总览不再列路线图卡片；路线图入口与图谱入口并列，但路线图不属于图谱目录。
6. **详情弹窗交互与后端接线裁定（`U1`–`U6`，2026-09-25 定案）：**
   - **`U1`（`Detail` 双语存储与单框编辑拆解）**：`RoadmapEntry` 新增 `detailEn` / `detailZh`（`detail?: LocalizedText`）；弹窗 `Editor` 中 `Title` 按 ` / ` 拆分双语，`Summary` 与 `Detail` 更新当前语种并在另一语种为空时以当前文本兜底，兼顾单框便捷编辑与双语对等不变量。
   - **`U2`（未登录普通访客隐藏写控件）**：公开页 `/atlas/roadmap` 对非 Owner 访客隐藏 `Editor` 页签、`Backlog` `+` 按钮、`Board/Tags` 下拉箭头、`Revert or delete`（`Undo` / `Delete`）区域及顶栏「导入」按钮。
   - **`U3`（`Backlog` 新增交互）**：点击 `Backlog` 弹窗右侧 `+` 按钮时，在当前弹窗内清空并自动切换至 `Editor` 页签，填写完成点击 `Save` 时才调用 `POST /api/internal/roadmap/entries`（`roadmapEndpoints.entries`）创建落库。
   - **`U4`（轻量时间轴零建表）**：不新增状态历史审计表；`RoadmapEntryRow` 与 Prisma 查询已带出 `createdAt` / `updatedAt`，只需在 `toEntry()` 映射、域类型 `RoadmapEntry`、校验、fixture 与单测中保留（不含查询改动），驱动右侧 `Date` 与左侧 `Activity feed`（`Author` 固定为 `Soulter`）。
   - **`U5`（JSON 文件上传导入与反自动派生红线）**：顶栏「导入」走原生文件上传（`<input type="file" accept=".json" />`，不做粘贴面板），批量导入人工维护的 JSON 清单；**严格执行本决策第 1 条原文——路线图“绝不从 `docs/NEXT.md`、`docs/BACKLOG.md` 或 `docs/finish-task/` 自动派生”**。
   - **`U6`（2026-09-26 supersede：项目下拉语义）**：旧裁定通过 `?rd=<key>` 让项目下拉与左侧切换器都切换 Roadmap。现由项目维度扩展取代：右侧用 `?project=<key>` 切项目，左侧仅列出该项目的板；合法 `rd` 优先，并确定所属项目。
