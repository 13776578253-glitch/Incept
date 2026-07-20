[2026-05-08 23:54] - Update by AI完成改动:
- 完成了 docs 首页第一轮 UI 样式与位置微调，重点收口了主阅读轴、分组标题区、文章列表区和受限权限标识的位置问题。
- 新增并接通了 `/docs/archive` 占位页与导航入口，修正了顶部导航中 docs 下拉菜单的目标链接与顺序逻辑。
- 扩充了 docs 数据种子，当前 `/zh/docs` 已具备足够长的列表内容，可稳定触发浏览器页面级滚动条，便于后续继续测试侧边结构与长页面表现。

## 本轮已完成改动

- `/{locale}/docs` 主入口样式已做第一轮结构收口：
- 外层容器宽度已重新收窄，并改为更接近 home 的偏移节奏，但未完全照抄 home 的对齐方式。
- `docs-home-intro`、`docs-home-group-section`、`docs-home-list-item` 已联动调整，主内容列整体向右偏移，减少与 home 切换时的视觉跳动。
- `ENTRIES` 文本已单独微调位置，使其更接近分组右侧的稳定参考线。
- 每篇受限文章的锁图标与权限文本已从标题旁边移出，改为固定落在右侧独立列中，避免标题换行造成空白和错位。
- 权限列已由右对齐改为左对齐，并继续向左收了一次，使锁图标成为对齐锚点。

## 导航与路由同步

- 顶部主导航 `Docs` 继续指向 `/{locale}/docs`
- docs 下拉菜单第一项已改为 `Docs / 文档`，同样指向 `/{locale}/docs`
- docs 下拉菜单第二项已改为 `Docs archive / 文档归档`，指向 `/{locale}/docs/archive`
- `/docs/archive` 已新增轻量占位页，避免导航出现死链

## 数据与滚动测试

- `packages/db/prisma/seed.ts` 已追加多篇 docs 文章种子数据
- 当前 docs 首页条目数量已经足够形成长页面
- `/zh/docs`、`/en/docs` 现在都可以稳定触发浏览器系统原生滚动条
- 这样后续测试 sticky、侧边布局挤压、长列表节奏时不再受“页面太短”影响

## 当前已验证页面

- `/zh`
- `/zh/docs`
- `/zh/docs/archive`
- `/zh/docs/document-shells`

当前这一轮主要验证通过的点：

- home 与 docs 首页切换时，主阅读区位置已明显更接近
- docs 首页长列表滚动已可用
- 受限文章的权限标识不再被标题换行挤乱
- docs 导航入口逻辑已闭环

## 遗留问题

- docs 首页与 home 首页目前仍不是完全共用一套阅读轴规则，只是第一轮手工对齐，后续如果继续深调，建议抽取统一容器规则。
- docs 首页右侧辅助结构暂未重新挂回；此前实验性的 side rail 已移入 `features/docs/shared/unused/` 备用。
- 当前权限标识的位置已经稳定，但后续仍可继续微调其横向间距与列宽，使其和 `ENTRIES` 参考线更统一。

Commit 建议: refactor: tune docs home layout rhythm and navigation alignment
