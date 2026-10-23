# R2-A2-3 — 启动屏障同版本隔离 PoC 就绪与持久化前置审计

**日期：2026-10-23（America/Toronto）｜阶段：LOCAL READINESS / P0-01 PROCEDURE PROPOSED / NO POC EXECUTION / NO INSTALL AUTHORIZATION。**

> 基线：`origin/dev@d74992970c079a582b76d82db5ea8fc4b96aa7b2`（PR #2918；CI #7485 SUCCESS），[R2-A2-2 已审方案](Runtime更新-R2-A2-2禁入适配器与安装权限撤回设计.md) 采用 **SAFE_STOP_DOCKER_ON_UNCERTAIN_RESTART**。本阶段目标是让**用户可审阅和授权**的首个真实隔离 PoC 具有准确对象、故障注入、证据及回退门禁。**不是**宣布 A2-3 已实现持久化或 P0-01 已通过。本批只在 MCP-workspace 修改文档；不使用生产 VM、AWS 实例、Clover Token、数据库备份、生产密钥或 Docker/systemd 安装。

## 1. 依据、所有权与阶段切片

已审阅根 `AGENTS.md`、当前 `.github/workflows/ci.yml`，并对照 [R0](Runtime更新-R0冻结设计.md)、[R2-A2-1](Runtime更新-R2-A2-MaintenanceFence离线模型与失败测试.md)、[R2-A2-2 §§3.1/3.2/6.1/8](Runtime更新-R2-A2-2禁入适配器与安装权限撤回设计.md)、[R2-A1 HOST-READ-002](Runtime更新-R2-A1-HOST-READ-002启动入口与实装身份审计.md) 与 [AWS 快照/维护合同 S02/S03/S09](Runtime更新-AWS快照与维护冻结方案.md)。Runtime/Ops 是该方案唯一 owner，不重构 NestJS/NextJS、Prisma、支付、Uber 或财务模块。

**必须拆分的边界：**A2-2 规定的安装态 `INSTALLED_INACTIVE/READY_TO_ARM/ARMING/FENCED/INCIDENT/RELEASE_PENDING` **不是** A2-1 的 `PREPARED/FREEZING/FROZEN/INCIDENT`；后者仍只返回 DENY，`persistenceVerified/liveFenceVerified/readyToInstall=false`。PoC 不能临时把它的假 receipt/原始内存字节改成真实持久证明；A2-3 的根目录固定与真实 LOCAL/OFF_HOST 双回执、单调 epoch、CAS/独占锁、重启恢复及事务原子性必须另外实现/审查，才有资格用于业务启用。

## 2. 本轮就绪发现：目前不能直接进行实测

| 核验项 | 已获事实 | 结论 / 缺口 |
| --- | --- | --- |
| Git baseline | PR #2918 merged to `dev@d7499297`，A2-2 文档已选择“异常重启阻断整个 daemon，Clover 可降级” | **DOCUMENT_DESIGN_READY** |
| 源模型与 CI | A2-1 25 synthetic unittest 已合并；CI #7482 SUCCESS，模型不接真实 Host/FS/Docker | **MODEL_READY_SCOPED；真实执行器 OPEN** |
| 隔离执行能力 | 当前助手可用执行容器为 Debian 13 / supervisord PID1；没有 `docker` CLI/daemon、QEMU 或 systemd PID1 | **不具备同版本 VM/systemd 实验条件**；不得把 Python 假 Host 当 P0-01 |
| 已有 VirtualBox 测试 VM | R1-A 历史记录为 Ubuntu 24.04.5 LTS / kernel 6.8.0-146；但不等于 Docker Engine / Compose / daemon 配置与当前生产同版、同参数 | **CANDIDATE ONLY；须单独身份/版本/资源预检** |
| 生产环境 | H14：`docker.service`/`docker.socket` active；四生产容器当前 `restart=always`，另有独立 Clover `unless-stopped`；`ubuntu` 可查询 Docker | **证据仅作设计输入，禁止在生产做故障注入** |
| 独立救援 | SSH/SSM/EIC service 状态已识别，但事故可达性的真实验证仍 G06 OPEN | **NO INSTALL / NO-GO** |
| 事务持久层 | A2-1 LOCAL/OFF_HOST receipt 目前只是内存声明，尚无持久 root 锚点、离机 CAS/epoch | **不得进入真实 ARMING/FENCED** |

可在独立 VirtualBox/等价 VM 完成的前置事项是**只读比对系统与 Docker 启动链和 VM 的可丢弃性**，确认后才设计最小实际 guard PoC。不能声称当前用户的 VirtualBox 客体就是一个已就绪的同版本 Runtime Sandbox。

## 3. 实验室对象边界（隔离与数据保护）

1. **隔离 VM 不复用生产磁盘、Docker volume、生产 env、rclone config、Cloudflare Token、TLS key、GitHub PAT、支付/Uber/Clover 客户端凭据。** Docker/Compose 文件用同等`restart: always` 语义和无敏感数据的合成 4 服务替身；PostgreSQL 若需要验证卷/数据库行为，使用全新临时数据卷，绝不克隆或挂载生产 `sanq-app_pgdata`。替身 Web/API/worker 只写 synthetic 审计日志，不调用生产后端或公网回调。
2. **网络隔离：**优先 VirtualBox host-only + 独立可恢复控制台。无桥接生产网段、无 sanq.ca DNS 重定向、无可达到生产 PG/API 的通道、无真实 Cloudflare tunnel 路由或 MacBook SSH -R 端口；一个 synthetic `SANDBOX/PRESERVE` 容器替代 Clover，对比正常与事故模式行为。
3. **可丢弃与可撤回：**实验前为**隔离** VM 创建可验证快照/克隆并记录绝对 VM UUID、OS/kernel/Engine/Compose/systemd 版本、DockerRootDir、live-restore、unit fragments/drop-ins、socket listener、网络端口与 VM image SHA；保留断电前后的证据归档。不能在 production 或生产路由上调用 `systemctl`、`docker update`、`poweroff`。
4. **身份先验：**预检目标 Guest 与 Host 控制台的隔离身份证明、独立 SSH 登录和快照恢复能力，防止操作对象指向 `sanq-web`；使用显式 UUID，不使用模糊/默认当前 VM 名称。在客体内任何提权或断电注入前先通过单独授权。
5. **同版本要求：**Ubuntu LTS 版本、systemd 包/配置、Docker Engine API/server 版本、Compose plugin、containerd/runc、unit `ExecStart`/socket 激活依赖、daemon `live-restore`/authz/RestartPolicy 应与目标生产**实际版本及配置**匹配；版本无法核实时，PoC 只能称“类似平台机理验证”，不得标记“same-version pass”。如确需 VM 软件包变更，先提交来源、权限、测试与撤回方案，取得授权。

## 4. P0-01 隔离 PoC：首项必验失败路径

**目标不变量：**一旦完整可信安装锚点与事务已登记，维护处于 `ARMING/FENCED/INCIDENT/UNKNOWN`，任何 daemon 重新启动都先被独立于 Docker API 的 boot guard 拒绝；**DB/Web/Worker 在部分更新前仍为 `restart=always` 也不允许启动/继续写入**。当 daemon 不可用，允许 synthetic Clover Tunnel 一并不可用，但隔离 VM 的 SSH/独立 Host 控制台与恢复证据仍必须可取得。注意 Docker `--live-restore` 场景下，**拒绝 dockerd 重启 ≠ 杀掉仍活着的容器或其他宿主写者**；必须另以独立进程/写入观测证明安全，不能将 daemon down 推断为 writer down。

| 子项 | 隔离实验序列（未来拟执行；当前未运行） | 必须捕获的证据 / 通过判据 |
| --- | --- | --- |
| P0-01A 基线正例 | 合成四服务原策略 `always` + synthetic Tunnel `unless-stopped`；Guard 已安装但 `INSTALLED_INACTIVE`，验证正常 daemon 和服务可启动 | 自启动/管理无回归、精确原策略、独立 SSH 可达 |
| P0-01B 关键掉电负例 | 完成隔离 VM 的**真实**本机/离机或等价经批准实验级持久事务装置，持久记录原始策略与 ARMING；**只对合成 API 改 `restart=no`**，DB/Web/worker 留 `always`，在这条更新后注入 VM 断电；恢复 VM | boot guard **早于** daemon `ExecStart` 拒绝；`docker.socket` 激活不能开 daemon；无 synthetic DB/Web/worker 写入；独立 SSH/控制台可进入；synthetic Clover 可不可用 |
| P0-01C 不同掉电点 | 在 Guard 激活前、ARMING 持久化的部分写入、原策略仅本机写完/离机未确认、API 更新前/后、部分 stop 后、FENCED 后分别模拟异常重启 | 登记过 Guard 的主机遇不完整/缺失/损坏状态必须**DENY**，不能落到 `LEGACY_NOT_ENROLLED` 或自动 RELEASED |
| P0-01D daemon-only 故障 | 在同样部分冻结状态，仅让隔离 VM 的 daemon 故障/重启，不停整个 OS；分别检验 `live-restore=false/true` 或实际生产配置对应分支；精确观察 containerd/shim 与原 writer | 不只验证 dockerd 无法重启，还要证明**原有写入进程未继续写数据**；如果活着并可写，记录 **FAIL / NEEDS HOST-LEVEL WRITER GUARD** |
| P0-01E 绕过与权限 | 请求经 `docker.socket`、其他同版 service/unit、直接 `dockerd` 可执行入口、其他 Docker socket/TCP endpoint 重启；模拟 Guard 文件缺失、owner/mode 错误、过期 epoch | 未授信 daemon 启动/写入不成功；直接启动入口无法全部覆盖则 **BLOCKED**，不能只靠 systemd `ExecStartPre` 自称强制 |
| P0-01F 救援/撤回 | 人工触发 INCIDENT，随后由独立 Host/SSH 持准确证据读取失败原因；尝试未经授权的 uninstall/删除 state/解除 mask，最后**仅在另签署的测试恢复计划**下恢复 | 事故状态不自动解除；没有“finally 自动恢复”；Guard 失联 Docker status/inspect 可失败；实验 VM 的回退不删除唯一失败证据 |

**失败定义：**在应该 DENY 的场景内，只要一个受保护 writer 存活持续写入、任何未授权 Docker Engine 启动成功、由伪造/缺失文件获得放行、或事故救援必须先卸除业务禁入机制，均为 **P0-01 FAIL / S03 OPEN**。Clover synthetic container 未在事故期间恢复**不是** FAIL；独立管理失效是 FAIL。

## 5. P0-02～P0-04 后续隔离验收（不得抢跑 P0-01）

- **P0-02 资源级写者：**未知名称、无 Compose label 的容器试图接入合成 PG local volume、Uploads/Runtime 等价 bind/父目录、Docker socket、host 网络数据库端口；以及运行前已有可写 FD、跨 daemon 存活的 Host writer。必须逐项证明可信 host 资源被拒绝或已排空。模拟对象不能连到真正生产路径或使用真正云凭据。
- **P0-03 生命周期：**`LEGACY_NOT_ENROLLED`、`INSTALLED_INACTIVE`、`READY_TO_ARM`、`ARMING`、`FENCED`、`INCIDENT`、`UNKNOWN_OR_CORRUPT`、`OFF_HOST_UNREACHABLE`、`RELEASE_PENDING`、`RELEASED`；验证锚点与状态一致，首次事故记录不覆盖。每次 ARMING 都须证明新准入关闭早于 drain 与第一个 `restart=no`。
- **P0-04 授权组件故障：**若之后选择 AuthZ/代理才测插件失联、HTTP GET/inspect 拒绝、非 HTTP API、直接 Unix socket/TCP 绕过；在故障中独立 SSH 取证。AuthZ 只控制经其覆盖的 Engine API 请求，**不能用于证明** daemon 的内部 restart manager 被阻止。

## 6. 真实持久化 A2-3 阻断依赖与需要额外授权的架构选择

| Contract / boundary | 仍需实现的证据 | 当前禁令与候选 |
| --- | --- | --- |
| 安装锚点与 Boot Guard | 在 daemon 启动前独立于 Docker 的可信安装身份与有界时间结果；Docker service/socket/旁路排他，包含 daemon-only crash | `/etc/sanq-maintenance`、`/usr/local/libexec/sanq-maintenance` 和 systemd guard **均仅建议路径**，未批准建立/安装 |
| 本地事务源与恢复 | root-only state、original policy/registry、request、owner/txid/epoch、boot 状态，严格权限与路径、防 symlink、atomic rename、file+directory fsync、损坏拒绝 | `/var/lib/sanq-maintenance` 候选，未安装；`/run` 不能作唯一真相 |
| 离机回执与独立单调性 | 真实 OFF_HOST custody、不可回滚 CAS/epoch、owner 身份与错主机/错事务抗重放 | 不得复制内存 receipt 伪装离机成功；off-host 服务/IAM/网络尚未决定 |
| 演进 A2-1 合同 | systemd `masked` vs 本地安装 unit/Guard，事故模式 Clover `PRESERVE` 停机如何表示 | 不暗改现有 25 项 synthetic test；先提版本化兼容/迁移影响再获授权 |
| Restore/Release | S11 原策略精确恢复、唯一 writer、付款/Uber webhook held/去重、救援独立授权 | 事故态没有自动放行；`NormalUpdateFlow` 尚未接 adapter |
| 生产安装边界 | 必须调整宿主 Docker unit/socket、可能 daemon 权限/代理、备份脚本/守卫、root 运行体 | 全部属于需**进一步书面批准**的架构/权限/生产操作，不由本 PoC 规划自动授权 |

**测试执行工具要求：**必须在可丢弃且无生产凭据的 Ubuntu/systemd/Docker 客体中真实运行；不能用当前助手的 Debian 13/supervisord 工具容器声称已完成同平台测试；现有 GitHub Actions 只验证纯代码语义，不会代替有状态 VM 故障注入。待确定授权与实验 Guest 后，再给实际基于设备身份且可审计的命令或安装器；**本文不提供可误用于生产的通用断电/关闭 daemon 指令**。

## 7. 退出判定与交接

**本阶段可完成的事：**产出可复核的 P0-01 优先隔离实验协议、源/目的/权限和生产资源隔离表、当前工具能力与真正同版本 VM 环境缺口、A2-3 持久化及救援依赖清单。把每个测试都标 `PLANNED/NOT_RUN`，不得填造证据。

**下一次真实动作前需要的授权：**指定准确隔离 Host/Guest VM UUID，确认可丢弃镜像、准确 OS/Docker/systemd/Compose 版本，保留独立 SSH/控制台/VM 快照；批准**仅该隔离 VM**上安装 Guard 原型、模拟容器策略修改与故障注入的准确对象/回退流程。需变更架构边界（systemd/docker socket/权限/持久化状态合同）时另列影响、替代方案和独立批准。未经这些审批，即使 PoC 设计文档合并，也仍 `P0-01 NOT_RUN / S03 OPEN / G06 OPEN / S09 OPEN / R2-C4 OPEN / C5-G2 NO-GO`。

**本地交付门禁：**工作区首次改动后仅可生成本地改动报告供审阅，未经用户另行授权不得将本批新分支推远端/创建 PR。无本地 CI claim；文档阶段未运行源码 lint/build/test。

## 8. 2026-10-23 — GitHub Runner 能力探针历史结论与退役

[PR #2920](https://github.com/sanqin888/sanqinMVP/pull/2920) 原已将 GitHub-hosted `ubuntu-24.04` KVM/QEMU 能力探针合并 `dev@ae47a8ee`（常规 CI #7489 SUCCESS）；真实 [Actions #39993752638](https://github.com/sanqin888/sanqinMVP/actions/runs/39993752638) 日志和 artifact 明确为 **`KVM_UNAVAILABLE / capability=BLOCKED`**，故 `QEMU/GUEST_SYSTEMD/GUEST_RESET/P0-01=NOT_RUN`。Actions 的 SUCCESS 只说明探针正确记录能力不可用，不表示嵌套 VM 可行。历史运行和 PR 继续保留供审计，**不改写 Git 历史**。

用户当日决定采用 **VirtualBox** 路线，要求通过新的 `dev` PR **撤销 PR #2920 新增且今后不再使用的**独立 workflow `.github/workflows/runtime-vm-capability.yml`、Python Runner 探针、其配套 unittest 和 GitHub 方案专属文档。保留本 R2-A2-3 PoC 主计划、R0、R2-A2-1/2 原合同及任何真实生产证据，不撤回 GitHub Actions 作为**仓库普通 CI 权威验证平台**的既有规则。

## 9. VirtualBox 首批就绪核验与严格执行边界（已选平台，尚未实测）

**目标：**仅把早前 R1-A 使用过的 Ubuntu 24.04.5 VirtualBox Guest 作为候选；**不能**从历史 Guest/kernel 取证或上一轮测试成功推断它已经具备与生产同版本的 Docker/systemd/Compose 环境，亦不能无授权写 VM 或注入故障。

| 门禁 | 必须先采集并复核的只读证据 | 失败处理 |
| --- | --- | --- |
| VB-01 Host/Guest 身份 | VirtualBox Host 上的完整 VM UUID、名称、配置路径、状态、介质关系；Guest 的 machine-id/主机名、Ubuntu 版本、kernel、系统时间、root disk/FS；复核**绝非生产 Lightsail VM** | 不一致/模糊即 `BLOCKED` |
| VB-02 可信与隔离 | Host-only 接口配置、Guest NIC 模式/端口映射、对 sanq.ca/生产 DB/API/Cloudflare 和真实备份位置的隔离；无生产密钥、rclone/cloud credentials、真实 Clover Tunnel | 无法证明隔离即 `BLOCKED` |
| VB-03 同版本对照 | Guest 的 systemd/docker engine API/version、containerd/runc、Compose plugin、docker.service/socket unit/drop-ins、restart policy、live-restore、daemon.json；与 R2-A1 当前生产只读采集比对，缺少同版本证据则标记 `SIMILAR_PLATFORM_ONLY` | 禁止声称 `SAME_VERSION_PASS` |
| VB-04 故障回退与救援 | 在实验之前建立**该 VM 的**精确可恢复快照/克隆，校验快照身份与介质链，Host console/SSH 和不依赖 Docker 的救援路径，确认失败日志在恢复前单独保留 | 无恢复能力即 `BLOCKED` |
| VB-05 合成数据隔离 | 准备四个全新 synthetic 容器/数据库卷与合成 Clover PRESERVE 替身，所有 service 不连接真实支付/订单/Uber、生产宿主 bind mount | 生产资料/凭据混入即停止 |
| VB-06 P0-01 授权 | 用户针对**具体 VM UUID 和精确可回滚范围**，另行批准 Guard 原型安装、持久化试验、`restart=no`、强制关机/daemon crash 与受控恢复 | **本轮仅确定路线和删除旧工具，不含任何执行授权** |

首个真实 P0-01 必须仍按 §4 **P0-01B** 执行：在隔离 VM 中原策略均 `restart=always`，完成可信持久 Guard 与 ARMING 后仅将合成 API 改 `restart=no`，DB/Web/worker 仍 `always` 即模拟断电；下一次 boot 由 Guard 在 daemon 恢复之前拒绝整个 Docker，证明无在途或新生产模拟写者复活；合成 Clover 暂停允许，但独立管理必须可用。继续覆盖 §4 的 daemon-only/live-restore、`docker.socket` 和直接 dockerd 绕过测试。**未安装真实 Guard 前绝不把该路径标记为测试通过。**

**当前裁定：**`VIRTUALBOX_SELECTED / VB-01..VB-06 NOT_RUN / P0-01 NOT_RUN / S03-G06-S09 OPEN / R2-C4 OPEN / C5-G2 NO-GO`。本轮不会连接或改变任何 Guest、Host、生产 Runtime、Docker、AWS、数据库或 Cloudflare；GitHub 方案的撤回仅是 `dev` 仓库源代码回退。

