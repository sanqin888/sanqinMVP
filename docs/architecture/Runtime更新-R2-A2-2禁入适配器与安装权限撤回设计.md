# R2-A2-2 — Maintenance Fence 禁入适配器、安装权限与撤回方案（待审阅）

> 2026-10-23（America/Toronto）。**DESIGN ONLY / LOCAL REVIEW / IMPLEMENTATION NOT AUTHORIZED / PRODUCTION NO-GO**。基线：`origin/dev@fac45616`（PR #2917：R2-A2-1 离线模型与 25 个负例测试已合并）。**本次已由用户选择“安全优先的失败模式”：部分冻结/状态不明后若 VM 或 Docker daemon 重启，阻止整个 Docker daemon 启动，允许 Clover 开发隧道暂时不可用；只有经独立恢复授权后才解除。** 本次只起草方案，不安装 guard、修改 Runtime/Compose/备份/权限、部署、重启 Docker、使用 sudo 或 AWS。

## 1. 规范、权威依据和未跨越的边界

已对照 `AGENTS.md`、`.github/workflows/ci.yml`（`ops_runtime` → `ops-checks` 的 unittest）、[R0](Runtime更新-R0冻结设计.md)、[AWS 快照与维护冻结合同](Runtime更新-AWS快照与维护冻结方案.md)、[R2-A1-HOST-READ-002 §8–12](Runtime更新-R2-A1-HOST-READ-002启动入口与实装身份审计.md)、[R2-A2-1](Runtime更新-R2-A2-MaintenanceFence离线模型与失败测试.md)，以及 `ops/runtime/{maintenance_fence_contract.py,maintenance_fence.py,normal_runtime_update.py,build_bundle.py}`、`ops/release/deploy_release.py`、`ops/backup/{backup-db.sh,sanq-backup.service,sanq-backup.sudoers,sanq-backup-protected-nginx}` 与固定 `docker-compose.yml`。

**已合并而非待实现：**A2-1 仅维护不可变 `OriginalPolicyRecord`、`WriterStartupRegistry`、`FenceBinding`、候选 LOCAL/OFF_HOST receipt、观察和事故意图。其 `deny_verdict()` 永远 DENY，`authorizedToMutateProduction/readyToInstall/liveFenceVerified/persistenceVerified` 永远 false；没有真实文件落盘、CAS/epoch、Host 命令、Docker/Compose/backup gate、CLI 或与 `NormalUpdateFlow` 的连接。CI #7482 是合成测试通过，不是生产安全更新能力通过。

**R0 强制条件与本轮选择：**原策略先采集并机内/离机持久保全 → 可信、已验证的**先于 daemon 启动生效的重启屏障**与业务准入排他就绪 → 原子进入 ARMING（禁止新的写入准入）→ 排空已经准入的写操作/外部事件留存 → 逐个改容器 restart=no、停止业务、阻断重建 → 验证持续冻结 → 快照 available 后才可安装 Runtime → 事故保持冻结；窗口结束后按准确原记录恢复、独立放行业务。**任意一步部分冻结后重启都不得让尚为 restart=always 的生产容器自动恢复；此时允许 docker.service 被阻止、Clover 开发 Tunnel 暂时不可用。**不能改已受 Manifest 保护的 17 文件来“临时改 Compose”，不能用 `finally` 恢复服务、单次 `docker stop`、 `flock` 或静态 `ps` 代替持久门禁。

## 2. 已证生产对象与准确入口分类

| 生产对象 / 调用链 | 实测或源码依据 | 维护时意图 | 执行适配边界 |
| --- | --- | --- | --- |
| `sanq-app-api-1`, `sanq-app-web-1`, `sanq-app-ubereats-worker-1`, `sanq-app-db-1` | H01–H07：四容器实际 `restart=always`；DB local 卷 `sanq-app_pgdata`；当前配对 app tag `ff5be8d5…`；都 healthy | `CONTROL`；按在途写入排空、容器 ID/镜像/卷 pin，保存各自原策略，再受控改 `no` 与 stop，DB 最后停止 | 仅准确 ID；禁止按模糊 `name=db` 选择、批量操作其他 Docker 容器 |
| Docker daemon / `docker.socket` | H14：daemon active，socket active 可激活 daemon | 正常营业和不中断的维护进程中尽可能 `PRESERVE` 以执行精确 stop；**维护已 ARMING/FENCED/INCIDENT/不明后若 daemon 需重新启动，则由先于 daemon 的启动屏障拒绝整个 daemon** | 包括开机依赖、socket activation、直接 dockerd 及其他路径均需证明不能绕过；拒绝启动时 Docker 管理/API 一并不可用 |
| `deploy_release.py` | `deploy --execute` 与 `rollback --execute` 必须 root；`promote_images` 使用 `compose up -d --no-build --no-deps api ubereats-worker web`，迁移检测/执行还会 `compose run --rm --no-deps api`；会改 `.env`/release state，失败保留 pending | `CONTROL` / 维护期间拒绝独立进入旧 deploy 和 rollback（除另批明确审批的 recovery） | 必须在**任何** `pull`、`compose run`、`write_state`、`update_env_sha` 前进行根授权来源 + fence gate；已有 `--execute` 不是维护放行凭据 |
| 手工 `docker compose up/run/start/restart/create`、直接 Docker Engine API | Compose project `sanq-app`，现有 `docker-compose.yml` 仍声明 4×`restart: always`；H17/H18 未证明所有可控客户端 | `CONTROL`：维护时不允许重建业务容器、临时 api task/worker 或 volume 写者 | **不能仅在 deploy_release.py 加检查**；必须解决直接 Docker API/Compose/其他 root/docker-group 客户端绕过 |
| `sanq-backup.timer` → `sanq-backup.service` → `/home/ubuntu/backup-db.sh` | systemd timer active/waiting/enabled；oneshot `User=ubuntu`、`ExecStart=/home/ubuntu/backup-db.sh` | `BACKUP/CONTROL`：维护期不准启动或继续未清退的本地/远端备份操作；完成后恢复准确原状态 | 禁新 timer/manual service/直接脚本调用；存在已经在跑的备份时不得直接视为已冻结 |
| `backup-db.sh` 下游 | 源码有 `docker exec pg_dump/psql`、配置 `tar`、`rclone copy/copyto/sync/delete/rmdirs`、本地 `find -delete`、受保护 Nginx helper 的 `sudo -n` | `CONTROL`：这是具远端 mirror/retention 删除能力的副作用链，不是纯“只读备份” | 检查必须位于 **Task 0 之前**；timer 停掉不等于已运行脚本/独立 rclone 已消失；不得触碰备份/配置密钥原文 |
| `/usr/local/sbin/sanq-backup-protected-nginx` | root-owned helper；`ubuntu` sudoers 仅给固定带时间戳文件名的 helper 调用；helper 能读取 TLS 并复制 rclone config | `BACKUP/CONTROL`：作为独立 sudo 入口单独拒绝未获批副作用 | 不增加任意 root shell 或通配可执行程序；不能假定停掉 backup timer 已阻断直接 sudo helper |
| `sanq-clover-dev-cloudflared` | `host` network、`unless-stopped`、无 Compose 标签；Cloudflare 公网 Route → `https://127.0.0.1:18080`，MacBook 反向 SSH 当前未见监听 | 正常维护**不主动改动**其原 policy/容器/路由（`SANDBOX/PRESERVE`） | **安全优先例外：**若部分冻结后 boot/daemon 重启因维护屏障拒绝 Docker daemon，Clover Tunnel 暂不可用；不得以恢复开发隧道为由解除业务禁入 |
| SSH、MCP Tunnel、SSM agent、Nginx、系统 Cron/apt | H14–H15：已发现 systemd/cron/unattended；SSM/EIC 救援可达未证 | 管理与系统 `PRESERVE`；apt 维护冲突协调，不任意 mask 全系统 | G06 独立救援仍 OPEN；未满足前不得开启生产维护写操作 |

**未证项：**`ubuntu` 具有不经 sudo 执行 `docker` 的实际能力，但 Docker socket ACL/group 成员与直接操作覆盖范围未作本轮新鲜精确取证；其他用户 crontab、第三方 Docker API 客户端、Clover Tunnel 对生产端口的访问能力仍需验证。**不知道这些 ≠ 可以放行**。生产 `ff5be8d5…` 为主动保留版本，不应为 A2-2 提前升级。

## 3. 建议的适配器接口（待实现，当前仅说明）

- `HostInventoryAdapter`（只读）：准确发现 container full ID、name、Compose labels、镜像 **tag + RepoDigest/image ID**、Mounts、RestartPolicy Name/MaximumRetryCount、state、docker daemon/socket、systemd unit fragment/drop-ins/timer enabled/active、可达的 backup/deploy/cron/helper 与 Docker socket 调用主体；任何未知或缺证为 `UNKNOWN_OBJECT`。不得把机器扫描瞬时结果包装成“入口全集”。
- `FenceCustodyAdapter`（真正写入属于 **A2-3 另批**）：固定 host/owner/txid/epoch/request/registry、pre-effect 凭据、原策略/撤回记录写到 root-owned 本机受保护目录并 fsync 文件+目录；离机独立回执必须成功才能改变策略。需来自独立可信事务账本的 CAS/epoch；`PersistenceReceipt` 不能由内存数据造两份然后自称持久。
- `DockerFenceAdapter`：先验证准确 4 个运行容器及共享存储/镜像身份，**必须在持久重启屏障已可用、准入排他已 ARMING 后**停止新业务请求并排空已准入操作，按稳定顺序每个容器只允许一次 `restart=no` 更新与有序停止，DB 在消费者完全排空且 PG 安全检查后再停。每步前后再次 inspect；ID/mount/policy 与原记录不符即 INCIDENT；不中断的正常维护尽可能不改 Cloudflared 或其他容器。**如果 daemon/VM 在中途重启，启动屏障阻止整个 daemon，Clover 与 Docker 查询均可能不可用**；“容器已停”不等于全部禁入。
- `LaunchAdmissionAdapter`：面向旧 `deploy/rollback --execute`、手工 Compose/Engine API、其它真实执行路径，读取准确受保护 fence 状态与事务凭据，拒绝可能重启/创建业务容器、运行临时 DB writer、变更生产配置/Release State 的动作；仅准确受授权的冻结程序可做预定 `update restart=no / stop`（以及将来独立批准的恢复动作），并留下审计记录。**按生产资源/可写能力拒绝，不得仅依赖容器名或 Compose 标签**：改名容器、挂载 DB 卷/Uploads/Runtime、Docker socket、Host 父路径及网络连接仍需禁入。**仅守护一个 Python wrapper 无法覆盖直接 Docker API，AuthZ 更不证明 daemon 自身自动恢复被拦截；详见 §4。**
- `BackupAdmissionAdapter`：在备份服务真正 ExecStart **之前**及脚本第一处副作用之前拒绝；协调 timer 的原始 enabled/active 状态和既有运行中的 oneshot、`rclone`/helper，阻止已运行任务在冻结期间继续 mirror/delete；恢复时不能简单 enable/start 所有 unit。相关备份被暂停会导致次日备份缺口，必须记录时间窗口并在受控放行后补验。
- `ContinuousFenceObserver`：对上述真实 Host 状态、当前 bootID、Docker container 全量目标 ID、**生产资源的全部可写引用/网络路径**、Compose 类创建/启动、新 writer、unit/timer、SSH/独立救援、通常模式下 Clover preserve、外部事件持有重复验证并写入不可回滚审计。观察漂移要 INCIDENT；**观察器失联/机器重启不能自动取消禁入**，且 boot 阶段观察依赖 Docker API 不可用时需用 Docker 之外的可信状态与独立救援验证。

建议首批仅新增 `ops/runtime` 中的 Python 标准库协议、只读 discovery/fake adapters 与负例；真实系统副作用 adapter/权限安装分开独立审批，不对接生产 `NormalUpdateFlow`，其 StepCompletion 仍为不可执行声明。

### 3.1 已选 P0 — 跨重启启动屏障（Boot-time Startup Barrier）

**正式设计选择：SAFE_STOP_DOCKER_ON_UNCERTAIN_RESTART（安全优先）。** 在维护 `ARMING`、`FENCED`、`INCIDENT`，或者安装状态有效但维护状态缺失/损坏/离机来源无法判定时，只要 **Docker daemon 需要重新启动**（VM 断电/重启、daemon crash/restart、socket activation），必须**在 `dockerd` 处理容器自动恢复前**阻止整个 daemon 启动；即便部分生产容器的原始 `restart=always` 尚未改为 `no` 也不能恢复。这个屏障不是 Docker AuthZ 的能力：AuthZ 拒绝 Engine HTTP API 请求，不能据此推断 daemon 内部 restart manager 也被拦截。

**重要限制：**Docker 文档的 restart policy 与 `--live-restore` 是不同机制。在整个 VM 掉电/重启时，进程通常重新创建；在**仅 Docker daemon 重启**时，若存在 live-restore、独立 containerd/shim、此前已运行的写入进程，单纯拒绝新的 dockerd 启动**不等于已经终止这些进程**。必须同时有主机级写入准入/进程清退证据；PoC 要分别覆盖整机重启、daemon 单独崩溃及 socket activation。此处只冻结设计，不假设生产是否启用了 live-restore。参考 [Docker restart policies / live-restore](https://docs.docker.com/engine/containers/start-containers-automatically/)、[systemd ExecStartPre](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html)。

**两个运行时情形不得混淆：**

- **不中断的正常维护：**daemon 已运行，早先已获准的事务独占其受限操作能力，按 §6.1 顺序排空并完成四容器策略更新与停止；Clover 隧道保持运行，Docker 状态查询仍可能可用。此时靠事务排他、资源准入禁令和持续核验，而不是试图在运行中的 daemon 前再次执行开机屏障。
- **维护未解除且 daemon/VM 被迫重启：**持久启动屏障拒绝 `docker.service` 的真正 `ExecStart`；`docker.socket` 不能经 socket activation 绕过，其他 unit、独立 `dockerd`/containerd-shim 或 Docker 外部写者也不得绕过已批准的入口边界。**整个 Docker Engine 不可用，`sanq-clover-dev-cloudflared` 随之不可用是明确接受的降级**；不能声称此时仍可 `docker ps/inspect`、保证 Clover OAuth 公网可达或保持隧道连接。

**受限机制候选（尚未选择/安装）：**在受信任、不可由普通 Docker 用户改写的 systemd Docker 启动链设置**在 daemon 启动前执行的** root-owned guard（如 `docker.service` 的固定 `ExecStartPre`），读取独立 root-owned、持久原子提交的**安装锚点 + 事务状态/离机证据**；仅真实已验证的 `INSTALLED_INACTIVE` / 正式 RELEASED（且符合 §6.1）才可继续。守卫失败、超时、缺文件、版本/owner/签名/epoch 不明时不能误判为业务已解冻。涉及 `docker.socket`、systemd ordering、`Requires`/自动重试、直接 `dockerd` 启动的覆盖须在隔离 VM **完整逐一路径验证**，不能仅因 `ExecStartPre` 配置存在就宣布 S03 通过；`ConditionPathExists`、临时 `/run` 标记、失败后自动解除策略均不算持续保护。

**前置安全约束：**必须先证明 guard 随安装被可信固定且 **在修改任何容器 restart policy 之前**跨 boot 有效；安装锚点与维护事务应可独立于 Docker API 验真。如果无法证明无 systemd 旁路、daemon 之外的容器自启动/存活写入或可信救援，可在 `R2-A2-2` 离线设计中保留候选，但**不得开始生产冻结**。把 daemon 整体停在启动门外不等于阻止 Host 普通进程/rclone/网络写入，仍必须满足 §3.2 资源级禁入。

**Clover 与管理能力边界：**平常维护不主动修改独立 Clover 容器原来的 `unless-stopped`；异常重启时明确牺牲其可用性，不另行停止/重配 Cloudflare 公开路由。**这是 A2-1 `PRESERVE` 观察在事故模式下的例外，不是把隧道改成 CONTROL：此时必须记录 `INCIDENT`，绝不能把 Clover 未运行的状态伪报成合成 `FROZEN PASS`。**只有以后获批的**版本化异常模式观察合同**才能表达“事故降级但业务仍拒绝”，不得暗改原有 25 个测试。SSH/主机级独立救援路径必须**不依赖 Docker、Clover 隧道、Docker API 或 AuthZ 插件**，包含已核验的登录、权限、状态取证及受控修复机制。现有 SSM agent active / EIC installed **不等于** G06 已验收；G06 仍 OPEN、生产启用继续 NO-GO。风险代价为事故期间业务停摆、Clover 测试 OAuth 暂不可用以及现场 Docker 管理功能暂不可用，必须在安装审批前由用户明确接受，本次用户仅批准该**设计取向**。

### 3.2 已选 P0 — 按资源与写入能力禁入，不只按容器名

将 **受保护工作负载**（当前四个业务容器 ID）与 **受保护资源集合**（所有可写路径/句柄/网络目标）分开维护。资源清单基于现场挂载/守护进程权限核验，不是只看 Compose project label 或容器名称：

| 类别 | 首批准确资源 / 入口 | 必须拒绝或验明的写入能力 |
| --- | --- | --- |
| PostgreSQL | Docker local volume `sanq-app_pgdata`；容器 `/var/lib/postgresql/data`；生产 DB 可达地址/Unix socket | 改名或无标签容器挂载同卷、挂载卷所在宿主父目录、直接 Engine `exec`、网络客户端修改数据、已存在进程持续写入 |
| Uploads | `/srv/sanq/uploads` 及被批准的等价/父路径引用 | bind-mount 可写、host/symlink/父目录路径逃逸、已启动 writer |
| Runtime / 配置 | `/opt/sanq/runtime`、`.env`、`.sanq-release-state.json`、`runtime-release.json`、Compose 与 17+Manifest | bind 上级路径可写、Host `deploy` 和直接编辑、容器 privileged/可写 host path |
| 控制面 | 实际 Docker socket（需核实路径、owner、ACL）、`docker.service/socket`、可选 TCP/代理入口 | Docker socket 被容器 bind、Host 用户/客户端直连、Docker API 创建新的隐藏 writer 或修改 daemon 策略 |
| 备份/远端材料 | `/srv/sanq/backups`、`/home/ubuntu/backup-db.sh`、protected Nginx helper、rclone remotes | `rclone sync/delete/rmdirs`、本地删除与配置修改、直调脚本/helper、运行中事务 |
| 外部写口 | API/Web/Uber webhook、PostgreSQL 已确认网络口、支付与外卖供应商重试流 | 维护开始后新请求准入、既有订单/支付/worker drain 与事件留存一致性 |

**匹配规则：**基于已经规范化且通过独立可信观察的 Volume 实体/挂载源、父路径、容器 Mounts、Docker socket FD/capability、受信任网络 endpoint 与进程身份，拒绝**触达受保护资源的任何未授权新写入者**；当标识、等价路径、网络/挂载访问能力或观察全集无法证明时 `DENY/UNKNOWN_OBJECT`，不得以“没有 `sanq-app` label/四个名称”为允许依据。读接口也不得默认安全：`docker exec`、权限/挂载修改、镜像创建时的 host-path 访问都可能产生副作用。**Root 可直接改宿主文件或禁用屏障**，因此本合同的可信主体、root 授权/独立审计边界仍须另行收敛；不能声称在拥有宿主 root 的攻击者面前绝对不可绕过。若不能证明 Docker/Host/网络的直达写入路径全部受控，`S03 BLOCKED`，不能快照或更新。

**关键测试：**新建不同名称、无 Compose 标签或错误 image tag 的容器，尝试使用保护卷、Uploads、Runtime 父目录、Docker socket、host 网络数据库端口，以及在维护开始前已持有可写 FD 的宿主进程；每项必须观测到拒绝或安全排空及精确证据，不可拿单个容器名单过滤当通过。

## 4. Docker 和入口禁入：两种实施路线及必须明确的局限

**路线 A — 最小已知入口联动（建议先做离线样机，不得单独宣称符合 S03）：**
1. 受保护的入口 wrapper + systemd 受保护 drop-in 在脚本开始前查询 root-only fence 和独立 epoch/custody；旧 deploy 及手工维护入口必须经过固定 wrapper；timer/service 在 maintenance 时禁止启动备份；冻结时准确 4 容器改 restart=no 并停止。
2. **不足：**用户可以调用 `/usr/bin/docker`、`docker compose`、旧 `deploy_release.py`、直接 Python/script、root helper、`rclone` 绕过 wrapper。只改变 PATH、包装用户命令、按时扫描或记录规约不能阻止这种路径。当前 `ubuntu` 可以无 sudo 调用 Docker，而 Docker group/socket 近似 root 权限，因此尚无证据能证明所有 mutator 已被强制统一禁入。即使 Docker daemon 重启后 restart=no 保留，旧 Compose `restart: always` 仍可 recreate 业务。
3. 因此 **A 只是风险降低 + 离线验证候选，不能把 A2-1 `liveFenceVerified` 切为 true，不进入快照/Runtime 安装。**

**路线 B — 增加可信 Docker Engine/操作主体授权边界（后续独立审批才可能进入真实 S03）：**
1. 在已控 Linux 沙箱比较 Docker Engine 授权插件、专用最小权限 Docker API 代理与受限客户端权限移交；逐一验证 Engine API `create/start/restart/update/exec/compose run`、`docker compose up`、daemon/socket 激活、插件故障，以及**改名/无标签新容器对生产卷与 Host 资源的写入**。**它们只能是 daemon 活着时的受控请求准入层，不是跨 daemon 重启屏障**：部分冻结后掉电属于 §3.1 独立必验条件；此时允许 Docker daemon 整体启动失败、`status/inspect` 不可用、Clover 暂时不可用。Docker 默认 API 权限近似全有或全无；AuthZ 基于请求上下文判断 Engine API，不能推断已覆盖 daemon 内部重启。官方亦指出 gRPC/升级连接覆盖有限，不能据安装插件宣称全覆盖。
2. 插件/代理只在 daemon 可运行的阶段负责经其路由的请求，必须验证身份及资源授权，故障或未知时拒绝受保护写操作；**插件故障可能连 `docker ps/inspect` 等 GET 读操作一起拒绝，不能默认管理可用**。代理方案必须封闭宿主原生 Docker socket、TCP/Unix 其他入口与 direct root/docker-group 客户端，否则绕过代理直接调用 Engine。任何插件/代理不可用，都只能经 Docker **外部**的独立救援取证，不得为了查状态随手卸掉屏障或重启 daemon。实际启用插件可能需要 daemon 配置/重启，须以现场 Docker 版本及同版隔离 PoC 核验；本批不运行。
3. 根账号始终可能更改 daemon/authz/文件/内核；目标是经过授权、可审计的正常操作与 daemon 接口持续禁入，不虚构“root 也无法绕过”。**先做隔离 P0：四容器仅 API 已切换 `restart=no` 后中断，确保 docker.service 在恢复前就被挡住，随后才验证资源级准入**。若无法收敛 `ubuntu` Docker 权限、手工 root/其他用户直达路径、远端发起者、旧容器自动恢复或回调写入，`S03 BLOCKED`。
4. **本轮正式确定的是“异常重启先阻断整个 Docker daemon”的失败模式，不是已经选定 A/B/AuthZ/代理。** 先 A2-2 文档与离线 adapter 合同；同版本隔离 PoC 先检验独立启动屏障，再在不中断维护阶段比较 A/B 的强制资源级授权；生产安装与权限变更更晚单独审批。不把插件/代理纳入受保护 Runtime 17 文件清单，除非另行调整发布来源合同并获批准。

参考官方原理：[Docker daemon socket 权限](https://docs.docker.com/engine/security/protect-access/)、[Docker 授权插件及局限](https://docs.docker.com/engine/extend/plugins_authorization/)、[Docker daemon 安全](https://docs.docker.com/engine/security/)。

## 5. systemd/备份入口禁入与持久启动路径的选择

1. **不能假设对本地自建 unit 执行 `systemctl mask` 一定成功。** 官方 systemd 说明 mask 会在 `/etc/systemd/system` 建到 `/dev/null` 的 symlink；如果同名 unit 文件已在那里，操作可能失败。现场备份 service/timer 的 FragmentPath 需准确检查。A2-1 `frozen_policy()` 对全部 CONTROL SYSTEMD 都要求 `enabled_state=masked/active=inactive`，这仅是**合成期望值**。若将来选择 per-unit root-owned `ExecCondition`/drop-in 加持久拒绝与准确 disabled/inactive 状态，**它不满足现有 A2-1 纯模型的 masked 字面值**；不能暗改测试凑 PASS。必须在另批实现前提交合同影响分析，明确是构造可持续的真实 masked unit 还是版本化引入 `GUARDED_DENY` 的新原子观测字段，并经用户批准。后者必须有启动确实拒绝的独立现场负例，不能只靠状态布尔值。
2. 若采用 root-owned 持久 guard/drop-in，位置建议独立于 `/opt/sanq/runtime`，保证 AWS 根盘快照后仍优先拒绝，而不是把 guard 放在可被更新替换的活跃 17+Manifest 下。须处理 boot 前 guard 不存在/损坏、unit restart、timer catch-up、手工 `systemctl start`、`daemon-reload`、root shell 与 apt 触发服务重启。**timer disabled 不是手工服务启动禁令，run-time mask 跨 reboot 不成立。**
3. 备份脚本 `/home/ubuntu/backup-db.sh` 为 **ubuntu-owned 750**，直接可运行；受保护 helper 为 root-owned 且既有 sudoers 允许指定文件名调用。仅修改 `sanq-backup.service` 或停 `sanq-backup.timer` 无法封住直接脚本或 helper/rclone 的另一路操作；若需要强保证，须改变执行主体/调用能力或在可信低层统一执法，涉及现有备份所有权、rclone 凭据可达性、sudoers/服务权限，**必须单独授权**。不因维护便利把 `.env` 改成 root-owned（部署与备份合同要求 ubuntu-owner），不把证书/DB/rclone 凭据挪进普通模型回执。
4. 入维护前遇到备份正在运行必须等待可证明退出或按批准的安全取消协议处理，保护正在写的本地/远端备份，不强杀后声称镜像完整。特别是 `rclone sync --backup-dir`、`delete`、`rmdirs` 是远端副作用，即使业务写入已停止也不能边执行边拍“静态”快照。
5. **保持 Ubuntu 安全更新**：自动整机 reboot 当前未启用不表示 apt/dpkg 不会 restart Docker/systemd。设计为维护前检测冲突、封锁跨维护的服务启动者并记录原因；不能未经审阅长期禁掉 apt timer/unattended；**普通维护时 `docker.socket` 可按受控管理合同保留，但部分冻结后需要重启 daemon 时，socket activation 也必须命中 §3.1 的启动屏障，不能成为例外。**

参考：[systemd mask/disable 的不同语义](https://www.freedesktop.org/software/systemd/man/latest/systemctl.html)。

## 6. 安装布局、身份/权限与可撤回设计（均为建议，不是现存路径）

| 候选位置/主体 | 拟定用途和权限约束 | 风险与审批点 |
| --- | --- | --- |
| `/usr/local/libexec/sanq-maintenance/`（候选） | 独立受信任的只读 observer / 精确 gate 执行体：root:root、目录 0755、执行文件非 group/world writable；二进制/脚本必须来自审过的 SHA/source | 不在既存 17 文件，安装者/版本来源另审；不能把任意 Python 输入作为 root 授权通道 |
| `/etc/sanq-maintenance/`（候选） | root:root 0700/固定 owner/host/binding 配置与 guard policy；只保留最小 metadata | 不能存公网/云 token；需消除 symlink、替换、目录竞态 |
| `/var/lib/sanq-maintenance/`（候选） | root:root 0700、事务 CAS/epoch、original policy、state/revision、incident 与准确撤回回执；文件 0600，写入需原子、fsync 文件及父目录 | 根盘仅是本机一份；**必须有已确认离机副本**，失败时不能编造 OFF_HOST receipt |
| `/run/sanq-maintenance/`（候选） | 最多保存当前进程/boot 的短暂 IPC/socket | **不能**作为唯一真相；tmpfs/reboot 消失 |
| systemd drop-in/guard（候选） | 分离两类 guard：**Docker daemon 启动前**的持久主屏障（启动拒绝），以及备份 timer/service 入口拒绝；主机 SSH/救援不依赖 Docker | 危险改动涉及 docker.service/socket 与启动依赖，故障可能同时切断 Clover 和 Docker API；必须先验 G06 与隔离 PoC，另获授权 |
| Docker AuthZ/plugin/socket policy（候选） | daemon 正常运行时，按**受保护资源/写入能力**（不仅 `sanq-app` 标签）强制 fail-closed | 不拦 daemon 内部自动重启；插件故障可能使读 API 不可用；代理必须消除 socket 直连；单独隔离 PoC 和生产授权 |
| off-host control plane（候选） | 独立持有 transaction/epoch/CAS、受限操作凭据与紧急回执；绑定 Lightsail 源实例与恢复点 | 当前未选择 AWS/IAM/网络机制，不假定现有 SSM/EIC 具有足够恢复权限 |

**安装顺序候选（先部署保护能力，不等于开始维护）：**准确 Host/源码/权限与 **Docker 之外的 G06 救援可用** 先验 → 离线验真拟安装资产及完整撤回回执 → 以单独获批 root 安装器预安装**尚未启用、但能验证真实身份的 Guard** → 核验原有营业能力未改变和安装锚点的受保护持久性 → 分别测试正常营业/异常状态分支、所有 `docker.service`/socket 等入口均命中守卫 → 独立完成 A2-3 原策略+机内/离机双回执、跨进程 CAS/epoch → **先把 boot guard arm 成“维护期间拒绝下一次 daemon 启动”并证明其跨 boot 有效，之后才能提交业务准入拒绝** → 安全排空已批准的在途操作 → 精确容器更改 `restart=no` 并停止 → 连续观察。安装文件“默认 DENY”仅指**在已经受信任地登记安装的 Guard 内，如果维护状态未知或损坏，不准启动新 Docker daemon**；并不指当前未安装时让正在营业的生产 Docker 自动停掉。守卫是否真正可在已运行 daemon、开机早期和断电时保持这个不变量，必须由隔离 PoC 检验。任何一步缺失，不进入 `ARMING/FENCED`，不得创建更新快照或安装 Runtime。**当前没有获批的安装命令、sudo allowlist、root 执行器或 IAM 策略。**

### 6.1 安装、启用、失联、事故与恢复状态合同（本批仅设计）

这里定义的是**未来真实启动屏障安装/启用状态**，不是偷偷替换已合并 A2-1 模型中的 `PREPARED/FREEZING/FROZEN/INCIDENT`。两套状态未来必须由版本化绑定和测试映射；**A2-1 仍始终 DENY / BLOCKED**。只有 A2-3 真正实现 root-owned 安装锚点、双份原始政策保管、离机 CAS/epoch、跨进程互斥，才可能进行下面的真实状态转移。**任何未证明状态都是 NO-GO。**

| Guard 安装 / 维护状态 | 正常运行的业务 | 新请求/写入准入 | Docker daemon 如果此时需启动（含开机/socket activation） | Clover Tunnel 与运维 |
| --- | --- | --- | --- | --- |
| `LEGACY_NOT_ENROLLED`（历史基线，无安装） | 现有生产照旧 | 原有机制；**没有新 Fence 安全保证** | 原有启动路径，尚无本设计的阻断能力 | 仍正常；此状态**禁止**发起 R2 正式维护 |
| `INSTALLED_INACTIVE`（有可信安装锚点、未 ARM） | 保持营业，不主动停止 | 仅已验证的正常营业策略；禁止开始任何未经批准的维护写操作 | 只有验证锚点与“未 ARM”凭据一致后才允许；未知/文件丢失 => 拒绝启动 | Clover 正常；验证失败可能使下一次 Docker 启动受阻 |
| `READY_TO_ARM`（跨 boot 保护能力测试已通过） | 正常营业 | 还允许普通业务；**维护事务已锁定唯一 owner/epoch** | 已验证受信任“当前未 ARM”状态可通过 | 不涉及业务操作，等待 A2-3 双回执 |
| `ARMING`（先持久地关闭新增准入） | 已批准的在途动作有界排空中 | **DENY 新的生产写入**；仅受权 drain、restart=no/stop | **DENY 整个 dockerd 启动**，防止部分冻结时自动恢复 | 已运行 daemon 上不主动动 Clover；异常重启则 Clover 暂时不可用 |
| `FENCED`（全量持久冻结完成） | 四生产容器停止且 resource writers 已清退 | **DENY**；仅授权维护动作 | **DENY 整个 dockerd 启动**，直到单独验证和显式放行 | 同上 |
| `INCIDENT`（失败/竞争/部分冻结） | 不自动恢复 | **DENY** | **DENY** | 保留独立 SSH/救援；不为恢复 Clover 解除守卫 |
| `UNKNOWN_OR_CORRUPT`（安装已登记，但本机文件丢失/损坏、版本/epoch 不匹配） | 不据文件缺失视为营业安全 | **DENY** | **DENY** | 只许独立事故救援，不能由安装器“自动初始化为空” |
| `OFF_HOST_UNREACHABLE`（离机状态暂不能验证） | 已运行服务不能据此自动宣称冻结安全 | 不新开维护或恢复；若已 ARM/未知则 **DENY** | 缺少可信的最新未 ARM/放行证明时 **DENY** | 可保留主机 SSH；救援和离机收据恢复另审 |
| `RELEASE_PENDING`（恢复已启动，未完成双验证） | 不开放业务 | **DENY** | **DENY** | 按 S11 验证原 policies、单写者、外部事件和快照来源 |
| `RELEASED/INSTALLED_INACTIVE`（S11 完成且签名/epoch 双确认） | 可按原策略正常营业 | 按新签署的放行决策开启 | 独立核验可靠证明已解除后才可允许启动 | Clover 恢复需另验 tunnel、Mac 反向 SSH，不是默认成功 |

**竞态顺序与禁止反转：**`READY_TO_ARM` 先证明 boot guard 对 `ARMING` 持久判定生效，且没有任何无 guard 的直接 Docker 启动路径；然后在受保护事务账本中**原子提交 ARMING 且持久落盘/离机绑定**，与入口 admission gate 持有同一互斥能力；新入站 API/Uber/支付请求从此不得再获得写权限。已获准、正在处理的交易需要有界排空、隔离或留存；排空结果必须由可信快照/观察证据证明，不能存在“刚检查完没有活跃操作，另一条请求又进来了”的 TOCTOU 窗口。若断电发生在任何阶段，包括写入 ARMING 中途、本地写完但离机未确认、只更新 API 的 restart policy 时，都必须以**保守启动拒绝**为结果；不得从单份旧文件推导 RELEASED。A2-3 若无法证明原子性、离机回执与恢复重放安全，则停留在离线验证。

**安装锚点问题：**必须用独立的受保护安装记录证明“这个主机曾注册 Guard”，避免已安装机器上状态文件被删除后落入 `LEGACY_NOT_ENROLLED`。如果攻击者/故障可连 guard unit 本身与锚点一起移除或在 unit 加载之前直接启动 dockerd，则该失败不能被此状态表神奇阻止；必须在同版本隔离 VM 验证文件权限、root 执行来源、掉电窗口、开机依赖与独立离机身份记录。无法证明则判定 `BOOT_BARRIER_UNPROVEN`，不可生产安装。

**撤回/取消分两类，不能混为一谈：**

| 何时撤回 | 必需条件 | 允许的动作 |
| --- | --- | --- |
| 仅预安装、未启用维护、无生产业务/容器/备份策略改动 | 受控比较安装前后源/状态；独立管理可用；guard 与离机证明一致；操作者独立授权 | 可审阅“先撤掉只读未生效的预安装资产/恢复原 unit/drop-in”的拆除计划；先作原状态和现场回执。失败则不清理证据 |
| maintenance 已开始、冻结部分完成/正在更新/发生 INCIDENT/快照新 VM 仍冻结 | 维护保持，原策略/跨重启 fence 未证明可安全解除；G06/外部事件或业务隔离未知 | **禁止 uninstall/mask 解除/删除 fence 文件或 OFF_HOST 原件**；先按独立事件/恢复程序证明一致性，在明确的 S11/RELEASE 授权后按记录逐项恢复策略，再独立验收单写者和放行业务，最后才能撤受控 guard。任何恢复失败继续 INCIDENT |

生产故障的替代实例首启必须先读取快照中冻结和原策略，再由故障 VM 外独立记录复核；一旦恢复点/旧机 fencing 未确认，**不得双机同时启动生产写入者**。撤回脚本不得在异常 EXIT trap 或 `finally` 自动“恢复一切”，不能删唯一快照。

## 7. 需要进一步独立核验/授权的关键事项

| ID | 必须回答/验证 | 对授权的影响 |
| --- | --- | --- |
| P00 — **P0 首验** | **模拟部分冻结：四容器 restart=always，原策略已落本机/离机；只将 API 设为 no 即模拟断电/daemon crash；boot 后真正 docker.service、socket activation、可直启 dockerd/容器自动恢复链不能启动任意生产 writer**，Clover 暂时不可用而 Host SSH 可恢复 | 若 DB/worker/web 自启，或必须先启动 Docker 才能检修，立即 **BOOT_BARRIER_FAIL / S03 NO-GO** |\n| P01 | 生产 `docker.sock` 实际 UID/GID/mode、`ubuntu` 组及其他 Docker API 客户端；可否收紧调用主体且不破坏备份/只读 MCP | 未知调用者不能以 wrapper 拦截代替强制 engine 策略 |
| P02 | 备份 `sanq-backup.service/timer` 实际 FragmentPath、DropInPaths、runtime/permanent mask 可用性；是否存在其他账号直接调用脚本/helper/rclone | A2-1 当前期望 `masked` 可能与本机部署拓扑不兼容，需要合同审阅 |
| P03 | Docker daemon/plugins/Engine API 版本、权限策略插入/恢复与 `docker.socket` 激活竞态；AuthZ 错误时 Docker GET 查询可能失败；异常重启 Clover 不可用 | 路线 B 需同版本隔离 Ubuntu Sandbox PoC 与 G06 独立 SSH 救援证明；不可直接生产上线 |
| P04 | 原始策略与 state/off-host receipt 的真正 fsync/CAS/epoch、身份和断线处理 | A2-3 独立设计与审阅授权 |
| P05 | 正在运行的 backup/rclone/Compose 协调、PG clean shutdown/WAL、外部支付与 Uber 事件保持/重放 | A2-2 无权假设 safe to freeze，S02/S12 未验 |
| P06 | 真独立救援 G06、Lightsail 手动快照 source/disks/新实例首启冻结/旧实例反复活；离开 Docker/Cloudflared 后仍能取证、修复守卫而不自动放行 | S03/S09/G2 仍 NO-GO |\n| P07 — **P0** | 生产 DB local volume、Uploads/Runtime 父路径、Docker socket、host 网络数据库写口、备份远端副作用的等价引用与已有 FD；新容器改名/无标签绕过 | 匹配必须以真实资源/写入能力为准，不以四个容器名字为全集 |\n| P08 — **P0** | `INSTALLED_INACTIVE → READY_TO_ARM → ARMING → FENCED → RELEASE_PENDING → RELEASED` 事务；锚点缺失/损坏、离机不可达、守卫在最早 boot 生效、在途动作排空竞态 | A2-3 持久化 + CAS/epoch/离机收据真实完成前一律离线，任何未知 => DENY/事故 |

可考虑的方案定案之前**无生产 sudo、systemctl、docker update/stop、daemon.json、docker.sock chmod/chgrp、sudoers、改 backup 脚本、改 17+Manifest、修改 Cloudflare、AWS/IAM 或网络**。下一批若用户批准，只能在冻结的代码范围内编写 pure/offline adapters 和 fake/synthetic negative tests；上线/权限变更另行审阅。

## 8. 建议的合成与隔离验收矩阵、停止条件

| 验收场景 | 必验失败/成功行为 | 当前状态 |
| --- | --- | --- |
| 受信任元数据 | 未知 container ID/Compose labels/volume/镜像 digest、错 host/owner/txid/epoch/boot、重复 registry、symlink、untrusted uid/mode | `REJECT`，不能误选容器 |
| Docker 精确作用范围 | 正常不中断维护仅 4×当前 `sanq-app` CONTROL 容器逐项动作，Clover 原策略未被主动修改；**异常 reboot 模式允许整个 daemon/Clover 不可用**；原有 disabled/exited state 准确保留 | `EXPECTED / NOT TESTED LIVE` |
| **P0-01 部分冻结后重启（隔离首验）** | 从已真正启用的 guard+双收据/epoch 开始；仅 API `restart=no`，Web/DB/worker 仍 `always`，分别模拟 VM 断电重启、daemon-only crash/restart、socket activation 与 live-restore/shim/既有 writer | **dockerd 启动被拒绝，任何已有/新建生产 writer 均未恢复或存活写入**；Clover 暂不可用可接受；独立 SSH 救援仍可靠；否则 **S03 FAIL** |\n| 绕过与竞争 | 直接 `docker start` / `compose up` / `run --rm` / `update restart=always`，其他 docker 客户端、旧 deploy/rollback、在 stop 之后自动重启，Docker socket 激活与绕过 systemd 的 dockerd 入口 | 任何成功重建业务或不经 guard 自动恢复即 **S03 FAIL** |
| **P0-02 资源禁入** | 改名/无标签新容器写 `sanq-app_pgdata`、Uploads、Runtime 父目录、宿主 Docker socket，host 网络连接生产 DB；既有 Host writer/可写 FD | 任一未授权写入成功或无法观测真实资源路径 => **S03 FAIL** |\n| 备份与副作用 | timer/service/direct script/helper/rclone、正在运行的 rclone sync/delete、远端不可用；手工 start 和服务重启 | 失败保留，未恢复自动调度不得声称成功 |
| **P0-03 启用状态与竞争** | 已登记 Guard 文件缺失/损坏、局部写入、离机不可达；ARMING 前后新准入竞态、持有写 FD 的交易排空、RELEASE_PENDING 的 crash | 未知/失联不能解释成 RELEASED；新写禁入早于任何受控 stop；未证 A2-3 则不得实测生产 |\n| 持久性 | 在原策略采集后、首条 update 后、部分 stop 后、冻结完成后模拟断电/daemon restart/VM reboot/新 VM boot | 永不自动解除，未知状态 INCIDENT |
| **P0-04 授权组件故障与救援** | AuthZ plugin 崩溃/拒绝 `ps/inspect`、代理被绕过直连 socket、守卫配置错误、管理查询超时，隔离 SSH 和离机状态核验 | 可允许 Docker API 全不可用，但绝不能以自动卸载或放行来恢复；必须可通过 Docker 外部救援处理 |\n| 可信执行 | 精确控制动作需要受信任同 txid/epoch；任意 root shell/API、回执伪造、伪造允许码不可放行 | 未证安全强制即 BLOCKED |
| 恢复/撤回 | 保留原 disabled/inactive 状态；不一次性 enable/start；原 four policies 精确复原；Clover 原策略不主动篡改，但事故停机后须独立复验其重启及 SSH reverse tunnel；未完整双回执不允许卸载 | 必须独立 S11 才放行 |
| CI / 仓库架构 | 仍通过 `.github/workflows/ci.yml` 既有 Runtime `python3 -m unittest discover -s ops/runtime/tests -p 'test_*.py'`，不放松 25 个 A2-1 测试；若需变动 A2-1 观测合同另审 | **本批设计不执行测试** |

**退出条件（当前设计阶段）：**“异常重启整个 Docker daemon 阻断、Clover 降级”已获用户明确的**设计方向批准**，其余技术路线（systemd 具体 Hook、Docker AuthZ/代理、CAS/离机控制、权限布局）均尚未获安装授权。设计必须具备 §3.1 Boot Barrier、§3.2 Resource Boundary、§6.1 Activation State Machine，隔离 VM **按 P0-01 部分冻结中断**优先验证，再验证 P0-02～04。现为方案审阅和离线验证准备；**未实际安装任何屏障，也没有解决 A2-1 `PRESERVE` 事故状态的合同版本问题**。不得把路线 A wrapper/单次观察冒充连续 fencing；完整 R2/C4、AWS S01–S12、G06、C5-G2 一律 OPEN/NO-GO。
