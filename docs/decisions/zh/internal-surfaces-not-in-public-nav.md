# 内部界面不进入前台导航规则

## 目标

当前阶段全力收敛 `docs` 前台阅读界面。

第一阶段前台导航只保留：

- `Docs`
- `About`

其他仍在开发、验证或管理用途中的页面，统一视为内部能力，不出现在前台导航中。

这些页面不删除，保留直接链接访问，用于开发、验证、导入、管理和后续 create/admin 工作流。

## 前台导航规则

前台导航中暂不展示：

- `Workspace`
- `Resources`
- `Docs archive`
- `Docs style lab`
- `Import preview`
- `Docs library`
- `Docs admin`

相关文案可以继续保留在 messages 中，避免后续恢复或重组入口时丢失上下文。

导航代码中可以用 `// 并掉代码` 或 `TODO` 注释保留原入口，明确这些能力是“暂不挂前台”，不是彻底废弃。

## 当前内部界面

### Docs Style Lab

本地地址：

```text
http://localhost:3000/en/docs/style-lab
```

职责：

- 用于验证 docs block system 的阅读样式。
- 用于对比 paragraph、heading、list、checklist、callout、quote、divider、code、image 等 block 的渲染效果。
- 用于 create / AI 格式选择前的样式基准验证。

前台状态：

- 不进入前台导航。
- 仅通过直接链接访问。

### Docs Import Preview

本地地址格式：

```text
http://localhost:3000/en/docs/import-preview/{draftId}
```

职责：

- 用于预览 importer 生成的导入草稿。
- 展示源文件路径、目标路由、导入模式、校验结果和最终阅读效果。
- 用于人工确认导入前的 review。

前台状态：

- 不进入前台导航。
- 仅通过导入流程生成的 draft 链接访问。

### Docs Import Confirm

本地地址格式：

```text
http://localhost:3000/en/docs/import-preview/{draftId}/confirm
```

职责：

- 用于确认导入草稿。
- 属于 import preview 的后续动作入口。

前台状态：

- 不进入前台导航。
- 不作为普通页面入口暴露。

### Docs Library

本地地址：

```text
http://localhost:3000/en/studio/docs/library
```

职责：

- 用于查看当前 docs 内容库概览。
- 用于展示 docs article / collection 的管理视图。
- 属于后续 create/edit/publish/admin 工作流的前置管理界面。
- 已从 `workspace` 中移出，归入隐藏的 `studio` 管理界面。

前台状态：

- 不进入前台导航。
- 仅通过直接链接访问。

## 当前策略

这些页面当前全部视为内部能力：

- 可以保留路由。
- 可以保留文案。
- 可以保留开发入口。
- 不挂载到 public site navigation。
- 不作为第一阶段公开产品体验的一部分。

第一阶段公开体验只围绕 docs 阅读界面推进。

## 后续 TODO

- `workspace` 继续作为独立工作界面，不承载 docs 后台数据。
- 后续如需管理员入口，可再决定是否在受控位置暴露 `/studio`。
- 决定 `Docs archive` 何时重新进入前台导航。
- 决定 `style-lab` 是否长期保留在 `/docs` 下，还是迁移到内部路径。
- 为 create/edit/publish 工作流单独定义内部信息架构。
