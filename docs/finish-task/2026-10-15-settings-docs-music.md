# 设置页 Docs 迁移与音乐开关

日期：2026-10-15。

## 行为

- 英文侧栏 Appearance、Language、Projects、Music 的说明保留，移除末尾句号。
- Owner 的侧栏顺序为 Appearance、Language、Account、Docs、Projects、Music。
- Docs 总览迁入 `/{locale}/settings?section=docs`，沿用设置页卡片样式。保留五项统计、搜索、语言/路由类型/权限筛选、打开和复制文章路径。
- 旧 `/{locale}/studio/docs/library` 中英文路由及空的 studio 布局已删除。总览组件、模型和查询迁入 settings；移除原 docs/admin 导出和旧页专用文案。
- `loadDocsSettings()` 在服务端核验 Owner 后才查询总览。Guest/Pro 返回 null，侧栏也不生成 Docs 管理分区。
- 新增当前浏览器的播放器总开关，默认开启，保存在现有偏好中。旧偏好缺少该字段时维持开启。
- 停用后关闭悬浮入口，移除音频元素并释放音源，停止目录请求；保留原有倍速、位置、播放模式和所选曲库。页面子树保持挂载。
- 停用后播放器偏好控件置灰且不可操作；Owner 上传、曲库及曲目管理保持可用。
- 同一站点不同标签页同步开关状态。重新开启后可恢复播放器，验收完成已恢复开启。
- 曲目表格为状态、操作列保留固定宽度；较窄屏幕使用卡片内横向滚动，修复 Deactivated/Restore 重叠。

## 验收

- Web 与 music 类型检查通过。
- Music 测试 195 项及播放器 core 测试 73 项通过。
- Web 设置、挂载注册及 Docs 权限测试 17 项通过。
- ESLint 无错误；宽范围检查显示 5 条既有未使用变量警告。
- 中英文旧发布总览地址均返回 404。
- Owner 浏览器中的 Docs 分区显示 14 条记录；搜索 only-test 后显示 2 条。
- 播放器关闭后刷新保持关闭，另一 Dashboard 标签页的音频元素与播放控件均为 0；上传按钮仍可操作。
- 重新开启后 Dashboard 音频元素恢复为 1。
- 英文停用行实测状态标签右边界 1046.36px，Restore 左边界 1083.72px，无重叠。

截图和临时验证材料位于 `.scratch/settings-docs-music-2026-10-15/`。本轮不构建发布包、不部署。
