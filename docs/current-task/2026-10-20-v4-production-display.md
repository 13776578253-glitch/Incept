# Incept v4 生产展示发布完成

2026-10-20，Asia/Singapore。10:47 切换完成，10:50 完成稳定性与备份校验，约25分钟。状态 `production_v4_display_live`。仅本次展示发布完成；正式 Windows Agent 保持停止。

## 生产版本与展示数据

- App：`incept-v4-release:20261020`，实际按 OCI index `sha256:38b2a518f8a97d3b0d5663ed1e9955ac0b1d3ec60c85417887cfb05890539374` 固定运行。
- linux/amd64 manifest：`sha256:e894c5fc6508fddde9fdca3cf295c8858aa190131b290261dde54f13c4bbdbf9`。
- Image Config：`sha256:44a7a29c91ec093c83370437d7b302dc98fac7a244d911c1ead5074ed9567b29`。三层引用、平台及rootfs均匹配。
- 正式快照：362 scopes / 362 receipts、4,558,021,501 Token、revision 387；公共HTTPS“全部”用量与数据库一致。
- 冻结快照和运行副本 SHA-256 均为 `9ceb73c0fb4f8d8627c03f3ad53237ddfd5fa7ddb95b80183f2dd05e90cff11b`。
- Dashboard：<https://dashboard.example.invalid/en/dashboard>；必要读取API `/api/dashboard/usage?range=all` 与 `/api/health/ready` 均200。

本地逐项核对RELEASE-MANIFEST的19项完整SHA，远端上传镜像、快照及总清单均匹配。镜像归档SHA为 `4ada7ac3965d791835fb3e894a781314dab140938c5e586c824fa5d2e5fedc9c`，总清单SHA为 `9b0be432dcdea2fc88e00692ceff79f2452041b4cf03bb74c6b7fb4171cdf67e`。

## 独立路径与保留项

新release：`/srv/incept/releases/v4-20261020-display`。

运行数据库：`/srv/incept/releases/v4-20261020-display/runtime/sync/v4.db`，App中为 `/data/sync/v4.db`。原 `/srv/incept/import-20261014/shared/sync/v2.db` 保留。

展示缓存：`/srv/incept/releases/v4-20261020-display/runtime/display/snapshots.json`，App中为 `/v4-display/snapshots.json`。仅对同一冻结快照进行只读投影，生成7d/14d/30d/all展示数据；未导入新usage或修改源快照。原展示缓存保留。准备阶段的只读父目录挂载错误及失败副本已保存在release目录，修正后才切换App。

仅用 `--no-deps app` 替换App。现有PostgreSQL数据和身份、Caddy路由、Gateway容器与配置均保留。原env及Compose配置文件哈希不变；本次overlay单独保存为 `compose.v4-display.json`。正式Agent的state/config/DPAPI与先前保护指纹一致，实例命名管道确认停止；设备授权和原review未改。

## 运行状态与内存

App、PostgreSQL、Caddy、Gateway全部 running/healthy，restart count均0。

最终采样：App 157.2 MiB / 768 MiB；Caddy 35.54 MiB；Gateway 48.02 MiB；PostgreSQL 31.1 MiB。服务器可用内存1,179,234,304 bytes，约1.10 GiB；swap使用约95 MiB。旧staging保持原状态，未停止或清理。

## 备份与回滚

备份位置：`/srv/incept/backups/v2-before-v4-20261020-display`，私有权限保护。

包含原v2镜像、完整shared数据tar、两份SQLite一致性快照、当前生产PostgreSQL自定义格式备份与全局角色备份、原App inspect及必要配置。18份备份文件完整SHA再次核对全部通过；SQLite integrity_check=ok，PostgreSQL备份可列出数据对象，原镜像仍可解析。备份总清单SHA为 `833372d113554442a33afa71d495c8a2095102af23d18d6be88f698dccfe8cd3`。

原Compose加旧镜像固定引用的回滚配置已验证等价。恢复入口：

```sh
python3 /srv/incept/releases/v4-20261020-display/uploads/deploy-v4-display.py rollback
```

该入口只恢复App原镜像与原挂载，不回灌PostgreSQL、不覆盖或删除v2/v4数据、不启动Agent。失败诊断写入异常不会阻断回滚调用。

本次生效配置的后续运维入口：

```sh
/srv/incept/releases/v4-20261020-display/compose-active.sh ps app
```

此wrapper使用原Compose文件、原env及本次独立overlay。原默认compose入口仍保留旧版本配置；后续维护本次v4必须使用生效wrapper。Docker原有restart policy保留。

## 交付证据

- `output/v4-production-display-final.json`
- `output/v4-display-service-health.json`
- `output/v4-display-backup-manifest.json`
- `output/v4-display-formal-agent-stopped.json`
- `output/v4-display-local-frozen-verification.json`
- 服务器release内 `FINAL-STATUS.json`、`SWITCH-RESULT.json`、`PREPARED.json`。

204个历史路径、两份隔离记录、正式Agent配置及启用授权留在后续任务；本次未重跑历史对账、完整E2E或远端验收环境。
