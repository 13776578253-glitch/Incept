# Web 页面层级规则

这份文档只讨论一件事：

**在当前 `apps/web` 结构下，页面应该按什么层级组织，才能保证后续接真实内容时不反复牵一发而动全身。**

这份规则优先级高于“先把页面跑起来”。

---

## 1. 当前目标

当前 `web` 的页面不是做一个万能大壳，而是做：

- 一个全站稳定顶栏
- 多个页面类型自己的主体布局
- 每个页面类型下的具体内容

当前已经明确的页面类型有：

- `docs`
- `settings`
- `workspace`

其中：

- `docs` 是三栏思路：左侧边栏 / 中间正文 / 右侧信息栏
- `settings` 是两栏思路：左侧边栏 / 中间正文
- `workspace` 暂时保留独立演进空间，不强行和 `docs` / `settings` 共壳

---

## 2. 当前仓库里的相关结构

当前已经存在的主要位置：

```text
apps/web/src/
├── app/
│   ├── layout.tsx
│   └── [locale]/
│       ├── layout.tsx
│       ├── page.tsx
│       ├── docs/page.tsx
│       ├── settings/page.tsx
│       └── workspace/page.tsx
├── components/
│   ├── base/
│   ├── layouts/
│   └── adaptives/
├── features/
│   ├── home/
│   ├── settings/
│   └── workspace/
└── styles/
```

这套结构已经足够承载分层，不需要再回到“一个超级组件装全站”的做法。

---

## 3. 页面层级总览

当前页面层级统一按这 4 层理解：

```text
Layer 1: Root App Layer
Layer 2: Global Navigation Layer
Layer 3: Section Layout Layer
Layer 4: Page Content Layer
```

对应到当前仓库，大致是：

```text
Layer 1 -> app/layout.tsx + app/[locale]/layout.tsx + components/base/
Layer 2 -> components/layouts/site-header*.tsx
Layer 3 -> components/layouts/ + components/adaptives/
Layer 4 -> features/* + app/[locale]/*/page.tsx
```

---

## 4. Layer 1: Root App Layer

### 作用

这一层负责应用能正常运行的最外层环境。

### 对应位置

- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/[locale]/layout.tsx`
- `apps/web/src/components/base/root-provider.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/i18n/*`

### 能做什么

- 定义 `html` / `body`
- 注入全局 provider
- 注入 i18n / theme 环境
- 加载全局样式
- 校验 locale

### 不能做什么

- 决定 `docs` 是三栏还是两栏
- 决定 `settings` 有什么侧栏
- 放具体业务内容
- 放某个页面类型的特殊展示逻辑

### 当前规则

- 根层只负责“应用怎么活着”
- 不负责“某类页面怎么摆”

---

## 5. Layer 2: Global Navigation Layer

### 作用

这一层是全站稳定层，用来承载始终存在的导航结构。

### 对应位置

- `apps/web/src/components/layouts/site-header.tsx`
- `apps/web/src/components/layouts/site-header-mo.tsx`

### 能做什么

- 顶部导航
- 主题切换入口
- 语言切换入口
- 全站级导航入口

### 不能做什么

- 控制 docs 正文布局
- 控制 settings 的内容区域结构
- 承担页面主体响应式切换
- 变成 docs 或 settings 的业务容器

### 当前规则

- 顶栏是全站共享层
- 顶栏不属于 docs、settings、workspace 任一 feature
- 顶栏静止，下面主体区随路由变化

---

## 6. Layer 3: Section Layout Layer

### 作用

这一层负责“某一类页面怎么摆”。

这是最关键的一层，也是上一版最容易失控的地方。

### 对应位置

- `apps/web/src/components/layouts/`
- `apps/web/src/components/layouts/containers/`
- `apps/web/src/components/adaptives/`

### 这一层的核心任务

- 组织侧边栏、正文、信息栏的位置关系
- 决定不同屏幕下布局如何切换
- 管理页面主体结构，但不写正文业务

### 必须拆开的页面类型

#### Docs Section Layout

结构：

- 顶部导航下方
- 左侧 docs 侧边栏
- 中间 docs 正文
- 右侧 docs 信息栏

职责：

- 管 docs 页面整体三栏结构
- 管 docs 页面在不同屏幕下三栏怎么收缩

#### Settings Section Layout

结构：

- 顶部导航下方
- 左侧 settings 侧边栏
- 中间 settings 正文

职责：

- 管 settings 页面整体两栏结构
- 管 settings 页面在不同屏幕下导航怎么变

#### Workspace Section Layout

结构：

- 暂时独立

职责：

- 先不强行复用 docs/settings 布局
- 等真实内容明确后再定主体结构

### 不能做什么

- 直接写某篇 docs 的正文内容
- 直接写 settings 的表单细节
- 混入大量 feature 状态
- 做成“一个 layout 兼容 docs/settings/workspace 所有模式”

### 当前规则

- `docs` 和 `settings` 不共用一个主体 layout
- 可以共用布局原子能力
- 不能共用一个超级 section shell

---

## 7. Layer 4: Page Content Layer

### 作用

这一层负责每个页面真正展示什么内容。

### 对应位置

- `apps/web/src/app/[locale]/page.tsx`
- `apps/web/src/app/[locale]/docs/page.tsx`
- `apps/web/src/app/[locale]/settings/page.tsx`
- `apps/web/src/app/[locale]/workspace/page.tsx`
- `apps/web/src/features/home/`
- `apps/web/src/features/settings/`
- `apps/web/src/features/workspace/`

### 能做什么

- 输出页面正文
- 组合 feature 私有组件
- 承载页面具体业务逻辑
- 使用 section layout 提供的结构区域

### 不能做什么

- 决定全站顶栏如何工作
- 决定整页三栏还是两栏
- 自己实现全局响应式规则
- 反向控制根 layout

### 当前规则

- `page.tsx` 负责把内容接到正确 layout 语义里
- 真正复杂的内容实现下沉到 `features`

---

## 8. 当前推荐的布局关系

结合你现在的需求，推荐按这个关系理解：

```text
App Root
└── Locale Layer
    └── Global Navigation
        └── Section Layout
            ├── Docs Layout
            │   ├── Docs Sidebar
            │   ├── Docs Main Content
            │   └── Docs Info Aside
            ├── Settings Layout
            │   ├── Settings Sidebar
            │   └── Settings Main Content
            └── Workspace Layout
                └── Workspace Main Content
```

这个结构的关键点是：

- 顶栏在 section layout 之上
- section layout 决定主体结构
- 内容只填进结构，不负责搭结构

---

## 9. Next.js 下如何理解“SPA 壳”

你文档里提到一个很关键的问题：

> 我之前写原生 js、html、css 的时候会讲究 spa 结构，现在 ts 配 next 是不是不存在了？

答案是：

**不是不存在了，而是从“单一外壳思维”变成了“分层 layout 思维”。**

以前你可能会做：

- 一个固定壳
- 中间区域切页面

现在在 Next App Router 里应该做：

- 根 layout 放应用级稳定层
- 子 layout 放页面类型级稳定层
- page 放具体内容

所以：

- SPA 的“稳定壳”思想还在
- 只是实现方式变成了多层 layout

---

## 10. 当前必须守住的 6 条边界

### 边界 1

根 layout 不负责页面类型布局。

### 边界 2

顶栏不属于 docs / settings / workspace 任一 feature。

### 边界 3

`docs` 和 `settings` 不共用同一个主体 layout。

### 边界 4

正文内容组件不能决定整页结构。

### 边界 5

响应式布局切换发生在 section layout 层，不发生在正文内容层。

### 边界 6

如果某个 layout 同时开始服务 docs、settings、workspace 三类主体结构，说明它已经过大。

---

## 11. 当前仓库里的落位建议

后续真开始接界面时，建议这样落位：

### 根层

- `app/layout.tsx`
- `app/[locale]/layout.tsx`
- `components/base/root-provider.tsx`

### 全站导航层

- `components/layouts/site-header.tsx`
- `components/layouts/site-header-mo.tsx`

### Section Layout 层

建议后续在 `components/layouts/containers/` 下继续细分：

```text
components/layouts/containers/
├── docs-shell.tsx
├── settings-shell.tsx
└── workspace-shell.tsx
```

这些文件未来的职责是：

- `docs-shell.tsx`: docs 三栏结构
- `settings-shell.tsx`: settings 两栏结构
- `workspace-shell.tsx`: workspace 主体结构

响应式切换辅助逻辑仍由：

- `components/adaptives/breakpoints.ts`
- `components/adaptives/screen.ts`
- `components/adaptives/layout-strategies.ts`
- `components/adaptives/adaptive-shell.tsx`

提供支持。

### 内容层

- `app/[locale]/*/page.tsx`
- `features/*`

---

## 12. 现在先不要做的事

为了避免重走上一版问题，当前阶段不要：

- 做一个全站唯一超级 shell
- 让 settings 借用 docs 主体结构
- 在一个 layout 里写太多 `if docs / if settings / if workspace`
- 让正文组件自己判断整页布局
- 为未来所有可能页面提前造统一模式

---

## 13. 最终判断标准

当你写一个新组件时，先判断它属于哪一层：

1. 它是不是应用运行环境的一部分？
是：Root App Layer

2. 它是不是全站稳定导航的一部分？
是：Global Navigation Layer

3. 它是不是在决定某一类页面的主体布局？
是：Section Layout Layer

4. 它是不是只负责某页具体内容？
是：Page Content Layer

如果这 4 个问题都答不清，那就先不要写实现，先补层级设计。

