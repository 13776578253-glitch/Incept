# Docs 导入流程规则（已归档）

> **本文件已于 2026-09-23 归档。**
>
> 内容已移至 [`docs/history/decisions/zh/docs-import-flow-rules.md`](../../history/decisions/zh/docs-import-flow-rules.md)。

归档原因：本文描述的是**最初的 TypeScript `DocsImportArticleSource` 导入路径**。该路径仍保留给高级或程序化导入，但已不再是常规写作方式。

取而代之的是 `.docs.md` Markdown-like 写作 + 目录/批次合集导入 + Owner Preview + 事务式 Confirm。当前操作手册见 [docs-content-import.md](../../runbooks/zh/docs-content-import.md)。

归档说明中已标注两处**已过期、不可依赖**的陈述：confirm route 的权限校验（Owner 鉴权已实现）、以及「暂不支持批量导入」（目录批次导入已实现）。同时保留了仍然有效的一条规则：`--replace` 只按 `locale + slug` 匹配。
