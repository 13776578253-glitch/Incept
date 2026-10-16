# Owner关于页入口恢复

## 执行约定

用户反馈Owner已登录但顶部没有关于入口。核查发现关于页仍存在并受requireOwner保护，createSiteNavigation遗漏了关于项，且导航未接入服务端身份。恢复Owner桌面/手机关于导航，使用LocaleLayout服务端身份布尔值传递，不在客户端判断Cookie；登录/退出已有router.refresh更新布局。保留现有页面权限和内容，本轮不提交/构建/部署。

## [2026-10-14 21:21] - Update by AI完成改动

服务端布局读取当前身份后，将canViewAbout传入AppShell/SiteHeader，Owner导航增加带语言路径的关于链接，桌面及手机共用同一导航列表。中英文既有导航测试追加Owner分支检查，8项测试、Web类型检查、lint和diff --check通过。

真实本地Owner浏览器已出现“关于”，点击后成功展示头像、CPP、原简介和活动记录入口；页面与活动API权限、原内容未改变。截图位于`.scratch/owner-auth-2026-10-14/owner-about-restored.jpg`。未提交、构建或部署。Commit建议：`fix(navigation): restore About entry for signed-in Owner`。
