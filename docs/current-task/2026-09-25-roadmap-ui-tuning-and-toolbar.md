# 2026-09-25 Roadmap 界面样式复现、比例调优与顶栏操作区扩展记录

## Status

**已完成 UI 样式复现、框架比例对齐及右侧工具栏（导入按钮 + 项目下拉选择标签）骨架接入；后续具体功能与后端侧能力待下一轮指令落地。**

[2026-09-25 13:50] - Update by AI完成改动:
- 修改了 `@incept/roadmap` 前端组件层（`RoadmapBoard` / `RoadmapLane` / `RoadmapCard` / `RoadmapChip` / `RoadmapSwitcher` / `RoadmapToolbar` / `icons`）与宿主路由页 `apps/web/src/app/[locale]/atlas/roadmap/page.tsx`、双语词典 `apps/web/src/messages/{en,zh}/roadmap.json`、主题变量 `apps/web/src/styles/theme.css` 及测试样本 `packages/roadmap/src/testing/fixtures.ts`，实现了：
  1. 跨语言保留英文工程阶段列名（`Backlog` / `Next up` / `In Progress` / `Done`）与内部卡片标签（`Feature Request` / `Improvement` / `Maintenance` 及优先级标签），中文页眉 `eyebrow` 统一为 `Roadmap`。
  2. 引入列状态彩色图标与卡片类型彩色图标/优先级彩色圆点视觉锚点，消除整块纯灰视觉。
  3. 对齐 `/zh/docs` 页面顶部纵向间距与基线高度（`pt-6 md:pt-10`、`space-y-5`、`pb-16 md:pb-20`），移除冗长说教式大标题与长段说明，改为精炼标题 `开发路线` / `Milestones & Backlog`；容器宽度拓宽至 `max-w-[1480px]`，单列网格 `minmax(288px, 1fr)`。
  4. 去除看板切换胶囊「示例 / Sample」前缀（改为 `路线图 / Roadmap` 与 `图谱板 / Atlas Board`）并同步 `pnpm roadmap:seed`。
  5. 在切换器同一水平基线右侧新增 `RoadmapToolbar`（依次放置「导入 / Import」按钮与「选择项目 / Select project」下拉选择标签）。
- 遗留问题: 「导入」按钮与「选择项目」下拉标签的具体业务行为、数据过滤或后端导入接口待下一轮明确后接入并移交执行 AI 协同实现。
- Commit 建议: [feat]: roadmap 样式比例调优与顶栏导入及项目选择控件接入

## 1. 样式与架构决策要点

1. **英文工程标识在中文模式下的保留**：
   - `page.eyebrow` 在中英模式下均采用 `"Roadmap"`（与 `/zh/docs` 的 `"Docs"` 保持统一产品标签规范）。
   - 列头阶段名（`Backlog` / `Next up` / `In Progress` / `Done` 及 `Planned` / `Building` / `Shipped`）与卡片内部类型/优先级标签在中英文模式下统一保持英文工程术语。
2. **与 `/zh/docs` 的纵向基线对齐与横向看板拓宽**：
   - 页眉区严格复用 `DocsHomeIntro` 的 `pt-6 md:pt-10`、`space-y-5`、`text-[2rem] md:text-[2.65rem] md:leading-[1.08]` 及 `pb-16 md:pb-20` 底部留白，使下方操作条（`RoadmapSwitcher` + `RoadmapToolbar`）与 `/zh/docs` 的 `2026` 年份分组标题处于同一像素高度基线。
   - 整体容器采用 `max-w-[1480px] px-6 lg:px-10`，保证页眉与第一列 `Backlog` 左边缘对齐，同时单列宽度约 `330px`，确保单行承载足够字符且双标签同行不折行。
3. **顶栏右侧控件位（`RoadmapToolbar`）**：
   - 位于 `RoadmapSwitcher`（`路线图` | `图谱板`）同一水平基线右侧，依次渲染：
     - **导入按钮（`导入` / `Import`）**
     - **项目下拉选择标签（`选择项目` / `Select project`，含 `全部项目` 及各项目选项）**
   - 控件通过 `@incept/roadmap/react` 导出契约暴露，遵循 Phase 4 冻结声明的三通道边界。

## 2. 检查与结果

- `pnpm roadmap:seed`：2 roadmaps / 7 columns / 10 entries / 1 link 幂等更新通过。
- `pnpm --filter @incept/roadmap test`：6 个测试文件、40 项单测（含新增的中文模式英文列头保留单测、`RoadmapToolbar` 交互单测与 `RoadmapDetailModal` 展开/翻页单测）全部通过。
- `pnpm typecheck`：全仓 5 包类型检查通过。

---

[2026-09-25 15:00] - Update by AI完成改动:
- 修改了 `packages/roadmap/src/react/roadmap-card.tsx`、`roadmap-lane.tsx`、`roadmap-board.tsx`、`index.ts` 并新增 `packages/roadmap/src/react/roadmap-detail-modal.tsx`，实现了点击任意看板卡片展开参考样式的 `RoadmapDetailModal` 详情弹窗（1:1 复刻）：
  1. **左列主内容区**：双语并排标题（`English / 中文`）、摘要正文、`View all similar requests` 相似条目折叠卡（支持点击直接跳转至关联条目）、蓝色鉴权提示横幅（`Please authenticate to join the conversation. Sign in / Sign up →`）、`Comments` 与 `Activity feed` 标签页切换、状态变更时间轴（含绿勾 `Completed` 与蓝半圆 `In Progress` 状态节点及连接竖线）。
  2. **右列元数据与订阅侧栏**：`Upvoters` 点赞计数按钮（支持交互切换）、`Status` 彩色胶囊、`Board` 类型胶囊、`Tags` 优先级胶囊、`Date` 时间、`Author`（带认证蓝勾头像与 `Soulter`）、外链列表，以及底部 `Subscribe to request` 邮件通知订阅区（`Get notified` 按钮 + 右下角扩音器线稿插画）。
  3. **弹窗右上角外挂导航**：复刻参考图右上角悬浮 `▲ / ▼` 上下条目切换按钮（支持鼠标点击及键盘 `ArrowUp` / `ArrowDown` / `Escape` 快捷键）。
- 遗留问题: 待用户在前端逐轮微调完弹窗样式后，统一整理后端接线契约（如真实 `votes` 点赞持久化、评论表与 `Activity feed` 状态流转审计日志、`author` / `createdAt` 字段、邮件订阅接口等）转交执行 AI 实现。
- Commit 建议: [feat]: roadmap 复刻卡片点击展开详情弹窗样式与上下切换交互

---

[2026-09-25 15:20] - Update by AI完成改动:
- 修改了 `packages/roadmap/src/react/roadmap-detail-modal.tsx`、`packages/roadmap/src/react/roadmap-lane.tsx` 及单测 `packages/roadmap/src/react/__tests__/roadmap-board.test.tsx`，完成详情弹窗与看板第一轮修改：
  1. **弹窗位置上移至导航栏下方**：将弹窗容器由垂直居中（`items-center`）调整为顶部对齐（`items-start pt-[calc(var(--navbar-height,64px)+24px)]`），使展开后的详情面板紧贴顶部导航栏下方最佳视觉高度。
  2. **仅在 `Backlog`（`status === 'reviewing'`）阶段新增 `+` 创建按钮**：
     - 在详情弹窗右侧 `▲ / ▼` 上下切换条正下方新增 `+` 按钮（仅当当前查看条目处于 `Backlog` 状态时渲染）。
     - 在看板主视图 `Backlog` 列头右侧同步提供 `+` 按钮（其他列如 `Next up` / `In Progress` / `Done` 不显示）。
  3. **移除 `Comments` 讨论板块与蓝色登录横幅**：替换为英文页签 `Details`，具体内容待定，当前渲染干净的空白预留栏目（`Pending specification`），与 `Activity feed` 并列切换。
  4. **移除右侧元数据栏 `Upvoters`（`点赞者：50`）行**：精简右侧属性栏为 `Status`、`Board`、`Tags`、`Date`、`Author` 及 `Links`。
- 遗留问题: `+` 新增 Backlog 条目按钮的具体交互/弹窗表单、`Details` 栏目具体业务结构及后续轮次样式微调待下一轮指令继续推进。
- Commit 建议: [feat]: roadmap 详情弹窗第一轮样式微调与 Backlog 新增按钮接入

---

[2026-09-25 15:40] - Update by AI完成改动:
- 修改了 `packages/roadmap/src/react/roadmap-detail-modal.tsx` 及单测 `packages/roadmap/src/react/__tests__/roadmap-board.test.tsx`，完成详情弹窗第二轮修改：
  1. **在 `Activity feed` 后新增 `Editor` 编辑栏目**：
     - 页签栏现依次为 `Details`、`Activity feed`、`Editor`。
     - `Editor` 面板内支持直接编辑三项内容：
       1. **标题 (`Title`)**：默认载入当前条目的双语标题（如 `Interest-based reply method / 基于兴趣点的回复策略`），编辑时实时联动更新弹窗顶部标题。
       2. **小结 (`Summary`)**：默认载入当前语言下的条目小结（如 `围绕读者关心的内容组织回复。`），编辑时实时联动更新弹窗顶部小结。
       3. **Detail (`具体内容`)**：多行文本编辑区，填写后切换到 `Details` 栏目即可预览对应具体内容。
  2. **右下角区域改为回退/删除提议区域（`Revert or delete`）**：
     - 保持原卡片排版层级（标题 `Revert or delete` + 说明文案 `删除或者回退此提议。`）。
     - 按钮调整为两个：一个**白色 `Undo` 按钮**（回退阶段）与一个**蓝色 `Delete` 按钮**（删除提议）。
     - 当条目位于最左侧 `Backlog`（`status === 'reviewing'`）阶段时，隐藏 `Undo` 按钮，**仅显示蓝色 `Delete` 按钮**。
- 遗留问题: 待用户下一轮对 `Editor` 与 `Undo / Delete` 区域做进一步样式微调，并在前端样式定稿后汇总为后端接口需求（条目编辑保存、状态回退、条目删除、Backlog 新增等）移交执行 AI。
- Commit 建议: [feat]: roadmap 详情弹窗新增 Editor 编辑栏目与右下角 Undo/Delete 操作区

---

[2026-09-25 15:54] - Update by AI完成改动:
- 修改了 `packages/roadmap/src/react/roadmap-lane.tsx`、`packages/roadmap/src/react/roadmap-detail-modal.tsx` 及单测 `packages/roadmap/src/react/__tests__/roadmap-board.test.tsx`，完成详情弹窗第三轮修改：
  1. **移除外层 `Backlog` 列头的 `+` 按钮**：删除 `RoadmapLane` 列头右侧的 `+` 按钮，仅在卡片点击展开详情弹窗（`RoadmapDetailModal`）且当前条目属于 `Backlog`（`status === 'reviewing'`）时，在弹窗右侧 `▲ / ▼` 切换条下方显示 `+` 新增按钮。
  2. **重构优化 `Editor` 编辑栏目样式**：
     - 修正全局 `--radius-lg: 20px` 导致单行/多行输入框变为大椭圆胶囊的样式问题，统一采用利落的 `rounded-[7px]` / `rounded-[10px]` 圆角与 `resize-none` 无拖拽手柄设计。
     - 采用分段式工作台卡片布局（顶栏 `Proposal Editor` + `Live sync` 标识与 `Reset` 重置按钮；中部 `01 标题 · Title`、`02 小结 · Summary` 字数统计、`03 Detail · 具体内容` 三段紧凑分割表单；底栏 `Preview Details` 与 `Save` 按钮）。
  3. **右侧 `Board` 与 `Tags` 支持自由点击下拉切换**：
     - `Board` 属性胶囊支持点击展开下拉面板，在 `Feature Request`、`Improvement`、`Maintenance` 三种类型间自由切换。
     - `Tags` 属性胶囊支持点击展开下拉面板，在 `High Priority`、`Middle Priority`、`Low Priority`、`No Priority` 四种优先级标签间自由切换。
- 遗留问题: 待用户继续审阅并在前端样式全部定稿后，统一梳理后端接线契约移交执行 AI。
- Commit 建议: [feat]: roadmap 详情弹窗优化 Editor 样式、收拢 Backlog 新增按钮并支持 Board/Tags 自由切换

---

[2026-09-25 17:25] - Update by AI完成改动:
- 修改了 `packages/roadmap/src/react/roadmap-detail-modal.tsx`，完成详情弹窗第四轮细节打磨：
  1. **去除侧边栏文案句号**：将右下角 `Revert or delete` 区域的说明文案由 `删除或者回退此提议。` 修正为 `删除或者回退此提议`（去除句末句号）。
  2. **重构 `Board` 与 `Tags` 下拉选择菜单为扁平化无嵌套样式**：
     - 将下拉指示箭头 `▾` 收纳进触发器胶囊边框内部，消除原先独立悬在胶囊外部的分离感。
     - 展开的下拉菜单（`w-[164px]`，严格收纳于右侧边栏宽度内不越界）去除原先「外层容器 → 选中灰框 → 内部带边框胶囊」的三层套娃结构，改为极简扁平菜单行（左侧彩色图标/圆点 + 文本标签，右侧当前选中项蓝色 `✓`），视觉层级干净利落。
- 遗留问题: 待用户确认前端样式是否定稿，随后整理后端接线需求清单移交执行 AI。
- Commit 建议: [feat]: roadmap 详情弹窗扁平化重构 Board/Tags 下拉选项并精简侧栏文案

---

## 3. 后端接线技术规格书（Backend Wiring Specification）

> **目标读者**：执行 AI（Execution AI）与主控裁定人  
> **架构约束**：严格遵循 `B-28` Phase 4 冻结声明的三通道边界——一切扩展仅经由 `@incept/roadmap` 导出契约（`domain` / `ports` / `adapters/prisma` / `next` / `react`）、`apps/web/src/server/roadmap/assembly.ts` 宿主装配注入，以及受控的 `@incept/db` Prisma Schema 迁移完成，严禁在 `apps/web` 页面层直接绕过端口写裸 Prisma 查询。

### 3.1 既有后端能力盘点（可直接复用的路由与写端口）

当前 `packages/roadmap/src/ports/roadmap-writer.ts`、`packages/roadmap/src/endpoints.ts`（`roadmapEndpoints`）与 `packages/roadmap/src/next/roadmap-routes.ts` 已具备以下现成能力（宿主路由 stub 挂载于 `apps/web/src/app/api/internal/roadmap/*`，由 `authorizeOwner` 门控；注意 `/studio/roadmap` 仅是后台页面路由 `apps/web/src/app/[locale]/studio/roadmap/page.tsx`，**全仓 API 统一走 `/api/internal/roadmap/*` 且客户端必须引用 `roadmapEndpoints` 常量，禁止散写端点路径**）：

| 既有接口 / 端口方法 | `roadmapEndpoints` 键与实际 HTTP 路径 | 当前已支持的载荷字段 | 可直接对接的前端交互点 |
| :--- | :--- | :--- | :--- |
| `writer.createEntry` | `roadmapEndpoints.entries`<br>`POST /api/internal/roadmap/entries` | `roadmapKey`, `key`, `status`, `type`, `priority`, `title: {en,zh}`, `summary: {en,zh}`, `order`, `links` | 详情弹窗右侧 `Backlog` 专属 `+` 按钮（新建 `status: 'reviewing'` 条目） |
| `writer.updateEntry` | `roadmapEndpoints.entry(key)`<br>`PATCH /api/internal/roadmap/entries/[key]` | `status`, `type`, `priority`, `title: {en,zh}`, `summary: {en,zh}`, `order`, `links` | 1. 弹窗右侧 `Board` 下拉切换（改 `type`）<br>2. 弹窗右侧 `Tags` 下拉切换（改 `priority`）<br>3. `Editor` 栏保存 `Title` / `Summary`<br>4. 右下角白色 `Undo` 按钮（回退 `status`） |
| `writer.deleteEntry` | `roadmapEndpoints.entry(key)`<br>`DELETE /api/internal/roadmap/entries/[key]` | `key`（路径参数） | 右下角蓝色 `Delete` 按钮（永久删除该提议条目） |

---

### 3.2 各前端交互模块的后端接线拆解（Modules A – G）

#### 模块 A：`Editor` 栏目（`01 标题` / `02 小结` / `03 Detail`）与 `Details` 预览栏（已按 `U1 方案 A` 定案）
1. **字段映射与 Schema 增量**：
   - **数据库增量（`@incept/db`）**：在 `packages/db/prisma/schema.prisma` 的 `model RoadmapEntry` 新增可空双语详情列 `detailEn String?` 与 `detailZh String?`（升级 `prismaSchemaRevision` 并生成受控迁移）。
   - **领域与端口增量（`@incept/roadmap`）**：在 `RoadmapEntry`、`RoadmapEntryDraft`、`RoadmapEntryPatch`、`RoadmapEntryRow`、`toEntry()` 及 `parseEntryPatch` 中新增 `detail?: LocalizedText`。
   - **单框双语保存规则（`U1 方案 A`）**：
     - `01 标题 · Title`：前端展示为 `${title.en} / ${title.zh}`；保存时按首个 ` / ` 拆分为 `{ en, zh }`（若未包含 ` / ` 分隔符，则 `{ en: val, zh: val }` 双语同文写入，确保满足 `validate` 双语非空约束）。
     - `02 小结 · Summary` 与 `03 Detail · 具体内容`：在当前 `locale`（`en` 或 `zh`）下编辑时更新对应语种字段；若另一语种为空（如首次新建或首次补充 `Detail`），自动以当前编辑文本作为另一语种兜底值写入。
   - **前端联动**：点击 `Editor` 底栏 `Save` 按钮调用 `PATCH ${roadmapEndpoints.entry(key)}`（新建模式下调用 `POST ${roadmapEndpoints.entries}`）；`Details` 页签直接读取 `entry.detail?.[locale]` 渲染（为空时显示 `Pending specification` 占位）。

#### 模块 B：右侧边栏 `Board` 与 `Tags` 扁平下拉选择器
1. **触发机制**：
   - 在 `Board` 下拉菜单选择 `Feature Request` (`feature`) / `Improvement` (`improvement`) / `Maintenance` (`maintenance`) 时，乐观更新 UI 并调用 `PATCH ${roadmapEndpoints.entry(key)}`，载荷为 `{ type: selectedType }`。
   - 在 `Tags` 下拉菜单选择 `High Priority` (`high`) / `Middle Priority` (`middle`) / `Low Priority` (`low`) / `No Priority` (`none`) 时，乐观更新 UI 并调用 `PATCH ${roadmapEndpoints.entry(key)}`，载荷为 `{ priority: selectedPriority }`。
   - 成功后触发 `router.refresh()` 或更新本地 `entries` 状态，使关闭弹窗后外层看板卡片同步刷新。

#### 模块 C：右下角 `Revert or delete`（白色 `Undo` + 蓝色 `Delete`）
1. **白色 `Undo` 按钮（阶段回退）**：
   - **前置条件**：仅当 `entry.status !== 'reviewing'`（非最左侧 `Backlog` 列）且 `canEdit === true` 时渲染。
   - **状态回退规则**：基于当前看板 `roadmap.columns` 的列顺序（例如 `['reviewing', 'unstarted', 'active', 'completed']`，即 `Backlog ← Next up ← In Progress ← Done`），查找当前 `entry.status` 在 `columns` 中的索引 `idx`，目标状态为 `prevStatus = roadmap.columns[idx - 1].status`（若当前状态不在板列定义中，则按固定枚举序 `completed -> active -> unstarted -> reviewing` 回退一级）。
   - **接口调用**：`PATCH ${roadmapEndpoints.entry(key)}`，载荷为 `{ status: prevStatus }`。
2. **蓝色 `Delete` 按钮（删除提议）**：
   - **适用范围**：所有阶段（含 `Backlog`）在 `canEdit === true` 下均可调用。
   - **接口调用**：`DELETE ${roadmapEndpoints.entry(key)}`；删除成功后从看板移除该条目并切换至相邻条目或关闭弹窗。

#### 模块 D：弹窗右上角 `Backlog` 专属 `+` 新增条目按钮（已按 `U3` 定案）
1. **显示条件**：仅当 `canEdit === true`、展开 `RoadmapDetailModal` 且当前条目 `entry.status === 'reviewing'`（`Backlog`）时，显示在 `▲ / ▼` 切换条正下方。
2. **新建交互流程（`U3` 定案：弹窗内清空并切到 `Editor`，点 `Save` 才发 `POST`）**：
   - 点击 `+` 按钮时**不立即发送网络请求**，而是将当前弹窗切换为 **新建草稿态（`mode: 'create'`）**：
     - 清空弹窗内的 `editedTitle`、`editedSummary`、`editedDetail` 输入框；
     - 状态固定锁定为 `status: 'reviewing'`（`Backlog`），默认 `type: 'feature'`、`priority: 'middle'`；
     - **自动将当前激活页签切换至 `Editor`**。
   - 当 Owner 填写完毕并点击 `Editor` 底栏的 **`Save`** 按钮时，才发起 `POST ${roadmapEndpoints.entries}`（`/api/internal/roadmap/entries`，调用 `writer.createEntry`）持久化落库，成功后退出新建态并展示新创建的条目。

#### 模块 E：`Activity feed` 状态流转时间轴与右侧 `Date` / `Author` 元数据（已按 `U4 方案 A` 定案）
1. **代码现状精准定位（无需改动 Prisma 查询与 Row 类型）**：
   - `packages/roadmap/src/adapters/prisma/roadmap-repository.ts` 中的 `RoadmapEntryRow`（第 49–50 行）**已声明 `createdAt: Date; updatedAt: Date;`**，且 `RoadmapPrismaClient` 的 `findUnique` / `findMany` 查询**已完整带出这两个字段的数值**。
   - 当前缺失的原因仅仅是 **`toEntry()`（第 103–121 行，同时被 `roadmap-writer.ts` 复用）在将 `RoadmapEntryRow` 映射为 `RoadmapEntry` 时主动丢弃了 `row.createdAt` 与 `row.updatedAt`**。
2. **精确改动点清单（共 5 处，零查询层改动）**：
   1. **域类型（`packages/roadmap/src/domain/types.ts`）**：在 `RoadmapEntry` 上补充 `createdAt?: string; updatedAt?: string;`（ISO 8601 字符串）。
   2. **行到域映射（`packages/roadmap/src/adapters/prisma/roadmap-repository.ts`）**：在 `toEntry()` 返回对象中补充 `createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()`。
   3. **领域校验（`packages/roadmap/src/domain/validate.ts`）**：在 `validateEntry` 中对可选的 `createdAt` / `updatedAt` 非空字符串做兼容校验。
   4. **Fixture 样本（`packages/roadmap/src/testing/fixtures.ts`）**：按需补充样本条目的 `createdAt` / `updatedAt` ISO 时间戳。
   5. **单测同步（`roadmap-repository.test.ts` / `roadmap-writer.test.ts`）**：同步断言 `toEntry()` 映射出的 `createdAt` 与 `updatedAt` 字段。
3. **前端渲染**：右侧 `Date` 根据 `entry.createdAt` 计算真实相对时间，`Author` 固定展示项目 Owner `Soulter`；`Activity feed` 直接根据 `entry.updatedAt` 与 `entry.createdAt` 动态生成状态节点。

#### 模块 F：顶栏右侧 `RoadmapToolbar`（`导入 / Import` 文件上传 + `选择项目 / Select project` 看板切换）（已按 `U5` / `U6` 定案）
1. **「导入（Import）」按钮（`U5` 定案：纯 JSON 文件上传，不做粘贴面板）**：
   - **权限显隐**：仅对已登录 Owner（`canEdit === true`）显示「导入 / Import」按钮；普通访客隐藏。
   - **交互方式**：点击「导入」直接触发浏览器原生文件选择器（`<input type="file" accept=".json,application/json" />`），**不做弹窗粘贴面板**，保持结构简洁并方便后续扩展其他文件格式。
   - **后端接口**：在 `roadmapEndpoints` 新增 `import: '/api/internal/roadmap/import'` 及宿主 stub `apps/web/src/app/api/internal/roadmap/import/route.ts`（或复用批量写端口 `writer.importEntries`），批量校验双语对等并事务性 upsert 条目后刷新看板。
   - **核心架构红线（重申 `docs/decisions/{en,zh}/roadmap-integration-surface.md` 决策第 1 条原文）**：
     > **路线图存储的是人写的内容：高度抽象，绝不从 `docs/NEXT.md`、`docs/BACKLOG.md` 或 `docs/finish-task/` 自动派生。**  
     > 导入通道仅接受人工编写维护的 Roadmap JSON 清单（`RoadmapImportManifest`），严禁编写任何扫描或解析仓库内 `docs/NEXT.md`、`docs/BACKLOG.md`、`docs/finish-task/` 的自动派生导入器。
2. **「选择项目（Select project）」下拉框（`U6` 定案：与左侧切换器联动切换不同项目的 Roadmap）**：
   - **业务语义**：不新增条目级子项目字段，直接与左侧 `RoadmapSwitcher`（`路线图` / `图谱板` 等多项目看板）共享数据源并双向联动，**用于切换不同项目的 Roadmap 看板（`?rd=<roadmap.key>`）**。
   - **交互接线**：下拉列表渲染 `roadmaps` 集合；选中任意项目时通过路由跳转至 `/${locale}/atlas/roadmap?rd=${key}`，与左侧切换胶囊保持完全同步的高亮状态。

#### 模块 G：公开页 `/atlas/roadmap` 访客与 Owner 权限门控（已按 `U2` 定案）
1. **服务端 RSC 权限判定**：
   - 注意 `apps/web/src/server/roadmap/assembly.ts` 中的 `authorizeOwner(request)` 依赖 HTTP `Request` 与 `hasSameOrigin(request)`，仅适用于 Route Handler。
   - 在 Next.js 服务端页面 `apps/web/src/app/[locale]/atlas/roadmap/page.tsx` 中，应通过 `assembly.ts` 暴露无参辅助函数 `isRoadmapOwner(): Promise<boolean>`（内部调用 `(await getCurrentViewer()).role === 'owner'`）计算出 `canEdit: boolean`，并传入 `<RoadmapBoard canEdit={canEdit} />` 与 `<RoadmapToolbar canEdit={canEdit} />`。
2. **未登录普通访客（`canEdit === false`）的隐藏规则（`U2` 定案）**：
   - **弹窗页签栏**：隐藏 `Editor` 页签（仅展示 `Details` 与 `Activity feed`）。
   - **弹窗右上角**：隐藏 `Backlog` 的 `+` 新增按钮（仅保留 `▲ / ▼` 上下翻页按钮）。
   - **弹窗右侧栏**：`Board` 与 `Tags` 退化为纯静态只读胶囊（隐藏下拉箭头 `▾`，不可点击展开下拉菜单）；底部**整体隐藏 `Revert or delete`（`Undo` / `Delete`）区域**。
   - **顶栏工具条**：隐藏 `导入 / Import` 按钮，仅保留 `选择项目 / Select project` 下拉切换器。

---

### 3.3 主控裁定汇总表（`U1` – `U6` 全部定案，2026-09-25）

| 编号 | 议题 | 最终裁定结果 |
| :--- | :--- | :--- |
| **`U1`** | `Editor` 双语字段与 `Detail` 存储 | **方案 A**：DB 新增 `detailEn` / `detailZh`；`Title` 按 ` / ` 拆分双语；`Summary` 与 `Detail` 更新当前 `locale` 并在另一语种为空时自动同文兜底。 |
| **`U2`** | 普通未登录访客的界面权限 | **隐藏写控件标签**：RSC 通过 `(await getCurrentViewer()).role === 'owner'` 计算 `canEdit`；`canEdit === false` 时隐藏 `Editor` 页签、`Backlog` `+` 按钮、`Board/Tags` 下拉箭头、`Revert or delete` 区域及顶栏 `导入` 按钮。 |
| **`U3`** | `Backlog` `+` 按钮点击行为 | **弹窗内清空并自动切到 `Editor` 页签**：不立即发请求，用户填写完点击 `Save` 时才发送 `POST /api/internal/roadmap/entries`（`roadmapEndpoints.entries`）创建。 |
| **`U4`** | `Activity feed` 与 `Date/Author` 数据源 | **方案 A（轻量零建表）**：`RoadmapEntryRow` 与 Prisma 查询已带出 `createdAt` / `updatedAt`，只需在 `toEntry()` 映射、域类型 `RoadmapEntry`、校验、fixture 与单测中保留并转为 ISO 字符串，无需改 Prisma 查询；`Author` 固定为 `Soulter`。 |
| **`U5`** | 顶栏「导入（Import）」功能 | **纯文件上传 JSON 清单批量写入**（`<input type="file" accept=".json" />`，不做粘贴面板，走 `/api/internal/roadmap/import`）；**严守 `roadmap-integration-surface` 决策红线：绝不从 `docs/NEXT.md`、`docs/BACKLOG.md` 或 `docs/finish-task/` 自动派生**。 |
| **`U6`** | 顶栏「选择项目（Select project）」语义 | **与左侧 `路线图 / 图谱板` 联动切换不同项目的 Roadmap（`?rd=<key>`）**，只切换不同项目的看板。 |

---

[2026-09-25] - Update by AI完成改动:
- 后端接线执行完成（按 §3 规格 Modules A–G + 主控 U1–U6 裁定 + M1–M5 评审修订，Phase 0–4 计划经主控批准后分四个提交落地）：
  1. **Phase 0（`87b1fe4`）**：`RoadmapEntry` 增 `detailEn/detailZh`（可空双语对），migration `20260925120000_add_roadmap_entry_detail` 纯 datamodel diff 生成、`prisma migrate deploy` 授权执行；`detail?/createdAt?/updatedAt?` 进域类型与校验；`RoadmapEntryPatch` 显式放行 `detail: null`（M1：Partial 基 Omit 掉 detail，交集属性会把 null 挤掉）。
  2. **Phase 1（`afe4d94`）**：`toEntry` 映射 detail（双 NULL 省略、单边值映射成空半边交校验拒绝）与 ISO 时间戳；writer 合并表达式钉死 `patch.detail === null ? undefined : (patch.detail ?? current.detail)`（M2）并从写回 row 回填时间戳；缺省 key 由 `title.en` slug 生成 + 碰撞后缀；fixtures/seed 补 detail 样本；M2 三态回归哨兵（含"未传不清空"）入测。
  3. **Phase 2（`b4d17a7`）**：`RoadmapImportManifest`（仅条目）+ `writer.importEntries`（全量校验后单事务幂等 upsert、条目间 key 冲突拒绝、links 整体重写）+ `roadmapEndpoints.import` + `POST /api/internal/roadmap/import`（宿主 stub 同族惯例）；导入路由注释明示反自动派生红线（grep 确认零代码读取 docs/NEXT.md、BACKLOG.md、finish-task）。
  4. **Phase 3（`2579ac9`）**：`assembly.isRoadmapOwner()`（规格指名位置）→ `canEdit` 下传；Editor Save（U1 拆分/兜底）、Backlog `+` 草稿态 Save 才 POST（U3）、Board/Tags 乐观 PATCH 失败回滚、Undo 回退一档、Delete 确认删除；`Date`/`Activity feed` 用 createdAt/updatedAt 诚实表述（M4：第二节点只写「最后更新于」，禁写状态变更时间）；toolbar 导入走原生文件上传（U5）与 Select project 锚点导航 `?rd=`（U6）；非 Owner 全部写控件隐藏（U2）；新增文案中英各一条进 messages + RoadmapChrome（M5）。
- 验收证据分级（M3）：**主证据 = 组件测试**（15 例，含 canEdit=false 全写控件不可见）+ 假 viewer 服务端断言（`isRoadmapOwner()` 对 guest 为 false）+ 匿名 API 实测（POST/PATCH/DELETE/import 全部 `404 {"error":"Not found."}`）；匿名 HTML 抓取为**弱证据**（弹窗为客户端条件渲染），不作门禁。
- 全量验证：五包 typecheck 绿、335 测试绿（roadmap 57 / web 18 / music 187 / core 73）、build 绿（含 import 路由）、`pnpm roadmap:seed` 幂等。owner 浏览器走查（弹窗 Save/Undo/Delete/+/导入 + studio 表单）留待主控。
- Commit: [feat(db,roadmap) 87b1fe4 / feat(roadmap) afe4d94 / feat b4d17a7 / feat 2579ac9]，记录归 [docs]。

[2026-09-25] - Update by AI（样式二次调优第一轮：暗色模式白边消除、展开弹窗发蓝背景修正与单页分栏隐藏滚动）:
- **暗色模式面板与选项白边消除（对应需求 1）**：
  - 在 `apps/web/src/styles/theme.css`（`:root` / `.dark` / `warm` 护眼模式）中引入专属暗色层级表面与低对比边界变量：`--roadmap-lane-bg: #0c0c0f`、`--roadmap-card-bg: #131317`、`--roadmap-modal-bg: #111115`、`--roadmap-popover-bg: #16161c`、`--roadmap-border: rgba(255, 255, 255, 0.065)`、`--roadmap-border-hover: rgba(255, 255, 255, 0.13)`，并将 `.dark` 下 `type` / `priority` 胶囊边框透明度由 `0.25~0.28` 下调至 `0.16~0.18`。
  - 在 `RoadmapLane`、`RoadmapCard`、`RoadmapSwitcher` 与 `RoadmapToolbar` 中将原 `border-[var(--color-border)]` 与 `hover:border-[var(--color-text-soft)]` 替换为 `--roadmap-border` 与 `--roadmap-border-hover`。
  - 修复 `RoadmapToolbar` 下拉选项由于 `tokens.css` 中 `--radius-lg: 20px` 导致的胶囊状亮边包裹问题，将下拉列表容器改为 `rounded-[10px] bg-[var(--roadmap-popover-bg)]`，内部选项行改为 `rounded-[6px]` 无边框柔和选中底色。
- **展开弹窗背景发蓝与内部白边修正（对应需求 2）**：
  - 原因定位：`packages/roadmap/src/react/roadmap-detail-modal.tsx` 遮罩层此前使用了 `bg-slate-950/35`（`#020617` 藏青蓝色），叠加 `backdrop-blur-[3px]` 后在纯黑 `#050505` 页面上会将整屏染成深蓝色。
  - 修复：将遮罩层改为中性纯黑 `bg-black/45 dark:bg-black/72`；将弹窗主面板与内部 `View all similar requests`、`Activity feed` 时间轴节点、`Proposal Editor` 输入框、右侧 `Board`/`Tags` 浮层、作者认证角标 `ring` 以及 `Undo` 按钮全部切换为 `--roadmap-modal-bg`、`--roadmap-card-bg` 与 `--roadmap-border`，并将 `statusPillStyles` 改为引用主题感知的 `--roadmap-status-*` 变量。
- **桌面端标签页锁死单屏高度 + 各状态纵列独立滑动且隐藏滚动条（对应需求 3）**：
  - 在 `apps/web/src/app/[locale]/atlas/roadmap/page.tsx` 中将桌面端页面外层容器固定为单屏视口高度 `md:flex md:h-[calc(100dvh-var(--navbar-height,64px))] md:flex-col md:overflow-hidden`，头部与工具栏设为 `md:shrink-0`。
  - 在 `packages/roadmap/src/react/roadmap-board.tsx` 与 `packages/roadmap/src/react/roadmap-lane.tsx` 中设为 `md:min-h-0 md:flex-1 md:items-stretch` 与 `md:max-h-full md:min-h-0 md:overflow-hidden`，令每一列（`Backlog` / `Next up` / `In Progress` / `Done`）的卡片列表 `<ul className="... md:min-h-0 md:flex-1 md:overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">` 在列内独立纵向滚动并隐藏滚动条，不再撑高或滚动整个浏览器标签页。

[2026-09-25] - Update by AI（样式二次调优第二轮：暗色模式发紫验证与纯中性灰校正、嵌套边框与白边彻底清零、看板网格按条目动态伸缩）:
- **验证并修复暗色背景轻微发紫问题（对应需求 4，图 4）**：
  - **原因验证**：第一轮暗色表面色值使用了 `#0c0c0f`（RGB `12, 12, 15`）、`#131317`（RGB `19, 19, 23`）、`#111115`（RGB `17, 17, 21`）与 `#16161c`（RGB `22, 22, 28`）。由于这些颜色的蓝色通道（`B`）高于红/绿通道（`R = G < B`），在 HSL 色相环中恰好落在 **Hue `240°`（蓝紫/靛紫色相）**，在页面纯中性黑 `#050505`（`R=G=B=5`，饱和度 `0%`）衬托下必然呈现轻微发紫。
  - **修复**：在 `apps/web/src/styles/theme.css` 中将 `.dark` 所有表面色全部替换为 **100% 纯中性无彩色灰（`R = G = B`，饱和度 `0%`）**：`--roadmap-lane-bg: #0b0b0b`、`--roadmap-card-bg: #141414`、`--roadmap-card-hover-bg: #191919`、`--roadmap-modal-bg: #121212`、`--roadmap-popover-bg: #181818`、`--roadmap-chip-bg: #1e1e1e`。
- **彻底解决暗色模式白边与三层嵌套边框问题（对应需求 1、需求 2，图 1、图 2）**：
  - **原因**：Chromium 在圆角元素（`rounded-full` / `rounded-xl`）上绘制 `rgba(255, 255, 255, 0.065)` 半透明白色边框时，白色像素在暗底边缘抗锯齿会产生一圈明显白边（`导入` / `图谱板 v` 按钮及卡片边缘）；同时「列外框 border → 卡片 border → 标签胶囊 border」形成三层同心圆角嵌套框；且在较矮窗口下硬高度截断导致图 1 中单张卡片底部的 `Improvement` / `Middle Priority` 被裁切。
  - **修复**：
    1. 在 `.dark` 下将 `--roadmap-lane-border`、`--roadmap-border`、`--roadmap-border-hover`、`--roadmap-chip-border` 及全部 `type`/`priority` 胶囊边框统一设为 `transparent`（零白边、零同心嵌套框），仅用纯中性灰阶表面明度（`#050505` → `#0b0b0b` → `#141414` → `#191919`）区分层级；弹窗内部结构分割线独立使用 `--roadmap-divider: #1f1f1f`（深炭灰，不反白光）。
    2. 在 `page.tsx` 增加 `md:min-h-[560px]` 并在 `RoadmapLane` 的 `<ul>` 增加 `py-0.5`，保证即使窗口极矮时单张卡片也绝不会被裁切底部标签。
- **看板网格动态延伸与收缩（对应需求 3，图 3）**：
  - **原因**：第一轮在 `RoadmapBoard` 上使用了 `md:items-stretch`，导致当页面锁死全屏高度时，只有 1 个卡片（`Planned 1`、`Shipped 1`）或 0 个卡片（`Building 0`）的纵列也被强制拉长到底部。
  - **修复**：将 `RoadmapBoard` 网格改为 `md:grid-rows-[minmax(0,1fr)] md:items-start`，配合 `RoadmapLane` 的 `md:max-h-full md:self-start`：当列内只有 0 个（空占位算作 1 个）或 1~2 个卡片时，纵列背景框**自动收缩包裹卡片位置**；当列内卡片增多时动态向下延伸，直至触达单屏底部上限（`max-h-full`）后在列内开启无滚动条独立纵向滑动。

[2026-09-26] - Update by AI（第三轮：弹窗圆角裁剪修复、Author 改为 cpp/C、createPortal 消除退出闪屏，以及 Activity feed / Similar requests 后端方案汇报）:
- **弹窗圆角边框裁剪错误修复（对应需求 1，图 1）**：
  - **原因**：`RoadmapDetailModal` 外层容器为了放置右侧 `-right-11` 悬浮按钮使用了 `overflow-visible rounded-[16px]`，而内部右侧 `<aside>` 带有浅灰背景却未设置右侧圆角，导致 90° 直角灰底溢出 16px 圆角外框。
  - **修复**：为 `<aside>` 补充 `rounded-b-[15px] md:rounded-bl-none md:rounded-r-[15px]`，左侧主列补充 `rounded-t-[15px] md:rounded-tr-none md:rounded-l-[15px]`，严丝合缝贴合 16px 圆角内缘。
- **Author 固定写死为 `cpp`、头像字母改为 `C`（对应需求 2，图 2）**：
  - 已将右侧元数据栏 `Author` 头像字母由 `S` 改为 **`C`**、名称由 `Soulter` 改为 **`cpp`**，并同步更新 `Activity feed` 时间轴节点中的署名为 **`cpp`**。
- **点击空白处退出详情模式单次闪屏修复（对应需求 5）**：
  - **原因**：此前 `RoadmapDetailModal` 直接作为子节点内联挂载在 `<section aria-label={chrome.boardLabel}>` 看板布局树内部，且 `<article tabIndex={0}>` 缺少 `outline-none`；点击空白遮罩卸载时，浏览器在同一帧内销毁 `backdrop-blur-[3px]` 合成层、重排父级 `<section>` 并触发底层卡片焦点环重绘，造成单帧全屏闪烁。
  - **修复**：改用 `createPortal(modalNode, document.body)` 将弹窗提升至 `document.body` 顶层独立挂载（与看板 `<section>` 布局树完全解耦），在遮罩层添加 `transform-gpu will-change-[opacity]` 与 `onMouseDown` 焦点防抖，并为 `RoadmapCard` 补充 `outline-none`。
- **`Date` 与 `Activity feed` 落地（对应需求 3，按主控裁定落地方案 3-A）**：
  - **右侧元数据 `Date`**：升级为 `formatCalendarDate`（`YYYY-MM-DD (相对时间)`，如 `2026-09-25 (昨天)`），优先使用条目的真实 `createdAt`。
  - **`Activity feed` 轻量动态时间轴（方案 3-A，零新表零冗余）**：
    - 节点 1：提议创建节点（绿色打勾图标，显示 `cpp` 创建了此提议，右侧附带格式化创建日期）。
    - 节点 2：当前阶段与优先级更新动态摘要（蓝色半实心圆图标，动态反映当前条目的阶段名称与优先级标签，并附带最后更新时间 `updatedAt`）。
  - **议题三方案 3-B 归档为 Backlog 优化项**：完整的 `RoadmapEntryActivity` 事件流审计表方案已按主控裁定注册至 `docs/BACKLOG.md`（条目 `B-30 Roadmap Entry Audit Trail & Activity Event Stream (Scheme 3-B)`），留待后续多人协作审计需求出现时启动。
- **`View all similar requests` 相似提议算法与门禁（对应需求 4，按主控裁定落地方案 4-B）**：
  - 新增 `packages/roadmap/src/domain/similar.ts` 与单测 `packages/roadmap/src/domain/__tests__/similar.test.ts`。
  - **分词器（`tokenizeBilingualText`）**：提取长度 $\ge 3$ 的英文单词（过滤停用词）及中文 2-gram / 3-gram 词元。
  - **相似度打分（`scoreSimilarity`）**：标题核心词命中每项 $+10$ 分；小结词元命中每项 $+3$ 分；在已有文本重合前提下同类型 $+2$ 分、同优先级 $+1$ 分。
  - **严格门禁与自动隐藏（`MIN_SIMILARITY_SCORE = 10`）**：仅当候选项最高分达到 10 分（至少命中 1 个标题关键重合词或多个小结词元）时才推荐匹配条目；若无任何相似提议，`findSimilarEntry` 返回 `null`，弹窗内**彻底隐藏 `View all similar requests` 整个板块**（单测已全量覆盖有相似条目与无相似条目两种分支）。
- **全量验证与单测**：
  - `@incept/roadmap` 7 个测试文件、61 项单测全部通过（含新增的相似条目词元匹配、阈值拦截与弹窗条件隐藏测试）。
  - `@incept/roadmap` 与 `apps/web` 全量 TypeScript 类型检查 0 报错。

