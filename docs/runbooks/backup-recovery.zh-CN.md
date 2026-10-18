# SanQ 备份恢复手册

> **R0 已批准设计 / 尚未部署（2026-10-17 Toronto）：**[R0 冻结设计](../architecture/Runtime更新-R0冻结设计.md) 与 [Recovery Kit 合同](../architecture/c5-u2d-abort-clean-reinstall-recovery-kit-2026-10-11.md) 已冻结 D1–D5。首次 Runtime 更新前必须有完整独立解密读回的 mandatory preinstall Kit、现役日常备份健康和独立 DR 可用性；新增 S2 daily protected-state helper/扩充/接线/sudoers 在 v1/C5 验收后，不能形成循环前置。现役 timer 不因 S2 PAUSED 停止。历史已记录 daily 配置包仅含 `.env` + `docker-compose.yml`，本次未重新检查主机；S1 五文件 snapshot 不代表已上线。C5-G2 NO-GO；新权限/安装/生产操作仍需精确审阅和授权。

> **C4-P2-C 生产状态（2026-10-09 UTC）：**已按独立授权完成方案 B 路径切换：
> Runtime = `/opt/sanq/runtime`，Uploads = `/srv/sanq/uploads`，
> Backups = `/srv/sanq/backups`。备份 service 仍以 ubuntu 用户运行，
> main script 仍位于 `/home/ubuntu/backup-db.sh`，**当前日志以 systemd journal 为准**。
> 本文旧布局安装、旧日志或普通 `docker compose` 的片段属于历史示例，
> **不可直接在生产重跑**。P2-C 验收见
> `docs/runbooks/runtime-backup-cutover-c4-prep.zh-CN.md`；独立恢复及业务实测仍在
> `docs/runbooks/runtime-backup-cutover-c4p2d-acceptance.zh-CN.md`（P2-D 有限范围证据验收完成；离机 roles 已捕获在加密 DMG，正式关闭待文档审阅、dev PR/CI 合并）。

> **2026-10-18 Runtime C2 生产式恢复演练附录：**参见本文附录 A《Lightsail 灾难恢复：新实例替换演练与生产门禁（草案）》。目前仅 VirtualBox 指定快照新实例克隆/Ubuntu 启动/Host-only 合成服务接管及证据下载 SHA 核对由操作员报告完成；尚未在 Lightsail 实测实例/数据库/Cloudflare/Static IP/供应商。该附录不覆盖本手册现行备份和生产数据恢复合同，也不替代 R0 C2-02 的真实 snapshot restore；C5-G2 NO-GO。
>
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

**跨平台注意（2026-10-09 实测）：** SanQ 的 Nginx 归档可能包含 Linux `/etc/nginx/sites-enabled`、`modules-enabled` 和 `ssl/certs` 等目录下的绝对目标 symlink。先用 `tar -tzf` / `tar -tvzf` 核查成员类型、路径穿越和链接目标，不能仅凭 gzip 完整性就对陌生设备执行全量解包。

在同版本 Ubuntu 隔离主机且确认目标安全时，可将备份解包到新建的私有 quarantine，再按受控流程恢复系统链接。**MacBook 等非 Linux 环境**应优先从归档中只提取必须的普通文件到私有隔离目录；例如：

```bash
umask 077
mkdir -p "$RECOVERY_ROOT/config/extracted" \
  "$RECOVERY_ROOT/nginx/essential/nginx/certs"

tar -xOzf "$RECOVERY_ROOT/config/$CONFIG_ARCHIVE" .env \
  > "$RECOVERY_ROOT/config/extracted/.env"

tar -xOzf "$RECOVERY_ROOT/nginx/$NGINX_ARCHIVE" \
  nginx/certs/cf-origin.key \
  > "$RECOVERY_ROOT/nginx/essential/nginx/certs/cf-origin.key"

chmod 600 "$RECOVERY_ROOT/config/extracted/.env" \
  "$RECOVERY_ROOT/nginx/essential/nginx/certs/cf-origin.key"
```

其他必需的 Compose、Nginx 配置和证书也应逐件确认是普通文件，再以相同方式定向提取。上述示例不是完整解包命令；任何现存目标目录或文件都须先隔离、人工检查，**不要覆盖既有恢复数据**。不要 `cat .env`，不要 `cat cf-origin.key`，也不要让远端配置和私钥进入 Git/共享日志。安全提取不等于已完成 Ubuntu `nginx -t` 或运行时验证。

### 8.2 Linux Nginx symlink 重建合同（恢复端，不修改生产）

**问题定位：** `sanqin_nginx_<timestamp>.tar.gz` 由受保护 helper 用 `tar -czf ... -C /etc nginx ssl` 创建，保留原 Linux symlink 是预期行为；在 macOS 或隔离目录中，`sites-enabled` 等**绝对链接目标**可能指向不存在的 Linux 路径，不能因此认为备份文件坏了，也不能把链接指向恢复操作者的宿主机 `/etc`。

受控流程：

1. 首先在恢复设备上用 `tar -tvzf "$RECOVERY_ROOT/nginx/$NGINX_ARCHIVE"` 审阅**文件类型及所有 symlink 目标**；对路径穿越、hardlink、特殊设备、意外的绝对成员路径或不可信链接，**立即停机审阅**。只读列表验证不授予全量解包权限。
2. MacBook 恢复时仍沿用 §8.1 的 `tar -xOzf` **逐项普通文件**提取，隔离目录中不恢复绝对 symlink。保留原归档以便未来在 Linux 恢复；不应重写/重新压缩原始备份来掩盖跨平台差异。
3. 在**新的、完全隔离的 Ubuntu 恢复 VM/容器**上先安装兼容的 Nginx/OpenSSL 及实际使用的模块/证书链，再将归档中经审核的普通文件按相应布局放入其**专属** `/etc/nginx` 和 `/etc/ssl`。必须逐个比对原链接名和目标，只有目标属于恢复 VM 内预期站点配置（例如 `/etc/nginx/sites-available/...`）时，才在该**隔离 VM**内受控创建或恢复 `sites-enabled` 链接；`modules-enabled` 应按该 VM 的已安装模块重建，不照搬旧系统模块绝对目标。
4. **只在隔离 Ubuntu VM** 上对重建后的服务执行 `sudo nginx -t`，核对必需站点配置、监听、Origin cert/key 配对、证书权限、目标链接不悬空；测试输出必须 `successful` 后才能把 Linux 运行时恢复标记为 PASS。必要时还需单独启用隔离的 Nginx 做只读 HTTP readiness。
5. 当前尚无上述独立 Ubuntu `nginx -t` 实测结果，因此这里只能标记 **RECOVERY PROCEDURE DOCUMENTED / LINUX REBUILD NOT VERIFIED**。不得触碰线上 `/etc/nginx`、`/etc/ssl`、执行线上 Nginx reload，亦不可将 macOS 上的选择性提取宣称为整套 Linux 恢复验证。


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

2026-10-01 和 2026-10-09 演练使用 PostgreSQL plain-SQL logical dump。安全恢复目标必须是**新建的非生产数据库**，建议使用与源端相同大版本的 PostgreSQL；先核实目标没有遗留类型/表，严禁对生产 DB 或已部分导入的 DB 盲目重放。

通用形式（备份 SQL **不包含** `CREATE DATABASE` 时）：

```bash
set -o pipefail
if ! createdb -T template0 sanqin_recovery_drill; then
  echo "STOP: fresh recovery database could not be created; do not reuse an existing DB" >&2
  exit 1
fi
gzip -dc "$RECOVERY_ROOT/database/$DB_ARCHIVE" \
  | psql -X --single-transaction -v ON_ERROR_STOP=1 \
      -d sanqin_recovery_drill
restore_rc=$?
echo "restore_exit_code=$restore_rc"
if [ "$restore_rc" -ne 0 ]; then
  exit "$restore_rc"
fi
```

`--single-transaction` 保证失败时不会留下半次 SQL 导入；须保留完整非零退出码和首个错误，不可跳过错误继续执行。已失败且**未**采用事务保护的目标库应按隔离规则重新选择新库，不能把 `already exists` 当成备份中的重复对象。运行前应显式确定 PG socket/host/port/user，保证操作对象确为隔离 PG 实例。

**2026-10-09 D1 异机经验：** 新 PostgreSQL 15.19 实例因缺少备份引用的 `sanqin-app`、`sanq_mcp_ro` 全局角色而报错；`pg_dump` 本身不导出 PostgreSQL global roles。操作员只在离机实例建立 `NOLOGIN` 占位 role，重新导入 exit 0；这仅是数据完整性演练的**兼容措施**，不是可供正式登录的恢复角色配置。

### 9.1.1 PostgreSQL roles 独立保存与可恢复性（安全修复方案）

**已核实的生产基线（2026-10-09，数据库只读查询）：** `sanqin-app` 为 `LOGIN SUPERUSER INHERIT CREATEDB CREATEROLE REPLICATION BYPASSRLS`；`sanq_mcp_ro` 为 `LOGIN NOSUPERUSER NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 3`；查询没有返回两者相关的角色成员授权。**不要**将 `sanqin-app` 的高权限直接复制到共享或生产目标，也不要把 `sanq_mcp_ro` 擅自升级成可写账户。

当前定时任务只执行 `pg_dump -U "$DB_USER" sanqin_db`，**并没有自动备份 global roles**。不改变已经上线的备份程序、命名、retention 或远端镜像合同，采用**独立离机 escrow** 补足正式恢复所需的角色 DDL：

1. 由操作者从**独立可信 Mac/Linux 管理设备**获取生产 PostgreSQL 15 的角色定义，不包含 password hashes。下例通过 SSH 执行容器中的只读 `pg_dumpall --roles-only --no-role-passwords`，输出直接留在管理设备的私有目录；`RECOVERY_ROOT` 需指向**已存在且受保护**的离机恢复工作区，不能在生产 VM 存放新的明文角色备份。不得在聊天/CI 展示 SQL 全文：

   ```bash
   umask 077
   : "${RECOVERY_ROOT:?set the trusted off-VM recovery root first}"
   roles_dir="$RECOVERY_ROOT/database/roles"
   mkdir -p "$roles_dir" && chmod 700 "$roles_dir" || exit 1
   roles_file="$roles_dir/sanqin_roles_no_passwords_20261009.sql"
   if [ -e "$roles_file" ] || [ -L "$roles_file" ]; then
     echo "STOP: role snapshot already exists; do not overwrite" >&2
     exit 1
   fi
   tmp="$(mktemp "$roles_dir/.capture.XXXXXXXX")" || exit 1
   if ssh ubuntu@sanq-web \
     'docker exec sanq-app-db-1 pg_dumpall -U sanqin-app --roles-only --no-role-passwords' \
     > "$tmp" && [ -s "$tmp" ] && chmod 600 "$tmp" && mv "$tmp" "$roles_file"; then
     echo "role_snapshot=CAPTURED_OFF_VM"
   else
     rm -f "$tmp"
     echo "role_snapshot=FAILED" >&2
     exit 1
   fi
   ```

   捕获动作只读取线上角色，**未请求生产数据库写入**。此命令需要操作者拥有相应 SSH/Docker 访问权限；如果 `pg_dumpall` 权限不足就停止，绝不为了导出擅自修改生产角色。快照仅包含角色定义，`--no-role-passwords` 意味着**不会恢复密码**；必须由恢复管理员通过独立密钥保管与轮换流程恢复认证信息。确认成功后，将私有 SQL 副本**加密并独立保存到 VM 外的 escrow**，记录 SHA256 和访问方式（仅在私有证据里），不得放进 Git、普通备份日志或共享目录。
2. 先在**全新隔离 PostgreSQL 15 cluster** 上审阅角色 SQL，尤其 `SUPERUSER`、`LOGIN`、`CREATE ROLE`、`GRANT` 等语句及目标 cluster 自带的角色。经受权恢复管理员批准后，才在该**隔离 cluster** 内按安全顺序恢复适用的角色定义，再创建空数据库并导入对应 `sanqin_db` SQL；不能把已有占位角色的演练库当成干净目标继续导入。必要的应用/只读登录凭据只能通过专门的离机 secret escrow 配置；密码散列及明文不得出现在此文档或聊天中。
3. 验收分开记录：`role_snapshot=CAPTURED_OFF_VM`、离机文件 SHA256、`roles_replay=PASS`（只有真正在隔离 PG15 中完成时才写），再核对 `sanqin-app`/`sanq_mcp_ro` 的 role 属性、membership、数据库对象 ownership/GRANT，并执行原 §9.1 完整 clean restore。**2026-10-09 操作员实测：**使用原有 AES-256 加密 DMG `sanq-rclone-crypt-escrow-20261001.dmg` 直接接收生产角色定义；终端输出 `role_snapshot=CAPTURED_IN_ENCRYPTED_DMG`；SQL 文件 SHA256 为 `d2624c69d0887a861d5e7b5223f7cacf44b486f6b32c121a2bebaa0d7204f2bc`，随后 `hdiutil detach` 成功（`disk2 ejected`）。**CAPTURED IN OFF-VM ENCRYPTED ESCROW / OPERATOR-REPORTED PASS**，未由 MCP 独立读取 DMG 内容；**ROLES REPLAY / AUTHENTICATION RESTORE NOT VERIFIED**。不要将该一次性快照冒充定时角色备份。
4. **持久自动化是另一项更改**：如需每日备份自动包含 globals，需单独审计 `ops/backup/backup-db.sh`、权限隔离、加密归档、retention、恢复测试和 CI，再获取明确授权；本次有限范围 C4 收口不私自更改已稳定运行的生产备份合同。

原有 `NOLOGIN` 占位方法仍只允许用于**隔离的纯数据验证**，不可把它当作正式业务服务恢复成功；切勿在生产上直接创建占位角色、提升权限或修改既有权限。

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

**2026-10-09 实测补充：** `AccountingExpenseDocument.attachmentUrls` 可能含 `/api/v1/accounting/inbox/artifacts/:artifactStableId/content`，这是 Artifact delivery API 而不是磁盘绝对路径；应按 `artifactStableId → AccountingSourceArtifact → AccountingArtifactBinaryRetention` 解析有效物理文件，优先核验 `COMPRESSED_ONLY` 的 `retainedStoredUrl`、size 和 hash。其物理文件可位于 `uploads/accounting/image-retention/`。切勿把合法 API URL 直接按 `uploads/` 拼接后报告文件缺失。

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

## 附录 A — Lightsail 灾难恢复：新实例替换演练与生产门禁（草案）

> **2026-10-18 / 文档-only / 非生产执行授权。** 本文件只把本次 VirtualBox **生产式新实例恢复合成演练**与未来 AWS Lightsail 业务恢复步骤一一映射，不宣称已经在 Lightsail 验证 AWS 创建、数据库恢复、供应商切换或真实流量。本草案不覆盖、修改或关闭 [R0 冻结设计](../architecture/Runtime更新-R0冻结设计.md) D1–D5 / C1–C8，尤其**不替代 C2-02 实际 `snapshot restore`**。真实完整 DR 仍由本手册、[G2 权限层级](../architecture/c5-g2-trusted-runtime-contract-2026-10-13.md) 与 [C2 操作员证据索引](../architecture/C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md)共同约束。

### A.1 为什么要分成两种恢复

| 触发条件 | 目标动作 | 不可混用的边界 |
| --- | --- | --- |
| 仅 Runtime 安装中断、业务数据与宿主机未损坏 | R0 D5 `Abort & Clean Reinstall`：用完整可信外部 Archive/Kit、独立执行材料与全新 txid 重装 Runtime | **不**自行回退 PostgreSQL、Uploads，不恢复旧 journal，不假冒整机 DR |
| 应用发布失败，但 Runtime/持久化健康 | 采用现有 `deploy_release.py` 发布/回退与配对镜像合同 | 不能用旧 VM snapshot 覆盖实时订单和支付 |
| 主机丢失、OS/文件系统损坏、业务数据完整性不可证或恢复需要替代服务器 | **全 DR 新实例恢复**：从审核的 Lightsail snapshot 新建实例，恢复/对齐数据库与文件，受控切流 | 不在未经证实的旧 VM 上原地覆盖运行中业务，不让旧新实例同时产生有效 provider/DB 写入 |
| 隔离测试需要验证 VirtualBox 原地恢复功能 | 经单独审批在指定可丢弃 VM 上执行真实 `snapshot restore` | 属 R0 C2-02 单独验收；`clonevm --snapshot` 不等于实际 restore |

**生产原则：**在故障对象与恢复对象身份、数据恢复点、隔离、访问控制、应用镜像发布 SHA、外部事件与写入者互斥未确认前，目标实例只准隔离核查，不得开放真实业务处理。RPO/RTO 必须由具体快照/备份时间和回放证据计算，不编造“零损失”或固定恢复时间。

### A.2 2026-10-18 已执行的 VirtualBox 合成映射

| Lightsail 应做的恢复活动 | 本次可核实的 VirtualBox 演练 | 仍未验证 |
| --- | --- | --- |
| 保留故障实例、定位可信恢复点 | `SanQ-Linux-Test-02` 关机保留；snapshot UUID `028a681b-18b9-4dc7-a67f-69257e7cf85b` | 真实 Lightsail snapshot 原始来源与磁盘/附加卷清单 |
| 从快照创建**替代实例** | `VBoxManage clonevm --snapshot=... --mode=machine --register` rc=0；新 VM UUID `162701f1-bf68-413d-9f2d-76c513554881` | AWS API/控制台新建、可用区/网络/磁盘/Static IP 实测 |
| 复制独立 OS 磁盘 | 新 VDI `39381cc9-f526-4e35-8a09-3a265cfe79f4` parent=base；Ubuntu 24.04.5 成功启动 | 完整文件字节、真实服务/数据库一致性 |
| 验证新主机默认权限/网络 | Host-only、非公网、无共享目录；发现快照继承双向剪贴板、启动前已关闭 | Lightsail firewall、实例 IAM/SSH、Cloudflare/TLS 原样适配 |
| 对恢复后的节点做健康检查 | `192.168.56.3:18081/healthz` 合成 HTTP 200，非空 run-id 与实例身份吻合；源 `.2` 不可用 | Web/API/DB/Worker/备份健康、真实业务读写 |
| 健康失败阻断使用 | `/__stop` 首次 404 已留证；第二次精确 ID 返回 200，日志 STOPPED；停止后健康检查 curl rc=7 | 正式流量切换、回滚、重复 webhook/支付防护 |
| 离机保全 | C2-0、C2-1 压缩包由操作者在私有 Google Drive 上传、下载，均 `shasum -a 256 -c` OK | 独立第三方见证、不可变存储与真实恢复所需原凭据源 |

**准确验收口径：**`C2-1A–D PRODUCTION-STYLE SYNTHETIC NEW-INSTANCE RECOVERY OBSERVED`；**R0 C2/C2-02 OPEN、C5-G2 NO-GO**。两次 Guest SSH 和 Server SSH 外层退出码没有捕获；C2-1 包的完整 SHA-256 值尚未由操作者在对话提供，不可补造。C2-0 操作员报告 SHA-256 为 `5503b6f9942613e66e886ddd945aad4544c4f4d56835539db97cd8bc0683eaea`。详情在所属架构文档 §9；证据原件**不提交 Git**。

### A.3 生产 Lightsail DR 审批与执行清单（未执行、非自动授权）

#### Gate P0 — 声明事故与禁止双写

- 指定事故 ID、批准人、操作员、时间窗口、旧实例 ID/区域/Static IP、真实业务影响；保存事故前最新权威日志和只读诊断。
- 对真实入口与写入者制定停机/隔离策略：Cloudflare/公网 Web、POS 下单、Clover 支付确认/退款、Uber/Fantuan webhook/worker、定时任务与数据库写入。**先确定避免双写与重复副作用的方案，再让替代机接触生产网络**。
- 检查旧实例/旧 worker 是否仍在线。响应超时属于 UNKNOWN，不自动断言订单、支付或外部操作未成功；需要 Orders/Payments/External Channels 所有者参与核对。
- 原实例保留以便取证，不擅自删除；不在两台运行实例上同时启用相同生产凭据和消费者。

#### Gate P1 — 确定可恢复资产和恢复点

- 分别审阅 Lightsail **实例/系统盘** snapshot、可能存在的附加磁盘 snapshot、PostgreSQL 独立逻辑备份、Uploads 当前/历史、加密配置、Nginx/TLS、Runtime 旧/目标原 Archive 与 proof。
- 精确列出每个快照和 DB dump 的时间、区域、身份、hash/来源、可用性、预计数据缺口与冲突时间段。整机快照**不等于**各异步备份与业务数据库的原子恢复点。
- 在隔离环境核查 `gdrive_secure:` 的 crypt 恢复资料和下载/解密读回；Google Drive 文件可取回的 SHA 检查**不是**创建语义 WORM、发行来源证明或密钥 escrow 自动达标。
- 明确是否需要将数据库恢复到特定时间点：仅有逻辑 dump 的场景不能凭空承诺 PITR；外部支付与订单必须与恢复时间点对账。

#### Gate P2 — 创建替代实例并保持隔离

- 经批准从**明确指定**的 Lightsail Snapshot 创建新实例；记录旧/新实例 ID、镜像/区域/网络/磁盘、实例规格、启动时间和操作审计。
- 新主机不得因为快照中预存服务、密码、cloud-init、计划任务而自动处理生产业务。先检查启动时的真实出网/入网路径、实例防火墙、SSH/凭据、元数据和任何附加卷。
- 检查恢复后的系统机器身份（machine-id、SSH Host Keys、hostname）、文件系统 UUID、配置/证书身份是否重复；只按独立批准的身份迁移策略调整，**不在本文提供无条件重生成命令**。
- 审查安全规则、后台作业、日志目录与敏感环境变量是否与新实例匹配；不要默认从原实例完整复制所有网络与访问控制设置。

#### Gate P3 — 恢复存储、服务与历史事实

- 严格使用仓库现有 Runtime/Release 合同核对 `/opt/sanq/runtime`、配对 Web/API/worker 发布 SHA/digest、固定 17 文件和 Runtime Manifest、`sanq-app` Compose project、`sanq-app_pgdata` named volume、`/srv/sanq/uploads` 与恢复的数据库。
- DB 恢复必须是**单独批准的**目标数据库与回放计划，验证迁移历史和 schema、非空业务行数/关键不变量、附件引用、期间与账本一致性；禁止 `prisma migrate reset`、`db push`、误建/覆盖生产卷或从较旧 dump 直接覆盖活跃 DB。
- 应用服务在隔离状态下先做只读健康检查；外部 provider/webhook/支付写入、Uber worker、定时备份/消息任务在完成**独立去重与权威对账**前保持关闭或断路。凭据/令牌原文不写入 Git 或报告。
- 验证退款、支付未知态、Clover 交易状态、Uber/Fantuan 未完成订单、重投 webhook、会员权益、财务 Journals 是否与恢复点交叉一致；不能以订单金额/时间相同猜测同一外部交易。

#### Gate P4 — 受控切换与回滚判据

- 用户另行批准**准确目标**（新实例、Static IP/路由、Cloudflare、时间窗、预期影响及可撤回方案）。在健康/数据/权限/后台消费者门禁全通过之前不切换外部入口。
- 切换前证明旧写入者不会复活，新实例只有一套生产权威消费者；必要时完成 provider 事件 replay/补单/幂等检查；对外切流不等于接入支付写入许可。
- 分别核对 Lightsail Static IP 或 DNS/Cloudflare 的实际路由与缓存、TLS/防火墙、网站健康、POS/订单、外部渠道/webhook、备份服务和监控；不能用测试 Host-only IP 切换冒充正式通过。
- 任一未知/对账失败：停止切换、隔离保留事故/原证据，不自动删除旧实例、覆盖数据库或启动两个 worker；决定回退时必须同样阻止双写和数据倒退。

#### Gate P5 — 独立验收与证据

- 保存指定 Host/VM/Archive/DB/发布 SHA、operator/approval、UTC、原始 stdout/stderr/exitcode、业务读回/差异、源/目标与回退点、失败事件、所有外部通知与计数。
- 由与执行者不同的复核主体从受控离机位置核对原件 SHA、对象身份、可用的解密/取回和数据一致性；执行人自己重新下载校验**只能说明字节一致，不能充当独立签署**。
- 在完整生产验证和业务 owner 签认前，状态保持 `PRODUCTION RECOVERY NOT VERIFIED`。R0/G2 C8 生产授权和 G2-F 复验是独立门禁，不从本草案或 C2 合成通过推导。

### A.4 C2 单独待办与边界

- [x] C2-0 Host/Guest 普通用户有限观察（2026-10-18 操作员报告）
- [x] C2-1A–D 合成新实例替换与 Google Drive 取回校验（2026-10-18 操作员报告）
- [ ] C2-1 原冻结合同 C2-02：单独批准的**真实** snapshot restore、独特差异标记、完整 pre/post 与证据 custody
- [ ] 独立 Host/Guest witness 与 C2-1 完整 SHA-256 值来源审阅
- [ ] B2B2-B2 实际 root-anchor/别名 FD、外部发行 pins/消费见证（另审、另授权）
- [ ] 真正 Lightsail 实例创建、应用/DB/Uploads 恢复、Static IP/Cloudflare、供应商与生产切换的独立 DR 验收（另立任务，不属于本次模拟）

**本轮不执行任何生产/VM 变更。** 若后续提议用新实例恢复替代原 C2-02 `snapshot restore` 作为强制关闭条件，属于**更改已冻结验收合同**，必须先说明必要性、影响和可选替代方案并获得用户明确授权；本文件只并列记录两种场景，不进行替换。

