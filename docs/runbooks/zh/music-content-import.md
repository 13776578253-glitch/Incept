# 音乐内容导入手册

面向操作者。讲清怎么把音频变成播放器能读到的曲目，以及出错时怎么办。

日常创作（上传、改曲目、管理曲库）在网页里完成，见 [music-library-management.md](./music-library-management.md)；**本文只讲批量迁移与重建**：换机器、重建数据库，或一次性导入一批已有目录。

## 前置条件

- PostgreSQL 在运行（`docker compose --env-file .env.docker up -d`）
- 迁移已应用（`pnpm db:deploy`）
- `apps/web/.env.local` 里有 `MUSIC_CONTENT_ROOT`，指向仓库外的绝对路径

内容根必须留在仓库外。仓库里只保留发布出去的镜像（`apps/web/public/_music-media/`），而那个目录是 gitignore 的。

## 目录布局

**文件夹就是曲库**——`pnpm music:manifest` 从路径推导归属，所以新增曲库 = 新建文件夹，不需要手写 JSON。

```
<MUSIC_CONTENT_ROOT>/
  music.json            ← 清单，导入的唯一输入；由生成器写入
  01-播客/
    episode-01.flac
    episode-02.mp3
  02-音乐/
    album/
      track-01.mp3      ← 更深的目录只是组织方式，仍属于"音乐"
  intro.mp3             ← 直接在根目录：归入默认曲库
```

含音频的首级目录必须带编号（`01-播客`）。未编号的目录、重复的编号、两个目录派生出同一个曲库 key，生成器都会直接报错，而不是替你猜一个顺序。

清单格式（生成器写出的形状）：

```json
{
  "libraries": [
    { "key": "播客", "title": "播客", "position": 1 },
    { "key": "音乐", "title": "音乐", "position": 2 }
  ],
  "tracks": [
    {
      "trackKey": "01-播客-episode-01",
      "file": "01-播客/episode-01.flac",
      "title": "第一集",
      "artist": "可选",
      "publishedAt": "2026-09-15",
      "position": 1,
      "libraries": ["播客"]
    }
  ]
}
```

字段规则：

- `trackKey` 必填且在清单内唯一。它是**内容身份**——文件内容变了就换一个新 key，不要改同一个 key 下面的内容
- `file` 必填，相对内容根；realpath 之后必须仍在根内（指向根外的符号链接与目录联接会被拒绝）
- `title` 必填；`position` 是必填整数，决定列表顺序——也是各曲库内部的顺序。曲库自身的顺序由 `libraries[].position` 决定
- `artist` 与 `publishedAt` 可省略；`publishedAt` 显示在列表行右侧，省略时改显示时长
- `libraries`（每首）由生成器按文件所在文件夹写入。手工写的值会被保留，而这是把一首放进多个曲库的唯一方式——但它提到的每个 key 都必须真实存在：要么由数字文件夹派生，要么在顶层数组里声明过；两者都不满足时生成器直接报错，而不是悄悄造一个曲库
- 引用未声明的曲库、或给一个空数组，都会让导入报错——拼错的 key 必须吵，而不是静默造出一个曲库
- 顶层出现 `libraries` 时清单就是**权威**的：清单里没有的曲库停用，成员关系按清单整体重写。没有这个数组则是**旧清单**：只创建或重新启用 `default`、把本清单的曲目补进去，不删也不停用任何东西
- 曲目省略 `libraries` 等价于 `default`，因此权威清单必须声明 `default`
- 直接在内容根下的文件归入 `default` 曲库；播放器把它显示为「默认 / Default」

允许的扩展名：`.mp3`、`.wav`、`.flac`。单文件上限 128 MB。

**不要让 `file` 指向仓库内的文件。** 内容寻址会把字节复制成镜像，指向仓库会让"内容根在仓库外"这条约束失去意义。

## 新增与调整曲库（批量迁移路径）

> 这一节只在用内容根 + 清单做批量迁移时适用。曲目与曲库的日常增删改查在网页里做（设置页 → 音乐 → 曲目与曲库管理，仅 owner）；`pnpm music:import` 会**停用**清单里没有的内容，因此批量导入前先撤掉或者接受这一点。

| 想做的事 | 怎么做 |
| --- | --- |
| 新增曲库 | 在内容根下新建编号文件夹、放入音频，重跑 `pnpm music:manifest` 与 `pnpm music:import` |
| 改显示名 | 改清单里的 `libraries[].title`；重跑生成器不会覆盖 |
| 调整已有曲库的顺序 | 改 `libraries[].position`。给文件夹改编号只决定新曲库的初始顺序，已存在的曲库保留自己的 position |
| 让一首进多个曲库 | 手工在该首上加 `libraries: ["a", "b"]`，重跑生成器仍会保留。两个 key 都必须已存在：先建编号文件夹，或先手工在顶层数组里声明该曲库（手工加的声明能跨重跑保留） |
| 移除曲库 | 删文件夹**并**清掉清单里仍提到它的条目：只要还有一条提到它，它就会留下（磁盘上消失的条目会被保留） |

**不要为了改显示名去改文件夹名。** 文件夹名是里面每个 `file` 路径的一部分：改名会让生成器把它们当成新文件（新的 `trackKey`），旧条目留在清单里报"磁盘上不存在"，并在下次导入时被停用。

## 日常流程

```bash
pnpm db:deploy              # 确保迁移已应用
pnpm music:manifest         # 扫描内容根，生成或更新 music.json
#   --root <dir> 扫描另一个目录；--dry-run 只报告，不写文件
# 按需手工调整标题、日期、顺序与曲库名——重跑生成器不会覆盖你改过的字段
pnpm music:import --dry-run # 校验全部条目，报告计划，不写任何东西
pnpm music:import           # 实跑
pnpm music:import --validate
```

`--validate` 检查八类不一致并以退出码 1 结束，所以可以直接用在脚本里：

- `orphanMirror` 镜像里有文件，但没有任何数据库行引用它
- `missingMirror` 数据库行引用的文件不在镜像里
- `notImported` 清单里有，数据库里没有
- `willDeactivate` 数据库里有启用行，清单里已无（下次导入会把它停用）
- `staleAudioUrl` 清单算出的期望文件名与数据库记录的 URL 不符——说明**内容换了但 trackKey 没换**，属于契约违反，此时服务端会继续发出旧字节，必须处理
- `libraryNotImported` 清单声明了、数据库里缺失或已停用、或标题与顺序与清单不一致的曲库
- `membershipMismatch` 某首曲目的曲库归属在清单与数据库之间不一致；旧清单模式只报缺失的 `default` 成员关系，因为那种模式不做删除
- `willDeactivateLibrary` 数据库里启用、清单里已不再声明的曲库

## 参数

| 参数 | 作用 |
| --- | --- |
| `--manifest <path>` | 指定清单路径，默认 `<MUSIC_CONTENT_ROOT>/music.json` |
| `--dry-run` | 校验并报告计划，不写镜像、不写数据库 |
| `--validate` | 只做一致性检查，不写任何东西 |
| `--allow-empty` | 允许空清单。**危险**：空清单会停用全部现有曲目，所以默认拒绝 |

## 失败与恢复

**数据库写失败（镜像已复制）。** 导入把镜像与数据库分成两步：镜像先落盘，数据库在单个事务里写。数据库失败时命令以非零退出，并打印**本次真正复制了哪些文件**。此时不会留下半成品行（事务回滚），而已复制的镜像**可以直接复用**——重跑一次即可，不会重复复制，也不会插入重复行。

**孤儿镜像。** 内容换了 `trackKey`、或改过 `file` 之后，旧的镜像文件会留在磁盘上不再被引用。用 `pnpm music:import --validate` 查出来。**不要盲目删除**——它可能仍被某个停用中的行引用，删掉会让那条记录指向不存在的文件。

**清单里的文件不见了。** 清单生成器**刻意保留**这类条目，并在输出里报告。删掉它会让下次导入把对应曲目静默停用；文件消失通常只是被挪了位置。确认要删除时手工编辑 `music.json`。

**时长读不出来。** `durationSeconds` 写空，导入继续。曲目照样能播，只是列表那一列没有值。

## 已知代价

**镜像复用会全量读取文件。** 每次导入校验复用文件时都会重新比对字节数与 SHA-256，而不是只看文件是否存在——只看存在会让损坏或被截断的文件被静默复用，并被服务端一直发出去。代价是导入耗时与曲库体积成正比。若曲库变大后导入明显变慢，原因在此，而不是数据库。

## 边界

这一套是**本地与内部环境**的方案。数据库只保存站点 URL（`/_music-media/<sha256>.<ext>`），绝不保存本机路径，所以将来换对象存储与 CDN 只需替换发布实现与 URL 前缀；清单契约、数据库表与播放器已经带上 B-19 的曲库模型，那一步不会让它们再改一次。

发布前必须替换，原因是 `public/` 下的文件**无法做访问控制**，而音频体积远大于图片——Range 请求与 CDN 缓存也要在真实部署平台上验证，不能靠开发环境推断。

## CLI 转发机制与包布局（2026-09-23 模块化迁移后）

`pnpm music:manifest` / `music:import` / `music:cleanup` 现在是**纯转发器**（`scripts/music-*.mjs`）：参数原样交给 `pnpm --filter @incept/music exec tsx src/cli/<入口>.ts`，用法文案与参数语义逐字不变；新增 `--env-file` / `--mirror` 两个 plumbing 标志（显式指定环境文件与镜像根），`--help` 文案保持原样。镜像布局常量唯一定义在 `scripts/music-paths.mjs`，转发脚本与服务端装配共用。

功能代码在 `packages/music`（`@incept/music`，分层 domain / ports / adapters / application / react / next / cli / endpoints / testing）。网页宿主只经三处接入：包 exports、服务端装配（`apps/web/src/server/music/assembly.ts`）、挂载注册（`apps/web/src/mount/music*`）。Prisma schema 与数据库迁移永久属于 `@incept/db`，本包不产生迁移。
