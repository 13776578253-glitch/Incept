# 2026-09-23 Music 模块化迁移 Phase 6 实施记录（React 层迁入）

## Status

**Phase 6 实施完成，验收除「浏览器 localStorage 实测」外全部达成。** 42 项 git mv 入包（41 R 保留历史 + 1 项 music-schema 按类型边界决策迁回宿主），修订 17①②③ 全部落地。四包 typecheck 全绿、**270/270 单元测试全绿**（含探针红→绿闭环）、`pnpm build` 成功且 **CSS 断言实测通过**。按流程未提交，等待审查。

[2026-09-23 23:15] - Update by AI完成改动:
- 修改了 React 层的归属（`features/music-player` 25 文件 → `src/react/music-player/`、`features/settings/music` 13 文件 → `src/react/settings/`、偏好 Provider/hook/测试 → `src/react/preferences/`、`music-fixtures`/`media-element` → `src/testing/`），实现了 URL 收敛（7 处散写 → `musicEndpoints`，测试内 URL 字面量作为断言契约保留）、`player-route-policy` 注入化工厂（locales + 隐藏清单由 mount 配置传入，清单不再内置）、`MusicPlayerFloating` 的 locale 走 props（包内消除 next-intl）、`MusicLocale` 类型落地（修订 17②）、`@source` 入 globals.css + CSS 断言（修订 17①）、共享测试 setup 抽取（`src/testing/setup.ts`）、`./react` 填充真 barrel。
- 遗留问题: 浏览器 localStorage 偏好延续实测未做（需 dev server + 浏览器轮）；实施修正 4 项待追认（见下）；Phase 7–8 待批准。
- Commit 建议: [feat]: music 迁移 Phase 6 React 层迁入

## 修订 17 落地对照

- **①@source 并入 Phase 6**：`globals.css:6` 单行 `@source '../../../../packages/music';`（CSS-first：仓库无 tailwind.config，仅 postcss.config.js）。**CSS 断言实测通过**：`pnpm build` 产物 `.next/static/chunks/08r0nvt36i7ua.css` 含 `z-music-player`（music 组件 class 已进构建 CSS）✓。Phase 7 只做复核。
- **②MusicLocale 类型边界**：`src/react/locale.ts` 落 `MusicLocale = 'en' | 'zh'`（精确镜像宿主 `AppLocale`——函数参数逆变要求 AppLocale ⊆ MusicLocale，Phase 7 贡献 label 才能赋给宿主签名）。
- **③提交流程固定步骤首用**：`pnpm build` 后已执行 `git restore apps/web/next-env.d.ts` ✓。

## 实施修正（4 项，待追认）

1. **music-schema.ts 迁回宿主（13/14）**：其类型面整个是宿主 settings 框架（`SettingsSection`、`SettingsRow`、`SettingsControlType`），入包即产生包→宿主依赖；随 Phase 7 框架收编一并处理（届时 3 行偏好并入面板、框架类型消亡）。
2. **`@incept/music-player-core` 补为包依赖**（决策 2 的既定归属，迁移时漏声明）：MusicTrack 等类型曾退化为 any 并连坐 2 处 implicit-any。
3. **`src/testing/` 移出 tsconfig.node 配置**：testing 是 jsdom/node 混合面（HTMLMediaElement、MediaQueryList 需 DOM lib），由全量配置（lib 含 DOM）覆盖。
4. **包 tsconfig 补 `jsx: react-jsx`**（react 层 .tsx 首次进入包所需）。

## 关键实现注记

- **URL 收敛**：`musicEndpoints` 消费 7 处（catalog 1、upload 1、admin 5）；**测试内的 URL 字面量保持不动**（它们是断言契约，改成常量即同义反复）。
- **player-route-policy 注入化**：`createMusicPlayerRoutePolicy({ locales, hiddenRoutePrefixes })`；隐藏清单（5 条）改由宿主 `[locale]/layout.tsx` 以 mount 配置传入（Phase 7 起改由 manifest 注册面提供）；语义注释逐字保留。
- **floating 的耦合收敛**：`useLocale`（next-intl）→ `locale` prop；`usePathname`（next/navigation）保留——路由响应式所需，**react 层的 next/navigation 属边界例外（修订 18 待追认）**：决策 1 的禁令只覆盖 domain/application/ports，react「认 React」为主框架归属。
- **共享 setup**：`src/testing/setup.ts` 承载 jsdom 缺口（jest-dom 匹配器、cleanup、localStorage、matchMedia）；web `src/test/setup.ts` 复用，但 jest-dom 类型增强须由 web 侧直引（包侧解析不合并 vitest 模块声明——实测结论）。
- **testing 出口**：`./testing`（ncm-fixture 等）与 `./testing/setup` 拆分子出口——桶导出会把 node:crypto 的 fixture 拖进 jsdom 测试链（实测踩坑）。

## 验收对照

- ✓ 前端测试随迁全绿：**80 用例随迁**（music-player 5 套 50 + settings 3 套 20 + preferences 1 套 10），`pnpm test` **270/270**（core 73 + music 182/21 文件 + web 15/2 文件），总数对账精确。
- ✓ **非空探针**：上传（upload-filter 断言翻转）与播放器（library-switcher 角色查询）各注入一处错误 → 2 用例红（其余全绿）→ 原样还原 → 270/270 复绿。
- ✓ `apps/web` 内 import music 组件为 **0**（挂载/装配/桩除外，grep 零命中）。
- ✓ 测试输出零噪声（21 文件无 jsdom media 警告）。
- ✓ **CSS 断言（修订 17①）**：build 产物 CSS 含包内 class 实测通过。
- ⏳ **浏览器实测（localStorage 偏好延续）未做**——需 dev server + 浏览器轮，标注待补。

## 检查与结果（本机执行）

- `pnpm typecheck`：四包全绿（music 三重配置，react 层由全量配置覆盖）。
- `pnpm test`：**270/270**（+`test:cli` 6 例独立套件另行运行，本轮未动）。
- `pnpm build`：成功（Next 16 Turbopack；1 条 NFT 追踪警告来自 docs 导入路由，非本轮引入）；CSS 证据 `.next/static/chunks/08r0nvt36i7ua.css`。

## 未完成项

- 浏览器 localStorage 偏好延续实测（Phase 6 验收唯一缺口，可在 Phase 7 浏览器轮合并做）。
- 实施修正 1–4 与「react 层 next/navigation 例外」（修订 18）待追认。
- Phase 7–8 待批准。
