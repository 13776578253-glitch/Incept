# Sync 事件收尾、水位门禁与托盘 / Dashboard 展示修复

更新：2026-10-23（Asia/Singapore）。状态：**PREFIX_LOST 事件已闭环并有提交；水位工具、托盘与 Dashboard 改动已完成但未提交；线上仍是旧镜像。**

## 1. PREFIX_LOST 事件收尾（已提交 `fa0af85`）

- 审阅 #21（zcode 9→12）、#22（antigravity 659→679）由 Owner 用 `resolve-review --accept` 接纳为后继代次，revision 684→685；随后四条回执把本地推进到 688。
- 提交内容：`acceptReview` + 4 个守卫（rolled-back linege / manifest / parent / sequence hash）、agent 审阅与 held 续传、账本水位门禁与 CLI、模型注册表与定价回退。
- 当时的验证：dashboard 559 passed / 2 skipped，`test:ops` 153，typecheck 全套通过。

## 2. 权威账本水位（本地未提交）

- `scripts/ledger-watermark.mjs` 支持 `check` / `generate` / `advance`。
- `generate` 现在拒绝降级（`WATERMARK_DOWNGRADE_REJECTED`）、拒绝覆盖损坏文件、拒绝库里不存在的锚点批次；`--force` 才能重新定基线。
- `check` 在门禁之外额外打印 Revision / Scopes / Tokens / Visible records / Anchor 与各自的 floor。
- 新增 `deployment/ledger-watermark.md`；示例文件加“模板，勿拷贝”注释。
- 实测结论：WAL 账本在各种 `-wal` / `-shm` 组合下只读打开均通过；嵌套 `anchorReceipt` 写法会被门禁**静默忽略**，文档已统一为扁平 `anchorBatchId` / `anchorPayloadHash`。

## 3. deepseekHarness 为什么没有数据

- 本机 `%LOCALAPPDATA%\Incept\sync-agent\config.json` 的 `allowedSources` 只有 7 个来源；`captureHome` 在清单阶段就跳过 `.dsh/sessions`，且不报错。
- 历史上有 9 个 harness 会话入账（rev 457–465，全部 committed）。
- 当前缺口：磁盘 53 个会话中 44 个未入账（约 3,092 条 usage / 5.3 亿 tokens）；会话 `session-7a6aa922…` 完全不在账本里。
- 线上镜像早于 `815f4d1`（2026-10-20），前后端都没有该来源，因此**无法靠配置或接口临时开启，必须发版**。

## 4. 托盘（`apps/sync-tray`，未提交）

- 「已授权来源」只读展示 + 「编辑来源」跳 Dashboard：设备令牌无权扩大自己的采集范围，服务端以 `agent_devices.allowed_sources` 为准。
- 语言：中文 / English，写入 `tray-settings.json`；同时修掉 `ThemeManager` 整文件覆写导致主题与语言互相清空的问题（统一走 `TrayPreferences`）。
- 「重启 Agent」：`stop` → 等 daemon 写出 `running:false` → 重试启动直到 supervisor 存活；识别“Agent 以管理员权限运行”并给出可执行提示（`AGENT_UNREACHABLE`）。
- 反射测试 49 项全过（含新增 6 项语言用例）。

## 5. Dashboard（未提交）

- 只有一台同步设备时不再显示设备名，改成静态 `同步设备 · 设备在线`（多设备仍用下拉框）。
- docs 条目表：`Route type` + `Kind` 合并为 `Type`，去掉彩色徽章；`Access role` 同步改为纯文本。
- 设备注册表单：去掉 v1 UUID 的占位文字（会被截断），补名称占位符与一行字段说明。
- 设备卡片删掉 “New sessions enroll automatically; historical conflicts need review.” 这句空话。
- 远程 phase `offline` 改称「远程未响应 / Remote unreachable」，消除 `Online · Offline` 自相矛盾的展示。
- 设备下拉框改为自绘箭头（原生箭头会贴到内边距边缘，看起来错位）。
- 概览「MODELS & SOURCES」标题从「按模型、客户端来源与 Token 类型拆解」改为「用量构成」，副标题改为「按模型、客户端来源与 Token 类型统计」。
- 模型吞吐量排行的「展开全部」补齐 `preservePagePosition`，收起时不再把页面滚到标题（与另外三个表一致）。
- 同步时间线精简为「采集 / 提交 / 刷新」三项：去掉与右上「数据更新」重复的 Dashboard 读取时间，待审阅为 0 时不显示。

## 6. 未决事项

1. **发版前置**：新镜像带启用水位门禁，必须先 `generate` 出 `${INCEPT_DATA_DIR}/sync/ledger-watermark.json`，否则 app 起不来、全站 502。
2. 需要确认：`INCEPT_APP_IMAGE`、`INCEPT_DATA_DIR` 的真实值，以及镜像传输方式（`docker save|load` 还是私有仓库）。
3. 发版后：Dashboard 勾选 `deepseekHarness` → 托盘重启 Agent → 观察首轮 `issues` 是否有 `deepseekHarness:COLLECTOR_INCOMPLETE`，以及 `session-9e520384`（v3+v4 双份）的 `INTERVAL_ISOLATED` 告警。
4. 服务器残留可清理：`/srv/incept/incoming/*.mjs`、`/data/sync/v4-dryrun-*.db`（保留 `v4-preaccept` 作审计）。

## 7. 关键命令备忘

```bash
# 服务器：用旧镜像当 node 运行时生成水位
./deployment/compose.sh run --rm --no-deps -v /srv/incept/incoming/wm:/ops:ro \
  --entrypoint node app /ops/ledger-watermark.mjs generate /data/sync/v4.db

# 本地：托盘构建与回归
powershell -File apps/sync-tray/tools/build.ps1
powershell -File apps/sync-tray/tools/test.ps1
```
