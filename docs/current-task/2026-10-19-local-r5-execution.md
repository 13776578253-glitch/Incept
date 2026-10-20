# 本地独立 r5 执行记录

状态：**入口已修复，本地隔离 r5 合成 E2E 全部通过；三服务 healthy，发布 NO-GO。** 正式 Agent 保持停止，359/359 离线验收直接沿用。

## 授权与副本

用户请求在 Windows + Docker/WSL2 完成独立 r5 验收。全量数据库导出初次被自动审批拒绝后，已向用户说明导出内容、目的地及限制；用户随后明确补充“授权执行”，再次审批通过。

只读导出到当前用户专属 ACL 目录 `%LOCALAPPDATA%/Incept/v4-acceptance-20261019`：

- v4 SQLite 一致性副本 `v4-baseline.db`：55,390,208 bytes，SHA-256 `94ae93d5c1a0b53544dbe89ddfb067f42022f21daec5563d410deea8a0b4d77d`。
- PostgreSQL 逻辑副本 `production-copy.pgdump`：174,441 bytes，SHA-256 `273a61423676661372ade1d7f71badb687857b7760fa88f9d4bec808fe52d9e5`。

生产 SQLite 只读 backup；PostgreSQL pg_dump 进程使用 default_transaction_read_only=on。不修改生产配置、授权或原始 Agent state。私有文件没有写入源码或 Git。

## 已完成

- 本地 Compose 资源上限补齐：App 768 MiB/2 CPU；PG 384 MiB/1 CPU；内存+交换总上限等于内存上限，固定低资源 PG 参数。静态门禁新增覆盖后66/66测试通过。
- 独立 PostgreSQL 启动，逻辑副本以 no-owner/no-acl 恢复；对象归独立应用角色，恢复管理员与应用密码分开。
- 只在独立 PG 内撤销复制的登录会话、permit、recovery 与旧设备凭据；重新生成独立 Owner/TOTP、设备 token、应用加密密钥。
- App 创建为非 root、只读根文件系统，数据和秘密只来自项目命名卷；生产 shared、生产 secrets、正式 state 没有挂载。
- v4 副本安装到独立卷 `/data/sync/v4.db`；仅复制，不重新检查历史359个scope。
- 独立 App 和 PostgreSQL 均到达 Docker healthy。
- 合成七来源真实 HTTP 故障恢复脚本已实现并通过语法检查，尚未实际执行。报告会区分合成样本与真实来源新增事件。

## 初次执行阻塞（已由独立 entry 修复）

Windows 请求 `http://127.0.0.1:3305/api/health/ready` 返回 `ECONNREFUSED`。实际 Docker 观察为：

```json
{
  "HostConfig.PortBindings": {"3000/tcp":[{"HostIp":"127.0.0.1","HostPort":"3305"}]},
  "NetworkSettings.Ports": {"3000/tcp":[]},
  "network.internal": true,
  "containerHealth": "healthy"
}
```

即声明的 loopback 端口未成为运行时发布入口。E2E 尚未开始，不将容器 healthy 计为入口或验收通过。

按用户此前“中途出现问题停下汇报”要求，在诊断后停止推进，并执行已批准的项目级回滚：

`docker compose --project-name incept-v4-acceptance --env-file <私有env> -f deployment/compose.v4-acceptance.json down`

仅移除了本项目 App/PG 容器及 internal network，未加 --volumes。保留：

- `incept-v4-acceptance_v4_data`
- `incept-v4-acceptance_pg_data`
- `incept-v4-acceptance_acceptance_secrets`
- 私有数据库副本、env、测试 Owner/设备凭据、setup-report.json 与诊断记录。

回滚后原有本地 snowluma 和 incept-postgres 仍运行，开发 PostgreSQL healthy。未操作生产容器/Caddy/v2，正式 Agent 未启动。

## 下一步

修复或替换本地 loopback 临时入口实现，保持 PG 私有网络、独立卷和外网隔离。启动时复用本次已隔离的卷及凭据，避免重新导出、恢复副本或替换已生成的身份。

入口健康与设备身份验证完成后，依次运行合成七来源 HTTP、分页中断、离线持久队列、commit 后 ACK 丢失、独立进程恢复与本项目服务重启。真实来源新增事件另行记录，不能以合成 fixture 代替。真实服务器的入口与资源门槛继续保留。

## 入口修复准备（本轮未启动）

按用户要求先核对 Engine 29.7.2/API1.55、Compose5.5.0 与原 internal-only 拓扑。端口配置已声明而运行时未发布的问题，与 Moby internal-only 发布行为吻合；最小修复使用独立 entry，而不将 App/PG 接入普通网络。

配置更新为 acceptance（App/PG internal）、app_entry（App/entry internal）、ingress（仅 entry 普通 bridge），仅 entry 发布 localhost3305。entry 关闭 IP 转发，固定转发 App3000；不挂数据、秘密或 Docker socket。代理测试13/13、隔离配置测试121/121通过。使用既有私有 env 的真正 Compose render、保留卷和三层镜像身份检查均通过，3305无占用。当前本项目仍无容器，三个原卷均在；未重导数据库、未更换身份、未执行 E2E 或重复359/359。

审阅方案：`docs/plans/2026-10-19-local-r5-entry-fix.md`；脱敏 SHA256 清单：`output/r5-entry-review.json`；只读复核脚本：`scripts/local-r5-entry-preflight.mjs`。等待用户单独批准启动该本地三服务项目及保留卷回滚。启动后先核对实际发布端口、Ready、服务/数据库身份、外网隔离，再执行尚未完成的 E2E。正式 Agent 停止，发布NO-GO。

## 本次获批启动与完整本地合成验收结果

用户明确批准启动本地三服务，并授权失败时保留卷回滚。2026-10-19 22:44 起（Asia/Singapore）执行：审批文件 SHA256 全部匹配，只读 preflight 再次通过，原卷和测试凭据复用；启动 entry 及 App/PG 依赖成功。没有重新导出、恢复数据库或生成身份。

启动与本项目三服务重启后，运行门禁均通过：

- 仅 entry 实际发布 `127.0.0.1:3305 -> 8080/tcp`；App/PG 无主机映射；网络成员和 internal 标记符合审批配置，entry 无 PG 网络连接。
- entry 非 root、只读根、drop ALL、no-new-privileges 生效，实际 IPv4/IPv6 forwarding 均为0。
- Windows HTTP Ready 成功，设备 `REDACTED_ID` 和七来源授权匹配现有测试配置。
- 从实际 App 使用现有 DATABASE_URL 和项目生成的 Prisma 客户端只读查询：数据库/角色均为 `incept_v4_acceptance`，角色无 superuser/createdb/createrole/replication 权限；r5 三层镜像身份图匹配。
- App/PG 均无 IPv4/IPv6 外网默认路由；连接 `1.1.1.1:443`、`8.8.8.8:443` 均失败，外部 DNS 解析失败；entry 拒绝 CONNECT405 和外部 absolute URI400。

合成来源格式日志通过实际 r5 HTTP 的 E2E：

| 场景 | 结果 |
|---|---|
| 七来源基线与追加 | 分别 sent=7，均无阻塞，Outbox为空 |
| 离线与 AgentState 重开 | 7笔队列持久化，恢复后清空 |
| 第二页上传中断 | 第一页 offset500 持久化，重开后续传成功 |
| commit成功后 ACK 丢失 | 远端收据已提交，重开重试仅新增一次本地收据 |
| 原合成收据对账 | 23笔本地/远端完全一致，dataRevision各不相同 |
| 真正进程退出与服务重启续传 | 独立合成基线1笔，再保留1笔待上传；测试进程退出，App/PG/entry重启，新进程恢复原batch，提交一次 |
| 重启后稳定态 | 原23笔收据保持一致；sent=0、reviewNew=0、Outbox为空 |

两组共25笔合成提交收据；历史359/359没有重验。`local-r5-restart-pending.mjs` 补足实际进程退出时仍有待上传队列的场景，使用新的独立合成 home/state，复用现有设备与 token。

脱敏结果：`output/r5-local-acceptance-final.json`（status=`local-isolated-acceptance-passed`）、`output/r5-entry-runtime.json`。原始 E2E 和待续传报告保留于私有验收目录，不含凭据的摘要已写到 D 盘。

三服务现保留运行且 healthy，其他本地 snowluma 和开发 incept-postgres 正常；本轮没有触发回滚。生产 v2/Caddy/授权/正式 state 未修改，正式 Agent 保持停止。真实来源新增事件、真实服务器入口/TLS/资源，以及生产迁移和正式授权/Owner确认继续作为发布验收项，发布 NO-GO。
