# 本地 r5 入口修复：待启动授权

2026-10-19。工作目录：`D:\Desktop\code\code\Incept\.worktrees\trusted-sync`。

状态：配置准备与检查阶段；未启动本次修改后的容器。正式 Agent 保持停止，发布 NO-GO。历史 v4 359/359、差异 0 的离线对账直接沿用。

## 原因与版本

只读实测 Docker Desktop 4.89.0、Linux Engine 29.7.2/API 1.55、Compose 5.5.0、WSL2 kernel 6.6.87.2。

上次 App 仅连接 `internal:true` 网络，声明 HostConfig `127.0.0.1:3305 -> 3000`，但运行时 NetworkSettings.Ports 为 `3000/tcp:[]`，Windows 请求 ECONNREFUSED；App/PG 当时均 healthy。原因定位为 internal-only 网络下发布端口未形成实际入口，与 Moby 的相同拓扑问题吻合。[Moby 维护仓库讨论](https://github.com/moby/moby/discussions/53256)记录了相同 HostConfig/运行时差异；[实现](https://github.com/moby/libnetwork/blob/master/endpoint.go)对 internal 网络跳过 ProgramExternalConnectivity。按网络拓扑修复，不调整 Engine 或全局 WSL 配置。

## 最小变更

```text
Windows 127.0.0.1:3305
  -> entry:8080 -- ingress（普通 bridge，唯一发布端口）
       |
       app_entry（internal）
       |
      App:3000
       |
       acceptance（internal）
       |
      PostgreSQL:5432
```

- App 移除 ports，只连接 acceptance 和 app_entry 两个 internal 网络；PG 保持仅连接 acceptance，无发布端口。
- 新增 entry，连接 app_entry 与普通 ingress。固定 HTTP 上游 `app:3000`，不读取动态上游参数；拒绝 CONNECT、Upgrade、absolute URI 与危险路径。保留请求体、流式响应及应用认证；清除转发身份和逐跳头，重建 localhost 转发头。请求体上限 2 MiB。
- entry 复用缓存的固定 digest Node 24 镜像，只读挂载 D 盘 `deployment/v4-http-entry.mjs` 单文件，无数据库卷、token、Owner 或密钥挂载。非 root、只读根文件系统、cap_drop ALL、no-new-privileges；IPv4/IPv6 forwarding 均关闭；64 MiB/0.25 CPU/32 pids。
- App/PG 没有普通网络出口。entry 不连接 PG 网络；关闭转发且无 NET_ADMIN，不能充当 App/PG 的 IP 网关。代理代码只向 App 发起 HTTP；运行时出口检查列为启动后的首批门禁。
- `check-v4-isolation.mjs` 对允许的网络、端口、挂载、镜像、安全选项、资源及环境逐项白名单校验；代理和隔离配置均有正反例测试。

复用既有三个独立卷（启动前必须全部存在，缺失即停止）：

1. `incept-v4-acceptance_v4_data`
2. `incept-v4-acceptance_pg_data`
3. `incept-v4-acceptance_acceptance_secrets`

复用私有目录 `%LOCALAPPDATA%\Incept\v4-acceptance-20261019` 中现有 acceptance.env、config.json、token.txt、test-owner.json；不重新导出、恢复数据库或生成身份。禁止重跑初次安装脚本 `local-r5-setup.mjs`。

## 启动前检查与审阅证据

在工作目录运行只读脚本（本轮执行，不包含 up/create/run/exec）：

```powershell
$env:INCEPT_V4_ACCEPTANCE_DIR = '%LOCALAPPDATA%\Incept\v4-acceptance-20261019'
node scripts/archive/local-r5-entry-preflight.mjs
```

脚本使用现有私有 env 在内存中执行真正的 Compose render 和隔离校验；不将包含密码的 render 写入 D 盘。检查卷归属、无项目容器、Docker 3305 无占用、三个缓存镜像及 r5 三层镜像身份图。Windows 监听端口另行只读检查。D 盘 `output/r5-entry-review.json` 只保存脱敏检查结果与文件 SHA256，供启动前核对。

本轮结果：真实 Compose 渲染和隔离门禁通过；保留三个卷与缓存镜像均已核实；r5 镜像三层身份图匹配；Windows 和 Docker 均无 3305 监听占用。代理测试 13/13、隔离配置正反例 121/121 通过，`git diff --check` 通过。测试只使用合成本机临时 HTTP 服务，没有访问真实验收端口或数据库。当前项目无容器，等待启动授权。

## 申请授权的启动操作

仅在用户批准本方案后，核对上述检查仍通过、3305 未被占用、审批文件 hash 未变，再执行：

```powershell
docker compose --project-name incept-v4-acceptance --env-file %LOCALAPPDATA%\Incept\v4-acceptance-20261019\acceptance.env -f deployment/compose.v4-acceptance.json up -d --wait --pull never entry
```

该命令只启动本地验收项目 entry 及其 App、PG 依赖，复用原卷；不构建或拉取镜像，不触及 snowluma、开发 PG、生产 v2、Caddy 或正式 Agent state。

## 启动后的放行门槛

按顺序执行，任一项失败即停止 E2E 并汇报：

1. inspect 三服务：只有 entry 的 NetworkSettings.Ports 实际发布 `127.0.0.1:3305 -> 8080`；App/PG 无发布端口；三网络成员和 internal 标记与渲染一致，entry forwarding sysctl 为 0，安全配置生效。
2. 从 Windows 请求 Ready 成功，再用现有测试 token 核对 `/api/dashboard/sync/agent` 的 deviceId 和七来源；从 App 连接 PG 只读查询数据库名、应用角色权限，确认服务与独立数据库身份一致。核对实际 App 镜像的 index、linux manifest 与 config 图。
3. App 与 PG 网络命名空间无 IPv4/IPv6 外网默认路由；对至少两个公网数值地址的 TCP 探测失败，检查外部 DNS 解析是否关闭。PG 缺少工具时，允许用已缓存 Node 镜像启动无挂载、只读、cap_drop ALL 的临时检查进程，`--network container:<本项目PG容器ID>`，检查完即删除；不连接别的网络。entry 拒绝 CONNECT、absolute URI，固定上游仍为 App。任何外网成功连接都阻止 E2E。
4. 门槛通过后才运行既有 `local-r5-e2e.mjs --phase before-restart`：七来源合成日志经真实 HTTP 上传、增量、离线队列、分页中断、commit 后 ACK 丢失及 AgentState 重开。到脚本暂停点后仅重启本项目 App/PG（必要时 entry），运行 `--phase after-restart` 验证续传与 no-change。结果标明合成数据；历史359条不重验。真实来源新增事件与真实服务器部署验收保留各自门槛。

## 回滚

若启动或运行门槛失败，停止推进并报告。需移除本次验收服务时，仅在本项目执行下列回滚（本次启动申请同时涵盖此回滚），保留数据与凭据供排查：

```powershell
docker compose --project-name incept-v4-acceptance --env-file %LOCALAPPDATA%\Incept\v4-acceptance-20261019\acceptance.env -f deployment/compose.v4-acceptance.json down
```

不使用 `--volumes`、volume rm 或 prune；回滚后核对三个卷仍在，现有其他本地容器状态正常。修复配置保留于 D 盘供审阅，不自动恢复旧 internal-only 端口方案。
