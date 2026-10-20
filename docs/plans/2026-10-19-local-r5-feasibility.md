# 本地 r5 验收可行性与远端资源评估

时间：2026-10-19 21:23–21:25（Asia/Singapore）。范围：只读调查与方案评估；本轮未部署，未启停或修改任何容器，未修改 WSL 配置。

结论：**优先在本地 Windows + Docker Desktop/WSL2 完成独立 r5 协议与故障恢复验收。** 本地资源和镜像已具备基础条件，部署前还需设置项目资源上限、准备独立数据库副本和测试凭据。真实服务器保留部署、入口、资源与正式切换验收。发布 NO-GO，正式 Agent 保持停止。

## 1. 关闭已完成工作

v4 离线 **359/359 匹配、数据差异 0** 已通过，直接复用结论。本轮没有读取实际 lineage 做逐项验证，没有重新导出数据或重复离线对账。后续只复制已验收基线用于新的运行测试；增量验收记录新增事件与前后差值，不重新开启历史恢复任务。

## 2. 本地资源实测

| 项目 | 实测 |
|---|---|
| Windows 可见物理内存 | 34,163,953,664 bytes，约 31.82 GiB |
| Windows 当前可用物理内存 | 4,834,222,080 bytes，约 4.50 GiB |
| Windows 逻辑处理器 | 16 |
| WSL2 配置 | memory=24GB；processors=8；swap=16GB；networkingMode=mirrored |
| Docker 引擎 | 29.7.2，Linux/amd64，WSL2，containerd/overlayfs，运行正常 |
| Docker 可见内存/CPU | 23.47 GiB / 8 CPU |
| WSL guest MemAvailable | 23,101,204 KiB，约 22.03 GiB |
| WSL swap | 16 GiB，采样时未使用 |
| Docker data 文件系统空闲 | 876,717,392 KiB，约 836.10 GiB |
| D: 空闲 | 3,032,994,414,592 bytes，约 2.76 TiB |
| 本地隔离 project/volume/network | 未发现 incept-v4-acceptance 同名资源 |
| 本地监听端口 | 未发现 3305/13305 监听冲突 |

Docker/WSL 的可见内存与 Windows 可用内存不相加作为额外容量；以宿主当前约 4.5 GiB 的物理余量规划新增工作。

现有两个运行容器：snowluma 约 529.7 MiB，开发 incept-postgres 约 35.45 MiB。另有 61 个停止容器，未启用它们。新的验收 PostgreSQL 使用独立 project 和 volume，不能复用开发 incept-postgres 的数据库或身份。

配置细节：当前 `.wslconfig` 将 autoMemoryReclaim 放在 [wsl2] 节；[Microsoft 文档](https://learn.microsoft.com/windows/wsl/wsl-config) 将它列于 [experimental]。当前可行性判断不依赖该设置生效，本轮不调整全局配置或重启 WSL。

## 3. 镜像与构建物

- 本地 r5 与 PostgreSQL 16 镜像均已缓存，准确身份沿用已完成的三类 digest 检查；不需要在 2 GiB 生产服务器构建镜像。
- r5 index：`sha256:cc705ce22cea38b1a8c01cea28fe1e1dd2ca6cbae500516f00eaee6c497d6685`。
- 原 r5 归档仍在 `output/incept-r5-original.tar`，369,071,104 bytes，既有 SHA-256 为 `e4aff06146629725e714ef537d22342abe4393e1cca1081a0f1ab6324d639e60`。
- `output/r5-image-evidence.json` 与 `output/r5-local-preparation.json` 均存在，镜像图证据及校验工具已准备。
- 本地独立验收用的 v4 SQLite、PostgreSQL 副本与新测试凭据尚未部署。本轮不跨主机传输完整数据库；后续明确副本范围、存储位置与凭据隔离后再执行。

## 4. 本地部署建议

沿用已有独立 Compose 结构，不挂生产 shared、生产 secrets、正式 Agent state 或开发数据库；App 与 PG 各用独立卷，网络 internal，入口只绑定 loopback。

部署前将以下限额加入独立配置并同步静态门禁：

| 组件 | 建议上限 |
|---|---:|
| r5 App | 768 MiB、1–2 CPU |
| 独立 PostgreSQL | 384 MiB、1 CPU |
| 故障注入代理（按场景启用） | 128 MiB |
| 临时开销、页缓存及测量余量 | 总预算补足到约 2 GiB |

应用角色与恢复管理员分别生成凭据；测试 Owner/设备凭据仅写独立 PG 副本。现有 Compose 模板尚无这些容器内存上限，部署前要补齐，而不是直接以无限额配置运行。优先使用 Docker named volume 中的 Linux 文件系统存放 PostgreSQL/SQLite，Windows 侧只保留交付文件与证据。

使用已构建 r5，依次运行单个场景，不并发做 Next/镜像全量构建。进入测试前重新采样宿主余量；需要回收资源时先停止本项目的故障注入/验收负载，不影响现有两个本地容器。

## 5. E2E 分工

| 验收内容 | 本地可完成的部分 | 真实服务器部署后的必要部分 |
|---|---|---|
| 镜像和服务身份 | 相同 r5 图、linux/amd64、配置/数据库路径、非 root 权限 | 目标引擎 docker load 后的实际身份、宿主卷权限与服务路径 |
| 七来源真实增量 | 在真实新增事件出现后，由独立 Windows 测试进程采集至本地 r5；核对新增 Token、receipt、projection | 正式切换且单独批准启用 Agent 后，观察真实 endpoint 的持续增量 |
| 离线持久化 | 只阻断测试 endpoint，新增事件入独立 outbox；恢复后上传一次 | 实际 Windows→服务器公网连接恢复及真实入口行为 |
| 上传中断 | 测试代理在指定 page/offset 断开；检验续传、去重及最终 receipt | 实际 Caddy/网络超时、链路长度、真实代理配置 |
| commit 后 ACK 丢失 | 服务端提交后丢弃响应；重启独立测试进程，复用批次并获取 receipt | 真实部署入口下进行受控演练或复核对应运行证据 |
| Agent/App/worker/PG 重启 | 只重启本项目测试进程/容器，校验队列和提交持久性 | 服务器重启策略、卷持久化、磁盘行为及恢复顺序 |
| 设备鉴权/授权 | 独立 PG、独立 token/Owner 下验证失效、来源范围及 reauth | 正式设备、Owner 确认、真实密钥与网关配置 |
| Dashboard | trusted projection、增量可见性、48 unpriced 的表示 | 正式域名下的权限、缓存、真实请求和展示 |
| HTTPS/WebSocket | 可用本地 TLS/故障代理验证协议行为 | 真实 DNS/TLS/Caddy、网关路由、证书、Origin/Cookie/代理头、443 与公网 WebSocket |
| 资源和性能 | 测量测试内存/CPU、可复现压力和 OOM 机制 | 真实 2 GiB 主机余量、共存负载、磁盘容量/IO、持续稳定性 |
| 迁移与回滚 | 在旧正式 state 副本上重演流程，保留两批 review 的处置依据 | 真实备份、实际 state/服务切换、回滚路径与正式 Agent 最后启用 |

真实增量必须来自实际来源新增事件；合成 fixture 另外标记，不替代真实新增使用。全机 WSL/Windows 重启会影响现有本地工作负载，另行安排；常规恢复测试优先只重启独立项目。

本地验收完成后继续保留上表服务器列的发布门槛，不把所有恢复场景都推迟到生产主机执行。

## 6. 远端资源占用与可减少项

采样主机总内存约 1.90 GiB，MemAvailable=1,046,340 KiB，约 1.00 GiB；已有 swap 约 4 GiB，采样仅少量使用。容器 CPU 接近空闲。

| 容器 | Docker 内存工作集 | 判断 |
|---|---:|---|
| incept-staging-app（旧 r3） | 137.4 MiB | 优先审查的停用候选 |
| incept-app-1（生产 v2） | 180.3 MiB / 768 MiB limit | 保留，承担生产 App |
| incept-proxy-1 | 26.3 MiB / 96 MiB limit | 保留，实际入口 |
| incept-sync-gateway-1 | 47.2 MiB / 128 MiB limit | 保留，Caddy 的 /api/sync/ws 上游 |
| incept-postgres-1 | 31.12 MiB / 384 MiB limit | 保留，生产数据库 |

旧 r3 的证据：无宿主发布端口、无 app DNS alias、remote=0；Caddy 实际 upstream 仅 app:3000、sync-gateway:3101，没有指向 staging；单次连接采样为0。它仍在生产网络且拥有生产 shared 写挂载。停用前需确认无内网调用及保留启动参数/卷/日志，然后单独批准操作。

按137.4 MiB工作集作算术估计，回收旧 staging 后可用内存约 1.13 GiB，仍低于已批准方案1.5 GiB门槛；实际释放量需要操作后测量。减少现有容器 limit 不会自动释放尚未使用的额度。清理旧镜像/停止容器主要释放磁盘，对本次内存门槛帮助有限；无需为此执行 prune。

因此可以优先审查旧 staging 的退出，但它不是在当前主机上新增完整 r5+PG 的充足资源方案。若未来仍希望在该主机共存，需另做有固定上限的小内存配置、峰值与稳定性验收，或扩容/另选主机；本轮不放宽已批准门槛。

## 7. 后续工作与边界

建议下一阶段：准备本地资源限额与副本交付方案 → 单独批准本地部署及所需数据传输 → 运行本地协议/增量/故障恢复 E2E → 汇总服务器部署剩余门槛。

旧 staging 如需停用，另列影响与回滚动作并申请；本轮不停止、不更新、不重建任何本地或远端容器。正式 Agent 继续停止，发布状态 NO-GO，历史359/359验收维持关闭。
