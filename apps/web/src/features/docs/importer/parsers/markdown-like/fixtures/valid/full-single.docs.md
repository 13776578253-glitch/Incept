---
documentKey: markdown-like-fixture
locale: zh
slug: markdown-like-fixture
title: Markdown-like fixture
summary: A complete single article fixture.
eyebrow: Parser fixture
kind: article
accessRole: private
---

# 想法产生

{paragraph variant=lead spacing=relaxed} This fixture keeps `OWNER_ACCESS_SECRET` as inline code and includes [a link](https://example.com).

## Text styles

This paragraph contains ==marked text== and ~~deleted text~~.

### Nested detail

This heading is nested below the section's first body heading.

#### Fine detail

This heading is nested below the level-three heading.

- An unordered item.
- Another unordered item.

1. An ordered item.
2. Another ordered item.

- [x] Completed task.
- [ ] Open task.

:::callout tone=tip variant=soft title="Fixture tip"
Callouts remain plain text in markdown-like v1.
:::

> A short quote.
> A second quote line.

--- {variant=spacious}

```ts caption="Fixture code" variant=compact
const parser = 'markdown-like';
```

![Fixture diagram](/images/docs/fixture/diagram.png "Fixture image")

# 第二部分

The second section proves Unicode section IDs remain distinct.
