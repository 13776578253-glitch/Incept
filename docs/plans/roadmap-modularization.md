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

## 功能规划

设计参考：看板形态（Backlog / Next up / In Progress / Done 四列、双语卡片、类型/优先级标签、评论数、投票数）。工作模式定调：Compare + Monitor——稳定扫描通道（lanes）为主、状态计数为辅；不做居中 hero + 卡片网格的通用排法。

- **F1 四列看板**：状态词汇（= 开放问题 3 状态维度的草案）：`backlog`（储备）/ `next`（接下来）/ `in-progress`（进行中）/ `done`（已完成）。列头 = 图标 + 双语名（messages）+ 条目计数徽标。列内按人定 `order` 排序（尊重人写顺序，同 music-manifest 保留手工位次的先例）。
- **F2 卡片解剖**：主语言标题 + 次语言一行（弱化灰，双语对等在界面上可见）；chips：类型（如 Feature Request）、优先级（High / Middle / Low，用词随参考图）、项目标识（跨项目集成的差异点）；footer：评论数 + 投票数（图标 + 数字，**纯文本渲染，不是按钮**）。
- **F3 项目筛选**：项目 chip 行（全部 + 各项目），URL 同步 `?project=` 可分享。项目 = 人写登记（slug + `{en, zh}` 显示名），不自动发现仓库。
- **F4 指标显示**：votes / comments 计数为内容模型字段，有则显示、无则隐藏；投票/评论交互属用户生成写入，归 Gate 开放问题 2（著述）一并裁定，Phase 1–2 不做任何假按钮。
- **F5 状态面**（全量构建，不留"以后补"）：loading = 通道骨架屏；空列 = 教学型文案（说明该列放什么）；错误 = 恢复路径文案；fixture 诚实横幅（决策条目 3 强制）。
- **明确不做**（触点未出现，R8 同款）：拖拽/编辑、条目详情路由（决策 7 触点清单因此原样成立）、投票/评论交互、搜索/排序控件。

**内容模型草案**（= 开放问题 3 的回答草案，Gate 批准对象，标注 draft）：`RoadmapEntry` = key、project、order、status（F1 词汇）、type（feature / improvement / maintenance 草案词汇）、priority（high / middle / low / none）、title `{en, zh}`、summary `{en, zh}`、metrics? `{votes, comments}`、links? `[{label{en,zh}, href}]`。校验：成对语言缺一即拒。高度抽象：不做日期轴/里程碑层级——列即是时间抽象。

## 界面样式

设计不变量：名称/路由 = Roadmap（路线图）`/atlas/roadmap`（atlas 的"时间"图）；用户 = 低压力的浏览/扫描者；核心对象 = 条目卡与状态列；拒绝的漂移 = 管理后台式可拖拽看板、渐变/玻璃/假交互按钮、显示字体、AI 味紫色系。

- **构图**：页头（与 AtlasHub 同语言：eyebrow/h1/description，同一 max-w-[720px] 文案列）→ 项目筛选行 → 四列板。容器 max-w-[1360px]。桌面：CSS grid 四列（每列 min 280px）+ 窄屏横向滚动 scroll-snap；<768px：分段控件切换单列堆叠（改变结构，不是压缩）。
- **色彩**（宿主 whisper 单色纪律，语义色只给 chip）：新 token 入 `theme.css` 三态（light / `.dark` / 暖色护眼）：优先级 chip 高=暖红、中=琥珀、低=中性灰蓝（低彩度）；类型 chip 中性底 + 图标；项目 chip 中性描边。**永不只用颜色编码**——chip 恒带文字标签；列头图标中性色，不给列上色。
- **排版**：沿用 `--font-family-base` 与 AtlasCard 尺度：标题 1rem/medium（`--color-text`）、次语言 0.82rem（`--color-text-soft`，单行截断）、meta 计数 0.78rem + `tabular-nums`、chip 0.76rem。
- **形状/深度**：卡片与列 `--radius-md`（14px）、边框 `--color-border`、卡片 hover = 边框加深 + translateY(-2px)（row-interaction 模式），无常驻阴影。
- **动效**：只用 `--duration-fast` / `--duration-base`（160/240ms）；入场 stagger 20ms±抖动；只动 transform/opacity；`prefers-reduced-motion` 降级为无动效。
- **无障碍**：列 = 列表语义、卡片 = article、筛选 = button 组（aria-pressed）、键盘逐列逐卡可遍历、focus-visible 环（2px + offset 2）、触控目标 44px、长标题两行截断且全称不丢失（title 属性）。

## Phase 划分

### Phase 0 — 落档（本轮）

- 新增 `docs/decisions/{en,zh}/roadmap-integration-surface.md`。
- 修订 `docs/decisions/{en,zh}/internal-surfaces-not-in-public-nav.md`（追加 2026-09-23 Update 段）。
- 纠偏 `messages/{en,zh}/atlas.json` 的 roadmap 卡片注记（文案，不是功能代码）。
- 本文件落 `docs/plans/`。

### Gate — 二次讨论（显式关卡）

议程即 `roadmap-integration-surface` 开放问题 1–4：存储、著述（含投票/评论等用户生成写入的裁定——功能规划 F4）、内容模型字段（内容模型草案在此批准）、`/atlas/roadmap` 归属（归属以 internal-surfaces「若还想再放一个非'图'的条目，那就是重新审视栏目是否成立的时点」为框架裁定）。未裁定不进入 Phase 2/3。

### Phase 1 — 包骨架与 fixture 读链（批准后）

实现对象 = 功能规划 F1–F5 与界面样式规格：

- `packages/roadmap` 骨架：分层 exports、分层 tsconfig、包独立 typecheck。
- domain 类型与校验（内容模型草案落地为类型；LocalizedText `{ en, zh }` 对、缺半边即拒）、ports 读端口、testing fixture（含最长标题、空列、大计数等极端样本）。
- react 看板组件（F1 四列 + F2 卡片 + F3 项目筛选）+ `/atlas/roadmap` 接线（fixture 数据）。
- F5 状态面全量构建：loading 骨架、空列教学文案、错误恢复文案，以及**诚实标注（强制）**：卡片与页面标注"示例数据，尚未接入存储"（Sample data — not yet connected to storage），与决策条目 3、internal-surfaces 更新段同措辞。

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

[2026-09-23] - Update by AI完成改动:
- 功能与界面样式规划落档（参考看板截图）：功能规划 F1–F5（四列看板、双语卡片解剖、项目筛选、指标只读显示、全量状态面）与明确不做清单；内容模型草案（draft，= 开放问题 3 回答草案）；界面样式规格（构图/色彩/排版/形状/动效/无障碍，沿用宿主单色 token 体系，语义色只给 chip）；Phase 1 范围对齐 F1–F5，Gate 议程注明投票/评论交互随著述裁定。
- 遗留问题: 投票/评论交互归 Gate 开放问题 2 裁定；详情路由明确不做（决策 7 触点清单不变）；Phase 1–4 待批准。
- Commit 建议: [docs]: add the roadmap feature and UI spec
