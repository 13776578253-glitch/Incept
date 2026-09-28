# 路线图与规划图 JSON 导入规范与流程指南 (Roadmap Import Specification)

本文档面向系统管理员、研发人员以及数据维护者，详细说明路线图（Roadmap）与规划图（Planning Board）导入功能所接受的 JSON 数据结构、字段校验规则、上下文自动绑定机制及完整的导入与报错处理流程。

---

## 1. 核心设计原则

1. **纯人工清单维护（No Auto-Derivation）**：
   导入功能仅消费用户显式上传的结构化 JSON 清单，绝不自动读取、抓取或解析 `docs/*` 中的 Markdown 文档（反自动派生硬性约束）。
2. **上下文自动绑定（Context-Bound）**：
   导入按钮严格绑定当前用户所在的「项目」以及「页面表面」（路线图或规划图）。默认导入的数据自动写入当前选中的看板；如果上传文件中的字段声明了项目或看板，必须与当前环境一致，否则直接抛错阻断。
3. **纯追加、绝不覆盖（Append-Only, No Overwrite）**：
   导入是纯增量追加逻辑，绝不是整板重置或覆盖替换。若导入清单中指定的 `key` 与数据库中已有条目产生冲突，事务立即全量回滚并报错，禁止静默覆盖已有条目。
4. **完整双语对等校验（Bilingual Parity）**：
   所有文本字段（标题、摘要、详情、链接显示名）必须严格成对提供中文（`zh`）与英文（`en`），严禁缺损单侧。
5. **交互提示对齐（Toast Alignment）**：
   无论成功还是失败，均采用右上角悬浮毛玻璃卡片（严格复用 `DocsImportSuccessToast` 设计规范），清晰展示导入结果或精确报错原因。

---

## 2. 导入完整流程

```
[前端操作]
1. 用户在 /zh/atlas/roadmap?project=xxx&surface=roadmap (或 surface=atlas) 页面
2. 点击顶栏右侧「导入 (Import)」按钮，选择本地 .json 清单文件
3. RoadmapToolbar 读取文件，解析 JSON
4. 前端拼接上下文参数：
   POST /api/internal/roadmap/import?projectKey=${currentProjectKey}&surface=${activeSurface}&roadmapKey=${currentRoadmapKey}
   Body: 清单 JSON 内容

[服务端校验与写入 - 单事务]
5. 身份鉴权：guardOwner() 验证必须具备 owner 权限且同源请求，非 owner 返回 404
6. 上下文校验：
   - 检查 projectKey 是否存在，且该项目对应的 surface 功能未被锁定/禁用
   - 检查 roadmapKey 是否存在，且确实属于该 projectKey
7. 清单解析与字段强校验 (parseImportManifest)：
   - 顶层若声明 projectKey / surface / roadmapKey，必须与 Query 参数完全一致
   - 遍历 entries 数组：若条目声明了 roadmapKey / projectKey / surface，必须与当前目标匹配
   - 若条目未指定 roadmapKey，自动补全为当前上下文看板标识
   - 校验 status 是否在目标看板的列定义中存在
   - 校验 type / priority 枚举合法性
   - 校验 title / summary 双语非空
8. 查重防覆盖校验：
   - 清单内部不得重复声明相同的 key
   - 若条目显式指定了 key，查验数据库：若已存在则直接抛错拒绝，终止导入
   - 若条目未指定 key，根据英文标题自动 slugify 生成唯一不碰撞标识（如 my-feature, my-feature-2）
9. 数据库纯追加 (tx.roadmapEntry.create)：
   - 依次创建条目与关联链接（tx.roadmapEntryLink.create），写入 position
   - 提交事务并返回所有已创建的 entries

[前端反馈]
10. 导入成功：
    - 右上角弹出 Emerald 绿色悬浮卡片（展示导入条目总数）
    - 4.2 秒后自动收起
    - 触发 onChanged() 回调，无刷新更新看板卡片列表
11. 导入失败：
    - 右上角弹出 Rose 红色悬浮卡片（展示后端返回的具体原因，如标识冲突、字段不匹配等）
    - 支持手动点击 ✕ 关闭，或 6 秒后自动收起
```

---

## 3. 接受的 JSON 数据结构

### 3.1 极简推荐结构（缺省看板标识，自动绑定当前页面）

最推荐的清单格式。条目中无需硬编码项目或看板标识，上传至哪个项目的哪个看板，就会自动追加到该看板下：

```json
{
  "entries": [
    {
      "status": "reviewing",
      "type": "feature",
      "priority": "high",
      "title": {
        "en": "Real-time Collaboration",
        "zh": "实时协同协作"
      },
      "summary": {
        "en": "Allow multiple users to edit simultaneously.",
        "zh": "允许多位成员在同一看板同时协同编辑。"
      }
    },
    {
      "status": "unstarted",
      "type": "improvement",
      "priority": "middle",
      "title": {
        "en": "Performance Optimization",
        "zh": "渲染性能优化"
      },
      "summary": {
        "en": "Improve rendering speed of large boards.",
        "zh": "优化大型复杂看板的初始化加载与滚动帧率。"
      },
      "detail": {
        "en": "Use virtualized lane lists for boards with 100+ cards.",
        "zh": "针对百张卡片以上的看板引入泳道虚拟列表渲染。"
      }
    }
  ]
}
```

### 3.2 完整字段结构（包含显式属性声明）

如需声明自定义标识、顺序、详细说明与外部链接，可使用完整结构：

```json
{
  "projectKey": "project-one",
  "surface": "roadmap",
  "roadmapKey": "sample-roadmap",
  "entries": [
    {
      "key": "custom-feature-key-01",
      "roadmapKey": "sample-roadmap",
      "projectKey": "project-one",
      "surface": "roadmap",
      "order": 100,
      "status": "active",
      "type": "feature",
      "priority": "high",
      "title": {
        "en": "Local Agent Client",
        "zh": "本地 Agent 客户端"
      },
      "summary": {
        "en": "Desktop client for offline agent communication.",
        "zh": "用于离线与混合场景下的本地桌面客户端。"
      },
      "detail": {
        "en": "Provides local IPC channels and background daemon support.",
        "zh": "提供基于本地 IPC 的通讯通道与守护进程常驻支持。"
      },
      "links": [
        {
          "label": {
            "en": "Architecture RFC",
            "zh": "架构设计文档"
          },
          "href": "https://example.com/rfcs/agent-client"
        }
      ]
    }
  ]
}
```

---

## 4. 字段规范说明

### 4.1 顶层字段（Root Object）

| 字段名 | 类型 | 必填 | 默认行为 / 说明 |
| :--- | :--- | :--- | :--- |
| `entries` | `Array<Entry>` | **是** | 待追加导入的条目列表，不能为空数组。 |
| `projectKey` | `string` | 否 | 显式声明目标项目标识。**若提供，必须与当前所在项目严格一致**，否则报错。 |
| `surface` | `"roadmap" \| "atlas"` | 否 | 显式声明页面表面类型（`roadmap` 为路线图，`atlas` 为规划图）。**若提供，必须与当前页面表面严格一致**。 |
| `roadmapKey` | `string` | 否 | 显式声明看板标识。**若提供，必须与当前选中的看板完全一致**。 |

### 4.2 条目字段（Entry Object）

| 字段名 | 类型 | 必填 | 默认行为 / 说明 |
| :--- | :--- | :--- | :--- |
| `title` | `LocalizedText` | **是** | 双语标题对象 `{ "en": "...", "zh": "..." }`。两侧均不能为空字符串。 |
| `summary` | `LocalizedText` | **是** | 双语摘要对象 `{ "en": "...", "zh": "..." }`。卡片主显示内容。 |
| `status` | `string` | **是** | 泳道阶段状态标识。**必须是目标看板已存在的列**（参见 4.4 状态映射）。 |
| `type` | `string` | **是** | 条目类型，仅限：`"feature"`（功能）、`"improvement"`（改进）、`"maintenance"`（维护）。 |
| `priority` | `string` | **是** | 优先级，仅限：`"high"`（高）、`"middle"`（中）、`"low"`（低）、`"none"`（无）。 |
| `key` | `string` | 否 | 条目全局唯一自定义标识（仅限小写英文、数字与中划线）。**若提供且数据库已存在，将直接报错拒绝导入（防覆盖）**；若不提供，系统会自动根据英文标题生成防碰撞 slug。 |
| `roadmapKey` | `string` | 否 | 归属看板标识。**默认自动填充为当前看板标识**。若显式提供，必须与当前看板标识一致，否则报错拒绝。 |
| `projectKey` | `string` | 否 | 归属项目标识。默认不检查；若显式提供，必须与当前项目一致。 |
| `surface` | `string` | 否 | 归属表面标识。默认不检查；若显式提供，必须与当前页面一致。 |
| `detail` | `LocalizedText` | 否 | 详情弹窗长说明对象 `{ "en": "...", "zh": "..." }`。如无需要可省略。 |
| `order` | `number` | 否 | 卡片在列内的排序位置。若不提供，系统自动计算为该看板当前最大位置 `+ 10`。 |
| `links` | `Array<Link>` | 否 | 关联链接列表。每项包含 `{ label: LocalizedText, href: string }`。 |

### 4.3 基础数据类型

- **`LocalizedText`**：
  ```json
  {
    "en": "Non-empty English text",
    "zh": "非空中文字符串"
  }
  ```
- **`Link`**：
  ```json
  {
    "label": {
      "en": "Discussion",
      "zh": "讨论链接"
    },
    "href": "https://example.com/link"
  }
  ```

### 4.4 标准看板与阶段状态对应表

导入时指定的 `status` 必须为当前看板已定义的列状态，否则将被校验拦截：

- **路线图看板（Roadmap）**：
  - `reviewing`（Backlog / 评审池）
  - `unstarted`（Next up / 排期中）
  - `active`（In Progress / 进行中）
  - `completed`（Done / 已完成）
- **规划图看板（Planning Board）**：
  - `unstarted`（Planned / 规划中）
  - `active`（Building / 构建中）
  - `completed`（Shipped / 已发布）

---

## 5. 常见报错信息与解决办法

| 错误信息 (Error Message) | 触发原因 | 解决办法 |
| :--- | :--- | :--- |
| `the entry "xxx" already exists; import only appends new entries and does not overwrite` | 清单中指定的 `key` 已经在数据库中存在。导入为纯追加模式，严禁覆盖现有卡片。 | 移除清单中的 `key` 字段让系统自动生成全新唯一标识，或修改为未占用的自定义 key。 |
| `"entries[0].roadmapKey" ("xxx") does not match current target roadmap "yyy"` | 条目中填写的 `roadmapKey` 与当前浏览器正在查看的看板不匹配。 | 切换至对应的看板后再点击导入，或者直接在条目中删除 `roadmapKey` 字段（缺省会自动绑定当前看板）。 |
| `Manifest projectKey "xxx" does not match current project "yyy"` | 清单顶层或条目中声明的 `projectKey` 与当前选择的项目不一致。 | 切换至目标项目，或者从 JSON 清单中删除 `projectKey` 声明。 |
| `Planning board surface is disabled for project "xxx"` | 当前项目在「设置 -> 项目与功能」中已关闭/屏蔽了规划图功能。 | 在管理员设置中重新开启该项目的规划图，或将数据导入已启用的功能表面。 |
| `"title" must carry both languages; a missing half is rejected.` | 标题或摘要仅提供了英文或仅提供了中文。 | 确保所有包含文本的字段同时提供完整的 `en` 与 `zh` 键值。 |
| `no column for status "xxx"` | 指定的 `status` 在当前看板中并不存在映射列。 | 核对 4.4 节的状态列表，修改 `status` 为对应看板合法的一项。 |
| `the manifest repeats the key "xxx"` | 上传的单个 JSON 清单内有多张卡片使用了相同的 `key`。 | 检查清单内容，确保同一个清单文件内每个条目的 `key` 唯一。 |
