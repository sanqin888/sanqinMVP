# SanQ 备份恢复手册

> **C4-P2-C 生产状态（2026-10-09 UTC）：**已按独立授权完成方案 B 路径切换：
> Runtime = `/opt/sanq/runtime`，Uploads = `/srv/sanq/uploads`，
> Backups = `/srv/sanq/backups`。备份 service 仍以 ubuntu 用户运行，
> main script 仍位于 `/home/ubuntu/backup-db.sh`，**当前日志以 systemd journal 为准**。
> 本文旧布局安装、旧日志或普通 `docker compose` 的片段属于历史示例，
> **不可直接在生产重跑**。P2-C 验收见
> `docs/runbooks/runtime-backup-cutover-c4-prep.zh-CN.md`；独立恢复及业务实测仍在
> `docs/runbooks/runtime-backup-cutover-c4p2d-acceptance.zh-CN.md`（P2-D PENDING）。

> 对应英文运维合同：`docs/runbooks/backup-recovery.md`  
> 当前状态：Post-Modularization §3.2 Backup / Recovery Drill 已于 2026-10-02 **PRODUCTION VERIFIED / CLOSED**。  
> 本手册面向实际运维人员，说明“备份在哪里、如何判断备份正常、服务器损坏后如何安全恢复、什么时候可以重新开放业务”。

## 1. 最重要的原则

1. **恢复必须先在安全的非生产目标验证，再激活生产。**
2. **不要在数据库、文件、配置尚未完成一致性检查前启动 provider/background worker。**
3. **UberEats worker 等后台处理进程最后启动。**
4. **不要把 `.env`、rclone crypt 密码/盐、OAuth token、TLS 私钥内容粘贴到聊天、工单、CI 日志或仓库。**
5. **不要使用 `prisma migrate reset`、`prisma db push` 或其他绕过迁移历史的方式“快速恢复”。**
6. **`uploads-history` 不是所有历史文件的永久档案。** 一个文件如果在两次定时同步之间创建又删除，它从未进入远端 `uploads-current`，因此也不会出现在 history。
7. **整套备份不是原子快照。** DB、配置、Nginx/SSL、uploads 在同一次任务中按顺序生成，恢复后必须做跨资源完整性检查。
8. 如恢复过程中出现不确定状态，优先停止在“隔离验证”阶段，不要为了尽快上线跳过检查。

## 2. 当前备份结构

### 2.1 普通备份远端：`gdrive_backup:`

| 内容 | 路径 | 当前策略 |
| --- | --- | --- |
| PostgreSQL 每日逻辑备份 | `sanqin-backups/database-daily` | 保留 30 天 |
| PostgreSQL 月度快照 | `sanqin-backups/database-monthly` | 当月覆盖更新，保留 7 年 |
| 当前 uploads 镜像 | `sanqin-backups/uploads-current` | 当前镜像 |
| uploads 历史变更 | `sanqin-backups/uploads-history/<timestamp>` | 保留 30 天 |
| MessagingSend 独立归档 | `sanqin-archives/messaging` | 独立归档 |

### 2.2 加密备份远端：`gdrive_secure:`

| 内容 | 路径 | 当前策略 |
| --- | --- | --- |
| `.env` + `docker-compose.yml` | `config` | 保留 30 天 |
| Nginx / SSL | `nginx` | 保留 30 天 |
| 验证产物目录 | `verification` | 预留 |

`gdrive_secure:` 由 rclone crypt 加密。**恢复 crypt 配置本身不能依赖已经损坏的生产 VM。**

当前已验证存在一份独立于生产 VM 的 AES-256 加密 off-VM escrow；恢复演练证明从该 escrow 取出的 rclone 配置与原配置 byte-for-byte 一致，并可以正常解密 `gdrive_secure:`。

## 3. 生产备份任务结构

主任务：

- systemd service：`sanq-backup.service`
- systemd timer：`sanq-backup.timer`
- 主脚本：`/home/ubuntu/backup-db.sh`
- 主任务用户：`ubuntu`

受保护的 Nginx / SSL 备份：

- privileged helper：`/usr/local/sbin/sanq-backup-protected-nginx`
- sudoers：`/etc/sudoers.d/sanq-backup`
- helper 只接受 `sanqin_nginx_<timestamp>.tar.gz`
- helper 固定读取 `/etc/nginx` / `/etc/ssl` 并上传到 `gdrive_secure:nginx`

必须存在的五个 Nginx/TLS 成员：

```text
nginx/nginx.conf
nginx/sites-available/sanq-api.conf
nginx/sites-available/sanq-web.conf
nginx/certs/cf-origin.pem
nginx/certs/cf-origin.key
```

其中 `cf-origin.key` 必须保持受保护状态；当前生产中该文件为 root-only 私钥，不能为了方便备份而放宽为普通用户可读。

## 4. 备份程序升级 / 覆盖

**历史操作记录，禁止直接执行：**本节保留的是 C4-P2-C 之前的安装/回滚示例。
生产已完成 C4-P2-C；后续变更必须使用可信 Runtime、当前配置和独立审核的
变更/回滚计划，不能从旧 checkout 直接重装或移除当前 helper/sudoers。

仓库中的 reviewed source of truth：

```text
ops/backup/backup-db.sh
ops/backup/sanq-backup-protected-nginx
ops/backup/sanq-backup.service
ops/backup/sanq-backup.sudoers
```

生产更新时，不要只覆盖 `backup-db.sh`。新版主脚本依赖 protected helper 和 narrow sudoers。

从已部署、已审核的仓库 commit 执行，先保留 rollback：

```bash
cd /home/ubuntu/sanq-app

stamp="$(date +%Y%m%d_%H%M%S)"

cp -a /home/ubuntu/backup-db.sh \
  "/home/ubuntu/backup-db.sh.pre-${stamp}"

sudo cp -a /etc/systemd/system/sanq-backup.service \
  "/etc/systemd/system/sanq-backup.service.pre-${stamp}"
```

安装 helper，并在安装 sudoers 前先验证语法：

```bash
sudo install -o root -g root -m 0755 \
  ops/backup/sanq-backup-protected-nginx \
  /usr/local/sbin/sanq-backup-protected-nginx

sudo visudo -cf ops/backup/sanq-backup.sudoers

sudo install -o root -g root -m 0440 \
  ops/backup/sanq-backup.sudoers \
  /etc/sudoers.d/sanq-backup
```

覆盖主脚本和 service：

```bash
sudo install -o ubuntu -g ubuntu -m 0750 \
  ops/backup/backup-db.sh \
  /home/ubuntu/backup-db.sh

sudo install -o root -g root -m 0644 \
  ops/backup/sanq-backup.service \
  /etc/systemd/system/sanq-backup.service

sudo systemctl daemon-reload
```

除非有单独审核的 timer 变更，**不要因为升级 backup hardening 而替换 `sanq-backup.timer`**。

安装后先做 source parity / sudoers / service / timer 检查，再等待或执行已批准的验证流程。

如果部署验证失败，先恢复主脚本和 service，再移除新的 sudoers/helper：

```bash
cp -a "/home/ubuntu/backup-db.sh.pre-<stamp>" \
  /home/ubuntu/backup-db.sh

sudo cp -a \
  "/etc/systemd/system/sanq-backup.service.pre-<stamp>" \
  /etc/systemd/system/sanq-backup.service

sudo systemctl daemon-reload

sudo rm -f /etc/sudoers.d/sanq-backup
sudo rm -f /usr/local/sbin/sanq-backup-protected-nginx
```

回滚 backup implementation 时，**不要删除回滚前后已经产生的远端备份对象**。

## 5. 日常如何确认备份正常

### 5.1 查看 timer

```bash
SYSTEMD_PAGER=cat systemctl status sanq-backup.timer --no-pager -l
```

正常应看到：

```text
Active: active (waiting)
```

当前运维语义是每天 **03:30 Toronto time**。2026-10-02 的实际 systemd trigger 为 07:30 UTC。

### 5.2 查看最近一次 service 结果

```bash
SYSTEMD_PAGER=cat systemctl show sanq-backup.service \
  -p Result \
  -p ExecMainCode \
  -p ExecMainStatus \
  -p ExecMainStartTimestamp \
  -p ExecMainExitTimestamp
```

健康成功的核心判断是：

```text
Result=success
ExecMainStatus=0
```

不要仅根据日志中某一条“成功”文字判断整批备份是否成功。

### 5.3 查看备份日志（C4 切换后的当前生产合同）

```bash
sudo journalctl -u sanq-backup.service -n 150 --no-pager -o cat
```

检查最近批次必须**同时**依据 `systemctl show` 的 `Result=success`、
`ExecMainStatus=0` 和同一次 journal 的最终成功行；不把旧批次成功误认作新批次。
旧 `/home/ubuntu/sanq-app/backup.log` 仅为 C4 之前的历史审计文件，
不能用来判断 2026-10-09 以后的新布局计划备份是否成功。
新版脚本只有所有要求任务都没有失败时才以 0 退出。

### 5.4 查看最近远端对象

```bash
rclone lsf "gdrive_backup:sanqin-backups/database-daily" | tail -n 5
rclone lsf "gdrive_secure:config" | tail -n 5
rclone lsf "gdrive_secure:nginx" | tail -n 5
```

这里主要用于确认时间戳连续性，不替代恢复验证。

## 6. 灾难恢复前的准备

假设原生产 VM 已不可用，先准备一个新的、隔离的恢复环境。

### 6.1 不要先启动完整业务

先取得经过审核的代码版本，但不要直接执行会启动所有容器的命令。

恢复初期原则：

```text
PostgreSQL：可以先在隔离环境恢复
API：数据库和文件验证后再启动
Web：API 正常后再启动
UberEats / provider/background worker：最后启动
```

### 6.2 准备恢复目录

示例：

```bash
RECOVERY_ROOT="$HOME/sanq-recovery"
mkdir -p "$RECOVERY_ROOT"/{database,config,nginx,uploads-current,uploads-history}
chmod 700 "$RECOVERY_ROOT"
```

### 6.3 从 off-VM escrow 恢复 rclone crypt 配置

将 escrow 中的配置复制到临时恢复路径，权限必须为 600。下面的
`/path/from/escrow/rclone-prod.conf` 代表已经从独立加密 escrow 挂载/解锁出来的文件，
不要把 escrow 密码写进命令或仓库：

```bash
RCLONE_CONFIG="$RECOVERY_ROOT/rclone.conf"

install -m 600 \
  /path/from/escrow/rclone-prod.conf \
  "$RCLONE_CONFIG"
```

先验证 remote：

```bash
rclone --config "$RCLONE_CONFIG" listremotes
rclone --config "$RCLONE_CONFIG" lsf "gdrive_secure:" --max-depth 1
```

正常应至少看到：

```text
gdrive_backup:
gdrive_secure:
```

以及：

```text
config/
nginx/
verification/
```

如果无法解密 `gdrive_secure:`，**停止恢复，不要继续猜测 crypt password/salt。**

## 7. 选择恢复点

先列出最近的备份：

```bash
rclone --config "$RCLONE_CONFIG" \
  lsf "gdrive_backup:sanqin-backups/database-daily"

rclone --config "$RCLONE_CONFIG" \
  lsf "gdrive_secure:config"

rclone --config "$RCLONE_CONFIG" \
  lsf "gdrive_secure:nginx"
```

优先选择**最近一次明确成功的 scheduled backup run**，尽量使用同一批次时间戳的：

- `sanqin_db_<timestamp>.sql.gz`
- `sanqin_config_<timestamp>.tar.gz`
- `sanqin_nginx_<timestamp>.tar.gz`

`uploads-current` 没有单个时间戳文件，它反映最近一次成功 sync 后的远端镜像。

### 7.1 一致性限制

同一批次也不是数据库事务意义上的全系统原子快照。当前任务顺序是：

```text
Messaging archive
→ PostgreSQL dump
→ project config
→ protected Nginx/SSL
→ uploads-current sync
→ retention cleanup
```

因此恢复后必须执行第 11 节的完整性检查。

## 8. 先恢复并验证受保护配置

假设选择：

```bash
CONFIG_ARCHIVE="sanqin_config_<timestamp>.tar.gz"
NGINX_ARCHIVE="sanqin_nginx_<timestamp>.tar.gz"
```

下载到隔离目录：

```bash
rclone --config "$RCLONE_CONFIG" copyto \
  "gdrive_secure:config/$CONFIG_ARCHIVE" \
  "$RECOVERY_ROOT/config/$CONFIG_ARCHIVE"

rclone --config "$RCLONE_CONFIG" copyto \
  "gdrive_secure:nginx/$NGINX_ARCHIVE" \
  "$RECOVERY_ROOT/nginx/$NGINX_ARCHIVE"
```

先做 gzip 完整性：

```bash
gzip -t "$RECOVERY_ROOT/config/$CONFIG_ARCHIVE"
gzip -t "$RECOVERY_ROOT/nginx/$NGINX_ARCHIVE"
```

列成员，不要输出任何 secret 内容：

```bash
tar -tzf "$RECOVERY_ROOT/config/$CONFIG_ARCHIVE"
tar -tzf "$RECOVERY_ROOT/nginx/$NGINX_ARCHIVE"
```

项目配置 archive 必须至少有：

```text
.env
docker-compose.yml
```

Nginx archive 必须有：

```text
nginx/nginx.conf
nginx/sites-available/sanq-api.conf
nginx/sites-available/sanq-web.conf
nginx/certs/cf-origin.pem
nginx/certs/cf-origin.key
```

### 8.1 先解压到 quarantine，不要直接覆盖系统

```bash
mkdir -p "$RECOVERY_ROOT/config/extracted" "$RECOVERY_ROOT/nginx/extracted"

tar -xzf "$RECOVERY_ROOT/config/$CONFIG_ARCHIVE" \
  -C "$RECOVERY_ROOT/config/extracted"

tar -xzf "$RECOVERY_ROOT/nginx/$NGINX_ARCHIVE" \
  -C "$RECOVERY_ROOT/nginx/extracted"
```

检查路径、文件大小、权限和结构。不要 `cat .env`，不要 `cat cf-origin.key`。

## 9. PostgreSQL 恢复：先做隔离恢复

下载数据库：

```bash
DB_ARCHIVE="sanqin_db_<timestamp>.sql.gz"

rclone --config "$RCLONE_CONFIG" copyto \
  "gdrive_backup:sanqin-backups/database-daily/$DB_ARCHIVE" \
  "$RECOVERY_ROOT/database/$DB_ARCHIVE"

gzip -t "$RECOVERY_ROOT/database/$DB_ARCHIVE"
```

### 9.1 已验证的恢复方式

2026-10-01 演练使用的是 PostgreSQL plain-SQL logical dump。安全恢复目标必须是**新建的非生产数据库**。

通用形式：

```bash
createdb sanqin_recovery_drill

gunzip -c "$RECOVERY_ROOT/database/$DB_ARCHIVE" \
  | psql -v ON_ERROR_STOP=1 -d sanqin_recovery_drill
```

如果 dump 引用了目标环境不存在的 role，先确认 role 名称。隔离演练可以建立 recovery-only `NOLOGIN` 占位 role；不要在生产恢复时盲目创建权限角色。

不要用：

```text
prisma migrate reset
prisma db push
```

来代替真实备份恢复。

### 9.2 版本说明

2026-10-01 实测：

- source PostgreSQL：15.15
- source pg_dump：15.15
- isolated recovery PostgreSQL：17.8
- plain SQL logical restore：PASS

这证明了当次向前 logical restore 可行，但今后的 PostgreSQL 大版本变化仍应重新验证，不应永久假设兼容。

## 10. 恢复 uploads

### 10.1 恢复当前 uploads

在空的恢复目录中：

```bash
rclone --config "$RCLONE_CONFIG" copy \
  "gdrive_backup:sanqin-backups/uploads-current" \
  "$RECOVERY_ROOT/uploads-current"
```

先恢复到隔离目录，再决定何时激活到应用的 `uploads` 路径。

### 10.2 uploads-history 只能隔离恢复

如需要历史文件：

```bash
rclone --config "$RCLONE_CONFIG" lsf \
  "gdrive_backup:sanqin-backups/uploads-history" --dirs-only
```

选择具体历史批次：

```bash
HISTORY_STAMP="<timestamp>"

rclone --config "$RCLONE_CONFIG" copy \
  "gdrive_backup:sanqin-backups/uploads-history/$HISTORY_STAMP" \
  "$RECOVERY_ROOT/uploads-history/$HISTORY_STAMP"
```

**禁止把整个 uploads-history 直接覆盖到 active uploads。**

history 中的文件只作为历史版本/调查/定向补回来源。

## 11. 恢复后的完整性检查

业务重新开放前，至少完成以下检查。

### 11.1 数据库

记录并比较：

- dump gzip integrity
- restore exit code
- `_prisma_migrations` 总数
- unresolved migration 数
- latest migration
- 关键业务表 row counts
- Accounting active Journal 是否全部平衡

2026-10-01 drill 的基线检查覆盖了：

- `AccountingExpenseDocument`
- `AccountingJournalEntry`
- `AccountingJournalLine`
- `AccountingSourceArtifact`
- `Order`
- `PaymentTransaction`
- `UberFinancialReport`
- `_prisma_migrations`

不要把旧演练数字硬编码成未来恢复的正确值。未来恢复应以**该恢复点记录的生产基线**比较。

### 11.2 Accounting 文件

对数据库中有 binary 引用的 Accounting artifact 检查：

- 路径是否有效
- 文件是否存在
- size 是否一致
- 有 SHA-256 时是否一致
- `COMPRESSED_ONLY` 是否正确指向保留 derivative

不要因为原始文件不存在就自动判失败；如果 retention policy 已明确转为 `COMPRESSED_ONLY`，应验证 retained derivative。

### 11.3 Homepage / Menu 图片

检查：

- homepage JSON 可解析
- version 正确
- zh/en 数据存在
- featured slots 正常
- DB + homepage 所引用的 `/uploads/images/` 文件存在且非空

### 11.4 uploads-current manifest

建议对恢复后的 uploads 生成 SHA-256 manifest 保存为恢复证据，不要把包含 secret 的文件内容写入证据。

### 11.5 Nginx / TLS

再次确认五个强制 member 存在，尤其：

```text
nginx/certs/cf-origin.pem
nginx/certs/cf-origin.key
```

**只验证 member、大小、权限，不打印私钥内容。**

## 12. 激活配置和系统文件

只有第 11 节通过后，才将 quarantine 中的内容激活。

### 12.1 应用配置

恢复：

- `.env`
- `docker-compose.yml`

`.env` 必须保持严格权限，不要提交 Git。

### 12.2 Nginx / SSL

在替换任何已有系统文件前先保留旧版本。恢复后先检查：

```bash
sudo nginx -t
```

必须 PASS 后才允许 reload Nginx。

确认私钥权限仍然受保护，例如：

```bash
sudo stat /etc/nginx/certs/cf-origin.key
```

不要为了让普通用户读取私钥而 `chmod 644`。

## 13. 服务启动顺序

恢复后的推荐顺序：

```text
1. PostgreSQL
2. API
3. Web
4. provider/background worker 最后启动
5. 全部 readiness/smoke 通过后，最后恢复 external traffic
```

Nginx 配置可以在前一节完成 `nginx -t` 后安装/reload，但“重新开放外部流量”必须晚于 worker readiness 和最终日志检查。

Compose 环境可分阶段启动：

```bash
docker compose up -d db
docker compose ps db

docker compose up -d api
docker compose ps api

docker compose up -d web
docker compose ps web
```

确认前三者 healthy 后，最后再启动：

```bash
docker compose up -d ubereats-worker
docker compose ps ubereats-worker
```

之所以最后启动 worker，是为了避免在数据库/文件/配置尚未确认一致时重放 durable work 或调用外部 provider。

## 14. 恢复后的 smoke / readiness

至少检查：

```bash
docker compose ps
```

并检查：

- PostgreSQL healthy
- API `/api/v1/ready` 正常
- Web `/health` 正常
- worker `/ready` 正常
- Nginx 配置验证通过
- 最近 API/Web/worker 日志没有新的持续性 error loop

不要仅以“容器 Up”作为恢复完成依据。

## 15. 什么时候可以重新开放业务

只有以下条件全部满足才能重新开放正常流量：

- 选择的 DB backup gzip PASS
- DB clean restore PASS
- migration state 合理
- 关键 row counts / invariants PASS
- Accounting Journals 平衡
- uploads-current 已恢复
- DB 文件引用和 uploads integrity PASS
- project config 已恢复且验证
- Nginx archive 含证书和私钥
- Nginx `nginx -t` PASS
- API / Web ready
- worker 在最后启动后 ready
- 日志没有持续错误
- 已记录本次恢复点和异常/限制

## 16. RPO / RTO 应如何理解

### 16.1 RPO

当前备份 cadence 是每天 03:30 Toronto time，但这**不是一个正式保证“最多只丢 24 小时数据”的 SLO**。

原因：

- 某次 scheduled run 可能失败；
- DB/config/Nginx/uploads 不是原子快照；
- `uploads-history` 不记录两次 sync 之间从未到达远端的短生命周期文件。

实际恢复时，应以“最近一次已确认成功的 backup run”为 recovery point。

### 16.2 RTO

目前**没有正式 end-to-end RTO SLO**。

2026-10-01 / 10-02 已证明：

- DB 可以独立恢复
- uploads-current/history 可以取回
- secure config 可以跨机器解密
- Nginx/SSL 私钥可以从备份独立恢复
- 正常 scheduled backup 链路可以完整成功

但尚未对“全新主机从零恢复直到重新开放生产流量”的完整过程计时，因此不能声称例如“X 分钟内恢复”。

## 17. 当前已经验证过的生产证据

### 17.1 2026-10-01 isolated recovery drill

通过：

- PostgreSQL logical restore
- migration/count/Journal checks
- uploads-current DB/file/hash checks
- uploads-history 独立恢复
- `gdrive_secure:` 跨主机解密
- project config archive 恢复

并发现旧 Nginx backup 漏掉 `cf-origin.key` 的真实 blocker。

### 17.2 Backup hardening

PR #2641：

- merge：`52dfced9`
- CI：#6726 GREEN
- main backup service 保持 `User=ubuntu`
- root 权限只收缩在固定 Nginx helper

### 17.3 私钥恢复验证

手动生产 archive：

```text
sanqin_nginx_20261001_214230.tar.gz
```

在非生产 Mac 上通过独立下载验证：

- gzip integrity PASS
- 五个 mandatory members 全部 PASS
- `nginx/certs/cf-origin.key` PASS
- 临时 archive 和临时明文 rclone config 已清理

### 17.4 off-VM crypt escrow

AES-256 加密 escrow 已做 round-trip：

- 原始/恢复配置 hash 一致
- byte-for-byte parity PASS
- `gdrive_backup:` 可见
- `gdrive_secure:` 可见
- secure remote 可解密

### 17.5 正常 timer 全链路

2026-10-02：

```text
start: 07:30:34 UTC
exit:  07:31:46 UTC
Result=success
ExecMainStatus=0
failure marker: NONE
protected archive: sanqin_nginx_20261002_073034.tar.gz
```

因此 Post-Modularization §3.2 Backup / Recovery Drill 当前状态为：

> **PRODUCTION VERIFIED / CLOSED**

## 18. 恢复结束后的敏感文件清理

恢复机上为了验证临时复制出的敏感文件必须清理或重新进入受保护存储，包括：

- 临时 rclone config
- 临时解密后的 project config
- 临时解密后的 Nginx/SSL archive
- 不再需要的恢复目录中的 `.env`
- 任何临时 TLS private key 副本

清理前确认正式恢复位置和证据已经完成，不要误删唯一有效副本。

off-VM escrow 本身**不要删除**，并继续保持其密码与加密文件分开保存。
