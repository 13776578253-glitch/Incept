# @incept/music

音乐功能包（in-process workspace 包）。宿主（apps/web）只经 exports 出口 / 装配 / 注册面接入；Prisma schema 与迁移永久归 `@incept/db`。

分层与出口：`./domain`、`./ports`、`./adapters`、`./application`、`./react`、`./next`、`./cli`、`./endpoints`、`./testing`、`./testing/setup`。

## 宿主提供的 CSS 变量清单（组件样式随包、变量合同归 Web）

| 变量 | 用途 | 消费点 |
| --- | --- | --- |
| `--z-feature-floating` | 浮层 z-index（history: 原 `--z-music-player` 已更名为通用浮层语义） | `src/react/music-player/components/music-player-floating.tsx` 的两处 `z-[var(--z-feature-floating)]` |
| `--navbar-height` | 顶栏高度，浮层吸附几何的上边界 | `src/react/music-player/hooks/use-floating-position.ts:225` 的 **JS 运行时 `getComputedStyle` 读取点**；组件 class 中的 `calc` 引用 |

其余 `--color-*` / `--duration-*` 主题变量随宿主 tokens 提供。两个 localStorage key（偏好）属兼容面，值与 key 名不变。
