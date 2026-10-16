# 旧后台与开发页面清理

日期：2026-10-15。范围：本地 Web 与 roadmap 包。

## Docs 发布总览核查

当前已登录 Owner 的同一浏览器可正常打开以下页面，均显示 14 条记录，未复现报错：

- http://localhost:3000/zh/studio/docs/library
- http://localhost:3000/en/studio/docs/library

父布局调用 `requireOwner()`，缺少 Owner 会话时返回 404。`localhost` 与 `127.0.0.1` 的登录 Cookie 不共用。此前报错的具体内容尚未取得，本轮保留该页面和权限门禁。

## 完成的清理

- 删除 `/{locale}/studio/roadmap` 页面及旧 `RoadmapAdminPanel`、Chrome 类型、独占 loader、翻译文案和导出。
- 删除旧看板、栏目管理 API 的路由、handler、端点常量及独占写端口方法；同步移除对应 Prisma 绑定和旧功能测试。
- 保留正式路线图使用的项目、条目和导入能力。设置页的项目 loader 更名为 `loadRoadmapProjects`。
- 删除 `/{locale}/docs/style-lab` 路由、正式 barrel 导出和播放器路由特例；将有用样例移动到 `apps/web/src/features/docs/block-system/__fixtures__/`。
- 删除空归档正文、组件、翻译和注释导航；`/{locale}/docs/archive` 仅保留到同语言 Docs 列表的 307 跳转。

项目创建所需的默认看板与栏目初始化、项目删除的数据保护继续由现用项目写端口处理。数据库表与内容无需迁移。

## 验收

实际本地 HTTP 检查：

| 地址 | 结果 |
| --- | --- |
| `/zh/studio/roadmap`、`/en/studio/roadmap` | 404 |
| `/zh/docs/style-lab`、`/en/docs/style-lab` | 404 |
| `/api/internal/roadmap/roadmaps` 及单项路由 | 404 |
| `/api/internal/roadmap/columns` 及单项路由 | 404 |
| `/zh/docs/archive` | 307 → `/zh/docs` |
| `/en/docs/archive` | 307 → `/en/docs` |

- Roadmap 完整测试：7 个文件、63 项通过。
- Web 路线图、项目设置、权限和敏感导入回归：5 个文件、23 项通过。
- Roadmap 与 Web 类型检查通过；删除页面后已重新生成 Next.js 路由类型。
- 本轮 Web 改动 ESLint 通过。
- 浏览器中真实 Owner 可打开正式路线图 Editor；未提交写入操作。
- docs push 预览和 confirm 文件未改动。

HTML 审查页及截图位于 `.scratch/cleanup-route-audit-2026-10-15/four-page-review.html`；HTTP 原始记录位于 `.scratch/route-retirement-2026-10-15/http-results.json`。

本记录的验收阶段尚未创建提交，未推送或部署。

## 追加：剩余旧地址清理

按后续批注，删除 `/{locale}/workspace`、`/{locale}/resources`、`/{locale}/create` 的页面文件，并清除对应注释导航、Mock 导航项、导航翻译和播放器隐藏路由特例。`WorkspaceShell` 是正式页面仍在使用的布局容器，继续保留。

`/{locale}/tools/playback` 的兼容跳转改为 `/{locale}/settings?section=music`。`docs/reference` 保持原状。

实际 HTTP 验收覆盖中英文 8 个地址：6 个删除地址均返回 404；2 个 playback 地址均返回 307，Location 指向相应语言的音乐设置分区。浏览器实查中文旧 playback 地址后，URL 和正文均进入音乐分区。

本次 Web 类型检查、4 项设置渲染测试和 ESLint 全部通过。HTTP 记录保存在 `.scratch/route-retirement-2026-10-15/remaining-routes-http.json`，跳转截图为同目录的 `playback-music-redirect.png`。
