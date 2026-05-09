# Docs 模块架构

## 目标

本文定义 `docs` 模块当前稳定的架构。

它记录了路由模型、内容规则和数据规则；除非有新的明确决策修改它们，否则这些约束应保持一致。

## 当前路由模型

当前 docs 页面面分为：

- `/{locale}/docs`
  - docs 主入口
- `/{locale}/docs/series/[collectionSlug]/[articleSlug]`
  - 集合文章详情路由
- `/{locale}/docs/[slug]`
  - 单文章详情路由
- `/{locale}/docs/reference`
  - 指向集合首篇文章的兼容别名
- `/{locale}/docs/archive`
  - 为未来扩展预留，暂未实现

## Canonical Slug 规则

当前规范集合 slug：

- `document-shells`

规则：

- `/reference` 只是别名
- 集合文章规范数据源是 `series` 路由
- 单文章规范数据源是 slug 路由
- slug 值应可读且稳定
- slug 值按 locale 行存储

## Locale 规则

Locale 行为：

- locale 只存在于前导路由段
- 当前支持的 locale 为 `en` 与 `zh`
- 数据查找基于 `locale + slug`
- slug 自身不应携带 locale 后缀

## Layout Mode 规则

文档页面形态由 `layoutMode` 控制。

当前取值：

- `sidebar`
- `contentOnly`

规则：

- `layoutMode` 是文档属性
- `layoutMode` 属于文档元数据层，而不是路由层
- 相同的路由模式可以渲染两种布局

渲染行为：

- `sidebar`
  - 集合左侧栏 + 主正文 + 右侧大纲
- `contentOnly`
  - 主正文 + 右侧大纲

补充规则：

- `sidebar` 不再表示“当前文章 section 导航”
- 当文章属于集合时，左侧栏表示“集合内文章列表”
- 右侧大纲始终只表示“当前文章的 section 导航”

## Access Role 规则

当前访问控制使用文档级 access role 建模。

当前取值：

- `guest`
- `member`
- `pro`

规则：

- 首页可以用锁定态展示不可访问条目
- 当访问者角色不足时，详情路由应拒绝访问
- 当前 viewer role 在开发阶段仍然是 mocked 状态

## Body JSON 规则

当前 `bodyJson` 顶层结构：

```json
{
  "sections": [
    {
      "id": "overview",
      "title": "Section title",
      "blocks": [
        {
          "id": "p1",
          "type": "paragraph",
          "text": "..."
        }
      ]
    }
  ]
}
```

规则：

- 数据库存储的是对象，而不是裸数组
- query layer 负责校验这个形态
- UI 接收的是已经映射好的页面模型，而不是原始 JSON

当前支持的 block 类型：

- `paragraph`
- `list`
- `callout`

## Sidebar JSON 规则

当前 `sidebarJson` 顶层结构：

```json
{
  "groups": [
    {
      "id": "foundations",
      "label": "Foundations",
      "defaultOpen": true,
      "items": [
        {
          "id": "overview",
          "label": "Overview",
          "href": "/docs/document-shells"
        }
      ]
    }
  ]
}
```

规则：

- 该结构只保留给历史或临时过渡用途
- query layer 负责校验 `groups` 数组
- UI 接收的是已经映射好的 sidebar groups

## 集合规则

当前 docs 支持两种发布对象：

- 单文章
- 集合

规则：

- docs 首页同时展示集合与单文章
- 集合在首页只显示一次，不展开内部文章
- 点击集合时直接进入集合首篇文章
- 集合文章详情使用 `/{locale}/docs/series/[collectionSlug]/[articleSlug]`
- 单文章详情继续使用 `/{locale}/docs/[slug]`
- 集合左栏由集合文章顺序自动生成，不再从当前文章 section 推导

## Create 决策规则

未来 create 流程应先要求用户选择发布对象类型：

- 集合
- 单文章

规则：

- 单文章创建后走 standalone slug 路由
- 集合创建后先生成集合，再向集合内追加有序文章
- 集合文章自动落到 `series` 路由
- 集合文章的左栏来自集合文章顺序

## 稳定架构边界

这个模块有意拆成如下边界：

- `packages/db`
  - DB schema、query DTO、Prisma 查询
- `apps/web/src/server/docs`
  - access checks、mapping、loader 组装
- `apps/web/src/features/docs`
  - 页面渲染
- `apps/web/src/app/[locale]/docs`
  - 轻量路由入口

随着 docs 模块扩展到 create/edit/publish 流程，这个边界应继续保持。
