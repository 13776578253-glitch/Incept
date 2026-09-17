# 音乐内容导入手册

面向操作者。讲清怎么把音频变成播放器能读到的曲目，以及出错时怎么办。

## 前置条件

- PostgreSQL 在运行（`docker compose --env-file .env.docker up -d`）
- 迁移已应用（`pnpm db:deploy`）
- `apps/web/.env.local` 里有 `MUSIC_CONTENT_ROOT`，指向仓库外的绝对路径

内容根必须留在仓库外。仓库里只保留发布出去的镜像（`apps/web/public/_music-media/`），而那个目录是 gitignore 的。

## 目录布局

```
<MUSIC_CONTENT_ROOT>/
  music.json            ← 清单，导入的唯一输入
  episodes/
    episode-01.flac
    episode-02.mp3
```

清单格式：

```json
{
  "tracks": [
    {
      "trackKey": "episode-01",
      "file": "episodes/episode-01.flac",
      "title": "第一集",
      "artist": "可选",
      "publishedAt": "2026-09-15",
      "position": 1
    }
  ]
}
```

字段规则：

- `trackKey` 必填且在清单内唯一。它是**内容身份**——文件内容变了就换一个新 key，不要改同一个 key 下面的内容
- `file` 必填，相对内容根；realpath 之后必须仍在根内（指向根外的符号链接与目录联接会被拒绝）
- `title` 必填；`position` 是必填整数，决定列表顺序
- `artist` 与 `publishedAt` 可省略；`publishedAt` 显示在列表行右侧，省略时改显示时长

允许的扩展名：`.mp3`、`.wav`、`.flac`。单文件上限 128 MB。

**不要让 `file` 指向仓库内的文件。** 内容寻址会把字节复制成镜像，指向仓库会让"内容根在仓库外"这条约束失去意义。

## 日常流程

```bash
pnpm db:deploy              # 确保迁移已应用
pnpm music:manifest         # 扫描内容根，生成或更新 music.json
# 按需手工调整标题、日期、顺序——重跑生成器不会覆盖你改过的字段
pnpm music:import --dry-run # 校验全部条目，报告计划，不写任何东西
pnpm music:import           # 实跑
pnpm music:import --validate
```

`--validate` 检查五类不一致并以退出码 1 结束，所以可以直接用在脚本里：

- `orphanMirror` 镜像里有文件，但没有任何数据库行引用它
- `missingMirror` 数据库行引用的文件不在镜像里
- `notImported` 清单里有，数据库里没有
- `willDeactivate` 数据库里有启用行，清单里已无（下次导入会把它停用）
- `staleAudioUrl` 清单算出的期望文件名与数据库记录的 URL 不符——说明**内容换了但 trackKey 没换**，属于契约违反，此时服务端会继续发出旧字节，必须处理

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

这一套是**本地与内部环境**的方案。数据库只保存站点 URL（`/_music-media/<sha256>.<ext>`），绝不保存本机路径，所以将来换对象存储与 CDN 只需替换发布实现与 URL 前缀，清单契约、数据库字段与播放器都不用动。

发布前必须替换，原因是 `public/` 下的文件**无法做访问控制**，而音频体积远大于图片——Range 请求与 CDN 缓存也要在真实部署平台上验证，不能靠开发环境推断。
