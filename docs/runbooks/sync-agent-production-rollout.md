# Sync Agent 单设备灰度发布手册（Phase 5）

本手册准备完毕后由 Owner **一次批准**执行范围。批准前只在本地/隔离环境执行。本轮尚未连接生产；下列生产命令目前均未执行。`--owner-confirm` / `I_AM_THE_OWNER` 用于记录这一次批准，不要求每一步重新申请。

范围：现有 Incept 实例、既有 Nginx 443、单台明确授权 Windows 设备。保持 v1 人工 Import 和默认读取；先迁移 v1 到 v2，shadow 对账零差异后切 v2，再启动单台 Windows Agent。Windows 登录任务默认不安装；仅在授权单包含自启时运行 `-ConfirmInstall`。

## 0. 封存与执行前只读核对

先把本轮审阅通过的源文件封存为不可变 release commit/校验清单，构建必须从该 commit 的干净工作树执行。Phase 5 原本在独立的 `feature/sync-agent-phase5` 工作树开发，最终 Release 从主干 `1a44da2` 重新建立并只纳入已审查的 sync/部署/文档变更，避免把未合并的 Docs/Operations 原型带进发布。**Operations 路由与 mock 数据已按 Owner 决定排除，不在本次发布产物中**；本次不开发 Operations 鉴权。其他尚未合入的导航/样式分支留在原位。

正式 Dockerfile 支持可选离线 Prisma 引擎缓存 `deployment/.prisma-engine-cache/`（Git 忽略）。本轮从既有同版本隔离镜像取出 Debian OpenSSL 3 引擎；`version` 必须等于锁定 Prisma 6.19.3，`SHA256SUMS` 在构建中校验；生成后缓存从镜像源码目录移除。schema 引擎 SHA256 为 `5d42b181631fd20bb0ecc5abcdba72575e7f467a0d52f4d5ef1ff28f0c74e6e9`，query 引擎为 `a2924eab1c78a0a7bb67edac5738939fa10589ef073af5542f53812a22e4a7d8`，引擎 commit 为 `c2990dca591cba766e3b7ef5d9e8a84796e47ab7`。有网络时可不提供缓存，由官方 Prisma generate 下载；不要从未核验来源注入二进制。

固定 Node 24.15–24.x、pnpm 10.30.3；源/锁文件 sha256 与验收清单一致。最终集成源码有变化时重新运行完整构建、相关回归和浏览器 smoke；不重跑 70k 大型基准。

批准后先核对 SSH Host、域名、当前 release/image、`INCEPT_PROXY=nginx`、数据目录、PG 角色、卷空间；若目标与授权单不符即停止。不要打印 `.env`、`docker compose config` 的展开值、设备 Token 或 Cookie。

```sh
cd /srv/incept/current
export INCEPT_ENV_FILE=/srv/incept/.env.production
export INCEPT_COMPOSE_PROJECT=incept
export ENV_FILE=$INCEPT_ENV_FILE
# 使用本次批准的不可变 release/image；禁止 latest。
export RELEASE_IMAGE=incept:OWNER_APPROVED_RELEASE
export CANARY_UUID=OWNER_APPROVED_DEVICE_UUID
export DOMAIN=OWNER_CONFIRMED_DOMAIN
export DATA=/srv/incept/shared
export SECRET_DIR=/srv/incept/secrets
export BACKUP=/srv/incept/backups/sync-$(date -u +%Y%m%dT%H%M%SZ)
umask 077
sh deployment/compose.sh ps
df -h "$DATA"
docker stats --no-stream
```

`DATA`、`DOMAIN` 应与受控 env 的实际值核对，示例路径以既有 systemd 服务的 `/srv/incept/current` 为准。v1 为 `$DATA/dashboard/imports.db`；v2 固定 `$DATA/sync/v2.db`。UUID 若有 v1 历史必须复用旧 UUID；无旧历史才生成预定 UUID。先在 env 允许这个 UUID，之后 Owner 在设备面板填相同 UUID 登记，解决“尚无凭据但需先限定灰度”的顺序。

## 1. 本地构建与镜像准备

在审阅通过的 release 目录执行，生产发布镜像/传输也属于本次批准范围：

```sh
pnpm install --frozen-lockfile
pnpm db:generate
pnpm --filter @incept/dashboard build:runtime
pnpm --filter @incept/sync-agent build
pnpm --filter @incept/sync-gateway build
node packages/dashboard/tools/phase5/build.mjs
pnpm typecheck
pnpm lint
pnpm test
pnpm test:ops
docker build --target runtime -t "$RELEASE_IMAGE" .
docker image inspect "$RELEASE_IMAGE" --format '{{.Id}} {{.Size}}'
```

仓库 Dockerfile 保留检查，正式镜像会离线裁剪生产依赖；本轮本地容器验收镜像含 dev 依赖/测试 fixture，只用于隔离验证。不得把该测试镜像当正式发布镜像推送。通过既有受控镜像传输流程发布批准的 image digest，不新增 registry 凭据或第三方目的地。

## 2. 停写、一致备份与恢复演练

Owner 先 Stop Windows Agent，暂停人工 Import/rollback、价格/映射修改。等待无在途 Job；停止 Web 与 Gateway 后只有 PG 运行。首次上线 Gateway profile 尚不存在时其 stop 失败可忽略服务不存在，不能忽略其他错误。

```sh
sh deployment/compose.sh --profile sync stop sync-gateway app
install -d -m 0700 "$BACKUP"
cp -p "$ENV_FILE" "$BACKUP/env.before"
chmod 0600 "$BACKUP/env.before"
sh deployment/compose.sh exec -T postgres pg_dump -U incept_migrator -d incept -Fc > "$BACKUP/postgres.dump"
sh deployment/compose.sh exec -T postgres pg_restore --list < "$BACKUP/postgres.dump" > /dev/null
sh deployment/compose.sh run --rm --no-deps --user 0 -v "$BACKUP:/backup" --entrypoint node app \
  scripts/production-sync-backup.mjs --source /data/dashboard/imports.db --out /backup/imports.db
# 仅在 v2 已存在时执行；首次不存在需在备份清单注明 absent。
if test -f "$DATA/sync/v2.db"; then
  sh deployment/compose.sh run --rm --no-deps --user 0 -v "$BACKUP:/backup" --entrypoint node app \
    scripts/production-sync-backup.mjs --source /data/sync/v2.db --out /backup/v2.db
fi
sha256sum "$BACKUP"/postgres.dump "$BACKUP"/imports.db > "$BACKUP/checksums.txt"
```

数据库名若不是 `incept`，使用受控 env 的实际 `INCEPT_DATABASE_NAME`，不得指向其他 PG。`production-sync-backup.mjs` 使用 SQLite backup API、只读源连接、quick_check、流式 hash；拒绝同路径及覆盖，不在 WAL 活跃时单独复制 `.db`。保留 Owner TOTP 加密 key 的既有备份，不重新生成它。env/RPC key 备份目录仅受控管理员可读，按既有加密离站备份流程保护。

正式执行前将 PG dump 恢复到**临时验收数据库/容器**，SQLite 副本做 `quick_check` 和 revision/receipt/count 对照；不得为了演练覆盖生产数据库。源 v1 的 commit/rollback 状态需要与回填、对账处于同一冻结窗口。

## 3. 独立服务密钥与正式迁移

只生成 Gateway↔Web RPC key，保留现有 PG 密码与 Owner key。运行镜像中的 Node，生产宿主机无需另装 Node：

```sh
install -d -m 0700 -o 1000 -g 1000 "$SECRET_DIR"
docker run --rm --user 0 -v "$SECRET_DIR:/secrets" --entrypoint node "$RELEASE_IMAGE" \
  scripts/sync-secret.mjs --confirm-owner --output=/secrets/sync-rpc.key --uid=1000 --gid=1000
install -d -m 0700 -o 1000 -g 1000 "$DATA/sync"
# 将 env 的 INCEPT_APP_IMAGE 指向审阅通过的 RELEASE_IMAGE；使用受控编辑器，不打印整份 env。
sh deployment/compose.sh run --rm migrate
sh deployment/compose.sh exec -T postgres psql -U incept_migrator -d incept -v ON_ERROR_STOP=1 -c \
  'SELECT migration_name,finished_at FROM _prisma_migrations ORDER BY started_at DESC LIMIT 4'
sh deployment/compose.sh exec -T postgres psql -U incept_migrator -d incept -v ON_ERROR_STOP=1 -c \
  "SELECT to_regclass('public.agent_devices'),to_regclass('public.sync_jobs')"
```

需应用的正式 PG 迁移是 `20261017010000_sync_agent_devices`、`20261017020000_sync_jobs`；由 `incept_migrator` 执行，App 用 `incept_app`，保持现有默认表/序列权限。Phase 5 没有新增 PG migration。SQLite 增加的提交时钟为可重入附加表，committed receipt 与时钟在同一事务写入，旧回执不虚构时间。

失败时保持 sync disabled/v1，不执行“删表回退”；修复/恢复迁移前备份仅在明确停止所有写入后进行。Prisma migration resolve 只用于确认过的失败状态，不把未应用的迁移标为成功。

## 4. 同步开启但继续读 v1

用一次批准记录配置，先 dry run，再 apply。下面 `docker run` 将 env 文件和数据挂在容器内，不把密钥传到 argv/stdout；`--user 0` 只供受控离线维护：

```sh
docker run --rm --user 0 -v /srv/incept:/ops -v "$DATA:/data" --entrypoint node "$RELEASE_IMAGE" \
  scripts/sync-stage.mjs --env-file=/ops/.env.production --stage=upload --device="$CANARY_UUID"
docker run --rm --user 0 -v /srv/incept:/ops -v "$DATA:/data" --entrypoint node "$RELEASE_IMAGE" \
  scripts/sync-stage.mjs --env-file=/ops/.env.production --stage=upload --device="$CANARY_UUID" --apply --owner-confirm
sh deployment/compose.sh --profile sync up -d --wait --wait-timeout 120 app sync-gateway proxy
sh deployment/compose.sh exec -T proxy nginx -t
sh deployment/compose.sh exec -T proxy nginx -s reload
curl --fail --silent --show-error "https://$DOMAIN/api/health/ready"
test "$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/api/internal/sync/check")" = 404
test "$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/rpc/status")" = 404
```

Nginx 使用既有 443，只有 `/api/sync/ws` Upgrade 到内部 `sync-gateway:3101`，无新增公网端口。私有 RPC 公网 404，Gateway 健康检查 `/healthz` 也被公网屏蔽。Nginx 可在默认关闭的 Gateway profile 不存在时正常启动；Gateway/Web 都通过独立 HMAC 验证。

## 5. Windows 一次授权与绑定（Agent 保持停止）

Owner 近期验证后在 Settings → Account → Token sync devices 创建设备，填 `CANARY_UUID`，只勾选授权来源。Token 只显示一次，用隐藏输入绑定，不复制到 URL/日志。若旧 v1 存在，核对旧 UUID 与源 scope；**登记设备不等于认领历史**，首次上传与旧 v1 重合时仍必须进入审阅。

```powershell
# 解压经 sha256 校验的 ZIP，进入 incept-sync-agent-win-node24 目录。
node --version
Get-FileHash .\dist\agent.mjs -Algorithm SHA256
& .\windows\Bind.ps1 -Endpoint 'https://OWNER_CONFIRMED_DOMAIN' -StateDirectory "$env:LOCALAPPDATA\Incept\sync-agent" -EnableRemote
node .\dist\agent.mjs status
```

`Bind.ps1` 只写入当前用户 DPAPI 凭据和 config；此阶段**不运行** `run-once`、`Start.ps1` 或 `sync-now`，Agent 必须保持停止。`status` 应为 `configured:true`、`running:false`。需要指定来源 HOME 时额外传 `-HomeDirectory`；生产不设置测试 CA / TLS 例外。

设备 UUID 必须与旧 v1 历史归属一致；不得为了首次同步变绿而更换 UUID、换 namespace 或删除 outbox。如果旧 UUID/来源 scope 不明确，先进入第 7 节审阅，不启动 Agent。

**仅授权单包含 Windows 登录自启时，等到第 7 节首次上传验收通过后再执行：**

```powershell
& .\windows\Install.ps1
# 首条只预览；Owner 明确批准安装后：
& .\windows\Install.ps1 -ConfirmInstall
```

卸载使用 `Uninstall.ps1 -ConfirmUninstall`，保留凭据和 outbox。本轮开发没有安装过任务。

## 6. v1 迁移、shadow 对账与 v2 切换（Agent 仍停止）

此阶段确认 Windows Agent 未运行，停止 app/Gateway；源 v1 freeze，停人工 Import/rollback/价格和映射修改。**一个明确的 v2 writer**：在线仅一个 App/一个 Sync Worker；离线维护时 App 停止。不要 `--scale app=2`，不让多个 release 共享同一 SQLite writer。

```sh
sh deployment/compose.sh --profile sync stop app sync-gateway
# maintenance 使用 app 的 env/data，但 bypass 正式启动入口；不启动另一份 Web。
sh deployment/compose.sh run --rm --no-deps --entrypoint node app \
  packages/dashboard/dist/sync-maintenance.mjs migrate-v1 \
  --owner-confirm=I_AM_THE_OWNER --reason=OWNER_APPROVED_PHASE5_ROLLOUT
sh deployment/compose.sh run --rm --no-deps --entrypoint node app \
  packages/dashboard/dist/sync-maintenance.mjs legacy-status
sh deployment/compose.sh run --rm --no-deps --entrypoint node app \
  packages/dashboard/dist/sync-maintenance.mjs reviews \
  --owner-confirm=I_AM_THE_OWNER --reason=OWNER_APPROVED_REVIEW
```

迁移源只读，v2 写 shadow；默认每次 10 个批次，重复执行不重复计数，已有 commit/rollback 状态会更新。未认领 v1 保留，native / 最早有效批次优先与 legacy/live pricing 沿 Phase 1。

保持来源冻结，先 shadow：

```sh
docker run --rm --user 0 -v /srv/incept:/ops --entrypoint node "$RELEASE_IMAGE" \
  scripts/sync-stage.mjs --env-file=/ops/.env.production --stage=shadow --device="$CANARY_UUID" --apply --owner-confirm
sh deployment/compose.sh run --rm --no-deps -v "$BACKUP:/review" --entrypoint node app \
  packages/dashboard/dist/sync-maintenance.mjs compare --report=/review/compare.json
```

报告覆盖 7d/30d/all 全对象（费用、Token、model/source/project、provenance、排序）；排除读取时间 `checkedAt` 和新 `sync` 元数据。**因为 Agent 尚未启动，这份对照只应包含 v1 迁移结果**；任何非零差异都是迁移/读取缺陷，必须调查，不能进入 v2 切换。陈旧 v1 mirror/变化中的输入同样拒绝；如果 v1 在冻结窗口变化，重新备份/迁移/compare，不能签通用忽略。

零差异且源仍冻结、报告不超过 5 分钟时：

```sh
docker run --rm --user 0 -v /srv/incept:/ops -v "$DATA:/data" -v "$BACKUP:/review" --entrypoint node "$RELEASE_IMAGE" \
  scripts/sync-stage.mjs --env-file=/ops/.env.production --stage=v2 --device="$CANARY_UUID" \
  --report=/review/compare.json --v1=/data/dashboard/imports.db --v2=/data/sync/v2.db --apply --owner-confirm
sh deployment/compose.sh --profile sync up -d --wait --wait-timeout 120 app sync-gateway proxy
sh deployment/compose.sh exec -T proxy nginx -t
sh deployment/compose.sh exec -T proxy nginx -s reload
```

切换脚本再次核对 v1 批次 checksum/rollback 状态、报告新鲜度和 **env 中的 v1/v2 路径与 `--v1`/`--v2` 一致**；报告陈旧、缺窗口、非零、路径不一致或源变动均拒绝。完成切换后 App 读取 v2，但 Agent 仍保持停止；先用 Owner Dashboard 确认迁移后的图表与 v1 对账结果一致，再进入第 7 节。

## 7. 启动 Agent、首轮上传与历史重叠审阅

只有第 6 节 v2 切换完成且 Owner Dashboard 正常读取 v2 后，才启动单台 Agent：

```powershell
& .\windows\Start.ps1
node .\dist\agent.mjs status
node .\dist\agent.mjs sync-now
```

首轮上传按两种结果处理：

- **真正新增事件**：来源/会话不在已迁移 v1 历史中；Job 完成，v2 revision 前进，页面 Token/图表按新增量增加。
- **与旧 v1 历史重合且尚未认领**：服务端应返回 `review_required` / `V1_ADOPTION_REVIEW_REQUIRED`；旧 v1/v2 统计保持不变，Agent outbox 保留在 `review`，不删除、不重置。**不能为了让首次同步变绿而自动认领全部历史。**

如果旧 v1 存在，先核对设备 UUID、source/session/origin、manifest，再停止 Agent 导出私有审阅文件：

```powershell
node .\dist\agent.mjs export-review --state "$env:LOCALAPPDATA\Incept\sync-agent" --batch OWNER_REVIEWED_BATCH_ID
# 生成 state\review-BATCH_ID.json；经已批准的受控维护通道放到服务器私有目录。
```

Owner 明确核对 candidate 的 device/source/session/origin、manifest、旧批次及价格/映射后，在离线维护容器中执行：

```sh
sh deployment/compose.sh run --rm --no-deps -v "$BACKUP:/review" --entrypoint node app \
  packages/dashboard/dist/sync-maintenance.mjs adopt-exact \
  --candidate=/review/review-candidate.json --legacy-batches=OWNER_APPROVED_BATCH_IDS \
  --device="$CANARY_UUID" --manifest=OWNER_REVIEWED_MANIFEST_HASH \
  --owner-confirm=I_AM_THE_OWNER --reason=OWNER_APPROVED_EXACT_ADOPTION
```

该步骤逐一验证精准旧事件、价格、映射、完整 staging 和所有权；多批次用逗号列表（最多 100），跨设备拒绝。同一当前已提交计划重放幂等。精确判定失败时留在审阅；Owner 若实际完成了人工审阅，可改用 `adopt-reviewed` 并额外传 `--accept-reviewed-manifest=同一HASH`，沿原 Phase 1 Owner-reviewed 授权，不自动推断。已 rollback/fenced、过期父版或历史范围损失仍按领域规则拒绝，脚本没有 un-fence 或任意 Shell 功能。

一般 review 的驳回/后继接受：`resolve-review --id=数字 --successor=经审阅的新generation --owner-confirm=I_AM_THE_OWNER --reason=...`；无 successor 表示保留旧版并关闭审阅记录。`admission:...` 条目先走上述绑定/认领，不能当作普通数字 review ID。不得用 dismiss 宣称已上传或解除 Agent 阻断。

提交成功、服务恢复后，在停止状态的 Windows 执行：

```powershell
node .\dist\agent.mjs resume-reviewed --state "$env:LOCALAPPDATA\Incept\sync-agent" --batch OWNER_REVIEWED_BATCH_ID --confirm-reviewed
```

该命令只接受云端**当前 head**和匹配 committed receipt，随后用既有 `acknowledge` 事务推进本地 lineage。不能跨 rollback/head 栅栏，不能在无云端提交时重置本地队列。

完成首次上传/审阅后，从两个独立浏览器会话使用 Owner Dashboard，点击 Refresh now，核对三个时间及实际图表；刷新时查询 revision 至少覆盖 Job。离线、断网续传和一个历史冲突提示必须按第 8 节验收；不为演示清除已提交数据。

## 8. 验收、监控与限额

从两个独立浏览器会话使用 Owner Dashboard，点击 Refresh now，观察采集/上传/提交/无变化，核对三个时间及实际图表；刷新时查询 revision 至少覆盖 Job。演示离线、断网续传和一个历史冲突提示；不为演示清除已提交数据。

```sh
sh deployment/compose.sh --profile sync ps
docker stats --no-stream
sh deployment/compose.sh exec -T app node packages/dashboard/dist/sync-maintenance.mjs status
sh deployment/compose.sh exec -T app node -e 'console.log(require("node:fs").readFileSync("/sys/fs/cgroup/memory.events","utf8"))'
df -h "$DATA"
# 无活跃 writer/reader 的维护窗口可运行；busy 返回后按30秒退避，不循环硬等。
sh deployment/compose.sh run --rm --no-deps --entrypoint node app \
  packages/dashboard/dist/sync-maintenance.mjs maintain --owner-confirm=I_AM_THE_OWNER --reason=OWNER_APPROVED_MAINTENANCE
```

最后一条仅在 app 已停止的维护窗口执行；平时 Worker 自己每 30 秒在操作间隙做有界 PASSIVE/TRUNCATE，busy_timeout=0，遇外部 reader/writer 退避。不会修改 revision/receipt/adoption/已提交事件。

上线初期限额：单设备；单新 batch 不超过 20,000 记录，超出 429/Retry-After=300；页面仍最多 500 条/512 KiB。App 队列 4/per-device 2，DB+WAL+SHM 4 GiB、磁盘余量 2 GiB、cgroup 85% 触发新上传 503/Retry-After。已提交回执查询/commit 恢复路径保留；outbox 持久等待，不截历史、不丢包、不扩大容器上限。

容器限制：App 768 MiB、PG 384 MiB、Gateway 128 MiB、Nginx 96 MiB，合计上限 1376 MiB；2 GiB 主机另留 672 MiB 给 OS/Docker/其他服务。该预算还须在真实主机核对。部署前可用磁盘应覆盖镜像、PG dump、v1/v2 两份副本及至少 2 GiB 工作余量，推荐 5 GiB 警戒余量。

任何 OOM、反复 `memory.events.max`、长时间 SQLITE_BUSY、磁盘不足、队列/Job/outbox 无法消费：立即退回 v1 并关闭新 sync；保留状态排查。70k 自动延期，多设备高负载不在首批批准范围；Phase 2E 极端压力余量仍为后续容量事项。

## 9. 密钥轮换与回滚

RPC key 轮换：停止 Agent/新 Job，等在途任务结束；受控备份旧 key，停止 Gateway/app，执行下述原子轮换，再以同一个 key 重建 Web/Gateway。Nginx 重载，确认两边健康后 Start Agent。中断期间 outbox/Job 持久保留；不接受两个不同服务 key 混用。

```sh
docker run --rm --user 0 -v "$SECRET_DIR:/secrets" --entrypoint node "$RELEASE_IMAGE" \
  scripts/sync-secret.mjs --confirm-owner --rotate --output=/secrets/sync-rpc.key --uid=1000 --gid=1000
sh deployment/compose.sh --profile sync up -d --force-recreate --wait app sync-gateway
sh deployment/compose.sh exec -T proxy nginx -s reload
```

设备 Token 轮换/吊销继续 Owner 近期验证和审计，不输出 Token；重新 Bind 保留原 outbox。紧急软件回滚优先**关同步、读 v1**，不恢复覆盖已产生的新提交：

```sh
docker run --rm --user 0 -v /srv/incept:/ops --entrypoint node "$RELEASE_IMAGE" \
  scripts/sync-stage.mjs --env-file=/ops/.env.production --stage=disabled --apply --owner-confirm
sh deployment/compose.sh --profile sync stop sync-gateway
sh deployment/compose.sh up -d --force-recreate --wait app proxy
sh deployment/compose.sh exec -T proxy nginx -s reload
```

然后停止 Windows Agent。保留 PG 新表、v2、审计和本地 outbox，验证旧 Import、Owner/TOTP、Docs/Music。回到前一镜像时使用备份记录的 digest；**不要把整份旧 env 覆盖新配置来遗失其他并行配置**，只回退批准的 image 与上述 sync flags。

只有数据库本身受损且决定全量灾难恢复时，停止所有写入，在临时库先验证 PG dump 和 SQLite 副本，再经维护方案恢复同一备份时点；备份后的新提交单独保留/重放。不得在服务运行时直接 `cp` 老 `.db` 到 WAL 正写目录。
