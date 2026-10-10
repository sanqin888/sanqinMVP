# C3-B / C4 Runtime 与备份路径切换：历史门禁及 P2-C 验收记录

**状态（2026-10-09 UTC / 2026-10-08 Toronto）：C4-P2-C `PRODUCTION CUTOVER COMPLETED`；C4-P2-D `PENDING`；整个 C4 尚非 `PRODUCTION VERIFIED / CLOSED`。**

本文第 1–4 节保留的是已执行切换的**原始审批与回退合同**，不可作为重新执行生产切换的授权或命令手册。C3-B 源码与 C4-P2-A 可信 Runtime Archive 预安装均已按独立授权完成；`build_bundle.py::SOURCE_FILES` 的 17 文件严格白名单不变。P2-A 原始准备与失败恢复规则见 `docs/runbooks/runtime-trusted-manual-install-c4p2a.zh-CN.md`。

**当前生产权威路径**：`/opt/sanq/runtime`、`/srv/sanq/uploads`、`/srv/sanq/backups`。完整的 P2-C 生产证据及 P2-D 下一步见本文末尾和 `docs/runbooks/runtime-backup-cutover-c4p2d-acceptance.zh-CN.md`。

## 旧布局与新布局对照（P2-C 已执行）

| 资源 | 切换前（历史） | 切换后（当前） |
| --- | --- | --- |
| 运行配置 | /home/ubuntu/sanq-app | /opt/sanq/runtime |
| uploads | /home/ubuntu/sanq-app/uploads | /srv/sanq/uploads |
| backups | /home/ubuntu/sanq-app/backups | /srv/sanq/backups |
| backup 主脚本 | /home/ubuntu/backup-db.sh（旧路径合同） | 同一路径，安装新审核源码 |
| protected helper | /usr/local/sbin/sanq-backup-protected-nginx（旧路径合同） | 同一路径，安装新审核源码 |
| systemd service | sanq-backup.service，User=ubuntu | 原 service 名/身份，日志转 journal |
| timer | sanq-backup.timer | 保持现有约 03:30 Toronto 规则，不改 timer |
| sudoers | /etc/sudoers.d/sanq-backup | **原规则不变** |
| PostgreSQL volume | sanq-app_pgdata | **不变，禁止复制、DROP、初始化** |
| Compose project | sanq-app | **不变** |
| sounds | /home/ubuntu/sanq-assets/sounds | **不变** |

所有 C3-B 模板使用固定绝对路径，不从环境变量接收可写目录。
不能仅安装新版主脚本或 helper，更不能在旧 Compose / 旧 uploads
挂载仍然运行时启用新版备份任务。

## C4-P2-C 审批前证据（历史门禁，缺一项 BLOCKED）

1. 核实生产 systemd unit/timer、sudoers/helper、rclone、最后备份成功时间；确认计划不与 03:30 定时任务冲突。
2. 独立异机验证数据库、配置、TLS 和 uploads 恢复；不仅仅做 gzip 完整性检测。
3. 核实 Docker Compose 项目 sanq-app 和原 PostgreSQL 数据卷 sanq-app_pgdata 保持不变。
4. /opt、/opt/sanq、/opt/sanq/runtime、/srv、/srv/sanq 均由 root 拥有、不可被普通用户组/其他用户写入；/srv/sanq/backups 由 ubuntu 拥有且为 0700；.env 仅属主可读。绝不使用 symlink 替代目录。还需明确：C4 完成核验后由 root 创建仅属主可写的非敏感激活标记 /opt/sanq/runtime/.sanq-backup-layout-activated，其内容仅为 SANQ_BACKUP_LAYOUT_C4_V1。**预备目录期间绝不创建激活标记。**
5. 核实 API、Uber worker 和备份任务均可读写各自需要的 uploads 文件；首先两遍校验文件清单、大小及 SHA256，再进入无写入窗口执行最终差量复制。
6. 保留旧 .env、Compose、旧 uploads、备份脚本、service、helper 和 sudoers 原件，明确失败的恢复顺序及数据一致性时间点。
7. 使用与镜像 source SHA 一致、拥有独立 GitHub Archive SHA256 发布证明的 Runtime 包，核对固定 17 文件白名单及其中匹配版本的四份 ops/backup 文件，并获得实际生产切换授权。最新 C5-B1/B2 控制器已不依赖 VM 本地 Git checkout 做文件对照：首次安装必须验证独立的 Archive 证明和配对镜像 Digest；安装后 `runtime_manifest()` 必须对 root-owned Manifest 和 `SOURCE_FILES` 的文件大小/SHA256 逐项核对，`verify_runtime_release()` 还会在普通镜像升级时阻断 Runtime 清单文件变更。详细安装/恢复门禁参见 C4-P2-A 人工安装手册。必须保证备份主脚本继续以 ubuntu 执行。执行 deploy/rollback --execute 的管理员需 root 权限（新 Runtime 目录由 root 持有；操作本身仍需要单独审批，且控制器不调用 sudo）。

## 受控 C4 顺序（历史执行合同，非可重跑命令）

1. 获得**独立的生产切换授权**，核实备份任务未在运行，然后暂停备份 timer 并保存其原始状态。
2. 按 C4-P2-A 人工安装手册独立验证可信 Runtime Archive、暂存并准备 root-owned 真实目录；保留固定 17 文件白名单和原生产目录。首次安装暂不创建 C4 激活标记、不启动新 Compose。独立校验复制后的运行配置。绝不从空 uploads 路径运行 rclone sync 到远端 uploads-current。
3. 首轮和差量文件复制后，暂停新 uploads 写入；最终同步、核对文件与数据库引用，确保 API 和 Uber worker 使用相同的新路径。
4. 固定 Compose project sanq-app 和原 PG volume，受控更新应用挂载和 Runtime 配置，确认 docker inspect 的真实 DB Mount.Name 为 sanq-app_pgdata，api/ubereats-worker Mount.Source 均为 /srv/sanq/uploads，然后从固定 Runtime 路径执行只读健康检查。不能只验证 Compose 文本；不允许创建新数据卷。
5. 在 timer 仍暂停时，成组安装新版主脚本、root helper、service，保持窄权限 sudoers；核查新脚本和 helper 的本地目标目录一致，确认已安装代码与获审源码一致。在独立恢复、uploads 一致性和数据卷核验全部完成后，才由 root 创建 0644 或更严格的激活标记（ubuntu 必须可以读取）。标记并不代表完成自动授权，必须仍持有 C4 审批记录。
6. 在新目录及备份完整性验证完成后，运行已获授权的备份验证；独立验证远端 gdrive_backup / gdrive_secure 中的加密和可恢复性。日志从 journalctl -u sanq-backup.service 查询。
7. 所有检查通过后恢复原 timer。保留旧目录和回滚副本直至 C5 独立审计完成。

## 失败处理与回滚

- 若切换前失败，恢复原 timer，原服务与数据路径不变。
- 若切换后验证失败，先暂停新写入和备份，审阅两边数据差异；移走 C4 激活标记以阻断新备份任务，再成组恢复旧 Compose、uploads 路径及匹配的旧主脚本、旧 helper、旧 service。不得自动 DROP 或恢复旧数据库卷。
- 新 helper 在 root 私有临时目录中制作并上传加密 Nginx/TLS 归档，再移动本地 root:root 0600 副本。由于本地备份目录属于 ubuntu，该目录所有者仍可能删除或替换归档目录项；独立恢复过的远端加密副本才是最终可信恢复证据。
- 新系统备份日志在 systemd journal；旧 backup.log 留在旧目录，保留为历史审计证据。
- 不删原 main Git checkout，不改 Prisma migrations，也不触碰 provider 正式生产配置。

## 源码级验证

既有 GitHub API CI 运行 bash -n 检查和 ops/backup/tests、ops/runtime/tests 中的 Python 离线用例。本地审阅阶段按 AGENTS.md 不执行这些测试，远端后以 GitHub CI 为准。

## 2026-10-09 C4-P2-C 生产切换验收（已完成）

以下是操作者逐门禁执行后提供的生产输出及 VM MCP 只读复核证据，属于**实际已完成**的变更，而不是待执行命令：

| 门禁 | 已观察到的证据 | 结论 |
| --- | --- | --- |
| P2-A / P2-B 准备 | 可信 Runtime 17/17 Manifest、root-owned 安装；旧 Uploads 首轮复制与 DB 引用、homepage、Uber artifact 对照通过；历史 off-VM restore 有证据 | PREPARED / verified pre-cutover evidence |
| Gate 0 / 1 | 旧 `.env` 一致、运行 SHA 一致、DB volume 一致；回退快照已创建并通过逐文件 `cmp`；timer 暂停；web/worker 正常停止；API 停止超时 Exit 137（OOMKilled=false），需保留审计记录 | PASS，API 非正常停机为 follow-up 观察项 |
| Gate 2A | Final rsync 未转移文件；新旧 87 regular files / 8 directories / 136,154,899 bytes；missing=extra=SHA256 mismatch=0；目标 symlink/宽松写权限=0 | PASS |
| Gate 2B | `sanqin_db_20261008_073026.sql.gz` 复制到 `/srv/sanq/backups`；3,311,347 bytes，gzip 双向验证及 SHA256 MATCH，ubuntu:ubuntu 0600 | PASS |
| Gate 3 | 仅 force-recreate api、ubereats-worker、web；三应用沿用 SHA `a84b72007e6b4e82c981101e56c897355757c0ff`；db container ID 未改变；实际挂载 api/worker 为 `/srv/sanq/uploads`；DB volume `sanq-app_pgdata` | PASS |
| Gate 4 | 新备份主脚本、privileged helper、systemd service 与已安装 Runtime 对应源码 `cmp` 一致；sudoers 原样保留且解析通过；`User=ubuntu`、journal logging | PASS |
| Gate 5A | root:root 0644 激活标记内容 `SANQ_BACKUP_LAYOUT_C4_V1`；readiness 完成，Prisma 204 migrations up to date；本地 API/Worker/Web、公网 Web/BFF/menu smoke 通过 | PASS |
| Gate 5B | 手动备份 2026-10-09 03:37:55–03:39:55 UTC，`Result=success` / `ExecMainStatus=0`；数据库日备、月备、config、Nginx/TLS、uploads sync 及 retention 成功 | PASS |
| Gate 5C | `20261009_033755` 同批次每日 DB、月度 DB、secure config、secure Nginx/TLS 远端解密流与本地 SHA256 MATCH；归档成员齐备；rclone `--download` 87 matching、0 differences | PASS |
| Gate 6 | `sanq-backup.timer` `active/enabled`，next `2026-10-09 07:30 UTC`（03:30 Toronto）；Backup Service success，4/4 containers healthy；`GATE 6 FINAL VERIFICATION: PASS` | PASS / P2-C COMPLETED |

- **权威生产路径**：`/opt/sanq/runtime`、`/srv/sanq/uploads`、`/srv/sanq/backups`；备份 main script 路径仍为 `/home/ubuntu/backup-db.sh`，日志改为 `journalctl -u sanq-backup.service`。
- **身份保持**：Compose `sanq-app`、PostgreSQL volume `sanq-app_pgdata`、原 40 位镜像 SHA 未变；无 Prisma schema/migration、业务 API、provider 配置改动。
- **回退资产不可删除**：旧 `/home/ubuntu/sanq-app` 源码/Uploads/Backups，及 root 私有快照 `/opt/sanq/.c4-p2c-rollback.EnD7i3No`（含旧 Compose、env、主脚本、helper、unit、sudoers）。旧 Uploads 在 Gate 3 重新开启写入后不再保证与新目录一致；任何回退必须先停止新写入，核对并保全差量，禁止直接用旧数据覆盖。
- **验证边界**：首次备份的远端下载式 SHA256 对照**不等于**基于 `20261009_033755` 的独立 clean restore；历史 2026-10-01/02 异机恢复验证属于**切换前版本/布局**；新布局恢复、下一次定时任务及业务流程实测均留给 P2-D。
- **状态**：`C4-P2-C PRODUCTION CUTOVER COMPLETED`；`C4-P2-D PENDING`。未经 P2-D 实测与证据验收不得关闭整个 C4。详见 `runtime-backup-cutover-c4p2d-acceptance.zh-CN.md`。
