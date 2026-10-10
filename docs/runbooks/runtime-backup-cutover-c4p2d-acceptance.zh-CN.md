# C4-P2-D — 新 Runtime 切换后独立恢复、业务实测与最终关闭门禁

**状态（2026-10-09）：D4 有限范围关闭已获操作员授权，且 PostgreSQL roles 已由操作员只读导出到 Mac 上的 AES-256 加密 DMG，SHA256 已记录、DMG 已成功推出；有限范围证据已齐，`LIMITED-SCOPE ACCEPTANCE COMPLETE / PENDING DOCUMENT PR+CI`，正式 `C4 LIMITED-SCOPE PRODUCTION VERIFIED / CLOSED` 待本地审阅及 dev PR/CI 交付后登记。** D0 生产 Runtime/挂载/健康及有限日志 SCOPE PASS；D1 异机数据库、Uploads、加密配置及财务控制 DATA RECOVERY PASS，隔离角色回放及 API/Web/Nginx 启动未做（FULL RUNTIME PARTIAL）；D2 五端页面与 Accounting 附件、顾客图片预览 SCOPE PASS；D3 首次自动备份 `20261009_073020` 远端归档及 Uploads 87/87 PRODUCTION VERIFIED。

基线：C4-P2-C 已由操作员于 **2026-10-09 UTC（2026-10-08 Toronto 夜间）**完成实际生产切换。业务应用、备份脚本和 Timer 已切到新布局，4/4 Compose 容器 Healthy；C4 **尚未 CLOSED**。本文件定义后续独立的 P2-D 验收，不授予新的生产写入、支付、销毁、清理、数据库 restore 或对外 provider 调用权限。

相关历史证据及回退合同：
- `docs/runbooks/runtime-backup-cutover-c4-prep.zh-CN.md`（Gate 0–6 实施结果）。
- `docs/runbooks/runtime-trusted-manual-install-c4p2a.zh-CN.md`（可信 Runtime/17 文件白名单、P2-A 原始安装合同）。
- `docs/runbooks/backup-recovery.zh-CN.md` 及 `docs/runbooks/backup-recovery.md`（已验证的隔离恢复流程、敏感凭据边界）。
- `AGENTS.md`、`.github/workflows/ci.yml`；本阶段默认为运维验证，不修改源代码、schema 或 migrations。

## 1. 已完成的 P2-C 事实（不重复执行）

| 类别 | P2-C 生产证据 |
| --- | --- |
| Runtime | `/opt/sanq/runtime`，root-owned trusted manifest 17/17；root:root 0644 C4 activation marker |
| Uploads | API/Worker 实际绑定 `/srv/sanq/uploads`；最终旧/新一致性：87 文件、8 目录、136,154,899 bytes；双向 SHA256 missing/extra/mismatch=0 |
| Backups | `/srv/sanq/backups`，ubuntu:ubuntu 0700；复制的 2026-10-08 DB 备份验证 SHA256/gzip，通过后成功执行新布局手动完整备份 |
| 应用与数据库 | Compose project `sanq-app`，原 volume `sanq-app_pgdata`、DB container ID 和应用镜像 SHA `a84b72007e6b4e82c981101e56c897355757c0ff` 未改变；4/4 Healthy；204 migrations up to date |
| 备份批次 | `20261009_033755`，2026-10-09 03:37:55–03:39:55 UTC，systemd `Result=success`、`ExecMainStatus=0` |
| 远端备份 | 每日/当月 PostgreSQL、`gdrive_secure:config`、`gdrive_secure:nginx` 本地与远端解密内容 SHA256 MATCH；TLS 五个成员及配置成员存在；`uploads-current` 87 matching / 0 differences |
| Timer | `active/enabled`；检查时 next `2026-10-09 07:30 UTC`（03:30 Toronto）；原 schedule 不变 |
| 附记 | 停旧 API 时超过 90s grace period，`ExitCode=137`、`OOMKilled=false`；当时无关键支付/待处理 Uber 任务；后续需核对重启后的异常趋势 |

**不得混淆**：2026-10-01/02 旧布局的 isolated recovery drill 已经验证过当时版本和 escrow，但**不能替代**用新布局首份 `20261009_033755` 数据在另一台机器的实际 clean restore。P2-C 的 `rclone cat | sha256sum` 是独立字节比对，不是数据库恢复演练。

## 2. P2-D 工作包与通过标准

**范围纠偏（2026-10-09）：** C4 仅验收本次实际切换的 Runtime 安装/激活、容器与挂载、Uploads/Backups 数据和恢复能力，以及当前已上线站点最小只读 Smoke。第三方平台的集成状态、测试/生产审批、订单/菜单/门店联调等独立业务项目没有发生本次 C4 切流，**不得作为 D0–D4 的验收门禁、待补工作或关闭障碍**。若某后台 Worker 正好是 Compose 现有容器，D0 只检查其通用容器健康与挂载，不因此要求验证它的外部业务接口。

### D0 — 生产只读证据冻结 / 运行稳定性

只读记录检查执行时间（UTC/Toronto）、当前镜像 SHA、root-owned Runtime Manifest 及 marker、Compose project、**实际** API/后台 Worker Uploads Mount.Source、DB Mount.Name `sanq-app_pgdata`、4 个容器 Healthy、可用磁盘内存、最近 bounded API/Worker/Web/Nginx 错误日志。只检查切流相关的重启循环、路径/权限/挂载漂移、备份失败和新出现的存储异常；已有业务功能或第三方集成的独立状态**不是本项目的验收门禁**。

- PASS：没有新的持久错误循环或存储挂载漂移；新进程可读写它们被授权访问的路径；DB/migrations 未变化。
- FAIL/BLOCKED：容器异常、原 DB 卷变化、活跃长事务或新金融/订单不一致。只保留日志摘要与必要计数，不导出客户/支付敏感内容。
- 如需真实写入探针，只能在另行审批的隔离数据、测试账号/资源下执行；不要把生产订单当作文件权限测试。

### D1 — **20261009_033755** 全套离机 clean restore（核心门禁）

在**独立非生产设备或隔离环境**执行；绝不把真实备份恢复至在线 `sanq-app_pgdata`，也不提前启动 provider/background worker。操作者使用离机 escrow 自行解锁 `gdrive_secure`，凭据和恢复出的 `.env`、私钥不得放进仓库、聊天或共享日志。

1. 用实际生产首次新布局批次 `20261009_033755` 分别取回 `database-daily`、`gdrive_secure:config`、`gdrive_secure:nginx`；`uploads-current` 和一份可核验的历史 `uploads-history` 取回隔离目录。对下载字节做 gzip/tar、体量、SHA256/清单验证，确认 TLS `cf-origin.key` 存在且不回显。
2. 在隔离的 PostgreSQL **15** 空实例中导入该 SQL dump，记录完整导入成功与 `_prisma_migrations` 状态；对照与快照同一时间点的关键业务行数/表的抽样或有效基线，不要求和之后继续写入的实时生产精确相等。
3. 验证 canonical Journal 借贷平衡，必要的 Orders/Payments/Accounting 关联一致；核验数据库引用的现存 Accounting binary、归档业务文件、菜单图片、homepage JSON 的文件存在性和大小/SHA256。此项是**通用数据恢复完整性检查**，不是某个外部渠道的业务验收。不得把 `uploads-history` 直接覆盖到当前 Uploads。
4. 解包恢复出的 `.env`、Compose、Nginx/TLS 到隔离路径，验证生产目标路径合同、固定 Compose 项目与 DB volume 名称、加密恢复可用性；不得接管原生产 DNS、设备、外部支付/集成认证或发送真实订单。
5. 只在与外部 provider 隔离的环境下按 `DB → API → Web → 最后 Worker` 顺序做有限健康验证。若运行 Worker 可能触发真实 provider 回调或 durable 重放，则**不启动**，以配置静态/数据库队列核验替代；记录该边界，不伪报 provider E2E。
6. 保留脱敏报告：恢复点、归档文件名、哈希对照结果、DB restore exit code、migration/Journals/数据引用检查结果、异常和明确未覆盖的项目。安全清理临时明文和凭据（仅在确认验证证据与备份仍可恢复后，按操作员审阅流程）。

- PASS：备份和加密配置从 VM 外独立取回、解密、**clean restore**、数据库/文件/财务控制校验全通过。
- BLOCKED：仅 `gzip -t`、远端对象存在或在原生产 VM 计算哈希，均不足以关闭 D1。
- 边界：本阶段不是从零搭建新 VM 并计时的端到端 RTO SLO，不宣称 RPO≤24h。

### D2 — 已上线页面和资产最小 Smoke（不制造真实资金/订单）

分两层记录，不把 GET 健康探针当作业务 E2E：

| 表面 / 合同 | 只读或无副作用验收 | 需要后续单独授权的实测 |
| --- | --- | --- |
| 顾客 Web/PWA | `/health`、公网 BFF/API readiness、公开菜单、首页中英图片/特色展示、购物车展示、登录页导航 | 真实支付下单、积分/余额扣减、退款 |
| Admin / Accounting | 角色授权/导航、既有历史订单、账单/费用列表、附件读取与下载、既有 journal 报表；检查 Uploads URL 无 404 | 上传新账单、录账/冲销、更正 posted 数据 |
| POS 与顾客屏 | 已授权账户下只读页面、设备连接状态、历史订单/打印设置可见性；无新的循环错误 | 真订单、Clover terminal 收款/退款、真实打印 |
| 静态及文件链路 | 已有菜单/首页图片、Accounting 附件通过新 Uploads 实际可读、可预览，访问控制正常 | 新上传、覆盖或删除文件 |

- PASS：当前已上线五端的选定只读工作流可用；关键已有附件/图片可经应用正常读取；无已发现的切流相关 404/403 或权限漂移。业务功能的深层实测和任何独立平台集成验收不计入 C4 通过标准。
- 任意带真实财务/店铺状态副作用的操作，需要独立的样本、金额/交易上限、时间窗口和回滚方案审批；C4-P2-C 授权**不自动覆盖**这些操作。

### D3 — 下一次无人值守定时备份（关键持续性门禁）

监测 P2-C 后首个计划触发：**2026-10-09 07:30 UTC / 03:30 America/Toronto**，以实际 `systemctl list-timers`、`journalctl -u sanq-backup.service` 和 `systemctl show` 时间戳为准。若未来已过该时刻，应只读检查最近结果，不主动二次触发以替代。

- `sanq-backup.timer` active/enabled；`sanq-backup.service` 最近计划批次 `Result=success` / exit 0。
- 新 `/srv/sanq/backups` 生成本地 DB/config/Nginx 文件，`gdrive_backup` / `gdrive_secure` 远端同批次可见、可解密；gzip/成员/哈希对照通过；`uploads-current` 与备份时点一致性核对通过。
- 注意与手动批次 `20261009_033755` **不是同一次**。不能只拿 Gate 5B 手动备份来关闭 D3。
- 失败时保留 timer/service 原始状态和 journal，分析根因；严禁为了伪造成功清除日志、跳过失败项或削弱 retention。

### D4 — 关闭判定与回退资产治理

**原始完整门禁**仍为 D0 stable + D1 异机 clean restore（含隔离运行时启动）+ D2 上线站点只读 Smoke + D3 首次 scheduled backup。2026-10-09 操作员明确允许**有限范围关闭例外**：仅针对已经实测的 Runtime、挂载、Uploads、Backup、异机数据恢复和线上只读 Smoke 判定生产切流完成；**不声称**灾难重建后的 PostgreSQL 登录恢复、Linux Nginx `nginx -t` 或隔离 API/Web 启动经过验证。该例外必须被显式记录，不能修改历史原始通过标准或默默把 D1 FULL SCOPE PARTIAL 写成 PASS。

- 状态流转：`P2-C COMPLETED → P2-D IN VERIFICATION → D4 LIMITED-SCOPE CLOSURE AUTHORIZED → LIMITED-SCOPE ACCEPTANCE COMPLETE / PENDING DOCUMENT PR+CI → C4 LIMITED-SCOPE PRODUCTION VERIFIED / CLOSED`。操作员于 2026-10-09 已提供离机加密 DMG 捕获成功、文件 SHA256 和成功卸载的脱敏证据（见 §4.8），**不再等待额外角色导出**。最后一个 CLOSED 状态仅在本地文档审阅、远端 PR、CI 全绿及合并后正式登记；这不证明隔离 PG roles 重放或完整服务冷恢复。
- 保留原 `/home/ubuntu/sanq-app`（包含旧 Uploads/Backups/source）、root 0700 回退快照 `/opt/sanq/.c4-p2c-rollback.EnD7i3No`、旧 backup.log、可信 Runtime Archive/Manifest 外部证明，**直至 C5 独立清理审计及显式授权**。旧 Uploads 不是新目录的自动镜像，回退前先隔离新写入并核查新旧差量，严禁盲目恢复旧数据或旧 timer。
- 不修改 `SOURCE_FILES`、Prisma/schema/migrations、CI、发布控制器和现有 owner 边界；不因为 P2-D 重开已关闭的 Backup/Recovery §3.2。**不将未开发、未上线或独立推进的第三方平台/支付业务验收引入本次 Runtime 切流门禁。**
- P2-D 的可执行产物是**脱敏验收记录和例外清单**，不是提前编写会改变生产状态的自动化恢复脚本。

## 3. 建议执行顺序与下一工作会话交接

按 `D0 → D1 → D2 → D3 → D4` 收集证据；D2 的无副作用只读检查可与 D1 并行，D3 依赖真实 scheduled run。执行前先重新检查生产当前时点和运行状态，不使用本文件的历史时间戳冒充新鲜证据。

新会话任务标题建议：**“C4-P2-D — Post-cutover independent restore & business acceptance”**。先只读确认 C4 激活、Timer、4/4 健康、实际挂载及最近新布局备份；随后分批指导离机恢复和范围内业务验收。不要清理 C4-P2-C 回退资产，也不要自动开启任何需生产副作用的实测。

## 4. 2026-10-09 P2-D 实际验收记录（离机证据；不取代生产 D0/D2/D3）

### 4.1 D1 — MacBook 独立恢复 `20261009_033755`

**判定：DATA / BACKUP INTEGRITY PASS；D1 FULL SCOPE PARTIAL（隔离 API/Web 运行时健康测试未执行）。** 以下是操作员在独立 macOS 设备上实际运行并回报的结果，不是生产 VM 原地恢复，也不是对未来 RTO/RPO 的保证。

| 门禁 | 已核对证据 |
| --- | --- |
| 离机取回 | `gdrive_backup:database-daily`、`gdrive_secure:config/nginx`、`uploads-current` 和历史 `uploads-history/20260930_073005` 均独立下载；三份 gzip 完整性 PASS |
| PostgreSQL 15 clean restore | Postgres.app PostgreSQL **15.19**、独立 PGDATA、仅本机 Unix socket；空库 `sanqin_recovery_c4p2d_retry1` 经 `psql --single-transaction -v ON_ERROR_STOP=1` 导入，**exit 0** |
| Migration | `_prisma_migrations` **205**：applied **204**、rolled back **1**、unresolved **0** |
| 财务 | Active Journal **1,765**，不平衡 **0**，借贷差额 **0 cents**；Journal Lines **5,686** |
| 业务行数 | Orders **2,838**，PaymentTransaction **0**，AccountingExpenseDocument **11**，AccountingSourceArtifact **198**，UberFinancialReport **2**。PaymentTransaction=0 是该表计数，**不是**全渠道支付事实已核验的声明 |
| 当前 Uploads | **87 文件 / 8 目录（含根） / 136,154,899 bytes / symlinks 0**，与 P2-C 切换基线一致；`rclone check --download` exit 0 |
| DB ↔ 文件 | **88** 条引用：**86** 条物理路径存在且按可用元数据核验大小/SHA256；另 **2** 条 Expense URL 是 `/api/v1/accounting/inbox/artifacts/:artifactStableId/content` API 映射，均解析到 `COMPRESSED_ONLY` 保留 derivative（有效 Artifact/retained hash/size），实际 derivative 已在上述物理路径校验中覆盖；未发现缺失/大小或 SHA256 差异 |
| 首页/图片 | `site/homepage-content.json` 版本 2，zh/en、3 个 featured slots 格式有效；首页配置图片引用 **0**（不能算作图片读取 E2E）；MenuItem 本地图片 **32** 条被文件核验覆盖 |
| 加密 Config / Nginx | `gdrive_secure` 成功离机解密；`.env`、Compose 与 Nginx 三份配置、Origin cert/key **7/7** 必需文件隔离提取成功；`.env` 与私钥均 `0600`，未打印内容；Compose `sanq-app` / `sanq-app_pgdata` / API+Worker `/srv/sanq/uploads:/app/uploads` 四项静态合同 PASS |
| TLS | 证书/私钥公钥哈希匹配；证书 UTC 2026-01-25 至 2041-01-21，有效期检查 PASS；不代表 Ubuntu Nginx 实际启动已验证 |
| Uploads History | `20260930_073005` **25 文件、8,525,048 bytes**，离机下载 exit 0，`rclone check --download` **25 matching / 0 differences / exit 0**；没有写回 `uploads-current` |
| 证据封存 | MacBook 本地 `evidence/` 中 archive SHA256 **3**、uploads-current SHA256 **87**、history SHA256 **25**，共 **115** 条；三份 manifest 本地重验均 PASS；三份原始归档分别远端 `rclone check --download` **1 matching / 0 differences / exit 0** |

**恢复约束/发现：**

1. `pg_dump` 是 plain SQL，不携带集群 global roles。新 PG15 实例导入时先后因缺 `sanqin-app`、`sanq_mcp_ro` 角色中断；操作员只在离机演练实例创建 `NOLOGIN` 占位角色，验证空库后在 `--single-transaction` 中重新导入成功。不可直接在生产恢复时照搬角色/权限。
2. Nginx 归档包含 Linux 系统证书、module 及 `sites-enabled` 的**绝对目标 symlink**。MacBook 上没有直接执行完整 `tar -xzf`，而以 `tar -xOzf` 仅恢复经核查的七个普通文件到私有 quarantine，恢复目录 symlinks=0。异机 Ubuntu 完整重建需另行验证平台 CA/modules、站点 symlink 及 `nginx -t`。
3. MacBook 未安装/启动可隔离外部调用的 API/Web runtime，未进行隔离 HTTP readiness 或后台 Worker 安全启动检查；这属于恢复演练运行时覆盖缺口。生产支付、订单、第三方平台联调不属于本次切流恢复演练，也不能把数据库与 Compose 静态 PASS 宣称为服务级恢复 PASS。
4. Manifest 和秘密保留在 MacBook 的私有离机 escrow；**不得**上传 `rclone.conf`、`.env`、`cf-origin.key`、客户附件或带文件路径的清单到仓库。备份归档仍保留，待操作员审阅后按独立流程安全清理。

### 4.2 D0/D2/D3 现有证据与缺口

- **D0 PARTIAL（实际挂载与容器健康 PASS）**：2026-10-09 15:15 UTC 受限生产 MCP 确认 4/4 Compose Healthy，API/Web/Worker 镜像仍为 `a84b72007e6b4e82c981101e56c897355757c0ff`；系统可用磁盘约 38 GiB，内存 available 770 MiB。随后操作员通过生产 VM 的只读 `docker inspect` 实测：DB `Mount.Name=sanq-app_pgdata`、API 与 Uber Worker 的 `/app/uploads` `Mount.Source` 均为 `/srv/sanq/uploads`，4/4 容器 `health=healthy`、`RestartCount=0`（仅是当前容器实例的累计重启计数，不能代替完整历史日志）。挂载和健康检查 **PASS**；root-owned Runtime Manifest 17 文件哈希/权限和 C4 activation marker 已在 §4.5 复核 PASS。近期 API/Worker/Web 有限日志关键词检查已记录；Nginx 默认错误日志有限范围筛查见 §4.6，已上线页面及存储资源 Smoke 已由操作员确认（§4.7）。初步受限 MCP Docker 日志筛选中，Web/DB/Worker 未匹配明显错误；API 存在外部 `.php` 探测造成的 404 WARN 及未登录 `auth/me` 401，**不能直接判为 C4 回归**，另外已使用精确关键词对 2026-10-09 04:00–15:45 UTC 的 API/Web/DB/Worker bounded Docker 日志作只读筛选（各服务最多末尾 2000 行）：`EACCES`、`ENOENT`、`EPERM`、`ENOSPC`、permission denied、上传写入异常及 FATAL/rejection **0 matches（四个服务均为 0）**；这一结果仅针对窗口与关键词，不代表没有其他类型的应用错误，也不能代替 Nginx 完整日志及业务 Smoke。生产 checkout 的 `docker-compose.yml` 有既存未提交改动，**不得**以此 checkout 文件代替已安装 Runtime 合同，也不得覆盖它。
- **D2 SCOPE PASS（当前已上线页面、存储资源预览）**：2026-10-09 操作员确认顾客首页、菜单、Admin、Accounting、POS 五端均正常，并确认 Accounting 已有附件及顾客端图片能够正常预览显示，见 §4.7。该证据覆盖切流相关的线上页面和文件读取路径，不代表已验收深层业务交易、角色矩阵、打印或外部接口。**D2 不包含任何独立第三方平台集成审验门禁。**
- **D3 PRODUCTION VERIFIED / PASS — 首次 scheduled backup**：操作员于 2026-10-09 15:22 UTC 通过生产 SSH 的只读 systemd/journal/ls 结果，证明 **07:30:20 UTC / 03:30:20 Toronto** 由 `sanq-backup.timer` 触发 `sanq-backup.service`（Timer active/enabled；下一次 2026-10-10 07:30 UTC）。Service start `07:30:20`、exit `07:30:41`（21 秒），`Result=success`、`ExecMainCode=1`（正常 exited 类型）、`ExecMainStatus=0`；journal 末尾为 `backup completed successfully`，且 `uploads-current sync succeeded`。新 `/srv/sanq/backups/` 同批次文件 `sanqin_db_20261009_073020.sql.gz`、`sanqin_config_20261009_073020.tar.gz`、`sanqin_nginx_20261009_073020.tar.gz` 均存在（root:root 0600 的 Nginx 归档）。这**不是**此前 03:37 UTC 的手动批次 `20261009_033755`。**同批次三份远端归档 SHA256、Nginx GZIP 和 uploads-current 87/87 逐文件核验全部 PASS（见 §4.4）；D3 判定为 PRODUCTION VERIFIED / PASS**。MCP 本身仍无 systemd/rclone 接口；上述生产数据来自操作员提供的 SSH 输出，不代表 MCP 独立复核。

### 4.3 D3 操作员只读证据采集（首次计划批次）

以下由操作员在生产 VM 的终端手动执行，**只查询，不触发** `sanq-backup.service`、不重跑 `backup-db.sh`：

```bash
date -u
systemctl list-timers --all sanq-backup.timer
systemctl is-active sanq-backup.timer
systemctl is-enabled sanq-backup.timer
systemctl show sanq-backup.timer \
  -p ActiveState -p LastTriggerUSec -p NextElapseUSecRealtime
systemctl show sanq-backup.service \
  -p Result -p ExecMainCode -p ExecMainStatus \
  -p ExecMainStartTimestamp -p ExecMainExitTimestamp \
  -p TriggeredBy
journalctl -u sanq-backup.service \
  --since '2026-10-09 07:15:00 UTC' \
  --until '2026-10-09 09:30:00 UTC' \
  --utc --no-pager -o short-iso
ls -lh /srv/sanq/backups/
```

先由 journal 的**实际** service 启动/结束时间确定触发实例及批次 `<scheduled_timestamp>`，再关联同批次 **`sanqin_db_<timestamp>.sql.gz`、`sanqin_config_<timestamp>.tar.gz`、`sanqin_nginx_<timestamp>.tar.gz`**；不能只看 `Result=success`（可能已被后来一次手动执行覆盖）。日志需脱敏，且须检查 `backup completed successfully`、无 task failure 和正确 timer provenance。

随后只读确认新 `/srv/sanq/backups` 下本地文件存在、GZIP/必要 tar members、哈希；使用操作员自行持有的私有 rclone 配置检查 `gdrive_backup:.../database-daily`、`gdrive_secure:config`、`gdrive_secure:nginx` **与该自动批次完全相同的时间戳**、解密可用且远端实际字节与本地匹配；最后核对 `uploads-current` 与实际同步点的一致性（在线目录若有后续写入，必须按时间解释变化，不得把当前目录强行当作 07:30 的原子快照）。可用远端只读 `rclone lsf`、`rclone check --download`；禁止 `rclone sync`、删除、修改 timer 或手动生成新批次来替代验收。

记录 `Result/ExecMainStatus`、timer/journal 时间戳、**真实自动批次名**、本地与远端 bytes/SHA256 比对结果、Uploads 一致性及异常。D3 的 `PASS` 只能在上述证据全部具备时写入；否则保持 `BLOCKED/WAITING EVIDENCE`。D4 仍不得 CLOSED，并保留原 checkout、原上传数据及 P2-C rollback 资产。

### 4.4 D3 同批次远端验证（2026-10-09，操作员 SSH）

针对首次自动批次 `20261009_073020`，操作员在生产 VM 通过只读 SHA256 对照：

| 对象 | 远端 | 结果 |
| --- | --- | --- |
| `sanqin_db_20261009_073020.sql.gz` | `gdrive_backup:sanqin-backups/database-daily` | 本地 SHA256 = 远端解密后字节 SHA256：**PASS** |
| `sanqin_config_20261009_073020.tar.gz` | `gdrive_secure:config` | 本地 SHA256 = 远端解密后字节 SHA256：**PASS** |
| `sanqin_nginx_20261009_073020.tar.gz` | `gdrive_secure:nginx` | root-only 本地读取的 SHA256 = 远端解密后字节 SHA256：**PASS** |

同期 `gzip -t`：数据库 **PASS**，Config **PASS**，Nginx **PASS**（受控 `sudo -n gzip -t`）。2026-10-09 15:33:38 UTC 在生产 VM 执行 `rclone check /srv/sanq/uploads gdrive_backup:sanqin-backups/uploads-current --download --checkers 4`，远端返回 **87 matching files / 0 differences / exit 0**。该结果证明核验时的当前镜像与生产 Uploads 一致；**并不是 07:30 时点冻结快照**。此自动批次不需重新进行第二次离机 PostgreSQL restore，D1 已针对首次新布局手动批次完成异机恢复。**D3 PRODUCTION VERIFIED / PASS；C4 仍须待 D0/D1/D2 全门禁证据齐全才可 D4 CLOSED。**

### 4.5 D0 — Runtime 已安装完整性与持久状态补充（2026-10-09）

操作员在生产 VM 直接执行**只读** Python 检查（非由 MCP 读取 Runtime 私有目录），确认：

| 合同 | 验证结果 |
| --- | --- |
| `/opt`、`/opt/sanq`、`/opt/sanq/runtime` | 真实目录；root-owned、不可组/其他用户写入：PASS |
| `.sanq-backup-layout-activated` | root-owned 常规文件、内容 `SANQ_BACKUP_LAYOUT_C4_V1`、无宽松写权限：PASS |
| Runtime `.env` | 常规文件、ubuntu 拥有、模式 `0600`；未输出秘密内容：PASS |
| `runtime-release.json` | root-owned、禁止宽松写；`productionActivationAuthorized=false`：PASS |
| `runtime-release.json` 的 17 个成员 | 非 symlink 常规文件、root-owned、无宽松写权限、文件大小与 SHA256 对上 Manifest **17/17 PASS** |
| Runtime `sourceSha` | `a84b72007e6b4e82c981101e56c897355757c0ff`，与此前确认的生产应用镜像 SHA 一致 |

上述检查是 **Runtime 本地 Manifest 合同**；GitHub 外部发布证明沿用 P2-A 的原始审核结果，不能将此本地检查伪称为重新独立验证发布链。

此阶段只读确认与切流直接相关的数据库恢复控制结果和运行日志（§4.1、§4.2），不以单独业务系统的任务状态、外部接口进度或功能验收作为 C4 的通过条件。受限 Docker 精确错误关键词检查结果见 §4.2。

**D0 关键只读门禁已 PASS，完整范围待最终审阅**：Runtime 激活标记及 17/17 本地文件、实际挂载、4/4 容器 Healthy/0 restarts、Nginx 服务与默认错误日志有限筛查、首次自动备份均已有证据。未进行真实生产写入探针，也未遍历所有轮转日志或重新独立核对 GitHub 外部信任证明；这些是证据边界，不自动转化成新的业务功能验收要求，D4 审计时按既定标准明确记录。本轮没有修改生产代码、Runtime、Database、Uploads 或 Timer。

### 4.6 D0 — Nginx 运行和默认错误日志（2026-10-09）

操作员使用生产 SSH 只读命令获取结果：

| 项目 | 结果 |
| --- | --- |
| `systemctl show nginx` | `ActiveState=active`、`SubState=running`、`NRestarts=0` |
| 默认错误日志文件 | `/var/log/nginx/error.log` 存在，可使用受控 `sudo -n tail` 读取 |
| 本日默认日志条目 | 对最后 20,000 行中日期为 `2026/10/09` 的记录计数 **0** |
| `[error|crit|alert|emerg]` 等严重条目 | **0** |
| 代理连接超时/失败、permission denied、路径不存在 | **0** |
| 日志命令退出码 | **0** |

**判定：NGINX STATUS + BOUNDED DEFAULT ERROR LOG CHECK PASS。** 因为只检查默认 `error.log` 最近 20,000 行，不包含轮转日志、站点专属文件和 journald，`0 entries` **不能推断全日所有 Nginx 事件均为零**，也不能证明公网业务 E2E。D0 未验证边界见 §4.5；D2 已获得上线站点五端页面与关键存储资产预览的操作员确认。

### 4.7 D2 — 操作员报告的生产页面 Smoke（2026-10-09）

操作员明确回报：**顾客首页、菜单、Admin、Accounting 和 POS 均正常；Accounting 已有附件和顾客端菜品图片能够正常预览显示**。该反馈为用户侧手动页面和文件读取 Smoke，不是自动化测试，操作员没有逐项提供截图或 HTTP 状态码。因此按证据原样记录：

| 生产页面 | 证据 | 状态 |
| --- | --- | --- |
| 顾客首页 | 操作员确认正常 | **PAGE SMOKE PASS** |
| 顾客菜单 | 操作员确认正常 | **PAGE SMOKE PASS** |
| Admin | 操作员确认正常 | **PAGE SMOKE PASS** |
| Accounting | 操作员确认正常 | **PAGE SMOKE PASS** |
| POS | 操作员确认正常 | **PAGE SMOKE PASS** |
| Accounting 已有附件预览 | 操作员确认正常显示 | **ASSET READ PASS** |
| 顾客端已有图片预览 | 操作员确认正常显示 | **ASSET READ PASS** |

**判定：D2 SCOPE PASS。** 当前生产站点的五端页面和代表性的现有 Accounting 附件、顾客图片均已由操作员确认可读、可预览，支持新 Uploads 路径实际可通过应用访问。该结果不声称中英切换每个分支、购物车所有条件、逐笔订单、角色矩阵、打印设备或实际收付款均已逐项实测；**这些深层功能和未关联的第三方平台/支付集成验收不是此次 Runtime/Uploads/Backup 切流的关闭门禁**。不应为了 C4 制造真实交易或调用外部平台。

### 4.8 D4 最终审计与有限范围关闭决定（2026-10-09）

**操作员授权：** 针对 `PostgreSQL global roles` 和 Linux Nginx symlink 两项隔离恢复发现，先补充安全恢复方案，随后允许按**有限范围**关闭 C4。本次没有将任何业务模块/外部平台生产联调重新列为 C4 验收门禁。

| 审计项目 | 现有证据 | D4 结论 |
| --- | --- | --- |
| D0 — Runtime/挂载/健康 | 17/17 Manifest SHA + activation marker、API/Worker 实际 Uploads、原 DB volume、4/4 Healthy/0 restarts，有限日志关键字无新存储错误 | **SCOPE PASS** |
| D1 — 异机独立恢复 | `20261009_033755` PG15 clean restore、204 applied + 1 rolled back + 0 unresolved、1765 active Journals 0 不平衡、88 DB 文件关联、离机解密/校验 Uploads 与配置 | **DATA RECOVERY PASS；FULL RUNTIME PARTIAL** |
| D2 — 已上线站点 | 五端页面正常，Accounting 既有附件和顾客菜单图片可预览 | **SCOPE PASS** |
| D3 — 自动备份 | 首次定时 `20261009_073020` 成功；3 份远端解密后 SHA256 MATCH，三 GZIP 完好，Uploads 87/87 `--download` | **PRODUCTION VERIFIED / PASS** |
| D4 — 限定关闭 | 已明确接受**不含隔离角色回放及 API/Web/Nginx 服务启动**的范围；两处恢复处理路径见 `docs/runbooks/backup-recovery.zh-CN.md` §8.2 / §9.1.1；离机角色快照捕获 SHA256 及 DMG 正常卸载见下文 | **LIMITED-SCOPE ACCEPTANCE COMPLETE / DOCUMENT DELIVERY PENDING** |

**两处恢复问题的准确处理状态：**

1. **PostgreSQL global roles：**生产备份现为 `pg_dump` 单库，没有角色。2026-10-09 生产数据库**只读**查询确认 `sanqin-app` 可登录且具 superuser 权限，`sanq_mcp_ro` 为 `NOINHERIT`、连接限制 3 的只读角色，无二者相关成员授权记录。恢复手册 §9.1.1 给出角色备份与隔离回放合同。操作员现已从 Mac Terminal 通过 SSH 对生产数据库运行 `pg_dumpall --roles-only --no-role-passwords`，直接保存到原有 AES-256 加密 DMG `sanq-rclone-crypt-escrow-20261001.dmg` 内，得到 `role_snapshot=CAPTURED_IN_ENCRYPTED_DMG`；在已挂载卷上计算角色 SQL 的 SHA256 `d2624c69d0887a861d5e7b5223f7cacf44b486f6b32c121a2bebaa0d7204f2bc`，后续 `hdiutil detach` 返回 `disk2 ejected`。**OFF-VM ROLE SNAPSHOT CAPTURE PASS（操作员提供的终端证据，未由 MCP 读取 DMG 独立复核）**；角色定义不含密码哈希，离机 PG15 角色回放、凭据恢复及未来自动周期性 roles 备份均 **NOT VERIFIED / OUT OF C4 LIMITED SCOPE**，不能宣称完整登录恢复或持久自动化已完成。
2. **Nginx symlink：**受保护脚本 `tar -C /etc nginx ssl` 按预期保留 Linux symlink；MacBook 上因为绝对目标依赖原系统，直接解包并非正确验证方式。恢复手册 §8.2 新增归档成员审查、Mac 仅提取安全普通文件、隔离 Ubuntu 按目标重建链接并执行 `nginx -t` 的步骤。**生产配置不需要也未进行修复；隔离 Ubuntu 完整重建/测试仍未执行**，其状态为 `PROCEDURE DOCUMENTED / LINUX REBUILD NOT VERIFIED`。
3. **API/Web 隔离启动：**MacBook 当前没有安全启动恢复生产数据所需的隔离 runtime，本次不声称完全 DR E2E。可在独立 Backup/Recovery 演练计划中补验证，但该 deferred 不等于本次 Runtime/Uploads/Backups 切流失败。

**保留边界：**有限范围关闭不证明生产应用新写入探针、每一种账号角色路径或任一正式外部交易；不变更 `SOURCE_FILES`、DB/migrations、备份脚本/retention、Nginx 或生产服务。继续保留旧 `/home/ubuntu/sanq-app`、既有 root 私有回退快照、原 Uploads/Backups、离机 escrow 和可信 Runtime Archive 证明。回退材料清理必须进入后续 C5 独立审计并获得明确授权。

**交付门禁：**两处恢复方案已成文、操作员已给出 roles 在加密 DMG 中成功捕获的脱敏证据，**D4 有限范围业务/运行证据验收完成**。当前 Workspace 文档仍仅供本地审阅，未提交/推送远端、未创建 PR。依照既定交付流程，用户审阅并另行授权后才能经 dev PR、CI 全绿、合并，把状态正式登记为 `C4 LIMITED-SCOPE PRODUCTION VERIFIED / CLOSED`；在此之前标 `LIMITED-SCOPE ACCEPTANCE COMPLETE / PENDING DOCUMENT PR+CI`。该限定关闭绝不等于 `FULL DISASTER RECOVERY VERIFIED`。




