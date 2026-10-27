# 生产部署准备草案：独立远端 r5 验收与 Plan A

> 已被用户的固定快照发布策略取代。本文件保留历史方案，不再执行远端独立验收、额外资源门槛或种子环境构建。当前范围见 `docs/current-task/2026-10-20-final-release.md`：本机构建冻结，生产仅替换App并展示固定快照，正式Agent继续停止。

2026-10-20，Asia/Singapore。已合并本地验收、state 副本迁移重演及今日远端只读预检。**发布 NO-GO，正式 Agent 保持停止。**远端部署、生产切换、正式授权变更和最终 Agent 启动须分别列明范围后申请授权。

## 已关闭与当前门槛

| 项目 | 当前结论与后续用途 |
|---|---|
| v4 历史离线对账 | 359 scopes / 359 receipts，差异 0，已关闭；引用既有证据，不重新遍历或导出 |
| 本地隔离 r5 | 三服务及外网隔离通过；25 笔合成收据覆盖离线、断线、ACK 丢失和重启续传 |
| 正常真实 usage | Codex 63 条 / 6,488,740 Token；Antigravity 124 条 / 13,378,243 Token；原 187 条 PASS 保留 |
| Auto-review | 按用户确认的精确会话来源标记 `codex-auto-review-unpriced`；已验证 454 条 / 57,624,007 Token、454 条 unknown pricing、价格 null、收据及记录匹配、重复 sent=0；不继续调查原 365 条 reset 描述 |
| 两份开头缺失会话 | 继续会话级隔离，25,459,535 个前缀累计 Token 不归入任何日期或批次；原日志保留 |
| 其余五来源 | 等待真实新增 usage，不主动发起付费调用，不用合成数据替代真实覆盖 |
| 正式 state 副本迁移重演 | 39/39 旧 heads 相同，未解决 head 0、receipt 冲突 0；两批 review 的 72 条全部被既有 v4 精确覆盖，完整归档保留，待 Owner 确认处置 |
| 正式七来源授权与 Owner | 尚未具备最终审批证据；测试设备七来源授权只用于独立验收 |

真实来源与 Auto-review 证据分别见 `docs/current-task/2026-10-19-real-source-acceptance.md`、`output/r5-auto-review-acceptance.json`。本地服务证据见 `docs/current-task/2026-10-19-local-r5-execution.md`。这些结果不产生远端部署状态。

## 制品身份与版本冻结

原 r5 App 的固定身份链如下；三种 digest 分别核对原始 JSON 哈希及引用关系，不相互当作同一种 Docker Image ID：

| 对象 | 固定值 |
|---|---|
| Manifest List / OCI Index | `sha256:cc705ce22cea38b1a8c01cea28fe1e1dd2ca6cbae500516f00eaee6c497d6685` |
| Linux/amd64 Manifest | `sha256:c13ed6a558e76432d8b10eff170c618cd61930f91a16d6b32cad02f2a5cad9cc` |
| Image Config | `sha256:eebc98b3a47bccf76cff462d8cbdc027309d4d5dabb470ba3fdc4835a12fbc38` |
| 原归档 | `output/incept-r5-original.tar`，369,071,104 bytes；SHA256 `e4aff06146629725e714ef537d22342abe4393e1cca1081a0f1ab6324d639e60` |
| 镜像证据文件 | `output/r5-image-evidence.json`；SHA256 `636656d37553e6f8820c9504d662acf99085828bc2417cd4f262e00e25ad2761` |
| PostgreSQL | `postgres:16-alpine@sha256:4e6e670bb069649261c9c18031f0aded7bb249a5b6664ddec29c013a89310d50` |
| 入口运行时 | `node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20` |

本地已验证可运行 App 引用为 `incept-sync-trusted@sha256:cc705ce22cea38b1a8c01cea28fe1e1dd2ca6cbae500516f00eaee6c497d6685`。远端导入后先核对三层身份与 rootfs，再选择该引擎实际可解析的不可变引用；缺少 RepoDigest 时可使用已经分类验证的顶层 `.Id`，不得把 Config ID 拼成仓库 manifest 引用。

源码基点为 `37599b147bb961f5d91e15fa6e1dfcdc6aecdbff`，当前包含未提交政策变更。**原 r5 镜像、当前 Agent 构建和当前源码是三个制品。**原 r5 不会自动包含新增的 pricing helper；本地已实测新模型名在原 r5 下按 unknown pricing 处理。若选择构建包含 helper 的新 App，必须另建候选名、归档与身份图，并重做受影响的版本验收，不复用原 r5 digest 标签。

本草案读取时的候选文件哈希（后续任何重建均重新冻结）：

| 文件 | SHA256 |
|---|---|
| `deployment/compose.v4-acceptance.json` | `015bed70be15472446b42fdd2e2d407f13076a30dc13b96cfd30996ae45f63b1` |
| `deployment/v4-http-entry.mjs` | `a0bc5f061fb14156ff2cb939a7821b6fcd69db91186ff67a7c370115ba64af37` |
| `apps/sync-agent/dist/library.mjs` | `e43560be28c124350ff4f7903bb0ed68f76b8dc77ca957d2e932db15f5b33011` |

旧 `output/r5-deployment-review-manifest.json` 为 10 月 19 日快照，包含旧双服务拓扑与旧 Agent 哈希，不能直接批准今天的候选。正式申请前须生成新的完整审阅清单：源码 diff/基点、Agent ZIP 与入口文件、所有校验脚本、Compose、镜像归档及证据、独立数据库快照和迁移候选的 SHA256；同时记录 Node/pnpm 版本、测试结果、构建时间。未冻结的 ZIP 不提供推测哈希。

## state 迁移重演：先完成审阅

重演只读取旧正式 state 的独立副本与已验收 v4 state 副本，输出新的 candidate，不写正式目录、不启动正式 Agent。保护输入的 state/config/credential 文件前后指纹，候选使用验收 endpoint 与隔离凭据，禁止携带生产 endpoint 自动上传。

1. 对旧 39 heads 分类：相同 head、不同 generation、同 generation 但 manifest 改变、v4 缺失或身份冲突。变化项逐个提交证据，不能仅凭 v4 库完整就覆盖旧父链。
2. 两批 Outbox review 分别保留原 batch、原因、原记录与审阅状态；归档不等于已解决。逐批给出“已被可靠收据覆盖”“继续隔离”“等待 Owner 决策”等实际处置，禁止删记录或制造 receipt 清空 review。
3. 若 receipt 同 batch 内容冲突、scope 身份冲突或未证明的前进覆盖，立即停止迁移并报告。候选中 pending review 的数量和原因必须进入上线门禁。
4. 本地主机重开 candidate 并验证其可读、父链来源、隔离 ledger 与迁移 provenance；不得以重新执行已关闭的 359/359 全量对账代替旧 state 衔接审阅。
5. 实际重演已完成，输入文件前后指纹一致。结果为 `prepared_pending_review`，不是正式切换就绪；详见 `docs/current-task/2026-10-20-state-migration-rehearsal.md`。Owner 待审具体处置：Claude Code 67 条、ZCode 5 条已被 v4 精确覆盖，保留旧 batch 与 records 归档，不再放入候选活跃上传队列，不制造旧 batch committed receipt。

## 远端资源选择与只读前置检查

最新远端只读观测为 **2026-10-20 00:24（Asia/Singapore）**，证据 `output/r5-production-preflight-2026-10-20.json`：可用内存 1,088,188,416 bytes，约 **1.01 GiB，低于 1.5 GiB 门槛**；磁盘门槛通过，3305 未监听。Docker Engine 29.9.0 / Compose 5.6.0。生产 v2 App、Caddy、sync-gateway、PG 均 running/healthy，restart=0；App 镜像仍为 `sha256:e4b13d8ca5bfb3779eff1b8d65e44a364506e7e7732727ee1cac91733f2e8276`。

旧 `incept-staging-app` 仍运行，root 身份，并与生产共挂 `/srv/incept/import-20261014/shared` 可写目录；新隔离项目必须避开该挂载。旧辅助 `incept-recovery-validation-20261014-postgres-1` 已 exited，保留 unhealthy 状态；未修复或启动。预检没有执行远端变更。单独停止旧 staging 预估释放约 137 MiB，仍不足；不得通过停止生产服务获得资源。

优先候选为扩容当前主机，或使用另一台隔离验收主机。停止旧 staging、扩容及新主机费用/配置均另行批准。今日只读资源与身份复测已完成，当前停在资源门槛，不执行部署。

以下为授权后在目标 Linux 主机执行的命令模板，尖括号必须由审阅清单中的确切值替换。此处未执行：

```sh
set -eu
docker version
docker compose version
uname -m
free -b
df -B1 /srv
docker ps --no-trunc --format '{{.ID}} {{.Names}} {{.Image}} {{.Status}} {{.Ports}}'
docker stats --no-stream --format '{{.Name}} {{.MemUsage}} {{.CPUPerc}}'
ss -ltnp
docker volume ls --filter label=com.docker.compose.project=incept-v4-acceptance
docker network ls --filter label=com.docker.compose.project=incept-v4-acceptance
test "$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)" -ge 1572864
test "$(df -B1 --output=avail /srv | tail -n 1)" -ge 2147483648
```

至少 1.5 GiB 可用内存、2 GiB 工作盘余量；归档、数据库副本、备份与日志若超过该盘余量，按实际制品预算提高要求。检查 3305 未占用、架构为 linux/amd64、项目及卷无未经核实的重名。记录生产 App/Caddy/PG 的确切容器 ID、镜像 ID、挂载和状态作对照；inspect 仅保存所需字段，禁止输出整个含秘密的环境。

## 独立远端 staging 部署模板

部署申请只涵盖独立 staging，沿用本地验证的三网络结构：App/PG 在 internal acceptance；App/entry 在 internal app_entry；仅 entry 接普通 ingress 并发布 `127.0.0.1:3305`。entry 固定转发 App3000、关闭 IPv4/IPv6 转发、不连接 PG、不挂秘密；App/PG 无发布端口和外网默认路由。不得直接修改生产 Caddy。

目标私有目录建议 `/srv/incept/v4-acceptance/20261020-r5`，0700。传输经审阅的原镜像与已有独立副本，不重新导出生产数据库，不挂生产 shared 可写目录。秘密以独立受控通道注入；复用既有验收身份需批准其安全传输，任何凭据值均不进入 Git、终端日志或审阅文件。

项目名保持 `incept-v4-acceptance` 以复用现有校验器；在同一主机如已有该项目先停止申请、核实归属，不改名绕过校验。三个新主机独立卷的来源、填充方式与快照哈希必须在申请中列明；不能把缺失卷自动创建为空库后当作恢复成功。

```sh
set -eu
umask 077
install -d -m 0700 /srv/incept/v4-acceptance/20261020-r5
cd /srv/incept/v4-acceptance/20261020-r5
# 此前通过受控传输放入经审阅制品、SHA256SUMS 和独立 env；不在命令行展开秘密。
sha256sum -c SHA256SUMS
docker load -i output/incept-r5-original.tar
python3 scripts/archive/prepare-r5-image-evidence.py \
  --archive output/incept-r5-original.tar \
  --image '<已验证可运行的r5不可变引用>' \
  --output private-remote-image-evidence.json
node scripts/archive/check-r5-image.mjs private-remote-image-evidence.json
docker compose --project-name incept-v4-acceptance --env-file private/acceptance.env \
  -f deployment/compose.v4-acceptance.json config --format json > private/compose.rendered.json
node scripts/check-v4-isolation.mjs private/compose.rendered.json
```

校验工具依赖已冻结的 `apps/sync-agent/dist/library.mjs`；Node 24.15+ / <25 与 Python 必须预先具备，缺工具则停止，不临时联网安装。Compose 的 entry bind 是部署目录中的单个只读代码文件，校验脚本与配置必须保持相对布局。`private/compose.rendered.json` 含秘密，0600，禁止打印或复制到普通 output。

**启动前额外必需的种子门槛**：独立 SQLite/PG/秘密卷已按经审阅的“已有独立副本填充方案”准备完成，快照 hash、数据库身份、应用角色非超级用户、独立凭据来源均匹配；未出现生产目录挂载或生产 DATABASE_URL。该填充方案及命令尚需随完整制品包冻结，禁止跳过门槛直接执行下列 up。不能在远端重跑会生成新身份或重新导出的初次 setup 脚本。

只有种子门槛、资源门槛和隔离 render 全部通过，且用户已批准远端启动后：

```sh
docker compose --project-name incept-v4-acceptance --env-file private/acceptance.env \
  -f deployment/compose.v4-acceptance.json up -d --wait --pull never entry
docker compose --project-name incept-v4-acceptance --env-file private/acceptance.env \
  -f deployment/compose.v4-acceptance.json ps
curl --fail --silent --show-error http://127.0.0.1:3305/api/health/ready
```

不使用生产 Caddy 临时转发。需要外部验收时，另开 loopback SSH 隧道：

```sh
ssh -N -L 127.0.0.1:13305:127.0.0.1:3305 '<经核实的目标SSH别名>'
```

启动后先核对实际 runtime Ports 只有 entry 的 127.0.0.1:3305、三网络成员/internal 标记、forwarding=0、App/PG 无 IPv4/IPv6 默认路由、外部 TCP/DNS 探测被阻断；再核对 HTTP Ready、测试设备及数据库名/应用角色、镜像身份、SQLite 实际路径。服务身份与数据库身份一致后才进入已批准的远端 E2E。远端首次入口与资源/重启验收使用独立测试 scope，不改旧 359 基线；已有本地真实验收结果直接引用。遇到新数据一致性问题停止并报告。

## 回滚与生产切换顺序

远端部署授权应同时包含仅本项目保留卷回滚：

```sh
cd /srv/incept/v4-acceptance/20261020-r5
docker compose --project-name incept-v4-acceptance --env-file private/acceptance.env \
  -f deployment/compose.v4-acceptance.json down
docker volume ls --filter label=com.docker.compose.project=incept-v4-acceptance
```

不加 `--volumes`，不执行 prune、volume rm 或数据库回灌。关闭本次隧道，保留独立卷、快照与诊断；核对生产三服务 ID/镜像/挂载/状态未变。若身份、资源或隔离门槛失败则不启动；已启动后的异常按批准范围回滚并停止后续操作。

Plan A 严格顺序为：**迁移候选审阅与副本重演 → 独立远端 staging 验收 → 正式七来源授权和 Owner 确认 → 单独申请正式迁移及切换 → 执行迁移、必要的候选衔接验收与服务切换 → 最后单独申请启动正式 Agent。**正式切换前必须另写确切 Caddy/App 配置变更、正式 state 原子替换和备份位置、凭据/设备衔接、回滚触发条件；本草案不包含这些生产写命令。

申请远端操作前仍须补齐：两批 review 的 Owner 处置确认、满足资源门槛的目标主机与预算、最终制品/数据哈希清单及种子卷填充命令、正式七来源授权。迁移重演与今日资源/容器预检已有实际证据。最终部署包随具体主机冻结后再提交明确范围的部署申请；正式 Agent 继续停止，发布保持 NO-GO。
