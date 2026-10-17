# Sync Agent Phase 0B：可执行证明与验收记录

日期：2026-10-16（Asia/Singapore）。源码：`aef64f4`，分支 `codex/production-readiness`。

## 1. 结论与范围

**BLOCKED，继续暂停 Phase 1。** B2/B3/B4 的候选规则已有隔离证明；B1 的真实历史证书仍缺失。测试绿色包含成功拒绝/隔离的反例，准入依据见 [数据契约](sync-agent-phase0b-contract.md)。

开始工作树只有上一轮未跟踪的计划、研究文档、Phase 0 fixtures/tests/benchmark/config。没有已跟踪文件修改。原有225个测试及 Phase 0 错误行为复现保持原样。

本轮只在 synthetic home、隔离 SQLite 和测试配置中操作。没有读取真实 AI 对话日志或生产环境变量，也没有连接生产 SQLite/PG。原型所有表名均为 phase0b_*；它重放 JSON 日志来证明正确性，性能策略另由正式实现决定。

设备/Owner身份参数是测试服务端已解析上下文的桩；原型审计主体使用fixture-owner。真实凭据验证仍属于Phase2。

## 2. 修改文件

| 新增路径 | 作用 |
|---|---|
| `packages/dashboard/src/__tests__/phase0b/phase0b-contract.ts` | 候选 identity/fingerprint、generation/evidence、adoption、价格规则 |
| `packages/dashboard/src/__tests__/phase0b/phase0b-evidence.ts` | JSON/SQLite 冻结、三 root 核验、真实 collectors、完整性与弱身份检查 |
| `packages/dashboard/src/__tests__/phase0b/phase0b-shadow.ts` | 隔离日志、projection、versions、memberships、audit/receipt、重入迁移、故障注入 |
| `packages/dashboard/src/__tests__/phase0b/phase0b-proof.test.ts` | 82个参数化展开测试，覆盖 B1～B4 与统计回归 |
| `packages/dashboard/tsconfig.phase0b.json` | 本轮独立类型检查 |
| `docs/research/sync-agent-phase0b-contract.md` | 数据契约与逐项准入判断 |
| 本文件 `docs/research/sync-agent-phase0b-proof.md` | 证据、命令、差异与停止条件 |

原型无运行时 exports，生产代码不引用该目录。已有 Phase 0 文件没有被修改。

## 3. B1：正例、反例与 Codex 累积修订

### 3.1 逐来源执行结果

| 来源 | 受控完整 fixture 的100→120 | 普通一致 snapshot | 半写/损坏/进行中 | origin缺失 |
|---|---|---|---|---|
| Codex | 单 session 可见input120 | quarantine | partial；额外检查累计前缀 | unavailable |
| CommandCode | input120 | quarantine | JSONL半行 partial | unavailable |
| Claude Code | input120 | quarantine | JSONL半行 partial | unavailable |
| Gemini CLI | input120 | quarantine | 半写JSON partial；缺timestamp partial | unavailable |
| Antigravity | input120 | quarantine | metadata损坏 partial | unavailable |
| OpenCode | input120 | quarantine | message.data损坏 partial；DB损坏 failed | unavailable |
| ZCode | input120 | quarantine | running usage partial | unavailable |
| AIUsage fallback | 弱session替换input120 | quarantine | 原生历史覆盖未获证明 | 历史范围由原点登记约束 |

正例的 fixture 证书登记 scope/evidence/observations 摘要，并核对 writer 已知的计数；没有登记证书的相同字段请求仍会被隔离。原型中该证书名为 fixture-certified，真实 collector 只产出 snapshot-only。

### 3.2 Codex 多条累计记录

使用真实 Codex collector 解析同一 session 的三个累计点，cache/output/reasoning 在本例归零以单独核验 input 差分：

| generation | 原始累计input | 应得差分 | 会话当前input | 相对上一代净变化 |
|---|---|---|---:|---:|
| G1 | 50,100,200 | 50,50,100 | 200 | 基线 |
| G2 | 50,120,200 | 50,70,80 | 200 | 0 |
| G3 | 50,120,220 | 50,70,100 | 220 | +20 |

中间修订同时改变两个差分，而不是向旧集合追加一条20或120。独立单事件用例验证 input100→120 最终为120；旧 Phase 0 的220错误复现用例仍保留。

### 3.3 其他完整性/身份测试

- 无原生 ID 的 CommandCode/Claude/Gemini/Antigravity/ZCode 按 session 实体替换，不依赖旧计数 hash；AIUsage 同理。
- CommandCode 前插行导致现有行号 ID 改变；旧 origin 路径被改名后返回 unavailable，不把文件名近似匹配当作认领。
- 相同时间/计数的相邻无 ID Claude 行产生歧义，进入隔离。
- 七来源显式八天前时间仍进入 generation，不用事件时间过滤。
- 读取期间原始文件改变，或原始前后 root相同但冻结副本不匹配，都返回 partial。
- Gemini 合法截断能通过语法及稳定读取；两世界反例进一步得到完全相同的当前字节和 collector evidence，但已知历史总量分别为100/200。这是 B1 尚未关闭的实际原因。

## 4. B2：adoption、迁移、重试和事务证明

使用真实 v1 `previewImport/commitImport/rollbackImport` 创建隔离 batches，再以 readOnly 读取 source DB，迁移到独立 phase0b-shadow.db。

| 场景 | 断言 |
|---|---|
| 没有原点证明直接上传v2 | LEGACY_ADOPTION_REQUIRED；旧input100保持 |
| 一对一adoption | 所有旧位置关联到明确 scope/entity IDs，记录 batchChecksum、旧ID、mapping rule、evidenceHash |
| 一对多/多对一 | review-required；保留旧数据；review记录可重建 |
| source真实变更、跨设备认领 | conflict；设备不能执行adoption |
| 相同原点另一设备抢占 | ORIGIN_ALREADY_OWNED |
| 两个独立注册原点的ID碰撞 | 两个设备各自一个实体，不覆盖；相同来源/会话/键也由设备命名空间区分 |
| 同名不同session/source | 逻辑 identity 不同 |
| v1两个重叠批次 | input700，回滚其一仍700，全部回滚为0 |
| v1→v2修订后rollback旧batch | 修订120保留；回滚v2修订回到100；所有支持停用后为0 |
| 中断迁移 | 第一批后中断，关闭/重开后继续；已迁移batch不重复 |
| 重放和重建 | 同迁移再执行、projection重建两次，entity/version/membership/receipt/revision全量dump相同 |
| 迁移后真实v1 rollback | 追加状态/receipt事件，原payload不变；重复迁移不复活membership |
| projection损坏恢复 | 人工清除隔离projection/revision后，从日志重建得到原完整dump |
| v2同batch重试100次 | 同一回执，dump与revision均不增长 |
| 同batch不同payload | BATCH_ID_REUSED_WITH_DIFFERENT_PAYLOAD |
| stale parent/篡改hash | quarantine；旧可见集不变 |

**故障注入：** after-log、after-version、after-projection、before-receipt 四个位置逐一失败。独立 readOnly SQLite 连接在写事务进行中读取，始终看到此前 input100 和此前 revision。失败后完整dump不变；重试一次成功为120；关闭/重开后同batch仍返回同回执。

shadow 的已认领旧 membership 在兼容读取前被排除；统一 read model选择当前 generation。switch 标记持久化。为了准确复用 v1 规则，原型将剩余 legacy 写入另一个隔离 compat DB，调用真实 loadImportedEvents 作为兼容 oracle；这不改变生产读路径。

## 5. B3/B4：价格、删除与回滚证明

| 用例 | 结果 |
|---|---|
| Token/model/project/recordedCost 表驱动修订 | 完整fingerprint变化；当前视图始终一个实体 |
| v2冻结basis | 100input、20output、10cacheRead费用0.000145 |
| 隐式input价格1→2 | EXPLICIT_REPRICE_REQUIRED，旧费用保持 |
| Owner显式reprice | 费用0.000245；审计前版本、actor/reason、新basis；设备发起被拒 |
| reprice rollback | 恢复0.000145 |
| alias变化 | 隐式操作拒绝；显式重算后resolved model变化，raw model保留 |
| v1/live接收端override | 0.000145→0.000245，与现有loader完全相同 |
| CommandCode peak/off-peak | nominal0.2；peak0.4/offPeak0.2，估算单独保存；重复apply仍0.4 |
| 缺参考价而有recordedCost | 保留录得费用；apiEquivalentCost=null |
| complete但无显式replace的移除 | EXPLICIT_SESSION_REPLACEMENT_REQUIRED |
| 强anchor移除清单不相符 | REMOVAL_SCOPE_MISMATCH |
| 有证据的完整替换/空generation | 只停用本scope旧表示；rollback可恢复 |
| partial/unavailable/failed空结果 | 保留旧input100 |
| 已回滚generation换batch重放 | ROLLED_BACK_GENERATION，不复活已回滚集合 |
| 设备撤销 | 历史200保留；新上传和旧batch重试都拒绝 |

费用兼容采用已说明的 legacy/native live 与 v2 frozen 两种来源语义。UI 仍使用原代码；apiEquivalentCost 只是候选原型字段。

## 6. 统计基线对照

固定时区 Asia/Singapore、now=`2026-10-16T12:00:00Z`。七来源各一会话，在前一日/15天前/45天前各一条，input100、output20、cacheRead10、cacheCreate5、reasoning3。价格input1/output2/cacheRead0.5/cacheWrite3 USD/M。

| 范围 | input | output | cacheRead | cacheCreate | reasoning | total | sessions | cost USD | v1→统一projection差异 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 7d | 700 | 140 | 70 | 35 | 21 | 966 | 7 | 0.001162 | 0 |
| 30d | 1400 | 280 | 140 | 70 | 42 | 1932 | 7 | 0.002324 | 0 |
| all | 2100 | 420 | 210 | 105 | 63 | 2898 | 7 | 0.003486 | 0 |

全对象对比覆盖 totals/costs、daily/monthly、models、sources、projects、sessions；仅对集合/并列数组和合成source列表排序后比较，所有字段值保留。adoption后的记录保留最早legacy祖先batch引用；新generation与完整成员关系由审计表表达。

另有 CommandCode 深度对照：一个峰值、一个谷值，合计0.6，peak0.4/offPeak0.2；v1 与 v2的模型/项目/日汇总相同。手动project mappings在legacy和adoption后保持目标项目；native优先用例也保持一份。

与 Phase 0 的 total910/1820/2730 差异来自本轮主动增加的非零cacheCreate/reasoning，每条多8 token；同一fixture的迁移对比差异为0。

## 7. 命令、测试与类型差异

继续使用已安装本地二进制，避免上一轮 Corepack 下载 DNS 问题。PowerShell 的 TEMP/TMP 限定在仓库 .scratch，沿用已验证的 Vitest 沙箱修复。

```powershell
# 仓库根
$env:TEMP = 'D:/Desktop/code/code/Incept/.scratch/sync-agent-phase0b/tmp'
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null

# 工作目录 packages/dashboard
./node_modules/.bin/vitest.cmd run
./node_modules/.bin/tsc.cmd --noEmit -p tsconfig.phase0b.json
./node_modules/.bin/tsc.cmd --noEmit -p tsconfig.src.json
./node_modules/.bin/tsc.cmd --noEmit -p tsconfig.node.json
./node_modules/.bin/tsc.cmd --noEmit -p tsconfig.json

# 仓库根：复用既有eslint配置，关闭只适用于Next页面目录的规则
./apps/web/node_modules/.bin/eslint.cmd --config apps/web/eslint.config.mjs --rule '@next/next/no-html-link-for-pages: off' packages/dashboard/src/__tests__/phase0b
git -c core.fsmonitor=false diff --check
```

| 检查 | 结果 |
|---|---|
| 变更前完整Dashboard | 26文件、225测试通过 |
| 变更后完整Dashboard | 27文件、307测试通过，新增82例；旧38个Phase0行为复现保留 |
| Phase0B独立typecheck | exit0 |
| 原domain/adapters typecheck | 两项exit0 |
| Dashboard全量typecheck | 前后均exit2、36条诊断；保存before/after日志逐行Compare-Object无差异 |
| 变更文件ESLint | exit0，0 errors、0 warnings |
| Web/PG | 本轮未重跑；原Web Prisma/测试类型问题和PG跳过状态仍按P0登记，未为本任务修复无关环境 |

完整类型诊断及临时DB位于 `.scratch/sync-agent-phase0b/`，不加入提交。没有新增运行时业务类型诊断。

## 8. 性能、Owner事项与停止位置

沿用 P0 实测参考：本机15696事件全扫描约3.70秒、541MiB RSS。本轮没有重扫真实历史，也没有新增常驻进程资源承诺。shadow 为小样本正确性 oracle，限制单generation500条；全日志重建/隔离compat DB不作为Phase1吞吐或存储方案。

本轮没有新增必须Owner选择的产品政策。方案A与保守隔离已获授权；B1余项是来源连续性和历史资格证明。最小复验动作见契约第3节：先实现非fixture证书的证据适配实验，再验证两世界/合法截断/弱改写/归档反例。

最终停在Phase0B的BLOCKED门槛。Phase1～6未开始；没有生产迁移、部署或Windows自启安装。回滚本轮仅移除本页列出的7个新增文件和本轮隔离产物，保留所有P0及用户文件。
