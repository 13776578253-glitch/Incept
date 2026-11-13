# Next.js 导航性能专项调查

2026-11-11 · Incept · 工作树 `5b2a142`（`feature/operations-console`）

## 1. 执行摘要

浏览器很快处理了点击，**随后 App Router 在后台等到能渲染目标页的 Flight 数据，才提交路由和更新地址栏**。快速切换录制的 20 次点击，Event Timing 中位数为 **7.37ms**，其中点击事件处理本身为 **2.78ms**。16 次有目标页面首绘的软导航，点击到 RSC 发起为 **5.27ms**，点击到 URL 为 **402.37ms**，URL 到目标首绘为 **53.36ms**，点击到目标首绘为 **450.30ms**。分阶段中位数来自不同样本，按单行时间线相加才能精确还原一次导航。

| 优先级 | 根因与影响 | 置信度 |
| --- | --- | --- |
| 1 | **动态路由在点击后仍依赖 RSC。** 快速录制的 16 次软导航全部发出同路径请求。RSC 发起到响应结束中位 357.39ms，结束到 URL 中位 7.18ms。浏览器可见的 TTFB 中位 190.80ms，响应头到结束中位 99.75ms。二者包含请求往返、线上服务生成、代理与流式传送，各自的服务端比例需要线上打点。 | 高，线上请求和路由阶段已配对；线上服务内部归因待测 |
| 2 | **等待阶段缺少明确的导航反馈。** 全站导航和文档卡片使用默认 `Link`，当前提交没有相应的 `loading.tsx`，链接也没有呈现 pending 状态。几百毫秒里用户仍看见原页面，容易继续点击。常规 hover、菜单开合和当前页高亮分别发生在指针交互或路由提交时。 | 高，源码与录制相符 |
| 3 | **路由提交后的同步滚动测量会放大首绘尾延迟。** 169.38ms 和 92.22ms 两次都落在 Next.js `InnerScrollHandler` 的 `useLayoutEffect`，浏览器在读取 `document.documentElement.clientHeight` 时同步刷新脏布局。首次进入 About 另有独立的 JS chunk 等待。 | 高，生产脚本列号与浏览器调用栈已交叉验证 |

## 2. 两份线上 Trace 的延迟分解

### 输入、请求和首绘

从主 frame 的 `CrRendererMain` 提取 `EventTiming` 中有交互 ID 的 `click`，再以同一微秒时钟将其与 `SoftNavigationEmitted.context.timeOrigin` 对齐。URL 使用 `urlChangeTime`，目标首绘使用 `firstContentfulPaint`，并核对对应的 `largestContentfulPaint::CandidateForSoftNavigation` 与页面节点。请求按同一 frame、目标 pathname、点击与 URL 更新之间唯一的 `_rsc` 发起事件配对。单独保留提前发出的同路径请求。

下表每格为 **p50 / p95 / 最大值**，单位 ms。p50 取常规中位数，p95 取 nearest rank，样本少时 p95 与最大值相同。

| 阶段 | 长录制（18 点击 / 11 软导航） | 快速录制（20 点击 / 16 软导航） |
| --- | ---: | ---: |
| 全部点击 Event Timing | 7.41 / 101.07 / 101.07 | 7.37 / 29.47 / 51.74 |
| 输入排队，全部点击 | 2.70 / 4.22 / 4.22 | 2.97 / 3.62 / 4.48 |
| 事件处理，全部点击 | 2.63 / 40.37 / 40.37 | 2.78 / 12.20 / 13.68 |
| 事件处理，配对软导航 | 2.58 / 4.00 / 4.00 | 2.78 / 4.76 / 4.76 |
| 点击 → RSC 发起 | 5.41 / 7.07 / 7.07 | 5.27 / 6.82 / 6.82 |
| RSC TTFB，sendEnd → receiveHeadersStart | 236.60 / 513.95 / 513.95 | 190.80 / 1841.88 / 1841.88 |
| RSC 发起 → 响应头事件 | 244.42 / 523.16 / 523.16 | 199.19 / 1858.11 / 1858.11 |
| RSC 响应头事件 → 响应结束事件 | 246.73 / 1426.23 / 1426.23 | 99.75 / 547.44 / 547.44 |
| RSC 发起 → 响应结束事件 | 616.91 / 1670.65 / 1670.65 | 357.39 / 1948.82 / 1948.82 |
| RSC 响应结束事件 → URL | 9.79 / 78.28 / 78.28 | 7.18 / 392.56 / 392.56 |
| 点击 → URL | 631.63 / 1686.58 / 1686.58 | 402.37 / 1936.76 / 1936.76 |
| URL → 目标内容首绘 | 63.28 / 131.48 / 131.48 | 53.36 / 211.00 / 211.00 |
| 点击 → 目标内容首绘 | 725.65 / 1742.60 / 1742.60 | 450.30 / 1987.05 / 1987.05 |
| 点击 → 首绘内的 Layout 总时长 | 5.32 / 70.34 / 70.34 | 4.68 / 171.73 / 171.73 |
| 点击 → 首绘内的 UpdateLayoutTree | 9.36 / 17.31 / 17.31 | 8.57 / 23.63 / 23.63 |
| 点击 → 首绘内的 Paint CPU | 1.78 / 15.29 / 15.29 | 2.11 / 36.04 / 36.04 |
| 包含 URL 更新的主线程任务 | 29.16 / 96.63 / 96.63 | 25.16 / 191.09 / 191.09 |
| V8 采样归入 React render | 17.50 / 141.95 / 141.95 | 14.16 / 211.39 / 211.39 |
| V8 采样归入 React commit | 23.12 / 93.74 / 93.74 | 22.37 / 189.02 / 189.02 |
| V8 采样归入 React passive effects | 0.99 / 3.93 / 3.93 | 1.04 / 3.60 / 3.60 |

快速录制中，**URL 更新前的 Layout 中位为 0ms，最大 2.02ms**。点击到 URL 期间主线程任务占用中位约 59.84ms，其中也有输入、后台预取、解码及旧页更新。最慢的一次进文档首页，发出请求后约 1.84s 才收到第一个响应头，首绘却在 URL 更新后约 50ms 出现。RSC 请求等待是该样本的关键路径。使用 Chrome 的网络侧 `finishTime` 时，快速录制的响应结束到 URL 中位为 13.32ms，renderer 上的响应结束通知本身可能有调度偏差。两次文档首页导航的 URL 早于 RSC 结束，说明路由能在流尾结束前提交。

React 数字是 V8 栈采样估算。用实际生产 React chunk 中的 render loop、commit/mutation/layout effects、passive effects 函数定位采样栈，按点击到目标首绘窗口汇总，包含同窗内的 React 工作。强制布局发生在 layout effect 中，和 commit 采样有重叠。快速录制 Agent 文档首访的 render 样本约 211ms，复访约 50ms，其中部分计算与 Flight 流式接收并行。快速录制有四个导航窗口各包含一次 50ms 以上主线程任务，对应首次 About、Settings、Embedded 和系列概览。

**两条对照时间线**

- `/en/docs/embedded-system-2`（快速录制）。点击 → 发请求 5.83ms → 响应头再等 360.32ms → 流结束再等 547.44ms → URL 再等 12.71ms → 目标首绘再等 211.00ms，总计 1137.29ms。169.38ms 同步 Layout 在 URL 更新后 17.74ms 开始，落在 191.09ms 主线程任务里。
- 首次 `/en/about`（快速录制）。点击 7446.126ms，RSC 约 210.21ms 结束，结束到 URL 仍有 392.56ms。此间首次加载 `2e62gf26dhplq.js`，发起到结束约 385.28ms，chunk 结束距 URL 9.68ms。生产脚本包含 [DocsCodeBlock](../../apps/web/src/features/docs/shared/renderers/blocks/docs-code-block.tsx) 的客户端实现，[AboutFeature](../../apps/web/src/features/about/index.tsx) 使用共享文档渲染。第二次同页 RSC 结束到 URL 仅 6.13ms。这条尾延迟与冷模块获取吻合。

两次录制分别有 7 和 4 个点击没有生成已发出的软导航事件。这里保留它们的 Event Timing，导航分位数只纳入有目标首绘的事件。仅凭这些记录无法判定未配对点击属于同页操作、被新导航替代，还是其他交互。

### 原始配对行

时间相对录制起点，单位 ms。`头后` 为响应头事件到 RSC 结束，`尾后` 为 RSC 结束到 URL，负值表示流尾晚于 URL。布局为点击到目标首绘窗口内的总量。

| 录制 | 点击时刻 | 目标（省略 `/en`） | 点击→URL | URL→首绘 | 点击→首绘 | TTFB | 头后 | 尾后 | Layout |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 长 | 1545.983 | /docs/agent-tool-systems | 705.117 | 63.278 | 768.395 | 214.045 | 464.572 | 9.791 | 11.753 |
| 长 | 3853.430 | /docs | 305.648 | 38.540 | 344.188 | 236.598 | 47.773 | 7.993 | 2.571 |
| 长 | 5188.611 | /dashboard | 631.626 | 94.028 | 725.654 | 228.659 | 378.013 | 9.307 | 5.322 |
| 长 | 9142.274 | /roadmap | 306.878 | 81.665 | 388.543 | 225.083 | 52.152 | 9.402 | 3.865 |
| 长 | 11278.754 | /docs | 306.588 | 45.479 | 352.067 | 230.850 | 46.504 | 13.489 | 3.146 |
| 长 | 12985.720 | /docs/embedded-system-2 | 1229.683 | 98.737 | 1328.420 | 254.369 | 955.071 | 7.410 | 15.021 |
| 长 | 17502.541 | /docs | 369.639 | 41.876 | 411.515 | 238.602 | 110.249 | 8.365 | 2.324 |
| 长 | 18913.741 | /settings | 852.408 | 131.476 | 983.884 | 513.949 | 246.729 | 78.277 | 70.339 |
| 长 | 23490.009 | /docs | 463.334 | 60.536 | 523.870 | 436.543 | 1.981 | 11.468 | 3.661 |
| 长 | 28454.685 | /docs/agent-tool-systems | 1686.579 | 56.024 | 1742.603 | 234.786 | 1426.232 | 9.947 | 9.599 |
| 长 | 42770.954 | /dashboard | 1015.153 | 94.022 | 1109.175 | 236.932 | 746.866 | 16.259 | 5.420 |
| 快 | 1146.041 | /roadmap | 270.444 | 98.980 | 369.424 | 166.924 | 72.576 | 13.059 | 25.576 |
| 快 | 3053.814 | /docs | 269.498 | 58.724 | 328.222 | 191.472 | 51.152 | 12.285 | 13.471 |
| 快 | 4270.793 | /docs/agent-tool-systems | 831.856 | 62.725 | 894.581 | 282.048 | 530.604 | 4.663 | 20.760 |
| 快 | 6371.976 | /docs | 259.328 | 50.707 | 310.035 | 178.679 | 56.530 | 5.386 | 2.809 |
| 快 | 7446.126 | /about | 606.917 | 45.646 | 652.563 | 175.531 | 25.542 | 392.556 | 3.379 |
| 快 | 9340.803 | /settings | 286.888 | 87.546 | 374.434 | 202.688 | 26.888 | 45.151 | 38.013 |
| 快 | 10840.088 | /about | 304.940 | 36.993 | 341.933 | 177.904 | 108.801 | 6.127 | 2.438 |
| 快 | 11552.940 | /roadmap | 425.147 | 53.799 | 478.946 | 237.560 | 171.748 | 2.014 | 2.431 |
| 快 | 12630.125 | /dashboard | 579.373 | 55.770 | 635.143 | 185.703 | 369.803 | 8.234 | 5.222 |
| 快 | 19794.705 | /docs | 1936.761 | 50.290 | 1987.051 | 1841.878 | 90.704 | -17.639 | 4.139 |
| 快 | 22781.104 | /docs/agent-tool-systems | 597.663 | 52.913 | 650.576 | 155.093 | 414.305 | 11.858 | 10.986 |
| 快 | 24888.758 | /docs | 328.211 | 31.471 | 359.682 | 181.981 | 154.526 | -22.648 | 2.299 |
| 快 | 26077.598 | /docs/embedded-system-2 | 926.290 | 210.999 | 1137.289 | 352.655 | 547.438 | 12.709 | 171.730 |
| 快 | 27911.477 | /docs | 379.600 | 42.051 | 421.651 | 268.423 | 90.077 | 4.667 | 1.849 |
| 快 | 28953.282 | /docs/series/design-patterns/design-patterns-overview | 725.445 | 119.358 | 844.803 | 480.921 | 225.719 | 4.663 | 92.429 |
| 快 | 30924.198 | /docs | 281.695 | 42.338 | 324.033 | 190.135 | 67.084 | 10.142 | 2.396 |

## 3. 代码定位

### 点击、预取、路由状态

- **版本。** 工作树的 [应用 manifest](../../apps/web/package.json) 与 [锁文件](../../pnpm-lock.yaml) 声明 Next.js 16.4.0。本机实际依赖、复测用的本地构建以及两份 Trace 中的生产脚本均为 **16.4.3**。生产 chunk `03c6i87gt_q9b.js` 内可见 `window.next={version:"16.4.3",appDir:!0}`。线上复测时 React DOM DevTools hook 报告 App Router 使用 `19.3.0-canary-278794d7-20261002`。
- **应用入口。** [SiteHeader](../../apps/web/src/components/layouts/site-header.tsx) 的桌面主导航、[移动导航](../../apps/web/src/components/layouts/site-header-mo.tsx)、[DocsHomeListItem](../../apps/web/src/features/docs/home/components/docs-home-list-item.tsx) 的可访问文章、[DocsArticleSidebar](../../apps/web/src/features/docs/shared/components/docs-article-sidebar.tsx) 的系列文章都直接渲染 Next `Link`。应用层没有在这些点击里 await 数据或调用自定义导航队列。桌面子菜单的 180ms 是离开时关闭的定时器。当前页高亮取 `usePathname()`，路径变化时顺带关闭菜单。
- **Next 16.4.3 执行链。** `next/dist/client/app-dir/link.js#linkClicked` 拦截同源普通点击并进入 `components/navigator.js#navigate` 的 transition，导航 action 进入 `navigateReducer`。路由缓存缺少可用目标时，`components/app-router-state.js#navigateToUnknownRoute` 调用并等待 `fetchServerResponse`，随后从 Flight 数据构造路由树。已有可复用树时走 segment cache 路径，缺失的动态段仍可发请求。React 提交中的 `components/app-router.js#HistoryUpdater` 在 `useInsertionEffect` 写入 history；DOM、布局 effect 和画面呈现还有后续开销。URL 更新是提交内的一个时间点。
- **预取实际运行。** 两份 Trace 分别有 30 和 42 个 RSC 请求，其中 19 和 25 个未配对且为低优先级；线上访客 CDP 明确捕获 `Next-Router-Prefetch: 1`，包括 `Next-Router-Segment-Prefetch: /_tree`。树或部分响应提前成功后，重复点击仍发了无 prefetch header 的目标 Flight 请求。27 条配对响应全部是 `private, no-cache, no-store, max-age=0, must-revalidate`，未从浏览器 HTTP 缓存提供。视口预取、Next 内存 Router Cache 和 HTTP 缓存分别记录。
- **页面边界。** [Next 配置](../../apps/web/next.config.ts) 未启用 Cache Components 或调整 `staleTimes`。三条重点路由的父级和页面目录没有 `loading.tsx`，页面树中也没有包住相应页面取数的应用级 Suspense fallback。现有导航链接没有消费 `useLinkStatus`。没有看到前一页请求必须完成后才能触发后一页的应用代码。框架将导航放入 transition 并支持被后续导航替代。 [Next.js 导航指南](https://nextjs.org/docs/app/getting-started/linking-and-navigating) · [预取指南](https://nextjs.org/docs/app/guides/prefetching) · [useLinkStatus](https://nextjs.org/docs/app/api-reference/functions/use-link-status)

### 服务端路径和页面差异

| 页面 | 源码链路 | 与时延相关的证据 |
| --- | --- | --- |
| `/en/docs` | [DocsPage](../../apps/web/src/app/%5Blocale%5D/docs/page.tsx) → [getCurrentViewer](../../apps/web/src/server/auth/viewer.ts) → [getDocsHomePage](../../apps/web/src/server/docs/access.ts) → [preferredHomeEntries](../../apps/web/src/server/docs/reading-language.ts) 并行读取两种文档语言 → [listPublishedDocsHomeEntries](../../packages/db/src/docs/queries/home.ts) → 权限过滤、分组和卡片。 | 每次读取访问 cookie，访客分支直接返回，带会话时会查询有效 session。文档语言 cookie 和列表来自当前请求，列表请求发起了两种 locale 的查询。快速录制首页正文约 5.7–6.1kB 解码，极端 1.84s TTFB 出现在小响应上。 |
| 文档详情 | [DocsArticlePage](../../apps/web/src/app/%5Blocale%5D/docs/%5Bslug%5D/page.tsx) / [DocsCollectionArticlePage](../../apps/web/src/app/%5Blocale%5D/docs/series/%5BcollectionSlug%5D/%5BarticleSlug%5D/page.tsx) → 会话 → [resolveArticleReadingRoute / resolveCollectionReadingRoute](../../apps/web/src/server/docs/reading-language.ts) 识别 URL、按语言选已发布版本 → [单篇查询](../../packages/db/src/docs/queries/article.ts) / [系列查询](../../packages/db/src/docs/queries/collection.ts) → 权限过滤及 [页面模型](../../apps/web/src/server/docs/mappers.ts) → [DocsArticleFeature](../../apps/web/src/features/docs/article/docs-article-feature.tsx)。 | 语言解析与正文查询顺序执行，可能回退到另一种语言。系列还生成导航树。代码块经过 [DocsHighlightedCodeBlock](../../apps/web/src/features/docs/shared/renderers/blocks/docs-highlighted-code-block.tsx) → [highlightDocsCode](../../apps/web/src/features/docs/code-highlighting/highlight-code.ts)，读取配色 cookie 并调用 Shiki `codeToTokens`。Highlighter 实例已复用，token 化及行/词元 span 仍按渲染发生。快速录制中 Agent 文章 190.4kB 解码、57.7–57.9kB 编码，Embedded 222.0kB / 50.3kB，系列 47.7kB / 14.1kB。大文章的响应头后仍有 414–547ms，长录制个别达到 1426ms。 |
| `/en/dashboard` | [DashboardPage](../../apps/web/src/app/%5Blocale%5D/dashboard/page.tsx) → 会话 → [TokenDashboardPage](../../packages/dashboard/src/next/dashboard-page.tsx) → [readDashboardSnapshot](../../packages/dashboard/src/adapters/runtime/snapshot-store.ts) → 对角色做数据投影，将初始数据传给客户端 Feature。 | 快速录制首个 Dashboard Flight 已有约 751kB 解码 / 85kB 编码，响应头后 370ms，点击到首绘 635ms。范围切换或后台更新再由 [useDashboardWindow](../../packages/dashboard/src/react/hooks/use-dashboard-window.ts) 请求独立的 usage API。 |

[proxy.ts](../../apps/web/src/proxy.ts) 是 next-intl locale 处理，matcher 覆盖页面并排除了 API、静态资产。已配对 Flight 为同源、HTTP/2、复用连接、200 响应。没有观察到它们先走一次额外 HTTP 重定向。[根布局](../../apps/web/src/app/layout.tsx) 放置主题及运行时 providers，[locale layout](../../apps/web/src/app/%5Blocale%5D/layout.tsx) 加载 locale 消息并复用同 locale 的 AppShell，[getLocaleMessages](../../apps/web/src/i18n/loaders/get-messages.ts) 并行导入本地消息模块。它们可能有首次挂载和 bundle 成本，检查的应用链路没有发现由全局 Provider 发起并串行等待的导航前置网络请求。

### Forced Reflow

两份 Trace 的 `metadata.sourceMaps` 都为空，`ScriptCatchup` 的 V8 source rundown 保留了原始生产 JS。以 frame 的 script ID 配对脚本正文，读取精确列号，再与本机 16.4.3 的可读 Next 源码逐段对照。分析没有改动生产 Source Map 配置。

| 事件 | 布局对象 | 精确触发链 |
| --- | --- | --- |
| 快速录制 `181802894531µs`，Embedded | 169.383ms，2288 dirty / 2413 total，全量 Layout | `416n3ovyye9v1.js:1:11512` 落在 `e.clientHeight`；`e=document.documentElement`。 |
| 快速录制 `181805561592µs`，系列概览 | 92.217ms，462 dirty / 587 total，全量 Layout | 相同列号、相同布局 effect，URL 更新后 9.96ms 触发，包含 URL 的主线程任务总计 108.53ms。 |
| 长录制 `180944015912µs`，Settings | 69.471ms，1590 dirty / 1692 total | 同一滚动 effect。进入 Embedded 的另一次相同调用为 14.711ms，同样是 2288 dirty。 |

`416n3ovyye9v1.js:1:11266` 进入 `disableSmoothScrollDuringRouteTransition`，`1:17809` 位于该包装器；`03c6i87gt_q9b.js:1:113718` 是 React 的 effect 调用，`1:124330` 是 layout-effect 遍历。对应本机 `next/dist/client/components/layout-router.js:100–185#InnerScrollHandler`。React 已经变更 DOM，滚动处理为了判断目标是否在视口中，先同步读取根元素高度，再使用 `getClientRects()`，并按需要读取 scroll padding、设 `scrollTop` 或调用 `scrollIntoView()`。这次强制刷新发生在根高度读取处。`dontForceLayout: true` 是包装器选项，跳过包装器自身的额外几何读取。该 option 的名字出现在 V8 栈里。

快速录制 63 次 Layout 中 21 次有 JS 调用栈，未带 JS 栈的 Layout 最大 5.77ms。长录制为 76 次中 24 次有栈，未带栈最大 7.65ms。有栈样本用于识别同步读取者，普通帧的布局也计入浏览器渲染时间。相同数量的 dirty objects 在两次 Embedded 样本里耗时差约 11.5 倍，需同时考虑样式、字体、布局状态、浏览器调度和负载。dirty objects 计的是布局对象。

[DocsArticleRightRail](../../apps/web/src/features/docs/shared/components/docs-article-right-rail.tsx) 的 `syncActiveSection` 在 passive effect 初始化和 scroll/resize 中遍历标题并读取 `getBoundingClientRect()` 与 `scrollHeight`。另外两个 effect 读取右栏可见高度和激活链接位置，最后按需平滑滚动侧栏。这是独立的滚动热路径。两条最大 Layout 的栈显示的是框架在提交时的滚动处理。文档正文的高亮 span、标题树和侧栏都会提高参与布局的工作量，待进一步按路由核对哪类节点主导长尾。快速录制的 renderer node counter 窗口峰值中位 4401、最大 37377，计入未释放及其他文档节点。新浏览器测试额外记录当前文档的元素数。

### Dashboard usage API 单列

长录制的 `30d` 成功样本为 748,685 解码字节、2.619s，其中响应头后 2.323s。`all` 为 1,220,337 解码字节、10.274s，其中响应头后 9.958s。一次 `30d` 流中断。快速录制的 `30d` 成功样本是 748,685 字节、3.851s。长录制的 56.901ms Dashboard Layout 出现在 `all` 请求完成后 340.39ms，属于页面已经可见后的数据更新。其生产栈 `0cfkw8r44nq47.js:1:642` 落在 [DashboardTableFrame](../../packages/dashboard/src/react/components/dashboard-table-frame.tsx) 的 `useLayoutEffect` 测量函数，涉及 `offsetWidth` 和行高测量。后续可单独拆分快照读取、角色投影、响应压缩及图表提交。

## 4. 生产构建对照实验

### 环境与复现

- **线上。** 使用 Trace 对应的 [生产站点](https://43-155-136-83.sslip.io/en/docs)，新访客上下文。录制中的 Agent、Embedded 等页面在本次访客文档首页没有入口，改用线上和本地均有链接的长文档 `/en/docs/git-base-knowledge`。首页从 `/en/about` 导航，其他目标从 `/en/docs` 导航。
- **本地。** 用同一台 Windows 主机的已存在 Turbopack 生产产物，工作树 `sync-reliability-perf`、提交 `84848e3`、Next 16.4.3，`next start` 只监听回环并连接现有本机 PostgreSQL。当前提交重新构建时，Windows Turbopack 的 PostCSS 子进程在 IPC 建立前退出，Webpack 回退在文件追踪期间报用户目录的 `readlink EPERM`。因此本地表使用上述历史生产产物。Dashboard 的本地隔离快照目录为空，页面比线上小，按不同数据量解读。
- **浏览器。** Chromium 156.0.8078.4，1240×900，headless、禁用扩展、普通 CPU 和网络设置。两份用户录制的 source rundown 均有两个扩展脚本 ID。快速录制在关键窗口中直接落入扩展脚本栈的 V8 样本约 1.05ms p50、2.39ms 最大，禁扩展线上冷长文仍有 134ms 级别布局。扩展比较使用原录制和新的干净录制，账号、路径、时刻和浏览器条件有差异。
- **冷导航**：每轮使用新上下文，禁用 HTTP cache，加载来源页、等待 hydration 后停 350ms，再点击真实可见链接。框架仍可在点击前发起视口/意图预取。
- **重复导航**：新上下文先真实点击目标，再从目标点击返回来源，然后重新点击目标。保持同一个文档和客户端 Router Cache。
- **HTTP 热缓存**：同一上下文预先访问目标，再整页加载来源，保留浏览器 HTTP cache 并重建 Router Cache，再点击同一目标。

每个环境、路径、条件安排 5 轮。线上首轮 52/60 个有效软导航，本地 60/60。线上失败包括 5 次等待 URL 超时、2 次目标已出现但原文档探针被重置、1 次来源页连接关闭，失败样本有独立记录。Dashboard 冷条件用 `waitUntil: 'commit'` 补测 5/5，保留为单独批次。表中“内容”使用目标 `main` 子树替换后跨过一次 `requestAnimationFrame` 的时间，作为相同口径的可见代理。另存 Chrome soft navigation paint、URL 标记和 DOM 原始值。使用浏览器 Trace 的输入/URL，缺失时使用同一文档的 history 写入探针。React hook 记录提交完成的时间，窗口内的主线程任务、Layout、样式更新与 Paint 来自 CDP Trace。React render 的独立估算取自第 2 节原始线上 V8 采样。

### URL、内容和 RSC

每格为 **p50 / p95 / 最大值**（ms）。Dashboard 线上冷条件首轮的单个有效样本保留作诊断。条件之间按每组的原始轮次比较。

| 环境 | 路径 / 条件 | n | 点击→URL | 点击→内容 | RSC 总时长 | TTFB | Layout |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 线上 | 文档首页 / 冷 | 3 | 1719.5 / 2233.4 / 2233.4 | 1759.1 / 2277.5 / 2277.5 | 533.1 / 1406.7 / 1406.7 | 293.1 / 1308.6 / 1308.6 | 29.7 / 34.4 / 34.4 |
| 线上 | 文档首页 / 重复 | 5 | 602.0 / 3157.5 / 3157.5 | 629.1 / 3178.7 / 3178.7 | 592.5 / 3149.1 / 3149.1 | 367.6 / 3143.8 / 3143.8 | 1.0 / 1.4 / 1.4 |
| 线上 | 文档首页 / HTTP 热 | 5 | 1139.2 / 5009.1 / 5009.1 | 1172.0 / 5035.1 / 5035.1 | 1081.7 / 4997.1 / 4997.1 | 995.7 / 4801.2 / 4801.2 | 1.1 / 1.4 / 1.4 |
| 线上 | 长文 / 冷 | 5 | 1114.0 / 2778.4 / 2778.4 | 1297.9 / 2925.0 / 2925.0 | 818.1 / 2755.9 / 2755.9 | 798.7 / 2579.8 / 2579.8 | 133.9 / 148.0 / 148.0 |
| 线上 | 长文 / 重复 | 5 | 530.7 / 551.6 / 551.6 | 563.8 / 579.1 / 579.1 | 514.4 / 530.8 / 530.8 | 366.6 / 460.7 / 460.7 | 8.7 / 10.9 / 10.9 |
| 线上 | 长文 / HTTP 热 | 4 | 1528.9 / 2532.6 / 2532.6 | 1552.1 / 2556.0 / 2556.0 | 1155.5 / 2678.2 / 2678.2 | 640.6 / 2271.5 / 2271.5 | 6.8 / 9.4 / 9.4 |
| 线上 | About / 冷 | 5 | 1730.7 / 3033.1 / 3033.1 | 1749.8 / 3050.3 / 3050.3 | 902.0 / 1204.7 / 1204.7 | 703.5 / 1203.2 / 1203.2 | 6.4 / 9.7 / 9.7 |
| 线上 | About / 重复 | 5 | 407.7 / 727.9 / 727.9 | 432.5 / 748.3 / 748.3 | 404.5 / 724.4 / 724.4 | 393.8 / 507.8 / 507.8 | 0.3 / 0.3 / 0.3 |
| 线上 | About / HTTP 热 | 5 | 1349.0 / 6384.5 / 6384.5 | 1363.4 / 6412.2 / 6412.2 | 881.3 / 2601.9 / 2601.9 | 879.1 / 2085.7 / 2085.7 | 0.4 / 0.7 / 0.7 |
| 线上 | Dashboard / 冷 | 1 | 1887.9 / 1887.9 / 1887.9 | 1935.0 / 1935.0 / 1935.0 | 1594.7 / 1594.7 / 1594.7 | 823.8 / 823.8 / 823.8 | 31.6 / 31.6 / 31.6 |
| 线上 | Dashboard / 冷补测 | 5 | 2168.2 / 2579.6 / 2579.6 | 2213.1 / 2621.6 / 2621.6 | 1235.8 / 1508.0 / 1508.0 | 653.2 / 1225.2 / 1225.2 | 28.0 / 33.0 / 33.0 |
| 线上 | Dashboard / 重复 | 4 | 558.9 / 999.6 / 999.6 | 580.8 / 1016.4 / 1016.4 | 553.5 / 989.8 / 989.8 | 454.7 / 988.2 / 988.2 | 1.3 / 1.3 / 1.3 |
| 线上 | Dashboard / HTTP 热 | 5 | 679.1 / 949.7 / 949.7 | 701.6 / 965.1 / 965.1 | 669.6 / 814.6 / 814.6 | 663.7 / 704.3 / 704.3 | 1.3 / 1.8 / 1.8 |
| 本地 | 文档首页 / 冷 | 5 | 61.9 / 248.5 / 248.5 | 87.8 / 299.6 / 299.6 | 32.3 / 159.0 / 159.0 | 9.8 / 100.7 / 100.7 | 14.7 / 38.0 / 38.0 |
| 本地 | 文档首页 / 重复 | 5 | 23.9 / 29.8 / 29.8 | 46.3 / 47.1 / 47.1 | 21.0 / 22.6 / 22.6 | 9.7 / 10.3 / 10.3 | 0.5 / 0.7 / 0.7 |
| 本地 | 文档首页 / HTTP 热 | 5 | 33.1 / 38.3 / 38.3 | 52.8 / 60.3 / 60.3 | 31.9 / 39.5 / 39.5 | 9.4 / 18.2 / 18.2 | 0.5 / 0.7 / 0.7 |
| 本地 | 长文 / 冷 | 5 | 170.9 / 573.1 / 573.1 | 247.6 / 657.9 / 657.9 | 241.2 / 561.0 / 561.0 | 8.2 / 9.3 / 9.3 | 69.9 / 74.9 / 74.9 |
| 本地 | 长文 / 重复 | 5 | 183.0 / 356.8 / 356.8 | 212.3 / 386.1 / 386.1 | 189.5 / 362.2 / 362.2 | 6.0 / 8.4 / 8.4 | 3.7 / 4.9 / 4.9 |
| 本地 | 长文 / HTTP 热 | 5 | 281.9 / 454.8 / 454.8 | 308.9 / 482.8 / 482.8 | 290.5 / 466.6 / 466.6 | 5.5 / 9.8 / 9.8 | 4.2 / 5.7 / 5.7 |
| 本地 | About / 冷 | 5 | 33.9 / 45.1 / 45.1 | 65.4 / 69.9 / 69.9 | 17.3 / 30.2 / 30.2 | 4.9 / 6.6 / 6.6 | 6.3 / 8.7 / 8.7 |
| 本地 | About / 重复 | 5 | 20.1 / 23.6 / 23.6 | 45.0 / 45.9 / 45.9 | 18.8 / 23.1 / 23.1 | 5.1 / 7.0 / 7.0 | 0.3 / 0.4 / 0.4 |
| 本地 | About / HTTP 热 | 5 | 19.2 / 25.4 / 25.4 | 45.4 / 46.4 / 46.4 | 17.9 / 24.7 / 24.7 | 5.0 / 6.9 / 6.9 | 0.3 / 0.4 / 0.4 |
| 本地 | Dashboard / 冷 | 5 | 30.7 / 52.1 / 52.1 | 49.7 / 84.1 / 84.1 | 5.0 / 6.5 / 6.5 | 3.1 / 4.2 / 4.2 | 7.4 / 13.0 / 13.0 |
| 本地 | Dashboard / 重复 | 5 | 18.0 / 19.1 / 19.1 | 47.4 / 48.7 / 48.7 | 4.4 / 8.2 / 8.2 | 2.8 / 3.7 / 3.7 | 1.1 / 1.4 / 1.4 |
| 本地 | Dashboard / HTTP 热 | 5 | 21.2 / 23.6 / 23.6 | 52.4 / 62.6 / 62.6 | 4.6 / 6.8 / 6.8 | 2.9 / 4.3 / 4.3 | 7.6 / 11.6 / 11.6 |

静态资源 HTTP 热组中位命中约 11–14 个已有资源。线上 37/57 和本地 60/60 的目标已有至少一个 prefetch 在点击前结束，**全部 117 个有效样本仍产生目标动态 Flight，HTTP cache 命中 0 次**。两边重复导航都有较低的布局成本，线上热组 TTFB 仍有明显波动。

### 浏览器阶段与 DOM

代表性冷条件，每格为 **p50 / p95 / 最大值**（ms 或节点数）。Long Task 一栏为每轮最长的 50ms 以上任务，没有长任务时记 0。峰值是 renderer node counter，元素数是目标页当前 document 的活跃元素计数。

| 环境 / 页面 | Click Event Timing | URL→React commit hook | 包含 URL 的主线程任务 | 样式更新 | Paint CPU | Long Task | 元素数 | 节点峰值 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 线上 / About | 18.3 / 18.4 / 18.4 | 8.6 / 12.2 / 12.2 | 12.3 / 16.8 / 16.8 | 1.9 / 2.3 / 2.3 | 1.4 / 1.5 / 1.5 | 0 / 0 / 0 | 140 / 140 / 140 | 502 / 627 / 627 |
| 线上 / 长文 | 15.8 / 16.5 / 16.5 | 144.6 / 164.6 / 164.6 | 147.7 / 173.1 / 173.1 | 10.1 / 18.9 / 18.9 | 3.9 / 4.9 / 4.9 | 147.7 / 173.1 / 173.1 | 1133 / 1133 / 1133 | 2099 / 6243 / 6243 |
| 本地 / About | 17.3 / 19.4 / 19.4 | 8.4 / 11.9 / 11.9 | 12.4 / 18.4 / 18.4 | 1.5 / 2.0 / 2.0 | 0.5 / 0.7 / 0.7 | 0 / 0 / 0 | 142 / 142 / 142 | 548 / 590 / 590 |
| 本地 / 长文 | 15.1 / 17.6 / 17.6 | 75.9 / 80.3 / 80.3 | 79.3 / 82.7 / 82.7 | 6.4 / 7.8 / 7.8 | 2.4 / 2.5 / 2.5 | 79.3 / 82.7 / 82.7 | 1135 / 1135 / 1135 | 4693 / 15518 / 15518 |

线上和本地的冷长文每轮各出现一个长任务，分别为 5/5。线上冷长文通常从约 188 个文档元素增加至 1133 个，本地从约 190 增至 1135。线上和本地 117 个有效样本中，探针在 URL 前观察到的链接 pending 类名、内容或 `aria-busy` 变化为 0。该探针记录应用级状态变化，指针 hover 或浏览器原生反馈不在该指标内。

### 控制变量：只延迟 RSC 交付

在本地生产构建和同一 PostgreSQL 上，CDP `Fetch` 在目标动态 Flight 的 Response 阶段暂停 300ms，然后放行。每路径每组 5 轮重复导航。浏览器 CDP Network 记录的实际请求可能在拦截等待结束前已收到响应，因果变量是响应对 App Router 的可用时刻。两组都走真实点击、真实服务端和相同渲染逻辑。

| 路径 | 点击→URL 对照 → +300ms（p50 / p95 / max） | 点击→内容 对照 → +300ms（p50 / p95 / max） | Layout p50 |
| --- | --- | --- | --- |
| 文档首页 | 18.6 / 21.0 / 21.0 → 320.2 / 327.0 / 327.0 | 47.6 / 49.7 / 49.7 → 348.0 / 349.2 / 349.2 | 0.48 → 0.44ms |
| 长文 | 49.9 / 56.3 / 56.3 → 320.8 / 326.6 / 326.6 | 66.6 / 81.5 / 81.5 → 348.0 / 348.7 / 348.7 | 4.02 → 3.30ms |
| About | 18.3 / 19.0 / 19.0 → 319.9 / 323.9 / 323.9 | 48.6 / 49.5 / 49.5 → 347.3 / 348.4 / 348.4 | 0.32 → 0.31ms |

文档首页与 About 的 URL 和内容几乎等量后移。长文的流式服务器工作和暂停窗口重叠，URL 中位后移 271ms，内容后移 281ms。布局变化为毫秒量级。这个实验将等待放在浏览器与路由之间，确认 Flight 可用时间能够单独移动路由与首绘。

同轮在 Node HTTP 层记录请求进入、响应头、首写、结束。以下包含预热与往返中的同路径普通动态请求，排除 prefetch。以单进程回环测试估计本地 origin 的服务阶段：

| 路径 | n | Node 收到请求→首写，p50 / p95 / max | Node 收到请求→响应完成，p50 / p95 / max | 写入块数中位 |
| --- | ---: | ---: | ---: | ---: |
| 文档首页 | 40 | 3.4 / 5.3 / 14.1ms | 7.8 / 13.6 / 61.7ms | 5 |
| 长文 | 20 | 3.1 / 5.6 / 5.6ms | 36.3 / 71.8 / 261.3ms | 55 |
| About | 30 | 2.9 / 3.8 / 6.5ms | 6.8 / 14.1 / 21.4ms | 7 |

本地长文响应头很早，但服务端继续产生 Flight 数据的时间长于简单页面。线上记录没有 `Server-Timing`。线上 TTFB、流传输、代理缓冲与 origin 计算之间的精确分配需要同请求打点。回环和线上的耗时差还包含数据量、运行负载、部署和网络环境差异。

### 可复现材料

原始输入校验值：

- `Trace-20261111T154316 (2).json.gz` · 488,378 个事件 · SHA-256 `0cdfe01576e0aeecc6009af65506a5cab03c26ea1796eb4a5617d7c00e2fec82`
- `test2.gz` · 230,190 个事件 · SHA-256 `59956ea289ced2fb76b7360126c64f1c469fcc60918673d70e61fa7b2d7b5904`

本地忽略目录 [output/playwright/navigation-investigation](../../output/playwright/navigation-investigation/) 保存 [Trace 提取脚本](../../output/playwright/navigation-investigation/trace.cjs)、[Playwright/CDP 采集脚本](../../output/playwright/navigation-investigation/browser.cjs)、[浏览器汇总脚本](../../output/playwright/navigation-investigation/browser-summary.cjs)、[Node HTTP 打点](../../output/playwright/navigation-investigation/server-timing.cjs) 和 [原始汇总](../../output/playwright/navigation-investigation/browser-summary.txt)。每个实验子目录包含 `samples.jsonl`、每轮压缩 CDP Trace、`summary.json` 和适用时的 `errors.jsonl`。下载目录的输入 Trace 没有复制到仓库。复跑时将 `NAV_PLAYWRIGHT` 指向本机 Playwright 包，选用新的输出目录：

```powershell
$p = 'output/playwright/navigation-investigation'
node "$p/trace.cjs" "$p" 'C:/Users/86139/Downloads/Trace-20261111T154316 (2).json.gz' 'C:/Users/86139/Downloads/test2.gz'
node "$p/browser.cjs" https://43-155-136-83.sslip.io "$p/online-rerun" 5 index,long,about,dashboard cold,repeat,http-warm
node "$p/browser.cjs" http://127.0.0.1:4319 "$p/local-rerun" 5 index,long,about,dashboard cold,repeat,http-warm
node "$p/browser-summary.cjs" "$p/online-rerun" "$p/local-rerun"
```

## 5. 优化顺序

| 顺序 | 最小改动与范围 | 预期收益 | 风险与对照验收 |
| --- | --- | --- | --- |
| 1 | 在 `SiteHeader`、移动导航和可点击的文档卡片给 `Link` 增加可感知的 pending；单独提交 docs 路由的 `loading.tsx`，用稳定尺寸的文档骨架承接页面取数。 | 点击后能先反馈。已预取 fallback 时，URL 和骨架有机会在动态正文之前提交。 | 快速切换只保留最后点击的 pending，验证键盘、修饰键、新标签、前进后退和屏幕阅读器。分别测首次反馈、骨架、真实正文，比较 p50/p95，检查闪烁、CLS 和预取数量。 |
| 2 | 给 `proxy`、鉴权、`resolve*ReadingRoute`、Prisma 查询、`codeToTokens`、Flight 首写/末写加同请求 ID 的分阶段计时。根据耗时先试只缓存可共享的已发布正文或高亮派生结果，再试对少量高意图链接提前取数。 | 直接改善前置数百毫秒等待。动态响应、冷模块和服务器渲染三段可独立验收。 | 缓存键包括发布版本、locale 和配色等实际输入；发布及权限变更要回归。保留每次请求的访问检查。监测请求量、DB 和服务端 CPU，避免给所有文章做完整预取。 |
| 3 | 对长文的离屏正文分段评估布局隔离，先挑 Embedded 和公开 Git 长文做单独 A/B。保留原生滚动处理。若考虑框架改动，先验证补丁对框架滚动路径的影响。 | 降低提交时参与强制 Layout 的对象数和冷长文的首绘尾延迟。实测窗口有 70–169ms 级别的布局成本。 | 对比 dirty objects、长任务和正文首绘。回归 TOC 高亮、锚点、返回恢复滚动、浏览器查找、打印、图片加载和移动端。TOC 的 effect 优化按独立滚动录制决定。 |
| 4 | About 的客户端模块单独检查实际使用的共享渲染器与首访预取；Dashboard usage API 另开独立的响应体、压缩和表格提交调查。 | 减少首次 About 的 chunk 等待，并降低 Dashboard 进入后交互成本。 | 仅在首访的模块等待可重复时改动。Dashboard 以同角色、同范围、同快照比较首绘与数据刷新。 |

## 6. 优化结果

本次完成基线和因果对照，未改应用行为。300ms 实验验证了动态 Flight 等待对 URL 和首绘的影响。当前可直接用两份原始录制和线上／本地多轮样本作为修复前基线。布局候选与 pending/fallback 各自建立修复后的生产构建，再按第 5 节验证功能和性能。

## 7. 剩余证据

1. **线上 origin 与网络的分账。** 在同一请求里采集代理接收/首发/末发、Node 起止、会话和 Prisma、Shiki、Flight 字节及分块。优先覆盖快录制文档首页 1.84s TTFB 与长录制 Agent 文章 1.43s 的头后尾延迟。
2. **应用提交和真实用户角色对齐。** 用当前提交在 Linux 复建，按 guest、pro、owner 分层复测真实长文章、短文章和 Dashboard 同范围快照。客户端保留带时间戳的 React render、commit 与 paint；角色数据留在授权环境。
3. **确认冷长文布局差异的组成。** 同一浏览器和构建控制资源状态，记录 font readiness、样式失效、正文与侧栏节点。若需量化扩展贡献，在同一版本、相同路径和相同网络下用同一份浏览器配置，仅切换扩展启用状态。
4. **分析极端线上失败。** 在出现页面 URL 超时或目标文档重载时同时留存 RSC 状态码、回退到文档导航的原因、请求取消和 Proxy 日志。配对时保留失败和被替代的点击。
