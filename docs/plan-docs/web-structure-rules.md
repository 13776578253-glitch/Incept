# Web 目录结构规范

这份文档用于约束 `apps/web` 的目录职责，避免后续开发中再次出现：

- 页面壳和业务逻辑混写
- 响应式策略堆进单个大组件
- 通用层、业务层、配置层边界模糊
- 想复用的代码越来越难复用

当前约束以 `apps/web/src` 为范围。

---

## 1. 目标

`apps/web` 当前采用的方向不是“极简到什么都不做”，而是：

- 从一开始支持 i18n
- 从一开始保留 theme / language 基础能力
- 页面壳保持简单
- 响应式能力单独抽象
- 业务实现收口到 `features`

一句话：

**基础设施先到位，页面壳保持克制，业务逻辑集中管理。**

---

## 2. 推荐结构

```text
apps/web/src/
├── app/
├── components/
│   ├── base/
│   ├── layout/
│   ├── responsive/
│   └── ui/
├── features/
├── hooks/
├── i18n/
├── messages/
├── lib/
├── styles/
└── types/
```

---

## 3. 总体准入原则

任何代码在放进全局目录前，先问这 3 个问题：

1. 它是不是被两个以上 feature 复用？
2. 它是不是不依赖某个具体页面语义？
3. 它放到全局后，会不会让职责更清楚？

如果其中两个答案是否，就先不要放全局。

默认优先级：

1. 先放 feature 内部
2. 确认复用后再上移
3. 最后才进入全局目录

---

## 4. `app/`

### 职责

路由入口、页面装配、路由级布局。

### 能放什么

- `layout.tsx`
- `page.tsx`
- 路由分组目录
- `loading.tsx`
- `error.tsx`
- 路由参数处理
- 调用 feature 的页面入口

### 不能放什么

- 大段业务逻辑
- 数据转换实现
- 通用组件定义
- 复杂响应式实现
- 全局状态细节

### 开发规则

- `app` 文件必须尽量薄
- `page.tsx` 负责装配，不负责细节实现
- 路由可以简单，复杂度应下沉到 `features`

### 说明

`app/[locale]/workspace/page.tsx` 看起来简单没有问题，前提是具体工作台实现放在 `features/workspace/`。

---

## 5. `components/base/`

### 职责

应用运行环境的基础包装层。

### 能放什么

- `root-provider.tsx`
- provider 组合器
- 应用级基础边界包装

### 不能放什么

- 页面 UI
- feature 私有 provider
- 业务组件
- 页面布局组件

### 开发规则

- 这里只处理“应用运行需要什么环境”
- 不处理“页面如何展示”
- 不处理“业务如何运转”

### 说明

`root-provider.tsx` 一般用于统一挂载：

- theme provider
- i18n provider
- 后续全局级 provider

---

## 6. `components/layout/`

### 职责

页面壳、导航壳、全站布局组件。

### 能放什么

- `site-header.tsx`
- `page-shell.tsx`
- `mobile-drawer.tsx`
- 页头、页脚、通用外层容器
- 全站导航结构组件

### 不能放什么

- 工作台专属业务组件
- 设置页专属业务逻辑
- 多模式业务状态机
- 复杂数据处理

### 开发规则

- 这里只解决“页面怎么摆”
- 不解决“页面业务怎么跑”
- layout 组件不应该知道太多业务名词

### 说明

`mobile-drawer.tsx` 可以理解为手机端导航抽屉。  
如果后续移动端导航很轻，它可以并回别的 layout 组件；前提是不把逻辑重新写成一坨。

---

## 7. `components/responsive/`

### 职责

多屏适配的公共抽象层。

### 能放什么

- 断点常量
- 屏幕尺寸判断
- 通用适配容器
- 不同屏幕下共享的布局切换能力

### 不能放什么

- 某个 feature 私有适配逻辑
- 某个页面专属大块 UI
- 把所有响应式逻辑集中到一个超级组件

### 开发规则

- 这一层只抽“可复用的适配能力”
- 它应该让页面和 layout 更轻
- 它不能反过来成为新的复杂中心

### 建议理解方式

你当前关注的是：

- 大屏
- 笔记本小屏
- 手机屏

所以这层的作用不是写“移动端版本页面”，而是统一定义：

- 断点在哪里
- 当前屏幕属于哪一档
- 某类布局在不同屏幕如何切换

### 典型内容

- `breakpoint.ts`
- `use-breakpoint.ts`
- `adaptive-layout.tsx`

只有确实复用时，才保留 `desktop-only.tsx` / `mobile-only.tsx` 这类组件。

---

## 8. `components/ui/`

### 职责

跨 feature 复用的基础 UI 组件。

### 能放什么

- Button
- Input
- Card
- Dialog
- Tabs
- 与业务无关的展示组件

### 不能放什么

- 首页专属模块
- 工作台专属面板
- 带业务请求的组件
- 明显绑定某个 feature 的组件

### 开发规则

- `ui` 组件尽量无业务语义
- 接收的应该主要是样式和状态参数
- 如果组件名里已经出现 `workspace`、`settings`、`project`，通常不应该放在这里

---

## 9. `features/`

### 职责

业务实现主战场，按功能域组织。

### 能放什么

- `home/`
- `workspace/`
- `settings/`
- 每个 feature 自己的组件、hooks、services、store、types

### 不能放什么

- 全站通用 UI
- 路由入口
- 全局 provider
- 与本 feature 无关的共享工具

### 开发规则

- 业务复杂度优先下沉到 feature
- 私有逻辑不要急着上移
- 只有多个 feature 复用时，再考虑抽公共层

### 推荐内部结构

```text
features/workspace/
├── components/
├── hooks/
├── services/
├── store/
├── types/
└── index.ts
```

### 内部含义

- `components/`: feature 私有组件
- `hooks/`: feature 私有 hook
- `services/`: 数据整合、请求适配、业务过程
- `store/`: feature 内部状态
- `types/`: feature 私有类型

---

## 10. `hooks/`

### 职责

全局基础 hook。

### 能放什么

- `use-color-scheme.ts`
- `use-language.ts`
- `use-breakpoint.ts`
- 少量跨 feature 通用 hook

### 不能放什么

- 某个 feature 专属 hook
- 只是包了一层状态但没有复用价值的 hook
- 强业务语义 hook

### 开发规则

- 全局 `hooks` 只放基础设施级能力
- feature 私有 hook 放回各自目录

### 当前明确应该保留的全局 hook

- theme
- language
- breakpoint

---

## 11. `i18n/`

### 职责

国际化机制层，不存放具体文案。

### 能放什么

- locale 列表
- 路由匹配规则
- message loader
- locale 工具函数

### 不能放什么

- 大量翻译文案
- 页面业务逻辑
- 与语言无关的配置

### 开发规则

- `i18n/` 负责“怎么切语言、怎么识别语言、怎么加载语言”
- `messages/` 负责“不同语言具体写什么”

### 当前建议结构

```text
i18n/
├── routing.ts
├── request.ts
└── locales.ts
```

后续需要细化时再拆分，不用一开始过度设计。

---

## 12. `messages/`

### 职责

翻译文案资源。

### 能放什么

- 多语言文案文件
- 按业务域拆分的文本内容

### 不能放什么

- i18n 行为逻辑
- 配置函数
- 组件逻辑

### 开发规则

- 初期可以简单
- 页面一多就必须按业务域拆分
- 不建议长期维持两个超大 json 文件

### 推荐演进方向

```text
messages/
├── en/
│   ├── common.json
│   ├── navigation.json
│   ├── home.json
│   ├── workspace.json
│   └── settings.json
└── zh/
    ├── common.json
    ├── navigation.json
    ├── home.json
    ├── workspace.json
    └── settings.json
```

---

## 13. `lib/`

### 职责

轻量共享逻辑区。

### 能放什么

- `constants.ts`
- `utils.ts`
- `mock-data.ts`
- 与业务弱耦合的辅助函数

### 不能放什么

- 大型业务逻辑
- 页面专属逻辑
- 不知道放哪就先塞进来的代码
- UI 组件

### 开发规则

- `lib` 只能放“共享且轻量”的东西
- 一旦业务语义开始变重，就回到 feature
- 不要把 `lib` 变成垃圾桶

---

## 14. `styles/`

### 职责

全局样式系统。

### 能放什么

- 设计令牌
- 主题变量
- 全局布局规则
- 动效规则

### 不能放什么

- 某个单独页面的大段私有样式
- 某个 feature 专属视觉逻辑
- 临时堆积的样式补丁

### 开发规则

- `styles` 只放系统级样式
- 局部样式优先跟组件或 feature 走

### 文件说明

- `tokens.css`: 颜色、字号、间距、圆角、阴影等基础变量
- `theme.css`: 主题映射，例如 light / dark

---

## 15. `types/`

### 职责

全局共享类型。

### 能放什么

- 语言相关类型
- 主题相关类型
- 导航公共类型
- 跨 feature 共用的数据类型

### 不能放什么

- 某个 feature 私有类型
- 临时实现细节类型堆积

### 开发规则

- 私有类型优先放 feature 内
- 只有跨 feature 共用时再提升到全局

---

## 16. 当前开发边界

为了避免重走旧仓库的问题，当前阶段额外约束：

- 不做复杂超级侧边栏状态机
- 不让设置页参与壳层模式切换
- 不在单个大组件里混合导航、响应式、设置态、内容态
- 不为了未来可能性提前造很多空抽象

当前目标是：

- 让代码更可读
- 让页面更敢改
- 让主流程更容易成型

---

## 17. 最后判断标准

当你不确定某段代码该放哪里时，按这个顺序判断：

1. 它是不是某个 feature 私有？
是：先放 feature。

2. 它是不是跨 feature 复用的基础组件？
是：放 `components/ui` 或 `components/layout`。

3. 它是不是全局运行环境相关？
是：放 `components/base`。

4. 它是不是语言机制？
是：放 `i18n`。

5. 它是不是文案内容？
是：放 `messages`。

6. 它是不是轻量共享函数或常量？
是：放 `lib`。

7. 它是不是只因为“现在不知道放哪”？
那就先不要放全局，先留在 feature。

