# 第二版生产验收与 Gemini 本地改动审查

日期：2026-10-16，Asia/Singapore。生产采样：00:42–00:44；本地复现与审查随后完成。用户要求验收已上线第二版，并一起查看 Gemini 的小问题修复和脚本改动。

## 结论

生产已切换到 `7bee9ad`，基础只读验收通过。密钥、Owner/TOTP 和 GitHub 活动三项此前前置已处理。当前本地未提交导出改动复现两个数据问题，须在下一版交付前修复。

建议先补一次 TOTP 绑定后的生产一致备份：最新备份早于绑定和恢复码生成。另有已登记的导入二次认证体验与 reference 旧跳转问题。

## 生产版本、数据与资源

| 检查 | 实测 |
| --- | --- |
| current | `/srv/incept/releases/7bee9ad` |
| 应用镜像 | `sha256:7719cddd5f9c364d3935f6069f7a5b2ab575b6f60310675991af5fe9c1fe20dc`，与上一轮交付一致 |
| 容器 | app/PG/Caddy 均 running、healthy；restart=0、OOM=false |
| 应用启动时间 | 2026-10-16 00:41:00；本次观察是刚启动后的状态 |
| 数据库 | 21 个迁移完成，失败迁移 0 |
| Owner | 账号 1、已绑定 TOTP 1、有效 Owner 会话 1、未消费恢复码 8 |
| 认证密钥 | 格式有效；运行容器与私有生产 env 一致 |
| 内容 | 文档 14，其中 private 7、Pro 0；音乐总记录 12 |
| About | unlisted about 已为 guest |
| 真实持久卷 | `incept_content_20261014_data`、原 shared/Caddy 路径保留；内容覆盖文件存在 |
| 外部端口 | 仅 Caddy 发布 80/443；应用 3000、PG 5432 无宿主映射 |
| systemd | 主服务和本地备份 timer active；failed units=0 |
| 核查时资源 | app 91.5MiB/768MiB，PG 21.55MiB/384MiB，Caddy 24.63MiB/96MiB |
| 主机 | 磁盘约余 27GB，RAM available 1260MiB，Swap 使用 0 |
| 近 30 分钟应用日志 | 统计到 error/exception/failed/fatal 行 0；未输出原始日志 |

## 公网功能与访问边界

- HTTPS 信任链正常，TLSv1.3；证书 issuer YE2，2027-01-12 07:51:08（UTC+8）到期；HTTP 308 到 HTTPS。
- 中英文首页、Docs、Dashboard、About、About/activity，以及账户设置均 200。live/ready 均 200。
- GitHub account/repository 统计均 available，采样计数分别为 494/162。写作统计为 20 次日聚合文章计数、34,995 writingUnits；不是数据库文档总数。
- 匿名 Owner state 不含 management；Dashboard 强制刷新 403、导入历史 404、项目管理 API 404。
- 匿名公开用量 projects/sessions 均为空，未发现 workspacePath/deviceLabel/importBatchId。采样 30d Token 3,248,040,709、模型 20、来源 7。
- 真实 Guest 文章匿名 200、private 文章匿名 404。当前没有已发布 Pro 文章可用于这一次线上样例检查。
- 公共音乐目录返回 11 个可播放条目；库内总记录 12。实际音频 Range=206、1024 bytes。
- 已删除的双语 studio/docs/library、studio/roadmap、style-lab 返回 404；archive/playback 兼容跳转正确。
- `/{locale}/docs/reference` 仍 307 到缺失的 shell-foundations 样例，目标 404。
- 浏览器访客设置只有 Appearance/Language/Account/Music，Docs/Projects 管理入口隐藏；Dashboard 项目区显示 3 处无权限占位。页面加载完成，观察到控制台 error/warn=0。

## 备份验收与时间差

最新 manifest：2026-10-15 22:51:34。database.dump、data.tar.gz、caddy.tar.gz、auth-key.json 四个 SHA256 全部匹配；备份密钥与生产私有 env 一致。

Owner 创建于 22:49:59，但 TOTP 绑定/恢复码集合创建和成功登录为 23:03:36。最新备份因此已包含初始化账号和认证密钥，尚未包含随后绑定的 TOTP 及这组恢复码。建议使用正式一致备份流程补一次；该流程会短暂停写。当前 timer 下一次为 2026-10-16 03:03:42。

offsite/monitor 私有配置仍缺失，真实离机存储、独立恢复材料、外部监控/告警以及设备自动上报继续待接入。

## Gemini 本地修改审查

开始审查时 Git 有 11 个已跟踪文件修改、1 个既有未跟踪发布审查记录。应用相关改动包括 Edge 双眼睛处理、Docs 中文标签、模型矩阵布局、七来源导出、跨批次费率补齐及 README 精简。这些未提交改动属于下一版，当前线上仍是 `7bee9ad`。

### [P1] 新增原生来源的记录费用在导出时丢失

位置：`packages/dashboard/src/adapters/local/imports/exporter.ts:41`。

导出器要求 `raw.costSource === 'recorded'` 才写出 recordedCost，但新接入的 Claude 等原生采集通过 usageEvent 返回实际费用时未设置该标志。合成 Claude 原始日志含 costUSD=0.20、无模型价格，导出结果 recordedCost 缺失；导入后 cost=0、missingPricing=true。

应统一实际费用来源标记，保留非 Codex 原始记录费用，并补原生来源的导出→导入费用回归。不能把成本 0 当成该记录实际没有费用。

### [P1] 索引切为原始日志后事件身份变化，再导入重复计数

位置：`packages/dashboard/src/adapters/local/imports/exporter.ts:28`、`:35`。

新增 collectAiusageAndRawAgentEvents 会在原始文件缺失时导出索引兜底。索引已有 eventId，原始事件走 nativeEventId 的另一种哈希。原始日志后来恢复时，同一记录生成另一 ID；已导入批次只按 ID 匹配，没有识别其为同一事件。

本地实际复现：同一 Claude 记录第一次从索引导出 1 条，补回原始日志后再次导出 1 条；第二次预览 added=1、duplicateImported=0。两次导入后最终 2 条、260 Token，真实应为 1 条、130 Token。

应统一索引/原始表示的跨导出身份，并考虑已经导入的索引记录匹配。仅更换新哈希而不处理旧批次仍会重计。

### 配套发布事项：线上尚不支持七来源包

本轮直接调用生产镜像的验证器，合成只读协议检查确认：Codex、CommandCode 接受；Antigravity、Claude Code、OpenCode、ZCode、Gemini CLI 均拒绝，错误为原有 two-source 限制。新导出器和服务端校验器需要同版升级；当前不应把七来源新包交给现有线上导入器。

CLI 的导出摘要仍只列两种来源，扩展后应同步统计与使用说明。

### 其他改动

- Edge 原生眼睛隐藏、Docs 中文标签、240px 模型列与内部截断样式未发现阻断；其中任务记录写 220px，源码实际为 240px，应同步文档。
- 跨批次费率补齐新增测试通过。
- Dashboard 导入 428 二次认证弹窗仍未实现；use-import-dialog 对非 2xx 仅抛出服务端 error 字符串。此项是 Gemini 已登记而尚未修改的遗留。
- 主清单末尾多一个空行，git diff --check 提示 EOF 空行，属于文档格式项。

## 本轮检查证据

| 检查 | 结果 |
| --- | --- |
| 本地 Dashboard | 22 个测试文件、138 项通过 |
| 本地 Web | 107 项通过，28 项数据库集成按当前无隔离库变量跳过 |
| 全仓类型检查 | 通过 |
| 设置两处改动定向 ESLint | 通过 |
| 导出费用与身份探针 | 两个问题均实际复现 |
| 公网与真实数据 | 只读 HTTP、匿名 UI、数据库状态、备份哈希检查 |

本轮未创建 Owner/Pro 测试会话，未提交真实导入、改密、签发授权、停机备份或恢复。Owner/Pro 敏感写入不在本次只读生产验收中重跑。没有修改 Gemini 应用源码或创建 Git 提交。

证据目录：`.scratch/production-acceptance-2026-10-16/`，包括 server-audit.log、public-check.json、server-detail.log、document-gates.log、import-probes.log、测试与类型日志及浏览器截图。临时探针只使用独立合成目录。

下一步优先级：补绑定后备份；修两个导出数据问题；按同一版本交付七来源协议；处理 428 弹窗和 reference 旧跳转；其余外部运维接入继续排期。
