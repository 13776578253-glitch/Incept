# 风险、容量与分阶段实施

基线 `aefdab427ef90bf53f4f83c3713994735b582488`。优先通过可见行为和现有数据改进信息层级。读取契约、采集和同步的改造各自验收。

## 风险清单

| 等级 | 风险与复现条件 | 影响 | 缓解及验收依据 |
|---|---|---|---|
| 高 | Owner Billing 开启且 managed checkpoint 落后，客户端仅以 range 兼容就将 Billing 合入 Usage；或多个展示模型映射同个计价身份 | 费用混入不同 revision 或近似分摊隐藏日模型差异 | 优先独立显示 Billing 权威日、模型、渠道，显示 `revision/liveRevision/asOf`。后端交叉聚合前不要声称模型日费用精确。实测 stale revision、换库和异步更新。[计价审计](04-identity-and-billing.md) |
| 高 | 日级或回退时间在传输缺标志，Codex 差分可能跨桶 | 小时图出现人为尖峰，成本按错误峰时归属 | 先交付日摘要。分时试读引入证据分类与未归属量。回放 fixtures 覆盖当地午夜、mtime、日报和跨小时差分。[时间审计](05-temporal-and-query-capabilities.md) |
| 高 | 新详情/筛选绕过 public allowlist，或者权限不同的 ETag/缓存键复用 | Owner 路径、设备标记、会话或审计信息外泄 | 使用现有鉴权和投影，在服务端以角色/权限和数据身份隔离。Guest 响应和 SSR 明确验证敏感字段为空；Pro 继承现行边界。[publicDashboardSummary](../../../packages/dashboard/src/domain/public-summary.ts#L32-L73) |
| 高 | Pro 投影虽然省略独立设备字段，仍复制 `sessionKey`。该键的生成首段可来自 `deviceId`。可用含设备会话的合成 DTO 复现 | 新详情接口若重用可解析的键，会扩散内部身份。风险取决于实际数据模式与设备归因 | 新接口返回角色内稳定的 opaque key，来源追踪和旧接口兼容保持专项验收。不要推广旧键为公开设备筛选器。 [键生成](../../../packages/dashboard/src/adapters/local/aggregation/summarize.ts#L174-L190) · [Pro 投影](../../../packages/dashboard/src/domain/public-summary.ts#L65-L72) |
| 高 | 时长、请求、Agent 关系从活动跨度、event 计数、字符串命名推导 | 用户误读生产力或计费次数 | 独立命名 scoped session、observed event、活动跨度，采集有证据后增加真实请求和父子关系。[accumulateUsageEvents](../../../packages/dashboard/src/adapters/local/aggregation/accumulate.ts#L7-L17) |
| 高 | 改事件排序、作用域、哈希、代际或价格版本 | 破坏历史去重、账本连续性、账单对账与回滚 | 留下旧路径，新增语义版本尽量落在读取和投影。协议或费率变动进入独立评审并做旧版与新 writer/reader 双向测试。[同步完整性](06-sync-and-data-integrity.md) |
| 中 | 现有 Token 图把 cache write 归入 reasoning，Codex 原生写缓存未被采，Gemini tool/total 未出统一层 | 不同模型的分项效率对比偏差 | 先展示五个当前字段并标注覆盖，再在副本验证源字段是否为子集、额外量或统计定义不同。历史口径独立版本。[指标字典](03-metrics-dictionary.md) |
| 中 | 各窗口在不同 asOf 的旧快照相加；零日与失采混在一起 | 跨窗和长期趋势误判 | 快照对账固定 data identity、revision 与 asOf。带 source coverage 与 day status。真实旧样本存在差额，见 [对账附录](appendix-verification.md)。 |
| 中 | 客户端挂载延迟被当作传输延迟，筛选直接在全量会话上进行 | Owner 首屏拉取、解析、渲染长表成本大 | 首屏摘要投影、明细按需读取、服务端游标/稳定排序，复用现有快照和 revision 机制。[组件清单](appendix-ui-inventory.md) |
| 中 | 高并发组合筛选触发源扫描/快照重建 | 与 Sync 上传争用工人和内存 | 聚合读取复用同 revision 的 projection，区分读缓存与 refresh 控制。服务端合并同键请求，限制预算与队列，失败回退到有时间标记的最后快照。[snapshot-store](../../../packages/dashboard/src/adapters/runtime/snapshot-store.ts#L133-L199) |

## 当前性能证据与容量预算

- [真实旧快照](appendix-verification.md) 的 all 原尺寸约 641 KB、gzip 82 KB，sessions/projects 的 JSON 约 476 KB，占原载荷 74%。30 天和 7 天详情占比约 83%。这是磁盘 DTO 的 Node 序列化测量，服务器端传输、SSR hydration 和浏览器响应需要独立压测。主机测得一次文件解析约 5 ms，单窗重编码约 1–3 ms，未测网络和渲染。
- 同一次源码基线的本机采集回放处理 35,325 条正量记录，采集与三个窗口聚合耗时约 21.5 s，Node 进程峰值 RSS 约 1,087 MiB。它反映 Windows 上这批真实本地文件的冷扫描，包含原始文件解压与解析，对应的机器和运行路径不同于生产容器及 v2 账本读。UI 查询复用已发布数据的收益远大于把一次冷采集放进交互请求。 [方法和结果](appendix-verification.md)
- 本地聚合主体按事件扫描，空间由日×模型、月×模型、会话×模型、项目和来源维度共同决定。排序成本来自桶、模型和会话。缺价子集会再积累一遍。v2 projection 对事件排序并筛范围，trusted 发布会物化四个窗。每新增一个实时时间窗都独立织入后端并全表扫描，会增加 CPU 和内存峰值。[accumulateUsageEvents](../../../packages/dashboard/src/adapters/local/aggregation/accumulate.ts#L17-L104) · [summarizeUsageEvents](../../../packages/dashboard/src/adapters/local/aggregation/summarize.ts#L209-L233) · [projection](../../../packages/dashboard/src/sync/projection.ts#L30-L48)
- 读取 JSON、投影和计算 ETag 保持线性随 payload 增长。快照存储读取上限 64 MiB，使用 size/mtime 等 fingerprint 复用内存，trusted 刷新通过受限 worker。配置样本的应用内存上限 960 MiB，Sync worker V8 old-generation 256 MB，队列 16，超时 120 秒。这些是当前源码配置，部署实值属于环境核验项。[snapshot-store](../../../packages/dashboard/src/adapters/runtime/snapshot-store.ts#L54-L86) · [usage-validator](../../../packages/dashboard/src/next/usage-validator.ts#L6-L15) · [compose](../../../deployment/compose.production.yml#L93-L126) · [SyncExecutor](../../../packages/dashboard/src/sync/executor.ts#L43-L92)
- 建议首屏只传当前窗口摘要、时间系列及必要诊断。以 30d 摘要生 JSON 100 KiB、gzip 32 KiB 和 all 摘要生 JSON 250 KiB、gzip 64 KiB 作为首轮验收预算，分别量测 SSR HTML/RSC、Usage JSON、压缩和 hydration。控制单次会话分页默认 25–50 行，详情按 scoped key；在 10k、50k、100k+ 事件与 1k+ 会话夹具下分别测冷、热、过滤响应和刷新并发。初始目标为暖读 p95 250 ms（服务端）、交互 p95 100 ms（浏览器），用实际基线修订目标。
- 对日／小时采用稀疏桶和 bounded period，先通过读取接口暴露当前 projection；请求热点明确后再预聚合 `day×model`、`day×session` 和有权限的筛选维度。组合缓存键包含 data identity、revision、asOf/自然日、角色、筛选、粒度、计价 run/catalog。无界带设备和项目的任意组合缓存会提高基数。使用分页、结果裁剪与一次构建多桶，复用当前 SQLite 与 Worker。

## 路线与发布条件

| 阶段 | 改动和依赖 | 风险与兼容 | 收益和验收 |
|---|---|---|---|
| L0 现有功能与默认层级 | `packages/dashboard/src/react/`、宿主主题与加载边界。时间一级，概览为趋势和核心比较，清晰保留成本、来源诊断、导入、远程刷新、项目与会话入口 | 保持现有 Usage/Billing 权限、筛选与状态；部署开关维持当前配置 | 相同 fixture 比较旧新界面所有功能，Guest/Pro/Owner、移动桌面、暗光主题、按需加载和刷新全部覆盖 |
| L1 派生统计 | `domain` 或 UI 的纯派生函数，复用 daily/monthly/modelBreakdowns、五分量和模型会话数 | 空分母使用约定，兼容旧字段；当前窗之外的首次出现仍 unknown | 单日日摘要、周桶、加权缓存/生成比、模型迁移和历史吞吐峰值，逐桶同数据对账 |
| L2 读取契约 | 增量读 API 与 `sync/projection.ts`、运行时 snapshot、Next 路由、公有投影。有查询飞轮后才加 materialized 聚合。Billing 精确交叉维度需计费投影 | 避免把任意过滤变成对历史源的采集；旧 API 可并行；版本键和鉴权独立校验 | 日期自定义、每日活跃/首次观测会话、Owner 分页、精确模型日成本，验证合计、ETag、p95 与权限 |
| L3 数据扩展 | Collector/RawEvent/Transfer/Sync schema/read projection；时间证据、请求锚点、Agent 角色、模型原始身份 | 历史 recovery 以 unknown 或可证明区间为起点。新字段版本、校验、哈希、导入和回滚专项 | 小时高置信覆盖、可信请求和角色分析。混版本 fixtures、旧历史回放、跨桶合计和丢回执重试通过 |
| L4 数据新领域 | 实付/订阅账单、任务计时／工具事件、跨平台血缘或无法从现有源取得的身份 | 数据治理和新授权。独立保留币种、账单期、用户与设备隔离 | 明确数据源与同意范围，独立视图和验证，不替换底层使用量历史 |

下一步实现可直接按 [Gemini 交接](09-gemini-handoff.md) 的验收清单进行。源码修改的详细候选文件和分级见 [能力矩阵](07-data-capability-matrix.md)。
