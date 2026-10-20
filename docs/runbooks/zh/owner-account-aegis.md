---
title: Incept Owner 与 Aegis 完整操作手册
subtitle: 初始化 · 手机绑定 · 日常登录 · 故障处理 · 备份与恢复
template: doc
lang: zh
---

## A 先认清账号状态与各类凭据

**当前本地账号名是 `owner`，密码已生成；下一步是绑定你的 Aegis。**

2026-10-15 本轮只读检查结果：账号已初始化，新密码匹配，TOTP 尚未绑定；有效 Owner 会话和可信设备均为 0。这是检查时的状态。手册后续可用 Check 命令重新查看。

本手册对应本地源码版本，账号页为 [http://localhost:3000/zh/settings?section=account](http://localhost:3000/zh/settings?section=account)。在电脑上打开该页；手机上操作 Aegis。手机上的 localhost 指手机自身，绑定时直接在手机录入密钥即可。

### 七种信息分别用在哪里

| 信息 | 来源和外观 | 填写位置 | 生命周期 |
| --- | --- | --- | --- |
| Owner 用户名 | 当前为 `owner` | 站点“用户名” | 账号标识 |
| Owner 密码 | 本机工具生成，当前为 43 字符随机密码 | 站点“密码”或敏感操作“当前密码” | 改密或重置时更换 |
| 一次性设置码 | 受控终端签发，`SETUP-` 开头 | 站点“初始化授权／一次性设置码” | 20 分钟；成功消费一次 |
| TOTP 密钥／种子 | **站点绑定页**生成，当前为 32 位 Base32 字符 | **Aegis 的密钥字段** | 绑定后持续使用，重绑或重置时更换 |
| 六位 TOTP 动态码 | Aegis 根据密钥和时间计算 | 站点“TOTP 动态码／当前 TOTP” | 每 30 秒刷新，服务端防重复使用 |
| Owner 一次性授权码 | 已登录 Owner 或受控终端签发，`OWNER-` 开头 | 站点“授权确认” | 绑定本次请求，最长 10 分钟，消费一次 |
| 一次性恢复码 | 绑定成功或更新恢复码后显示，`REC-` 开头 | 站点切换为“使用恢复码”后填写 | 当前每批 8 个，每个消费一次 |

**Aegis 的密钥字段填站点生成的 32 位密钥。** 设置码用来批准首次绑定，六位动态码用来证明你已掌握该密钥。把 `SETUP-…` 粘进 Aegis，通常会触发 Base32 格式错误。

Aegis 保险库密码是你在 Aegis 内设置的另一份密码，用于解锁手机保险库。它与 Owner 密码各自独立。Pro 邀请码则用于阅读授权，与 Owner 登录分开。

### 这些数据如何保存

站点使用 scrypt 保存 Owner 密码哈希，使用 AES-256-GCM 加密保存 TOTP 种子。设置码、授权码、恢复码及会话凭据保存为哈希。手机 Aegis 保存能够生成动态码的种子。

本机初始化工具把密码和设置码存入 `.scratch/owner-local-private/account.dpapi`，使用当前 Windows 用户的 DPAPI 加密。目录仅授予当前用户及 SYSTEM 访问权限。这个加密包与当前 Windows 用户环境关联；跨机器恢复依靠单独备份的密码、Aegis 和恢复码。

## B 本机初始化、查看材料与设置码续发

### 准备运行环境

在你自己的 PowerShell 7 终端执行命令。先进入项目目录：

```powershell
Set-Location 'D:\Desktop\code\code\Incept'
pwsh --version
node --version
```

项目使用 Node 24，依赖中需要已有 tsx；本地 PostgreSQL 和站点开发服务应处于运行状态。网站打不开时，先恢复本地服务，再处理登录。

本机工具会核对数据库主机为 loopback，数据库路径与实际库名均为 `incept`。它复用 `apps/web/.env.local` 和 `packages/db/.env` 的配置。

### 当前账号：直接查看，不必重新初始化

```powershell
pwsh -NoProfile -File .\scripts\owner-local.ps1 -Action Show
```

终端会显示用户名、密码、设置码及设置码的 UTC 截止时间。北京时间／新加坡时间为 UTC+8。把密码保存到密码管理器，再在电脑账号页填写用户名和密码。

Show 设计为交互终端专用。直接运行即可；通过管道、重定向或自动执行器读取时会被拦截，防止解密结果进入普通日志。

### 设置码过期或绑定中断

尚未完成 TOTP 绑定时，运行：

```powershell
pwsh -NoProfile -File .\scripts\owner-local.ps1 -Action Refresh
pwsh -NoProfile -File .\scripts\owner-local.ps1 -Action Show
```

Refresh 保留密码，续发 20 分钟设置码并保存进加密包；旧设置码和未完成的绑定请求同时失效。浏览器点击“取消”回到密码步骤，用新设置码重新绑定。

若此前已把旧绑定请求的密钥加入 Aegis，请在新绑定页出现后更新对应条目。每次重启绑定可能生成不同的种子，应以当前绑定页为准。完成绑定后，服务端会拒绝续发设置码。

### 随时查看状态

```powershell
pwsh -NoProfile -File .\scripts\owner-local.ps1 -Action Check
```

| 输出字段 | 解释 |
| --- | --- |
| `initialized` | 是否存在唯一 Owner 账号 |
| `username` | 当前账号名 |
| `passwordMatches` | 加密包里的密码是否仍与数据库匹配 |
| `totpConfigured` | 服务端是否已正式保存绑定后的 TOTP |
| `activeSessions` | 当前未撤销、未过期的 Owner 会话数 |
| `trustedDevices` | 当前未撤销、未过期的可信设备数 |

手机确认完成前 `totpConfigured` 为 false。若你在网页改过密码或用 CLI 重置过账号，Show 中的旧密码不会自动更新；此时以你新设的密码为准，Check 会帮助识别这种情况。

### 全新本地环境的初始化入口

仅在尚无本机加密包、需要新建或明确重置本地 Owner 时使用：

```powershell
pwsh -NoProfile -File .\scripts\owner-local.ps1 -Action Prepare -ConfirmReset
```

Prepare 使用系统随机源生成 32 字节密码，再保存加密材料。账号已存在时会更新密码、撤销旧会话和设备，并清除旧 TOTP／恢复码。现有加密包存在时会拒绝覆盖，避免误触反复重置。当前账号已完成此步骤。

## C Aegis 手机绑定：从添加条目到网站确认

### 先设置 Aegis 保险库

Aegis 是 Android 验证器。首次使用时，为保险库设置一个可独立保存的强密码；已有保险库时先解锁。可在安全设置中确认保险库加密，并按需要启用指纹等生物识别。备份恢复仍需相应密码。[Aegis 官方主页](https://getaegis.app/)、[官方界面定义](https://github.com/beemdevelopment/Aegis/blob/master/app/src/main/res/values/strings.xml)。

### 让网站进入真正的绑定页

1. 在电脑账号页输入 `owner` 和新密码，点击登录。
2. 在初始化授权步骤填写 `SETUP-…` 设置码。
3. 提交成功后，页面显示 Incept 账号及绑定密钥。

这一页显示的长字符串，才是接下来要交给 Aegis 的种子。当前站点提供手动绑定密钥，按此方式操作即可。

### 在 Aegis 中手动新增条目

打开 Aegis 的添加菜单，选择“手动输入／Enter manually”。填写下表；高级参数若折叠，展开“高级／Advanced”。Aegis 各版本译名略有差异，可按括号内的字段识别。[官方编辑页实现](https://github.com/beemdevelopment/Aegis/blob/master/app/src/main/java/com/beemdevelopment/aegis/ui/EditEntryActivity.java)、[官方字段布局](https://github.com/beemdevelopment/Aegis/blob/master/app/src/main/res/layout/activity_edit_entry.xml)。

| Aegis 字段 | 本地 Incept 的填写值 | 作用 |
| --- | --- | --- |
| 类型（Type） | **TOTP** | 按时间生成动态码 |
| 发行者（Issuer） | 建议 `Incept Local` | 便于区分本地与生产账号 |
| 名称（Name） | 建议 `owner` | 便于找到条目 |
| 密钥（Secret） | **当前站点绑定页的 32 位密钥** | 真正参与动态码计算 |
| 哈希算法（Hash function） | **SHA-1**，有的版本显示 SHA1 | 与本项目算法一致 |
| 位数（Digits） | **6** | 显示六位数字，开头的 0 也保留 |
| 周期（Period） | **30 秒** | 动态码刷新周期 |
| 分组、备注、图标 | 可选 | 仅用于整理 |

发行者与名称可自行命名；密钥、类型、算法、位数和周期必须匹配。Aegis 官方实现支持这些字段，并以设备当前时间计算 TOTP；其默认周期是 30 秒。[官方 TOTP 实现](https://github.com/beemdevelopment/Aegis/blob/master/app/src/main/java/com/beemdevelopment/aegis/otp/TotpInfo.java)。

### 保存并完成绑定

1. 核对密钥，保存 Aegis 条目。
2. 回到条目列表，找到 Incept Local／owner。
3. 等待一轮新的六位动态码出现。
4. 在电脑的“TOTP 动态码”输入这六位数字。
5. 自用电脑可勾选信任此浏览器 30 天。
6. 点击页面的完成按钮。

站点验证通过后，正式保存加密 TOTP 种子并签发 Owner 会话。随后显示 **8 个恢复码**，应立即保存。Aegis 中已有条目而网站尚未确认时，绑定仍未结束。

### 完成后做一次检查

运行 B 节 Check，确认 `totpConfigured` 为 true。账号页应出现 Owner 管理区域。随后按 G 节导出 Aegis 加密备份，并保存恢复码。

Aegis 的 SHA-1 参数由站点要求决定。修改为 SHA-256 或 SHA-512 会生成另一组数字；本项目使用 HMAC-SHA-1、6 位、30 秒。[Aegis 官方 FAQ](https://github.com/beemdevelopment/Aegis/blob/master/FAQ.md#aegis-uses-sha1-for-mostall-of-my-tokens-isnt-that-insecure)。

## D 日常登录、可信设备与独立授权

### 你实际会遇到的登录分支

| 情况 | 登录过程 |
| --- | --- |
| 当前浏览器已有有效会话 | 直接进入 Owner 管理界面 |
| 已信任浏览器，环境稳定，低风险 | 输入账号密码后直接成功 |
| 可信设备仅换 IP，其他条件正常 | 一般仍走密码完成 |
| 可信设备浏览器／系统类别发生异常 | 密码后追加 TOTP |
| 新设备、无设备 Cookie、设备到期或已撤销 | 密码 → TOTP → 独立授权确认 |
| 近期出现关联密码失败或验证耗尽 | 限流或升级到完整验证 |

界面固定保留账号密码、TOTP、授权确认三步。密码输入后由服务端决定实际验证要求。免验阶段依次播放绿色勾选动画，走完第 3 步后显示登录成功，再刷新管理界面或返回合法的站内目标。已登录会话直接进入管理界面。

设备信任依赖服务端记录和随机设备 Cookie。清除 Cookie、无痕浏览、换浏览器配置文件，通常会成为新设备。当前环境判断使用浏览器／操作系统／移动端类别，不依赖地理地址数据库；普通版本升级被忽略。

建议在日常自用浏览器绑定时勾选信任设备。普通退出只撤销当前会话，设备信任保留；下次登录仍可参与低风险判断。

### 出现“首次／未知设备授权”时怎么做

先完成密码和 Aegis 动态码。随后网站显示“登录请求编号”，复制该编号。可通过下面两种方式签发本次授权码。

**方式一：另一台已登录的 Owner 设备。** 打开其账号安全设置中的登录授权管理，核对待批准请求，按要求完成近期身份验证，再生成一次性授权码。把得到的 `OWNER-…` 填回正在登录的设备。

**方式二：受控本机终端。** 在项目源码目录执行，把示例中的编号换成网页显示的实际请求编号：

```powershell
pnpm auth:owner approve --challenge '<登录请求编号>'
```

终端输出本次请求的授权码和截止时间。把其中 `code` 的完整值填入网页。授权码与请求绑定，截止时间不会晚于该请求的到期时间。

只批准你自己刚刚发起且已核对的请求。完成授权时可勾选信任设备，减少后续登录步骤。邮箱验证仍列在后续计划中。

### 风险与限流的实际规则

当前代码把 10 分钟内 5 次关联密码失败视为高风险信号；单个验证请求允许最多 5 次错误，耗尽后产生 30 分钟风险记录。关联按网络和设备区分。完整验证成功会解除对应历史风险。

接口还有独立的 10 分钟限流计数；触发后页面提示等待 10 分钟。避免在出错时持续刷新和重复提交，以免延长处理过程。

## E 会话期限、敏感操作与权限管理

### 四种时间不要混在一起

| 对象 | 当前期限 | 到期后如何继续 |
| --- | --- | --- |
| Owner 登录会话 | 登录成功起固定 7 天 | 重新登录，按设备风险决定步骤 |
| 可信设备凭据 | 签发起 30 天 | 再次完整验证并勾选信任 |
| 敏感操作近期认证 | 最近一次完整认证起 5 分钟 | 当前密码 + 新 TOTP 动态码 |
| 普通 TOTP／设置步骤请求 | 5 分钟 | 取消后重新发起登录 |
| 绑定种子确认请求 | 5 分钟 | 重新绑定，核对新页面密钥 |
| 独立授权确认请求 | 10 分钟 | 重新发起并批准新请求 |

会话没有“空闲 30 分钟退出”规则。持续访问不会延长固定 7 天。修改密码、账号重置、撤销设备或会话，可以让它提前失效。

### 敏感操作的 5 分钟如何计算

完整 TOTP 登录、初始化绑定或独立授权完成，会给当前会话记录近期认证时间。可信设备仅凭密码快捷登录时，该时间为空；第一次敏感操作就会弹窗。

弹窗填写 **当前密码 + Aegis 当前六位码**，成功后开启本会话的 5 分钟窗口。窗口内可连续执行受保护操作。窗口过期后，下一次敏感操作再弹窗。普通点击和浏览不刷新窗口，也不会把其他设备一起提权。

因此，超过 5 分钟后正常阅读和管理界面浏览仍可继续；只有触发受保护操作时才重新验证。验证与绑定都消耗动态码，同一轮码已用过时，等下一轮数字。

### 各项安全操作会影响什么

| 操作 | 影响 |
| --- | --- |
| 修改密码 | 更新凭据版本，撤销旧 Owner 会话、设备、挑战和许可；退出后用新密码登录 |
| 重绑 TOTP | 新种子确认成功后撤销旧会话及设备，旧恢复码换成新一批；当前浏览器获得新会话 |
| 更新恢复码 | 立即废止旧批次，显示新 8 个恢复码；TOTP 种子保持不变 |
| 退出当前登录 | 当前会话撤销，可信设备凭据保留 |
| 撤销某个设备 | 该设备信任及其关联会话、登录挑战一起撤销 |
| 全部退出 | 撤销 Owner 会话、可信设备、未完成挑战及许可 |
| 创建／撤销 Pro 授权 | 需要近期认证；Pro 授权与 Owner 登录凭据分开管理 |

Owner 账号固定后，临时 Pro 授权可在账户页下方管理。单次邀请支持 1／7／30 天或永久，默认 7 天；范围分享支持 1／6／24 小时，默认 6 小时。单次邀请及已兑换阅读权限共用签发时算起的截止时间。撤销后，相关授权与会话立即失效。

## F 报错速查：先看原文，再按对应动作处理

本次消息未附具体报错文本。下表列出当前代码的实际提示，以及 Aegis 和本机工具中最相关的情况。

### 站点页面提示

| 提示／错误码 | 常见原因 | 处理方式 |
| --- | --- | --- |
| 账号、密码或验证码不正确／`invalid_credentials` | 旧密码、复制多了空格；再认证时动态码错误 | 核对用户名；用 Check 检查初始密码包；按当前步骤填写对应凭据 |
| 验证码无效或已使用／`invalid_code` | 填错类型、动态码已使用、旧绑定种子、设置码过期 | 先区分 SETUP、六位 TOTP、OWNER 和 REC；动态码等待下一轮；设置码按 B 节续发 |
| 本次验证已过期／`challenge_expired` | 超过 5／10 分钟、请求耗尽 5 次、凭据刚被重置 | 点击取消，回到账号密码；初始化中断时续发设置码 |
| 尝试次数过多／`rate_limited` | 10 分钟接口限流 | 停止提交，等待 10 分钟再试；风险升级可能仍要求完整验证 |
| 请验证密码与当前 TOTP／`reauthentication_required` | 近期认证为空或过期 | 在弹窗提交当前密码及新动态码 |
| 登录已失效／`session_expired` | 7 天到期或账号／设备／会话被撤销 | 重新登录 |
| 没有执行此操作的权限／`forbidden` | 当前非 Owner，或请求来源校验失败 | 先刷新并确认身份；同一主机地址重试，核对反向代理来源配置 |
| Owner 账户尚未初始化／`owner_not_initialized` | 当前数据库无账号或连错环境 | 核对站点所用数据库，再由受控终端初始化 |
| 服务暂时不可用／`service_unavailable` | 数据库连接、加密密钥配置或服务异常 | 先查服务状态及服务端日志；保留原认证加密密钥 |
| 新密码至少 8 个字符／`password_policy` | 新密码长度不足 | 使用密码管理器生成密码；服务端另有 1024 字节上限 |

### Aegis 提示密钥格式错误

若看到密钥不是有效 Base32 的提示，检查是否把 `SETUP-…`、Owner 密码或六位码填进了 Aegis。正确种子来自站点绑定页，当前为 32 位字母 A–Z／数字 2–7。复制时去掉显示标签和空格，逐字符核对。[官方密钥解析实现](https://github.com/beemdevelopment/Aegis/blob/master/app/src/main/java/com/beemdevelopment/aegis/ui/EditEntryActivity.java)。

若 Aegis 正常生成数字但网站拒绝：核对 TOTP／SHA-1／6 位／30 秒，检查条目是否来自当前本地站点、当前绑定请求。打开 Android 的自动设置时间；站点运行主机也需校时。等待下一轮数字后再试。时区显示不同不影响按 Unix 时间计算的 TOTP，实际时钟偏差会影响验证。

### 本机 PowerShell 工具报错

| 提示 | 解释与动作 |
| --- | --- |
| `Display credentials only in your own interactive terminal` | 解密显示被重定向。请在自己的交互终端直接执行 Show |
| `An encrypted account bundle already exists` | Prepare 拒绝覆盖已有账号材料。现有账号用 Show；设置码过期用 Refresh |
| `No pending enrollment bundle` | 加密包不是等待绑定状态，先检查 Check 与此前操作记录 |
| `Local Owner operation failed` | 工具捕获了底层错误。先确认本地 PostgreSQL、环境配置和 Node；绑定已完成时 Refresh 也会失败 |
| 找不到 `account.dpapi` | 尚无材料、材料被移动，或目录被误清理。先找回备份；需要重建时走 H 节受控恢复 |
| 解密失败或访问被拒绝 | Windows 用户／机器环境不匹配，或目录权限异常。回到原用户环境，或走受控账号恢复 |
| 找不到 `pwsh` | 当前 PATH 没有 PowerShell 7。在已安装的 PowerShell 7 中直接运行脚本 |
| 找不到 `node`／tsx | 当前 PATH 或项目依赖缺失。恢复项目 Node 24 和既有依赖后重试 |
| `passwordMatches: false` | 网页改密或 CLI 重置后，初始材料已过时。使用你新设的密码 |

固定使用 `localhost:3000` 或固定使用 `127.0.0.1:3000`。它们的 Cookie 分开存储，混用容易出现“另一页又变回 Guest”的现象。

## G 备份：保存什么、Aegis 怎么导出与恢复

### 四份材料分工

| 材料 | 保存建议 | 恢复什么 |
| --- | --- | --- |
| Owner 当前密码 | 密码管理器 | 第一登录因子 |
| Aegis 加密备份文件 | 手机之外的一处安全存储，保留版本 | 手机中的 TOTP 条目和种子 |
| Aegis 保险库／备份密码 | 密码管理器，标明用途与版本 | 解锁保险库或解密导入文件 |
| 当前 8 个站点恢复码 | 单独保存，标注本地或生产、签发日期 | 手机不可用时的一次性替代验证 |

本机 `account.dpapi` 是初始化辅助材料，网站改密后会过时。将 `.scratch/owner-local-private/` 视为有用的私有材料，清理测试报告时保留。最终恢复能力应依靠上述四份材料及受控管理入口。

### Aegis 手动导出一份加密备份

1. 解锁 Aegis，打开设置。
2. 进入“导入与导出”。
3. 选择导出，格式选 Aegis JSON。
4. 确认使用加密，并包含 Incept 条目。
5. 保存文件，再复制到手机之外的安全位置。

官方设置将导入与导出放在同一区域；Aegis JSON 用于自身备份恢复。[官方导入导出设置](https://github.com/beemdevelopment/Aegis/blob/master/app/src/main/res/xml/preferences_import_export.xml)、[官方导出实现](https://github.com/beemdevelopment/Aegis/blob/master/app/src/main/java/com/beemdevelopment/aegis/ui/fragments/preferences/ImportExportPreferencesFragment.java)。

**备份密码以导出时的配置为准。** 官方 FAQ 描述默认沿用保险库密码；当前官方代码还提供独立的备份／导出密码选项。若你启用了独立密码，就保存并使用它。更换密码前生成的旧备份，仍按旧文件当时使用的密码解密。[官方 FAQ](https://github.com/beemdevelopment/Aegis/blob/master/FAQ.md#encrypted-backups)、[当前密码选项](https://github.com/beemdevelopment/Aegis/blob/master/app/src/main/res/values/strings.xml)。

### 启用自动备份

在 Aegis 设置的“备份”中开启自动备份，指定目录并保留多个版本。绑定或重绑后，可以手动触发一次并确认新文件已产生。自动备份要求保险库已加密。[官方备份设置](https://github.com/beemdevelopment/Aegis/blob/master/app/src/main/res/xml/preferences_backups.xml)。

若目录仍在手机本地，再把加密文件同步或复制到另一设备。Aegis 官方说明，云端目标依赖 Android 存储访问框架支持，也可由其他工具同步本地备份目录。[官方备份 FAQ](https://github.com/beemdevelopment/Aegis/blob/master/FAQ.md#backups)。

### 在新手机导入

1. 安装并打开 Aegis，设置新手机保险库。
2. 进入设置的“导入与导出”，选择从文件导入。
3. 选择原 Aegis 加密 JSON 备份。
4. 输入该文件对应的备份密码。
5. 导入后找到 Incept 条目，核对类型与账号。
6. 校准手机时间，按 D 节正常登录。

恢复的是原种子；网站种子仍有效时可以继续使用。若网站后来重绑过，应导入重绑后的新备份。手机备份和站点恢复码都应在每次重绑后更新。

可在备用设备上做一次导入演练，确认文件与密码可配套使用。演练结束后按该设备用途决定是否保留种子。

### 站点自身也有备份责任

站点恢复需要 PostgreSQL 账号数据及独立的 `INCEPT_AUTH_ENCRYPTION_KEY`。只恢复数据库而缺少原加密密钥，会导致现有 TOTP 密文无法解密。原密钥应与数据库分别加密保存，并有恢复步骤。Aegis 备份只覆盖手机验证器条目。

## H 手机丢失、忘记密码与受控恢复

### 情况一：换手机，已有可用 Aegis 备份

按 G 节导入。密码仍用原 Owner 密码；新浏览器按 D 节完成独立授权。旧手机丢失或疑似泄露时，恢复登录后立即重绑 TOTP，让旧手机种子失效，再更新恢复码和 Aegis 备份。

### 情况二：没有 Aegis 备份，但有站点恢复码

1. 在账号页输入 Owner 用户名和密码。
2. 在 TOTP 步骤点击“使用恢复码”。
3. 输入一个未使用的 `REC-…` 完整恢复码。
4. 进入独立授权，按 D 节批准本次请求。
5. 登录后立即打开“验证器与恢复码”。
6. 在 5 分钟近期认证窗口内完成重新绑定。

当前实现消费恢复码时会撤销既有 Owner 会话、设备和未完成许可，并更新凭据版本。独立授权仍需完成。恢复登录暂时沿用旧 TOTP 种子，**成功重绑后才换成新种子**。

因此，恢复成功后要立即在新 Aegis 中添加新种子、提交动态码，并保存新 8 个恢复码。重绑会替换旧恢复码。若这段近期认证窗口已过，可再使用另一枚恢复码重新恢复，或选择受控重置。

### 情况三：手机丢失，恢复码也不可用

通过受控本机终端恢复账号。以下命令在当前本地源码目录运行，先检查目标状态：

```powershell
pnpm auth:owner status
```

确认操作目标后执行：

```powershell
pnpm auth:owner reset --username owner --confirm
```

交互终端会隐藏输入新密码；密码至少 8 字符。成功后终端显示新设置码和截止时间。把新密码保存到密码管理器，再按 B、C 节重新初始化绑定。

此重置会撤销旧 Owner 会话、设备、挑战和许可，清除旧 TOTP 和恢复码，并递增凭据版本。内容和 Pro 授权保留。旧手机中的种子随后失效。

如果恢复设置码超时，可在同一受控环境执行：

```powershell
pnpm auth:owner setup-code
```

**CLI 重置后的密码与设置码以本次终端结果为准。** 初始 Show 加密包不会自动同步这次新密码。该文件可作为历史材料处理，避免之后误用。

线上账号恢复也走 SSH 受控操作：先进入含对应版本 CLI 的运行环境，核对生产数据库，再执行重置流程。Windows `owner-local.ps1` 仅处理本机 `incept`；本轮没有改变线上账号。

### 情况四：Owner 密码忘记了，手机仍在

先查密码管理器。若账号仍使用初始化密码，可在原 Windows 用户终端运行 Show。若密码已更换且未保存，按上述受控 reset 恢复，并重新绑定手机。当前流程会同时更换认证材料。

### 情况五：Aegis 密码忘记了

如果还能解锁现有保险库，先利用当前可用入口和动态码保护站点账号，并处理备份。若有可解密的独立密码备份，可在另一台设备恢复。

若保险库和备份都无法解密，按站点恢复码或受控重置流程重绑。Aegis 官方建议保留密码提醒，帮助避免遗忘保险库密码。[官方密码提醒说明](https://github.com/beemdevelopment/Aegis/blob/master/FAQ.md#why-does-aegis-keep-prompting-me-for-my-password-even-though-i-have-enabled-biometric-authentication)。

### 最终完成清单

- 电脑账号页已显示 Owner 管理区域。
- Check 显示 TOTP 已配置。
- 当前密码已保存在密码管理器。
- Aegis 已有正确条目，并能用于站点验证。
- 当前 8 个恢复码已单独保存。
- Aegis 加密备份已存到手机之外，密码可找到。
- 自用浏览器的信任状态符合你的选择。

### 本手册核对依据

Aegis 操作依据官方主页、FAQ、当前编辑页实现、字段布局、TOTP 实现及备份设置，链接已放在相应段落。官方代码与 FAQ 有差异时，以实际选项为准，备份密码差异已在 G 节说明。核对日期为 2026-10-15。

Incept 行为依据 `scripts/owner-local.ps1`、`scripts/owner-local.mts`、`scripts/auth-owner.mjs`、`packages/db/src/owner/index.ts`、`packages/db/src/owner/security.ts`、`apps/web/src/server/auth/owner-controller.ts`、`apps/web/src/app/api/auth/logout/route.ts` 及账户面板实现。
