# Docs 数据库草案

## 目标

本文为 `docs` 产品线定义一套最小但可扩展的数据库结构。

当前路由模型：

- `/{locale}/docs`
- `/{locale}/docs/archive`（预留，尚未实现）
- `/{locale}/docs/[slug]`

当前产品假设：

- docs 首页以 archive 风格为先
- 文章布局由文章元数据驱动
- locale 仅通过前导路由段表达
- 内容需要同时支持 `sidebar` 和 `contentOnly`
- 第一阶段应优先优化读取流，而不是编辑器复杂度

## 推荐放置位置

推荐将数据库代码放在 monorepo 中的：

- `packages/db`

建议内容：

- schema 定义
- migrations
- seed 脚本
- database client
- repository/query helpers

原因：

- 现在只有 `apps/web` 这个运行时服务，但后续 `workspace` 大概率也会复用同一数据库
- 在仓库继续增长前，应先把数据库关注点隔离出来

---

## 核心设计

对 docs 内容，使用**两张核心表**：

1. `docs_documents`
2. `docs_document_locales`

这样可以做到：

- 全局文档元数据集中存放
- 本地化内容单独存放
- 布局与权限控制保持稳定
- 具体块内容通过 JSON 保持灵活

**不要**分别为以下页面类型单独建表：

- archive 页面
- reference 页面
- article 页面

它们都只是同一个 docs 内容模型上的不同视图。

---

## 表 1：`docs_documents`

表示与 locale 无关的全局文档实体。

建议字段：

| Field | Type | Notes |
|---|---|---|
| `id` | uuid / cuid / bigint | 主键 |
| `kind` | text / enum | 例如：`article`、`reference`、`note` |
| `layout_mode` | text / enum | `sidebar` 或 `content_only` |
| `access_role` | text / enum | `guest`、`member`、`pro` |
| `created_by` | uuid / text nullable | 未来作者关系 |
| `created_at` | timestamp | 创建时间 |
| `updated_at` | timestamp | 最后更新时间 |

说明：

- `layout_mode` 放在这里，因为它是文档级行为标记
- `access_role` 放在这里，因为权限控制不是 locale 级别的
- `kind` 在 v1 不是强制项，但建议保留，因为它把内容语义和页面布局分开了

---

## 表 2：`docs_document_locales`

表示单篇文档在某个 locale 下的本地化内容。

建议字段：

| Field | Type | Notes |
|---|---|---|
| `id` | uuid / cuid / bigint | 主键 |
| `document_id` | fk -> `docs_documents.id` | 所属父文档 |
| `locale` | text / enum | `en`、`zh` |
| `slug` | text | 该 locale 对应的路由 slug |
| `eyebrow` | text nullable | 标题上方的小标签 |
| `title` | text | 主标题 |
| `summary` | text nullable | 用于 docs 首页或 archive 列表 |
| `status` | text / enum | `draft`、`published`，未来可加 `archived` |
| `published_at` | timestamp nullable | 用于排序的发布时间 |
| `body_json` | json/jsonb | 主文章内容块 |
| `sidebar_json` | json/jsonb nullable | 侧边栏导航分组 |
| `seo_title` | text nullable | 可选 SEO 标题覆盖 |
| `seo_description` | text nullable | 可选 SEO 摘要 |
| `created_at` | timestamp | 创建时间 |
| `updated_at` | timestamp | 最后更新时间 |

约束：

- unique(`document_id`, `locale`)
- unique(`locale`, `slug`)

说明：

- `slug` 应该可读且稳定，不要随机
- `slug` 按 locale 存储，因为未来不同语言路径可能会分化
- `published_at` 是 locale 级字段，这样一种语言可以先发布，另一种稍后发布

---

## JSON 字段

### `body_json`

建议采用接近当前前端 mock shape 的 block 结构。

推荐顶层形态：

```json
{
  "sections": [
    {
      "id": "overview",
      "title": "Why a reusable document shell matters",
      "description": "Optional section intro",
      "blocks": [
        {
          "id": "p1",
          "type": "paragraph",
          "text": "..."
        },
        {
          "id": "list-1",
          "type": "list",
          "items": ["...", "..."]
        },
        {
          "id": "callout-1",
          "type": "callout",
          "tone": "note",
          "title": "Design intent",
          "text": "..."
        }
      ]
    }
  ]
}
```

推荐的 v1 block 类型：

- `paragraph`
- `list`
- `callout`

面向未来可扩展的类型：

- `image`
- `quote`
- `code`
- `video`

### `sidebar_json`

只有在 `layout_mode = sidebar` 时它才有意义。

建议形态：

```json
{
  "groups": [
    {
      "id": "getting-started",
      "label": "Getting started",
      "defaultOpen": true,
      "items": [
        {
          "id": "overview",
          "label": "Overview",
          "href": "/docs/overview"
        }
      ]
    }
  ]
}
```

说明：

- 对 v1 来说，用 JSON 比拆成多张表更合适
- 如果以后 docs 导航真的变成知识图谱，再单独拆出去

---

## 首页查询模型

`/{locale}/docs` 应该从已发布的本地化内容派生出来。

建议查询逻辑：

- 数据源为 `docs_document_locales`
- join `docs_documents`
- 过滤：
  - `locale = current locale`
  - `status = 'published'`
- 按 `published_at desc` 排序
- 按年份分组在应用层完成

这意味着：

- docs 首页是查询结果
- archive 不是一张单独的内容表

---

## 详情页查询模型

`/{locale}/docs/[slug]`

建议查询逻辑：

- 数据源为 `docs_document_locales`
- join `docs_documents`
- 过滤：
  - `locale = current locale`
  - `slug = route slug`
- 返回：
  - title / summary / body / sidebar
  - `layout_mode`
  - `access_role`

然后：

- 如果 `layout_mode = sidebar`，渲染左侧边栏 + 正文 + 右侧大纲
- 如果 `layout_mode = content_only`，渲染正文 + 右侧大纲

---

## 权限控制

推荐的 v1 模型：

- 保持权限控制简单
- 使用 `docs_documents.access_role`

建议取值：

- `guest`
- `member`
- `pro`

前端行为：

- docs 首页可以用模糊或锁定态展示受限条目
- 详情路由在访问者角色不足时应拒绝访问

这对于 v1 已经足够。

除非真实需求出现，否则先不要加 per-user ACL 表。

---

## 可选的未来表

**不要**在 v1 就实现，但要为它们预留空间：

### `users`

如果鉴权变成真实系统：

- `id`
- `email`
- `name`
- `role`

### `docs_tags`

如果 docs 需要跨文章分类：

- `id`
- `slug`
- `label`

### `docs_document_tags`

关联表：

- `document_id`
- `tag_id`

## 推荐的 v1 范围

在第一阶段数据库落地时，只实现：

- `docs_documents`
- `docs_document_locales`
- 用于以下内容的 seed 数据：
  - docs 首页条目
  - 一篇真实示例文章
- 用于以下能力的读取查询：
  - docs 首页
  - 根据 slug 获取 docs 文章

先不要实现：

- 完整 editor/create UI
- revision system
- tags
- 独立的 `/docs/archive` 页面
- 复杂权限图谱

---

## 建议的下一步

当这份草案被接受后：

1. 创建 `packages/db`
2. 为两张表编写初始 schema
3. 编写与当前 docs mock 内容对应的 seed 数据
4. 用数据库读取函数替换 docs mock 读取
5. 然后再开始 create/admin 工作

这样可以让第一个全栈里程碑保持足够小，也更容易测试。
