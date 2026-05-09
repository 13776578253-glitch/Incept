# Docs 集合侧边栏与 Series 路由决策

## 结论

docs 从现在开始正式区分两种发布对象：

- 单文章
- 集合

集合文章不再复用“单文章 + section 侧边栏”的旧语义。

新的规则是：

- 左侧边栏表示集合内文章列表
- 右侧边栏表示当前文章 section 目录
- 集合文章走 `/{locale}/docs/series/[collectionSlug]/[articleSlug]`
- 单文章继续走 `/{locale}/docs/[slug]`

## 为什么要这样改

旧结构里，左侧边栏和右侧边栏都在做“当前文章 section 跳转”。

这会导致：

- 左右栏职责重复
- 文档集合无法表达
- 未来 create 流程没有稳定语义

因此需要把左栏重新定义成“集合导航”，把右栏保留为“当前文章目录”。

## 首页规则

- docs 首页可以同时展示集合和单文章
- 集合在首页只显示一次
- 不在首页展开集合内每篇文章
- 点击集合时直接进入集合首篇文章
- 首页只用图标区分集合和单文章，不增加文字标签

## 路由规则

- `/{locale}/docs/[slug]`
  - 只服务单文章
- `/{locale}/docs/series/[collectionSlug]/[articleSlug]`
  - 服务集合内文章
- `/{locale}/docs/reference`
  - 临时兼容入口，重定向到 `document-shells` 集合首篇文章
- 旧的 `/{locale}/docs/document-shells`
  - 直接废弃，不保留兼容

## 数据规则

- 集合使用正式数据库模型，不使用临时 JSON 硬编码关系
- 集合首页展示数据来自集合 locale 表
- 集合文章正文仍使用现有 docs document locale 表
- v1 中，同一集合内文章共享一个集合级 `accessRole`

## 对未来 create 的影响

未来 create 流程应先决定：

- 创建集合
- 创建单文章

如果创建集合：

- 先创建集合本身
- 再按顺序添加集合内文章
- 左侧边栏自动根据集合文章顺序生成

如果创建单文章：

- 直接生成 standalone docs 路由
- 不显示左侧集合栏
