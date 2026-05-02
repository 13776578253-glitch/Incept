# Web 页面布局规划

这份文档用于固定当前 `web` 的页面布局逻辑。

这次的核心不是按“功能模块”分，而是按：

**导航栏切换后，用户实际会进入哪一种界面骨架。**

也就是说，页面规划要围绕导航体验来组织，而不是围绕实现方便来组织。

---

## 1. 当前导航思路

当前站点按导航入口切换界面，整体体验参考你给出的顶部导航样式：

- 顶部导航固定存在
- 导航项切换不同页面类型
- 某些导航项可以展开下拉面板
- 页面主体在导航下方切换

这意味着：

- 顶栏是全站稳定层
- 真正变化的是顶栏下面的页面骨架
- 页面骨架需要按“导航进入后的界面类型”来分类

---

## 2. 当前页面骨架分类

当前不是简单按 `home / docs / workspace / settings` 平铺理解，而是按**页面骨架类型**分为 4 类：

1. `Simple Page`
2. `Document Page`
3. `Workspace Page`
4. `Create Page`

这是当前最重要的结论。

---

## 3. 四类页面骨架

## 3.1 Simple Page

这类页面只有正文区为主体，其余区域只是留白或弱占位。

当前属于这一类的页面：

- `home`
- `about`
- `docs archive`

说明：

- `docs` 里面要单独拆一个“归档/总览/入口页”
- 这个归档页不是文档正文页
- 它的结构应该和 `home` / `about` 接近，而不是硬套文档三栏

所以：

**`docs` 体系内部本身就要分成两类页面：**

1. `docs archive`，属于 `Simple Page`
2. `docs detail`，属于 `Document Page`

### 结构理解

```text
顶部导航

留白区 | 正文主体 | 留白区
```

或者更直接理解为：

```text
顶部导航

单栏正文页
```

### 适用场景

- 首页
- 关于页
- 文档总览页
- 聚合型内容页

### 当前规则

- 这类页面不使用左侧栏做主导航
- 这类页面不使用右侧信息栏承载重点内容
- 它们重点是正文内容和页面节奏

---

## 3.2 Document Page

这类页面是真正文档阅读页。

当前属于这一类的页面：

- `docs detail`
- `settings`

### 结构理解

```text
顶部导航

左侧栏 | 正文 | 右侧栏
```

### `docs detail`

右侧栏有真实用途，例如：

- 目录
- 信息栏
- 锚点
- 补充说明

### `settings`

`settings` 也属于这类页面，但规则是：

- 继续保留三栏骨架
- 右侧栏默认留白
- 正文不能横向扩张去吞右侧区域

也就是说：

**`settings` 不是两栏系统，而是文档型三栏系统里的“右栏留白版”。**

### 当前规则

- `docs detail` 和 `settings` 共享文档型主体骨架
- 但正文内容不能直接控制左栏和右栏结构
- 响应式切换由文档型 layout 处理

---

## 3.3 Workspace Page

这类页面是独立工作界面。

当前属于这一类的页面：

- `workspace`

### 结构理解

```text
顶部导航

Workspace 独立主体界面
```

### 当前规则

- `workspace` 不并入文档型页面体系
- `workspace` 只共享全站顶栏
- `workspace` 拥有自己的主体结构

### 说明

这类页面后续可能更像工具台、工作区、操作台，而不是文档页。

所以不能为了复用而去套 `docs/settings` 的壳。

---

## 3.4 Create Page

这类页面单独成体系。

当前属于这一类的页面：

- `create`

### 结构理解

```text
顶部导航

Create 独立主体界面
```

### 当前规则

- `create` 不并入 `workspace`
- `create` 也不并入文档型页面
- 它是单独的页面骨架类型

### 说明

`create` 未来大概率会有自己的操作节奏、输入区、预览区、步骤区或编辑区，所以现在就应该把它视为独立页面类型，而不是临时挂在别的壳下。

---

## 4. 当前页面与骨架映射

按现在的理解，页面映射关系应当是：

```text
Simple Page
├── home
├── about
└── docs archive

Document Page
├── docs detail
└── settings

Workspace Page
└── workspace

Create Page
└── create
```

这比按路由名平铺更重要，因为后续真正写界面时，**骨架类型**决定了 layout，而不是页面名字决定 layout。

---

## 5. 页面层级统一模型

所有页面统一按这 4 层理解：

```text
Layer 1: Root App Layer
Layer 2: Global Navigation Layer
Layer 3: Page Shell Layer
Layer 4: Page Content Layer
```

---

## 6. Layer 1: Root App Layer

### 当前对应

- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/[locale]/layout.tsx`
- `apps/web/src/components/base/root-provider.tsx`
- `apps/web/src/i18n/*`
- `apps/web/src/app/globals.css`

### 职责

- `html`
- `body`
- provider
- locale
- theme
- 全局样式入口

### 不负责

- 哪一类页面用哪种骨架
- docs 是否三栏
- workspace 怎么布局
- create 怎么布局

---

## 7. Layer 2: Global Navigation Layer

### 当前对应

- `apps/web/src/components/layouts/site-header.tsx`
- `apps/web/src/components/layouts/site-header-mo.tsx`

### 职责

- 全站顶部导航
- 导航项切换入口
- 下拉面板入口
- 语言切换
- 主题切换

### 当前规则

- 顶栏固定存在
- 所有页面都共享顶栏
- 顶栏下面才是不同骨架页面

### 不负责

- 页面主体结构
- 页面内部业务逻辑

---

## 8. Layer 3: Page Shell Layer

这一层负责：

**这一页到底是 Simple / Document / Workspace / Create 中的哪一类骨架。**

这层是最关键的结构边界。

### 当前建议的壳组件

后续建议在：

```text
components/layouts/containers/
```

下放置：

```text
components/layouts/containers/
├── simple-shell.tsx
├── document-shell.tsx
├── workspace-shell.tsx
└── create-shell.tsx
```

### 四个壳的职责

#### `simple-shell.tsx`

服务页面：

- `home`
- `about`
- `docs archive`

负责：

- 单栏正文页容器
- 基础留白
- 内容宽度控制

#### `document-shell.tsx`

服务页面：

- `docs detail`
- `settings`

负责：

- 左中右三栏骨架
- docs 右栏信息位
- settings 右栏留白策略

#### `workspace-shell.tsx`

服务页面：

- `workspace`

负责：

- workspace 独立主体结构

#### `create-shell.tsx`

服务页面：

- `create`

负责：

- create 独立主体结构

---

## 9. Layer 4: Page Content Layer

### 当前对应

- `apps/web/src/app/[locale]/page.tsx`
- `apps/web/src/app/[locale]/docs/page.tsx`
- `apps/web/src/app/[locale]/settings/page.tsx`
- `apps/web/src/app/[locale]/workspace/page.tsx`
- 后续的 `create/page.tsx`
- `apps/web/src/features/*`

### 职责

- 页面真实内容
- feature 业务逻辑
- 页面模块组合

### 不负责

- 整页骨架分类
- 左中右结构决策
- 全站导航结构

---

## 10. 当前最重要的边界

### 规则 1

页面先判定骨架类型，再决定放哪个 shell。

### 规则 2

`docs archive` 和 `docs detail` 必须分开看，不能因为都叫 docs 就共用一个 layout。

### 规则 3

`settings` 属于 Document Page，不是 Simple Page。

### 规则 4

`workspace` 单独成体系，不借 document-shell。

### 规则 5

`create` 单独成体系，不借 workspace-shell。

### 规则 6

正文内容不反向控制整页骨架。

### 规则 7

响应式切换在 shell 层处理，不在内容层处理。

---

## 11. 结合导航来理解结构

你这次给的导航图很关键，因为它说明站点不是“左侧主导航驱动的一体化后台”，而是：

**顶部导航驱动的多页面站点。**

所以正确的理解应该是：

- 顶栏负责页面入口切换
- 某个导航入口进入后，落到对应页面骨架
- 页面骨架再承载自己的内容

这和传统“一个后台侧边栏管所有模块”的思路不一样。

也因此：

- 顶栏必须稳定
- shell 必须分类型
- 页面内容必须服从 shell

---

## 12. 最终结论

当前 `web` 的页面规划应当固定为：

```text
Home / About / Docs Archive -> Simple Page
Docs Detail / Settings -> Document Page
Workspace -> Workspace Page
Create -> Create Page
```

也就是说，当前不是“几个页面”，而是“4 类页面骨架”：

1. `Simple`
2. `Document`
3. `Workspace`
4. `Create`

后续执行时，先判断属于哪一类，再接界面，不允许直接跳过骨架分类去写页面。

