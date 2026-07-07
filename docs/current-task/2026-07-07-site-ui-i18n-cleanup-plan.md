# Site UI i18n 清理计划

[2026-07-07] - Planning / visual review first

## 背景

`documentKey` 已经完成第一阶段实现，docs 内容层已经可以表达同一篇文档的中英文版本。

但当前真正优先的问题不是 docs 正文覆盖率，而是全站 UI 文案在 `/zh` 下仍然混有大量英文。

本阶段目标：

```text
先清理全站 UI 文案 i18n
再处理 docs 内容的中英文覆盖率和自动翻译工作流
```

## 核心原则

| 原则 | 说明 |
| --- | --- |
| UI 文案和 docs 正文分开处理 | UI 文案走 `messages` / next-intl；docs 正文走 `documentKey + locale` 内容系统。 |
| Public UI 优先 | 用户能直接看到的前台页面优先清理。 |
| Internal UI 暂缓 | studio、import-preview、style-lab 等内部界面可以暂时保留英文。 |
| 肉眼复查为主 | 本轮主要通过网页逐页检查 `/en` 和 `/zh` 的显示效果。 |
| 不追求一次全量完成 | 先建立清单和规则，再按页面逐步迁移。 |

## 当前已知结构

当前 i18n 基础设施：

```text
apps/web/src/messages/
  en/
  zh/

apps/web/src/app/[locale]/layout.tsx
  -> getLocaleMessages(locale)
  -> RootProvider
```

当前 public 路由主要包括：

```text
/{locale}
/{locale}/about
/{locale}/docs
/{locale}/docs/{slug}
```

当前 internal / 暂缓路由包括：

```text
/{locale}/studio
/{locale}/docs/style-lab
/{locale}/docs/import-preview/{draftId}
/{locale}/workspace
/{locale}/create
/{locale}/settings
/{locale}/resources
```

导航已经使用翻译 key：

```text
apps/web/src/components/layouts/site-navigation.ts
```

因此本轮重点不是导航，而是页面、feature、shell、empty state、button、label、metadata 等硬编码文案。

## 清理范围

### P0: Public UI

优先清理：

```text
/{locale}
/{locale}/about
/{locale}/docs
/{locale}/docs/{slug}
```

涉及区域：

- 顶部导航可见文案
- 首页 hero / section / card
- About 页面文案
- Docs 首页标题、分组、空状态
- Docs article shell
- Docs outline label
- Docs sidebar label
- 文章不存在 / not found 附近的用户可见文案

### P1: Public-adjacent UI

次级清理：

```text
docs collection / series 页面
docs 文章卡片
role / access / status 相关标签
```

这些属于 public docs 的扩展显示面，但可在 P0 后处理。

### P2: Internal UI

暂缓：

```text
studio
import-preview
style-lab
workspace
create
settings
resources
```

原因：

- 这些目前更像内部能力。
- 近期主目标是前台 public 体验。
- 内部工具可先保留英文，后续统一处理后台/工作台命名与权限。

## 肉眼复查路径

每轮清理后，用浏览器检查以下页面。

### 中文

```text
http://localhost:3000/zh
http://localhost:3000/zh/about
http://localhost:3000/zh/docs
http://localhost:3000/zh/docs/{published-zh-slug}
```

检查重点：

- 是否还有明显英文 UI 文案
- 按钮、标签、卡片标题是否中文
- 空状态是否中文
- 页面标题和说明是否中文
- docs shell 中的 `On this page` 等是否被中文替换

### 英文

```text
http://localhost:3000/en
http://localhost:3000/en/about
http://localhost:3000/en/docs
http://localhost:3000/en/docs/{published-en-slug}
```

检查重点：

- 英文页面不要误显示中文 UI
- 中文 docs 正文不作为 UI 错误处理
- 专有名词、代码、品牌名可以保留英文

## 文案分类规则

| 类型 | 处理方式 |
| --- | --- |
| 全站 UI 文案 | 放入 `messages/{locale}`。 |
| 页面级 UI 文案 | 放入对应 namespace。 |
| docs 正文 | 不进 messages，由 docs 内容系统管理。 |
| code / command / URL | 保留原文。 |
| 专有名词 | 可保留英文，必要时中文解释。 |
| internal tooling 文案 | 暂缓，不作为 P0 阻断。 |

## 推荐 messages namespace

建议后续逐步形成：

```text
navigation
home
about
docs.home
docs.article
docs.common
errors
```

示例：

```json
{
  "docs": {
    "article": {
      "outlineLabel": "本页目录"
    }
  }
}
```

英文：

```json
{
  "docs": {
    "article": {
      "outlineLabel": "On this page"
    }
  }
}
```

## 推荐执行步骤

### Phase 1: 调查硬编码文案

只读扫描：

```text
apps/web/src/app
apps/web/src/features
apps/web/src/components
apps/web/src/server/docs/mappers.ts
```

输出页面级清单：

```text
页面 / 组件
当前英文文案
是否 public
建议 namespace
```

### Phase 2: 先清理 Docs Shell

优先处理 docs 阅读壳层：

- outline label
- sidebar label
- docs home intro
- article card labels
- empty state

原因：

- docs 是当前最活跃模块。
- 这里的中英文混杂最容易被肉眼发现。

### Phase 3: 清理 Home / About

处理：

- 首页 hero
- 首页 section
- about 页面标题/段落/按钮

### Phase 4: 页面复查

每完成一组页面，打开 `/zh` 与 `/en` 对照复查。

记录：

```text
已完成
仍有英文
可接受英文
暂缓 internal
```

## 不在本阶段处理

- 不处理 docs 正文翻译质量。
- 不做 AI 自动翻译发布。
- 不做翻译审核后台。
- 不做 documentKey 覆盖率统计。
- 不清理 internal/studio/import-preview/style-lab 的全部英文。
- 不重构路由结构。

## 后续 docs 内容多语言工作流

等 UI i18n 基础完成后，再做 docs 内容工作流：

```text
有人工翻译 -> 优先使用人工版本
没有人工翻译 -> AI 生成 draft
作者 review
confirm import
published
```

可选状态：

```text
manual
ai-draft
needs-review
approved
published
```

这部分依赖 `documentKey`，但不属于本阶段。

## 当前推荐下一步

先做一次硬编码文案扫描，生成 public UI 清单。

优先检查：

```text
apps/web/src/features/docs
apps/web/src/server/docs/mappers.ts
apps/web/src/features/home
apps/web/src/app/[locale]/about
```

然后从 docs shell 开始逐页修。

## Commit 建议

```text
docs: plan site ui i18n cleanup
```

