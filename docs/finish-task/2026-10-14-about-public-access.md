# 关于页完全开放

## 执行约定

用户明确要求关于导航、简介、活动页及活动统计接口对Guest/Pro/Owner完全开放。移除这些读取入口的Owner门禁，简介以Guest权限读取；通过仅针对documentKey=about的数据迁移将现有简介改为guest，继续保持不列入文档导航。其他文档、账号管理和内容写入权限不变。删除上一轮仅为关于导航引入的身份属性和布局查询。

核验未登录中英文简介、活动及统计筛选，保留参数验证和服务端Token边界。改动仅本地，不提交/构建/部署；路线图权限留到下一轮，不在本轮调整。

## [2026-10-14 21:37] - Update by AI完成改动

关于导航无条件展示，桌面/手机共用；简介按guest读取，活动页及GitHub/写作汇总API不再要求Owner。移除了上一轮关于导航专用的身份属性与布局身份查询，保持其他身份判断和写入门禁。活动scope/年份参数校验、GitHub服务端Token及6小时缓存继续沿用。

新增迁移`20261014213000_about_public_access`，只将未列入文档目录的about文档accessRole设为guest。本地先完成PostgreSQL备份，再应用第21个迁移；about原为private，中英文均已发布，正文未变，其他文档完整内容和权限哈希相同，4条路线图/25条条目及音乐数量未变。备份及校验结果位于私有`.scratch/owner-auth-2026-10-14/primary-before-about-public.dump`和`about-public-migration-result.json`。

验收：16项导航/匿名页面/统计参数测试、Web类型检查、lint及diff --check通过。真实未登录中英文简介返回200且正文存在；活动页读取到GitHub available汇总与写作日期/数量，2026年份切换成功。接口只返回活动统计，不返回Token、提交内容或文章正文。未登录浏览器截图在`.scratch/owner-auth-2026-10-14/about-public.jpg`与`about-activity-public.jpg`。未提交、构建或更新生产环境。

下一轮：按用户要求单独讨论并修改路线图权限，本轮不提前实施。Commit建议：`feat(about): open introduction and activity summaries to all visitors`。
