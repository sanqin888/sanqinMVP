# R2-A1 — MAINT-RESTART-01 真实生产清单与接口只读核验

> 2026-10-22（America/Toronto）。**LOCAL DOC-ONLY / MCP LIVE BASELINE PASS_SCOPED / HOST FULL INVENTORY OPEN / NO PRODUCTION MUTATION / NOT PUSHED**。

## 1. 范围、权威合同与权限

- 本批承接 [R0 §2 D2 / §4.1 / §5 R2](Runtime更新-R0冻结设计.md)、[AWS 快照与维护冻结方案 §3–7](Runtime更新-AWS快照与维护冻结方案.md)、现役 C4 备份恢复验收，以及仓库 `AGENTS.md`。只做生产现状的**只读审计**与下一次具体 Host 只读命令审批候选；不形成真实维护冻结，也不关闭 R2/C4。
- `MAINT-RESTART-01` 已批准的长期合同不变：先保留管理通道及记录原策略，再准确 `restart=no`、正常停服和持续阻止其他启动/写入入口；跨 Docker/VM 重启、新实例首启仍处于维护；成功准确恢复原状态，事故保持冻结。17+Manifest 内的 Compose 不允许被手改。
- R1C-1 `normal_runtime_update.py` 仅为无活适配器的统一流程核心；旧 `isolated_maintenance_operator.py` 仅隔离实验。R2-A1 不修改这两者、不改 MCP 的现有执行 allowlist、不发起 `docker inspect` 或 `systemctl` 的未开放生产命令。
- 不执行 `docker stop/update/compose up/run`、`systemctl stop/disable/mask`、`crontab` 变更、网络阻断、数据库写入、root/sudo/IAM/AWS、SSH 新连接、快照或安装。读取时不得输出 `.env`、密钥、环境变量、`/proc/*/environ`、客户/订单/支付原文、完整 rclone 配置和 TLS 私钥。

## 2. 当次直接可证事实（MCP 现场）

2026-10-22T19:34:16+00:00 通过既有 `system_status`、`docker_status(include_stopped=true)`、生产 GitHub `main` 视图取得：

| ID | 确认的事实 | 证据权威/边界 | 状态 |
| --- | --- | --- | --- |
| LIVE-01 | Docker service `active`；`sanq-mcp-tunnel` `active`；主机 uptime 65d；根盘 58G/已用22G/可用37G；内存1.9Gi/available713Mi，swap4Gi | 现场固定 system_status；不等于独立管理通道故障可用 | PASS_SCOPED |
| LIVE-02 | Compose `sanq-app`：`sanq-app-db-1` PostgreSQL15-alpine、`sanq-app-api-1`、`sanq-app-ubereats-worker-1`、`sanq-app-web-1` 均 `Up (healthy)` | `docker compose ps --all`；只显示正常运行和镜像，不显示容器 restart metadata | PASS_SCOPED |
| LIVE-03 | API、Uber worker 镜像均为 `ghcr.io/sanqin888/sanq-api:ff5be8d5f3fefe2b30861fe59c1b859e110ce3b8`；Web 为配对 `sanq-web:ff5be8d5f3fefe2b30861fe59c1b859e110ce3b8` | 现场 compose ps，尚未核对 RepoDigests、Runtime 17+Manifest / release state 与实际磁盘 | PASS_SCOPED |
| LIVE-04 | 生产源码查询工具回报 GitHub `main@ef5caa32704dd59217b1151a5976e826c843c98f`；审计工作区 `dev@5e1b9608`（本地分支另建） | **GitHub 源码视图，不是已安装 Runtime 文件 hash**；不能用 `main` 或 `dev` 代替现役镜像 | PASS_SCOPED |
| SRC-01 | 生产 GitHub `main` Compose 中四项 `db/api/ubereats-worker/web` 均声明 `restart: always`；项目 `sanq-app`、DB 预期 `sanq-app_pgdata`、Uploads 预期 `/srv/sanq/uploads` | 只证明源码声明，不能证明容器实际 `.HostConfig.RestartPolicy.Name` 或当前 Mounts | SOURCE_ONLY |
| SRC-02 | `ops/release/deploy_release.py` 的 `promote_images()` 会对 API、worker、Web 执行受限 `compose up -d`；candidate Prisma 状态走 `compose run --rm`；有 operator-triggered deploy/rollback | 源码中的潜在重新创建/新容器入口，不证明当前有计划任务在执行它 | SOURCE_ONLY |
| SRC-03 | `ops/backup/sanq-backup.service` 模板为 `User=ubuntu`，执行 `/home/ubuntu/backup-db.sh`；备份源含 DB / uploads-current-history / helper / rclone 外部同步 | 只证明模板；Host 上安装的 unit/timer 当前状态及脚本原件须另取 | SOURCE_ONLY |
| HIST-01 | 2026-10-09 P2-D 操作员 SSH 回执曾核对实际 DB volume `sanq-app_pgdata`、API/worker Mount Source `/srv/sanq/uploads`；`sanq-backup.timer` active/enabled、03:30 Toronto 执行成功 | 历史已登记限定证据，**不能替代 10-22 新鲜挂载/timer 状态** | HISTORICAL_ONLY |

## 3. 当次不能由现役 MCP 证明的事实（必须保持 UNKNOWN）

| 门禁 | 仍缺事实 | 风险 |
| --- | --- | --- |
| G01 容器实际策略 | 四个准确容器 ID、Compose labels、HostConfig.RestartPolicy、RestartCount、live Mounts/Volume identity、是否存在同项目孤儿容器 | Compose 声明不等于运行时配置，recreate 可恢复 always |
| G02 Host 启动入口 | Docker、nginx、备份 timer/service、MCP tunnel、SSH 的 systemd 单元实际加载路径、enabled/active 与 drop-ins；其他匹配的 timer/service | 未记录的启动服务可绕过维护 |
| G03 cron/非 systemd 入口 | 用户/root crontab、`/etc/cron.*` 的存在与有效任务、定时备份和重启 helper 位置 | 禁用 systemd timer 不等于清空其他任务 |
| G04 非容器执行者 | 独立 deploy/backup/rclone/Compose 命令、残留 service/helper、进程持有者和新启动者 | 一次空扫描不足以证明持续排他 |
| G05 Runtime/Release 本地身份 | 实际 `/opt/sanq/runtime` 17+Manifest 的字节、owner/mode、当前 release state 与镜像和卷身份 | 只读源码/容器 ps 不等于真实安装身份 |
| G06 管理能力与权限 | 操作员可用的独立 SSH/云控制台、MCP 进程的启动入口及授权边界；AWS/生产审计主体 | 冻结事故时不能失去救援通道或扩大 sudo |
| G07 数据一致与外部事件 | 当前备份健康、数据库一致恢复点、Uploads/外部卷覆盖、支付/订单在途事件保管 | 容器全部 stop 不自动等于一致快照和外部终态 |

现役 MCP `ops/sanq-mcp/server.py` 的 system process allowlist 只包含固定 time/uptime/free/df 与 `systemctl is-active docker/sanq-mcp-tunnel`；生产 Docker 读工具只允许 `docker compose ps/logs`，不暴露任意 Host 命令、容器 inspect、unit file、cron、`/proc` 或 AWS 查询。不能靠扩大通用执行权限或把工具返回为 `active` 推导这些门禁已成立。

## 4. R2-A1-HOST-READ-001：下一批固定生产 Host 只读候选（**未获现场执行批准**）

下列仅是用于用户审阅的**具体命令候选**，不得由 MCP 或助手擅自绕过 allowlist 执行。建议使用已有受控生产 SSH 会话由操作者按批许可运行；执行前复核当次主机身份、sudo/root 必要性、时间窗口与脱敏回执方式。以下命令不包含 root/sudo、不改变 systemd、Docker、数据库、网络或文件。任一命令因权限失败即如实记录 rc，不能提权重试。

| 批次/ID | 固定只读 argv（模板；非执行记录） | 取证结果/注意 |
| --- | --- | --- |
| H01 | `date --iso-8601=seconds` | 采集时点、UTC offset；独立 rc |
| H02 | `docker ps -a --no-trunc --filter label=com.docker.compose.project=sanq-app --format '{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}'` | 匹配/孤儿候选；只看项目标签，不据此排除其他项目的写入者 |
| H03 | `docker inspect --type container --format '{{.Id}}|{{.Name}}|{{.HostConfig.RestartPolicy.Name}}|{{.State.Status}}|{{.RestartCount}}' sanq-app-db-1 sanq-app-api-1 sanq-app-ubereats-worker-1 sanq-app-web-1` | 四个准确容器实际策略；同批某个不存在时命令非零并 BLOCKED |
| H04 | `docker inspect --type container --format '{{.Name}}|{{json .Mounts}}' sanq-app-db-1 sanq-app-api-1 sanq-app-ubereats-worker-1 sanq-app-web-1` | 原始 Mounts 仅保管在私有证据；入 Git 文档只摘要预期 volume/bind 比对，不传播异常隐私路径 |
| H05 | `docker volume inspect --format '{{.Name}}|{{.Driver}}|{{.Mountpoint}}' sanq-app_pgdata` | DB 预期 volume；不可读取 DB 内容 |
| H06 | `systemctl show docker.service nginx.service ssh.service sanq-mcp-tunnel.service -p Id -p LoadState -p ActiveState -p SubState -p UnitFileState -p FragmentPath -p DropInPaths -p User` | 原始 unit/DropIn 路径与状态，不读取 `Environment`/`ExecStart` 的秘密值 |
| H07 | `systemctl show sanq-backup.timer sanq-backup.service -p Id -p LoadState -p ActiveState -p SubState -p UnitFileState -p FragmentPath -p DropInPaths -p LastTriggerUSec -p NextElapseUSecRealtime -p Result -p ExecMainStatus` | 与 10-09 历史状态新鲜对照；未来不因预检触发备份 |
| H08 | `systemctl list-timers --all --no-pager --no-legend` | 先以名字和计划检查其他 timer；异常再单独审批对应 unit 元数据 |
| H09 | `systemctl list-units --all --type=service --no-pager --plain --no-legend` | 只列服务名称/状态，不导出 unit 配置或凭据；未知服务需单独裁定 |
| H10 | `ps -eo pid=,ppid=,user=,comm=` | 仅进程名称与身份，不采 args/env/cwd/fd；异常 holder/namespace 才申请定向深查 |

**未预授权的第二层**：root crontab 内容、`/etc/cron.d` 文件正文、unit `Environment=`、完整 `ExecStart=` 启动参数、`/proc/<pid>/fd|cwd|mountinfo|environ`、其他 Docker project/service、套接字/进程/namespace 深扫、MCP 实际 sudoers、SSH/云凭据、AWS API 信息，以及任何 `sudo` 均不属于本次 H01–H10。可先只登记其可能存在与审计缺口，若必要再分别冻结准确对象、脱敏规则和命令请求许可。

安全限制：必须独立保留每条命令实际 rc、UTC 与 bounded stdout/stderr；不允许执行后将不同主机、不同时点的状态拼接为 `FROZEN`。原始清单含 Host 路径、容器 IDs 和进程身份时只能留在操作者受控私有位置；仓库写脱敏摘要。中断/无权限标 `NOT_OBSERVED` 或 `BLOCKED`，不能重跑写命令补证。

## 5. 接口缺口与后续 R2-A2 / R2-B 决策

1. 在现有 `NormalUpdateFlow` 的 `record_original_state`、`freeze_maintenance`、`recheck_frozen`、`restore_original_policies` 边界内设计准确 Host 适配器，恢复原策略与最终 `release_business` 分离。首版不重构 Payments/Uber/POS；对进程内定时任务通过停止对应应用容器和禁入验证覆盖，必要时再增加独立消费端阻断设计。
2. 维护准入必须明确阻止 `deploy_release.py` 的 `compose up/run`、人工 Compose、backup service/helper/rclone、MCP 生产写接口及 systemd/cron 自动唤醒；只设置现有容器 restart=no 不能阻止 recreate。不能直接修改受保护 Compose 或扩展任意 sudo 权限。
3. 对关键写入路径提出 `拒绝新消费者` 的正向验证和跨 daemon/VM/替代实例首启的持续冻结验证计划。`flock`、有限进程扫描、容器停止和 CI-only synthetic 不能证明这些性质。
4. 异常或 unknown：保持维护、保留持久记录，禁止 `finally` 无条件恢复、旧 journal 重放、自动快照/生产更新。应先独立核对所有管理通道与备份/恢复前置条件。

## 6. 本批结论、变更与交付门禁

- `R2-A1-MCP LIVE OBSERVATION = PASS_SCOPED`：仅限 §2 的容器/系统状态；2026-10-23 操作员补充 H01–H10 现场文本证据，限定复核见 §7，不追溯覆盖原始 10-22 状态。
- `R2-A1-HOST-READ-001 = 2026-10-23 OPERATOR OUTPUT RECEIVED / PASS_SCOPED`：H01–H10 已由操作员经生产 SSH 回传，**未提供每条命令独立 rc/封存**；H08/H09 单元名部分被终端截断；G01 关键策略/挂载已确认、G02 核心 unit 已确认但仍未全量关闭，其他门禁继续 OPEN（§7）。
- `R2-A1 OVERALL = PARTIAL / HOST INVENTORY OPEN`，尚不能授予 R2-A2 冻结安全设计最终准入或 R2-B 真机权限。
- `R2/C4 OPEN; R1/C1 OPEN; AWS S01–S12 OPEN; C5-G2 NO-GO; S2 DAILY PAUSED; C2 LIMITED CLOSED`，不修改已关闭历史验收事实。
- 仅 Runtime/Ops 归属的文档审计。无新增运行时代码/执行入口/共享公共合同/依赖边/循环/兼容层，17 Bundle、CI、package/lockfile、Prisma/schema/migration、IAM/VM/生产均未更动。MCP-workspace 无 lint/build/test 权限，本批 docs-only 不声称 CI。用户审阅后另授权远端 PR→`dev`、CI 全绿后合并；现场命令执行另须准确授权。

## 7. 2026-10-23 — 真实生产 Host H01–H10 操作员输出限定复核（LOCAL EVIDENCE REVIEW）

**记录载体：**基于已合并 PR #2913 / `origin/dev@9d61dd11` 新建独立本地文档分支 `docs/runtime-r2a1-host-read-evidence-20261023`；本次尚未推远端、未执行本地 tests/CI，也未通过 MCP 增加 Host 查询权限。

**来源与边界：**操作员在生产 `ubuntu@sanq-web` SSH 会话粘贴 H01–H07 终端输出（H01 时间 `2026-10-23T12:02:13+00:00`）；继而上传 `粘贴的 Markdown (1)(20261023-120626).md`，内含 H08、H09、H10 的逐行控制台文本。以上仅是操作员提供的输出，而非 MCP 对原始 Host 取证的独立再执行或 SHA/签名封存。H01–H07 合并粘贴中曾出现命令换行错位，未提供各 argv 独立外层 rc；H08/H09 输出受终端列宽影响，部分 unit 名和时刻带省略号。本次接受**准确字段的限定现场证据**，不升级成完整/连续的维护屏障证明。

| 项目 | 已观察的准确事实 | 局限与结论 |
| --- | --- | --- |
| H01–H03 | 四个 `sanq-app-{db,api,ubereats-worker,web}-1` 状态 running/healthy；Docker `HostConfig.RestartPolicy.Name=always` **4/4**，`RestartCount=0` **4/4**；容器实例 ID 在操作员输出中可区分 | **G01 关键策略 PASS_SCOPED**；不代表永久不会自行重启，后续实时身份/策略重查仍必要 |
| H04–H05 | DB Volume `sanq-app_pgdata` 绑定 PostgreSQL 数据目录；API 与 worker `/srv/sanq/uploads:/app/uploads` 为 RW；Web `/home/ubuntu/sanq-assets/sounds` 为 RO；DB volume driver local | **G01 关键挂载 PASS_SCOPED**；声音文件和其他主机持久数据范围须纳入后续 AWS Snapshot/恢复覆盖评审，不在此证明快照完整性 |
| H06 | `docker/nginx/ssh/sanq-mcp-tunnel` 均 loaded/active/running/enabled；SSH 有 EC2 Instance Connect drop-in；MCP tunnel User=ubuntu | **G02 已核实核心 unit**，保留 SSH 与独立管理能力；尚未核实救援实际可达性 |
| H07 | `sanq-backup.timer` active/waiting/enabled，上次 UTC 2026-10-23 07:30:18 触发，下次 UTC 2026-10-24 07:30；`sanq-backup.service` inactive/dead，最近 `Result=success/ExecMainStatus=0` | **定时任务执行状态 PASS_SCOPED**；本批未检查当天备份归档、rclone 远端真值 |
| H08 | 列出 SanQ backup、apt-daily、apt-daily-upgrade、logrotate、dpkg-db-backup、fstrim、systemd-tmpfiles、snap repair、Ubuntu Pro 相关与其他系统定时器 | 单位名称/部分时间被终端截断；**必须补 `--full` 才可冻结全名单**；这不意味着系统 timer 应一律停用 |
| H09 | `cron.service`、`unattended-upgrades.service`、`containerd`、`docker`、`nginx`、`ssh`、`sanq-mcp-tunnel` 在列；Amazon SSM agent 处于 active/running | **G02 其他候选入口发现**；部分名字被截断；SSM 进程存在不等于已验证云端会话可连，不能仅凭运行中替代 SSH |
| H10 | Host 当前存在 `cron`、`unattended-upgr`、`packagekitd`、`amazon-ssm-agen`、MCP `tunnel-client → uv → python3`、Docker/containerd、容器下的 node/Next/postgres；有 `cloudflared`，其 PPID 是 `containerd-shim` | **单时点进程名称清单 PASS_SCOPED**；未见独立 `rclone`、`docker compose`、`deploy` 正在执行，但不能证明没有短时任务、非合作执行者或 PID namespace / FD 持有者；cloudflared 具体容器归属尚未独立绑定 |

### 7.1 对维护冻结的具体影响

1. **不提前改变 Compose：**现役四个容器 `always` 为**真实元数据**，符合正常营业策略。R2 后续对当次容器 ID 记录原策略后临时 `no`，成功再精确恢复；只停 Docker 或只改内存策略不解决 Compose recreate、daemon/VM 重启与新消费者问题。
2. **Cron 不是空入口：**`cron.service` 运行，但 `crontab -l`、root crontab、`/etc/cron.*` 的有效任务内容都未在本批提供。不得臆断没有部署/备份/复活脚本；亦不得在未核实其它用途时全面禁用 cron。
3. **Ubuntu 自动维护须评估：**`apt-daily[-upgrade]` timer 与 unattended-upgrades 守护进程存在；它们的执行窗口、是否触发 package/script/restart 及与受保护 Runtime 的实际重叠尚未核实。设计应在真实维护窗前记录并限定处理方式，而非常态关闭系统安全更新。
4. **管理保留：**SSH + EC2 Instance Connect drop-in、MCP tunnel、SSM Agent 都需按真实能力分别分类；SSM active 只是候选，不代表已验证备用控制通道。MCP 在冻结时必须禁止生产 mutating 入口但不能无意切断运维恢复通道。
5. **连续禁入仍是开放问题：**H10 未发现某名称的瞬间进程并不构成永久拒绝，新自动启动、外部调用/在途资金事件、backup、deploy/Compose 都必须由受控 R2 适配器正向阻断与复验。未授权的 root/SSH 深扫不能代替此设计。

### 7.2 下一层有限只读取证提议（**未执行 / 不授予新生产命令权**）

- **H11（完整 unit 名）：**由已有 operator SSH 按批准批次使用 `systemctl list-timers --all --full --no-pager --no-legend`、`systemctl list-units --all --type=service --full --no-pager --plain --no-legend`，只整理与维护直接相关的准确名称，不收集凭据与 unit 环境变量。
- **H12（Cron 范围/归属）：**先批准查看 ubuntu 账户的 `crontab -l` 和既知 `/etc/cron.*` 文件名/权限元数据；实际条目可能含私密参数，**只能先本地审阅、脱敏，不能直接贴公开仓库**。root 用户 cron 或其它账户仅在确定需要后另批授权，拒绝因访问失败任意 sudo 重试。
- **H13（Runtime/入口精确取证准备）：**固定 `/opt/sanq/runtime` 17+Manifest、当前应用 Release state、备份/部署/Cloudflared 真实起点与必要的 SHA/owner/mode 的只读清单/脱敏输出；有权限或范围超出审批时保持 BLOCKED，不扩大现有 MCP allowlist。

**阶段裁定：`H01–H10 OPERATOR TEXT REVIEW PASS_SCOPED / G01 CRITICAL DOCKER IDENTITY/POLICY/MOUNTS VERIFIED / G02 CORE UNIT STATES VERIFIED BUT FULL INVENTORY OPEN / G03–G07 OPEN / R2-A1 OVERALL PARTIAL / R2 C4 OPEN / C5-G2 NO-GO`.** 本次只记录证据与未执行候选，不影响真实生产、Runtime/Compose 17、现有备份任务、代码或权限；下一批继续先审阅 H11/H12，不直接进入维护冻结、AWS 快照或首次执行器部署。

## 8. 2026-10-23 — H11 timer 全名与 H12 ubuntu Cron/系统目录文件名现场回执（LOCAL）

本节继 §7 追加用户直接粘贴的生产 SSH 回执；**仅确认显示的静态名单，不替代原始逐条 rc、完整 cron 规则及生产维护互锁验收**。

| 核验项 | 精确现场观察 | 限定裁定 |
| --- | --- | --- |
| H11-TIMERS | `systemctl list-timers --all --full --no-pager --no-legend` 显示 15 个 timer：`motd-news.timer`、`dpkg-db-backup.timer`、`logrotate.timer`、`update-notifier-download.timer`、`systemd-tmpfiles-clean.timer`、`apt-daily.timer`、`apt-daily-upgrade.timer`、`sanq-backup.timer`、`man-db.timer`、`e2scrub_all.timer`、`fstrim.timer`、`update-notifier-motd.timer`、`apport-autoreport.timer`、`snapd.snap-repair.timer`、`ua-timer.timer` | **FULL NAMES OBSERVED / PASS_SCOPED**；后面 3 项当前无下一次计划（n/a），不代表永远不启用；仅当前 systemd 所报告 timer 集合，其他服务/cron 仍独立核验 |
| H11-SERVICES | 本次没有重新运行带 `--full` 的全量 service 清单；先前 H09 全量名单中部分服务名仍被截断 | **PARTIAL / NOT REPEATED**，不声称 service 全名单精确冻结 |
| H12-UBUNTU | `crontab -l` 只有标准说明注释，没有实际非注释调度行 | **ubuntu 用户个人 crontab EMPTY / PASS_SCOPED**；不代表 root 或其他用户没有任务 |
| H12-SYSTEM-FILENAMES | `/etc/cron.d`: `.placeholder`、`e2scrub_all`；`/etc/cron.hourly`: `.placeholder`；`/etc/cron.daily`: `apt-compat`、`dpkg`、`.placeholder`、`apport`、`logrotate`、`man-db`；`/etc/cron.weekly`: `.placeholder`、`man-db`；`/etc/cron.monthly`: `.placeholder` | **FILES OBSERVED / CONTENT UNVERIFIED**；`find -type f` 只列普通文件名称，尚未确认所有脚本权限、文件正文、系统 `/etc/crontab` 或调用关系，不把 placeholder 视为实际任务 |

**风险调整：**`ubuntu` 的个人 Cron 没有额外定时重启入口，15 个可见 systemd timer 中仅发现已知的 SanQ backup 专属 timer；但 `cron.service` 运行，且系统 Cron 文件的执行规则、root/其他账户 Cron 及全量服务启动入口仍是未完成证据。apt timer/unattended upgrades 是否在维护期修改 Docker/Runtime 或触发重启须基于真实配置而非猜测，不能一概停用 Ubuntu 安全维护。

**下一步只读候选（未执行）**：优先补 H11-SERVICES 的 `systemctl list-units --all --type=service --full --no-pager --plain --no-legend`；如需关闭 G03，应先审阅 `/etc/crontab` 和已列系统 Cron 脚本的权限/安全脱敏内容，root/其他账户的任务读取及任何 sudo 另批明确审批，不允许直接升级权限；并完成 G05 实装 Runtime/Release 身份映射。生产 Docker restart 仍保持 `always`。

**更新后状态：`H11-TIMERS PASS_SCOPED / H11-SERVICES PARTIAL / H12-UBUNTU EMPTY PASS_SCOPED / H12-SYSTEM-FILENAMES PASS_SCOPED / G01 VERIFIED SCOPED / G02 PARTIAL / G03 PARTIAL / G04–G07 OPEN / R2-A1 OVERALL PARTIAL / R2 C4 OPEN / C5-G2 NO-GO`.** 本批无生产更改、无 Runtime 执行或推送；不能进入冻结或 AWS 生产快照阶段。

## 9. 2026-10-23 — R2-A1-HOST-READ-002 生产入口/实装身份延续审计（新本地分支）

继已合并 PR #2913、#2914（#2914 CI #7476 SUCCESS），从 `origin/dev@d98acb089448836bdfef82fa5c498329b027ba52` 独立建立 `docs/runtime-r2a1-host-read-002-20261023`。本次仅复核已知 H01–H12、现役 MCP 的固定 `system_status / docker_status`（UTC 12:20:56，四业务容器仍 healthy）、最新 Runtime/Release/Backup/MCP 源码，不发起 H14–H17 Host 查询，不读取生产 Runtime 磁盘文件或凭据。

**新增的完整报告：**[R2-A1-HOST-READ-002 — 启动入口、Cron、Runtime 实装身份与 R2-A2 适配器条件](Runtime更新-R2-A1-HOST-READ-002启动入口与实装身份审计.md)。报告区分 docker/Compose/deploy/backup/cron/apt/nginx/Cloudflared/SSH/SSM/MCP 的启动风险与必要管理能力；提供 H14–H17 **未执行**、须用户单独批准的准确只读命令/脱敏/rc 条件，以及 17+Manifest 已安装 SHA 校验的固定路径候选；root/其他用户 Cron 的 sudo 查询明确另需许可，不以文档本身视为获批。

**裁定不越级：`G01 PASS_SCOPED / G02 PARTIAL / G03 PARTIAL / G04–G07 OPEN / R2-A1 OVERALL PARTIAL / R2/C4 OPEN / C5-G2 NO-GO`。** 现役应用镜像标记 `ff5be8d5…`、历史 Runtime 来源 `a84b7200…` 与 GitHub `main/dev` 不等于本批实测 17+Manifest 字节/Release state；SSM/EIC/MCP active 不证明独立故障救援可达。仍未进行任何容器策略变更、Cron/systemd/AWS 操作、维护冻结或快照。R2-A2 仅可进入**离线设计与合成验证准备**，真实 adapter、正式部署和生产执行须按新证据及另行授权审查；首次远端推送/PR 同样单独授权。

## 10. 2026-10-23 — HOST-READ-002 用户现场已执行结果 / Gate 续记

**证据入口：**[HOST-READ-002 §§8–12](Runtime更新-R2-A1-HOST-READ-002启动入口与实装身份审计.md) 逐项列出 H14–H18、G03 root Cron、G05 Release State、G07 磁盘/DB Volume 的 UTC 时间、退出码、准确 owner/mode/SHA、Docker/Cloudflare 路由及截图结果和负证据。该批由用户在生产 SSH（只读，获单独批准的 root 字段查询除外）及 Cloudflare 控制台实际观察；**不是**旧 §9 「未执行候选」的重复宣告。PR #2915 CI #7478 SUCCESS、merge `3ba4ac2b2496c5b1411ff16f3d5a65499d68133f` 已交付原审核合同，本续记使用独立本地分支且尚未交付。

- **H14/G02：**完整 services/unit files/sockets 与 9 个固定 unit 字段、SSM/EIC unit，`rc0`；`docker.socket` active，备份 timer enabled/waiting、SSH/MCP active、SSM agent running、EIC 当前 inactive。`G02 PARTIAL`，不能用此证明故障独立救援可用或跨重启冻结。
- **H15/G03：**系统 Cron `/etc/crontab`、`e2scrub_all` 和日/周运行项、apt timers/周期配置、unattended 已装默认行为均已直接读取；`ubuntu` 私有任务空，root `sudo -n crontab -l` 返回 `no crontab for root`、`rc=1`（正常无任务语义）。APT `Unattended-Upgrade=1` 但本机未显式启用 Auto-Reboot，已装实现默认 False；服务重启和其他用户 Cron 未证。`G03 PASS_SCOPED`。
- **H16/G05：**root-owned `/opt/sanq/runtime`、Manifest SHA256 `6f4fe7d6fcd9b819c79d153da297a950f15fd075e6553a530e87206191f40cf9`、来源 `a84b72007e6b4e82c981101e56c897355757c0ff`，固定 **17/17 manifestMatch True rc0**。另经用户批准只读 sudo 校验 root-owned state `phase=active`、`current=ff5be8d5f3fefe2b30861fe59c1b859e110ce3b8`、`previous=a84b72007e6b4e82c981101e56c897355757c0ff`、`rc0`。当前 API/Web/worker 镜像 ID/RepoDigests 已记录；当前业务未升级最新 Image **是主动保持安全边界**，不能把 Runtime Manifest 来源与业务镜像当前版本强行等同。`G05 PASS_SCOPED / INDEPENDENT_PROVENANCE_OPEN`。
- **H17–H18/G04：**实装 deploy/backup/helper hash 均匹配 Manifest；Docker/rclone 存在。`sanq-clover-dev-cloudflared` Docker 独立容器使用 `host` 网络、`unless-stopped`、2 个 RO bind（token/自定义 TLS 文件），无 Compose 标签；Cloudflare 控制台唯一显示的 Published application route 是 `clover-dev.sanq.ca → https://127.0.0.1:18080`，SNI name、CA Pool 两项定制，证书验证未关闭。观察时 `18080` 无监听，MacBook SSH 反向隧道不具当前端到端可用性证据。此容器按 Clover 本地 MacBook Sandbox 开发入口**保留且独立策略控制**，而非生产 API/Web worker 统一 stop 对象；Host 网络仍须维护期拒绝通向生产写接口。`G04 PARTIAL`。
- **G07：**`/opt/sanq/runtime`、`/srv/sanq/uploads`、`/srv/sanq/backups`、`/home/ubuntu/sanq-assets/sounds` 全在 `/dev/nvme0n1p1` ext4 根盘。数据库 `sanq-app_pgdata` 是 Docker `local/local` 且 `CustomOptions=NO`，Docker root `/var/lib/docker`、内核挂载/`lsblk` 未显示该卷独立数据盘；直接穿越 DB 目录曾 `rc1 Permission denied`，后续间接核验证明高可信根盘覆盖，**不能涂改失败回执**。`G07 ROOT_DISK_COVERAGE PASS_SCOPED / OVERALL PARTIAL`；快照/PG WAL/远端 backup/新 VM 恢复仍 OPEN。

**裁定：`G01 PASS_SCOPED / G02 PARTIAL / G03 PASS_SCOPED / G04 PARTIAL / G05 PASS_SCOPED / G06 OPEN / G07 ROOT_DISK PASS_SCOPED, OVERALL PARTIAL / R2-A1 INVENTORY READY FOR OFFLINE R2-A2-1 ONLY / R2-C4 OPEN / S01–S12 OPEN / C5-G2 NO-GO`。** 没有变更 Docker restart、systemd、Cron、AWS/IAM、Clover route、17 Bundle、Runtime 源码或数据；需要新的权限/持久 Boot Guard/正式安装/恢复演练须逐项另行授权，不能因本轮审计就宣告生产可更新。



