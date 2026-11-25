# Dashboard 时间范围切换性能交接

交接对象为 Gemini。验收工作树是 `.worktrees/web-redesign`，分支为 `refactor/web-frontend-v2`，HEAD 为 `c1afe647786d1264be65e8e426450c371e98d2c5`。性能改动与已有前端改动均保留在工作树，尚未提交。

## 问题和修复

强制刷新会推进同一采集上下文的代次，淘汰此前启动的预热。修复前，旧预热虽然不能写盘，新的冷切窗仍可按相同的导入签名加入它。受控复现中，30 天强制刷新已经读到 200 Tokens，首次请求 7 天仍收到旧预热的 100 Tokens，响应没有历史快照标记。

- 在途任务现在保存采集代次和导入签名。冷读、严格读、普通 SWR 和强制刷新只复用两者均匹配的任务。遇到已由别的窗口淘汰的任务时，替换任务沿用当前代次，避免连带淘汰仍在进行的有效刷新。正在等待旧任务的原始调用保留原有返回语义。 [refresh.ts](../../packages/dashboard/src/adapters/runtime/refresh.ts#L124)
- 已有过龄快照仍先返回并标记 `revalidating`，有效的后台任务继续单飞合并。没有快照的冷读与需要新鲜结果的严格读走交互采集。Worker、快照存储、Usage 路由、Billing 与 UI 组件沿用此前实现。

新增四个回归用例覆盖冷读、严格读、SWR 和强制刷新合并。测试还要求同一窗口的并发新请求复用同一个替换任务，并检查替换其他窗口的旧任务时不会使当前强制刷新的快照写入失效。 [snapshots.test.ts](../../packages/dashboard/src/__tests__/snapshots.test.ts#L202)

## 验收结果

| 检查 | 结果 |
| --- | --- |
| 本地 Owner Usage 冷切窗，实际 Worker 加受控 `ccusage` 子进程 | 3/3 返回 200 Tokens，服务端处理 13.4–13.9 ms。此时旧预热仍在等待。放行旧任务后，7 天磁盘快照保持 200 Tokens |
| 跨窗口和同窗口强制刷新 | 两者都在旧预热结束前启动，受控样本分别提前 373 ms 和 357 ms |
| 旧切片、并发导入 | 强制刷新后读取 7 天和 14 天均为 200 Tokens。导入后的并发严格读为 69 Tokens |
| 83,250 条合成记录，167 天，250 会话 | 7 天、30 天和全部共 15 次过龄快照快返。服务端处理 p50 为 2.23 ms，p95 为 21.47 ms。Token 分类与总量、缓存命中率、费用、会话数和日期边界检查通过 |
| Dashboard 定向用例 | 5 个文件，47 项通过。新增 4 项在修复前均复现失败 |
| Dashboard 全量 | 56 个文件通过，1 个预设跳过。407 项通过，2 项跳过 |
| Web Sync Usage 与 Dashboard 类型检查 | 5/5 通过，Dashboard 三份 TypeScript 配置均通过 |

计时来自隔离的服务端请求处理，登录浏览器的布局与交互沿用此前在 `localhost:3000/zh/dashboard` 的验收。这轮没有重启验收服务。

## 复现

在 `web-redesign/packages/dashboard` 中使用已有依赖运行以下用例。

```powershell
node node_modules/vitest/vitest.mjs run src/__tests__/snapshots.test.ts src/__tests__/worker-priority.test.ts src/__tests__/trusted-snapshots.test.ts src/__tests__/acceptance-regressions.test.tsx src/__tests__/usage-route.test.ts --maxWorkers=4
```

同机可从 Incept 主目录运行隔离探针。该脚本读取当前工作树源码，使用独立的用量数据和快照。

```powershell
node .scratch/dashboard-range-fix/runtime-probe.mjs fallback-join
node .scratch/dashboard-range-fix/runtime-probe.mjs benchmark
```

## Gemini 接手

可以在当前工作树继续目标 1 的视觉打磨。涉及日期控件或图表的改动，复验 7 天、30 天、全部和单日，再快速连点一次以检查最后选择。保留过龄快照的历史状态，确保切窗后筛选、KPI、图表和明细口径一致。
