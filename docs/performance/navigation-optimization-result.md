# 全站导航与数据加载性能优化

2026-11-12 · Incept · 现网发布基线 e4875db

生产已发布 **4666731**。Dashboard 重启后的首个全量请求从旧版观察到的 **36.30s** 降到 **50.08ms**，公网全量 JSON 从 **211,364 B** 降到 **30,948 B**。线上长文重复导航点击反馈 p95 为 **16.5ms**，实际正文 p50 从 **539.9ms** 到 **530.1ms**，p95 从 **1407.4ms** 到 **1330.4ms**。

点击事件只负责派发导航。线上长文新版点击到 Flight 发出中位 **5.1ms**，到 URL 更新 **503.5ms**，随后到目标正文帧 **24.3ms**。匹配同一请求 ID 后，Caddy 到 Node 上游头的中位等待为 **5.2ms**，完整代理处理 **48.0ms**。浏览器 Flight 完整接收中位 **495.2ms**。长文剩余等待主要在浏览器与生产代理之间的请求往返和接收路径。冷长文的同步布局长尾仍在约 125ms。

## 根因与修改

| 现象 | 实测证据 | 已实施 |
| --- | --- | --- |
| 点击处理快，页面更新慢 | 快速 Trace 的点击 Event Timing 中位 7.37ms，Flight 请求 357.39ms，点击到内容 450.30ms。现网主机回环三次，公开 Git 长文完整 Flight 为 60–98ms，Dashboard usage 为 8–10ms。 | 桌面、移动、文档卡片、文章侧栏及主要站内入口共用 NavigationLink，通过 Next.js useLinkStatus 显示固定位置的提示并播报本地化加载状态。Next 继续负责导航中断、前进后退和修饰键。 |
| 长文提交同步布局 | 原 Trace 的 169.38ms 和 92.22ms 发生在 Next 滚动处理的同步几何读取。公开 Git 长文有 447 个 Shiki 词元元素。 | DocsHighlightedCodeBlock 直接输出三主题均与基色一致、无额外字体样式的词元文本。带颜色差异或字形样式的词元保留原元素。 |
| Dashboard 重复传输且 JSON 未压缩 | 现网旧版的 all JSON 约 211KB。发送 Accept-Encoding gzip 仍返回 identity。Guest、Pro 的首屏 RSC 和随后 usage 请求可读取同一快照。 | Caddy 对 usage JSON 协商 gzip。Guest、Pro 按权限投影后生成各自验证值。首屏核对新快照，内容一致时返回 304，发生变化时返回完整 JSON。客户端丢弃被替代的远程结果，确认权限降级时先清理界面数据和对应内存缓存。 |
| v2 Dashboard 冷启动等投影重算 | 首次切换的代理修复后，Dashboard all 在 14 秒验收时限内没有响应。回滚后从旧应用经生产代理发出的首个 all 请求耗时 36.30s，随后两个请求为 17.76ms 和 18.42ms。生产已开启 v2 trusted 快照。 | 将 355987a 的读取策略单独移植到发布分支。普通读取先返回同一数据源的完整已发布快照，后台合并重算。首次尚无快照或明确要求最低修订号时继续等待。 |
| 线上请求分段 | 原录制只能看到客户端资源时间。 | Caddy 在响应和日志中写入同一随机请求 ID，记录上游响应头和转发时长。Node 采样记录接收、首写、末写及结束时间，并记录会话、语言解析、Prisma 查询和 Shiki 阶段。日志使用路由类别，保留计数和耗时。 |

### 代码定位

- [NavigationLink](../../apps/web/src/components/layouts/navigation-link.tsx) 复用 Next Link，由 [NavigationPending](../../apps/web/src/components/layouts/navigation-pending.tsx) 消费 useLinkStatus。[动效样式](../../apps/web/src/styles/motion.css) 使用固定位置和透明度状态，避免新增布局等待。
- [DocsHighlightedCodeBlock](../../apps/web/src/features/docs/shared/renderers/blocks/docs-highlighted-code-block.tsx) 对 Shiki 三主题词元逐一检查，合并视觉等价的正文节点。同步布局仍由 Next InnerScrollHandler 在提交后读取几何信息触发。
- [Dashboard SSR](../../packages/dashboard/src/next/dashboard-page.tsx)、[公开用量处理](../../packages/dashboard/src/next/usage-route.ts) 和 [Owner 用量处理](../../apps/web/src/server/sync/usage.ts) 使用 [readDashboardSnapshot](../../packages/dashboard/src/adapters/runtime/snapshot-store.ts)。generation 校验覆盖来源 identity、全部范围、修订和日期。返回同一来源旧 generation 的路径合并调度后台刷新，明确的 minRevision 请求核对最低版本。
- [Dashboard 验证值](../../packages/dashboard/src/next/usage-validator.ts) 以投影后的响应为输入。[useDashboardWindow](../../packages/dashboard/src/react/hooks/use-dashboard-window.ts) 取消被替代的请求并校验当前角色，[客户端快照](../../packages/dashboard/src/react/hooks/client-snapshots.ts) 按角色使用内存状态。
- [Caddy](../../deployment/Caddyfile) 写入 UUID、代理阶段和 usage 编码。[Node 探针](../../scripts/navigation-timing.cjs) 由生产启动脚本预载，采样 10%，通过 [服务端计时包装](../../apps/web/src/server/navigation-timing.ts) 记录鉴权、文档语言与 Prisma、Shiki 阶段。Shiki 的多块异步 span 会重叠，累计耗时按调用计数使用。

## 方案筛选

- **撤回路由级骨架。** 初版提前提交 URL，同时延长了真实正文等待。隔离生产构建 30 轮中，文档首页冷导航正文 p95 从 71.4ms 升到 369.5ms，长文重复导航 p95 从 82.3ms 升到 488.8ms。Dashboard、Roadmap 和 Settings 也复现约 300ms 的额外等待。最终以链接反馈承接导航等待，保留功能内部的数据加载 UI。
- **采用等样式词元压缩。** 独立 DOM 对照的词元元素 447 → 249，页面元素 1087 → 889。30 轮强制布局微基准 p50 17.40 → 16.45ms，p95 18.50 → 18.00ms，最大 19.30 → 18.30ms。桌面及移动三主题逐像素复验、亮色打印、文本、标题 ID、页面查找与锚点均通过。整页导航 Layout 单独报告。
- **保留原生滚动和鉴权。** 普通跨路由返回恢复到 600px。先写入原生哈希历史项，再手工滚动并离开，基线与初版候选均可出现返回后 URL 已恢复而正文仍停在上一页。保留该历史路径的单独复现记录。内容权限继续按请求核对，文章发布与撤回沿用现有查询。

## 构建与回归

用仓库 Dockerfile 构建 Linux/amd64 生产镜像，Next.js 16.4.3。隔离 PostgreSQL、Dashboard 快照及浏览器产物均与生产分开。冻结依赖安装、Prisma 生成、全仓类型检查、Lint、工作区测试、运维测试和生产构建全部通过。Lint 为 0 错误、8 条既有警告。核对最终镜像的静态资源，客户端 Source Map 数量为 0。

真实 Owner/Pro PostgreSQL 套件另在隔离库运行，28 项通过。补跑真实 PostgreSQL 同步集成 15 项、Windows DPAPI/TLS 3 项、真实 WSS/HTTPS 与 Owner 修订读取 7 项，全部通过，覆盖重试、提交回执、恢复、权限和数据精度。Windows Agent 单元测试补跑 103 项通过、0 项跳过。未启用 Agent 五分钟轮询用例。旧全站同步用例引用的 `packages/dashboard/tools/phase4/seed.mjs` 在本修订中缺失，保留该用例的默认跳过。Dashboard 的 2 个恢复沙箱用例需要历史备份夹具，本轮保留条件跳过。

隔离 Caddy 的 all JSON 从 168,742 字节降至 8,374 字节，5 次条件请求均返回 304，响应体 0 字节。解压后 SHA-256 与 identity 一致。Caddy 与 Node 按同一响应头 ID 匹配成功。

## 性能对照

同一测试机使用 Chromium 156、两份生产镜像和相同公开文档夹具。普通导航分别测冷启动和重复点击。慢网用 CDP 暂停动态 Flight 交付 300ms。点击反馈和真实目标正文分别记录，正文取目标子树出现后的帧。Layout 与包含 React commit 的主线程任务有重叠。失败、回退和跳过单列。

每格为 p50 / p95 / 最大值，单位 ms。下表针对旧版 e4875db 和文档导航代码定型版 2ff329c，每格每版 30 次，120 次尝试均成功。后续发布修订集中在 Dashboard 已发布快照读取。

| 路径与条件 | 点击→URL 旧 → 新 | 点击→真实内容 旧 → 新 | Layout 旧 → 新 | 新版反馈 |
| --- | --- | --- | --- | --- |
| 文档首页 / 冷 | 35.9 / 41.6 / 43.4 → 36.3 / 39.4 / 41.5 | 68.3 / 71.4 / 76.8 → 68.5 / 74.2 / 77.7 | 19.5 / 22.6 / 22.9 → 19.3 / 23.4 / 32.3 | 14.0 / 15.5 / 16.6 |
| 文档首页 / 重复 | 16.3 / 18.9 / 19.3 → 18.5 / 20.6 / 22.8 | 45.6 / 47.3 / 47.6 → 47.7 / 49.5 / 49.6 | 0.50 / 0.71 / 0.87 → 0.58 / 0.71 / 0.71 | 14.8 / 16.8 / 16.8 |
| Git 长文 / 冷 | 66.1 / 87.2 / 96.4 → 53.7 / 73.4 / 79.5 | 197.7 / 231.2 / 245.3 → 178.6 / 212.6 / 230.1 | 110.4 / 123.4 / 125.5 → 103.8 / 126.9 / 127.0 | 13.1 / 15.1 / 15.7 |
| Git 长文 / 重复 | 43.6 / 59.6 / 64.7 → 39.8 / 52.4 / 53.1 | 64.8 / 82.3 / 87.3 → 64.7 / 79.9 / 80.2 | 3.94 / 6.52 / 6.84 → 4.11 / 5.23 / 5.77 | 13.8 / 15.7 / 16.3 |

Git 长文冷切换的正文 p95 下降 18.6ms，约 8.0%。Chrome 软导航 FCP 为 214.9 / 245.0 / 265.3ms → 198.3 / 224.9 / 246.4ms。整页元素从 1132 降至 943。CDP 记录的峰值节点 p50 / p95 / max 从 3478 / 3815 / 4040 到 3091 / 3620 / 3765。编码 Flight 中位 32,737 → 30,021 字节，约减 8.3%。

冷切换的 Layout 中位降低 6.7ms，p95 从 123.4ms 到 126.9ms。两版各 30 轮冷长文都有一个超过 50ms 的主线程任务，任务 p50 / p95 / max 从 119.9 / 137.8 / 138.4ms 到 112.3 / 135.7 / 138.3ms。冷长文 Flight 完整接收 p95 从 71.6ms 升到 152.6ms，浏览器目标正文 p95 同时下降。记录中存在 URL 提交与 Flight 流尾重叠的样本。两版均在点击前完成了段预取，每次长文仍获取动态 Flight。

300ms 注入对照，旧版每路径 10 轮，新版每路径 30 轮，全部完成。旧版探针未观察到应用级反馈。

| 路径 | 点击→正文旧版 p50 / p95 / max | 点击→正文新版 p50 / p95 / max | 新版点击→反馈 p50 / p95 / max |
| --- | --- | --- | --- |
| 文档首页 | 369.7 / 377.9 / 377.9 | 370.3 / 386.6 / 388.7 | 12.7 / 15.0 / 15.1 |
| Git 长文 | 487.8 / 505.3 / 505.3 | 454.6 / 474.1 / 492.2 | 12.5 / 15.2 / 25.0 |

候选 19 项浏览器场景全部通过，包括中英路由、公开短文与长文、系列文章、About、Roadmap、Dashboard、Settings、键盘、修饰键、新标签、移动菜单、锚点、普通返回恢复、三次快速范围切换、连续导航和失败 Flight 回退。两套镜像用相同隔离会话验证了 Guest / Pro / Owner 文档及管理入口状态。Pro 的已有项目、会话细节范围保持，Guest 投影无细节，Pro 与 Guest 的 ETag 互不命中。隔离公开文档夹具引用的原媒体未复制，预期的媒体 404 在原始记录中单列。

## 发布与回滚

发布以现网 e4875db 为起点，独立开发分支 perf/navigation-responsive。release/navigation-20261112 快进合入通过验证的发布修订。主线已有未发布到生产的同步改动，通过 c56384f 与 680b08f 合并，并单独通过仓库 Dockerfile 的测试及构建阶段。680b08f 已推送 origin/main。生产使用 release/navigation-20261112 的确切提交。

生产沿用 Linux 镜像离线传输、摘要核验、Compose 应用与 Caddy 切换。旧镜像和发布目录留存，使用当日已完成备份作为数据恢复点，发布无 Prisma migration。

| 尝试 | 观察 | 恢复或纠正 |
| --- | --- | --- |
| 首次 2ff329c | 新 app 健康，Caddy 重建后未通过。候选发布包解压时收紧了文件模式，导致 UID 1000 无法读取 Caddyfile。 | 自动恢复 e4875db 和旧镜像，HTTPS ready 200。恢复归档记录的模式，并把代理校验改为以 UID 1000 执行。 |
| 第二次 2ff329c | App、代理均健康，双语和匿名访问检查通过，Dashboard all 冷请求在 14 秒内无响应。 | 自动恢复 e4875db 和旧镜像，HTTPS ready 200。回滚后的旧版直接复现首个 Dashboard all 等待 36.3 秒，移植同数据源已发布快照的非阻塞读取策略。 |
| 第三次 4666731 | 2026-11-12 13:26（UTC+8），应用和 Caddy 均健康。HTTPS 就绪、双语文档、访客私有文档 404 和强制刷新 403 均通过。Dashboard 冷请求 TTFB 46.99ms，完整接收 50.08ms，gzip 30,948 B。 | 保留运行中的 4666731。快照回退由 e31ae37 和 ad6f5ad 引入，4666731 补齐了生产读取契约的测试断言。 |

旧版镜像 ID 为 sha256:7a993a587b61cfcbc1f32ee931a857d502354b89aac65adb5ac842b76270bb7a。回滚事务保留带发布号的旧 env 副本，恢复旧 current 指针，只重新创建 app 和 proxy，再确认镜像与 HTTPS ready。共享数据卷及同步网关继续使用原配置。

生产提交为 `46667317e2f2f5425d3111ff61dfe7ae5f883de9`，镜像 ID 为 `sha256:e79172547cb6b68ef44b9cb3605970e31925244d1aef24abe65993307a472579`，版本目录为 `/srv/incept/releases/4666731`。发布镜像归档和发布文件归档均核对 SHA-256，分别为 `b5522c13329ed6306404b4e217f010161300336ea29a38e8a1a20d9d28ca7e26`、`28bbf73e45fb22f6bb3c91b78e4684bf631f600925c4985545f96bae103fede9`。

已有生产 SSH 会话可执行下列命令恢复旧版。上线后日志中的预期外状态按端点核查。若触发回滚，重新检查 current、app/proxy 健康和公网 ready。

```sh
bash /srv/incept/releases/.navigation-4666731/release.sh rollback 4666731 sha256:e79172547cb6b68ef44b9cb3605970e31925244d1aef24abe65993307a472579
```

## 线上性能与回归

公网通过相同浏览器和脚本测量。下表每格为 p50 / p95 / 最大值，单位 ms。长文每版 30 轮成功，所有长文点击均发出动态 Flight。文档首页旧版有 2 次源页连接关闭，4/6 成功，新版 6/6。Dashboard 旧版和新版各 6/6。

| 路径 / 指标 | e4875db | 4666731 |
| --- | --- | --- |
| 长文 / 即时反馈 | 未观察到应用级反馈 | 14.2 / 16.5 / 16.6 |
| 长文 / 点击到 URL | 516.9 / 1369.3 / 1673.7 | 503.5 / 1315.5 / 4802.5 |
| 长文 / 点击到正文 | 539.9 / 1407.4 / 1697.6 | 530.1 / 1330.4 / 4830.8 |
| 长文 / Flight TTFB | 341.1 / 1300.6 / 1656.8 | 408.1 / 1069.7 / 4389.5 |
| 长文 / Flight 完整接收 | 497.6 / 1351.3 / 1658.9 | 495.2 / 1318.4 / 4793.8 |
| 长文 / 包含 URL 提交的任务 | 18.0 / 23.1 / 24.1 | 15.9 / 20.9 / 23.4 |
| 长文 / Layout | 7.53 / 10.91 / 11.13 | 7.06 / 9.05 / 12.63 |
| 长文 / Recalculate Style | 8.55 / 10.04 / 10.81 | 7.26 / 9.49 / 10.77 |
| 长文 / Paint | 4.24 / 5.24 / 5.70 | 3.91 / 6.07 / 6.76 |
| 文档首页 / 点击到正文 | 401.2 / 511.1 / 511.1 | 512.5 / 931.2 / 931.2 |
| Dashboard / 点击到正文 | 410.1 / 966.8 / 966.8 | 300.4 / 502.0 / 502.0 |

长文新版 Event Timing 的 JS 处理 p50 为 1.51ms，p95 为 2.73ms。点击到发出请求 p50 为 5.07ms，p95 为 8.29ms。URL 到正文帧 p50 为 24.34ms，p95 为 31.41ms。30 轮匹配 Caddy 日志，上游响应头 p50 / p95 / max 为 5.22 / 9.37 / 19.20ms，完整代理处理为 47.95 / 111.53 / 152.72ms。4 轮同时命中 Node 采样，首写 3.60–5.86ms，末写 38.02–69.64ms。三条指标按各自样本聚合，部分 Flight 末尾与提交重叠。

最长一轮同 ID 为 `9fada178-9f42-456f-8418-6d2f873b6909`。浏览器复用现有 HTTP/2 连接，发出后 TTFB 4389.5ms，下载 402.3ms，点击到正文 4830.8ms。Node 首写 5.86ms、末写 69.64ms，Caddy 上游头 5.97ms、整体 152.72ms，浏览器提交任务 11.40ms、Layout 3.30ms。该样本的主要停顿在代理边界之外，现有测量将浏览器、客户端网络和公网链路保留为一个区间。30 轮重复长文中没有超过 50ms 的主线程任务。冷长文的主线程和布局以隔离冷导航 Trace 为准。

| 公网 Dashboard API（各组 6 次） | 旧版实际响应体 | 新版实际响应体 | 总耗时 p50 / p95 / max，旧 → 新 |
| --- | --- | --- | --- |
| all，请求 gzip | 211,364 B，identity | 30,948 B，gzip | 56.95 / 59.93 / 59.93 → 43.18 / 50.87 / 50.87ms |
| 30d，请求 gzip | 72,336 B，identity | 12,814–12,819 B，gzip | 41.48 / 82.46 / 82.46 → 48.42 / 89.55 / 89.55ms |
| all，条件请求 | — | 304，0 B | 38.66 / 49.17 / 49.17ms |
| 30d，条件请求 | — | 304，0 B | 39.92 / 70.02 / 70.02ms |

新版同一 all 表示的 identity 响应为 212,067 B，gzip 减少 85.4%。12 个条件请求均返回 304。gzip 解压后的 SHA-256 与同一版本的 identity 响应一致。该表是公网热请求，重启冷请求的证据在发布记录。

公网 18 项浏览器回归全部通过，Console 无错误。双语首页和健康探针返回 200。Guest 的私有文档和内部同步接口返回 404，Owner 强制刷新返回 403，Owner 状态接口没有返回管理信息，跨站登录请求返回 403。五轮快速连续点击间隔 74–96ms，均稳定落在最后点击的 About。隔离环境验证了真实 Owner / Pro 登录和权限。桌面浏览器的现有会话连接超时，生产登录验证完成了表单和匿名权限边界。

线上日志中，公开 usage 的 35 个 200、26 个 304 和 2 个刻意触发的 403 没有 5xx。47 个 499 分布于页面和资源，浏览器主动停止预取或关闭上下文也会生成此状态。独立的设备同步上传出现 6 个 503，包括四次批次分页 PUT 和两次批次 POST，最后一次为 13:44（UTC+8）。此后同类同步路由记录 661 个 200、10 个 404，未再出现 5xx。该时段 Node 应用未记录错误，复查 app、Caddy、同步网关健康，重启及 OOM 为 0。应用及代理保留现行版本。

## 剩余问题

- 长文公网真实正文改善约 1.8%（p50）和 5.5%（p95），一次出现 4.83s 极端样本。文档首页公网小样本 p50 从 401.2ms 到 512.5ms。已配对的长文样本显示服务端头处理为个位数毫秒，公网尾部需要跨网络和地域复测。继续扩大内容预取或共享缓存会影响个性化和受限文档访问，当前版本保留按请求校验。
- 隔离冷长文 Layout p95 仍为 126.9ms。现有结构覆盖浏览器查找、打印和锚点。进一步处理需对长文布局隔离进行同样的功能和性能对照。
- 原生哈希历史项和手工滚动叠加后，基线与候选偶尔恢复 URL 后正文仍在前一页。普通返回、锚点和前进分别通过。后续应保留这个组合复现再判断框架版本变更的收益。
- 设备同步上传的 503 需要单独关联代理、设备重试和批次提交回执。该端点使用设备授权，公网回归采用匿名访问，实际上传与回执由隔离测试覆盖。

## 数据与复现

同一浏览器测试脚本同时记录用户点击、可见反馈、URL、目标正文帧、React DevTools commit 回调、Chrome Trace、每条 Flight 请求和 DOM 计数。生产 React 构建不提供可靠的组件渲染耗时，统计中保留包含提交回调的主线程任务耗时。应用点击反馈取标记实际出现后的帧，事件处理耗时取 Event Timing 可用样本，避免把延迟绘制计入 JS handler。

原始目录为本工作树的 `output/playwright/navigation-optimization/`。各浏览器目录保留逐轮 `samples.jsonl`、异常记录、`summary.json` 和可在 Chrome Performance 面板载入的 `*.json.gz`。`baseline-30` 和 `release-30` 是本地 30 轮对照，`baseline-slow` 和 `release-slow` 是慢网对照，`secondary-before` 和 `release-secondary` 是次要路径，`production-functional` 是最终生产镜像的隔离浏览器回归，`role-before.log` 和 `role-after.log` 是角色回归。夹具使用同一批公开文档和隔离的生成用量数据。同步集成的日志为 `sync-pg-roles.log`、`windows-agent-integration.log` 和 `windows-remote-integration.log`。

公网原始数据在 `online-before-long30`、`online-after-long30`、`online-before`、`online-after`、`online-final-functional` 和 `online-rapid.json`。用量探针保存在 `usage-online-before.json` 与 `usage-online-after.json`。主机记录在 `production-deploy-final.log` 和 `production-telemetry.json`，浏览器对应的 ID 连接表为 `online-after-long30/matched-timings.json`。

在工作树根目录运行下列 PowerShell 命令。浏览器探针使用已安装的 Playwright 和 Chromium。可设置 `NAV_PLAYWRIGHT` 指向 Playwright 模块，或通过 `NAV_EDGE` 选择 Chromium 内核浏览器。复验访客对已知受限文档的访问时，将对应的本地化路径放入 `NAV_PROTECTED_DOC`。

```powershell
$bench = 'docs/performance/scripts'
$qa = 'output/playwright/navigation-optimization'
node "$bench/browser.cjs" http://127.0.0.1:4341 "$qa/repro-baseline" 30 index,long cold,repeat
node "$bench/browser.cjs" http://127.0.0.1:4342 "$qa/repro-candidate" 30 index,long cold,repeat
node "$bench/browser-summary.cjs" "$qa/repro-baseline" "$qa/repro-candidate"
$env:NAV_DELAY_MS = '300'
node "$bench/browser.cjs" http://127.0.0.1:4342 "$qa/repro-slow" 30 index,long slow
Remove-Item Env:NAV_DELAY_MS
node "$bench/functional.cjs" http://127.0.0.1:4342 "$qa/repro-functional"
node "$bench/usage-probe.cjs" https://localhost:4447 "$qa/repro-usage.json" 6
```

公网复测使用真实域名。日志采集脚本需经已有运维 SSH 在生产主机以 Python 3 运行，输入本次窗口的 UTC 起点。脚本仅输出路由类别、请求 ID、状态、字节和耗时字段。

```powershell
$origin = 'https://43-155-136-83.sslip.io'
node "$bench/browser.cjs" $origin "$qa/repro-online-long" 30 long repeat
node "$bench/browser-summary.cjs" "$qa/repro-online-long"
node "$bench/live-rapid.cjs" $origin "$qa/repro-rapid.json"
node "$bench/usage-probe.cjs" $origin "$qa/repro-online-usage.json" 6
node "$bench/match-timings.cjs" "$qa/repro-online-long" "$qa/production-telemetry.json"
```

## 后续前端性能边界

- 动态路由分开衡量点击反馈、URL 和真实目标内容。关键路径以反馈 p95 约 50ms 为目标，增删 Suspense 或 loading.tsx 时，同时跑冷缓存、重复导航和慢网的真实正文对照。
- 保留 Next Link 的中断、键盘、修饰键、哈希和滚动行为。导航入口复用 NavigationLink，不给各入口维护独立 pending 状态。
- 正文的代码、高亮、目录、嵌入式媒体发生结构变化时，复验节点数、Layout 长尾、查找、打印、键盘和移动端。提交路径中的几何测量要通过 Trace 检查失效范围。
- 文档预取和公开缓存变更前，复验内容权限、语言回退、发布、撤回和失效。Dashboard 按当前角色投影后生成验证值，历史修订等待由明确要求最低版本的请求触发。
- 公网慢样本优先匹配浏览器、Caddy 和 Node 的同一请求 ID，再决定优化数据库、流传输还是浏览器提交。保持线上 Source Map 关闭，保留最近一次已知健康的发布用于回滚。
