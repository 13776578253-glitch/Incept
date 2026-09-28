# 2026-09-23 Music 模块化迁移 Phase 5 实施记录（API 路由收编）

## Status

**Phase 5 实施完成并验收**（Phase 4 未点名，按范围边界规则跳过）。5 个 app/api 路由收编为 re-export stub，handler 主体迁入 `src/next/`，`MusicRepository` 端口经 `PrismaMusicRepository` 正式接线，404 语义回归补齐。四包 typecheck 全绿、**270/270** 测试全绿（269 + 1 新增，对账精确）。按流程未提交，等待审查。

[2026-09-23 20:40] - Update by AI完成改动:
- 修改了 API 路由的归属（5 个 route handler → `src/next/` 工厂：`createMusicCatalogRoute`/`createMusicTracksRoute`/`createMusicTrackItemRoute`/`createMusicLibrariesRoute`/`createMusicLibraryItemRoute`，注入 `authorizeOwner` 端口 + `MusicRepository` 的 `Pick` + `paths`），实现了 `src/endpoints.ts`（`musicEndpoints`，决策 10）、`adapters/prisma/repository.ts`（`createPrismaMusicRepository`，11 用例方法，决策 4 端口接线）、5 个 stub 变 re-export、`tracks` 上传判定改包内 POSIX `extensionOf`（修订 12）、2 个路由测试随迁（15 用例，mock 面改依赖注入）+ 新增非 owner 404 回归（v2 增补）；`next` 以 peer+dev 声明（决策 1 next 层特权）。
- 遗留问题: Phase 4（CLI 迁入）未批准，其收敛项（镜像路径三处重复、`resolveWebMusicPaths` 无消费者）一并顺延；Phase 6–8 待批准。
- Commit 建议: [feat]: music 迁移 Phase 5 API 路由收编

## Next 16 文档核对（READAI 要求，开放问题定案）

- `01-app/03-api-reference/03-file-conventions/route.md:82`：`context.params` 是 **Promise**——现状写法（`{ params: Promise<{...}> }` + `await`）正确，随迁逐字保持。
- `01-app/03-api-reference/03-file-conventions/02-route-segment-config/runtime.md:18`：`'nodejs'` 是**默认值**——stub 的 `export const runtime = 'nodejs'` 随收编**移除**（零行为差异），回答了计划风险项「runtime 归属」：既不放包导出也不留 stub，直接不需要。
- `dynamic = 'force-dynamic'`（catalog 路由）是**语义配置**且 segment 配置须路由文件静态可析——保留在 stub 为唯一字面行。验收措辞修正：「stub 形态 = re-export 行 + 注释 + 必要的 segment 配置行（当前仅 catalog 的 dynamic）」。

## 实现要点

- **鉴权语义保持**：原「hasSameOrigin → 404」+「非 owner → 404」两步门禁收编为单次 `authorizeOwner(request)` 端口调用（宿主实现 = 原两步的与），404 文案与语义逐条不变。
- **端口最小面**：每个工厂的 repository 参数是 `Pick<MusicRepository, ...>`（catalog 1 法、upload 2 法、item 2 法、libraries 3 法）——测试替身只需构造用到的方法，无强制转型。
- **测试改造**：`vi.mock('@/server/auth')` 与合并版 `@incept/music/adapters` mock 全部改为工厂依赖注入（`POST`/`DELETE` 包装函数保持调用点零改动）；镜像目录覆写走 `paths.mirrorDirectory`（比 mock 更直接）；镜像目录注释逐字保留。
- **404 回归补齐（v2 增补）**：upload 新增「authorizeOwner 拒绝 → 404 且不触达库与镜像」；track-item 原有非 owner 用例保持。
- **公开 GET 零门禁**：catalog 工厂**没有** authorizeOwner 依赖——门禁在类型上就不可能存在。

## 改动清单（未提交）

- **新增**：`src/endpoints.ts`（+`./endpoints` 出口，现 9 出口）、`src/adapters/prisma/repository.ts`、`src/next/{music-catalog,music-tracks,music-track-item,music-libraries,music-library-item}.ts`。
- **git mv（2 项，R 状态）**：tracks 路由测试 → `src/__tests__/tracks-route.test.ts`、track-item 路由测试 → `src/__tests__/track-item-route.test.ts`。
- **stub**：5 个 route 文件变 re-export（catalog 另含 `dynamic` 字面行）。
- **改写**：`server/music/assembly.ts`（绑定 5 工厂 → 7 具名 handler：musicCatalogGet/musicTracksUpload/musicTrackUpdate/musicTrackDelete/musicLibraryCreate/musicLibraryUpdate/musicLibraryDelete）、`packages/music/package.json`（+endpoints、next peer+dev）、`adapters/index.ts`（+prisma/repository）、2 测试注入面。

## 检查与结果（本机执行）

- `pnpm typecheck`：**四包全绿**。
- `pnpm test`：**270/270 全绿**——core 73、music **102**（12 文件 = 旧 86 + 随迁 15 + 新增 404 回归 1）、web **95**（11 文件）。对账：269 基线 + 1 新增，零回退。
- 验收 grep：`hasSameOrigin|getCurrentViewer|webMusicMirrorDirectory|@/server/auth` 在 `app/api/**/music/**` 为 **0**（全仓命中皆为 auth/access/activity 等非 music 路由，不在迁移范围）。

## Phase 5 验收对照

- ✓ 5 端点行为不变（路由测试随迁全绿 15 用例）：公开 GET 零门禁（类型上无 auth 依赖）；internal 端点非 owner 404 逐条保持 + **回归补齐 1 条**。
- ✓ stub 形态 = re-export 行 + 注释 + 必要的 segment 配置行（catalog 的 `dynamic`，文档定案的例外）。
- ✓ pnpm test / pnpm typecheck 全绿。
- ✓ 开放问题（runtime/params 归属）按 Next 16 文档定案留档。

## 未完成项

- **Phase 4（CLI 迁入）未批准**——镜像路径三处重复（assembly / music-import.mjs / music-cleanup.mjs）与 `resolveWebMusicPaths` 无消费者的收敛一并顺延至 Phase 4。
- Phase 6–8 待批准；owner loader 浏览器实测留 Phase 7。

## 审查反馈处理（2026-09-23）

1. **死 import 删除**：`adapters/prisma/repository.ts` 的 `listActiveMusicTracks` 导入未被 11 方法映射使用（端口无此方法），已删。
2. **双 import 合并**：`src/next/` 四个工厂的 `../ports` 双条 `import type` 合并为单条（点名 2 处 + 同款 music-libraries/music-library-item 2 处一并处理）。
3. **验收措辞**：精确为「re-export 行 + 注释 + 必要的 segment 配置行」（计划修订 15 与本报告同步改）。
4. `resolveWebMusicPaths` 零消费者：维持 Phase 4 顺延登记 ✓。
5. **观察记录（Phase 6/7 一致性，不视为缺陷）**：next 层直接 import `../adapters`（媒体/fs 操作）而 DB 侧走端口注入——决策 1 允许（两者皆 Node 层），包内「端口注入」模式目前只覆盖 DB 一侧；Phase 6/7 收编 react/settings 时评估媒体面是否一并端口化（届时若做属一致性收敛，非纠错）。
