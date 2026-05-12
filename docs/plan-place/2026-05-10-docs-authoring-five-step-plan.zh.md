# Docs 写作系统五步计划

## 概要

这份计划为 docs 写作系统定义了一条可控的五步推进路径。

目标是：

- 避免过早直接进入 `create`
- 先稳定 block 内容模型
- 让快照与 AI 工作流具备可扩展性
- 让每一个阶段都能独立测试和验收

## 第一步：定义初始 Block

目标：

- 定义第一批可用的 docs block 类型
- 搭建一个小型 renderer 测试界面

第一批 block 范围：

- `heading`
- `paragraph`
- `list`
- `callout`
- `quote`
- `code`
- `divider`

交付物：

- block 类型列表
- 最小 block schema
- 静态预览 / demo 页面
- renderer 对全部初始 block 的支持

不包含：

- create UI
- 数据库表结构
- AI 编辑逻辑

## 第二步：定义 Block 拼接规则

目标：

- 定义 block 如何组成一整篇文档
- 明确 section 边界与拼接规则

重点：

- section 与 block 的关系
- heading 层级规则
- block 排列顺序规则
- 哪些 block 可以出现在任意位置
- 是否存在可嵌套 block

交付物：

- 文档拼接规则
- section 边界规则
- renderer 对异常组合或边界情况的处理规则

不包含：

- 完整编辑器实现
- 快照系统

## 第三步：搭建快照基础能力

目标：

- 为单人编辑场景加入基础版本快照能力

重点：

- 当前工作稿结构
- 已发布版本结构
- 快照结构
- 恢复流程

交付物：

- 快照数据模型
- 表结构规划
- 保存快照逻辑
- 恢复快照逻辑

不包含：

- 多人协作
- 高级 diff 界面

## 第四步：构建 Create 界面与 AI 辅助

目标：

- 在已经稳定的 block 模型基础上，搭建第一版可用的写作界面

重点：

- block 的新增 / 编辑 / 删除 / 排序
- 基础预览流程
- AI 辅助生成与改写

第一版 AI 范围：

- 生成草稿
- 改写选中 block
- 扩写某个 section
- 将原始文本转换为 blocks

交付物：

- create / editor 页面
- block 编辑工作流
- 基础 AI 操作入口

不包含：

- Notion 级交互打磨
- 完整高级富媒体 block 系统

## 第五步：扩展富媒体 Block

目标：

- 在基础写作流程稳定之后，继续扩展 block 系统

下一批候选 block：

- `image`
- `video`
- `audio`
- `embed`
- `gif`
- `interactive`
- `3d`

交付物：

- 新增 block schema
- renderer 支持
- create 侧逐步接入支持

## 验证原则

每一个阶段都应从以下三个角度进行检查：

- 数据结构是否稳定
- renderer 是否稳定
- 是否仍然支持未来的 AI 与 snapshot 扩展

## 当前建议

下一步最具体、最合适的实现目标应当是第一步：

- 定义 block v1
- 搭建静态 docs block 预览界面
- 在 create 开始之前，先验证阅读节奏、层级关系与视觉一致性
