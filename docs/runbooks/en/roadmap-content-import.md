# Roadmap & Planning Board JSON Import Specification & Workflow Guide

This document is intended for system administrators, engineers, and maintainers. It details the JSON data structures, field validation rules, context auto-binding mechanisms, and the complete import and error handling workflows for the **Roadmap** and **Planning Board** surfaces.

---

## 1. Core Principles

1. **Human-Maintained Manifests Only (No Auto-Derivation)**:
   The import process only consumes explicitly uploaded JSON files. It strictly never scans, parses, or derives data from `docs/*` Markdown files (mandatory anti-derivation red line).
2. **Context-Bound Import**:
   The import action is strictly bound to the active project and current surface (Roadmap or Planning Board). Data is imported into the currently active board by default. If the JSON file declares `projectKey`, `surface`, or `roadmapKey`, these values must strictly match the current active view, or the request is immediately rejected.
3. **Append-Only, No Overwrite**:
   Import is strictly incremental. It never replaces an entire board. If an entry `key` declared in the manifest already exists in the database, the transaction is immediately rolled back and an error is returned. Silent overwrites are strictly prohibited.
4. **Bilingual Parity Enforcement**:
   All localized text fields (`title`, `summary`, `detail`, link labels) must provide non-empty values for both English (`en`) and Chinese (`zh`). Missing half of a pair is rejected.
5. **Toast UI Alignment**:
   Success and error feedback toasts use a top-right floating card with frosted glass backdrop, rounded corners, and shadow, strictly matching the `DocsImportSuccessToast` visual design.

---

## 2. Complete Import Workflow

```
[Frontend Client]
1. User navigates to /<locale>/atlas/roadmap?project=<key>&surface=roadmap (or surface=atlas)
2. User clicks the top-right "Import" button and selects a local .json file
3. RoadmapToolbar reads and parses the JSON manifest
4. The client injects the current page context into query parameters:
   POST /api/internal/roadmap/import?projectKey=${currentProjectKey}&surface=${activeSurface}&roadmapKey=${currentRoadmapKey}
   Body: JSON manifest content

[Backend Validation & Single-Transaction Write]
5. Authorization: guardOwner() verifies the user is an owner and the request is same-origin; non-owners receive a 404
6. Context Validation:
   - Verifies projectKey exists and the target surface is enabled for this project
   - Verifies roadmapKey exists and belongs to the projectKey
7. Manifest Parsing & Strict Field Validation (parseImportManifest):
   - If the root object specifies projectKey / surface / roadmapKey, it must strictly match query parameters
   - Iterates through entries: if an entry specifies roadmapKey / projectKey / surface, it must match the active target
   - If an entry omits roadmapKey, it defaults to the active roadmapKey automatically
   - Verifies each status maps to an existing column on the target board
   - Validates type and priority enum values
   - Validates title and summary bilingual text pairs
8. Conflict & Slug Resolution:
   - Rejects duplicate keys within the same manifest
   - If an entry has an explicit key: verifies it does not already exist in the database; fails on conflict
   - If key is omitted: auto-generates a unique, collision-resistant slug based on title.en (e.g. my-feature, my-feature-2)
9. Database Creation (tx.roadmapEntry.create):
   - Creates entries and associated links (tx.roadmapEntryLink.create) in a single database transaction
   - Transaction commits and returns all created entries

[Frontend Feedback]
10. On Success:
    - Displays an Emerald floating card at top-right with the count of appended items
    - Auto-dismisses after 4.2 seconds
    - Triggers onChanged() to refresh the board smoothly without a page reload
11. On Failure:
    - Displays a Rose floating card at top-right with the exact failure explanation
    - Can be dismissed manually via ✕ button, or auto-dismisses after 6 seconds
```

---

## 3. Accepted JSON Structures

### 3.1 Minimal Recommended Structure (Auto-Bound to Active View)

This is the recommended manifest format. Entries do not need to hardcode the project or board key. Whatever board the user is currently viewing, the items will be appended directly there:

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

### 3.2 Full Structure (With Explicit Attributes)

If you need custom keys, custom orders, long-form details, or external links:

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

## 4. Field Specification

### 4.1 Root Fields

| Field | Type | Required | Default / Behavior |
| :--- | :--- | :--- | :--- |
| `entries` | `Array<Entry>` | **Yes** | Array of items to append. Must not be empty. |
| `projectKey` | `string` | No | Target project key. **If provided, must strictly match the active project**, or import is rejected. |
| `surface` | `"roadmap" \| "atlas"` | No | Target surface (`roadmap` for Roadmap, `atlas` for Planning Board). **If provided, must strictly match the active surface**. |
| `roadmapKey` | `string` | No | Target board key. **If provided, must strictly match the active board key**. |

### 4.2 Entry Fields

| Field | Type | Required | Default / Behavior |
| :--- | :--- | :--- | :--- |
| `title` | `LocalizedText` | **Yes** | Bilingual title `{ "en": "...", "zh": "..." }`. Neither side can be empty. |
| `summary` | `LocalizedText` | **Yes** | Bilingual summary `{ "en": "...", "zh": "..." }`. Primary card description. |
| `status` | `string` | **Yes** | Lane stage identifier. **Must match an existing column on the target board** (see 4.4). |
| `type` | `string` | **Yes** | Entry type: `"feature"`, `"improvement"`, or `"maintenance"`. |
| `priority` | `string` | **Yes** | Priority level: `"high"`, `"middle"`, `"low"`, or `"none"`. |
| `key` | `string` | No | Global unique slug (`a-z0-9-`). **If provided and already in database, import aborts with a conflict error (no overwrite)**. If omitted, auto-generates a unique slug from `title.en`. |
| `roadmapKey` | `string` | No | Target board key. **Defaults to the active board key**. If provided, must match active board key. |
| `projectKey` | `string` | No | Target project key. If provided, must match active project key. |
| `surface` | `string` | No | Target surface. If provided, must match active surface. |
| `detail` | `LocalizedText` | No | Detailed modal markdown/text `{ "en": "...", "zh": "..." }`. Optional. |
| `order` | `number` | No | Order position within the column. Defaults to current board max position `+ 10`. |
| `links` | `Array<Link>` | No | External reference links `{ label: LocalizedText, href: string }[]`. Optional. |

### 4.3 Data Types

- **`LocalizedText`**:
  ```json
  {
    "en": "Non-empty English string",
    "zh": "非空中文字符串"
  }
  ```
- **`Link`**:
  ```json
  {
    "label": {
      "en": "Discussion",
      "zh": "讨论链接"
    },
    "href": "https://example.com/link"
  }
  ```

### 4.4 Standard Board Stages

The specified `status` must match a column present on the target board:

- **Roadmap Board (路线图)**:
  - `reviewing` (Backlog)
  - `unstarted` (Next up)
  - `active` (In Progress)
  - `completed` (Done)
- **Planning Board (规划图)**:
  - `unstarted` (Planned)
  - `active` (Building)
  - `completed` (Shipped)

---

## 5. Common Error Messages & Troubleshooting

| Error Message | Cause | Resolution |
| :--- | :--- | :--- |
| `the entry "xxx" already exists; import only appends new entries and does not overwrite` | The specified `key` already exists in the database. Overwrite is prohibited. | Remove the `key` field to let the system generate a fresh unique key, or change it to an unused key. |
| `"entries[0].roadmapKey" ("xxx") does not match current target roadmap "yyy"` | The `roadmapKey` declared in the entry differs from the board you are viewing. | Switch to that board before importing, or omit the `roadmapKey` field (it defaults automatically). |
| `Manifest projectKey "xxx" does not match current project "yyy"` | The declared `projectKey` does not match the active project. | Switch to the target project, or omit the `projectKey` property from the JSON. |
| `Planning board surface is disabled for project "xxx"` | The Planning Board surface has been disabled in Settings for this project. | Enable Planning Board in Settings, or import into the Roadmap surface instead. |
| `"title" must carry both languages; a missing half is rejected.` | One side of a bilingual text pair was omitted or empty. | Ensure all text objects provide non-empty values for both `en` and `zh`. |
| `no column for status "xxx"` | The requested status column does not exist on this board. | Review section 4.4 and choose a valid stage for the board. |
| `the manifest repeats the key "xxx"` | Multiple entries within the same JSON file share the same key. | Ensure all entry keys within the manifest file are unique. |
