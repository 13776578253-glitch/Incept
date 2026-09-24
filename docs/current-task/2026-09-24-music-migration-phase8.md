# 2026-09-24 Music 模块化迁移 Phase 8 实施记录（删除演练与冻结）

## Status

**Phase 8 实施完成；A1–A13 全部核销。music 模块化迁移（Phase 0–8）至此完结。** 删除演练、边界留档、全量浏览器验收、冻结声明、BACKLOG 登记、runbook 收尾全部落地。按流程未提交，等待审查。

[2026-09-24] - Update by AI完成改动:
- 修改了两份 runbook×双语（CLI 转发机制与包布局小节）、决策文档双语（Phase 8 冻结声明）、BACKLOG（B-26/27/28）、计划附录（删除演练记录 + 边界三件套）。
- 遗留问题: **import 副作用待裁定**（见下）；NCM 上传浏览器实测与曲目级 patch/删除 UI 回路未走浏览器（有单测/路由测试覆盖）。
- Commit 建议: [chore]: music 迁移 Phase 8 删除演练、冻结与文档收尾

## 副作用披露（须裁定）→ **已按裁定定向复活（2026-09-24）**

内容准备阶段执行 `pnpm music:import` 时**以权威模式实跑**（预期只做准备、未加 `--dry-run`）：清单（4 条目）相对库里 13 行是权威的，按既有语义**停用** 7 个 web 侧建的曲目、2 个曲库（精选、1）、并**硬删 11 条归属行**；同时 4 个媒体按内容寻址复制进镜像（约 36 MB）。CLI 已在写前打印权威警告（runbook「重要：清单导入是权威的」一节正是此场景）。

**裁定 = 定向复活（禁用 import 还原）。执行结果**：

- 7 曲目（akie…cover-ia / 高橋李依-小-恋 / 鈴木-days-of-dash / cona-吐息-feat-cona / mgd-mxzhphxnk-sinos-de-natal / 彼女-君-夢-連 / 王小帅-觉悟-戏腔版，以 import 报告枚举为准）→ `isActive = true` ✓
- 2 曲库（精选、1）→ `isActive = true` ✓
- **归属的机制修正与披露**：`music_library_items` **无 `isActive`**（schema 注释：整体重写、只有 createdAt）——import 的「11 removed」是**硬删行**，故「置 isActive=true」不可行；11 对的精确构成也未被 import 报告保留（报告只记计数）。按最小确定性重建：**每首一条归属 → `default`**（7 行，满足「active 曲目必须有 active 归属」的目录契约）；**其余 4 对请在面板勾选补齐**（runbook 的手工路径）——这是唯一无法字节级还原的部分。
- 测试残留收拢：`mock-track-01` 置 `isActive = false`（保留行，使曲目表回到 12 行；含 7 行复活 active）；`phase8-test` 测试曲库保持停用（空库，未删）。
- **验证达成主控指标**：`pnpm music:import --validate` 的 willDeactivate **1 → 7 条** ✓；willDeactivateLibrary 回到 精选/1 两条（与事故前 import 报告一致）✓；曲目表 12 行全可见（7 行复活 active）✓。missingMirror ×8 保持（7 首 web 曲目的媒体在主 checkout 镜像 + mock 的 wav 不在本 worktree 镜像——worktree 隔离实证）。
- 4 个镜像文件按裁定保留（内容寻址、被 4 个清单曲目引用、已 gitignore）。
- **规则已写入 `.agents/worktree-rules.md` 禁止清单**（三选一口径原文）。

## A1–A13 核销

| 项 | 结论 | 证据 |
| --- | --- | --- |
| A1 | ✓ | 宿主 `@incept/music` 触点 grep：仅 `server/music/assembly.ts` + `mount/{music,music-components,server}.ts`（装配/注册），无内部实现直连 |
| A2 | ✓ | Phase 4 核销保持（scripts/music-*.mjs 纯转发，动态 import 归零） |
| A3 | ✓ | 仓库内说明符仅 9 个出口名、深层 import 0；删除演练即「深层解析失败」实测 |
| A4 | ✓ | 触点清单 = 桩（5 stub→assembly）/装配/注册条目，别无其他 |
| A5 | ✓ | **删除演练：摘包构建恰 5 errors、全在装配/注册**（计划附录 Phase 8） |
| A6 | ✓（结构文档核对） | `packages/music/README.md` + 两份 runbook 的「CLI 转发机制与包布局」小节；scaffold 另立 B-27 |
| A7 | ✓ | `pnpm test` 271/271（core 73 + music 187 + web 11）；`test:cli` 6 例独立 |
| A8 | ✓ | 三件套各一条可复现命令留档（计划附录） |
| A9 | ✓ | 本附录 |
| A10 | ✓ | 根 typecheck 链 = web → music-player-core → music（三重配置）→ db |
| A11 | ✓ | transpilePackages 三包 + `@source` 单行；build 产物 CSS 含包内 class（可证伪对照经主控复验） |
| A12 | ✓ | 浏览器全量：**播放**（audio `paused:false, currentTime:2.4`，真实 mp3）、**上传双路径**（唯一字节创建 mock-track-01 + 同字节去重「重复」提示复用）、管理（曲库 create/停用回路、12 行曲目表 4 启用+7 停用与 import 报告逐行对账）、偏好（Phase 7 localStorage 实测）、5 端点经 4 路由测试 + Phase 4+5 浏览器轮；导入 dry-run hash 对比（Phase 4 C1）。**注**：NCM 上传浏览器实测未做（NCM 解密/上传管线有 6 例单测 + upload-filter 用例覆盖），曲目级 patch/删除 UI 回路由 12 例 admin-panel 单测覆盖 |
| A13 | ✓ | 设置行样式几何（控件标记逐字搬移、面板单测 5 例）；**悬浮播放器路由策略双向实测**（/settings 隐藏、/zh 显示且控件在场） |

## 浏览器验收摘要（agent-browser + dev server）

- owner 登录：`POST /api/auth/owner/login` → 204（密钥修剪引号后成功）；非 owner 视角无管理面板（file-input 0），owner 视角 `region 曲库与曲目管理` 全量呈现。
- 上传：`mock-track-01.wav`（唯一字节）→ 新行入表；同文件二次上传 → 「重复」提示（复用路径）。
- 播放：浮层控件（播放/速度/列表/收起）在场，点击后 `audio.paused=false`、`currentTime` 推进、src 为镜像内容寻址文件。
- 浮层可见性（Phase 7 缺口闭合）：曲库非空后 /zh 现形、/settings 隐藏——路由策略双向。

## 检查与结果

- `pnpm test`：271/271；`pnpm typecheck`：四包全绿（Phase 7 终验保持，本轮仅文档变更）。
- 删除演练还原后 `git status` 零残留。

## 未完成项

- import 副作用还原与否，待裁定。
- NCM 上传浏览器实测、曲目级 patch/删除 UI 浏览器回路（有测试覆盖，建议并入下一次常规浏览器验收）。
