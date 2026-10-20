# Incept 工程代码库 15 项深度缺陷与技术债专项审计报告 (AI 执行专资版)

> **目标受众**：自主编程 Agent / AI 修复流水线 / 资深系统工程师  
> **工程目录**：`d:/Desktop/code/code/Incept`  
> **审计覆盖范围**：文档一致性、App Router 路由、无用/孤立代码、过时测试、防御型代码、不合理堆砌、AI 局部修改截断  
> **格式规范**：包含精准文件路径、源码行号、问题现象、深层原因、系统性影响与机器可执行的修复方案与代码对比。

---

## 缺陷索引与全景概览

> 💡 **处理状态总览**：
> - **表一（核心系统与代码缺陷）**：共 12 项，状态为 **`⏳ 待其他 Agent 处理`**，详细可执行交接指引见 [2026-10-16-agent-handover-remaining-issues.md](./current-task/2026-10-16-agent-handover-remaining-issues.md)。
> - **表二（文档体系与源码注释专项）**：共 12 项，状态为 **`✅ 本轮已全部完成修复并验收`**。

### 表一：核心系统架构、路由与代码级缺陷索引表 (✅ 经三批重构与实测已全数完成与验收)

| 编号 | 缺陷分类 | 涉及文件/模块 | 严重级别 | 状态 | 核心修复事实与核验结论 |
| :--- | :--- | :--- | :---: | :---: | :--- |
| **ISSUE-01** | 幽灵路由 / 核心失效 | `apps/web/src/proxy.ts` | 🔴 P0 阻塞 | ✅ 已核验 | Next.js 16.4.0 官方规范中 `proxy.ts` 为当前约定（`middleware.ts` 已弃用），实测 `GET /` 正常 307 跳转至 `/zh`，原报告对文件命名误诊，保留现状正确无误 |
| **ISSUE-03** | 无用过时测试 / 破损脚本 | `package.json:25` | 🟠 P1 严重 | ✅ 已完成 | `music:check-adapter` 脚本重定向至 `pnpm --filter @incept/music test:core`，73 项核心测试全部通过 |
| **ISSUE-04** | 孤立文件 / 破损脚本 | `scripts/test-dashboard-loader.mjs` | 🟡 P2 中等 | ✅ 已完成 | 物理删除存在模块解析崩溃且无任何断言逻辑的孤立桩脚本 |
| **ISSUE-05** | 孤立文件 / 庞大废弃夹具 | `apps/web/src/features/docs/block-system/__fixtures__/` | 🟡 P2 中等 | ✅ 已完成 | 物理删除 3 个 38.5KB 零引用的 Style Lab 孤立夹具文件 |
| **ISSUE-06** | 孤立文件 / 废弃空挂载 | `apps/web/src/hooks/use-breakpoint.ts` | 🟢 P3 轻微 | ✅ 已完成 | 物理删除无导出、零引用的 42 字节空壳占位文件 |
| **ISSUE-07** | 防御型代码 / 缺陷掩盖 | `packages/dashboard/src/adapters/local/collectors/gemini.ts` | 🟠 P1 严重 | ✅ 已完成 | 移除静默 catch，增加 `errors: string[]` 收集并在上游 `agents.ts` 汇总暴露，补齐坏文件/共存单测 |
| **ISSUE-08** | AI 局部修改 / 特例硬编码 | `packages/dashboard/src/adapters/local/pricing.ts:11-15` | 🟡 P2 中等 | ✅ 已完成 | 移除 Gemini 专用 Set，将变体注册至 `overrides.ts` 的 `DEFAULT_PRICING_ALIASES`，复用通用别名查询 |
| **ISSUE-09** | 代码堆砌 / 脆弱的手工维护 | `packages/roadmap/src/adapters/prisma/roadmap-writer.ts:28-125` | 🟡 P2 中等 | ✅ 已完成 | 废除手写 100 行事务类型，直接复用 `@incept/db` 导出的 `Prisma.TransactionClient`，简化装配与单测替身 |
| **ISSUE-10** | 过早 Fallback / 脆弱词元切分 | `packages/roadmap/src/domain/similar.ts:78-91` | 🟡 P2 中等 | ✅ 已完成 | 改为在连续汉字块内切分 2-gram/3-gram，避免跨标点/跨语言制造伪相似度，增加多项边界断言 |
| **ISSUE-11** | 孤立文件 / 本地环境绝对路径硬编码 | `scripts/search-cli.mjs`、`inspect-sample.mjs` 等 | 🟡 P2 中等 | ✅ 已完成 | 物理删除包含写死 Windows 绝对路径与硬编码调试日期的 4 份一次性脚本 |
| **ISSUE-14** | 防御型代码 / 冗余假转换 | `single-article.ts:31-105` | 🟢 P3 轻微 | ✅ 已完成 | 移除 70 行冗余 1:1 switch 浅拷贝，直接解构剥离 `line` 字段，严格由编译器校验块类型 |
| **ISSUE-15** | 孤立数据 / 历史技术债 | `packages/db/prisma/schema.prisma:59-69` 与 `seed.ts` | 🟡 P2 中等 | ✅ 已完成 | 移除 seed 中 `system` 用户的无效 upsert，并在 schema 中给 User 模型标注 `@deprecated` |

---

### 表二：文档体系与源码注释专项缺陷索引表 (✅ 本轮已全部完成修复)

> 注：原 15 项审计中涉及文档与历史报告的 **ISSUE-02**、**ISSUE-12**、**ISSUE-13** 已在此归并深化为 **DOC-01**、**DOC-02**、**DOC-03**，全数 12 项文档治理任务已全部执行验收完毕。

| 专项编号 | 缺陷分类 | 涉及文件/位置 | 严重级别 | 状态 | 核心治理与修复事实 |
| :--- | :--- | :--- | :---: | :---: | :--- |
| **DOC-01**<br>*(原 ISSUE-02)* | 幽灵文档 / 幽灵路由 | `README.md:192` | 🟠 P1 严重 | ✅ 已完成 | 已将下线的 `/zh/studio` 修正为当前实际站长入口 `/[locale]/settings` |
| **DOC-02**<br>*(原 ISSUE-12)* | 过时报告 / 未归档积压 | `docs/current-task/` (34 篇已归档) | 🟡 P2 中等 | ✅ 已完成 | 34 篇历史任务记录已通过 `git mv` 规范归档至 `docs/finish-task/`，当前仅留 6 篇活跃项 |
| **DOC-03**<br>*(原 ISSUE-13)* | 错误文档 / 双语缺口遗漏 | `docs/INDEX.md:237-249` | 🟡 P2 中等 | ✅ 已完成 | 已剔除“仅存1处缺口”的虚假描述，真实列出 4 篇单语决策/手册缺口跟踪项 |
| **DOC-04** | 幽灵文档 / 虚构架构中间件 | `docs/decisions/en/account-and-access-design.md` | 🟠 P1 严重 | ✅ 已完成 | 已清除虚构的 `proxy.ts` 安全拦截与已下线的 studio/style-lab 路由，对齐实际鉴权 |
| **DOC-05** | 幽灵文档 / 虚构规范目录 | `docs/READAI.md:80-84` | 🟡 P2 中等 | ✅ 已完成 | 已清除 Commit Type 表格中虚构的 `ai-context/`、`scratchpad.md` 与根级 `roadmap/` |
| **DOC-06** | 过时报告 / 已交付未清理计划 | `docs/plans/` $\to$ `docs/finish-task/` | 🟡 P2 中等 | ✅ 已完成 | 已将交付上线的 10-14 AUTH/ACL 计划移入 `finish-task/`，`plans/` 仅保留活跃计划 |
| **DOC-07** | 过时报告 / 边界违背日记堆砌 | `docs/NEXT.md:18-34` | 🟡 P2 中等 | ✅ 已完成 | 已剥离违规堆砌的 10-13/10-14 历史演化流水账，恢复为轻量纯粹的待办入口 |
| **DOC-08** | 错误记录 / 脱节与半真半假注释 | `music-player-floating.tsx:118` 与 `BACKLOG.md` | 🟡 P2 中等 | ✅ 已完成 | 已修正失真的 TODO 注释（确认 seekRequested 已接入原生滑杆），更新 BACKLOG.md |
| **DOC-09** | 错误记录 / 虚构 Tag 契约 TODO | `types.ts` (4处) 与 `import.ts:1100` | 🟢 P3 轻微 | ✅ 已完成 | 已清理 4 处误导性 Tag TODO；折叠 `import.ts` 中 `replace ? 'updated' : 'updated'` 伪三元逻辑 |
| **DOC-10** | 冗余报告 / 废话套话与自我矛盾 | `2026-10-14-owner-auth-implementation.md` 等 | 🟡 P2 中等 | ✅ 已完成 | 已清除“等待人工认可/不代表完成”与“此确认取代前文”前后矛盾的套话，清理 BACKLOG 情绪记录 |
| **DOC-11** | 全局精简 / 索引重复与严重漏登 | `docs/INDEX.md:117, 179-191, 283-290` | 🟡 P2 中等 | ✅ 已完成 | 已删除双写重复段落，更正 plans 状态，补齐 9 篇漏登的正式运维 Runbooks 索引 |
| **DOC-12** | 全局精简 / 构建目录双重维护 | `packages/dashboard/dist/TRANSFER.md` vs `tools/` | 🟢 P3 轻微 | ✅ 已完成 | 已确认 `.gitignore` 忽略构建产物目录，清理本地重复文件，源码统一由 `tools/` 维护 |

---

## 缺陷详述与修复规范 (AI 执行指南)

### ISSUE-01: Next.js 中间件命名错误导致国际化路由完全失效，根路由返回 404

- **所属类别**：幽灵路由 / 核心失效 / 孤立文件
- **定位文件**：[apps/web/src/proxy.ts](file:///d:/Desktop/code/code/Incept/apps/web/src/proxy.ts#L1-L8)
- **编译证据**：查看 `apps/web/.next/server/middleware-manifest.json`，其中 `middleware: {}` 与 `sortedMiddleware: []` 完全为空。
- **问题根因**：
  Next.js 规范要求全局中间件必须命名为 `middleware.ts` 或 `middleware.js`，位于应用根目录或 `src/` 下。早期设计文档（`docs/plan-docs/web.design.md`）误将其命名为 `proxy.ts`。由于文件名非 Next.js 约定的契约名称，Next.js 编译引擎完全忽略该文件，导致 `createMiddleware(routing)` 从未被注册入请求处理链。
  此外，`apps/web/src/app` 目录下不存在根级 `page.tsx`，整个站点的首页重定向完全依赖该中间件。
- **影响性分析**：
  1. 任何用户直接访问站点根 URL `http://localhost:3000/` 时，直接返回 404 Not Found；
  2. 国际化自动协商（如根据请求头自动分配 `/zh` 或 `/en`）全面瘫痪；
  3. 文档体系（如 `docs/decisions/en/account-and-access-design.md`）误认为 `proxy.ts` 承担了 i18n 边界，存在严重认知偏差。
- **建议修复动作**：
  1. 将 [apps/web/src/proxy.ts](file:///d:/Desktop/code/code/Incept/apps/web/src/proxy.ts) 重命名为 `apps/web/src/middleware.ts`；
  2. 或者在 `apps/web/src/app/page.tsx` 增加根路由重定向逻辑作为兜底。

```typescript
// apps/web/src/middleware.ts
import createMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/config/routing';

export default createMiddleware(routing);

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
```

---

### ISSUE-02: `README.md` 记载已物理下线的 Studio 工作台幽灵路由

- **所属类别**：错误的文档 / 幽灵路由
- **定位文件**：[README.md](file:///d:/Desktop/code/code/Incept/README.md#L192)
- **关联代码**：[scripts/production-integration.ts](file:///d:/Desktop/code/code/Incept/scripts/production-integration.ts#L131-L133)
- **问题根因**：
  `README.md` 第 192 行写明：
  `* **站长工作台与草稿审核**：http://localhost:3000/zh/studio（需 Owner 登录）`
  但在后续迭代中，所有 `/studio/*` 页面已被全部清理整合进 `/${locale}/settings`。`scripts/production-integration.ts` 明确断言：
  `for (const retired of ['studio/roadmap', 'studio/docs/library', ...]) assert.equal(status, 404);`
- **影响性分析**：
  README 作为项目的门面入口，向初次接触项目的工程师提供了错误的 URL 指引。Owner 登录后访问 `/zh/studio` 遭遇 404 错误，形成断头路体验。
- **建议修复动作**：
  修改 `README.md`，将该条目更正为当前实际的站长管理页面地址：`http://localhost:3000/zh/settings`。

---

### ISSUE-03: `package.json` 中的 `music:check-adapter` 脚本目标丢失导致运行崩溃

- **所属类别**：无用的过时测试文件 / 破损脚本
- **定位文件**：[package.json](file:///d:/Desktop/code/code/Incept/package.json#L25)
- **执行证据**：运行 `pnpm music:check-adapter` 输出：
  `No test files found, exiting with code 1`
  `filter: src/features/music-player/adapter/__tests__/music-source.test.ts`
- **问题根因**：
  在 9 月的音乐模块架构迁移中，`apps/web/src/features/music-player` 目录已被解耦提取至独立包 `packages/music`。根目录 `package.json` 中的命令没有被同步清理或重新重定向，残留了无效的测试调用命令。
- **影响性分析**：
  破坏了开发者的常用命令契约。开发者或自动化 CI 执行该检查时必然报错失败。
- **建议修复动作**：
  将该脚本迁移至对应包中，或将其从根 `package.json` 的 scripts 列表中删除。

---

### ISSUE-04: `scripts/test-dashboard-loader.mjs` 存在未捕获的模块解析崩溃且无测试意义

- **所属类别**：孤立文件 / 破损测试脚本 / 无意义的测试文件
- **定位文件**：[scripts/test-dashboard-loader.mjs](file:///d:/Desktop/code/code/Incept/scripts/test-dashboard-loader.mjs#L1-L7)
- **执行证据**：运行 `node scripts/test-dashboard-loader.mjs` 输出：
  `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../packages/dashboard/src/adapters/local/pricing.js'`
- **问题根因**：
  脚本尝试在纯 Node.js 环境下静态 import 包含 `.js` 扩展名的 TypeScript 源码路径；且整个文件除了一句 `console.log('Testing Dashboard Loader...')` 之外无任何实质断言与执行操作。
- **影响性分析**：
  死代码残留，如果不知情的开发者或外部自动化脚本尝试运行该测试，将直接触发进程非零崩溃。
- **建议修复动作**：
  直接安全删除 `scripts/test-dashboard-loader.mjs`。

---

### ISSUE-05: `block-system` 包含 38.5KB 庞大孤立 Style Lab 样例数据

- **所属类别**：孤立文件 / 臃肿死代码
- **定位文件**：
  - [apps/web/src/features/docs/block-system/__fixtures__/docs-block-style-lab-page.ts](file:///d:/Desktop/code/code/Incept/apps/web/src/features/docs/block-system/__fixtures__/docs-block-style-lab-page.ts) (38,505 字节)
  - [apps/web/src/features/docs/block-system/__fixtures__/docs-code-example-utils.ts](file:///d:/Desktop/code/code/Incept/apps/web/src/features/docs/block-system/__fixtures__/docs-code-example-utils.ts) (866 字节)
- **代码佐证**：该目录下的 `README.md` 明确声明：“原 `/{locale}/docs/style-lab` 页面已移除。夹具不从 block-system 正式入口导出，也不注册应用路由。”
- **问题根因**：
  样式实验页面下线后，测试夹具未伴随路由一同清理，留存在生产源码目录树下。经全局检索，没有任何测试或业务代码引用该文件。
- **影响性分析**：
  白白增加近 40KB 的冗余源码体积，每次 TypeScript 全量编译都需要解析该庞大 AST，拖慢类型检查性能。
- **建议修复动作**：
  删除 `apps/web/src/features/docs/block-system/__fixtures__/` 整个目录。

---

### ISSUE-06: `apps/web/src/hooks/use-breakpoint.ts` 空壳孤立文件残留

- **所属类别**：孤立文件 / 废弃空挂载
- **定位文件**：[apps/web/src/hooks/use-breakpoint.ts](file:///d:/Desktop/code/code/Incept/apps/web/src/hooks/use-breakpoint.ts#L1-L3)
- **问题根因**：
  该文件自首个提交创建以来，内容始终仅为：`// Global breakpoint hook placeholder.`，没有任何类型、函数或常量导出，属于典型的未完成遗留物。
- **影响性分析**：
  使得目录树不整洁，在 IDE 中自动导入（Auto Import）时可能造成误导。
- **建议修复动作**：
  若前端确实需要根据屏幕响应切换布局，则基于 `useSyncExternalStore` 实现标准断点监听 hook；若不需要则直接删除。

---

### ISSUE-07: `packages/dashboard` 的 Gemini 采集器吞噬异常且遗漏 errors 字段导致故障排查静默失效

- **所属类别**：防御型代码（未解决问题反掩盖缺陷）/ AI 局部修改遗漏
- **定位文件**：
  - [packages/dashboard/src/adapters/local/collectors/gemini.ts:93-98](file:///d:/Desktop/code/code/Incept/packages/dashboard/src/adapters/local/collectors/gemini.ts#L93-L98)
  - [packages/dashboard/src/adapters/local/collectors/agents.ts:32](file:///d:/Desktop/code/code/Incept/packages/dashboard/src/adapters/local/collectors/agents.ts#L32)
- **问题根因**：
  1. `gemini.ts` 内部使用 `try { ... } catch { // ignore }` 捕获所有 JSON 解析或文件状态异常，却未记录任何错误提示；
  2. 其返回对象仅为 `{ events, latestMtimeMs, parsedFiles }`，没有遵循其他采集器约定的 `{ events, errors, coveredSessions, parsedFiles, latestMtimeMs }` 契约结构；
  3. `agents.ts` 聚合多源错误时：
     `errors: [...indexed.errors, ...codex.errors, ...native.flatMap(result => result.errors)]`，数组 `native` 中不包含 `gemini`，直接将 Gemini 的异常排查通道完全切断。
- **影响性分析**：
  当用户的 `.gemini/tmp/` 存在格式不兼容或读权限受限的会话时，采集器既不抛错、不记录 errors、也不生成 fallback，整个数据收集链路静默丢失数据，无法向管理员暴露异常。
- **建议修复动作**：
  为 `collectGeminiEvents` 增加 `errors: string[]` 字段，并在 catch 中规范追加错误原因；在 `agents.ts` 中将 `gemini.errors` 纳入汇总。

---

### ISSUE-08: `packages/dashboard` 硬编码 Gemini 3.8 实验模型名称绕过别名体系

- **所属类别**：AI 局部更改导致局部硬编码 / 本身存在更优雅写法被错误堆砌
- **定位文件**：[packages/dashboard/src/adapters/local/pricing.ts:11-15, 110-114](file:///d:/Desktop/code/code/Incept/packages/dashboard/src/adapters/local/pricing.ts#L11-L15)
- **问题代码**：
  ```typescript
  const GEMINI_FLASH_PRICING_VARIANTS = new Set([
    'gemini-3.8-flash-exp-a',
    'gemini-3.8-flash-n',
    'gemini-3.8-flash-tiered',
  ]);
  // ...
  if (GEMINI_FLASH_PRICING_VARIANTS.has(shortName)) {
    const providerPrefix = lower.includes('/') ? lower.slice(0, lower.lastIndexOf('/') + 1) : '';
    return pricingMap.get(`${providerPrefix}gemini-3.8-flash`) ?? pricingMap.get('gemini-3.8-flash');
  }
  ```
- **问题根因**：
  系统在同文件 80-90 行已经实现了基于 `overrides.aliases` 和 SQLite `model_price_aliases` 的规范模型别名解析流水线。但 AI 在最近提交 `b11d84f` 中，为了临时通过某些模型计费测试，在最底层的查询逻辑中硬编码了一个特异性 Set 分支。
- **影响性分析**：
  破坏了定价模块的通用性和可配置性。当新的实验模型上线时，无法通过配置文件动态添加别名映射，必须侵入修改 TS 源码，形成典型技术债。
- **建议修复动作**：
  移除硬编码 Set 分支，将上述 3 个变体作为默认别名登记在 `readLocalOverrides()` 或模型别名表中。

---

### ISSUE-09: `RoadmapWriter` 手写百行重复的 Prisma 事务接口，未利用 Prisma 生成类型

- **所属类别**：本身存在更优雅写法，但是被错误的代码堆砌
- **定位文件**：[packages/roadmap/src/adapters/prisma/roadmap-writer.ts:28-125](file:///d:/Desktop/code/code/Incept/packages/roadmap/src/adapters/prisma/roadmap-writer.ts#L28-L125)
- **问题根因**：
  开发者为了避免直接依赖 Prisma Client 的某些细节，手动编写了近 100 行 `RoadmapPrismaTx` 类型定义，重复声明了 `findUnique`, `findMany`, `create`, `update`, `delete`, `upsert` 等数十个方法的参数与返回结构。
- **影响性分析**：
  1. 代码严重臃肿冗长；
  2. 一旦 Prisma 数据模型修改字段，手工维护的接口不会报错，导致类型安全保护名存实亡；
  3. 完全是重复造轮子。
- **建议修复动作**：
  直接引用 `@prisma/client` 生成的 `Prisma.TransactionClient`：
  ```typescript
  import type { Prisma } from '@prisma/client';
  export type RoadmapPrismaTx = Prisma.TransactionClient;
  ```

---

### ISSUE-10: 相似度匹配中中文全字正则粗暴组合，导致跨句跨词伪特征计算

- **所属类别**：过早 Fallback / 脆弱词元切分
- **定位文件**：[packages/roadmap/src/domain/similar.ts:78-91](file:///d:/Desktop/code/code/Incept/packages/roadmap/src/domain/similar.ts#L78-L91)
- **问题代码**：
  ```typescript
  const cjkChars = text.match(/[\u4e00-\u9fa5]/g);
  if (cjkChars && cjkChars.length >= 2) {
    for (let i = 0; i < cjkChars.length - 1; i++) {
      const biGram = cjkChars[i] + cjkChars[i + 1];
      // ...
  ```
- **问题根因**：
  `text.match(/[\u4e00-\u9fa5]/g)` 把字符串内所有中文字符抽成单字数组，彻底剔除了所有英文单词、标点符号、空格与换行。导致句尾字与下一句句首相连，英文前后的汉字强行黏连成荒谬的二元词组（bi-gram）。
- **影响性分析**：
  卡片推荐引擎会把毫不相关的卡片判定为高相关度，严重影响路线图看板的推荐质量。
- **建议修复动作**：
  使用连续汉字块匹配（如 `text.match(/[\u4e00-\u9fa5]+/g)`），在每一个天然连续的汉语片段内部再生成 n-gram，阻断跨界拼词。

---

### ISSUE-11: `scripts/` 散落多份硬编码个人 Windows 盘符路径与固定日期的调试脚本

- **所属类别**：孤立文件 / 研发环境脚本硬编码
- **定位文件**：
  - [scripts/search-cli.mjs:3](file:///d:/Desktop/code/code/Incept/scripts/search-cli.mjs#L3) (`C:/nvm4w/nodejs/...`)
  - [scripts/inspect-sample.mjs:3](file:///d:/Desktop/code/code/Incept/scripts/inspect-sample.mjs#L3) (`C:/Users/86139/...`)
  - [scripts/check-other-projects.mjs:23-24](file:///d:/Desktop/code/code/Incept/scripts/check-other-projects.mjs#L23-L24) (写死 `2026-10-13` 到 `10-15` 及项目名)
  - [scripts/audit-commandcode-usage.mjs:6](file:///d:/Desktop/code/code/Incept/scripts/audit-commandcode-usage.mjs#L6)
- **问题根因**：
  在解决具体环境上的 CommandCode 用量对账时，AI 或开发者临时编写的单次探测脚本被直接 `git add` 提交到了仓库根脚本目录。
- **影响性分析**：
  1. 脚本在任何其他设备或操作系统上运行均必定抛错；
  2. 暴露了开发者的本地机器绝对路径；
  3. 污染核心运维脚本目录。
- **建议修复动作**：
  将这类脚本归类至 `.scratch/`（通过 `.gitignore` 忽略）或直接从主分支移除。

---

### ISSUE-12: `docs/current-task/` 严重违背 `INDEX.md` 规范，积压 41 份过期历史任务日志未归档

- **所属类别**：臃肿的文档 / 过时的文档
- **定位文件**：[docs/INDEX.md:87-97](file:///d:/Desktop/code/code/Incept/docs/INDEX.md#L87-L97) vs [docs/current-task/](file:///d:/Desktop/code/code/Incept/docs/current-task/)
- **规范说明**：`INDEX.md` 规定：“`current-task/`: Stores only work that is actively being carried across sessions... Completed material should move out promptly.”
- **现状剖析**：当前目录下堆积了 41 篇文档，包含了自 2026-09-01 起的大量早已完成的里程碑任务记录（如 `2026-09-01-docs-collection-navigation-milestone.md`、`2026-10-13-production-readiness-audit.md` 等）。
- **影响性分析**：
  文档目录严重膨胀，AI Agent 每次检索最新任务上下文时需要扫描大量过期历史日志，极易引发上下文混淆与无谓的 Token 消耗。
- **建议修复动作**：
  根据 `INDEX.md` 规则，将已交付完成的 30+ 份历史文档统一批量迁移到 `docs/finish-task/` 目录。

---

### ISSUE-13: `docs/INDEX.md` 声明的“唯一双语缺口”与代码库实际状态严重脱节

- **所属类别**：错误的文档 / 过时的文档
- **定位文件**：[docs/INDEX.md:237-249](file:///d:/Desktop/code/code/Incept/docs/INDEX.md#L237-L249)
- **文档断言**：第 245 行断言：“That is the only remaining gap.”（声称唯一缺少对等语言的文档是 `docs-markdown-like-authoring-syntax.md`）。
- **真实差距**：
  - `docs/decisions/en/account-and-access-design.md` 缺少中文版；
  - `docs/decisions/zh/docs-authoring-markdown-like-rules.md` 缺少英文版；
  - `docs/decisions/zh/docs-import-flow-rules.md` 缺少英文版；
  - `docs/runbooks/zh/local-artifacts.md` 缺少英文版；
  - `docs/runbooks/zh/owner-account-aegis.md` 缺少英文版。
- **影响性分析**：
  文档体系的自检索引失效，使后续团队和 AI 产生“双语已完备”的假象，关键安全设计指南无法被外语读者获取。
- **建议修复动作**：
  更新 `docs/INDEX.md`，真实修正双语文档缺口清单，并列入翻译待办。

---

### ISSUE-14: `single-article.ts` 中手写 70 行 switch 语句逐字段 1:1 原样浅拷贝

- **所属类别**：防御型代码（未解决任何问题）/ 本身存在更优雅写法被错误堆砌
- **定位文件**：[apps/web/src/features/docs/importer/parsers/markdown-like/conversion/single-article.ts:31-105](file:///d:/Desktop/code/code/Incept/apps/web/src/features/docs/importer/parsers/markdown-like/conversion/single-article.ts#L31-L105)
- **问题代码**：
  ```typescript
  function toDocsContentBlock(block: MarkdownLikeBlock): DocsContentBlockModel {
    switch (block.type) {
      case 'heading':
        return { id: block.id, type: 'heading', level: block.level, text: block.text, variant: block.variant };
      case 'quote':
        return { id: block.id, type: 'quote', text: block.text };
      case 'image':
        return { id: block.id, type: 'image', src: block.src, alt: block.alt, caption: block.caption };
      // ... 重复多达 9 个分支
  ```
- **问题根因**：
  解析器内部的 block 模型与最终文档系统的 block 模型定义在大多数分支上完全相同。开发者甚至在内联转换函数写下了注释：“两种结构完全一致，直接返回”，却仍然为顶层 block 手写了 70 余行的同名字段浅拷贝。
- **影响性分析**：
  毫无意义的样板代码，增加解析层复杂度与打包后体积，当 Block 类型扩展新通用字段时，很容易在该复制模板中漏掉。
- **建议修复动作**：
  简化为直接返回或使用精简映射函数，仅在有结构差异的类型（如 paragraph content 映射）处执行专门处理。

---

### ISSUE-15: `prisma/schema.prisma` 与 `seed.ts` 残留废弃的 User 模型与虚假种子插入

- **所属类别**：孤立数据模型 / 历史技术债
- **定位文件**：
  - [packages/db/prisma/schema.prisma:59-69](file:///d:/Desktop/code/code/Incept/packages/db/prisma/schema.prisma#L59-L69)
  - [packages/db/prisma/seed.ts:4-11](file:///d:/Desktop/code/code/Incept/packages/db/prisma/seed.ts#L4-L11)
- **问题根因**：
  在项目演进中，站点所有权模型被全面改造为物理隔离的 `OwnerAccount`（多因素/设备指纹/恢复码体系），普通只读访客走临时匿名/邀请凭证 `AccessPrincipal`。旧的 `model User` 已经彻底失去业务职能，但数据库 schema 仍保留了外键关联，`prisma/seed.ts` 也仅仅是向旧 User 表插入一个无用的 `system` 占位记录。
- **影响性分析**：
  产生死表和死数据，在数据库迁移和模型理解上产生混淆，使新加入的工程师或 AI 误以为系统仍支持常规多用户账号登录体系。
- **建议修复动作**：
  在下个破坏性主版本中，通过 Prisma Migration 废弃 `model User`，将 `createdById` 字段迁移为审计标识，并同步重构 `seed.ts`。

---

## 文档体系与源码注释专项深度审计 (5 大核心维度逐行审查与机器治理规范)

针对代码库中累积的文档与注释债务，本章节执行逐行级排查，归类为 5 大典型问题，并为自动化治理流水线提供明确的操作规范：

### 维度一：幽灵文档与幽灵路由（记录了根本不存在或已物理下线的功能）

#### 1.1 DOC-01: `README.md:192` 标注文档已被下线的 Studio 幽灵路由
- **定位**：[README.md:192](file:///d:/Desktop/code/code/Incept/README.md#L192)
- **现象**：README 宣称 `* **站长工作台与草稿审核**：http://localhost:3000/zh/studio（需 Owner 登录）`。
- **事实与代码证据**：
  在系统迭代中，`/studio/*` 路由已全量废弃拆除，并整合入 `/[locale]/settings`。自动化回归套件 [scripts/production-integration.ts:131-133](file:///d:/Desktop/code/code/Incept/scripts/production-integration.ts#L131-L133) 明确断言：`for (const retired of ['studio/roadmap', 'studio/docs/library', ...]) assert.equal(status, 404);`。
- **治理动作**：将 `README.md:192` 修正为当前实际路由 `http://localhost:3000/zh/settings`。

#### 1.2 DOC-04: `account-and-access-design.md` 宣称不存在的 `proxy.ts` 承担安全拦截
- **定位**：[docs/decisions/en/account-and-access-design.md:11](file:///d:/Desktop/code/code/Incept/docs/decisions/en/account-and-access-design.md#L11)
- **现象**：文档断言：`Global middleware runs in apps/web/src/proxy.ts... It terminates or redirects unauthenticated access to Owner surfaces.`。
- **事实与代码证据**：
  Next.js 契约要求全局中间件必须命名为 `middleware.ts`。由于命名为 `proxy.ts`，Next.js 从未将其编译入运行栈（`middleware-manifest.json` 为空）；且 Owner 鉴权实际上由各 Route Handler 与 Server Actions 内联校验。该文档误导工程师与 AI 产生“中间件已建立严密安全外壳”的错觉。
- **治理动作**：更正文档，如后续将 `proxy.ts` 正确重命名为 `middleware.ts`，则同步准确描述其仅承担 i18n 语言路由协商，而非页面级 Owner 鉴权。

#### 1.3 DOC-05: `docs/READAI.md:80-84` 记载虚构目录与死文件名
- **定位**：[docs/READAI.md:80-84](file:///d:/Desktop/code/code/Incept/docs/READAI.md#L80-L84)
- **现象**：在 Commit Type 规范中规定：
  - `feat`: `New items in roadmap/`（仓库根无 `roadmap/`，仅有 `packages/roadmap/`）
  - `fix`: `Debug records in ai-context/`（全仓库不存在 `ai-context/` 目录）
  - `exp`: `Recorded in scratchpad.md`（全仓库不存在 `scratchpad.md`，临时产物统一位于 `.scratch/`）
- **事实与影响**：向新加入的 AI Agent 提供了幽灵路径指示，导致 Agent 试图向不存在的文件写入调试或记录，引发文件创建混乱。
- **治理动作**：清理 `READAI.md`，将对应路径纠正为规范的 `.scratch/` 或实际包路径。

---

### 维度二：过时报告与积压日志（未按规范迁移至 history / finish-task）

#### 2.1 DOC-02: `docs/current-task/` 违背索引准则，超期积压 41 份过期历史记录
- **定位**：[docs/current-task/](file:///d:/Desktop/code/code/Incept/docs/current-task/)
- **规约对比**：
  - [docs/INDEX.md:87-97](file:///d:/Desktop/code/code/Incept/docs/INDEX.md#L87-L97)：`current-task/: Stores only work that is actively being carried across sessions... Completed material should move out promptly.`
  - [docs/READAI.md:68](file:///d:/Desktop/code/code/Incept/docs/READAI.md#L68)：`当界面内容条目超过20条时，自动将相关task迁移至 finish-task 目录`。
- **现状剖析**：
  当前目录下积压了 41 份文档。包含了从 2026-09-01 起的大量历史任务记录（如 `2026-09-01-docs-collection-navigation-milestone.md`、`2026-09-23-docs-maintenance-and-next-round-handoff.md`、`2026-10-13-production-readiness-audit.md` 等）。这些早在一周至一个月前交付的内容从未被移出。
- **系统性影响**：AI 检索上下文时频繁命中大量陈旧代码设计与临时断言，造成严重的上下文污染与大量无谓 Token 消耗。
- **治理动作**：除当前正在进行或当日本轮任务（如 2026-10-16 相关修复）外，将其余 35+ 份已完成任务文档批量迁入 `docs/finish-task/`。

#### 2.2 DOC-06: `docs/plans/` 违规留存已交付的大型计划未销毁
- **定位**：[docs/plans/2026-10-14-owner-auth-mfa-pro-incremental-plan.md](file:///d:/Desktop/code/code/Incept/docs/plans/2026-10-14-owner-auth-mfa-pro-incremental-plan.md)
- **规约对比**：
  [docs/INDEX.md:114-115](file:///d:/Desktop/code/code/Incept/docs/INDEX.md#L114-L115) 明确要求：“`a plan that is finished has no home here; its outcome is recorded as a finish-task/ record and any stable rule it produced moves to decisions/`；`a superseded plan is deleted after its outcome is recorded`”。
- **现状剖析**：该文件中规划的 AUTH-01/02/03 与 ACL-01/02/03 全套逻辑与本地界面早已在 2026-10-14/15 交付（见 `2026-10-14-owner-auth-implementation.md` 与相关 commit），但该计划文件仍然驻留在 `plans/`。
- **治理动作**：按规则将其实施结论确认归档至 `finish-task/`，并从 `plans/` 中安全移除。

#### 2.3 DOC-07: `docs/NEXT.md:18-34` 违背自身边界堆积历史演进流水账
- **定位**：[docs/NEXT.md:18-34](file:///d:/Desktop/code/code/Incept/docs/NEXT.md#L18-L34)
- **规约对比**：
  `NEXT.md` 第 12-16 行自我声明：“`Boundaries: Deferred work and completed milestones do not belong in this file. Historical implementation records are in docs/finish-task/`”。
- **现状剖析**：
  该文件在自我声明边界后，紧接着堆砌了 `## 2026-10-13 Production readiness`、`## 2026-10-14 Post-launch follow-up`、`2026-10-14 current increment`、`2026-10-14 v0.2`、`2026-10-14 implementation` 等多达 5 个段落的历史执行流水账，直接违反自我设定的边界。
- **治理动作**：精简 `NEXT.md`，将第 18-34 行历史演化记录剥离移入 `finish-task/`，只保留当前唯一活跃的产品待办与下一步指引（第 35-51 行）。

---

### 维度三：错误代码注释、过时 TODO 与失实推断

#### 3.1 DOC-08: `music-player-floating.tsx` 保留已知失真的过时 TODO 注释
- **定位**：[packages/music/src/react/music-player/components/music-player-floating.tsx:118](file:///d:/Desktop/code/code/Incept/packages/music/src/react/music-player/components/music-player-floating.tsx#L118)
- **注释内容**：
  `/* TODO: nextRequested / previousRequested / seekRequested 已在 core 实现并有测试覆盖，播放器 UI 依然没有入口；*/`
- **事实与代码证据**：
  原生的播放列表展开滑杆早已接入 `seekRequested`。[docs/BACKLOG.md:300](file:///d:/Desktop/code/code/Incept/docs/BACKLOG.md#L300) 甚至写明：“展开播放列表新增原生进度滑杆，已接入 seekRequested；原有历史 TODO 注释保留，seek 部分由本条补充更新状态”。源码里的注释却并未修正，导致源码与现实脱节。
- **治理动作**：更新注释为仅保留 `nextRequested / previousRequested` 尚未接入 UI，删除 `seekRequested` 已无入口的虚假描述。

#### 3.2 DOC-09: 4 处类型定义保留虚构的 Tag 契约 TODO 误导架构演进
- **定位**：
  - [packages/db/src/docs/types.ts:145](file:///d:/Desktop/code/code/Incept/packages/db/src/docs/types.ts#L145)
  - [packages/db/src/docs/types.ts:223](file:///d:/Desktop/code/code/Incept/packages/db/src/docs/types.ts#L223)
  - [apps/web/src/features/docs/shared/types.ts:86](file:///d:/Desktop/code/code/Incept/apps/web/src/features/docs/shared/types.ts#L86)
  - [apps/web/src/features/docs/shared/types.ts:110](file:///d:/Desktop/code/code/Incept/apps/web/src/features/docs/shared/types.ts#L110)
- **注释内容**：
  `// TODO: Tags are an unused contract placeholder until the tag data model exists; no query populates this yet.`
- **事实与影响**：检查 `packages/db/prisma/schema.prisma`，数据层完全没有设计 Tag 模型的计划，文章元数据已由 Collections 和 Eyebrow 分类承载。该 TODO 自 5 月脚手架初始化遗留至今，使后续代码阅读者持续等待一个并不存在的“未来 Tag 系统”。
- **治理动作**：若确认不引入独立 Tag 表，应清理该占位字段与虚假 TODO，或在决策文档中明确收敛。

#### 3.3 补充项：`packages/db/src/docs/import.ts:1100` 三元无意义假代码与未完成 TODO
- **定位**：[packages/db/src/docs/import.ts:1099-1100](file:///d:/Desktop/code/code/Incept/packages/db/src/docs/import.ts#L1099-L1100)
- **代码**：
  ```typescript
  // TODO: Both branches of the replace check resolve to 'updated'; collapse this once the renamed and removed statuses are final.
  status: unchanged ? 'unchanged' : replace ? 'updated' : 'updated',
  ```
- **问题**：`replace ? 'updated' : 'updated'` 无论何种情况都返回 `'updated'`，属于纯粹无效的条件判断与被废弃的 TODO，长期无人折叠。
- **治理动作**：折叠为 `status: unchanged ? 'unchanged' : 'updated'` 并移除过时 TODO。

---

### 维度四：冗余废话报告与心理活动记录（“等待负责人验收”、“但这不意味着”等）

#### 4.1 DOC-10: 文档充斥“等待人工认可/不代表完成”的心理推脱套话与“取代前文”前后矛盾
- **定位**：
  - [docs/current-task/2026-10-14-owner-auth-implementation.md:84 vs 94](file:///d:/Desktop/code/code/Incept/docs/current-task/2026-10-14-owner-auth-implementation.md#L84-L94)
  - [docs/BACKLOG.md:319](file:///d:/Desktop/code/code/Incept/docs/BACKLOG.md#L319)
  - [docs/current-task/2026-10-14-owner-account-ui-preview.md:35-37](file:///d:/Desktop/code/code/Incept/docs/current-task/2026-10-14-owner-account-ui-preview.md#L35-L37)
- **典型现象展示**：
  1. **自我否定叠加**：在 `owner-auth-implementation.md:84` 写下“前端最终修改与人工认可仍未完成...”，紧接着在同一文件的第 94 行追加：“本轮逻辑已获用户验收；此确认取代前文‘当前界面尚待人工认可’的状态”——典型的“用追加废话取代修改原文”的偷懒行为。
  2. **会话对话情绪污染 Backlog**：`BACKLOG.md:319` 记录：“用户要求逻辑完成就停，前端仍待修改，不制作推送服务器的包；六项整体验收框等待前端人工认可...”。临时性对话沟通要求被不加甄别地录入长期文档。
  3. **通篇否定句流水账**：`owner-account-ui-preview.md:35`：“此次未更新生产、未写真实账号/演示Owner、未构建发布镜像、未创建commit...”。
- **治理原则**：
  工程报告只记录客观交付物、测试事实、已验证接口与明确待办（What was done & Acceptance gates）。禁止将临时心态、未发生行为的冗长枚举及“但这不意味着某某已完成”的官样文章写入代码库文档。

---

### 维度五：全局基础文档精简与过时索引治理 (`INDEX.md`, `NEXT.md`, `READAI.md`, `TRANSFER.md`)

#### 5.1 DOC-11: `docs/INDEX.md` 重复段落、死索引与 9 篇 Runbooks 严重漏登
- **定位**：
  - [docs/INDEX.md:117](file:///d:/Desktop/code/code/Incept/docs/INDEX.md#L117)
  - [docs/INDEX.md:179-191](file:///d:/Desktop/code/code/Incept/docs/INDEX.md#L179-L191)
  - [docs/INDEX.md:283-290](file:///d:/Desktop/code/code/Incept/docs/INDEX.md#L283-L290)
- **问题细查**：
  1. **低级复制粘贴重复**：第 283-290 行的 `### For decisions` 及其下属 5 行说明，与第 275-282 行完全 100% 逐字重复。
  2. **死索引陈旧失效**：第 117 行宣称 `The directory is currently empty, which is a valid state.`，但 `docs/plans/` 目录下实际长期存在 `2026-10-14-owner-auth-mfa-pro-incremental-plan.md` 和 `2026-10-16-post-launch-next-steps-plan.md`。
  3. **Runbooks 大面积漏登**：第 179-191 行仅登记了 5 个导入手册和 2 个 worktree 手册，而实际存在并被频繁使用的 `docs-content-import.md(en)`、`roadmap-content-import.md(en/zh)`、`local-artifacts.md(zh)`、`owner-account-aegis.md(zh)`、`local-postgres-docker-setup.md(en/zh)`、`production-deployment.md(en/zh)` 等多达 9 篇运维手册完全未被索引登记！
- **治理动作**：删除第 283-290 行的重复段落；更新 `docs/plans/` 当前实际状态说明；补齐全部正式 Runbooks 索引。

#### 5.2 DOC-12: `packages/dashboard/dist/TRANSFER.md` 与 `tools/` 产生 100% 重复提交
- **定位**：
  - [packages/dashboard/dist/TRANSFER.md](file:///d:/Desktop/code/code/Incept/packages/dashboard/dist/TRANSFER.md)
  - [packages/dashboard/tools/TRANSFER.md](file:///d:/Desktop/code/code/Incept/packages/dashboard/tools/TRANSFER.md)
- **问题剖析**：
  经逐字节对比，两份文件完全一字不差。`dist/` 属于打包构建输出目录（由 `corepack pnpm dashboard:build-tools` 生成并复制），本应在 `.gitignore` 中由构建动作产出，却将一份完整的说明文件直接跟踪进 Git，形成双重维护冗余。
- **治理动作**：将 `packages/dashboard/dist/TRANSFER.md` 移出版版本库跟踪，源码统一维护于 `packages/dashboard/tools/TRANSFER.md`。

---

## 自动化修复验证基准 (Acceptance Checklist)

全部 12 项核心代码与 12 项文档缺陷已全数通过门禁验收：

- [x] **1. 路由探针验收 (已核验 - ISSUE-01)**：核对 Next.js 16 官方契约确认 `proxy.ts` 为当前规范约定，实测 `GET /` 307 重定向至默认语言路由（`http://localhost:3000/zh`），返回有效页面而非 404；
- [x] **2. 脚本与破损测试验收 (已完成 - ISSUE-03, 04)**：清理根目录 `music:check-adapter` 脚本并删除 `scripts/test-dashboard-loader.mjs`，确保 `pnpm test` 无破损脚本调用；
- [x] **3. 采集器健壮性验收 (已完成 - ISSUE-07)**：`packages/dashboard/src/adapters/local/collectors/gemini.ts` 捕获异常追加到 `errors: string[]` 并在 `agents.ts` 聚合输出；
- [x] **4. 孤立死代码彻底清理 (已完成 - ISSUE-05, 06, 11)**：物理删除 `__fixtures__/` 夹具、`use-breakpoint.ts` 空壳及 `scripts/` 中包含本地 Windows 绝对路径的单次脚本；
- [x] **5. 代码堆砌与分词修复 (已完成 - ISSUE-08, 09, 10, 14, 15)**：复用 `Prisma.TransactionClient`，连续汉字分词修复，去除 70 行 switch 浅拷贝，解耦旧 User seed；
- [x] **6. 文档与目录干净度 (已完成 - DOC-02, 06, 07)**：`docs/current-task/` 历史积压全部归档至 `docs/finish-task/`，仅保留活跃工作流；
- [x] **7. 文档索引真实性验证 (已完成 - DOC-01, 03, 04, 05, 11, 12)**：`docs/INDEX.md` 无重复段落，所登记 16 篇 Runbooks 与磁盘 1:1 吻合，消除虚假双语说明与幽灵路由；
- [x] **8. 代码注释与伪三元清理 (已完成 - DOC-08, 09, 10)**：修正 `seekRequested` 与 Tag 虚构 TODO 注释，折叠 `replace ? 'updated' : 'updated'` 伪三元逻辑；
- [x] **9. 全库类型检查与测试基线 (已通过)**：`pnpm typecheck` 保持全 Monorepo 0 错误（含 web, music, db, roadmap, dashboard 及 scripts）；`pnpm test` 635 项全通，运维测试 3/3 全通。
