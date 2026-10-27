# v4 固定快照发布收束

> 生产展示已于2026-10-20 10:47（Asia/Singapore）获批切换，10:50最终检查完成。实际生产版本、路径、内存、备份及回滚入口见 `2026-10-20-v4-production-display.md`。下文保留本地冻结与切换申请记录。

2026-10-20，Asia/Singapore。本记录取代早期远端独立 r5 验收部署计划。所有构建与发布前检查在本机完成，生产仅承载展示及备份。

本地最终状态：`ready_for_owner_display_cutover`。App 镜像、Agent ZIP、固定数据及迁移/检查脚本共19个制品与证据条目已冻结。总清单 SHA-256：`9b0be432dcdea2fc88e00692ceff79f2452041b4cf03bb74c6b7fb4171cdf67e`。

App 归档 369,405,440 bytes，SHA-256 `4ada7ac3965d791835fb3e894a781314dab140938c5e586c824fa5d2e5fedc9c`；OCI index `38b2a518f8a97d3b0d5663ed1e9955ac0b1d3ec60c85417887cfb05890539374`，linux/amd64 manifest `e894c5fc6508fddde9fdca3cf295c8858aa190131b290261dde54f13c4bbdbf9`，image config `44a7a29c91ec093c83370437d7b302dc98fac7a244d911c1ead5074ed9567b29`。

完整标准流水线通过：workspace类型检查、lint、workspace已启用测试、151项ops、Next生产构建（19页）。Dashboard489项通过；Agent81项通过，Linux中2项Windows平台检查按既有条件跳过，另在Windows复验verify-lineage30项通过；Web121项通过，55项依赖专用集成环境的测试按原有条件未启用。详细原因保存在App构建报告，未修改测试启用条件或降低正确性检查。

## 固定发布边界

本次固定为 362 scopes / 362 receipts、4,558,021,501 Token，含 641 条真实增量、77,490,990 Token；合成数据不在发布快照中。数据库文件 SHA-256 为 `9ceb73c0fb4f8d8627c03f3ad53237ddfd5fa7ddb95b80183f2dd05e90cff11b`。不因日志产生新 usage 重新生成，不重做导入、359/359 对账、合成 E2E 或真实来源验收。

12 项 Dashboard 失败均为旧 fixture/断言与已批准策略冲突：完整开头显式提供 last usage；缺失开头只建立锚点；诊断使用会话级 sessionIntegrity；无原时间不按文件 mtime归日期。四个测试文件更新后 52/52 通过，采集器与规范化算法没有修改。完整构建另修复 verify-lineage 测试的跨平台断言；Windows保留网络异常断言，Linux验证DPAPI前置错误。Windows该文件30/30通过。

## 冻结结果入口

最终 App 检查、平台身份和镜像归档：`output/release-app-build-2026-10-20.json`。

最终总清单和校验和：`output/release-candidate-2026-10-20/RELEASE-MANIFEST.json`、`SHA256SUMS`。此前 `PARTIAL-MANIFEST.json` 及 `SHA256SUMS.partial` 仅保存失败阶段证据。

Windows Agent ZIP 沿用已完成构建：SHA-256 `ee4a8ba78d88e90a2b57b8bb8a4085383333fe4ec9b4dcdcdbb6fdba47148b45`。其业务构建输入未变，后续仅测试文件变化；不因fixture修复重复打包。

## 增量衔接与 Agent 启用边界

只读检查362个head/receipt/设备身份，0 mismatch；三个真实增量scope原始文件13个定位均存在，12个JSONL已提交前缀匹配，SQLite原文件身份匹配。没有采集或提交新的usage。事件身份、signature、parent lineage、原始文件prefix证据及匹配receipt构成恢复水位；未确认batch保留本地outbox，确认后原子推进head，重复提交幂等。

正式 Agent 继续停止，启用前单独处理：当前源目录缺204个历史locator；候选尚未迁入两份开头缺失隔离ledger；候选故意保留空home、loopback endpoint、remote=false且不含凭据。需要核实保留的原始日志位置、隔离策略及正式设备/授权，再安装匹配的候选state并批准启用。这些事项独立于本次固定快照展示发布。

## 唯一展示切换审批范围

请求 Owner 批准的生产操作收束为：

1. 上传最终镜像归档、固定SQLite快照与SHA清单；校验传输哈希。
2. 在切换前备份当前App配置、当前SQLite及PostgreSQL，保留旧镜像恢复点。
3. 使用独立release目录保存固定SQLite，App挂载该路径，以trusted projection展示快照；替换当前App，不另起远端验收环境。
4. 保留当前PostgreSQL和Caddy路由，不用旧的 `production-copy.pgdump` 覆盖生产。旧dump仅是保留的历史备份/参考件。
5. 启动App并检查Ready与展示快照身份；失败恢复旧App与配置，保留卷和候选文件。

此审批不包含正式Agent启动、正式state安装和七来源授权变更。远端额外1.5GiB空闲内存门槛与新增staging不再适用于本次替换式展示发布。生产写操作仍遵循用户“暂不上传或修改生产，等待发布授权”的边界。

时间窗口在最终镜像归档完成后按实际制品大小确认；执行目标为批准后45分钟内完成上传、备份及展示切换。如上传或服务健康失败，立即报告实际阻塞并按上述回滚范围恢复。
