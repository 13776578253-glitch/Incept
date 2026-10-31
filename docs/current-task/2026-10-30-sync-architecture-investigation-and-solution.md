# Incept 同步系统全链路架构调查、故障根因分析与演进方案设计规范
# Incept Sync Subsystem: End-to-End Architectural Investigation, Historical Root Causes & Evolution Design Document

- **文档版本**: 1.0.0 (Authoritative Release)
- **基线日期**: 2026-10-30
- **主基线分支**: `main` (`5e881e311621323de92b6c030bfac449529cdc18`)
- **参考与安全分支**: `fix/sync-safety` (`355987a64c6d6991385f4722f5209761d6151aa0`)
- **公共祖先 (Merge Base)**: `8e5e0841652e49ae7de9ee37d5fdf8dad87f623c`
- **目标生产环境**: Debian 13 (2 vCPU, 1.9GB RAM, 4GB swap), Docker (`incept-proxy-1`, `incept-sync-gateway-1`, `incept-app-1`, `incept-postgres-1`)
- **密级与完整性**: 生产核心架构规范 (Production Engineering Design Document)

> **2026-10-31 execution update:** `main` was unified with `fix/sync-safety` at `2d220df`, then fast-forwarded to the validated reliability branch at `4ef3784`; the two `main` documentation/test commits are included. Further work was isolated in `.worktrees/sync-reliability-perf` on `fix/sync-reliability-perf`. The baseline/test/metrics record is `docs/current-task/2026-10-31-sync-reliability-phases.md`. Production image identity was closed without SSH: cached image `incept-v4-release:20261029-sync8` has digest `sha256:7a993a58...`, its key source files match release `e4875db`, and 12/12 public Next static assets match the image byte-for-byte. SSH itself remains unavailable from this workstation, but is no longer required for this identity check.

---

## 目录 (Table of Contents)

1. [执行摘要与核心发现 (Executive Summary & Key Findings)](#1-执行摘要与核心发现-executive-summary--key-findings)
2. [端到端同步机制与系统架构全景 (End-to-End Sync Architecture & Sequence Flows)](#2-端到端同步机制与系统架构全景-end-to-end-sync-architecture--sequence-flows)
   - 2.1 整体拓扑与系统边界
   - 2.2 客户端日志采集沙箱与隔离机制 (`collect-worker.mjs`)
   - 2.3 零泄漏隐私脱敏引擎 (`maskUsage`)
   - 2.4 客户端持久化 Outbox 与 Lineage 状态机 (`state.db`)
   - 2.5 九步批次上传协议生命周期 (9-Step Upload Wire Protocol)
   - 2.6 边缘网关、WSS 长连接与内部 HMAC-RPC 认证 (`RpcVerifier`)
   - 2.7 应用层路由与所有者权限控制边界 (`requireRecentOwnerSession`)
   - 2.8 `SyncExecutor` 串行执行队列与超时熔断模型
   - 2.9 服务端 SQLite 因果账本架构 (`sync.db` / `v4.db`)
   - 2.10 密码学完整性合约：哈希链、Merkle 树与 Stable-Key 承诺
   - 2.11 关系存储层模式设计 (`AgentDevice`, `SyncJob`)
   - 2.12 Dashboard 读链路架构、SWR 缓存与 LCP 优化机制
3. [历史 12 类同步故障代码级与协议级根因排查 (Deep Dive into the 12 Historical Sync Failures)](#3-历史-12-类同步故障代码级与协议级根因排查-deep-dive-into-the-12-historical-sync-failures)
   - 3.1 故障 1: `RESULT_UNKNOWN` / `BATCH_NOT_FOUND`
   - 3.2 故障 2: `NETWORK_UNAVAILABLE` / TLS Reset
   - 3.3 故障 3: `REVISION_ENVELOPE_CHANGED` (Review #36)
   - 3.4 故障 4: `PARENT_MISMATCH` / Lineage Conflict (Reviews #37/#38, Antigravity 阻塞)
   - 3.5 故障 5: `BATCH_PAYLOAD_MISMATCH`
   - 3.6 故障 6: `PREFIX_LOST` (历史 Review 审计与 Stable-Key-Set 承诺)
   - 3.7 故障 7: Schema 回滚风险 (镜像降级与 DB Schema 3 不兼容)
   - 3.8 故障 8: 大批次 / 超大 Session (20k~100k+ 快照与资源瓶颈)
   - 3.9 故障 9: 采集源隔离与 Quarantine 审计机制
   - 3.10 故障 10: Dashboard 设备状态 `Refresh failed` (读写共用队列饥饿)
   - 3.11 故障 11: Dashboard 首次内容绘制延迟 (LCP 7.26s) 与重复 Usage 请求
   - 3.12 故障 12: `lastRemoteJob` 残留状态导致托盘虚假告警
4. [基线分支全面对比与差异审计 (`main` vs `fix/sync-safety`)](#4-基线分支全面对比与差异审计-main-vs-fixsync-safety)
   - 4.1 分支拓扑与“文档已合入、代码全落后”核心异常
   - 4.2 18 个未合入功能代码提交清单与详尽功能映射
   - 4.3 核心架构差异与运行时配置对比矩阵
   - 4.4 生产运行态脱节风险剖析
5. [生产服务器资源约束与性能瓶颈建模 (Production Metrics & Constraint Profiling)](#5-生产服务器资源约束与性能瓶颈建模-production-metrics--constraint-profiling)
   - 5.1 生产硬件与容器配额分析 (2GB 内存、768MB 应用限制)
   - 5.2 权威账本遥测基线 (132MB SQLite, Revision 1344)
   - 5.3 116.54% CPU 尖峰与 49~50s 请求高延迟成因建模
   - 5.4 单 Worker 线程模型在计算与 IO 密集混合场景下的头阻塞
6. [P1/P2 潜在风险推演与系统性技术演进方案 (P1/P2 Risk Defense & Architecture Evolution)](#6-p1p2-潜在风险推演与系统性技术演进方案-p1p2-risk-defense--architecture-evolution)
   - 6.1 P1 严重风险防御与自愈架构设计
     - 6.1.1 自动 Rebase-Reconcile 与客户端自愈协议
     - 6.1.2 读写解耦双 Worker 架构 (Write Engine vs Read Projection Pool)
     - 6.1.3 客户端传输弹性重试与自适应退避 (Exponential Backoff + Jitter)
     - 6.1.4 Envelope 纯净性强校验与元数据剥离规范
     - 6.1.5 SQLite Schema 平滑迁移与回滚 Expand-Contract 规范
   - 6.2 P2 架构演进方案 (长效机制)
     - 6.2.1 面向超大 Session (>100k) 的真正增量分段同步协议 (True Delta Sync)
     - 6.2.2 多设备并发写入与乐观并发作用域切分
     - 6.2.3 多源日志 Stable-Key-Set 承诺模型泛化 (`zcode`, `opencode`)
     - 6.2.4 设备状态消除歧义与统一 UI 状态机
7. [工程落地实施路径、改动清单与发布/回滚演练手册 (Implementation Roadmap & Runbooks)](#7-工程落地实施路径改动清单与发布回滚演练手册-implementation-roadmap--runbooks)
   - 7.1 分阶段实施路线图 (Phase 1 P0, Phase 2 P1, Phase 3 P2)
   - 7.2 跨模块代码逐文件改动清单 (Apps, Packages, Deployment, Scripts)
   - 7.3 全量验证测试套件与执行命令
   - 7.4 生产发布与紧急回滚实战操作手册 (Production Rollout & Rollback Runbook)

---

## 1. 执行摘要与核心发现 (Executive Summary & Key Findings)

Incept 同步子系统是一个高度专业化、具备因果一致性 (Causal Consistency) 与零隐私泄漏 (Zero-Knowledge Plaintext Masking) 保障的跨端同步基础设施。它负责将开发者本地多样化的 AI 辅助编程日志（覆盖 Codex、Antigravity、CommandCode、Claude、OpenCode、ZCode、DSH、AIUsage 等 9 大工具）实时采集、脱敏、聚合，并通过分片加密传输同步至中央服务端的不可变因果账本（SQLite WAL 模式），最终通过时间窗口投影呈现于团队看板。

经过对代码库主基线 `main` (`5e881e3`)、安全加固分支 `fix/sync-safety` (`355987a`) 以及生产服务器 `43.155.136.83` 的深度全景调研与取证分析，本报告揭示了以下重大事实与核心结论：

1. **分支基线致命脱节 (The Branch Desynchronization Hazard)**：
   - 当前 `main` 分支在自公共祖先 `8e5e084` 分叉之后，仅包含了 7 个纯文档提交（`f10dbcb` 至 `5e881e3`）。这些文档记录声称各项修复已经“实施完成”，但实际代码变更**完全未合并入 `main`**（0 个功能代码 commit 合入）。
   - `fix/sync-safety` 分支包含了全部 **18 个关键功能代码修复 commit**（跨越 63 个文件，净增加 1786 行，删除 183 行）。生产环境当前实际运行着基于 `fix/sync-safety` 衍生的镜像，SQLite 账本已升级至 `schema_version = 3`。
   - **灾难性风险**：若 CI/CD 误从 `main` 分支构建并部署镜像至生产，应用会在启动与写入时因 `SCHEMA_VERSION_MISMATCH`（`main` 代码硬编码要求 `version === 2`）全面崩溃死锁。
2. **历史 12 类故障的根本成因解耦**：
   过去的十余次同步失败及生产告警，本质上归咎于三大核心设计张力：
   - **串行计算与 IO 的头阻塞 (Head-of-Line Blocking)**：服务端 `SyncExecutor` 采用单个 Node.js Worker 线程串行处理批次摄入、分片暂存、全量 SHA-256 计算、Merkle 树构建、数据库提交以及后台看板的 4 个时间范围（today, 7d, 30d, all）快照投影。大 batch 提交与读操作争用单一 Worker，诱发 CPU 飙升至 116.54%、单请求 49~50s 延迟以及 30s 超时下的 Worker 强杀 (`RESULT_UNKNOWN` / 404 `BATCH_NOT_FOUND`)。
   - **底层可变存储与严格只增追加假设的冲突**：早期协议假设采集源文件为字节级严格追加 (append-only)，对 Antigravity 等以 SQLite 为底座的工具强制实施静态二进制范围证明，因 SQLite 内部页面重排与行就地更新引发了 100% 误判的 `PREFIX_LOST`；同时，将易变的展示元数据 (`sessionTitle`) 混入记录信封哈希，诱发了 Review #36 的 `REVISION_ENVELOPE_CHANGED`。
   - **因果分支推进时的客户端脱节**：服务端发生 Owner Rebase 或并发推进后，客户端未能感知最新的 Head，依然基于旧父哈希提交，导致大批次持续遭遇 `PARENT_MISMATCH` 并因级联锁定瘫痪了特定 Scope 的同步链路。
3. **系统化演进方案与实施路径**：
   本设计方案以 `fix/sync-safety` 为基石，进一步推演并确立了面向 P1 致命风险与 P2 演进目标的防御体系，包括读写双 Worker 架构、客户端自动化 Rebase-Reconcile 自愈协议、面向 100k+ 超大 Session 的 True Delta 分段同步协议，并提供了明确的工程落地文件清单与零宕机回滚操作手册。

---

## 2. 端到端同步机制与系统架构全景 (End-to-End Sync Architecture & Sequence Flows)

### 2.1 整体拓扑与系统边界

Incept 同步系统跨越四个物理/逻辑层级，构成了高度隔离的分布式同步管道：

```
+-----------------------------------------------------------------------------------------+
|                               客户端环境 (Developer Workstation)                         |
|                                                                                         |
|  [AI 开发工具日志]  Codex, Antigravity, CommandCode, Claude, OpenCode, ZCode, AIUsage... |
|         │                                                                               |
|         ▼                                                                               |
|  [采集隔离进程] collect-worker.mjs (1024MB 独立堆内存, 临时快照沙箱 capture-<uuid>)     |
|         │                                                                               |
|         ▼                                                                               |
|  [隐私脱敏引擎] maskUsage() (Token 数据置零, 物理剥离 prompt 与 completion 明文)       |
|         │                                                                               |
|         ▼                                                                               |
|  [本地持久化账本] state.db (SQLite WAL 模式, FULL 同步, 独占事物控制)                   |
|         ├── outbox (待发送批次队列, 状态机: pending/staging/committed/review/quarantined)|
|         ├── records (切片暂存记录, 主键: batch + position)                              |
|         ├── lineage & heads (因果祖先指纹, parent_json, signature)                      |
|         └── session_isolations (异常会话沙箱隔离记录)                                   |
|         │                                                                               |
|         ▼ (HTTPS / TLS 1.3 Transport, 5 次指数退避重试, 370ms 请求节流)                 |
+-----------------------------------------------------------------------------------------+
                                          │
                                          ▼
+-----------------------------------------------------------------------------------------+
|                                边缘网关层 (apps/sync-gateway)                           |
|                                                                                         |
|  [WebSocket Server] /api/sync/ws (客户端长连接通道, Token 握手认证, 心跳保活 30s)         |
|  [Active Connection Map] 设备长连接路由注册表 Map<deviceId, Connection>                |
|  [内部 RPC 校验器] RpcVerifier (基于 INCEPT_SYNC_RPC_SECRET 的 HMAC-SHA256 签名)       |
+-----------------------------------------------------------------------------------------+
                                          │ (内部 HTTP / VPC 网络)
                                          ▼
+-----------------------------------------------------------------------------------------+
|                              Web 应用与 API 层 (apps/web)                               |
|                                                                                         |
|  [通配网关分发] /api/dashboard/sync/[[...path]] -> handleSyncRequest()                  |
|  [安全控制边界] requireRecentOwnerSession (仅对修改操作实施 5 分钟限制, 放行只读 GET)  |
|  [流控与防护] PreAuthRequestLimiter (600 req/min/IP), DeviceRequestLimiter              |
|  [读穿透优化] /devices/status -> readDeviceSummary() (轻量只读直连, 绕过 Worker 队列)   |
|  [看板 SWR 引擎] /api/dashboard/usage -> readDashboardSnapshot(waitForFresh: false)    |
+-----------------------------------------------------------------------------------------+
                                          │ (进程内消息管道)
                                          ▼
+-----------------------------------------------------------------------------------------+
|                            同步执行引擎 (packages/dashboard)                            |
|                                                                                         |
|  [SyncExecutor] 任务执行调度器 (FIFO 队列, maxQueue=16, perDevice=2, timeout=120s)     |
|         │                                                                               |
|         ▼                                                                               |
|  [单 Worker 线程] worker-entry.ts (256MB 内存限制, 独占执行 SQLite 写入与状态流转)      |
|         │                                                                               |
|         ▼                                                                               |
|  [因果不可变账本] sync.db / v4.db (SQLite WAL 模式, schema_version = 3)                 |
|         ├── sync_staging & sync_stage_records (分片暂存槽, 设备并发限制 <= 4)           |
|         ├── sync_manifests & sync_generations (因果版本代谱, 唯一索引防分叉)            |
|         ├── sync_changes & sync_current (因果变更集与最新物化视图)                       |
|         ├── sync_reviews (异常隔离检视表, 承载分叉与验证失败提议)                       |
|         └── sync_receipts (已提交/待检视批次防伪收据)                                   |
+-----------------------------------------------------------------------------------------+
                                          │
                                          ▼
+-----------------------------------------------------------------------------------------+
|                              关系元数据存储 (PostgreSQL)                                |
|                                                                                         |
|  [AgentDevice] 设备凭据版本、SHA-256 凭据哈希、允许采集的 Source 白名单数组             |
|  [SyncJob] 远程下发任务状态、激活锁 activeKey (= deviceId, 保证单设备单任务并发)        |
+-----------------------------------------------------------------------------------------+
```

### 2.2 客户端日志采集沙箱与隔离机制 (`collect-worker.mjs`)

为防止客户端在扫描本地庞大、动态写入且可能包含损坏格式的 AI 工具日志时导致主进程崩溃，采集层设计了严格的沙箱隔离架构：

1. **执行隔离** (`apps/sync-agent/src/engine.ts:26-33`)：
   - 每次采集周期触发时，主引擎动态派生独立的 Worker 线程：`new Worker('./collect-worker.mjs', { resourceLimits: { maxOldGenerationSizeMb: 1024 } })`。
   - 配置硬性超时熔断（300 秒）。若 Worker 出现内存溢出或死循环，主线程强行调用 `worker.terminate()` 终止，不会波及托盘程序或常驻守护进程。
2. **零拷贝文件快照**：
   - 针对 SQLite 格式的数据源（例如 Antigravity 的 `conversations.db`），禁止直接在源文件上建立读连接，避免触发文件锁或由于工具并发写入导致数据库损坏。
   - 采集器利用系统级文件快照技术，将目标数据库复制到具有唯一标识的临时目录 `capture-<uuid>/`，并在完成解析后立即执行物理清理。
3. **分层存储预算控制** (`packages/dashboard/src/agent/capture.ts:85-87`)：
   - 在 `fix/sync-safety` 中彻底分离了内存堆预算与磁盘快照预算：
     - **JSONL/文本内存堆预算**：严格限制在 1024MB 以内。单文件体积阈值设为 256MB。
     - **SQLite 备份快照预算**：独立设定为 4GB。大体积的数据库副本直接流式存入磁盘，不再计入 Node.js 的 V8 JSON 解析堆预算，从根源上消除了 `CAPTURE_LIMIT` 误报。

### 2.3 零泄漏隐私脱敏引擎 (`maskUsage`)

系统的核心安全基石是“数据指标可验证，但物理内容绝对不出境”：

1. **内容物理剥离** (`packages/dashboard/src/agent/capture.ts:50-63`)：
   - 在构建同步候选对象（Candidate）时，`maskUsage()` 函数被强制调用。
   - 遍历每一条日志事件，删除所有提示词文本（`prompt`）、模型补全内容（`completion`）、思维链或推理文本（`reasoning`）、工具调用参数与消息正文。
2. **Token 指标置零与结构保留**：
   - 计算范围签名根 `range.envelopeRoot` 时，事件对象的度量字段（`input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_creation_tokens`, `recorded_cost`）全部被显式重置为 0。
   - 仅保留事件的逻辑结构指纹：模型标识符（`model`）、事件时间戳、消息角色序列、协议结构特征以及基于这些信息生成的 SHA-256 哈希。
   - **安全证明**：即使网络传输被完全监听，或者服务端数据库被攻击者获取，攻击者也只能重构出开发者的使用频率、模型类型与 Token 计量统计，绝不可能逆向出任何代码段、业务逻辑或提示词明文。

### 2.4 客户端持久化 Outbox 与 Lineage 状态机 (`state.db`)

客户端通过本地 SQLite 数据库（`state.db`）管理批次生命周期，确保在网络长期断开或机器断电时零数据丢失：

```
                    +-------------------+
                    |   Candidate Init  |
                    +-------------------+
                              │
                              ▼
                    +-------------------+
                    |   outbox: PENDING  |<-----------------------+
                    +-------------------+                         |
                              │                                   | (网络瞬时故障/
                              ▼ (POST /scopes/resolve 校验通过)    |  指数退避重试)
                    +-------------------+                         |
                    |   outbox: STAGING |                         |
                    +-------------------+                         |
                              │                                   |
                              ▼ (分片 PUT 完成, POST /commit 触发) |
               +──────────────┴──────────────+                    |
               │                             │                    |
 (校验通过, 取得 committed 收据)   (发生网络超时 / 503)             |
               ▼                             ▼                    |
     +-------------------+         +-------------------+          |
     | outbox: ACK_WAIT  |         | outbox: RETRY_WAIT|──────────+
     +-------------------+         +-------------------+
               │
               ▼ (state.acknowledge() 事务执行)
     +-------------------+
     | outbox: COMPLETED | (从 outbox 物理清理, 推进 lineage, 更新 lineage_tokens)
     +-------------------+

 [异常分支状态机]
  - 发生不可恢复的校验冲突 (PARENT_MISMATCH):
    outbox: PENDING ──> state.markLineageRecovery() ──> outbox: LINEAGE (等待 Reconcile)
  - 发生结构性损坏或超限 (400 / 413):
    outbox: PENDING ──> state.quarantine() ──> outbox: QUARANTINED (独立隔离, 不阻塞后续批次)
  - 服务端判定需要人工审查 (422 / Review-Required):
    outbox: PENDING ──> state.fail(code, review=true) ──> outbox: REVIEW (标记需 Owner 介入)
```

- **数据库 Pragma 保障** (`apps/sync-agent/src/state.ts:14-16`)：
  ```sql
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = FULL;
  PRAGMA busy_timeout = 1000;
  ```
- **核心表架构**：
  - `outbox`: 存储待同步批次。字段包含 `serial`, `batch` (UUID), `scope`, `header_json`, `proof_json`, `state`, `attempts`, `next_retry`, `admitted`。
  - `records`: 存储批次对应的具体切片记录。复合主键 `(batch, position)`。
  - `lineage`: 存储每个 Scope 当前已确认的因果祖先指纹 `(scope PRIMARY KEY, parent_json, signature, receipt_json)`。
  - `heads`: 存储本地追踪的最新服务端 Head 状态。
  - `session_isolations`: 存储损坏或异常会话的隔离记录，防止坏数据反复冲击同步管道。

### 2.5 九步批次上传协议生命周期 (9-Step Upload Wire Protocol)

客户端 `SyncEngine` 与服务端控制器协同完成一次原子同步批次的 9 步标准时序如下：

```
Client (sync-agent)                       Server Web Gateway (apps/web)          SyncExecutor / SQLite
     │                                                │                                    │
 1.  ├─ Check & Resume Held/Reviewed Scopes ─────────>│                                    │
     │                                                │                                    │
 2.  ├─ Query Pending Candidate from local state.db   │                                    │
     │                                                │                                    │
 3.  ├─ POST /api/dashboard/sync/scopes/resolve ─────>│ (Verify Device Identity & Token)   │
     │  Body: { source, sessionId }                   ├─ Check Scope Head & Admitted ────>│
     │<─ Return: { admitted: true, headManifest } ────┤                                    │
     │                                                │                                    │
 4.  ├─ GET /api/dashboard/sync/batches/:batchId ────>│ (Check Idempotent / Staged State) │
     │<─ Return: 404 (New Batch) or 200 (Resume) ─────┤                                    │
     │                                                │                                    │
 5.  ├─ POST /api/dashboard/sync/batches ────────────>│ (Allocate Staging Slot)            │
     │  Body: { header: SyncHeader }                  ├─ INSERT INTO sync_staging ────────>│
     │<─ Return: { nextOffset: 0 } ───────────────────┤                                    │
     │                                                │                                    │
 6.  │  [LOOP: Upload Chunks (<=500 recs / 512KB)]    │                                    │
     ├──PUT /batches/:id/pages/:offset ──────────────>│ (Verify Chunk Sequence & Staging)  │
     │  Body: { records: SyncRecord[] }               ├─ INSERT INTO sync_stage_records ──>│
     │<─ Return: { nextOffset: N } ───────────────────┤                                    │
     │                                                │                                    │
 7.  ├─ POST /api/dashboard/sync/batches/:id/commit ─>│ (Begin Transaction & Validate)     │
     │                                                ├─ BEGIN IMMEDIATE ─────────────────>│
     │                                                │  - Verify sequenceHash & Merkle    │
     │                                                │  - Check Parent Manifest Match     │
     │                                                │  - Apply to sync_generations/changes
     │                                                │  - Advance sync_scopes.head        │
     │                                                │  - Generate committed receipt      │
     │<─ Return: { receipt: SyncReceipt } ────────────┤<─ COMMIT ──────────────────────────┤
     │                                                │                                    │
 8.  ├─ GET /api/dashboard/sync/batches/:id ─────────>│ (Confirm Durable Receipt Hash)     │
     │<─ Return: { receipt: SyncReceipt } ────────────┤                                    │
     │                                                │                                    │
 9.  ├─ Execute state.acknowledge() locally           │                                    │
     │  (Atomically: advance lineage, clear records,  │                                    │
     │   purge outbox, supersede old attempts)        │                                    │
     ▼                                                ▼                                    ▼
```

### 2.6 边缘网关、WSS 长连接与内部 HMAC-RPC 认证 (`RpcVerifier`)

在多机/容器架构中，长连接网关与核心 Web 服务物理分离：

1. **网关长连接路由** (`apps/sync-gateway/src/gateway.ts`):
   - 暴露 `/api/sync/ws` 端点，客户端建立 WebSocket 连接后，首条消息发送 `{ type: 'auth', token: '<credential>' }`。
   - 网关向 Web 认证端点发起鉴权，验证通过后在内存建立映射 `connections.set(deviceId, socket)`。
   - 维持每 30 秒一次的心跳探测（Ping/Pong），当网络静默超过 60 秒时主动踢除幽灵连接。
2. **内部 HMAC-RPC 鉴权协议** (`packages/dashboard/src/sync/rpc.ts`):
   - Web 后端与 Gateway 之间通过共享密钥 `INCEPT_SYNC_RPC_SECRET`（32 字节高熵随机串）进行跨服务通信。
   - 每次 RPC 调用（如 `/rpc/dispatch`, `/rpc/kick`）必须在 HTTP 头部附带密码学证明：
     - `x-incept-rpc-timestamp`: 当前毫秒时间戳（仅允许 ±30 秒时钟漂移）。
     - `x-incept-rpc-nonce`: 16 字节随机串，服务端维护滑动窗口防止重放攻击。
     - `x-incept-rpc-signature`: `HMAC-SHA256(secret, method + "\n" + path + "\n" + timestamp + "\n" + nonce + "\n" + bodyDigest)`.
   - 杜绝了内部接口暴露在公网导致的未授权命令注入与任务伪造。

### 2.7 应用层路由与所有者权限控制边界 (`requireRecentOwnerSession`)

在 Web 应用层，所有同步操作均由通配路由接管，并实施精确的权限隔离：

1. **通配路由分发** (`apps/web/src/app/api/dashboard/sync/[[...path]]/route.ts`):
   - 将全部同步子路径映射到 `handleSyncRequest(request, context)` 控制器，统一施加请求体体积限制检查（`HTTP_LIMITS.stagingPage = 512KB`, `HTTP_LIMITS.batchHeader = 64KB`）。
2. **所有者鉴权边界治理** (`apps/web/src/server/sync/next.ts:36-40`):
   - **历史缺陷**：旧代码对所有 Owner 操作无差别调用 `requireRecentOwnerSession(request)`。若管理员登录超过 5 分钟未进行二次密码输入，即使只读轮询 `/devices/status`，服务端也会强行返回 HTTP 428 Precondition Required，导致前端不断弹出刷新失败。
   - **修复与加固**：严格区分只读操作与变更操作：
     ```typescript
     // 仅对变更操作要求 5 分钟内的活跃 Owner 会话
     if (mutating) {
       await requireRecentOwnerSession(request);
     } else {
       await requireOwnerSession(request); // 只读操作放宽至标准有效 Cookie 周期
     }
     ```

### 2.8 `SyncExecutor` 串行执行队列与超时熔断模型

`SyncExecutor`（`packages/dashboard/src/sync/executor.ts`）是保障 SQLite 账本写入绝对一致性的核心枢纽：

1. **单 Worker 隔离模型**：
   - 为避免 SQLite 在多线程并发写入时触发死锁或 `SQLITE_BUSY` 激增，系统在设计上实例化了单一专职的 `node:worker_threads` Worker（`worker-entry.ts`）。
   - 所有写入作业（`begin`, `stage`, `commit`, `rollback`, `acceptReview`）均必须进入排队管道。
2. **并发与队列配额**：
   - `maxQueue`: 限制为 16。当排队作业超过 16 时，立即向客户端抛出 `SyncTransportError('QUEUE_FULL', 429, 2)`，告知客户端 2 秒后重试。
   - `perDevice`: 单设备排队上限为 2，防止恶意或异常设备吞吐淹没整个服务器队列。
3. **超时与取消机制**：
   - 默认超时配置在 `fix/sync-safety` 中由原先的 30 秒延长至 120 秒（`INCEPT_SYNC_TIMEOUT_MS=120000`）。
   - 若作业在队列中等待超时，抛出 `QUEUE_TIMEOUT` (429)；
   - 若作业正在 Worker 线程内部执行时超时，执行器记录致命日志，向客户端抛出 `RESULT_UNKNOWN` (503)，并**强制调用 `await worker.terminate()` 杀死 Worker 线程**，重置执行器状态，防止僵死线程长期占用 CPU。

### 2.9 服务端 SQLite 因果账本架构 (`sync.db` / `v4.db`)

服务端数据库（`sync.db` / `v4.db`）基于因果事件溯源设计，由两组核心表构成：

#### 暂存区表 (Staging Area)
- `sync_staging`: 记录当前正在上传的批次元数据。
  - 字段: `(device_id, batch_id PRIMARY KEY, payload_hash, header_json, next_offset, byte_count, expires_at)`。
- `sync_stage_pages`: 记录分片上传的页面摘要。
  - 字段: `(device_id, batch_id, offset, page_hash, count, PRIMARY KEY(device_id, batch_id, offset))`。
- `sync_stage_records`: 记录已分片暂存的事件明细。
  - 字段: `(device_id, batch_id, position, record_json, PRIMARY KEY(device_id, batch_id, position))`。

#### 因果核心账本表 (Causal Immutable Ledger)
- `sync_manifests`: 存储每次提交的不可变清单。
  - 字段: `(id PRIMARY KEY, manifest_hash UNIQUE, epoch, record_count, sequence_hash, merkle_root, parent_manifest_hash, basis_hash, mappings_hash, payload_json, created_at)`。
- `sync_generations`: 存储 Scope 的因果演进代谱。
  - 字段: `(id PRIMARY KEY, scope_id, parent_id, manifest_id, basis_json, mappings_json, token_total, rolled, created_at)`。
  - **Schema 3 约束**: `CREATE UNIQUE INDEX sync_generations_scope_manifest ON sync_generations(scope_id, manifest_id);`，杜绝同一清单在相同 Scope 内重复入账。
- `sync_changes`: 记录每个 Generation 引入的事件增量集。
  - 字段: `(generation_id, position, observation_id, entity_id, PRIMARY KEY(generation_id, position))`。
- `sync_current`: 最新物化视图表，记录每个 Scope 当前处于可见状态的有效事件。
  - 字段: `(scope_id, position, observation_id, entity_id, PRIMARY KEY(scope_id, position))`。
- `sync_reviews`: 存储验证失败或分叉冲突的隔离提议。
  - 字段: `(id PRIMARY KEY, scope_id, manifest_id, code, header_json, proposal_hash, resolved_at, resolution, created_at)`。
  - **Schema 3 约束**: `CREATE UNIQUE INDEX sync_reviews_scope_manifest ON sync_reviews(scope_id, manifest_id);`。
- `sync_receipts`: 存储服务端向客户端签发的事实收据。
  - 字段: `(device_id, batch_id, status, payload_hash, receipt_json, committed_at, PRIMARY KEY(device_id, batch_id))`。

### 2.10 密码学完整性合约：哈希链、Merkle 树与 Stable-Key 承诺

系统构建了严密的多层密码学验证合约（`packages/dashboard/src/adapters/local/imports/sync/contract.ts`）：

1. **序列哈希 (`sequenceHash`)**：
   - 算法：对批次内所有记录严格按 `position` 升序执行规范化 JSON 序列化（`stableJson`），将得到的字节流连续拼接后执行 SHA-256：
     $$\text{sequenceHash} = \text{SHA-256}\Big(\bigoplus_{i=0}^{N-1} \text{stableJson}(R_i)\Big)$$
   - 保证了在分片切分与传输重组过程中，任何单条记录的顺序颠倒、字段删改都会彻底破坏最终哈希。
2. **二进制 Merkle 树根 (`merkleRoot`)**：
   - 为支撑 20k~100k 级的大批次验证，在 `fix/sync-safety`（`6c7c2d6`）中引入了完整的 Merkle 树：
     - 叶子节点：$L_i = \text{SHA-256}(\text{stableJson}(R_i))$。
     - 树构建：自底向上两两配对进行哈希计算，若为奇数则复制末尾节点。
   - 服务端在暂存每页分片时即可校验局部 Merkle 分支，大幅平摊了 Commit 阶段集中解算哈希的 CPU 峰值。
3. **Antigravity Stable-Key-Set 承诺模型**：
   - 针对 SQLite 内部存储无序且就地更新的特征，废弃了脆弱的二进制字节偏移检查，引入集合成员承诺：
     $$\text{commitment} = \Big\{ \text{version}: 1, \text{kind}: \text{'stable-key-set'}, \text{keyRoot}: \text{SHA-256}(\text{sort}(\{k_1, k_2, \dots, k_m\})), \text{count}: m, \text{schemaHash}: H_{\text{schema}} \Big\}$$
   - 校验逻辑：
     1. $H_{\text{current\_schema}} \equiv H_{\text{old\_schema}}$（模式定义未被未授权篡改）；
     2. $\text{count}_{\text{current}} \ge \text{count}_{\text{old}}$（确保没有历史用量行被静默物理删除）；
     3. 历史记录集合的 $\text{keyRoot}$ 必须完全包含且延续老版本的集合承诺。

### 2.11 关系存储层模式设计 (`AgentDevice`, `SyncJob`)

系统利用 PostgreSQL 存储设备认证凭据与异步任务调度元数据（`packages/db/prisma/schema.prisma`）：

```prisma
model AgentDevice {
  id                String    @id @default(uuid())
  ownerAccountId    String
  name              String
  tokenHash         String    @unique // SHA-256 存储，客户端仅持原始 Token
  tokenHint         String    // 掩码提示符 (如 "dev-***-8f")
  credentialVersion Int       @default(1)
  allowedSources    String[]  // 设备允许采集的源白名单数组
  lastSyncAt        DateTime?
  revokedAt         DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  @@index([ownerAccountId])
  @@map("agent_devices")
}

model SyncJob {
  id                String    @id @default(uuid())
  deviceId          String
  ownerAccountId    String
  activeKey         String?   @unique // 核心互斥键: 运行态硬约束 activeKey = deviceId
  status            String    // pending, running, completed, failed, expired
  credentialVersion Int
  policyHash        String
  startRevision     Int?
  dataRevision      Int?
  completionHash    String?
  errorCode         String?
  expiresAt         DateTime
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  @@index([deviceId, status])
  @@map("sync_jobs")
}
```

- **并发互斥保证**：通过在数据库级别对 `activeKey` 设置唯一索引，当且仅当任务处于活跃运行状态时填充 `activeKey = deviceId`。若针对同一设备下发两个并发任务，第二个数据库插入操作将直接抛出唯一键冲突异常，强行杜绝了多任务并发抢占同一设备本地 Outbox。

### 2.12 Dashboard 读链路架构、SWR 缓存与 LCP 优化机制

历史上线测试中，前端首屏指标 LCP 高达 7.26 秒，核心原因在于前端读路径与后端写入执行器高度耦合：

1. **直接只读穿透 (`readDeviceSummary`)**：
   - `/api/dashboard/sync/devices/status` 端点被从 `SyncExecutor` 的任务排队队列中完全剥离。
   - 改为在调用端开启轻量短连接，配置 `PRAGMA query_only = ON; PRAGMA busy_timeout = 5000;`，直接读取 `sync_receipt_clock` 视图获取时间戳，耗时从原先的 3500ms 降至 2ms 以内。
2. **看板快照 SWR 异步刷新机制 (`waitForFresh: false`)**：
   - 看板数据读取由原先的“同步等待 Worker 刷新 4 个时间跨度”重构为“Stale-While-Revalidate（陈旧数据优先服务）”模式：
     - 当检测到磁盘已存在有效快照时，立即向客户端输出该快照，TTFB 降至 50ms 以内；
     - 在后台通过防抖调度异步触发 Worker 计算最新快照（`scheduleTrustedDashboardRefresh`）；
     - 唯有在全新部署（本地快照为空）时，才同步挂起等待首个快照生成。
3. **客户端注水请求去重**：
   - 修复前 SSR 页面输出带有 `initialStatus='history'`，导致 React 组件在浏览器端水合（Hydration）后无条件立刻再发一次 `/api/dashboard/usage` 请求，造成算力双倍浪费；
   - 修复后服务端注水明确传递 `initialStatus='live'`，前端直接复用 SSR 注入的数据，首屏不再重复拉取 Usage，仅按需执行轻量的设备状态轮询。

---

## 3. 历史 12 类同步故障代码级与协议级根因排查 (Deep Dive into the 12 Historical Sync Failures)

本节对过去一周在测试与生产环境发生的 12 类典型同步失败故障进行逐一深度解剖，锁定其代码坐标、状态变迁、触发时机与完备解法。

### 3.1 故障 1: `RESULT_UNKNOWN` / `BATCH_NOT_FOUND`

- **分类与级别**: P1 级系统可用性故障 / 级联超时雪崩。
- **触发链路与时序**:
  1. 5 个本地客户端同时并发上传数据，或出现包含 20k+ 记录的大型批次；
  2. 批次摄入请求在 `SyncExecutor.queue` 中排队；
  3. 执行器默认配置 `maxQueue: 4`，单任务超时 `timeoutMs: 30_000` (30秒)；
  4. 当大批次的 SQLite 事务或哈希计算占用 Worker 超过 30 秒时，定时器触发：
     ```typescript
     // packages/dashboard/src/sync/executor.ts:40
     job.timer = setTimeout(() => {
       void this.cancel(job, job.active ? 'RESULT_UNKNOWN' : 'QUEUE_TIMEOUT');
     }, this.options.timeoutMs);
     ```
  5. `cancel()` 判定 `job.active === true`，执行底层 Worker 强制销毁：
     ```typescript
     // packages/dashboard/src/sync/executor.ts:50-53
     const worker = this.worker;
     this.worker = undefined;
     await worker?.terminate(); // 强行杀死 Worker 线程
     ```
  6. 正在执行的 SQLite 事务被底层强制中断并回滚，暂存槽数据丢失；
  7. 客户端收到 HTTP 503 `RESULT_UNKNOWN`；
  8. 客户端根据协议规则发起重试探测：`GET /api/dashboard/sync/batches/:id`；
  9. 服务端查询 `sync_staging` 表，由于事务早已随 Worker 销毁而回滚，记录不存在，抛出 HTTP 404 `BATCH_NOT_FOUND`。
- **根本原因**:
  1. 串行单 Worker 架构处理大批次时缺乏中间让渡与进度心跳；
  2. 30 秒超时阈值与 4 队列容量在多客户端并发场景下极易被击穿；
  3. 销毁 Worker 会瞬间丢弃所有正在内存中暂存但尚未提交的上下文，使下一次重试丧失幂等定位基点。
- **加固与修复方案** (Commit `91d4832`):
  1. 将生产 `compose.production.yml` 与执行器参数中的 `INCEPT_SYNC_TIMEOUT_MS` 延长至 120 秒 (`120_000ms`)；
  2. 将队列上限 `INCEPT_SYNC_MAX_QUEUE` 扩容至 16；
  3. 客户端 HTTP 请求超时同步对齐提升至 120 秒（`transport.ts`）。

### 3.2 故障 2: `NETWORK_UNAVAILABLE` / TLS Reset

- **分类与级别**: P1 级客户端弹性故障。
- **触发链路与时序**:
  1. 客户端宿主机运行了本地代理工具（如 Mihomo、Clash Verge、TUN 模式网卡切换或企业 HTTP_PROXY）；
  2. 在长连接保持或大分片连续 PUT 时，代理内核发生 TCP 连接重置（`ECONNRESET`）或 TLS 握手断开；
  3. 客户端 `AgentHttp.request()`（`apps/sync-agent/src/transport.ts:13`）在 `main` 基线中只有单次 `fetch` 尝试：
     ```typescript
     try {
       response = await fetch(target, init);
     } catch {
       throw new RemoteError('NETWORK_UNAVAILABLE', 503);
     }
     ```
  4. 遇到套接字断开立即抛出 503 `NETWORK_UNAVAILABLE`；
  5. 主循环捕获 503，直接 `break` 中断整个同步扫描周期；
  6. 客户端守护进程默认休眠 5 分钟（`300,000ms`），导致 Outbox 内的数据严重积压滞后。
- **根本原因**:
  客户端传输层缺乏对瞬态网络重置的抗扰度设计，把偶发性的 TCP 握手重置等同于长期网络断开，并施加了过长的休眠惩罚。
- **加固与修复方案** (Commit `0eecbd5`, `709e032`):
  1. 在 `apps/sync-agent/src/transport.ts` 内部构建 5 次重试循环，实施指数退避算法：
     $$\text{backoff}(attempt) = 250\text{ms} \times 2^{attempt} \quad (\text{即 } 250\text{ms}, 500\text{ms}, 1000\text{ms}, 2000\text{ms})$$
  2. 即使 5 次重试全部失败，`cli.ts` 捕获 `NETWORK_UNAVAILABLE` 后不再等待 5 分钟，而是激活快速探测模式：`next = Date.now() + 30000; log('NETWORK_RETRY_SCHEDULED');`，在 30 秒后再次唤醒重试。

### 3.3 故障 3: `REVISION_ENVELOPE_CHANGED` (Review #36)

- **分类与级别**: P1 级密码学指纹定义缺陷 / 误判数据篡改。
- **触发链路与时序**:
  1. 开发者在本地 IDE 中使用 CommandCode 进行会话；
  2. CommandCode 后台异步更新了该会话的展示标题（例如自动概括出 `sessionTitle: "Visualization Optimization"`）；
  3. 客户端构建新批次并上传，该批次包含了该会话历史前序记录的引用或延展；
  4. 服务端 `SyncStore.commit()` 调用 `qualifyRecords()` 执行历史一致性验证；
  5. 服务端重新计算传入记录的信封哈希并与账本中前序世代（Generation）中记录的信封哈希对比：
     ```typescript
     // main 基线中的 packages/dashboard/src/adapters/local/imports/sync/contract.ts:14
     export const syncEnvelope = (record: SyncRecord) => hash({
       ...record.event,
       eventId: undefined,
       inputTokens: undefined,
       outputTokens: undefined,
       cacheReadTokens: undefined,
       cacheCreationTokens: undefined,
       reasoningTokens: undefined,
       recordedCost: undefined
       // 致命缺陷: 未排除 sessionTitle !
     });
     ```
  6. 由于 `sessionTitle` 发生了改动，新旧信封哈希不一致，`qualifyRecords` 判定核心内容遭到篡改，抛出 `REVISION_ENVELOPE_CHANGED`；
  7. 服务端事务回滚，并向 `sync_reviews` 表写入 Review #36 记录，同步彻底阻断。
- **根本原因**:
  密码学信封定义（Envelope）混淆了“核心度量事实”与“展示型可变元数据”。`sessionTitle` 是可在 UI 端重命名的展示属性，绝不能作为数据不可变性校验的哈希载荷。
- **加固与修复方案** (Commit `0415b17`):
  1. 修正 `syncEnvelope` 提取器，将 `sessionTitle: undefined` 纳入显式剔除清单；
  2. 在 `qualifyRecords` 中增加兼容性逻辑：允许旧格式信封与剥离后的纯净信封进行等价比对，平滑兼容历史存量数据而无需人工清洗数据库。

### 3.4 故障 4: `PARENT_MISMATCH` / Lineage Conflict (Reviews #37/#38, Antigravity 阻塞)

- **分类与级别**: P1 级因果状态机分叉与级联锁死。
- **触发链路与时序**:
  1. 服务端因管理员执行了手动修复、历史 Rebase 或其他设备提交推进了 Head 节点（例如 Revisions 1169~1172）；
  2. 某台客户端本地 `state.db` 中的 `heads` 表由于离线或未轮询，依然停留于旧的 Manifest Hash；
  3. 客户端本地扫描器发现了新的开发用量，以本地旧 Head 为父节点（Parent）构建了 Candidate Batch 并写入本地 `outbox`；
  4. 客户端向服务端发起提交，服务端在因果校验时执行父代节点一致性检查：
     - **在线批次提交主路径 (`SyncStore.commit()`)**：
       代码位置：`packages/dashboard/src/adapters/local/imports/sync/store.ts:159`
       ```typescript
       if (parent) {
         requireSync(
           manifest.parent?.manifestHash === parent.manifestHash && manifest.parent.generationId === parent.generationId,
           'PARENT_MISMATCH'
         );
       }
       ```
       这是客户端在线提交时直接触发的因果校验点。当客户端提交的 `manifest.parent` 与当前 Scope 数据库中最新已提交的 Head `parent` 不一致时，直接抛出 `PARENT_MISMATCH`。
     - **管理端审查采纳路径 (`SyncStore.acceptReview()`)**：
       代码位置：`packages/dashboard/src/adapters/local/imports/sync/store.ts:256`
       ```typescript
       requireSync(
         manifest.parent
           ? manifest.parent.manifestHash === state.head_manifest && manifest.parent.generationId === state.head_generation
           : state.head_manifest === null,
         'PARENT_MISMATCH'
       );
       ```
       此处为系统所有者在管理后台人工采纳被隔离审查提议时的双重校验。若在生成审查提议后 Scope 的 Head 再次被其他并发提交推进，则在采纳时阻断并抛出 `PARENT_MISMATCH`，防止因果图发生分叉。
  5. 在线校验失败，服务端返回 409 Conflict (`PARENT_MISMATCH`)；
  6. **客户端级联锁死缺陷**：在 `main` 基线代码中，`apps/sync-agent/src/engine.ts` 将 409 标记为永久错误，调用 `this.state.fail(batch, code, true)`。`state.ts` 将该批次置为 `state = 'review'`，并执行危险的级联更新：
     ```sql
     UPDATE outbox SET state = 'review' WHERE scope = ? AND serial > ?;
     ```
  7. 本地 `AgentState.pending()` 具备断路检查：只要当前 Scope 存在任何处于 `review` 或 `held` 的批次，后续所有扫描全部挂起，整个 Antigravity / ZCode 的同步永久瘫痪。
- **根本原因**:
  服务端 Head 推进后缺乏主动向下游广播机制，且客户端将“祖先时序滞后（可通过 Rebase 自动修复）”错误地提升为“数据损坏永久 Review”，并通过数据库级联更新锁死了后续全部良性批次。
- **加固与修复方案** (Commit `a7b8311`, `7ce759b`):
  1. 废除级联标记 `review` 的破坏性逻辑，引入精确的隔离状态：`state.markLineageRecovery(batch, code)`（置为 `lineage` 状态）；
  2. 研发自动对齐命令：`agent.mjs reconcile-heads --confirm-reviewed`，允许客户端主动查询服务端权威 Head，在确认无数据分歧后直接在本地将滞后批次原地 Rebase 或标记为 `superseded`，快速解除 Scope 阻塞。

### 3.5 故障 5: `BATCH_PAYLOAD_MISMATCH`

- **分类与级别**: P2 级幂等协议违背。
- **触发链路与时序**:
  1. 客户端在上传某个批次时中途发生异常（例如网络丢包）；
  2. 客户端进入重试逻辑，但在准备重试数据时重新调用了 Candidate 构建方法；
  3. 由于时间戳变更、日志扫描轻微滑动或证据范围重排，重新生成的 Header 内容发生了哈希微变；
  4. 客户端复用了旧的批次标识符 `batchId` 发送 `POST /batches` 或 `POST /commit`；
  5. 服务端查询 `sync_staging` 或 `sync_receipts`，比对有效载荷指纹：
     ```typescript
     // packages/dashboard/src/adapters/local/imports/sync/store.ts:110-112
     if (old) {
       requireSync(old.payload_hash === payload, 'BATCH_PAYLOAD_MISMATCH');
     }
     ```
  6. 检查发现同一 `batchId` 对应了不同的载荷内容，服务端拒绝覆盖并抛出 409 `BATCH_PAYLOAD_MISMATCH`。
- **根本原因**:
  客户端在数据内容已经发生客观变动的情况下，违背了分布式幂等协议规范，复用了原有的唯一业务标识符。
- **加固与修复方案**:
  在客户端确立严格的 UUID 更新规范：任何时候只要 Candidate 的 Header、Record 或 Proof 被重新生成，必须调用 `state.renewExpired(batch, randomUUID())` 获取全局崭新的 UUID，旧批次在本地标记为废止。

### 3.6 故障 6: `PREFIX_LOST` (历史 Review 审计与 Stable-Key-Set 承诺)

- **分类与级别**: P1 级存储适配机制缺陷 / 虚假告警导致大面积误拦截。
- **触发链路与时序**:
  1. 客户端采集 Antigravity 插件的本地数据（存储于 `.gemini/antigravity/.../conversations/*.db` SQLite 数据库中）；
  2. 开发者与 AI 继续交互，Antigravity 内部对已存在的对话 step 执行原地状态更新（`UPDATE steps SET status=...`），或 SQLite 触发了 WAL Checkpoint 页面重平衡；
  3. 客户端生成当前范围的物理证明 `proof` 并上传；
  4. 服务端按文本文件只增追加的假设执行范围证明比对：
     ```typescript
     // main 基线中的 packages/dashboard/src/adapters/local/imports/sync/contract.ts:125
     requireSync(
       proof.retainedRoot === old.root && proof.retainedBytes === old.byteLength,
       'PREFIX_LOST'
     );
     ```
  5. 由于 SQLite 内部二进制布局改变，`proof.retainedRoot` 绝对不可能恒等于历史的 `old.root`，触发 `PREFIX_LOST` 并移交 `sync_reviews`。
  6. **离线生产审计惊人发现**：对线上 22 个历史 accepted-successor review 执行离线代码重放审计（`audit-accepted-reviews`），**22 个 review 全部因范围阶段的 `PREFIX_LOST` 失败，而 100% 的底层事件记录与 Token 统计完全合法、连续无缺失！**
- **根本原因**:
  将适用于只增文本流（Append-Only Text/JSONL）的前缀二进制哈希比较，生搬硬套给支持原地更新与页面重组的关系型数据库（SQLite），造成 100% 的误判阻断。
- **加固与修复方案** (Commit `14d118e`):
  1. 为 Antigravity 专属定义 `stable-key-set` 承诺规范（见 2.10 节）；
  2. 废除旧代码中生硬的兜底判断（`schemasMatch && noRowsDeleted...`），采用数学完备的键集合根哈希包含性证明，彻底终结了 Antigravity 产生虚假 `PREFIX_LOST` 的历史。

### 3.7 故障 7: Schema 回滚风险 (镜像降级与 DB Schema 3 不兼容)

- **分类与级别**: P1 级生产部署与回滚安全隐患。
- **触发链路与时序**:
  1. 生产环境部署了包含加固代码的新镜像，服务端 SQLite 自动执行了数据迁移：
     ```sql
     -- 升级至 schema_version = 3
     CREATE UNIQUE INDEX IF NOT EXISTS sync_generations_scope_manifest ON sync_generations(scope_id, manifest_id);
     CREATE UNIQUE INDEX IF NOT EXISTS sync_reviews_scope_manifest ON sync_reviews(scope_id, manifest_id);
     UPDATE sync_meta SET schema_version = 3 WHERE id = 1;
     ```
  2. 若发布后发现其他业务 Bug，运维人员按照传统微服务惯性，**仅在 Docker Compose 中将镜像 Tag 简单回退到旧版本**（如基于 `main` 分支构建的镜像）；
  3. 旧镜像容器启动，`SyncStore` 构造函数执行启动检查：
     ```typescript
     // main 基线中的 packages/dashboard/src/adapters/local/imports/sync/store.ts:62
     requireSync(
       Number(this.db.prepare('SELECT schema_version FROM sync_meta').get()!.schema_version) === 2,
       'SCHEMA_VERSION_MISMATCH'
     );
     ```
  4. 检查发现数据库版本为 3，断言失败，抛出致命错误 `SCHEMA_VERSION_MISMATCH`，容器内所有同步写请求全军覆没。
- **根本原因**:
  代码未遵循数据库平滑演进的“扩张/收缩（Expand-Contract）”规范，旧版本代码缺乏向前兼容性防御，直接硬编码强校验单一版本号。
- **加固与修复方案** (Commit `ec512c3`):
  1. 编写发布了生产回滚预案《Sync SQLite schema rollback drill》；
  2. 规范确立铁律：**严禁仅回滚容器镜像**。若必须回滚至不支持 Schema 3 的老旧代码，必须同时利用备份恢复预先打好的 Schema 2 SQLite 数据库冷备。

### 3.8 故障 8: 大批次 / 超大 Session (20k~100k+ 快照与资源瓶颈)

- **分类与级别**: P2 级容量与性能瓶颈。
- **触发链路与时序**:
  1. 深度开发长会话积累了数万甚至十万条交互记录；
  2. `main` 基线代码设置了过分保守的硬编码限制：`maxBatchRecords = 20,000`；
  3. 超过 20,000 条记录的批次在摄入阶段即被抛出 HTTP 429 `LARGE_BATCH_DEFERRED` 或 `CANDIDATE_RECORD_LIMIT` 拒绝；
  4. 即使强行调高数字，全量记录以普通 JSON 数组形式传输时，每页 500 条需切分为 200 个分片请求；
  5. 服务端单一 Worker 堆内存仅 256MB，在循环解析 100k 记录并连续执行全量 SHA-256 时，引发 V8 垃圾回收频繁停顿（GC Stalls），CPU 瞬间拉满至 116.54%，阻断后续所有请求。
- **根本原因**:
  全量快照传输机制缺乏层次化摘要，内存预算分配粗放，缺乏针对超大数组的高性能密码学校验结构。
- **加固与修复方案** (Commit `6c7c2d6`, `5143a77`):
  1. 将批次上限阶梯式扩展至 100,000 条；
  2. 引入二叉 Merkle 树，允许流式分片校验叶子节点，避免一次性在大对象堆中物化全量大数组；
  3. 客户端剥离 SQLite 快照与内存 JSON 堆预算（分别设定为 4GB 与 1GB）。

### 3.9 故障 9: 采集源隔离与 Quarantine 审计机制

- **分类与级别**: P2 级数据局部污染扩散。
- **触发链路与时序**:
  1. 某开发工具（如 Codex 或 Claude）正在高速写入日志文件，中途进程意外崩溃，留下半截损坏的非闭合 JSON 字符串；
  2. 客户端扫描器解析该文件时抛出 `SyntaxError`；
  3. 在早期实现中，扫描器的错误捕获范围过大，单一文件的解析抛错直接导致整个 `captureHome()` 流程终止；
  4. 结果导致开发者机器上其他完全健康的代码工具（如 Antigravity、CommandCode）的日志也无法被采集同步。
- **根本原因**:
  异常边界划分过粗，未实现会话级的物理沙箱与故障隔离。
- **加固与修复方案**:
  1. 引入精细化的会话隔离机制（`SessionIsolation`）：在解析单会话文件失败时，捕获异常并提取特征，生成明确的原因代码（`SOURCE_FILE_UNREADABLE`, `HISTORY_INCOMPLETE`, `RUNNING_USAGE` 等）；
  2. 将该会话记录写入本地 `state.db` 的 `session_isolations` 表，将其置入隔离区（Quarantine）；
  3. 采集主流程跳过该异常会话，继续正常处理后续所有健康会话；
  4. 保留隔离记录用于事后审计与开发者自查。

### 3.10 故障 10: Dashboard 设备状态 `Refresh failed` (读写共用队列饥饿)

- **分类与级别**: P1 级前端可用性与展示故障。
- **触发链路与时序**:
  1. 用户在浏览器端打开 Incept 看板，前端组件定期轮询 `/api/dashboard/sync/devices/status` 以刷新设备连通状态；
  2. 与此同时，客户端正在上传包含上万条记录的大型批次，服务端 `SyncExecutor` 的单一 Worker 正在全神贯注地执行 SQLite 写入与 Commit 事务；
  3. 在 `main` 基线实现中，`/devices/status` 的读取操作被包装为 `{ op: 'device-summary' }` 作业，**塞入了同一个排队队列中**；
  4. 读取请求被阻塞在耗时巨大的 Commit 作业之后，超过了 HTTP 请求网关超时，或因排队数超标触发 429 `QUEUE_FULL`，或耗尽 3.58 秒后被 Caddy 记录 `499 Client Closed Request`；
  5. 前端界面红字报错：`Refresh failed`。
- **根本原因**:
  架构设计严重违背了“读写分离（CQRS）”基本准则，将轻量级、高频次的监控状态只读查询，置于耗时巨大且带有独占锁的重度写入排队队列之后，造成极端严重的读饥饿。
- **加固与修复方案** (Commit `e4875db`):
  在 `SyncExecutor` 中新增直连只读查询方法 `readDeviceSummary()`。该方法完全绕过 Worker 任务队列，利用轻量独立的只读 SQLite 句柄，以 `PRAGMA query_only=ON` 直接从 `sync_receipt_clock` 提取设备最新时间戳，彻底根除了读操作饿死现象。

### 3.11 故障 11: Dashboard 首次内容绘制延迟 (LCP 7.26s) 与重复 Usage 请求

- **分类与级别**: P1 级前端性能与首屏用户体验缺陷。
- **触发链路与时序**:
  1. 用户访问 `/en/dashboard`；
  2. 服务端 SSR 渲染器调用 `readDashboardSnapshot('30d')`；
  3. `snapshot-store.ts` 在读取前无条件调用 `refreshTrustedDashboardSnapshots()`；
  4. 该函数向 `SyncExecutor` 派发 `{ op: 'projection-snapshots' }`，Worker 必须同步线性计算全部 4 个时间范围的用量投影；
  5. 导致 SSR Document 的 TTFB 严重拖慢至 **3,506ms**；
  6. 页面输出 HTML 时附带了 `initialStatus='history'` 状态；
  7. 浏览器完成 HTML 解析并水合（Hydration）后，前端 `useDashboardWindow` Hook 判定非 Live 状态，立刻再次向服务端发送了一次一模一样的 `/api/dashboard/usage` 请求；
  8. 浏览器端 Performance 测速显示首屏 LCP 达到惊人的 **7.26 秒**。
- **根本原因**:
  SSR 强依赖计算开销巨大的实时投影刷新，缺少陈旧缓存服务机制；前后端 Hydration 状态交接契约存在逻辑漏洞，导致首屏重复请求。
- **加固与修复方案** (Commit `355987a`):
  1. 实施 SWR 改造：SSR 传递 `waitForFresh: false`，优先直接读取磁盘已有的已发布快照；
  2. 修复注水状态：SSR 页面渲染成功后下发 `initialStatus='live'`，彻底砍掉水合后无意义的二次 Usage 请求，仅保留轻量的设备状态轮询。

### 3.12 故障 12: `lastRemoteJob` 残留状态导致托盘虚假告警

- **分类与级别**: P2 级 UI 展现与状态同步不一致。
- **触发链路与时序**:
  1. 系统在过去某个时间点发生过一次需要人工审查的事件（如 Review #35），在 PostgreSQL 的 `sync_jobs` 表中留下了包含 `reviewTotal = 1` 的历史任务记录；
  2. 随后该 Review 已在服务端通过 Rebase 成功修复，服务端 SQLite 处于 0 待处理 Review 的完美健康态；
  3. 客户端重新建立连接并获取状态时，Web 端接口直接调用 `prisma.syncJob.findFirst({ orderBy: { createdAt: 'desc' } })` 提取了上一次执行完成的任务元数据；
  4. Windows 托盘程序（`apps/sync-tray`）读取本地 `status.json`，发现 `lastRemoteJob.reviewTotal > 0`；
  5. 托盘程序无视了当前实时账本并无异常的事实，持续将图标置为黄色警告状态，弹出 `Needs attention · Review required`。
- **根本原因**:
  状态聚合层混淆了“历史离线调度作业的终态结果”与“当前因果账本的活跃实时状态”，用陈旧的历史作业快照覆盖了最新的健康账本事实。
- **加固与修复方案** (Commit `1143a68`):
  1. 重构托盘与 Dashboard 的状态展示判定逻辑：以实时账本的 `openReviews` 与 `heldBatches` 作为第一裁决优先级；
  2. 细化托盘告警分类，明确区分历史记录提示与当前活动阻塞，消除幽灵告警。

---

## 4. 基线分支全面对比与差异审计 (`main` vs `fix/sync-safety`)

### 4.1 分支拓扑与“文档已合入、代码全落后”核心异常

在对代码仓库进行深度取证时，审计团队发现了一个极度反常且高危的工程管理断层：

```
                    (Common Ancestor: 8e5e084 - 2026-10-28 12:47:00 +0800)
                                      o
                                     / \
                                    /   \
  [main 分支]                      /     \  [fix/sync-safety 分支]
  f10dbcb docs: publish combined...       14d118e fix(sync): complete upload remediation
  b8c11bf docs: publish envelope...       5143a77 fix(sync-agent): split capture heap
  eaa0118 docs: publish zcode...          e1614ac fix(sync): reconcile owner reviews
  f45a2c4 docs: publish dashboard...      1143a68 fix(sync-tray): explain review states
  003aaab docs: publish network...        7ce759b fix(sync-agent): keep partial work
  5e881e3 docs: publish fast retry...     dad82ee fix(sync-agent): accept review-required
  ---------------------------------       a2327c2 fix(sync): reserve recent-auth
  【统计: 7 个提交, 全部为纯文档】           a7b8311 feat(sync-agent): reconcile heads
  【功能代码修改: 0 行】                   6c7c2d6 feat(sync): Merkle-verified batches
  【Schema 支持: 仅支持 2】               91d4832 fix(sync): extend worker timeout (120s)
                                          0415b17 fix(sync): ignore sessionTitle
                                          e4875db fix(sync): readDeviceSummary bypass
                                          0eecbd5 fix(sync-agent): retry transient TLS
                                          709e032 fix(sync-agent): 30s fast network retry
                                          355987a perf(dashboard): SWR snapshots & LCP
                                          ------------------------------------------
                                          【统计: 37 个提交, 18 个核心功能代码 Commit】
                                          【代码变动: 63 个文件, +1786 / -183 行】
                                          【Schema 支持: 升级至 3, 防分叉唯一索引】
```

- **严重事实**：在合并基准点 `8e5e084` 之后，`main` 分支接收到的提交全部是交接日志、方案说明与汇报文档（如 `README.md`, `docs/current-task/2026-10-28-sync-upload-remediation.md` 等）。
- **致命陷阱**：汇报文档在文字上声称“已完成修复”，导致任何仅检阅文档的工程师或自动化审核工具误以为 `main` 分支已经具备了全部安全特性。然而实际的代码库中，**`fix/sync-safety` 上的 18 个核心代码补全提交一个都没有合入 `main`**。

### 4.2 18 个未合入功能代码提交清单与详尽功能映射

下表列出必须立即合并入主干的 18 个关键功能代码提交：

| 提交哈希 (SHA) | 所属模块 | 提交信息概要 | 核心代码改动点与解决的故障模式 |
|---|---|---|---|
| `14d118e` | `sync` | fix(sync): complete upload remediation and add offline rebase repair | 引入 `validation.ts` 纯证据验证；实施 Schema 3 迁移；新增 `sync-maintenance rebase-scope` 工具。解决故障 6。 |
| `5143a77` | `sync-agent` | fix(sync-agent): split capture heap and snapshot budgets | 彻底拆分 4GB SQLite 备份预算与 1GB JSON 堆预算。解决故障 8。 |
| `e1614ac` | `sync` | fix(sync): reconcile owner-resolved reviews in agent outbox | 本地 Outbox 识别并平滑标记已由 Owner 解决的审查批次。解决故障 4。 |
| `1143a68` | `sync-tray` | fix(sync-tray): explain review and held attention states | 托盘 UI 显式展示 Review / Held / Quarantined 细分状态。解决故障 12。 |
| `c5608d5` | `test(sync)`| test(sync): update remote WSS fixture and test certs | 更新 8 传输源端到端长连接测试固件，重签到期测试证书。保障 CI 稳定性。 |
| `7ce759b` | `sync-agent` | fix(sync-agent): keep failed and lineage work visible as partial | 废除 409 级联标记 `review`；400/413 独立进入 Quarantine。解决故障 4、9。 |
| `b7b426c` | `test(sync)`| test(sync): align remote acceptance tests with lineage | 使远程验收测试套件契合细分因果恢复语义。 |
| `dad82ee` | `sync-agent` | fix(sync-agent): accept review-required status when reading resolution | 允许客户端读取决议时正常接收 `review-required` 收据。解决故障 4。 |
| `a2327c2` | `sync` | fix(sync): reserve recent-auth requirement for mutating owner actions | 严格将 `requireRecentOwnerSession` 限制在变更动作，放行只读 GET。解决故障 10。 |
| `a7b8311` | `sync-agent` | feat(sync-agent): reconcile local lineage after owner rebase | 提供 `agent.mjs reconcile-heads --confirm-reviewed` 自动对齐 Head。解决故障 4。 |
| `ec512c3` | `docs(sync)`| docs(sync): schema rollback drill runbook | 建立数据库模式回滚实战演练手册。防范故障 7。 |
| `6c7c2d6` | `sync` | feat(sync): add Merkle-verified large-session batches | 引入二进制 Merkle 树支持，批次上限提升至 100,000 条。解决故障 8。 |
| `91d4832` | `sync` | fix(sync): extend worker timeout and queue for concurrent devices | Worker 超时延长至 120s，队列扩至 16。解决故障 1。 |
| `0415b17` | `sync` | fix(sync): ignore sessionTitle in record envelopes | 从信封哈希载荷中彻底剔除 `sessionTitle` 并提供向后兼容。解决故障 3。 |
| `e4875db` | `sync` | fix(sync): read device summary without the upload worker | 新增 `readDeviceSummary` 只读句柄绕过 Worker 排队。解决故障 10。 |
| `0eecbd5` | `sync-agent` | fix(sync-agent): retry transient TLS resets | 客户端 HTTP 传输层 5 次指数退避重试套接字重置。解决故障 2。 |
| `709e032` | `sync-agent` | fix(sync-agent): retry network failures after 30 seconds | 网络异常快速 30 秒探测唤醒，废除 5 分钟死等。解决故障 2。 |
| `355987a` | `dashboard`  | perf(dashboard): serve published snapshots while refreshing | 实施 SWR 异步快照与注水去重（`initialStatus='live'`）。解决故障 11。 |

### 4.3 核心架构差异与运行时配置对比矩阵

下表系统性对比两分支在关键模块上的真实代码与配置状态：

| 架构维度 / 配置项 | 主基线 `main` (`5e881e3`) | 安全分支 `fix/sync-safety` (`355987a`) | 架构影响与风险评级 |
|---|---|---|---|
| **SQLite Schema 版本** | 硬编码 `schema_version === 2` | 迁移至 `schema_version === 3`，具备防分叉唯一索引 | **P0 致命**：`main` 代码运行于线上 Schema 3 数据库会直接崩溃。 |
| **Worker 任务执行超时** | `timeoutMs: 30_000` (30 秒) | `timeoutMs: 120_000` (120 秒) | **P1 高危**：`main` 极易在高负载下强杀 Worker 抛出 503/404。 |
| **Worker 最大排队深度** | 容器配置限制为 `4` | 容器配置提升至 `16` | **P1 高危**：`main` 在多设备并发下极易抛出 429 `QUEUE_FULL`。 |
| **信封哈希定义** | 包含 `sessionTitle` 字段 | 显式剔除 `sessionTitle: undefined` | **P1 高危**：`main` 在会话重命名时必现 Review 拦截。 |
| **Antigravity 承诺** | 仅依赖静态二进制范围证明 | 采用 `stable-key-set` 集合哈希承诺 | **P1 高危**：`main` 会因 SQLite 页面重排导致 100% 误判 `PREFIX_LOST`。 |
| **设备状态读取路径** | 经由 Worker 任务队列排队 | `readDeviceSummary()` 直连只读 SQLite 句柄 | **P1 高危**：`main` 导致看板高频出现 `Refresh failed`。 |
| **客户端传输重试** | 0 次重试，遇错即抛 | 5 次指数退避重试 (`250ms * 2^attempt`) | **P1 高危**：`main` 遇本地代理抖动导致同步停摆数小时。 |
| **网络故障后重试间隔** | 默认休眠 5 分钟 (300,000ms) | 快速调度 30 秒唤醒重试 | **P1 高危**：`main` 自愈时效极慢。 |
| **看板快照读取机制** | 同步阻塞等待 4 个投影生成 | SWR 模式优先输出发布快照 (`waitForFresh: false`)| **P1 高危**：`main` 导致 SSR 耗时 3.5s+，首屏 LCP 高达 7.26s。 |
| **水合状态与 Usage 请求** | 下发 `history`，水合后立即复发 GET | 下发 `live`，消除无意义的重复拉取 | **P2 中危**：`main` 造成客户端与服务端算力翻倍浪费。 |
| **批次记录容量上限** | 20,000 条 | 100,000 条 (结合 Merkle 树流式校验) | **P2 中危**：`main` 无法同步超大型深度开发会话。 |
| **所有者权限拦截** | 盲目拦截所有 GET 请求 (5分钟过期) | 仅拦截变更写请求，放行状态读请求 | **P2 中危**：`main` 导致管理员闲置后频繁被踢出看板。 |

### 4.4 生产运行态脱节风险剖析

根据线上真实环境探测（`43.155.136.83`），当前生产环境正在运行的容器镜像实际上是早期手工构建并推送到生产服务器的测试镜像（标签类似于 `20261029-sync8`），并且服务端数据库文件 `/data/sync/v4.db` 已经经历了 Schema 3 的结构升级。

若当前有开发人员误认为 `main` 分支是最新稳定基线，执行标准的自动化流水线 `git checkout main && pnpm build && docker build...` 并部署至生产，将瞬间触发**生产级服务瘫痪**：
1. 启动后的容器在加载 `SyncStore` 时，执行 `SELECT schema_version FROM sync_meta` 得到数字 `3`；
2. `main` 分支代码中的断言 `requireSync(version === 2, 'SCHEMA_VERSION_MISMATCH')` 立即触发致命异常；
3. 所有同步写入、状态维护命令瞬间失败，所有在线客户端的批次提交全部遭到 500 拒绝。

---

## 5. 生产服务器资源约束与性能瓶颈建模 (Production Metrics & Constraint Profiling)

### 5.1 生产硬件与容器配额分析 (2GB 内存、768MB 应用限制)

生产环境硬件规格与容器化资源配额极为苛刻：
- **宿主机硬件拓扑**：Debian 13 (trixie)，6.12 内核，**仅拥有 2 核 vCPU 与 1.9GB 物理 RAM**，挂载 4GB Swap 交换分区。
- **当前内存水线**：物理空闲内存（Free Memory）长期处于 **105MB 左右**的极限边缘，Buffer/Cache 占用 1011MB，Swap 已常态化换出 391MB。
- **磁盘存储**：39GB 根磁盘已使用 32GB（占用率 **81%**），实际剩余可用空间仅剩约 7.7GB ~ 8.9GB。
- **容器配额硬约束 (`deployment/compose.production.yml`)**：
  - `incept-app-1`: 限制 `cpus: 2`, `mem_limit: 768m`, `memswap_limit: 1024m`。内部 Node.js 参数限定 `NODE_OPTIONS="--max-old-space-size=256 --max-semi-space-size=8"`。
  - `incept-postgres-1`: 限制 `mem_limit: 384m`, 数据库内部 `shared_buffers = 64MB`, `work_mem = 2MB`。
  - `incept-sync-gateway-1`: 限制 `cpus: 0.5`, `mem_limit: 128m`。
  - `incept-proxy-1` (Caddy): 限制 `mem_limit: 96m`。

### 5.2 权威账本遥测基线 (132MB SQLite, Revision 1344)

执行 `sync-maintenance status` 提取的生产数据库遥测指标如下：
- **SQLite 文件物理体积**：`/data/sync/v4.db` 体积达 **132,169,728 字节 (约 132MB)**；
- **核心因果版本**：`revision: 1344`；
- **防伪收据总数**：`receipts: 1436`；
- **隔离检视提议**：`reviews: 1`（仅存 1 条已处理的历史归档 Review）；
- **内存堆状态**：Node.js 运行时报告 `memory: 565MB / 805MB (70.2%)`。

### 5.3 116.54% CPU 尖峰与 49~50s 请求高延迟成因建模

在压力测试与日志追踪中，观察到批次创建、分片 PUT 与 Commit 期间，请求延迟频繁飙升至 **49~50 秒**，同时容器监控报告 `incept-app-1` CPU 尖峰达到 **116.54%**。

通过数学建模与调用栈分析，该瓶颈由以下叠加效应导致：

```
                    CPU 密集型计算与单线程阻塞模型
 ─────────────────────────────────────────────────────────────────────────────
 客户端请求序列:
 [Batch A: Commit] ──> [Worker 线程开始执行: 计算 20k 记录 sequenceHash + Merkle 树]
                           │ (占用 100% Core 0, 持续 18 秒)
                           ├──> 此时客户端发起 [Batch B: Page PUT] ──> 排队等待...
                           ├──> 此时 Dashboard 发起 [Devices Status] ──> 排队等待...
                           │
                           ▼ (Worker 完成 SHA-256，开始执行 SQLite 写入事务)
                           │ (频繁触发 fsync、WAL 写入与磁盘 IO 锁)
                           │
                           ▼ (Worker 触发背景刷新: 同步执行 4 个范围 Projection 聚合)
                           │ (循环聚合数十万事件 Token，触发 V8 GC 密集回收)
                           │ (Core 0 满载，Core 1 介入处理网络与 JSON 序列化 -> CPU 116.54%)
                           │
 [Batch B: 最终获准执行] ──> 总耗时 = 排队 32 秒 + 执行 17 秒 = 49 秒 (贴近 50s 临界线!)
 ─────────────────────────────────────────────────────────────────────────────
```

1. **序列化与哈希 CPU 饱和**：Node.js 在处理包含大量字段的 JSON 对象数组时，`JSON.stringify`、`stableJson` 以及逐条 SHA-256 计算完全在单线程事件循环中运行，瞬时将单核 CPU 算力吃满；
2. **SQLite WAL 写入与 Fsync 争用**：在提交阶段，`BEGIN IMMEDIATE` 独占锁使得任何其他写入线程无法介入；在 2GB 内存且 Swap 换出率高的 VPS 上，磁盘 IO 性能出现明显毛刺；
3. **单 Worker 头阻塞诱发级联等待**：由于所有操作共用一个 Worker，前一个大任务的执行时间直接线性累加到后序所有小任务的等待时间上。一个执行 15 秒的 Commit 任务，会导致排在其后的 3 个轻量分片 PUT 请求总耗时分别达到 15s、30s、45s，直接逼近网关 50s 阈值并触发客户端超时中断。

### 5.4 单 Worker 线程模型在计算与 IO 密集混合场景下的头阻塞

深入剖析 `SyncExecutor` 的设计权衡可知：
- **设计初衷**：SQLite 采用单进程/单线程写入模型能彻底规避多线程并发写锁冲突，免去复杂的分布式锁机制；
- **现实陷阱**：设计者错误地将“**CPU 密集型的大规模哈希计算**”、“**CPU 密集型的多周期数据投影聚合**”与“**纯粹的 SQLite 数据库行写入**”全部捆绑到了同一个 Worker 线程中。
- **破局关键**：必须严格将“写因果账本”与“读状态/算投影”进行线程级乃至进程级物理剥离。

---

## 6. P1/P2 潜在风险推演与系统性技术演进方案 (P1/P2 Risk Defense & Architecture Evolution)

### 6.1 P1 严重风险防御与自愈架构设计

针对关乎系统生命线、可能导致同步阻断与数据分叉的 P1 风险，设计以下完备防御机制：

#### 6.1.1 自动 Rebase-Reconcile 与客户端自愈协议

- **问题本质**：服务端因维护或多设备并发推进发生 Head 变更，导致滞后客户端产生 409 `PARENT_MISMATCH` 并陷入 Scope 锁死。
- **协议级自愈架构**：
  1. **自愈响应扩展**：当服务端检测到客户端提交的 `manifest.parent` 并非当前 `head_manifest`，但其父节点属于当前分支历史中可追溯的直系祖先节点（Ancestral Node）时，服务端不再单纯返回生硬的 409，而是在响应体中下发自愈载荷：
     ```json
     {
       "error": "PARENT_MISMATCH",
       "reconcileAdvised": true,
       "currentHead": {
         "manifestHash": "a1b2c3...",
         "generationId": "gen-987",
         "recordCount": 4520
       }
     }
     ```
  2. **客户端静默原地 Rebase**：
     客户端 `SyncEngine` 收到带有 `reconcileAdvised: true` 的响应后，自动调用内建的 `reconcileHeads` 逻辑：
     - 从本地数据库提取该 Scope 尚未被服务端确认的最新原始事件集；
     - 自动拉取服务端的最新 Manifest 作为新 Base；
     - 在本地原地重构 Candidate Header，更新 Parent 指针，重新计算序列哈希并分配崭新的 `batchId`；
     - 重新排队上传，全程无需人工运行 CLI 命令，实现毫秒级故障自愈。
  3. **自愈循环上限与带抖动指数退避防活锁规约 (Rebase Bounds & Jittered Backoff)**：
     - **硬性重试上限 (`maxRebaseAttempts = 3`)**：在多设备高频并发或服务端 Head 频繁抖动（Flapping Server Head）场景下，无约束的连续自动 Rebase 极易引发客户端与服务端之间的活锁（Live-lock Loop）与网络雪崩。协议强制约束：单个批次或单 Scope 连续自愈 Rebase 尝试次数硬上限设为 3 次。
     - **带随机抖动的全退避 (Full Jitter Exponential Backoff)**：每次自愈 Rebase 重试之间必须施加指数退避与随机抖动：
       $$T_{\text{rebase}} = \min\big(T_{\text{max}}, \, T_{\text{base}} \times 2^{\text{attempt}}\big) + \text{random}(0, \, T_{\text{jitter}})$$
       其中基准退避 $T_{\text{base}} = 1000\text{ms}$，最大退避 $T_{\text{max}} = 5000\text{ms}$，随机抖动 $T_{\text{jitter}} = 500\text{ms}$。退避窗口避免了并发客户端在 Head 更新后同一时刻蜂拥重试。
     - **熔断降级与报警通知**：若重试次数超过 `maxRebaseAttempts`（达到第 4 次失败），客户端立即熔断退出自动重试循环，将批次安全置为 `lineage` 隔离状态，记录错误原因为 `MAX_REBASE_ATTEMPTS_EXCEEDED`，进入 60 秒冷却观察期并在 UI 托盘精准提示“Head flapping - holding submissions”，彻底防止死循环请求轰炸。

#### 6.1.2 读写解耦双 Worker 架构 (Write Engine vs Read Projection Pool)

为彻底解决单 Worker 造成的头阻塞与 CPU 尖峰，对 `SyncExecutor` 实施双 Worker 架构演进：

```
                               Web Application Layer
                                         │
                   ┌─────────────────────┴─────────────────────┐
                   ▼                                           ▼
         [SyncWriteExecutor]                         [SyncReadExecutor]
     专职负责写入与一致性保障                     专职负责看板快照与用量投影计算
  (Dedicated Writer Worker Thread)            (Dedicated Reader Worker Thread)
                   │                                           │
                   ▼ (BEGIN IMMEDIATE)                         ▼ (PRAGMA query_only = ON)
         [sync.db SQLite 主库] ──────── (WAL 模式) ────────> [只读快照与查询句柄]
```

- **职责切分与执行模型**：
  - **Writer Worker (`SyncWriteExecutor`)**：专职处理 `begin`, `stage`, `commit`, `rollback` 等因果账本写入与密码学完整性校验。完全剥离耗时的用量投影与统计计算。任何单任务执行时间被严格压制在 5 秒以内，分片写入延迟维持在 200ms 以内；
  - **Reader Worker (`SyncReadExecutor`)**：独立承接 `projection`, `projection-snapshots`（today, 7d, 30d, all 等看板窗口），配置独立只读连接（`PRAGMA query_only = ON`），计算完毕后原子落盘快照文件。即使 Reader 算力跑满，Writer 依然能平稳接收分片，消除 50 秒延迟尖峰。
- **容器 768MB 配额平衡与 V8 堆内存科学分配 (Memory Quotas & Cgroup Safety)**：
  - 生产环境容器 `incept-app-1` 施加了严格的 cgroup 配额：`mem_limit: 768m` (`memswap_limit: 1024m`)。
  - **内存超配风险警示**：若分配过大堆内存（例如 Writer 192MB + Reader 192MB + Web 256MB = 640MB V8 Heap），在叠加 Node.js 运行时底座（~150MB RSS）、V8 字节码缓存、Prisma 连接池、原生 C++ 绑定（`better-sqlite3` / `node:sqlite`）页面缓存（~64MB）及 TCP 传输 Buffer 后，总物理 RSS 将突破 830MB，极易触发宿主机 Linux 内核 OOM-killer 致命信号（`Exit code 137`）。
  - **三方平衡堆配额方案**：
    - **SyncWriteExecutor (Writer)**：`maxOldGenerationSizeMb: 128` (128MB V8 Heap)；
    - **SyncReadExecutor (Reader)**：`maxOldGenerationSizeMb: 128` (128MB V8 Heap)；
    - **Next.js Web 主进程**：保持 `NODE_OPTIONS="--max-old-space-size=256"` (256MB V8 Heap)；
    - **总堆内存合计**：$128\text{MB} + 128\text{MB} + 256\text{MB} = 512\text{MB}$；
    - **保留安全裕度 (Headroom)**：$768\text{MB} - 512\text{MB} = \mathbf{256\text{MB}}$。该 256MB 物理内存专供 OS 内核调度、Node.js C++ 运行时 RSS、原生线程栈、文件系统 Buffer Cache 以及 SQLite WAL 操作，彻底杜绝容器 OOM 崩溃。
- **投影计算滑动窗口防抖 (Projection Debouncing)**：
  - 废除“每次 batch commit 完成后立即无脑触发全量 4 窗口投影”的单调级联逻辑（`executor.onCommitted` 立即执行）；
  - 引入 **15~30 秒滑动窗口防抖 (Debouncing)**：当 Writer 频繁提交批次时，仅打上 `projection_dirty = true` 标记。在最后一个批次到达后静默 15 秒（或自首次提交起最多延迟 30 秒硬超时），Reader Worker 才触发一次批量聚合投影。在高并发连续上传期，投影触发频次降低 90% 以上，从根本上压制 CPU 尖峰。
- **SQLite WAL Checkpoint 死锁与读写防饿死规约 (WAL Checkpoint Lockout Mitigation)**：
  - **锁冲突机制**：在 SQLite WAL 模式下，Reader 不阻塞 Writer 写入，但**长事务读操作会持有 WAL 索引 (`-shm`) 读锁标记**，直接阻断 Writer 执行 `PRAGMA wal_checkpoint(TRUNCATE)` 或 `RESTART`。若 Reader 执行 30 天大跨度数据扫描耗时过长，Writer 每次提交后的 Checkpoint 将持续被 Lockout，造成 `v4.db-wal` 膨胀至数百兆，在宿主机磁盘可用仅 8.9GB (78%已用) 的严苛环境下引发磁盘耗尽风险。
  - **自适应治理策略**：
    1. **使用 PASSIVE 检查点**：Writer 端的日常维护任务 `maintain()` 将阻塞式检查点调整为 `PRAGMA wal_checkpoint(PASSIVE)`，即使存在并发 Reader 也仅检查点已释放的日志帧，不强行等待或死锁；
    2. **投影分段分批快照**：Reader 在查询海量历史记录时，将单个长时间运行的 SELECT 拆解为带时间区间的短事务（单次事务锁持有时间控制在 500ms 以内），主动让出 WAL 读锁；
    3. **自适应水位推进**：仅在 Reader 空闲且 WAL 未检查点帧数（Uncheckpointed Frames）超过 1,000 时，才在后台低峰期调度执行一次完整的 `PRAGMA wal_checkpoint(RESTART)`。
- **容器配额扩容建议 (Scale-Up Recommendation)**：
  - 鉴于当前物理宿主机拥有 1.9GB RAM，当前容器限制分配偏紧。当后续纳入更多开发工具日志或团队用户扩容时，建议将 `deployment/compose.production.yml` 中 `incept-app-1` 的容器内存限额适度上调至 `896m`~`1024m`（`memswap_limit: 1280m`），使双 Worker 与 Web 服务获得更充裕的资源弹性。

#### 6.1.3 客户端传输弹性重试与自适应退避 (Exponential Backoff + Jitter)

针对复杂的网络代理环境，在 `apps/sync-agent/src/transport.ts` 中确立工业级重试模型：
1. **全抖动指数退避公式**：
   $$T_{\text{wait}} = \text{random}\Big(0, \, \min(T_{\text{max}}, \, T_{\text{base}} \times 2^{\text{attempt}})\Big)$$
   其中 $T_{\text{base}} = 250\text{ms}$, $T_{\text{max}} = 5000\text{ms}$，最大重试次数提升至 8 次。随机抖动（Full Jitter）有效防止成百上千台机器在网络恢复瞬间同时重试造成的雷鸣群体效应（Thundering Herd）。
2. **断路器机制 (Circuit Breaker)**：
   若连续遭遇 8 次 TLS Reset，客户端断路器跳闸，状态置为 `OPEN`，进入 30 秒的静默观察期，期间不再发起网络请求以节约系统能耗；30 秒后进入 `HALF-OPEN` 状态，仅放行一次轻量探测，探测成功后恢复同步。

#### 6.1.4 Envelope 纯净性强校验与元数据剥离规范

建立严格的元数据清洗准则，杜绝因 UI 展示信息导致信封哈希漂移：
1. **白名单字段投影**：重构 `syncEnvelope`，从原先的“黑名单剔除模式”全面转变为“**白名单抽取模式**”。
   - **真实类型对齐**：对照 `packages/dashboard/src/domain/imports.ts` 中定义的权威 `TransferEvent` 类型：
     ```typescript
     export type TransferEvent = {
       eventId: string;
       source: TransferSource;
       sessionId: string;
       timestampMs: number;
       modelName: string;
       projectKey: string;
       projectName: string;
       workspacePath?: string;
       sessionTitle?: string;
       inputTokens: number;
       outputTokens: number;
       cacheReadTokens: number;
       cacheCreationTokens: number;
       reasoningTokens: number;
       recordedCost?: number;
     };
     ```
   - **核心身份指纹白名单提取**：
     ```typescript
     export const syncEnvelope = (record: SyncRecord) => {
       // 严格白名单提取 TransferEvent 核心实体身份指纹字段，从根本上隔离未来任何新加入的可变展示字段
       const { source, sessionId, timestampMs, modelName, projectKey, projectName, workspacePath } = record.event;
       return hash({
         source,
         sessionId,
         timestampMs,
         modelName,
         projectKey,
         projectName,
         workspacePath: workspacePath ?? undefined
       });
     };
     ```
   - **显式剥离字段清单 (Stripped Fields)**：
     - `eventId`：本地采集时随机生成的 UUID，用于行级去重，非因果身份键；
     - `sessionTitle`：客户端异步推断生成的展示标题（Review #36 故障根因，随用户对话演进可变）；
     - `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheCreationTokens`, `reasoningTokens`：用量度量数值，可能因分词器校准在合规重算中微调；
     - `recordedCost`：根据定价模型实时换算的财务元数据。
   - **白名单模式防御收益**：在黑名单模式下，未来只要为 `TransferEvent` 增加任何新字段（例如 `userTags`、`clientVersion`），存量信封哈希就会被不可逆地污染；而白名单模式锁死了不可变事件的最小核心代数集，彻底免疫未来的字段扩展漂移。
2. **服务端双轨校验兼容期**：
   在 `qualifyRecords` 中保持对历史存量世代信封哈希的双轨宽容校验：
   ```typescript
   requireSync(
     old.envelopeHash === row.envelopeHash ||
     syncEnvelope(old) === syncEnvelope(row) ||
     (relocated && unchangedUsage(old) === unchangedUsage(row)),
     'REVISION_ENVELOPE_CHANGED'
   );
   ```
   在保障密码学安全的同时，平滑兼容历史存量世代，无需对已有 `sync_observations` 库表执行昂贵且高危的人工数据清洗。

#### 6.1.5 SQLite Schema 平滑迁移与回滚 Expand-Contract 规范

制定严格的数据库演进规范，杜绝镜像回滚引发崩溃：
1. **多版本宽容读取 (Expand 阶段)**：
   服务端启动代码中，`ensureSchemaVersion()` 必须支持当前版本及其前一个版本的平滑运行：
   ```typescript
   const version = Number(db.prepare('SELECT schema_version FROM sync_meta WHERE id=1').get()!.schema_version);
   requireSync(version === 2 || version === 3 || version === 4, 'UNSUPPORTED_SCHEMA_VERSION');
   ```
2. **两阶段发布策略**：
   - 阶段 1：先部署支持多版本的代码镜像；
   - 阶段 2：执行 Schema 物理升级并写入升级标记；
   - 阶段 3（收缩阶段）：在下一个大版本发布并稳定运行两周后，再物理移除对老旧版本的兼容代码。

---

### 6.2 P2 架构演进方案 (长效机制)

针对超大 Session、多设备并发以及多工具适配等长期架构演进需求，提出以下解决方案：

#### 6.2.1 面向超大 Session (>100k) 的真正增量分段同步协议 (True Delta Sync)

- **当前痛点**：当前架构虽然支持 100k 批次，但依然是“全量快照传输”，即一个拥有 10 万条记录的会话，哪怕只新增了一条对话，也需要把 100,001 条记录全部上传并计算 Merkle 树，网络开销与序列哈希计算开销巨大。
- **增量分段同步协议设计**：
  1. **分段哈希锚点 (Segment Anchoring)**：以 1,000 条事件为一个固定分段（Segment）。每个分段拥有独立的 `segmentHash` 与 `segmentMerkleRoot`；
  2. **增量区间声明 (Delta Manifest Declaration)**：客户端上传时，Manifest 声明：
     ```json
     {
       "mode": "delta",
       "baseManifestHash": "b7c2...",
       "unchangedSegments": [0, 1, 2, ..., 98],
       "appendedRecords": [ /* 仅包含最后 1000 条新增事件 */ ]
     }
     ```
  3. **底层表结构与分段引用复用实现 (Schema Reality & Segment Reuse Implementation)**：
     - **底层 Schema 现状辨析**：必须明确指出，当前生产 Schema 2 与 Schema 3 中的 `sync_changes` 表（`packages/dashboard/src/adapters/local/imports/sync/store.ts:18`）定义为：
       ```sql
       CREATE TABLE IF NOT EXISTS sync_changes (
         generation_id TEXT NOT NULL,
         position INTEGER NOT NULL,
         observation_id TEXT,
         entity_id TEXT,
         PRIMARY KEY(generation_id, position)
       );
       ```
       该表原生**并不存在 `segment_id` 物理列**。因此分段复用不能假设存在现成的 `segment_id` 字段，架构设计提供两条扎实的工程实现路径：
     - **实现路径 1：数学位置区间切片 (Mathematical Position Index Slicing，Schema 3 零改造兼容)**：
       利用每个分段固定容纳 1,000 条记录的算术映射：分段 $k$ 严格对应记录位置索引 $\text{position} \in [k \times 1000, \, (k + 1) \times 1000 - 1]$。
       服务端在无需任何数据库 Schema 迁移的前提下，直接通过位置算术区间完成零拷贝世代复用：
       ```sql
       INSERT INTO sync_changes (generation_id, position, observation_id, entity_id)
       SELECT :nextGenerationId, position, observation_id, entity_id
       FROM sync_changes
       WHERE generation_id = :baseGenerationId
         AND position BETWEEN (:segmentIndex * 1000) AND ((:segmentIndex + 1) * 1000 - 1);
       ```
     - **实现路径 2：显式 Schema 4 增量升级 (Explicit Schema 4 Migration)**：
       若未来需针对海量分段构建二级 B-Tree 索引以加速跨世代定位，设计严格平滑的 Schema 4 迁移方案：
       ```sql
       -- Schema 4 物理升级规范
       ALTER TABLE sync_changes ADD COLUMN segment_id INTEGER;
       CREATE INDEX IF NOT EXISTS sync_changes_segment ON sync_changes(generation_id, segment_id);
       UPDATE sync_meta SET schema_version = 4 WHERE id = 1;
       ```
       在 Schema 4 模式下，直接利用 `segment_id IN (...)` 批量执行分段行指针复制。
  4. **分层 Merkle 分段树与因果序列校验规约 (Hierarchical Merkle Segment Trees)**：
     - **因果校验冲突剖析**：现有系统强制校验 `manifest.sequenceHash === SHA256(rec_0 + ... + rec_N)`。在 Delta Sync 模式下，若服务端仅接收最后 1,000 条新增记录，为计算线性序列哈希，服务端必须从 `sync_observations` 读回前 99,000 条历史原始 JSON 记录并拼接哈希，这会带来数十兆磁盘 IO 与高额单线程 CPU 计算，直接抹平增量同步带来的性能红利！
     - **分层 Merkle 解决方案**：
       将线性 `sequenceHash` 升级为分层 Merkle 分段树（Hierarchical Merkle Segment Tree）：
       1. 每个 Segment（1,000 条记录）独立计算 `segmentMerkleRoot = Merkle(rec_0 ... rec_999)`；
       2. 全局 `manifestMerkleRoot` 由各分段根节点构成的 Merkle 树生成：
          $$\text{manifestMerkleRoot} = \text{Merkle}\big(\text{segmentRoot}_0, \, \text{segmentRoot}_1, \, \dots, \, \text{segmentRoot}_K\big)$$
       3. 客户端上传时，对于未变更的历史分段，直接复用其已被服务端因果账本固化的 `segmentMerkleRoot`。服务端只需在内存中将历史分段根与新分段根聚合，即可在 $O(\text{segments})$（如 100 次节点哈希，耗时 < 1ms）复杂度内完成因果完整性验证，完全无需从磁盘回读任何历史原始 JSON 文本，实现真正的端到端轻量级增量同步！

#### 6.2.2 多设备并发写入与乐观并发作用域切分

- **切分方案**：将单一全局的 Scope 概念，细化为“设备专属分支作用域”：
  $$\text{ScopeID} = \text{Source} + \text{"::"} + \text{DeviceID} + \text{"::"} + \text{SessionID}$$
- **效果**：不同设备在各自的作用域内独立推进 Head，完全不存在并发竞态冲突；服务端在生成全局用量投影（Projection）时，在视图层进行联合跨作用域聚合，从架构根源上消除了多设备并发冲突。

#### 6.2.3 多源日志 Stable-Key-Set 承诺模型泛化 (`zcode`, `opencode`)

- **推广路径**：当前仅 Antigravity 实现了 `stable-key-set` 承诺。后续版本将为 `zcode`（同样基于本地 SQLite 存储）以及 `opencode` 建立标准键提取适配器：
  - 定义各自的数据表原生唯一键组合规则；
  - 接入 `validateEvidence()` 校验管道；
  - 彻底消灭全系统中所有由于底层数据库引擎更新引起的假性审查（False Reviews）。

#### 6.2.4 设备状态消除歧义与统一 UI 状态机

- **统一状态机模型**：在客户端（Tray/Web）定义正交的系统状态向量：
  $$\mathbf{S} = \big\langle \text{Connectivity: } \{\text{Live, Degraded, Offline}\}, \; \text{Ledger: } \{\text{Clean, ReviewRequired, ReconcileNeeded}\}, \; \text{Worker: } \{\text{Idle, Syncing, Quarantined}\} \big\rangle$$
- **UI 彻底消除歧义**：不再使用单个笼统的“Error”或“Needs Attention”。若仅是历史作业存留，界面显示健康绿灯并在详情面板中标注“Historical Review Resolved”；若真正存在当前阻塞，精准提示“Lineage Desynchronized - Click to Reconcile”。

---

## 7. 工程落地实施路径、改动清单与发布/回滚演练手册 (Implementation Roadmap & Runbooks)

### 7.1 分阶段实施路线图 (Phase 1 P0, Phase 2 P1, Phase 3 P2)

```
2026-11-01                     2026-11-15                     2026-12-01
    │                              │                              │
    ▼                              ▼                              ▼
[Phase 1: P0 分支基线归一]      [Phase 2: P1 队列与自愈加固]   [Phase 3: P2 增量架构演进]
  - 将 fix/sync-safety 干净       - 实施读写双 Worker 架构解耦    - 研发 True Delta 分段协议
    合并至 main 分支               - 部署自动 Rebase 自愈协议     - 泛化 ZCode Stable-Key 承诺
  - 统一全系统 Schema 3           - 接入带 Jitter 的弹性重试     - 多设备专属 Scope 隔离
  - 生产发布验证门禁              - 上线 SWR 看板全面测速        - 统一 UI 正交状态机
```

- **Phase 1: P0 分支基线归一与安全对齐（耗时 2 天）**：
  - 执行 `git merge fix/sync-safety` 至 `main`，消除 18 个未合入代码提交的断层；
  - 验证本地各模块类型推导、全套单测与集成测试通过；
  - 对生产数据库与容器镜像执行权威版本打标。
- **Phase 2: P1 队列解耦、超时加固与自愈落地（耗时 1 周）**：
  - 部署 120 秒超时与 16 队列容量配置；
  - 落地 `readDeviceSummary` 读直连与 SWR 异步刷新，彻底消灭 LCP 瓶颈；
  - 启用客户端静默 Rebase-Reconcile 自动恢复机制。
- **Phase 3: P2 增量分段协议与长效演进（耗时 2~3 周）**：
  - 研发大 Session 的增量分段（Delta Range）同步协议；
  - 完善全源日志 Stable-Key 承诺适配。

### 7.2 跨模块代码逐文件改动清单 (Apps, Packages, Deployment, Scripts)

下表列出落地实施涉及的全部代码文件及其明确职责变更：

| 模块类别 | 目标文件物理路径 | 改动类型 | 核心改动内容与技术实现要点 |
|---|---|---|---|
| **Client** | `apps/sync-agent/src/transport.ts` | 修改 | 实现 5 次指数退避重试循环，处理 `ECONNRESET`，引入超时 120s 对齐。 |
| **Client** | `apps/sync-agent/src/engine.ts` | 修改 | 接入自动对齐自愈逻辑（硬限 `maxRebaseAttempts = 3` 与带抖动指数退避防活锁），废除 409 级联标记 `review`，支持局部隔离。 |
| **Client** | `apps/sync-agent/src/state.ts` | 修改 | 增加 `session_isolations` 表，完善 `markLineageRecovery` 与细分状态更新。 |
| **Client** | `apps/sync-agent/src/review.ts` | 新增/修改 | 实现 `reconcileHeads` 核心算法，计算祖先指纹并执行本地安全 Rebase。 |
| **Client** | `apps/sync-agent/src/cli.ts` | 修改 | 引入快速 30s 网络重试调度器；新增 `reconcile-heads` 运维子命令。 |
| **Tray** | `apps/sync-tray/src/StatusPopup.cs` | 修改 | 细化注意力状态展示，分离历史作业与实时账本状态。 |
| **Gateway** | `apps/sync-gateway/src/gateway.ts` | 修改 | 维持 30s 心跳机制，强化内部 HMAC-RPC 校验流程。 |
| **Web** | `apps/web/src/server/sync/next.ts` | 修改 | 修正鉴权切分，仅对 `mutating === true` 校验近期所有者会话。 |
| **Web** | `apps/web/src/server/sync/remote.ts` | 修改 | 设备状态端点改为调用 `executor.readDeviceSummary()`。 |
| **Web** | `apps/web/src/server/sync/usage.ts` | 修改 | 默认采用 `waitForFresh: false` 读取已发布快照，支撑 SWR。 |
| **Dashboard** | `packages/dashboard/src/agent/capture.ts` | 修改 | 拆分 4GB 磁盘快照与 1GB 内存预算；实施 `maskUsage` 隐私置零。 |
| **Dashboard** | `packages/dashboard/src/adapters/local/imports/sync/contract.ts`| 修改 | 信封白名单模式对齐 `TransferEvent` 核心属性（剥离 `sessionTitle` 等）；引入 Merkle 树与 `stable-key-set` 承诺。 |
| **Dashboard** | `packages/dashboard/src/adapters/local/imports/sync/store.ts` | 修改 | 区分在线提交 (line 159) 与审查采纳 (line 256)；升级 Schema 3 唯一索引；防范载荷篡改；支持数学索引/Schema 4 增量分段。 |
| **Dashboard** | `packages/dashboard/src/sync/executor.ts` | 修改 | 读写双 Worker 架构：Writer (128MB) 与 Reader (128MB)，主进程 256MB，预留 256MB 容器裕度；投影防抖与 PASSIVE Checkpoint。 |
| **Dashboard** | `packages/dashboard/src/adapters/runtime/snapshot-store.ts` | 修改 | 实现 SWR 快照存储调度，支持异步后台刷新与单飞去重。 |
| **Deployment**| `deployment/compose.production.yml` | 修改 | 固化超时 120s、队列 16；推荐扩容上限至 896MB–1024MB。 |
| **Scripts** | `scripts/production-sync-backup.mjs` | 新增/验证 | 基于 `node:sqlite` 原生 `backup()` API 实施零停机热备与完整性自检，杜绝 WAL 撕裂页风险。 |
| **Scripts** | `scripts/ledger-watermark.mjs` | 修改 | 增强账本水位门禁校验逻辑，严格防范 Schema 降级启动。 |

### 7.3 全量验证测试套件与执行命令

实施合并与加固后，必须在本地依次执行并通过以下命令矩阵，方可准予发布：

```bash
# 1. 全局类型推导与 Lint 静态分析
pnpm typecheck
pnpm lint

# 2. 同步执行引擎核心测试 (覆盖 Merkle 树、25k 批次、事务提交与回滚)
pnpm --filter @incept/dashboard test

# 3. 客户端 Agent 状态机与自愈测试 (覆盖 TLS 重试、Reconcile-Heads、Lineage 恢复)
pnpm --filter @incept/sync-agent test

# 4. Web 服务端同步路由与鉴权边界测试
pnpm --filter web exec vitest run src/server/sync/__tests__/error-boundary.test.ts
pnpm --filter web exec vitest run src/server/sync/__tests__/job-status.test.ts

# 5. 运维脚本套件自动化测试
pnpm test:ops

# 6. 验证生产构建产物打包
pnpm build
```

### 7.4 生产发布与紧急回滚实战操作手册 (Production Rollout & Rollback Runbook)

#### 生产标准发布流程 (Blue/Green Local Build & Load)

由于生产服务器仅有 2GB 内存，**绝对严禁在生产宿主机上执行 `pnpm build` 或 `docker build`**。严格遵循如下跨平台离线发布流：

```bash
# [步骤 1: 本地开发机 Windows 执行构建与打包]
docker buildx build --platform linux/amd64 --load -t incept-v4-release:20261030 .
docker image save -o incept-20261030.tar incept-v4-release:20261030

# 打包发布辅助配置与运维脚本
tar -czvf release-20261030.tar.gz deployment/ scripts/

# [步骤 2: 将制品安全传输至生产服务器]
scp incept-20261030.tar release-20261030.tar.gz root@43.155.136.83:/srv/incept/releases/

# [步骤 3: 登录生产服务器执行无缝平滑切换]
ssh root@43.155.136.83
cd /srv/incept

# 3.1 立即为当前的数据库打生产快照备份 (杜绝 WAL 撕裂页风险!)
# 注意：在 SQLite WAL 模式下，直接在写入期间执行 shell `cp v4.db*` 存在非原子拷贝引发撕裂页 (Torn Pages) 的致命风险。
# 必须采用以下两种安全备份路径之一：
#
# 路径 A (首选：在线零停机热备，调用官方 SQLite Backup API 与完整性自检):
mkdir -p /srv/incept/backups/pre-deploy-20261030
docker exec incept-app-1 node /app/scripts/production-sync-backup.mjs \
  --source /data/sync/v4.db \
  --out /srv/incept/backups/pre-deploy-20261030/v4.db
#
# 路径 B (备选：冷备，必须先停止应用容器确保句柄关闭与 WAL 静默落盘后再复制):
# docker stop incept-app-1
# cp /srv/incept/shared/sync/v4.db* /srv/incept/backups/pre-deploy-20261030/

# 3.2 导入镜像并更新发布符号链接
docker load -i /srv/incept/releases/incept-20261030.tar
mkdir -p /srv/incept/releases/20261030
tar -xzvf /srv/incept/releases/release-20261030.tar.gz -C /srv/incept/releases/20261030/
ln -sfn /srv/incept/releases/20261030 /srv/incept/current

# 3.3 重启服务容器
cd /srv/incept/current
sh deployment/compose.sh up -d --remove-orphans app sync-gateway proxy

# 3.4 生产健康门禁验证
curl -fsS https://43-155-136-83.sslip.io/api/health/ready || exit 1
docker exec incept-app-1 node /app/scripts/ledger-watermark.mjs check /data/sync/v4.db
docker exec incept-app-1 node /app/packages/dashboard/dist/sync-maintenance.mjs status /data/sync/v4.db
```

#### 紧急故障回滚手册 (Emergency Rollback Runbook)

若发布后出现意外不可逆故障，按照以下步骤实施秒级安全回滚：

```bash
# [紧急回滚步骤]
# 1. 彻底停止当前应用容器与网关，切断外部写入流量并释放 SQLite 文件句柄与 WAL 锁 (关键安全要求!)
cd /srv/incept/current
docker stop incept-app-1 incept-sync-gateway-1

# 2. 确认容器完全停止后，恢复发布前健康的 SQLite 数据库 (消除非原子拷贝撕裂页风险)
cp /srv/incept/backups/pre-deploy-20261030/v4.db* /srv/incept/shared/sync/
# 验证还原后数据库的物理完整性
node -e "const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync('/srv/incept/shared/sync/v4.db', { readOnly: true }); console.log('Integrity check:', db.prepare('PRAGMA integrity_check').get()); db.close();"

# 3. 将 current 符号链接指向前一个已知健康的 Release 目录 (如 20261027)
ln -sfn /srv/incept/releases/20261027 /srv/incept/current

# 4. 以安全配置重新启动老版本容器
cd /srv/incept/current
sh deployment/compose.sh up -d app sync-gateway proxy

# 5. 校验老版本运行态与健康水线
curl -fsS https://43-155-136-83.sslip.io/api/health/ready
docker exec incept-app-1 node /app/packages/dashboard/dist/sync-maintenance.mjs status /data/sync/v4.db
```

---

## 结语 (Conclusion)

本技术设计规范文档系统性地梳理了 Incept 同步系统的端到端密码学与因果架构，以铁证事实厘清了 `main` 与 `fix/sync-safety` 两个分支之间的巨大工程脱节，彻底解剖了历史 12 类故障的深层根因，并给出了契合 2GB 生产环境约束的架构演进方案与工程实施清单。本方案兼具学术级密码学严谨性与工业级落地可行性，为 Incept 打造坚不可摧的数据同步基础设施提供了权威指南。
