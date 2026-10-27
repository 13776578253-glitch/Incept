# r5 身份修正与独立验收环境部署申请

状态：**本地准备完成；远端尚未执行；发布 NO-GO，正式 Agent 保持停止。**

v4 离线 359/359、数据差异 0 已验收关闭。本计划不安排数据恢复或重复离线对账。数据库复制仅用于创建独立验收环境。

## 1. r5 的三类身份

| 类型 | 实际 digest |
|---|---|
| OCI Image Index / Docker Manifest List | `sha256:cc705ce22cea38b1a8c01cea28fe1e1dd2ca6cbae500516f00eaee6c497d6685` |
| Linux/amd64 Platform Manifest | `sha256:c13ed6a558e76432d8b10eff170c618cd61930f91a16d6b32cad02f2a5cad9cc` |
| Image Config | `sha256:eebc98b3a47bccf76cff462d8cbdc027309d4d5dabb470ba3fdc4835a12fbc38` |

Index 指向平台 manifest；平台 manifest 指向 config。这些是不同对象，分别计算原始 JSON 字节的 SHA-256。定义见 [OCI Image Index](https://github.com/opencontainers/image-spec/blob/main/image-index.md) 与 [OCI Image Manifest](https://github.com/opencontainers/image-spec/blob/main/manifest.md)。

旧校验将 index digest 命名为唯一 imageId，并直接比较 Docker 返回值。本次新增 `image-identity.ts`：同时核验三份原始对象、引用关系、linux/amd64、运行时 rootfs diff IDs；再将 Docker observed ID 分类为 manifest-list、platform-manifest 或 image-config。只接受这条已验证 r5 链中的三种标识，拒绝 r3、仅标签、缺少图证据及错误平台。

本地 Docker 实测：

- 普通 image inspect 的 `.Id` 为 index digest。
- `image inspect --platform linux/amd64` 的 `.Id` 为 platform manifest digest。
- Docker save 的 manifest.json 引用 config digest。
- 裸 platform digest 在当前引擎不能直接作为运行引用；已验证可运行引用为 `incept-sync-trusted@sha256:cc705ce22cea38b1a8c01cea28fe1e1dd2ca6cbae500516f00eaee6c497d6685`。

远端 docker load 后重新核对这条身份链。Compose 使用目标引擎实际可解析的不可变引用：优先已存在 RepoDigest；若离线导入未保留 RepoDigest，则使用普通 image inspect 返回的已验证顶层 `.Id`。不能直接将 --platform 的子 manifest ID 当作可运行 ID，也不能将 Config ID 拼作仓库 Manifest Digest。

## 2. 本地完成项与候选文件

保留已构建的原 r5，没有用新构建覆盖其身份。当前源码中的验收工具已重新构建，Agent typecheck 通过；本地镜像内既有 Next 生产构建、sync worker、trusted-only projection 均存在。

无网络、无数据挂载、非 root、只读容器检查通过：Node v24.21.0、uid=1000。该容器只运行检查脚本，未启动 App 或 Agent。

候选目录：`D:/Desktop/code/code/Incept/.worktrees/trusted-sync/output/`。

| 文件 | 用途 |
|---|---|
| incept-r5-original.tar | 原 r5 镜像归档，369,071,104 bytes |
| r5-image-evidence.json | 三份原始 OCI 对象与本地运行时观察 |
| v4-compose.rendered.json | 本地 Compose 真实渲染结果，只含合成凭据，禁止部署此份合成 env |
| v4-isolation-check.json | 隔离配置检查结果 |
| r5-local-preparation.json | 归档哈希及本地检查摘要 |

归档 SHA-256：`e4aff06146629725e714ef537d22342abe4393e1cca1081a0f1ab6324d639e60`。

验证：镜像身份 14/14，隔离配置 40/40，证据导出器 7/7，单项身份接入回归 1/1；类型检查通过。未使用真实 v4 数据重新执行离线对账。

配置文件：`deployment/compose.v4-acceptance.json`。镜像工具：`scripts/archive/prepare-r5-image-evidence.py`、`scripts/archive/check-r5-image.mjs`。隔离门禁：`scripts/check-v4-isolation.mjs`。

## 3. 隔离结构

- 独立 Compose project：`incept-v4-acceptance`；只有 app、postgres 两个服务，无 Agent、gateway、Caddy、migrate 服务。
- 独立 internal network：`incept-v4-acceptance_acceptance`；不连接生产网络。
- 三个项目命名 volumes：`incept-v4-acceptance_v4_data`、`incept-v4-acceptance_pg_data`、`incept-v4-acceptance_acceptance_secrets`。拒绝 external volume、驱动覆盖、生产路径 bind mount 与 Docker socket。
- App 仅发布 `127.0.0.1:3305 → 3000`；PostgreSQL 不发布端口；SSH 临时入口可为本机 `127.0.0.1:13305`。
- App 为 uid/gid=1000/1000、只读根文件系统、drop ALL、no-new-privileges，tmp 与 Next cache 使用 tmpfs。restart=no，避免环境随服务器重启自动恢复。
- App 只读独立 secrets volume；生产 secrets 不挂载、不复制。生成独立 Owner 加密密钥及测试设备凭据。
- SQLite 路径固定 `/data/sync/v4.db`，trusted=1、read mode=v2、remote=0；v4_data 仅放独立副本，无 v2 文件。
- PostgreSQL 镜像固定 `postgres:16-alpine@sha256:4e6e670bb069649261c9c18031f0aded7bb249a5b6664ddec29c013a89310d50`。
- PostgreSQL 数据库为 `incept_v4_acceptance`；恢复管理员 `incept_v4_restore` 与应用角色 `incept_v4_acceptance` 使用不同的独立密码。应用角色创建为 NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOREPLICATION。

## 4. 请求授权的远端操作（尚未执行）

本次申请限于建立上述独立 App/PostgreSQL 环境，不包含正式 Agent 启动、生产切换或增量/断网/重启 E2E。

1. **只读前置检查**：核对生产容器镜像/状态作为回滚对照、3305 端口、磁盘与内存余量，以及目标 project、volumes、network 是否重名。需预留至少 2 GiB 磁盘与 1.5 GiB 可用内存；不足则停止，另选验收主机，不停止生产来释放资源。重名资源未经核实不复用或覆盖。
2. **新建私有工作目录**：`/srv/incept/v4-acceptance/20261019-r5`，0700。上传镜像归档、身份图证据、校验工具及独立 Compose 文件；核对传输 SHA-256 后 docker load。只添加 r5 镜像，不替换生产容器或修改现有镜像引用。
3. **一致性副本**：使用 SQLite 只读连接的 backup API，将源 `/srv/incept/import-20261014/shared/sync/v4.db` 写到新私有目录；PostgreSQL 用 pg_dump 自定义格式生成逻辑副本。只读取生产，不执行生产 DDL、migrate 或授权更新。副本文件权限0600。此步骤不进行重复 359/359 对账。
4. **创建项目资源并灌入副本**：通过独立 volume 将 SQLite 副本传入 /data/sync/v4.db，目录权限归 uid1000。辅助容器仅挂新的目标 volume、使用 --network none；源快照经 stdin 传入，不 bind 生产 shared。启动独立 postgres 后，以 --no-owner/--no-acl 恢复逻辑备份到独立数据库，并将对象归属/表序列权限授予独立应用角色。schema 来自副本，不执行新迁移。
5. **隔离身份处理**：SQL 必须先断言 current_database()=incept_v4_acceptance。仅在副本内撤销复制的登录会话、替换测试 Owner 凭据/加密字段及测试设备 token hash；设备 ID 按副本测试需求保留。生成新测试 token，不读取本机正式 DPAPI，不复用生产秘密。生产设备授权不变。配置 env 文件0600，不输出其中秘密。
6. **启动前门禁**：在目标主机重新验证镜像链与运行引用，运行 Compose config 后静态隔离检查。检查 DATABASE_URL 仅指向独立 postgres、所有挂载为新的命名 volumes、remote=0、端口 loopback。门禁失败不启动 app。
7. **仅启动独立 App**：`docker compose --project-name incept-v4-acceptance --env-file <私有env> -f <独立compose> up -d --wait app`。env 由独立秘密生成，不能使用本地 synthetic 渲染文件或生产 env。独立 PostgreSQL已在第4步启动。检查 ready、容器镜像身份、挂载路径及网络；不启动任何 Agent，不触发采集/上传。
8. **可选临时入口**：SSH forward `127.0.0.1:13305 → 127.0.0.1:3305`，仅用于健康与服务身份检查。不修改生产 Caddy。后续在线行为及 E2E 另列验收操作并申请授权。

## 5. 回滚与失败处理

- 任何身份、资源、挂载或环境检查失败即停止后续步骤，不修改生产补救。
- 若独立服务已启动，使用固定 project 与独立文件执行 `docker compose --project-name incept-v4-acceptance --env-file <私有env> -f <独立compose> down`；仅移除本项目容器/网络，不加 --volumes，不执行镜像 prune。
- 关闭本次 SSH 隧道，保留三个独立 volumes、快照、日志与新目录，供问题调查。清理这些数据另行确认并逐个验证归属。
- 复核生产 App/Caddy/PostgreSQL 原容器 ID、镜像与状态，以及正式 Agent 仍停止；本方案不覆盖 v2、不改 Caddy、不恢复或替换正式 state，因此回滚不涉及生产数据库回灌。

## 6. 下一阶段边界

已通过的离线 359/359 与零数据差异结论保持关闭。独立环境完成后安排服务身份、在线行为、真实增量、离线、断线恢复与重启续传验收；Agent 测试进程启动另行申请。

正式上线仍采用 Plan A：已验证迁移 → 对账与服务验收 → Owner 批准切换 → 切换 → 最后单独批准启用正式 Agent。此部署申请只建立验收环境，发布状态仍为 NO-GO。
