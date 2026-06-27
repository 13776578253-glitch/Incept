---
locale: en
slug: docs-page-example-markdown-like
title: Docs page example markdown-like article
summary: A copyable markdown-like import source that demonstrates the v1 docs writing format.
eyebrow: Markdown-like template
---

# Opening section

{paragraph variant=lead spacing=relaxed} Lead paragraphs open a section with more presence and a calmer rhythm.

This paragraph includes ordinary text, [an inline link](https://openai.com), ==marked emphasis==, ~~deprecated phrasing~~, and `inlineCode` without becoming multiple blocks.

## Internal heading

Muted paragraph style can be requested with a leading attribute marker.

{paragraph variant=muted} Muted paragraphs are useful for secondary explanation, caveats, or lower-priority context.

# Lists and tasks

- Use unordered lists for grouped points.
- Keep each item concise enough to scan.
- Review wrapping and marker alignment in preview.

1. Use ordered lists for steps.
2. Keep action order explicit.
3. Confirm the final route before import.

- [x] Confirm the markdown-like source parses.
- [ ] Confirm the preview route renders correctly.

# Editorial blocks

:::callout tone=tip variant=soft title="Writing tip"
Use callouts for short context that should stand apart from the main paragraph rhythm.
:::

> A useful docs block system feels editorial before it feels feature-rich.
> Keep quotes short enough to preserve momentum.

--- {variant=spacious}

```ts caption="DocsImportArticleSource target" variant=block
type DocsImportArticleSource = {
  meta: DocsImportArticleMeta;
  body: DocsImportArticleBody;
};
```

![Placeholder image used for docs import template testing.](/images/docs/style-lab-placeholder.jpg "Image blocks should use meaningful visual references in production.")
