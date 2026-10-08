# C3-B / C4 备份路径切换准备清单（尚未获生产授权）

状态：**仅供源码审阅及后续 C4 审批使用，禁止直接在生产 VM 执行切换。**
C3-B 仅准备方案 B 的新源码模板，不改变已验证的生产备份/恢复合同。

## 新旧配置必须成组切换

| 资源 | 当前生产 | C4 目标 |
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

## C4 审批前证据（缺一项 BLOCKED）

1. 核实生产 systemd unit/timer、sudoers/helper、rclone、最后备份成功时间；确认计划不与 03:30 定时任务冲突。
2. 独立异机验证数据库、配置、TLS 和 uploads 恢复；不仅仅做 gzip 完整性检测。
3. 核实 Docker Compose 项目 sanq-app 和原 PostgreSQL 数据卷 sanq-app_pgdata 保持不变。
4. /opt、/opt/sanq、/opt/sanq/runtime、/srv、/srv/sanq 均由 root 拥有、不可被普通用户组/其他用户写入；/srv/sanq/backups 由 ubuntu 拥有且为 0700；.env 仅属主可读。绝不使用 symlink 替代目录。还需明确：C4 完成核验后由 root 创建仅属主可写的非敏感激活标记 /opt/sanq/runtime/.sanq-backup-layout-activated，其内容仅为 SANQ_BACKUP_LAYOUT_C4_V1。**预备目录期间绝不创建激活标记。**
5. 核实 API、Uber worker 和备份任务均可读写各自需要的 uploads 文件；首先两遍校验文件清单、大小及 SHA256，再进入无写入窗口执行最终差量复制。
6. 保留旧 .env、Compose、旧 uploads、备份脚本、service、helper 和 sudoers 原件，明确失败的恢复顺序及数据一致性时间点。
7. 使用与镜像 source SHA 一致的 Runtime 包，核对其中匹配版本的四份 ops/backup 文件，并获得实际生产切换授权。

## 受控 C4 顺序（非执行命令）

1. 获得**独立的生产切换授权**，核实备份任务未在运行，然后暂停备份 timer 并保存其原始状态。
2. 原生产目录保持可恢复；预备目标目录和权限，独立校验复制后的运行配置。绝不从空 uploads 路径运行 rclone sync 到远端 uploads-current。
3. 首轮和差量文件复制后，暂停新 uploads 写入；最终同步、核对文件与数据库引用，确保 API 和 Uber worker 使用相同的新路径。
4. 固定 Compose project sanq-app 和原 PG volume，受控更新应用挂载和 Runtime 配置，执行只读健康检查。
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
