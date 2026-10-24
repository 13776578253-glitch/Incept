# 路线图 / 规划图：空列建卡、规划图加号、编辑器瘦身

更新：2026-10-24 21:58（Asia/Singapore）。状态：**本地已改完并自测通过（`@incept/roadmap` 74 tests / typecheck / lint）；未提交、未构建镜像。**

## 1. 三个现场问题

| # | 现象 | 触发条件 |
| :--- | :--- | :--- |
| 1 | 规划图（Planning）的详情弹窗右侧没有「+」 | 弹窗里的加号写死 `entry.status === 'reviewing'`（Backlog），而规划图最左列是 `unstarted`（Planned），永远不满足 |
| 2 | 把条目全删光之后无法再从 0 建第一条 | 加号只挂在「某条已存在条目的弹窗」上；第一条不存在 → 打不开弹窗 → 没有入口 |
| 3 | 编辑器中文标签与说明句冗余 | `01 标题 · Title`、`02 小结 · Summary`、`03 Detail · 具体内容`、`EN / ZH 双语标题`、`同步展示于 Details 栏`、`删除或者回退此提议` |

附带的隐性 bug：新建条目的 POST 把 `status` 写死成 `'reviewing'`。即使加号在规划图出现，建出来的条目也会落到路线图的 Backlog 列，而不是当前板的 Planned 列。

## 2. 改动

### 2.1 新建列 = 板配置的第一列（不再写死 Backlog）

- `roadmap-board.tsx` 把 `columns[0].status` 作为 `createStatus` 传进弹窗。
- 弹窗用 `isFirstColumn` 取代 `isBacklog`：右侧浮动「+」、Undo 的隐藏条件都跟着板走。
- POST 的 `status` 由 `createStatus ?? entry.status` 决定，不再硬编码。
- 加号的 `aria-label` 改成 `Add ${statusLabel} entry`：路线图是 `Add Backlog entry`，规划图是 `Add Planned entry`（原测试断言不变）。

### 2.2 空列自救：列头右上角的「+」

- `roadmap-lane.tsx` 新增可选 `onCreateEntry` / `createEntryLabel`：`ml-auto` 的 24px 圆形「+」贴在列头右端，**只在 `entries.length === 0` 时渲染**。
- 只有最左列拿到这个回调（`index === 0`），符合“新建落在第一列”的规则。
- 点击后看板在内存里造一条 `draft:<ts>` 条目并打开同一个弹窗（创建态），**保存前不产生任何请求**。
- `draft.ts`（新增）：草稿 key 前缀 + `isDraftEntryKey`，弹窗与看板共用这一判定。
- 保存成功后看板把草稿从列表里剔除，再插入服务端返回的真实条目（否则会残留一张空卡）。
- 草稿态额外处理：不渲染「Revert or delete」块（没有可删的东西）、不渲染相似条目卡、标题为空时 Save 置灰。

### 2.3 编辑器瘦身

- 三行字段的标题统一成 `Title` / `Summary` / `Detail`。
- 删掉 `01/02/03` 序号块、`EN / ZH 双语标题`、`同步展示于 Details 栏`、`删除或者回退此提议`。
- 保留：`Proposal Editor` 顶栏、`Reset`（仅在有改动时）、`49 chars` 计数、底部 `Preview Details` / `Save`、`Changes reflect immediately in header`。

### 2.4 文案与宿主

- `RoadmapChrome.createEntryLabel?`（可选，缺省回退英文 `New entry`）。
- `apps/web/src/messages/{en,zh}/roadmap.json`：`createEntryLabel` = `New proposal` / `新建提议`。
- `apps/web/src/app/[locale]/roadmap/page.tsx` 注入该字段。

## 3. 验证

- `pnpm --filter @incept/roadmap test` → 7 files / **74 tests passed**（新增 3 条：规划图加号、空列建卡（断言 POST `status: 'unstarted'` + `roadmapKey: 'sample-atlas'`）、编辑器字段名与已删文案）。
- `pnpm --filter @incept/roadmap typecheck`、`pnpm --filter web typecheck`：通过。
- `pnpm --filter web exec eslint "src/app/[locale]/roadmap/page.tsx"`：无输出。
- 视觉未在浏览器里核对：本机没有可用的 headless 截图通道（Edge/Chrome 均被沙箱拦），改动沿用仓库现有按钮与边框类名。

## 4. 待确认

1. 序号 `01/02/03` 是我按“样式过于繁琐”一并删掉的，如果你想要回，一行就能加回来。
2. `EN / ZH 双语标题` 也一起删了（否则三行提示只剩一行，且与“删除标题”冲突）。若希望提示双语输入约定，建议改到 placeholder 里。
3. `Live sync` 徽章与 `Changes reflect immediately in header` 仍在：它们描述的是“编辑器里的改动会实时反映到弹窗标题”，不是落库同步，容易误读，可择机再改。
4. 空列「+」目前只在列表为空时出现；条目非空时仍需先进弹窗再加。是否要改成常驻（像 Trello 的 “Add a card”）待定。
