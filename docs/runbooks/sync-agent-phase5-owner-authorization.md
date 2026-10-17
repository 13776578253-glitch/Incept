# Owner 生产变更授权单 — Sync Agent Phase 5

状态：**已获 Owner 批准执行单设备灰度；先完成修复后的 Release 基线核对，再触碰生产**。本地/隔离验收与发布封存进行中；完整命令见 [rollout runbook](sync-agent-production-rollout.md)，证据见 [Phase 5 proof](../research/sync-agent-phase5-rollout-proof.md)。

| 对象 | 申请执行的变更 | 影响与保护 |
|---|---|---|
| 发布源码/镜像 | 从主干1a44da2重建不可变Phase5 Release，构建并发布到Owner确认的现有Incept主机 | **Operations路由/mock不进入本次Release**；保留Docs/导航；不覆盖其他分支；核对目标/image digest后执行 |
| 既有Nginx443 | 增加 `/api/sync/ws`，内部路径404；Gateway仅容器网络 | 短时reload；原站点路由保留，无新公网端口 |
| PostgreSQL | 一致性dump后以迁移角色执行AgentDevice/SyncJob正式迁移，核查权限/索引 | 维护窗口暂停写入；应用角色不获DDL；先验证restore副本 |
| v1/v2 SQLite | v1 backup API一致备份；新独立v2数据库；先迁移v1到v2，shadow全对象零差异后切v2 | 保留原imports.db；切换前Agent保持停止；全对象7d/30d/all零差异才允许v2读取 |
| 配置与秘密 | 私有文件生成RPC key，Web/Gateway只读注入；单设备allowlist；开关分段启用 | 秘密不进Git/日志/URL；不覆盖其他env；单一v2 writer |
| Windows设备 | Owner选择一台设备及来源；v2切换后才Bind/Start/status/远程刷新 | DPAPI保护Token；首轮与v1重叠时review_required、旧统计保留；历史认领需Owner精确授权，不自动认领；登录自启默认不安装 |

**执行顺序**：备份与恢复验证 → PG迁移 → v1迁移到v2 → shadow 7d/30d/all零差异 → 切v2读取 → 启动单台Windows Agent → 首轮上传/历史重叠审阅。任何歧义认领留在审阅；授权历史范围须有Owner给定的legacy UUID/source/manifest计划。单次批准覆盖这些有门槛步骤，但v2切换仍以零差异报告为技术闸门，首轮重叠不因批准自动认领。

**窗口与资源**：建议预留30–60分钟维护窗口，其中写入冻结和App/Gateway重建预计5–15分钟，实际备份体积决定时间。App768MiB/PG384MiB/Gateway128MiB/Nginx96MiB上限合计1376MiB；2GiB主机还需核查OS/其他服务。准备镜像约353MiB加备份、v1/v2副本与至少2GiB工作余量，推荐5GiB警戒线；真实数据大小在批准后的只读核对阶段量取。

**首批限制**：仅一台设备、每5分钟；新batch≤20k记录，队列4/per-device2；85%内存压力、低磁盘或store上限对新上传429/503退避。普通规模App峰值236.71MiB、页面P95 44.53ms，70k旧容量风险继续受限，初期不扩大多设备/大包范围。

**监控和退出**：观察health、Job/receipt/revision、outbox、review、cgroup事件、DB/WAL/free disk。OOM、频繁memory.max、长期锁或无法消费，立即关闭sync/remote并读v1，停止Gateway/Agent；保留PG新表、v2、回执和outbox。回滚命令已在runbook第9节列出；不用旧.db覆盖活动WAL。

**批准内容**：按以上顺序执行单设备灰度；**先迁移/对账/切v2，再启动Windows Agent**。首轮上传如与旧v1历史重合，系统必须进入review并保留旧统计；历史认领只按Owner给定的device UUID/source/manifest/legacy批次精确执行，不自动认领全部历史。Operations不进入本次Release；Windows登录自启保持未安装。若需要自启，请另行明确包含 `Install.ps1 -ConfirmInstall`。生产主机/域名、首台设备及历史范围以Owner确认值为准；核对不符则停止。
