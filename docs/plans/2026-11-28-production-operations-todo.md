# Incept 生产运维与可靠性 TODO（2026-11-28）

## 下一步处理计划

### 1. 开通生产告警并做真实送达验证（P1-3 收尾）

> 代码侧已改造并通过 `pnpm test:ops`（167 passed, 1 skipped）与 `pnpm typecheck:scripts`，待确认接收通道后在生产主机上线：

- [ ] 选定生产告警的 **HTTPS 接收端**（任选其一：飞书自定义机器人 Webhook、Bark 推送地址、Discord/Slack Webhook、私有 `ntfy.sh/<随机topic>`，或自建 HTTPS Webhook），确认 `INCEPT_ALERT_WEBHOOK_URL` 与 `INCEPT_ALERT_WEBHOOK_FORMAT`（`json` / `ntfy` / `feishu` / `bark` / `discord` / `slack`）
- [ ] 将仓库中的监控与告警脚本部署至生产 `/srv/incept/current/scripts/` 与 `/etc/systemd/system/`：
  - `scripts/production-monitor.mjs`
  - `scripts/production-monitor-proxy-log.mjs`
  - `scripts/production-alert.mjs`
  - `deployment/incept-monitor.service`（含 `ExecStartPre=+` 以 root 只读提取近 15 分钟 `incept-proxy-1` 同步 504 摘要）
  - `deployment/incept-monitor.timer`
- [ ] 创建 `/srv/incept/monitor`（`0700 incept:incept`）与 `/srv/incept/.env.monitor`（`0640 root:incept`），覆盖 5 类告警探针：
  - `health`（HTTPS `/api/health/ready`）
  - `disk`（剩余空间 `< 15%`）
  - `backup`（本机最新清单与离机已验证回执超龄，默认 26h）
  - `sync_504`（近 15 分钟 `/api/dashboard/sync` 出现 `504` 或采集器陈旧）
  - `snapshot_lag`（V4 `data_revision` 领先 `snapshots.json` 超过 300s）
- [ ] 修正 `/srv/incept/shared` 的 ACL mask（此前 `getfacl` 显示 `user:incept:r-x #effective:---`），确保 `incept` 系统用户可只读访问 `v4.db` 与 `snapshots.json` 而不开放目录写权限或敏感文件
- [ ] 执行 `systemctl daemon-reload && systemctl enable --now incept-monitor.timer`，观察首轮 `production_probe_ok` 日志
- [ ] 人为触发一次受控故障告警与恢复通知，确认接收端真实收到 **failure** 与 **recovered** 两条通知且 `state.json` 幂等状态恢复正常

### 2. 提交并发布 P0-2 / P1-1 / P1-2 / P1-3 代码改动

- [ ] 审阅当前工作区改动（P0-1 离机脚本、P0-2 消除同版重复快照与同步 504 处理、P1-1 拆分刷新与采集体验、P1-2 独立只读快照 worker 与续传恢复、P1-3 监控与告警扩展）并分主题提交
- [ ] 本机构建新的 `linux/amd64` 生产镜像并推送/导入生产主机，连同更新后的 `deployment/Caddyfile` 一起在维护窗口发布上线
- [ ] 同步发布新版 `sync-agent` 与 `sync-tray`（含 504「上传超时，等待重试」、`nextOffset`/回执续传及任务超期释放）
- [ ] 观察 2026-11-29 03:02 下一轮 `incept-backup.timer` → `incept-offsite.service` 定时离机备份是否自动通过

### 3. 重构后的 P2（新 P0 / 新 P1 / 新 P2）

> 2026-11-28 经 7 天全源离线重放发现 2 条 Codex 会话（77.0M Tokens）被提交前静默隔离，且全历史共 116 条 Codex 会话处于隔离态；详细执行方案见 [2026-11-28-p2-sync-integrity-and-codex-recovery-plan.md](./2026-11-28-p2-sync-integrity-and-codex-recovery-plan.md)。

- [ ] **新 P0**：定向扩查 Codex 116 条历史隔离会话 + 11/28 当天增量；协议层修复「同路径指纹漂移」不对称 Bug；隔离副本预演并执行父子拆分会话同批原子拆净（`6a9be12c6ea0` 等）与指纹漂移自动续传（`8478030ffc24` 等）；顺手闭环 `#44` Antigravity `PARENT_MISMATCH`
- [ ] **新 P1**：打通全链路采集完整性显式上报（Agent 统计真实未入账 Token/模型/最早时间/原因 → 持久化上报服务端 + 托盘 `status.json` → Owner Dashboard 拆分设备在线/采集完成/提交前隔离三态 + 监控告警）
- [ ] **新 P2**：核对 11/28 ~100K `k3.1-pro` 落盘目录并补齐 Claude Code `thinking_tokens` 拆解与 `cost-state` 差额诊断；重测模型映射与缺价；接入 Kimi Code Desktop / CLI

### 4. P3 · 运维整理与长期容量

- [ ] 整理生产目录、制品与卷生命周期（清理过旧 `.env.production.bak-*`、核对未挂载 PG 卷、规划 Caddy 持久化目录迁出 `/srv/incept/import-20261014`）
- [ ] 覆盖至少一轮夜间备份与正常同步做连续资源采样（CPU、I/O wait、内存、快照耗时与上传队列），再评估是否扩容

---

## 本轮已完成记录（2026-11-28）

- [x] **P0-1**：定位 2 小时离机备份超时根因（rclone 公共 Google `client_id` 403 限流），迁移至独立 Google Cloud Desktop OAuth `client_id` + `Incept-Backups-v2`，今晨 03:05 完整备份离机上传与校验通过（4m 29s，零 403，快照 `d5ef3171...`）
- [x] **P0-2**：修复同版重复快照构建、补齐 `begin`/`stage`/`commit` 计时日志、Caddy 同步路径 504 JSON 响应、Agent/Tray 504 状态识别与「上传超时，等待重试」提示（本地生产双运行时端到端验证通过）
- [x] **P1-1**：拆分「刷新图表」与「立即采集并上传」、持久化 Job ID、180s 后展示「仍在同步」、503 `SNAPSHOT_UPDATING` 保旧图自动重试、分别显示任务版本与图表版本
- [x] **P1-2**：独立只读 projection worker 单次读取生成四窗口、Agent 优先续传到期批次与 `nextOffset`/回执恢复、对齐 15m/30m 任务期限并支持放弃时立即释放
- [x] **P1-3（演练与复核部分）**：完成离机快照 `d5ef3171...` 全链路隔离恢复演练（实际 RTO 约 89.6 s，验证 PG、V4、水线、Managed Billing、Owner TOTP 解密及当前/上一镜像兼容），形成回退清单，复核旧 staging 配置可读范围确认无泄露并已清理不再使用的 `/srv/incept/.staging-app.env`（详见 [演练与回退清单](../research/2026-11-28-p1-3-restore-drill-and-rollback-manifest.md)）
