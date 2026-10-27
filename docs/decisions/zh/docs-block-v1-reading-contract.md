# Docs Block V1 阅读侧契约

## 结论

docs 当前正式进入 block v1 阶段。

本阶段的目标不是先做 create，不是先做 snapshot，也不是先追求复杂富媒体，而是先锁定阅读侧的稳定结构、稳定样式和稳定数据契约。

当前已批准的基础规则如下：

- docs 正文结构保持为 `page -> sections[] -> blocks[]`
- section title 继续属于页面结构，不作为 block
- section 内部允许通过 `heading block` 再细分正文层级
- paragraph 除 block 级字段外，还允许承载轻量 inline 内容

## 当前 block 范围

当前 standalone block 范围为：

- `heading`
- `paragraph`
- `list`
- `checklist`
- `callout`
- `quote`
- `divider`
- `code`
- `image`

当前 paragraph inline 范围为：

- `text`
- `link`
- `delete`
- `mark`
- `inlineCode`

这意味着当前 docs 的阅读侧已经能覆盖：

- 普通长文说明
- 标题层级
- 有序 / 无序列表
- 待办列表
- 引导提示 / 教学提示 / 风险警告
- 引文
- 多行代码块
- 行内链接、修订痕迹、局部高亮、行内代码
- 独立图片内容

## 为什么这样收口

当前阶段最重要的不是“尽可能多的格式”，而是“未来 create 和 AI 有一套稳定、可复用、不会频繁反复返工的格式基线”。

如果过早扩展太多 block：

- renderer 会持续不稳定
- create 侧契约会频繁变化
- seed / DB / mapper / UI 容易一起漂移

因此 v1 先只锁定最常见、最能覆盖真实技术文档需求的一组格式。

## 阅读结构规则

### 1. page

`page` 承担页面级结构信息：

- slug
- routeType
- layoutMode
- title
- description
- sidebarGroups
- outline
- sections

它是“整篇文章”的容器。

### 2. section

`section` 是 page 下的顶层正文分组，承担：

- section id
- section title
- section description
- section blocks

section title 是页面结构的一部分，因此仍然不下沉进 block。

### 3. block

`block` 是正文内容的最小独立渲染单元。

每个 block 负责一个明确语义，例如：

- 一段正文
- 一个引用
- 一个提示块
- 一段多行代码
- 一张图片

## paragraph inline 规则

当前只批准 5 类 paragraph inline：

- `text`
- `link`
- `delete`
- `mark`
- `inlineCode`

边界如下：

- `link` 用于句内链接
- `delete` 用于句内废弃表达或修订痕迹
- `mark` 用于局部高亮
- `inlineCode` 用于句内命令、字段名、路径、类型名

这些 inline 内容不提升为独立 block，因为它们的职责是“附着在正文句子里”，而不是独立承担一整段阅读结构。

## image 与 inline 的边界

`image` 已明确为 standalone block。

它不进入 paragraph inline，原因是：

- 图片天然占据独立版面
- 图片通常需要 caption
- 图片需要和正文节奏做块级排版协调

因此图片和行内标记属于两条完全不同的渲染层级。

## 组件职责规则

### block-system

位置：

- `apps/web/src/features/docs/block-system/`

职责：

- 定义 schema
- 定义 preset
- 定义 catalog
- 定义 example data

它负责回答：

- 允许哪些 block
- 每种 block 有哪些字段
- 每种 block 有哪些变体
- create / AI 应该如何认识这些格式

### renderers

位置：

- `apps/web/src/features/docs/shared/renderers/`

职责：

- 把 block 渲染成真实 UI

它负责回答：

- 这些 block 在 docs 里长什么样

### components

位置：

- `apps/web/src/features/docs/shared/components/`

职责：

- 拼装整篇文章
- 处理 article / section / rail / sidebar 的页面结构

它不再承担 block schema 定义职责。

## style-lab 的定位（已退役）

`/[locale]/docs/style-lab` 已于 2026-10-15 退役，路由不再存在，也不是验证面；不要恢复旧路由。
block 验证现在依赖包内 presets/测试与 Owner-only 预览流程。

## 当前不做什么

本阶段明确不处理：

- create 交互
- snapshot 表结构
- 多用户协作
- syntax highlighting 正式方案
- 富媒体 block 全量接入
- 复杂 interactive block

这不是否定这些方向，而是为了保证 block v1 先稳定。

## 对下一阶段的影响

从现在开始，docs create 应直接建立在这套 block v1 契约之上。

下一阶段可以优先推进：

- create 页面结构
- block catalog 如何被 create 消费
- block payload 如何生成、排序、编辑

在 block v1 基线未被明确推翻前，不应再随意新增大量 block 类型。
