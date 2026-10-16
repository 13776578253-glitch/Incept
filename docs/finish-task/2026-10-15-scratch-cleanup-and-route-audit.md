# 临时材料清理与非主导航界面盘点

- [2026-10-15] - 执行前约定：仅清理 `.scratch` 中已完成阶段的测试夹具、验收报告、截图、旧 staging 脚本与下载工具；不删除业务路由。本轮先列出不在主导航中的界面，排除用户指定的 docs push confirm 流程，并用 `answer-me-with-html` 技能汇报。
- 保留真实内容迁移包、真实数据库备份与账号恢复材料、正在推进的审查材料、现用认证测试配置和包管理入口；核对运行中容器挂载后才删除旧演练目录。
- 保留当前未提交的 Owner 登录实现，以及另外出现的 README 和 docs/assets 改动；不提交、不部署，不改 `output` 发布包或历史任务结论。
- 完成后追加具体清理统计、路由结论、边界与验证结果。

## 完成结果

- 清理 117 个目标项，共 3,325 个文件，文件长度合计 781,512,256 字节（745.3 MiB）。`.scratch` 从约 1,121.9 MiB 降到 377.0 MiB，此后新增本轮报告与清单。统计为文件逻辑长度，不等于物理空闲量。
- 已清理旧生产演练、Caddy 恢复与 SSH/内存夹具、UI 和 schema 阶段报告、Playwright 截图、旧 staging 脚本、下载工具、合成备份及完成的用量复现。
- 保留真实内容迁移包、真实数据库备份、账号恢复材料、现用认证测试配置、包管理入口，以及当天仍在推进的模型审查材料。认证 runner 从已完成的 commit-split 目录迁到 `.scratch/owner-auth-2026-10-14/verify-db.cjs`，脚本语法核查通过。
- 删除前验证所有绝对目标位于 `.scratch` 内；Linux 证书的叶子链接仅删除链接本身。运行中容器没有挂载待清理数据。未操作容器、镜像、卷、数据库或服务器。
- 原有 15 个未提交文件清理前后 SHA256 一致，包括 Owner 登录实现、README 和 docs/assets 中的其他改动。新增本任务记录与本地材料手册追加说明。
- `output` 发布包、正式 scripts/deployment、历史 Markdown 结论均未删除。

## 路由盘点结论

扫描全部 21 个 `page.tsx` 模板。按用户要求排除 docs push confirm 对应的 `/[locale]/docs/import-preview/[draftId]` 及确认流程，剩余 20 个模板完整分类：7 个正式导航入口、3 个正常内容详情、1 个正常活动子页、4 个需审议界面、5 条旧兼容路由。

### 需优先审议的独立界面

| 路由（省略语言前缀） | 实际功能 | 权限和建议 |
| --- | --- | --- |
| `/studio/docs/library` | Docs 发布总览、筛选、打开和复制路由，未提供内容写入 | Owner；没有发现正式入口，可移除独立页面或合并管理入口 |
| `/studio/roadmap` | 项目、看板、栏目、条目管理 | Owner；与正式路线图和设置重叠，但应先承接独有的看板/栏目配置能力 |
| `/docs/style-lab` | 内容块样式演示 | Owner；建议移出线上路由，保留开发样例 |
| `/docs/archive` | 仅标题和说明，未接文章列表或筛选 | 公开空壳；建议移除或跳转 Docs |

Owner 门禁在 `apps/web/src/app/[locale]/studio/layout.tsx:9` 和 `apps/web/src/app/[locale]/docs/style-lab/page.tsx:14`。无凭据访问上述三个 Owner 页面中英文均为 404；空归档中英文均返回 200。

### 旧兼容路由

- `/workspace`：307 到不存在的 `/tools`，目标 404，已确认断链。
- `/tools/playback`：307 到设置默认页，未指定 `section=music`，建议后续修正目标。
- `/docs/reference`：307 到固定样例 `/docs/series/document-shells/shell-foundations`，当前本地访客访问该目标为 404；未推断 Owner 也无法访问。
- `/resources`、`/create`：源码直接 `notFound()`，没有真实界面。

### 其他界面与边界

- `/about/activity` 是关于页正常公开子页，不属于遗留后台。
- 首页、设置、笔记分别有 Logo、齿轮和文档下拉入口；文章、合集、笔记详情是正常内容路由。
- 设置的 `section=ai` 确为全 locked 的占位面板；admin 标记仅控制折叠，不会因 Owner 登录而变成可用功能，建议后续撤除该空壳。
- 设置中的账户、项目和曲库管理、路线图 Editor、Dashboard 导入弹窗均有实际功能，并非额外独立路由。
- `/settings/access/[credential]` 是邀请兑换处理入口，没有独立页面。API、媒体和错误/加载状态不计为后台界面。

## 验证与交付

- 对 14 个无凭据本地地址及 reference 跳转目标执行只读 GET 验证。Owner 专用页面正向能力基于源码核查，未代输真实账号、未执行后台写操作。
- 核对源路由、导航注册、服务端权限、后台组件、设置面板和兼容跳转；没有删除或修改业务页面。
- HTML 汇报由 `answer-me-with-html` 生成，保存在 `.scratch/cleanup-route-audit-2026-10-15/report.html`，8 个面板、STE 0 警告。页面包含地址、作用、入口、权限、处理建议、清理与保留清单。
- 本轮不重跑无关业务测试；清理后校验保护文件哈希、保留 runner 语法、路由状态及本轮文档 whitespace。
- 未提交、未推送、未部署。建议的业务界面移除均尚未执行，留待用户逐项决定。

## [2026-10-15] 用户批注后的执行范围

- 将 4 个待审界面各自单独列出完整本地 URL、作用、权限与推荐处理方式，原页面保留供用户审查。
- 使用已有有效 Owner 会话只读核查 5 条旧路由及 reference 的目标，确认 404 是否源于权限；不注入登录凭据、不新建 Owner 会话、不执行后台写操作。
- 用户已明确要求撤掉设置的 `section=ai` 占位面板：移除注册与无调用的占位 schema，侧边和正文一起移除。旧查询参数按现有未知分区规则回退默认设置页。
- 本轮不自动删除四个待审页面、不改其他设置分区、不部署或提交。

## [2026-10-15 13:43] - Update by AI 完成批注处理

- 移除 `settings-schema.ts` 中的 AI 分区导入与注册，删除无其他调用的 `ai/ai-schema.ts`，共移除 84 行。设置侧边栏与正文不再生成该占位面板；旧 `section=ai` 按既有未知分区行为回退主题页。
- 设置渲染测试 4/4 通过，Web 类型检查通过，本轮代码 `git diff --check` 通过。真实浏览器核查了旧链接，确认模型入口和控件消失，其他分区保留。
- 当前浏览器没有有效 Owner 登录，本轮没有创建或注入会话、没有读取密码。对本机 `incept` 库先执行 `SET TRANSACTION READ ONLY` 查询合集与文章存在性，再执行正式的已发布合集查询。`document-shells` 合集与 `shell-foundations` 文章均不存在，中文、英文查询均返回 null。
- 根据正式 loader 在权限比较之前查询内容，以及 Owner 映射到最高内容角色 private 的实现，可确认 Owner 也无法显示该 reference 目标；不是 Guest 权限隐藏。此结论来自服务端只读数据检查，并非真实 Owner 浏览器 HTTP 测试。
- 其他四条旧路由：workspace 无条件跳到缺失的 tools；playback 无条件跳设置默认页；resources/create 无条件 notFound。没有基于身份切换页面的分支，因此提升权限不改变这些行为。
- 单独生成 7 面板 HTML 审查页，四个界面各占一节，展示完整 `http://localhost:3000/zh/...` 与英文 URL、能力及建议。四个页面和旧兼容路由仍保留，docs push confirm 未动。
- 建议分别为：发布总览合并到 Docs 的 Owner 视图后撤掉独立页；路线图后台先迁移独有看板/栏目配置再撤；样式实验室移出线上路由但保留样例源码；空归档改跳 Docs 列表。
- HTML 保存在 `.scratch/cleanup-route-audit-2026-10-15/four-page-review.html`；设置移除截图和只读结果 JSON 同目录保留。原始汇报保留，避免覆盖用户批注上下文。
- 遗留问题：四个页面的去留由用户逐项审查；本轮未提交、推送或部署。
- Commit 建议：`chore(settings): remove unused model settings placeholder`
