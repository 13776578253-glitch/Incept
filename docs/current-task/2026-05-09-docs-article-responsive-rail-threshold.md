[2026-05-09 00:00] - Update by AI完成改动:
- 为 docs 正文页新增了一个中间响应式断点：在宽度低于约 `1800px` 但仍高于移动端断点时，隐藏右侧进度栏，只保留左侧栏与正文。
- 保持 `contentOnly` 模式和移动端逻辑独立：`contentOnly` 在该断点下会退化为纯正文单列，`<=1023px` 时继续沿用原有移动端规则，左右栏都隐藏。

## 本轮改动位置

- `apps/web/src/styles/layout.css`

## 实现说明

- 新增 `@media (max-width: 1800px)` 断点
- `sidebar` 模式下：
- `page-shell-docs-reference` 从三列改为两列
- 隐藏 `.page-shell-docs-reference-aside`
- `contentOnly` 模式下：
- `page-shell-docs-reference[data-layout-mode='contentOnly']` 改为单列正文
- 不影响现有 `@media (max-width: 1023px)` 的移动端规则

## 当前效果

- 超宽屏下：左栏 + 正文 + 右侧进度栏
- 中等桌面宽度下：左栏 + 正文
- `contentOnly` 中等桌面宽度下：仅正文
- 小屏 / 平板 / 手机下：仅正文

遗留问题:
- `1800px` 目前是第一版经验阈值，后续可以根据真实 2K、常见笔记本和浏览器缩放测试再细调为更精确的断点。

Commit 建议: fix: add responsive threshold for docs article right rail
