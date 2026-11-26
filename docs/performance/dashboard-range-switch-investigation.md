# Dashboard 时间范围切换性能调查报告

**先改 Owner 普通切换的快照读路径。** 2026-11-25，在同一份重构源码的隔离 Next 生产构建中，中文 Owner 页面首次点「全部」，按钮 **24.0 ms** 有反馈，正确用量 **30,361.6 ms** 上屏。Usage TTFB 为 **30,301.5 ms，占整段等待 99.8%**。原生读入和标准化用了 **28,463.8 ms，占 93.7%**，处理 **83,237 条**用量记录。首选让普通 GET 直接返回校验过的目标窗口快照，后台合并采集并发布更新。当前本地 Owner 快照超过 15 秒后，采集会进入 Usage 响应前的等待链。 [读取分支](../../.worktrees/web-redesign/packages/dashboard/src/adapters/runtime/refresh.ts#L16-L43) · [Owner 瀑布](#owner-冷读与连续切换)

来源可见性较低的另一次隔离读中，「全部」的 Owner handler 耗时 **66,548 ms**，筛选与历史回退占 **53,730.4 ms**。生产浏览器样本的回退只花 **0.3 ms**。两种情况下，长等待都集中在前端等同一个 Usage 请求。此处先解耦读与采集，再优化采集内部。

## 测量版本和数据

| 对象 | 观察 |
|---|---|
| 日常验收 | 用户确认本地 `http://localhost:3000/zh/dashboard`、Owner，线上 Owner 同样有长延迟。端口和进程核验确认 3000 是 `.worktrees/web-redesign` 的 `next dev`。浏览器中已打开的线上页仍显示旧布局，线上计时单列为待测。 |
| Git | `refactor/web-frontend-v2` 的 `c1afe647786d1264be65e8e426450c371e98d2c5`，较本地 `origin/main` 的 `aefdab427ef90bf53f4f83c3713994735b582488` 为 0 落后、8 领先。提交差异 165 个文件，集中在主题/UI、Docs、Settings、Navigation、Music、Roadmap。 |
| 未提交状态 | 23 条 Git 状态记录，涵盖生成的 `next-env.d.ts`、Settings 与主题、Dashboard Feature、Toolbar、样式/文案、格式化和测试，以及新增的 Dashboard 偏好、analytics、charts、workbench。Usage/Billing/Sync 路由、四个 Hooks 和 runtime 在本轮没有未提交差异。Dashboard `src` 在原件和副本中的 SHA-256 均为 `3590e5ca3ec02c0c41ad642b54c97de1febd632e436279280f85553f78f5f50e`。 |
| 开关 | 验收 worktree 的 `.env.local` 未设置 Sync enable/read/remote/trusted 或 Owner billing read/UI/publication。按该文件启动为本地 v1、远程关闭、Owner Billing 关闭。已有程序的继承环境仍未取得。隔离构建显式使用上述配置，Owner Usage 响应头核实为 `owner`。 |
| Guest 对照 | Dev Guest 用原 3000 端口。Production Guest 从 3000 录入三个公开快照并逐窗深比较。公开数据为 7／30／269 日、26／29／43 模型行、44,726／96,010／246,715 B。all 约 166.9 亿 Tokens。各窗原始 checkedAt 不同，隔离重放逐窗保留。 |
| 隔离生产 | Windows、Node 24.21.0、Next 16.4.3 Turbopack Build ID `9y7WS8anfTXsjC0Iu9hX9`，Chromium 1440×930。副本构建根适配依赖联接，Owner 由仅在副本开启的测试变量注入，真实 PostgreSQL 会话查询独立于本次计时。Owner 冷读使用真实本机来源、空的隔离导入库和临时快照。对照使用英文页面，Owner all 冷读另在与日常相同的中文路由复测。 |

用户确认的是本机真实 Owner。浏览器控制在准备进入签入会话时终止于 URL 校验，主要 Owner 数字来自同源码、同主机的隔离生产复现。真实 Owner 鉴权、启动进程继承开关、云端部署模式仍待取得同一条浏览器和服务端时间线。此前导航验收约 47 ms 的 Dashboard TTFB 属相应已发布快照的历史证据。数据语义继续沿用 2026-11-24 审计的五类 Token、UTC+8 日期和 Usage/Billing 区分。 [历史导航验收](navigation-optimization-result.md#发布与回滚) · [原数据审计](../research/dashboard-data-audit/00-executive-summary.md)

## 点击到数据上屏

以下行号指本地重构工作树。

| 层 | 实际入口和分支 |
|---|---|
| SSR | `apps/web/src/app/[locale]/dashboard/page.tsx:8–14` 取 viewer；`packages/dashboard/src/next/dashboard-page.tsx:8–23` 读默认 30 天快照，再做权限投影，传入 initialStatus/validator。已有快照的本地页面在初次渲染看到 30 天，所以首个 30 天是 SSR，第一次点回 30 天通常已有客户端快照。 |
| 点击 | `packages/dashboard/src/react/components/dashboard-toolbar.tsx:100–124` 更新 viewMode、rangePreset、选点，按钮直接绑定 aria-pressed。实测没有 URL 变化、范围触发 Flight、宿主重挂载或路由 loading。目标窗无缓存时 `token-dashboard-feature.tsx:215–263` 会显示路由内部占位。 |
| 缓存与取消 | `hooks/use-dashboard-window.ts:170–199` 的 Effect 恢复该窗内存快照或放入空 DTO，再发 no-store GET，旧 Effect 清理时 abort。响应以范围、role、revision/checkedAt 和 disposed/abort 守卫（`:115–164`）。`hooks/client-snapshots.ts:4–17` 用角色/远程模式 scope 与 range 作键，按 checkedAt 替换；无 TTL、独立数据身份或浏览器持久化。仅首次非 Owner 同初始对象与窗口使用 SSR validator（`:106–114`）。 |
| 远程依赖 | `use-dashboard-window.ts:45–59,83–114,156,174–199`。仅远程 Owner 先 await devices/status；普通切换、自动轮询、恢复可见共用此分支，状态失败会阻断 Usage。手动远程刷新还 POST job、轮询结果，成功后带 minRevision，再刷新状态。已有 live 快照时的初始 status 属独立调用。本地模式无 status 门槛。 |
| Usage API | `apps/web/src/app/api/dashboard/usage/route.ts:8–17` 分流。Guest/Pro 读已发布快照、权限投影与 ETag，Owner 本地走刷新（`next/usage-route.ts:15–36`）。生产实测复现了这个 Owner 分支。真实 cookie 和 Prisma session 阶段在 `apps/web/src/server/auth/viewer.ts:21–32`。 |
| Worker | `adapters/runtime/refresh.ts:22–42`：同日、年龄 <15 秒且导入文件和 WAL 未更新才直接读缓存，否则等待 Worker 及发布。按 scope+range 合并请求。`worker-client.ts:27–55` 没有 HTTP AbortSignal；浏览器取消旧 GET 后，已经发出的后台采集仍可能执行。 `loader.ts:24–75` 做原生扫描、历史回退、导入匹配、范围选取、聚合。原始快照从采集开始计 15 秒，冷扫描超过此值时刚返回就可能失效。 |
| v2 与 shadow | `snapshot-store.ts:54–86,143–195` 先以文件 fingerprint 复用已解析快照。可信 v2 普通读取可先用已有发布 generation，合并调度重建；无可用快照或最低 revision 请求才等。`apps/web/src/server/sync/usage.ts:8–28` 的非可信 v2 走实时投影，shadow 在 Legacy 后再投影/比较。它们是不同于本机 v1 的路径。 |
| Billing 与图表 | `hooks/use-billing-preview.ts:7–33` 在 Owner 双开关启用时按 range 和 refreshCycle 发请求。窗口切换和 Usage 完成后 cycle 增长可触发两次请求或取消前一次。无按范围 Billing 缓存。ready 会改变 `token-dashboard-feature.tsx:93–113` 的调和 memo，更新 models/sources/daily、排序及趋势桶。当前客户端接合检查 range 而未检查两 API revision。Billing 关闭时费用随 Legacy Usage 上屏，本轮没有启用计费的独立计时。 |

`TrendWorkbench:94–100,130–176,503–506,995–1009` 的图表粒度是客户端状态。7/30 天支持日/周，all 支持月/周，单日钻取使用已读日桶。时间与比较口径沿用 [时间契约](../research/dashboard-data-audit/05-temporal-and-query-capabilities.md) 和 [计价审计](../research/dashboard-data-audit/04-identity-and-billing.md)。

## 已发布快照对照

按钮反馈以首个检测到 aria-pressed 的 animation frame 为准。正确用量由目标窗 Usage 总量核对 KPI，再取首帧。另记录 MutationObserver 发现的 DOM 更新。稳定时间记为正确使用量已显示、Usage/Billing 不忙且趋势文字约 40 ms 未变的起始帧。浏览器探针时间受刷新率影响，以下比较保留原始逐次结果。首次看到 30 天是整页读取，表中第一次点击 30 天发生在 7 天之后，已有 SSR 缓存。

| 场景 | Dev Guest 正确用量上屏，ms（中位／最慢） | Production Guest，ms（中位／最慢） |
|---|---:|---:|
| 首次切 7 天 | 83.7 / 84.8 / 66.5（83.7 / 84.8） | 28.6 / 29.0 / 29.5（29.0 / 29.5） |
| 7 天 → 初始 30 天 | 50.9 / 49.6 / 48.1（49.6 / 50.9） | 30.4 / 30.9 / 30.6（30.6 / 30.9） |
| 新页面首次点全部 | 68.5 / 70.0 / 67.9（68.5 / 70.0） | 30.5 / 30.3 / 30.1（30.3 / 30.5） |
| 同页全部 → 30 天 | 106.6 / 128.1 / 126.2（126.2 / 128.1） | 48.9 / 47.9 / 47.6（47.9 / 48.9） |
| 同页 30 → 7 天，已读过 7 天 | 29.3 / 31.3 / 43.1（31.3 / 43.1） | 30.9 / 31.1 / 30.2（30.9 / 31.1） |
| 快速连点，最后一次选全部 | 39.3 / 38.3 / 41.6（39.3 / 41.6） | 31.4 / 30.4 / 30.9（30.9 / 31.4） |
| 快速连点，人为把 GET 延迟 300 ms | 374.1（1 次） | 330.6（1 次） |

生产快照对照中，7/30/all 的普通 GET TTFB 中位数 **3.1/3.2/4.1 ms**，下载 **0.4/0.7/1.2 ms**。开发为 **21.9/20.9/20.0 ms** 与 **0.6/0.9/1.9 ms**。这组快照在服务端已存在，首次切范围仅客户端冷。快速连点最终目标正确。普通对照多数 GET 在下一次点击前已完成，人为延迟对照前四次被客户端取消，最后一次 200。此组没有 Billing 或设备状态请求。

## Owner 冷读与连续切换

隔离生产从已发布的 30 天快照启动，「全部」在服务端过龄且客户端未读过。英文崭新浏览器样本首帧 **21,177.6 ms**，中文为 **30,361.6 ms**（2 次，样本中位数 25,769.6 ms，最慢 30,361.6 ms）。两轮同时存在源文件微量新增及扫描耗时差异，端到端时间差不归因于语言。英文样本读取 83,209 条并花 19,234.3 ms，返回 894,580 B。下表为更慢的中文样本，仅一条范围内关键请求，HTTP 200、Owner、未取消，返回 252 日、744 会话、41 模型行。

| 点击后时间 | 阶段 | 备注 |
|---:|---|---|
| 0.0 ms | 点击全部 | 不改变 URL、根节点 |
| 17.9 ms | fetch Usage all | 无 status、Billing 或新 Flight |
| 24.0 ms | 按钮选中 | 目标窗局部占位 |
| 30,320.4 ms | 首字节 | 浏览器资源起点 18.9 ms，TTFB 30,301.5 ms |
| 30,343.4 ms | 下载完 | 23.0 ms，编码后/解码后均 895,091 B |
| 30,353.2 ms | response.json 就绪 | 最后字节后约 9.8 ms，包含解码与调度 |
| 30,361.2 ms | 正确范围 DOM 更新 | JSON 后约 8.0 ms，含派生与 React 提交 |
| 30,361.6 ms | 首次可见且稳定 | 旧版费用随 Usage；没有观测到 >50 ms 的长任务 |

| 服务端非重叠阶段 | 用时 | 输入 |
|---|---:|---|
| 原生扫描与标准化 | **28,463.8 ms** | CommandCode 1,644.8 ms、11,912 条；Agent collectors 26,578.4 ms、71,325 条；共 83,237 条 |
| 导入匹配及窗口选择 | 1,451.4 ms | 导入层身份匹配 1,439.9 ms，导入事件为零；ccusage 0.3 ms，fallbackSources 为空；选中 83,237 条 |
| 聚合与源摘要 | 285.4 ms | 252 日、5 月、744 会话、41 模型行 |
| 剩余 | 约 101 ms | TTFB 减上述阶段，含快照查找、Worker 调度/队列、发布和序列化及 Fixture 角色读取。单独 handler 实测快照查找约 1 ms，编码约 2–6 ms。真鉴权未计入 |

[最慢样本 Trace](dashboard-range-slowest.trace.json) 可在 Chrome Trace Viewer 打开。它由浏览器观测点重建，服务器分段时长单独保存在结构化证据。

同源码的受限来源 handler 对照走真实 Worker，发布只测编码而省略磁盘写入。一轮 7 天、30 天、全部耗时 **17,756／15,131／66,548 ms**；最慢样本原生读取 35,565 条、12,608.2 ms，筛选与历史回退 53,730.4 ms，选中 35,589 条，响应 473,970 B。另一次 all 用 25,915 ms，Antigravity 的一次 daily 和 9 次 session 回退共 13,334.1 ms，OpenCode／ZCode 回退分别 329.5／135.3 ms，共补回 24 条。回退是按来源顺序执行，每组最多 4 个日报表，子命令超时 10 秒。关闭回退的诊断对照为 12,404 ms，少 13,629,406 Tokens 和 13 个会话。两次现场输入仍在变化，所以该差额用于确认回退有数据价值，不能作精确逐事件归因。生产浏览器样本能读取更多原生记录，回退为空。 [ccusage 逐日读取](../../.worktrees/web-redesign/packages/dashboard/src/adapters/local/collectors/ccusage.ts#L17-L74)

### 同页 7 → 30 → 全部 → 30 → 7

一轮隔离生产 Owner，等每次请求结束再点下一段。网络数字取该窗 Usage 的资源计时和正文，各次皆为 Owner / 200 / 未取消。全部用相同本机来源与时区。现场文件新增使标准化记录数从 83,217 到 83,220，表中分开注明服务端 raw 缓存状态。有目标窗客户端快照时，「用量首帧」先看到该范围上次成功的值，「稳定」等待当前 GET、DOM 和趋势更新。

| 顺序 | 客户端快照／服务端路径 | 发请求 / 按钮，ms | 正确范围首帧 / 稳定，ms | TTFB / 下载，ms | 正文 B |
|---|---|---:|---:|---:|---:|
| 1 · 7 天 | 未命中／冷扫描后选中 7 天 | 21.8 / 28.5 | 22,621.2 / 22,621.2 | 22,574.3 / 1.1 | 101,055 |
| 2 · 30 天 | SSR 快照命中／重新采集 | 6.9 / 14.7 | 31.1 / 14,630.4 | 14,586.9 / 19.2 | 481,763 |
| 3 · 全部 | 未命中／命中 Worker 原始缓存，继续匹配和聚合 | 6.7 / 14.0 | 1,782.2 / 1,782.2 | 1,752.3 / 12.7 | 894,597 |
| 4 · 30 天 | 命中／重新采集 | 19.5 / 22.0 | 48.0 / 18,497.7 | 18,451.8 / 16.0 | 481,745 |
| 5 · 7 天 | 命中／重新采集 | 3.8 / 13.5 | 30.3 / 17,880.1 | 17,871.2 / 0.5 | 101,495 |

两次切回 30 天的目标数据 DOM 在 **21.0／42.0 ms** 就出现，早于响应十余秒。按钮和用量的反馈已经利用客户端缓存，刷新进度仍等待完整冷读。all 在原始缓存暖时，83,217 条基底仍重跑导入身份匹配 **1,409.4 ms**（零导入事件）与聚合 **279.0 ms**，这解释了为何暖 Worker 样本仍约 1.8 秒。新浏览器场景 all 的原始缓存冷读为 21.18 秒。两次的浏览器状态都为 all 未获取过，服务端 Worker 状态不同。 [导入匹配顺序](../../.worktrees/web-redesign/packages/dashboard/src/adapters/local/imports/layer.ts#L11-L25)

### 连续切换中最慢一段，首次切 7 天

服务器冷扫描 **21,116.2 ms，占 22,621.2 ms 总等待的 93.3%**，读取 83,217 个标准化事件，最后返回 7 日、52 会话。匹配和选窗是 1,367 ms 量级，聚合约 22.6 ms，ccusage 0.3 ms。单条 Usage 请求的瀑布如下，进入 Dashboard 时的站点预取在点击之前。

| 点击后时间 | 瀑布事件 |
|---:|---|
| 0.0 ms | 点击 7 天 |
| 21.8／22.8 ms | fetch 发起／资源请求起点 |
| 28.5 ms | 按钮第一次反馈 |
| 22,597.1 ms | 首字节，TTFB 22,574.3 ms，占等待约 99.8% |
| 22,598.2 ms | 下载完，正文 101,055 B，HTTP 200 |
| 22,603.9 ms | JSON 就绪，最后字节后 5.7 ms |
| 22,610.9／22,611.0 ms | React 记录目标提交／目标 DOM 出现 |
| 22,621.2 ms | 正确范围首帧，趋势与 Legacy 费用稳定 |

## 最小修复计划

| 优先级 | 落点与改动 | 收益、依赖和验收 |
|---|---|---|
| **首选 · 普通读返回已验证快照，采集后台化** | `refresh.ts:16–43` 与 `next/usage-route.ts:26–36`。普通 Owner GET 读同源、同角色、同窗已成功快照，带数据更新时间。按来源和水位合并后台工作，发布后更新。借用 trusted v2 的快照判定与后台更新思路。显式刷新与 minRevision 保留等新结果的语义。真无快照时用单飞和明确加载状态。 | 目标窗已存在时，移出原生采集、身份匹配、回退和聚合的同步等待。实测冷读约 21–30 秒，开启回退的受限场景更长。首轮目标为同机生产构建已发布窗正确用量首帧 p95 ≤100 ms。保留日期、导入文件、水位、权限、失败回退与旧新响应顺序。 |
| 后续 1 · 复用后台产物 | `loader.ts:24–75`、`imports/layer.ts:11–25`、`collectors/ccusage.ts:17–74`。按完成时计原始缓存 freshness，跨窗口复用；空导入先判定活跃批次再建身份索引；缓存验证过的逐日历史回退，覆盖变化时重新计算。 | 暖 all 中空导入身份索引约 1.4 s，回退场景有 13–54 s 消耗。用同快照测前后每阶段数和五分量、会话、日桶/来源对账。有已提交 ledger 的可信 v2 与 Billing 增量负责同步/费用，覆盖不到 v1 本机的 raw/ccusage。 |
| 后续 2 · 收敛远程状态与计费请求 | `use-dashboard-window.ts:98–114,186–199` 使普通 Usage 和 status 独立推进。 `use-billing-preview.ts:16–31` 以范围、角色和发布水位做请求合并与同窗复用。保留手动远程 Job 完成后读最低 revision。 | 去除被验证的 status RTT 依赖和同窗 Billing 重请求。以真实远程 Owner 瀑布、更新后的 Billing 水位和中断序列验收。本地主样本未开启这两项。 |

### 验收

1. 固定同一来源文件和导入/Sync revision、publication、asOf，对比 7/30/all 的五类 Tokens、总量、缓存命中率的分子 cacheRead 和分母 input+cacheRead+cacheCreation、设备/来源内会话去重、金额和未定价量。旧费用、官方参考 USD 分开验收。
2. 用实际 7/30 天的日与周、全部的月与周和 1D 钻取，检查周一起桶、截断周、UTC+8 日期和进行中的自然日。纯客户端粒度切换不应发 Usage；整窗各粒度的分量、总量、合计费用一致，比例重新加权。
3. Guest/Pro/Owner 回归字段和缓存作用域。用隔离导入提交、Sync 推进及后台发布故障验证 revision 和最新状态。模拟目标范围中途改变、延迟响应和取消，最终只呈现最后选择；显式远程刷新仍核对最低 revision。
4. 用同一批缓存与数据测至少三轮生产冷/热与 dev 分列。记录按钮、目标窗首帧、稳定、背后请求数和用量读延迟。无目标缓存单列首窗等待；后台失败保留最近成功快照与可读更新状态。

当前隔离副本 9 个 Vitest 文件、78 项通过，含新工作台五分量、缓存加权、周粒度、单日钻取、Usage 导入与角色/快照回归。Next 生产编译及 TypeScript 检查通过。其依赖的独立假库未启动，入口 bootstrap 的音乐库查询报预期连接错误；Owner Usage 仍以实际 200 和 stable probe 核验。

## 复现与证据

- [范围探针](scripts/dashboard-ranges.cjs) 沿用历史 Playwright/CDP 探针方式。新浏览器会话，无持久身份，输出点击、首帧、React commit、资源体积与取消；脚本将首次 30 天从 SSR 读取。
- [生产运行器](scripts/dashboard-range-production.cjs) 使用隔离构建。Guest 重放三个公开 DTO 并逐窗深比较。Owner 模式需在隔离副本 `viewer.ts:getCurrentViewer` 开头启用仅测试的 `DASHBOARD_AUDIT_FIXTURE_ROLE=owner`，生产构建本身使用隔离目录和原工作树匹配的 Dashboard 源。仅在回环启动，自动停止；临时 Owner 快照结束后清理。
- [Owner 分段探针](scripts/dashboard-owner-reader.mjs) 独立构建当前 route/Worker，记录阶段、窗口和计数，不保存 Owner 正文。[历史 HTTP 探针](scripts/usage-probe.cjs) 本轮 Guest 30d/all 每窗三轮 identity、gzip、validator。6 次条件请求均 304、正文为 0；直接 localhost 对照 200 的正文为 96,010 与 246,715 B。
- [结构化证据](dashboard-range-switch-evidence.json) 收录可复查的阶段、逐次浏览器切换和相对时间网络记录。原始时序在忽略的 `output/playwright/dashboard-ranges/`；受限来源聚合阶段在 `.scratch/dashboard-range-audit/`。

```powershell
# 在保留原工作树的前提下复用隔离源码副本。副本保留 apps、packages、
# scripts、根 workspace 文件和已安装依赖联接，省略实际环境文件及数据。
$env:DASHBOARD_AUDIT_PROJECT_ROOT = (Get-Location).Path
$env:NEXT_TELEMETRY_DISABLED = '1'
$env:DATABASE_URL = 'postgresql://fixture:fixture@127.0.0.1:59999/fixture?connect_timeout=1'
node .scratch/dashboard-range-audit/candidate/packages/dashboard/tools/build-runtime.mjs
Push-Location .scratch/dashboard-range-audit/candidate/apps/web
node node_modules/next/dist/bin/next build
Pop-Location

# NAV_PLAYWRIGHT 指向与本机浏览器版本匹配的 Playwright
node docs/performance/scripts/dashboard-ranges.cjs http://localhost:3000 output/playwright/dashboard-ranges/dev-guest-final.json 3
node docs/performance/scripts/usage-probe.cjs http://localhost:3000 output/playwright/dashboard-ranges/usage-probe-dev-guest.json 3
node docs/performance/scripts/dashboard-range-production.cjs .scratch/dashboard-range-audit/candidate output/playwright/dashboard-ranges 3
$env:DASHBOARD_RANGE_PRODUCTION_MODE = 'owner-cold-all'
$env:DASHBOARD_RANGE_WAIT_MS = '95000'
node docs/performance/scripts/dashboard-range-production.cjs .scratch/dashboard-range-audit/candidate output/playwright/dashboard-ranges 1
$env:DASHBOARD_RANGE_LOCALE = 'zh'
node docs/performance/scripts/dashboard-range-production.cjs .scratch/dashboard-range-audit/candidate output/playwright/dashboard-ranges 1
Remove-Item Env:DASHBOARD_RANGE_LOCALE
$env:DASHBOARD_RANGE_PRODUCTION_MODE = 'owner-sequence'
node docs/performance/scripts/dashboard-range-production.cjs .scratch/dashboard-range-audit/candidate output/playwright/dashboard-ranges 1
node docs/performance/scripts/dashboard-owner-reader.mjs .scratch/dashboard-range-audit/candidate .scratch/dashboard-range-audit/owner-native '7d,30d,all'
```

当前分支、原工作树与原未提交文件保留。实际 3000 的探针只发读请求，生产副本的写入仅用于测试缓存。
