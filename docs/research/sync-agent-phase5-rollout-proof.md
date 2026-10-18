# Sync Agent Phase 5：上线准备与隔离验收

日期：2026-10-17。生产操作：**未执行，等待 Owner 一次批准**。范围为本地代码、正式部署模板、Windows ZIP 与隔离完整站点。原始数值见 [phase5-evidence.json](sync-agent-phase5-evidence.json)，执行步骤见 [production rollout runbook](../runbooks/sync-agent-production-rollout.md)。

## 分项结论

| 阶段 | 结论 | 已交付与边界 |
|---|---|---|
| P5-A 产品体验 | PASS | 真实 Edge 两个独立上下文点击 Refresh；持久 Job、真实上传、committed receipt、revision 和页面统计变化；离线、冲突入口、三个时间及原进度条 |
| P5-B 部署配方 | PASS（隔离） | 正式 Dockerfile 全站构建及生产依赖裁剪；正式 Compose/Caddy 路由（Nginx 仅保留为非生产可选模板）、内部 Gateway、文件秘密、默认关闭、单设备 canary、Windows ZIP；生产目标待批准后核对 |
| P5-C 迁移与灰度 | PASS（合成数据） | 一致性 SQLite backup、PG dump/restore；真实旧 loader 对照、三窗口全对象零差异、二次重放；实际生产数据对账是 v2 切换硬门槛 |
| P5-D 容量保护 | PASS（首批单设备范围） | 20k 准入、队列/磁盘/内存/DB 容量保护、有界 checkpoint；一次普通规模并发+重启，零 OOM；70k/多设备不纳入首批 |

整体：**CONDITIONAL**。本地功能与隔离发布验收完成；上线需 Owner 批准、封存最终 release、核对生产资源与备份、完成真实 v1 对账及历史认领授权。v2 对账门槛失败时保持 v1 读取，独立上传按来源审阅契约处理。

> 2026-10-18 Caddy 修订：生产实际 proxy 是 Caddy；新增 `/api/sync/ws` → `sync-gateway:3101`，公网 internal/RPC/health 404；Nginx 仅保留为非生产可选模板。生产部署前以新的修订 Release 为准。

## 工作树与版本

主仓库 `D:/Desktop/code/code/Incept` 的 Docs/交接文件由其他 Agent 提交，未 reset/stash/切分支或覆写。Phase 5 位于 `.worktrees/sync-agent-phase5`，分支 `feature/sync-agent-phase5`，起点 `834f8a9`。主干随后到 `1a44da2236b69dca79f7982ccea0b3f1d2f24d81`；其 30 个文件通过共同祖先 `aef64f4` 三方整合到隔离树。唯一 toolbar 冲突保留主干紧凑布局、短进度条、无锚点导航及本轮同步状态/三个时间。主干历史测试的变化来自该已提交样式变更，本轮没有降低其断言。

Operations 路由/feature 原样取自 `feature/operations-console`，用于完整站点兼容验收；仍是公开 mock 原型，未新增导航入口或真实监控权限。未合入的其他导航/样式分支保持原位。交付未自动提交或推送。

环境：Windows，Node 24.21.0，pnpm 10.30.3，Docker Desktop Linux/cgroup v2，Node 24.21.0-bookworm-slim；锁文件 SHA256 `a58fecf02018bc6374a802cff8f0b49d4bdd7be88e68107c62e6e2d946a0c1cf`。隔离依赖按 frozen-lockfile 安装，未修改依赖图。最初 Prisma CDN TLS 中断，正式镜像使用同锁版本 6.19.3 的既有 Linux 引擎缓存，校验版本/哈希后 generate，详见 runbook。所有原类型/lint/测试/build 门禁保留。

## 关键实现与 Schema

- Dashboard 默认 300 秒、允许 600 秒；隐藏暂停、恢复查询。remote 模式 Refresh 创建持久 Job；阶段显示在线/离线、请求、采集、上传、提交、无变化、部分、审阅、失败/过期。采集/上传来自已鉴权遥测；终态来自服务器核验。
- Agent 最后采集、云端最后提交、网页最后更新分别显示。新增 SQLite `sync_receipt_clock(device_id,batch_id,committed_at)` 和查询索引；clock 与 receipt/可见 generation/revision 同事务提交。旧 receipt 时间未知显示空值，不以 Job 完成时间代替 commit。
- Owner Settings 提供脱敏冲突列表：source、session 摘要、code、旧结果保留及维护步骤；未开放 Shell 或解除 rollback 栅栏。
- 单一维护 CLI `dist/sync-maintenance.mjs`：backup/status/reviews/review/migrate-v1/shadow-check/compare/adopt-exact/adopt-reviewed/resolve-review/maintain。写操作要求 Owner 明确确认及 reason，历史认领须固定 device/manifest/legacy-batch；恢复重试验证当前 head 和 committed receipt。
- 默认 `INCEPT_SYNC_ENABLED=0`、`INCEPT_SYNC_REMOTE_ENABLED=0`、`READ_MODE=v1`。独立 `/data/sync/v2.db`，v1 imports 保留。无 Phase 5 PG 新迁移；runbook 包含尚待生产执行的 AgentDevice/SyncJob 两项迁移。
- HMAC 文件注入、单 UUID canary、内部网络 Gateway，无宿主端口；Caddy 443 WSS Upgrade、公开 internal/RPC/health 路径 404；Nginx 模板仅作为非当前生产的可选备份。
- 新 upload begin/stage 受 20,000 记录/队列4/per-device2、2GiB free disk、4GiB DB+WAL+SHM、85% cgroup memory 限制；429/503+Retry-After，receipt 查询及已持久 commit 恢复保留。Worker old heap256MiB、SQLite cache8MiB/mmap0；操作间隙 checkpoint，busy_timeout0，busy 退避30秒。
- Windows ZIP 固定 dist/windows 目录；保留 DPAPI+DACL 凭据、outbox、5分钟调度。`export-review`/`resume-reviewed` 只能停机维护；不越过 head/rollback 栅栏。未安装登录任务。

## 测试命令与结果

以下从隔离工作树执行；Dashboard 命令在 `packages/dashboard` 中。日志位于主仓库 `.scratch/sync-agent-phase5/`，只保留本地，不提交私密测试环境。

| 命令 | 结果 |
|---|---|
| `node ../../apps/web/node_modules/vitest/vitest.mjs run` | Dashboard 40 文件、473 PASS，包含 Phase 0/0B/0C/1/2/4/5 |
| `node apps/web/node_modules/vitest/vitest.mjs run --root apps/web` | 整合后 Web 120 PASS、55 gated skip，27文件通过/5跳过；含 Docs、Music、Operations 原测试 |
| `node apps/web/node_modules/vitest/vitest.mjs run --root apps/web src/server/auth/__tests__/owner-db.integration.test.ts` | 专用 PG Owner 28 PASS |
| `node apps/web/node_modules/vitest/vitest.mjs run --root apps/web src/server/sync/__tests__/integration.test.ts` | 专用 PG 上传 15 PASS，含100次重试 |
| `node apps/web/node_modules/vitest/vitest.mjs run --root apps/web src/server/sync/__tests__/remote.integration.test.ts` | Windows真实 WSS/HTTPS/PG 7 PASS，含轮换、吊销、离线与持久恢复 |
| `node apps/web/node_modules/vitest/vitest.mjs run --root apps/web src/server/sync/__tests__/agent.integration.test.ts` | Windows真实 HTTPS/PG 3 PASS、五分钟计时1 skip；ACK丢失、Worker重启、Windows生命周期 |
| `node tools/build.mjs` + `node --test tests/*.test.mjs`（apps/sync-agent） | Windows 15 PASS；脚本 parse、默认安装/卸载零变更、单实例/恢复/审阅 |
| Gateway `node --test tests/*.test.mjs` | 2 PASS |
| `node --test scripts/production-*.test.mjs` | Windows 9 PASS、1 Linux-only skip；Linux 正式构建执行该测试 |
| `pnpm --filter @incept/music test` | Vitest195 + core73 PASS |
| `pnpm --filter @incept/roadmap test` | 71 PASS |
| `pnpm typecheck` / Agent与Gateway各自 `tsc --noEmit -p tsconfig.json` | 完整与专用类型检查0诊断 |
| Web `pnpm lint` / 变更文件 ESLint | 0 error；Web原有12 warning，变更集1条为主干 notes 未使用导入 |
| `docker build --progress=plain --target runtime -t incept-sync-phase5:release-01a1447b .` | 正式 Dockerfile：Prisma生成→workers/Agent/Gateway/maintenance→typecheck/lint/tests/ops→Next build→生产依赖离线裁剪 |

普通 Web 的55跳过按环境门控：Owner28、上传15、remote7、AgentHTTP4、fullsite1；前四组已单独用真实 PG 执行，五分钟计时1项保持跳过；fullsite由下述真实浏览器替代 gated自动用例。各组分别在新建的 incept_owner_auth_phase5 / incept_sync_phase2 / incept_sync_phase4 / incept_sync_phase3 中运行，DATABASE_URL与相应 INCEPT_*_TEST_DATABASE_URL一致；随机Owner key及测试CA只通过环境注入。未重跑真实五分钟计时基准。

隔离 fresh Prisma/dependencies 的 Web、Dashboard src/node/full TS 基线均0，最终仍0，逐行新增/删除诊断均0。历史其他环境的36/111诊断不作为本工作树的当前基线。最初受限 sandbox 导致 Vitest 缓存 ENOENT、PowerShell/rename EPERM；在同一隔离树以获准的本地子进程权限重跑通过。未调整断言来绕过环境错误。

最终完整 `pnpm typecheck` exit0；逐行诊断记录在本地 `type-diagnostics-diff.json`：baseline=[]、final=[]、added=[]、removed=[]。专用Dashboard src/node与Agent/Gateway检查exit0。`git diff --check` 唯一输出为主干原样导入的 `apps/web/src/app/globals.css:198` EOF空白行；Phase5新增/调整文件无空白错误，未顺带改写该样式文件。

## 真实浏览器、HTTP 与恢复

实际完整 Next production 产物、正式 production-start、生产 Compose/Caddy 模板（Nginx 仅保留为非生产可选模板）。专用 project `incept-phase5-01a1447b`，TLS `https://localhost:18555`，独立 PG/v1/v2，App hard limit768MiB。实际 Edge 两个独立 Owner 上下文，第三个无 Cookie 公开上下文；仅钉住测试证书 SPKI，不改系统信任或关闭应用 TLS。

1. Windows真实采集 Claude15,700+Gemini2，初始 rev2/2,041,260 Token。浏览器点击按钮，Job `d8a85d0a...` 经采集/分页/receipt→rev3，网页2,041,390，三个时间更新。
2. 第二浏览器追加100条，Job `d075bfde...`；在 SQLite staging offset3000 时重启真实 Next App，恢复原批次提交→rev4/2,054,390，页面从2.04M变2.05M。
3. Gemini从2条改成1条，Job `16990291...` review_required/PREFIX_LOST，旧200用量保留，rev4及总量不变。实际点击 Account/历史冲突按钮显示 source/摘要/错误/旧数据保留，无原会话正文。
4. 一处冲突保留的同时，追加1条Claude；Job `f9f9182e...` 于13:35:49.633Z创建，13:35:51.449Z开始，13:36:12.356Z结束，rev5/2,054,520。13:35:49.377–13:35:58.624Z持续访问真实Docs/Music/Operations45次，明确与上传重叠，零错误，P50=17.1228ms/P95=44.5338ms。
5. 正常停止 Windows Agent 后浏览器 Refresh 显示 offline，既有2,054,520保留。真实非 canary设备403并吊销，公开Job403、internal404、RPC404。Owner管理过期验证返回428；普通刷新继续使用有效Owner session。
6. 真实SQLite backup API在live WAL环境生成44,945,408字节一致副本，integrity=ok，恢复后revision5/receipts6/current15,804相同。PG pg_dump→新restore库，devices2/jobs5相同。备份没有以单.db文件copy替代。

浏览器步骤可复现：构建/启动隔离模板；`packages/dashboard/tools/phase5/browser-setup.mjs prepare`；保持 `serve` 父进程；分别在独立Edge context载入私有合成Owner Cookie；访问 `/en/dashboard`，按钮 Refresh now；`append 100` 后再点；staging时重启app；`conflict` 后再点；进入 Account 查看；`stop` 后再点。身份来自隔离PG真实Owner/设备服务，fixture seed 无 HTTP入口且严格限定专用PG hostname/dbname。

最终正式裁剪镜像 `incept-sync-phase5:release-01a1447b`，本地 image ID `sha256:e653e45103b2981a09f99b27a000f862915e1ca9f0b5ca738ea3f1a65af358cd`，369,937,767字节。使用同一持久测试卷重建后全部health通过；vitest/dev依赖与离线引擎缓存目录已移除，两个真实worker产物存在。真实Owner浏览器再次读取 Token2,054,520/rev5、三个时间与无锚点紧凑布局，截图 `phase5-release-smoke.png`；maintenance status只输出一份JSON，revision5/receipts6/reviews1。

镜像与当前工作树806份代码/配置逐文件SHA核对：805相同，唯一差异为Next构建自动生成的 `apps/web/next-env.d.ts`，其余运行时代码无差异。证明文档在构建完成后写入，不作为镜像代码一致性的比较对象。

最终 Windows ZIP SHA256 `bd13c46ba070dc7ec4047c2f041f9d4cb70ef73289cac11c33ee5eb52df7eb67`；解压后执行 version/status成功。正式Linux镜像Agent测试13通过/2项Windows专用跳过，Windows本机15全部通过；Linux ops10全部通过、Windows ops9通过/1项Linux专用跳过。

截图位于 `output/playwright/phase5-refresh-completed.png`、`phase5-after-restart.png`、`phase5-owner-review.png`。测试用 Node APIRequest TLS 失败曾在诊断中包含**合成测试Cookie**；该session立即吊销，改用浏览器fetch避免输出headers。生产凭据未参与。最终测试session与Agent按清理步骤停用。

## 影子差异与修复记录

七真实collector的合成HOME→旧v1人工Import→immutable shadow→旧loader与projection，7d/30d/all全对象差异均0（只去除 checkedAt 与 sync transport envelope）；Token均910，费用均0.0010149999999999998，历史provenance/排序/updatedAt参与比较。二次重放revision不变。另有既有Phase1/0B双批rollback、legacy/live pricing、Codex累计修订、native优先和adoption测试全部保留。

本轮发现并修复：

- 并行实现尝试自动v1认领，触发原legacy审阅测试失败；已撤销该行为，legacy.ts恢复原实现，只保留明确Owner授予的exact/reviewed认领。设备无法通过新命名空间绕过去重。
- 独立维护模块的auto-main与打包CLI重复执行；移除模块入口，仅保留正式wrapper。影子测试曾只传env对象给runner，旧loader读取process.env导致输入不一致；修正fixture让两者使用同一显式环境，保留全对象比较。取样日界使用旧loader的checkedAt；未忽略updatedAt。
- 真实Gateway测试需要OS端口0，允许测试ephemeral端口，生产默认3101保持。
- Playwright alpha的async waitForFunction提前返回，改为await浏览器fetch的有界轮询，未改产品完成条件。

## 容量与上线限额

普通规模一次连续并发/重启：App重启前peak248,209,408 B=236.71MiB，重启后peak235,757,568 B=224.84MiB，后续current196.32MiB；最大观测值较768MiB余531.29MiB（69.18%）。所有memory.events.max/oom/oom_kill为0。Gateway peak52.05MiB、PG108.31MiB、Nginx17.73MiB。cgroup包含测试docker exec工具短时开销，按重启前后分别计量；详见JSON。

v2 DB44,945,408 B，WAL0，SHM32,768 B；virtual backing free3,052,851,220,480 B，生产磁盘须独立核对。保留全部已提交历史与冲突outbox，未清数据压低内存。测试reader持锁时checkpoint返回busy并保持revision/receipt/adoption/current不变；释放后truncate WAL0。

这组普通规模证据用于首批单设备，70k旧风险继续登记：大包429延期、缩小后续代次/分页、限制并发，资源评估后再扩容。任何OOM、频繁memory.max事件、长期SQLite锁、磁盘不足、Job/outbox停滞按runbook关闭sync并读v1。

## 生产顺序修订（2026-10-17）

Owner 选择方案 A：**先迁移 v1 到 v2、shadow 全窗口零差异、切换 v2 读取，再启动单台 Windows Agent**。Agent 在切换前保持停止，因此 shadow 对照只包含 v1 迁移结果；首轮上传才进入新数据。首轮若与旧 v1 历史重合，必须返回 `review_required` / `V1_ADOPTION_REVIEW_REQUIRED` 并保留旧统计，历史认领只按 Owner 明确的 device UUID/source/manifest/legacy 批次执行，不自动认领全部历史。

新增回归测试 `packages/dashboard/src/__tests__/phase5/release-order.test.ts` 覆盖两种情形：真正新增事件使 v2 图表增加；未认领的 v1 重叠进入审阅且旧统计/revision 不变。Release 从主干 `1a44da2` 重建，Operations 路由与 mock 已排除，不进入发布产物。

## 变更清单与回滚

功能：Dashboard hook/helper/toolbar/messages；Owner SyncDevicesPanel和sync controller/remote；Agent cli/engine/remote/review/package工具；Gateway gateway/main；db agent鉴权canary；SQLite store/审阅摘要；capacity/protocol/executor/worker/secrets/admission；维护runner/CLI/build和fixtures；对应测试。

部署：Dockerfile、gitignore、Compose/Caddy/env模板（Nginx 可选模板保留但不启用）、compose.sh、production-start、sync-config/secret/stage/backup及测试。从主干 `1a44da2` 重建 Release 时保留主干 Docs/样式；**Operations 路由/mock 已按 Owner 决定排除，不在发布产物中**，本阶段不开发 Operations 鉴权。

回滚优先 `sync-stage --stage=disabled --apply --owner-confirm`，停止Gateway和WindowsAgent，重建App读取v1；保留PG新表、v2/receipt/audit/outbox。镜像回到批准前digest，不覆盖其他env；灾难恢复先在新库验证一致备份。完整命令见runbook。

下一步：Owner已批准单设备灰度；先封存不可变 Release、核对生产目标/卷空间，再按“v1迁移→shadow零差异→切v2→启动Agent→首轮上传/历史审阅”分段执行。Operations不进入发布产物；历史认领仅采用Owner明确给定的legacy UUID/source/manifest范围；疑义留待审阅。Windows自启单独明确选择，默认不安装。

收尾已完成：隔离Owner有效session1份及设备2个已吊销；私有Cookie配置删除、control文件Cookie移除，专用Edge关闭，Windows Agent停止。仅在核验项目/容器标签后停止本轮Compose和独立测试PG；保留数据卷、备份、镜像和outbox。主工作树最终HEAD1a44da2且干净，未修改生产或安装登录任务。
