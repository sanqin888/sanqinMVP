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

- `R2-A1-MCP LIVE OBSERVATION = PASS_SCOPED`：仅限 §2 的容器/系统状态。
- `R2-A1-HOST-READ-001 = PROPOSED / NOT EXECUTED / NOT AUTHORIZED`：H01–H10 待用户独立审阅批准；G01–G07 不得自行变为通过。
- `R2-A1 OVERALL = PARTIAL / HOST INVENTORY OPEN`，尚不能授予 R2-A2 冻结安全设计最终准入或 R2-B 真机权限。
- `R2/C4 OPEN; R1/C1 OPEN; AWS S01–S12 OPEN; C5-G2 NO-GO; S2 DAILY PAUSED; C2 LIMITED CLOSED`，不修改已关闭历史验收事实。
- 仅 Runtime/Ops 归属的文档审计。无新增运行时代码/执行入口/共享公共合同/依赖边/循环/兼容层，17 Bundle、CI、package/lockfile、Prisma/schema/migration、IAM/VM/生产均未更动。MCP-workspace 无 lint/build/test 权限，本批 docs-only 不声称 CI。用户审阅后另授权远端 PR→`dev`、CI 全绿后合并；现场命令执行另须准确授权。

