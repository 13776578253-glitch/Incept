# 自动上传与自动展示更新准备状态

2026-10-20，Asia/Singapore。本轮仅只读复核与汇报；生产、设备授权、正式Agent及state均未修改。

## 时间判断

完整接通“本机定时采集→自动上传→生产数据库增长→Owner与访客自动看到更新”，预计4–8小时有效工作，按1个工作日安排；随后12–24小时可在运行中观察。先接通健康来源上传预计2–4小时。工期从相关实施与启用范围获批后计算；等待Owner决策及自然产生真实usage的时间单独计算。

当前最大变量是204个历史定位的归档/隔离处置。目标是保留已确认历史水位、接纳健康新增，不要求恢复100%历史日志。若定位处理中出现新的文件身份/轮换冲突，工作量可能延长到1–2个工作日；以实际分类结果更新估算。

## 已经具备

- 生产v4展示已发布，362 scopes / 362 receipts、4,558,021,501 Token、revision387；独立可写运行副本位于 `/data/sync/v4.db`，冻结源副本和v2原数据保留。
- Agent二进制已构建；严格会话隔离、事件身份、prefix/lineage、receipt、幂等、离线持久outbox、分页恢复及丢失ACK处理已有通过证据。
- 362个候选state head/receipt与已发布数据库一致，候选outbox为空。
- 真实验收187条加Auto-review454条通过；Auto-review计用量、缺价。后续不重复导入这些数据。
- 正式设备 `REDACTED_ID` 本轮生产只读查询确认：七来源全部已授权，credentialVersion=1、revoked=false。旧正式本机三来源缓存已过时；Agent启动会刷新服务端政策。
- 定时采集代码每300000ms安排周期，和网页远程任务独立。`INCEPT_SYNC_REMOTE_ENABLED=0` 关闭网页远程job链路，直接定时上传接口仍由 `INCEPT_SYNC_ENABLED=1` 提供。
- Windows已有当前用户登录自启动与supervisor实现，尚未获批安装/启用。

## 明确阻塞和退出条件

| 项目 | 实际状态/影响 | 完成条件 |
|---|---|---|
| 历史源定位 | 当前sourceHome缺204个唯一locator，对应212份proof引用：Codex202、Antigravity9、Claude Code1；是定位检查结果，后续需区分封存、迁移或实际缺失。三个真实增量scope的13个定位均在 | 保留原始文件；有可信位置则验证定位/连续性；确认为封存历史范围则持久化隔离/封存决定，保留历史head，允许健康新增继续 |
| 新会话保护 | engine遇到同来源旧parent未见且未隔离，会对新scope产生ROTATION_UNVERIFIED；已有scope健康追加走自己的parent路径 | 关闭未分类的历史缺定位影响；保留普通事件、计数、日期和前缀的严格校验 |
| 正式state衔接 | 正式仍是旧39条state，发布候选是362条；候选token水位表目前仅3条；active isolation ledger=0 | 在独立副本迁入两份开头缺失隔离ledger、保留exact Auto-review政策，按已验证scope总量补Token水位；备份并原子安装正式候选，复用正式身份和凭据 |
| 两批旧review处置 | Claude Code67条、ZCode5条全部被v4精确覆盖，原batch及records完整归档，仍pending_owner_review | Owner确认保留归档、从迁移后的活跃上传队列排除；不制造旧batch committed收据 |
| 正式配置/启用 | 候选故意使用空home、loopback、remote=false且无凭据；正式Agent停止 | 核对真实home、正式HTTPS endpoint、现有设备和DPAPI凭据；单独批准state安装、启动及登录自启动 |
| 访客自动展示 | 当前公共接口读发布时生成的snapshots.json；v4 commit没有自动触发其重建。snapshot-store内存Map也不会自动重读外部文件 | 增加revision/日期驱动的有界刷新与内存失效，生成完整缓存后原子发布；失败保留上一份完整展示与可见更新时间 |

旧359条state缺少lineage_tokens时，已有代码报告newTokens=null/tokenDeltaKnown=false，成功提交后记录新总量。补齐候选Token水位是接续与观测准备，直接使用已确认scope总量，不重新计算历史usage。

两份开头不完整会话继续隔离，25,459,535个缺失前缀Token不强行补计；这类已知隔离按partial_success报告。其余来源暂无真实新增时保留“等待新数据”状态，不主动产生付费调用。

## 自动展示补齐范围

Owner接口已经走v4 projection，能读取数据库最新revision；公共接口及首屏读取独立展示缓存。目前代码中没有从commit到saveDashboardSnapshot的连接。

建议实现：成功提交触发或被读取时发现revision变化，合并为单个后台投影任务；每个range按revision和统计日期识别新旧。完整新缓存原子落盘后，App内存缓存能失效/重新载入。日期变化也触发7d/14d/30d窗口更新。已有浏览器每60秒读取数据；Agent自主采集周期5分钟，正常新增到网页的目标延迟约5–10分钟。

缓存刷新不依赖网页调用本机采集，不在每次guest请求中重扫原始日志，也不把重投影放进SQLite提交事务。沿用单任务与现有资源限额，当前服务器可用内存约1.10GiB，暂未发现必须扩容的阻塞。

## 收束执行顺序

1. 历史缺定位分类、封存/隔离处置：约0.5–2小时。
2. 完成独立候选state与配置、review处置准备：约0.5–1小时。
3. 补齐revision驱动的公共缓存刷新、内存失效及定向测试：约1.5–3小时。
4. 本机构建最终小更新，保留当前v4数据库原位发布：约0.5–1小时。
5. 获批启用后核对一次真实新增的event/receipt/revision/Token、一次无新增周期及页面更新，安装登录自启动：约0.5–1小时；等待真实usage时间另计。

随后运行中观察12–24小时：多周期、掉线恢复/进程恢复状态、最新receipt与展示revision、重复增量为0。已有历史对账、完整E2E、真实数据验收、来源授权及镜像身份修复直接沿用。

需要单独批准的范围是：两批review归档处置、正式state安装及Agent启动/自启动、为自动展示缓存补丁更新App。本轮未申请或执行这些变更。

## 证据

- `output/v4-auto-sync-readonly-status.json`：本轮正式七来源实际授权与App配置。
- `output/release-incremental-handoff-2026-10-20.json`：362项接续、204缺定位、13真实增量文件保留。
- `output/state-migration-review-coverage.json`：两批72条精确覆盖与Owner待决。
- `output/v4-production-display-final.json`：当前发布数据、健康、内存、备份与回滚。
- `apps/sync-agent/src/engine.ts`：signature去重、missing parent/rotation保护及接纳逻辑。
- `apps/sync-agent/src/cli.ts`：5分钟周期、启动刷新来源政策、独立remote job模式。
- `apps/web/src/server/sync/usage.ts`、`packages/dashboard/src/next/usage-route.ts`：Owner与公共读取路径。
- `packages/dashboard/src/adapters/runtime/snapshot-store.ts`：磁盘及内存缓存生命周期。
