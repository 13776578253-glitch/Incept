# v4 自动上传与公共展示刷新：本地恢复交付

日期：2026-10-20（Asia/Singapore）。本轮范围为本地修复、独立候选 state 和旧 review 归档处置。生产 App、生产数据、设备授权及正式 Agent state 保持原样；正式 Agent 仍停止。

## 历史定位与候选 state

204 个唯一缺失 locator 已去重分类：193 个封存历史、1 个前缀精确匹配的可恢复定位、10 个继续隔离。对应 194 个旧 scope：187 个在可信 head/receipt 覆盖和当前无会话 metadata 的条件下持久封存，另外 7 个 Codex scope 全部保留续接隔离。可恢复定位只记录证据，本轮没有自动续接或历史重新导入。

封存/隔离决定绑定设备、scope、manifest、generation、parent、proof、签名和 committed receipt。旧会话重现时继续隔离；已绑定的历史缺定位不再阻断独立健康新会话。封存历史及隔离仍显示 partial_success，重复扫描不重复报警。

独立候选位于 `%LOCALAPPDATA%\Incept\v4-acceptance-20261019\auto-sync-candidate-2026-10-20\agent-state`：

- 362 个已确认 head / 362 receipts，outbox 为空。
- 362 项 Token 水位，总量 4,558,021,501；仅从身份一致的固定 scope 元数据补齐，已有水位冲突即拒绝。历史 usage records 读取数为 0。
- 两份开头缺失会话的 active isolation ledger 已迁入；25,459,535 个缺失前缀 Token 继续不归属日期或批次。
- 保留精确 Auto-review 会话政策，用量计入、缺价保持标记。
- 使用真实 HOME、原设备、正式 HTTPS、七来源、strict 校验；remote=false，DPAPI 凭据仅原字节复制，没有解密。
- 正式 state、旧 v4 state 和冻结候选全部文件的前后 SHA-256 一致；仅通过命名管道只读确认 Agent 停止。

Claude Code 67 条及 ZCode 5 条 review 已完成 Owner 批准的归档处置：原始 review JSON、整个原迁移 archive（含正式 state 审计副本）、精确覆盖证据和批准决定保存在新候选的 archive 目录。旧 batch 不制造 committed 收据，候选活跃上传队列排除这 72 条记录。原审计不改写。

详见 `output/auto-sync-candidate-2026-10-20.json`，私有路径与凭据不进入 Git。

## Dashboard 刷新

trusted 模式以数据库文件身份、revision 和新加坡统计日期识别新版本。成功 receipt 在提交事务和 ACK 之外触发刷新；公共读取在发现版本变化时补偿。复用单个有界 sync worker，合并并发请求，同一任务生成 7d/14d/30d/all，整组原子发布。

版本在投影或发布期间变化会丢弃候选并有界重试；投影失败保留 last-good。磁盘文件替换后内存重新读取，避免旧内存覆盖新缓存。同路径数据库替换也使 worker 和缓存失效。trusted 投影不调用原始日志采集器。公共接口继续遵守现有隐私契约。

已打开页面在可见时每 60 秒读取；从隐藏恢复时立即读取。旧响应、低 revision 或旧 checkedAt 不覆盖新数据。Agent 后续获批启用后仍按 5 分钟周期自主采集，网页读取只负责展示。

## 本地验证与制品

- Agent 历史封存/隔离及相关定向回归 35/35；候选准备脚本 3/3。
- 后端快照与公共读取 5 文件 30/30；前端窗口与轮询相关 3 文件 21/21。
- Dashboard 两套 TypeScript 配置通过；Web 继承原 ES2017 配置、显式映射本 worktree 的临时类型检查通过。必要依赖 junction 仅属于 ignored 本地依赖。
- 最终 Agent ZIP：`output/release-candidate-2026-10-20/agent-history-window-final/incept-sync-agent-win-node24.zip`，SHA-256 `25686fb71a43b55639f43fa99a7ad8a3a700f34eb42f05f3bbf0d6626f893a79`。ZIP 内 11 个成员逐项校验，218 个构建输入与当前源码身份一致。
- 候选 state SHA-256：`a817f86ab724465195a41a7af54f4f17bc09a5dd4a197ab6527b5cd6bd8ebc74`。候选清单 SHA-256：`bae2fb80e1a61b1617fe7da2972eaf4910cf27f5d2fdd05c56c9026d083605db`。
- App 补丁业务源码独立冻结在 `output/release-app-context-auto-refresh-20261020-final`；镜像身份与构建结果以最终 App 报告为准。

## 最终本地构建完成

App `incept-v4-auto-refresh:20261020` 已完成标准 Dockerfile 的类型检查、lint、测试与 Next.js 生产构建。1214 项测试通过、0 失败；55 项专用环境集成测试与 2 项 Linux 中的 Windows 专用测试跳过，沿用既有验收。lint 9 条警告，Next 动态文件 tracing 14 条警告。

镜像归档 SHA-256：`46b35f278e54a0de4244791177dcaf05421957724ebd0ced17d6dcb9d6fb07df`。OCI Index：`d8fb39a0cdfbcc542ed0e98b946df994a17ca11477fa9f53b218e0f7b0ec03b8`；Linux Manifest：`5c497896951f9bf206cfeb978575893819cf8fdc322c9653e87811763abc3d1d`；Config：`856958472ebf9316a34102728eb35498b42fca2d90919373474b3ab09ef9d7a6`。三种身份已分别验证。

`output/auto-sync-patch-2026-10-20/PATCH-MANIFEST.json` 冻结 34 项制品，清单 SHA-256：`2dfa41aabe688b503dba0916c85112866030ffe393675376ddd037a9988e9d21`。正常 Windows 进程对候选的 23 个文件 SHA 校验全部匹配。历史快照仍使用原 SHA，不重建。

构建证据见 `output/release-app-build-auto-refresh-20261020.json`、`output/release-app-validation-auto-refresh-20261020.json`。生产及正式 Agent 继续保持原状，两项授权申请如下。

## 两项独立授权

1. **App 补丁发布**：备份当前 App/配置和实时数据库，校验补丁镜像身份后仅替换 App；沿用当前实时 v4 数据库及可写展示缓存挂载，保留 PostgreSQL、Caddy、Gateway 与设备授权。检查健康、实际镜像、服务/数据库身份、API 与公共展示刷新。失败恢复旧 App 镜像与配置，保留当前数据库及诊断证据。此项不启动 Agent。
2. **正式 Agent 安装与启用**：在 App 补丁验收后，备份旧正式 state、配置、凭据和安装目录；校验新 ZIP 与候选清单，原子安装新候选，复用原设备和 DPAPI；启动一个普通用户 supervisor 并注册当前用户登录自启动。最小在线观察为一个自然真实新增 receipt/Token 增量、一个无新增周期及已打开页面刷新。无真实新增时等待自然数据，不产生付费调用。异常时停止 Agent 并保留最新 state/outbox/receipt；有新 receipt 后不直接恢复旧 39 条 state。

本轮没有执行上述两项。362/362 历史全量对账、既有完整 E2E 和真实来源验收均直接沿用，冻结历史快照不随源日志增长重建。
