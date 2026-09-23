# 路线图是人写内容的跨项目集成界面

## 状态

Accepted on 2026-09-23。暂缓的实施阶段登记在 `docs/BACKLOG.md`（B-26）。

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
7. **宿主触点只有 `/atlas/roadmap` 页面 stub 与装配。** 导航条目已存在；在核实触点出现之前不新增 mount 贡献类型。著述面是内部能力：留在 studio/内部路径，绝不进入 atlas 子树、绝不从 atlas 卡片链接——绑定"它列出 `/atlas/architecture`、`/atlas/roadmap`、`/atlas/keywords`，此外不指向自己子树以外的任何页面"与"docs 后台仍留在 `studio`，不得被挪回图谱栏目"两句。

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

1. **存储：** Prisma（docs/notes 共享 `@incept/db` 的模式）、仓库内 markdown/JSON、还是仓库外 content root（`DOCS_CONTENT_ROOT` 约定）。
2. **著述：** owner 门控的 studio 界面、CLI、还是手工编辑文件。无论哪种，决策第 7 条都把它排除在 atlas 子树之外。`metrics {votes, comments}` 的来源也在此一并裁定：手录计数会腐坏（「读而非抄」陷阱的新形态），外部导入则是一条本 gate 必须定义的数据通道。
3. **内容模型字段：** 条目粒度、时间轴抽象、状态词汇、跨项目登记方式（项目注册表？）。参考界面 Featurebase Roadmap（`astrbot.featurebase.app/roadmap`）把稳定状态枚举（reviewing / unstarted / active / completed / canceled）映射为每板显示名；这种拆分值得借用，列结构与词汇可按项目不同。
4. **`/atlas/roadmap` 归属：** 留在 atlas 还是升为顶级界面。以 "If a second non-map entry is ever wanted here, that is the point to reconsider whether the section is still coherent"（若还想再放一个非"图"的条目，那就是重新审视栏目是否仍然成立的时点）为框架：跨项目集成界面正是那个时点；在存储 gate 裁定。同一参考界面把"跨项目"表达为多 roadmap（Roadmaps 切换）而非单板 + 项目 chip：每板列结构天然隔离各项目的状态词汇，chip 方案在各项目列结构分化后撑不住。
