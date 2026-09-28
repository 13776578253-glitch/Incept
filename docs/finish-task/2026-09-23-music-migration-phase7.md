# 2026-09-23 Music 模块化迁移 Phase 7 实施记录（挂载收编与构建定形）

## Status

**Phase 7 实施完成。** music 三个挂载贡献位与 SettingsSectionContribution 全部注册进 mount manifest，设置框架 music 硬编码（3 controlType、3 分支、7 偏好 props、静态 import、readMusicAdminData 直连、music-schema）全部删除，`--z-music-player` → `--z-feature-floating` 改名完成，构建复核与浏览器轮已做（浮层 DOM 可见性一项留 Phase 8 复验）。四包 typecheck 全绿、**271/271** 单元测试全绿、`pnpm build` 全绿。按流程未提交，等待审查。

[2026-09-23] - Update by AI完成改动:
- 修改了挂载注册面（`mount/music.ts` 注册数据 + `mount/music-components.tsx` client 包裹件 + registry/server 接线）、包侧 `MusicSettingsPanel`（3 行偏好内嵌 + 管理面板整块，控件标记逐字搬移）、设置框架五处硬编码切除、双布局 manifest 化、tokens 改名、`packages/music/README.md` 变量清单。
- 遗留问题: 浮层 DOM 可见性复验（空曲库环境不渲染 UI）留 Phase 8 播放轮；owner 浏览器视角以测试证据兜底（见验收对照）。
- Commit 建议: [feat]: music 迁移 Phase 7 挂载收编与构建定形

## 关键实现注记

- **RSC 边界事故（构建复核抓获）**：注册数据模块最初带 `'use client'`，服务端图把导出贡献数组当 client-reference 代理（`a.contributions.filter is not a function`，`/_not-found` 预渲染爆）；单测不走 RSC 语义故全绿。修法：`music.ts`（注册数据，无指令）与 `music-components.tsx`（`'use client'` hook 包裹件）拆分。
- **逆变实证（修订 17②）**：`label: getMusicSettingsSectionLabel`（`(locale: MusicLocale) => string`）直接赋给宿主 `(locale: AppLocale) => string`，编译通过即 AppLocale ⊆ MusicLocale 成立。
- **分区顺序保全**：贡献分区在 `settings-schema` 中插于 ai 之前，music 保持「账户与模型之间」原位（浏览器实测确认）。
- **保留字放行**：`music` 移出 `RESERVED_SETTINGS_SECTION_IDS`（硬编码已亡、分区归注册面），注释冻结+注记。
- **registry↔music 机制-产品环**：`defineSettingsSectionContribution`（函数声明提升）从 registry 被 music.ts 引用，ESM 环安全；如需消环可把 helper 下沉 `define.ts`。
- **测试等价随迁**：settings-renderer 的 4 个 music 用例断言逐字迁往包内 `music-settings-panel.test.tsx`（vi.mock 注入原 7 字段口径），另补非 owner 管理区隐藏回归 1 例；host 文件留 2 个通用用例。
- `resolveToggleLabels` 随 3 分支消亡成死代码，按 R8 连注释一并删除。

## 验收对照

- ✓ 设置页浏览器回归：**5 分区顺序与迁移前一致**（主题/语言/账户/音乐/模型，music 原位），music 分区 3 行偏好渲染与交互正常（zh 文案、开关、四档分段）；desktop 与 mobile 分支各持一份（`#music` 计数 2）。
- ✓ owner 门控等价性：**测试证据**（`loadSettingsSectionContributionData` 的 owner 门控用例 + 非 owner 浏览器视角实测管理面板不渲染）；owner 浏览器视角未做（本机无 owner 登录 UI 直达路径），并入 Phase 8 全量浏览器验收。
- ✓ `settings-renderer.test.tsx`：收敛后 2 例全绿；4 个 music 用例等价随迁全绿（语义变化 = 偏好读写内移，断言未变，等价性注记在测试文件）。
- ✓ 布局插槽：root-layout wrapper 单实例（`audio` 元素计数 1）、偏好 Provider 真实生效（localStorage 往返实测）、浮层 DOM 可见性**留 Phase 8 复验**（空曲库环境 UI 不渲染，插槽单次渲染由 registry 单元断言支撑）。
- ✓ `--z-music-player` 代码层 grep **归零**（历史文档按记录规则保留）；CSS 复核：产物 `17kpp_njr8lsm.css` 含 `--z-feature-floating`。
- ✓ **localStorage 偏好延续实测（并入本轮，Phase 6 缺口关闭）**：UI 翻转写入 `incept-music-player-preferences`（key 不变）→ 重载 → 开关状态反映存储值（`checked=false`，文案「切换」）。
- ✓ 收尾核对（修订 18）：新增文件均纳入对应 tsconfig include（music.ts/music-components.tsx 均为 `.ts(x)` 已覆盖）。

## 浏览器实测摘要（agent-browser，dev server）

- `/zh/settings?section=music`：快照见 5 分区导航 + 音乐分区标题/播放器分组/3 行控件，无 file-input（非 owner 门控 ✓）。
- localStorage 证据：`{"playbackRateLocked":false,"rememberPlacement":true,"playbackMode":"off","selectedLibrary":null}`，key `incept-music-player-preferences`。
- `/zh`：`audio: 1`（RuntimeMount wrapper 单实例）。

## 检查与结果

- `pnpm typecheck`：四包全绿。
- `pnpm test`：**271/271**（core 73 + music 187/22 文件 + web 11）。
- `pnpm build`：全绿（首次构建曾爆 RSC 边界 bug，拆分修复后全通；已执行 `git restore apps/web/next-env.d.ts`）。

## 未完成项

- 浮层 DOM 可见性复验 + owner 浏览器视角（并入 Phase 8 全量浏览器验收：播放、上传、管理、偏好、设置页）。
- Phase 8 待批准。

## 审查反馈处理（2026-09-23 追加）

Phase 7 判定通过（主控独立复跑 271/271、四包 typecheck、build；CSS 可证伪对照、R10 隔离性、owner 门控等价、分区原位、改名绝迹、宿主残留清空逐条实测）。唯一建议已执行——**registry ↔ music 循环导入消除**：`defineSettingsSectionContribution`（纯 helper、不碰注册表状态）下沉至 `mount/define.ts`，registry 与 music 各自单向导入，依赖图成严格 DAG（`define ← {registry, music}`、`registry → music`），不再受「函数声明提升」的侥幸保护（该环若被重构成 const 箭头函数即导入期 TDZ）。中途一修：`SettingsVisibility` 的导入源改回 `settings-types`（`types.ts` 仅引用不导出）。消环后复验：四包 typecheck、**271/271**、`pnpm build`（含 `/_not-found` 预渲染）全绿，`git restore next-env` 已执行。
