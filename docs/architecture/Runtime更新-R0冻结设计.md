# Runtime 更新 R0 冻结设计

**2026-10-24 C1-PREP-02 本地续步（无执行能力变化）：**上一批 C1 文档由 PR #2930 / 最终 CI #7511 SUCCESS 合并 `dev@67a88aae`；本批在后续 TLS 文档 PR #2931 已进入的 `dev@b7e8d882` 独立缓存上开始 [C1 候选入口装配与关键来源绑定方案](Runtime更新-C1候选入口装配与关键来源绑定方案.md)。仅对齐 `normal_runtime_launch.py` 的默认全量闭包注释和 `normal_runtime_update.py` 的 both archives 能力说明，保留 v1 字段、旧 Python 声明及全部拒绝/授权语义；明确旧摘要是需认证的身份元数据，不默认要求旧原 Archive bytes，缺可信摘要仍拒绝。已形成 11 步+abort 装配责任表、四类来源身份和聚焦验证清单；没有实际 bootstrap、适配器或安装/主机/云能力。**SOURCE COMMENTS ALIGNED_LOCAL / ASSEMBLY DESIGN COMPLETE_LOCAL / REAL BOOTSTRAP NOT IMPLEMENTED / C1 OPEN**；本批本地未运行项目测试；独立缓存/GitHub 插件远端交付基线为 `dev@a8898a90`。[PR #2933](https://github.com/sanqin888/sanqinMVP/pull/2933) 源码 head `1a7809e0…` 的 [CI #7517](https://github.com/sanqin888/sanqinMVP/actions/runs/40137267379) SUCCESS（Runtime 649 / Release 45），现只补记录，最终 head CI/merge 以 PR 为准；C1 最终仍随正式执行候选验收。

**2026-10-24 P2-C3C3-READ TLS/Host-only 第三次实测归档（基于最新 dev@67a88aae／保留 PR #2930 的 C1 基线）：** 操作者 Mac Python 3.8.2/LibreSSL 2.8.3 TLS1.2 可用、TLS1.3 不可用，`SSLContext` 默认 `CERT_REQUIRED/check_hostname=True`，但默认 min TLS1.0；Ubuntu Recovery Guest Python 3.10.12/OpenSSL 3.0.2 TLS1.2/1.3 可用、默认 min TLS1.2。Mac 原始 `get_ciphers()` 共 **37** 项、`protocol` 标签均为 `TLSv1/SSLv3`（旧元数据标签，不等于真实 SSLv3 协商），与 Guest 的 14 项 TLS1.2 候选按名称交集 **14/14**，含 ECDHE-RSA/ECDHE-ECDSA AES-GCM。Mac Host-only `192.168.56.1/24`、Guest `192.168.56.5/24`，无 Guest IPv4/IPv6 默认路由；Mac C3B 原实验目录 `apple drwx------` 保留。详见 [C3C3-READ 审计](Runtime更新-R2-A2-3-P2-C3C3-READ认证TLS与HostOnly就绪审计.md)。**仅 TLS/套件静态兼容 PASS_SCOPED**；真实证书 IP SAN/EKU/CRL、Cipher 握手、mTLS 认证、Mac 服务/端口/新 CAS 数据库、Docker 启动准入均未实现/未授权。C1 已在 PR #2930 合并的变更继续保留，不混入 C3C3；`P0-01 NOT_RUN / S03-G06-S09 OPEN / PRODUCTION NO-GO`。

**2026-10-24 C1 现行范围与候选准备（PR #2930 / DOC CI #7510 SUCCESS）：**按用户要求完成文档范围对齐并启动 [C1 最小可信执行基线对齐与候选准备](Runtime更新-C1最小可信执行基线对齐与候选准备.md)，已建立实际组件/平台缺口、证据复用表和同候选关闭条件。**C1 OPEN / BASELINE ALIGNED_LOCAL / CANDIDATE PREPARATION STARTED / FINAL CANDIDATE NOT FROZEN**；正式 bootstrap、实际平台/关键依赖及 effect adapters 尚未完整固定，最终收口跟随正式执行候选。R1-A 七包与 S5 有限证据可在对象/平台仍匹配时复用；旧全量 Python/ELF/dlopen 消费和第三方见证要求不再默认适用，C1-SYN A2-II 仅为异常/专项路线，原失败与禁令保留。R2 的 VB-04D1 / P2-C3C2 已分别经 PR #2927 / CI #7504、PR #2929 / CI #7508 全绿进入 dev；旧“本地未 CI”文字为各自历史时点；C3C3-READ 已取得部分只读能力回执，真实 mTLS/受信身份/Guard 联动仍未完成，以其工作包最新现场续记为准。本批首次完整文档 head `ea8c0cabc0fe36bd0d2974979f59f6e80c7e2eda` 的 [CI #7510](https://github.com/sanqin888/sanqinMVP/actions/runs/40135924881) 已通过（docs-only，不运行 Runtime 测试）；当前只补证据，最终 head CI/合并事件以 [PR #2930](https://github.com/sanqin888/sanqinMVP/pull/2930) 为准。本批不改代码或守卫、不取得现场执行权；**R2-C4 OPEN / C5-G2 NO-GO / S2 DAILY PAUSED**。

**2026-10-24 P2-C3C2 本地进度续记：** [P2-C3C1 认证 CAS 信任边界](Runtime更新-R2-A2-3-P2-C3C1最小认证离机CAS信任边界设计.md) 已由 PR #2928 / CI #7506 合并 `dev@09db31ec`。依据该 B 方案，仅在 MCP-workspace 增加 [P2-C3C2 离线模拟 peer/Enrollment + Wire v1 合同与负例](Runtime更新-R2-A2-3-P2-C3C2离线认证身份与Wire合同实施记录.md)；`HEAD_READ/COMMIT_LOOKUP/CAS_SUBMIT` 和 Unknown-commit 不授予任何 CAS、mTLS 或 Docker 实际权限，P1/A2-1 和 17 文件发布清单不变。**尚未运行 GitHub CI，未启动 Mac 网络服务或修改 Guest/VM；P2-C3C3 TLS 环境能力只读预检须另批**。`P0-01 NOT_RUN / S03-G06-S09 OPEN / PRODUCTION NO-GO`。

**2026-10-24 P2-C3C1 最新进度（原有 VB-04D1 本地状态为历史记录）：** VB-04D1 已通过 PR #2927 / CI #7504，Runtime 624/624 PASS，并合并 `dev@2b83edf2`。按“合并后开始下一步”只读审阅并形成 [P2-C3C1 最小认证离机 CAS 设计](Runtime更新-R2-A2-3-P2-C3C1最小认证离机CAS信任边界设计.md)。指出 `OfflineCasSubmission.client_identity` 自报、P1 `CustodyReceipt` 不具独立真实性、网络 HEAD_READ 与 Docker 启动存在 TOCTOU，不能把 mTLS 连接或旧实验回执直接提升为生产 OFF_HOST/ALLOW。后续跨进程/可信身份边界所需 C3C2 源码扩展要单独授权，Mac/Guest 真实服务和 root Guard/P0-01 分批审批。`P2-C3C1 DESIGN COMPLETE_LOCAL / P0-01 NOT_RUN / S03-G06-S09 OPEN / C5-G2 NO-GO`。

**2026-10-24 最新 VB-04D1 本地实现进度（此前 VB-04C 为历史设计状态）：** VB-04C 文档已由 PR #2926 / CI #7501 合并 `dev@05ec6ef8`。按用户授权，现于新 MCP-workspace 分支新增 [VB-04D1 离线 Unit/安装 Manifest 合同及测试记录](Runtime更新-R2-A2-3-VB-04D1离线Unit依赖与安装Manifest实施记录.md)，用于校验操作者提供的 systemd 249 / Docker socket+service Unit 快照、9 项安装文件/目录意图、双入口 gate 声明及静态依赖环；**始终 DENY，未安装真实 Guard 或 mTLS，不启用 Docker**。本批还没实际运行 CI，待本地审阅、单独批准 PR。`P0-01 NOT_RUN / S03-G06-S09 OPEN / R2-C4 OPEN / C5-G2 NO-GO`。

**2026-10-24 VB-04C 现场新进度与设计收口（最新条目，前文为历史时点）：** [VB-04C Boot Guard 安装/依赖/撤回方案](Runtime更新-R2-A2-3-VB-04C启动守卫安装依赖与撤回设计.md) 已基于 Recovery Clone 的操作者只读回执冻结。Guest systemd 249 的 `docker.service` 真实 `-H fd://` 依赖 `docker.socket`，后者监听 `/run/docker.sock` 并触发 service；daemon/config/Unit 静态 inactive/disabled，不证明跨重启安全。设计区分 root 安装锚点/真实离机可信 CAS、service+socket 启动入口、直接 dockerd 与仍活 shim/writer、持续 ARMING 准入、G06 独立救援和分层撤回。**目前仅设计，P1 DENY/P2 LAB_ONLY 未接 live permission；VB-04D1/P2-C3C/真实 root Guard 安装/VM 故障测试均未获授权**。`P0-01 NOT_RUN / S03-G06-S09 OPEN / R2-C4 OPEN / C5-G2 NO-GO`；本条只在本地文档分支，未经远端 CI/合并。

**2026-10-24 P2-C3B 最新限定续记（不得以历史条目替代最新状态）：** P2-C3A 离线 SQLite CAS V2/负例在 PR #2924、CI #7497 通过后合并 `dev@c8e1c13d`；操作者 Mac 用户态 [P2-C3B-001 实测复核](Runtime更新-R2-A2-3-P2-C3B-001Mac进程持久化实测复核.md) 确认 8/8 固定源码校验、22/22 Mac 原生测试、两笔提交后重开读回及两项真实测试子进程 `SIGKILL` 恢复，归类 `MAC PROCESS-LEVEL PASS_SCOPED / P2-C3B-001 CLOSED_SCOPED`。此前 Jammy Full Clone 冷启动和原 VM 快照保护的现场回执也仅是 `RECOVERY PASS_SCOPED`，不等于 AWS S09。**Mac 并无真实 mTLS/离机权限/独立防回滚，P0-01 及生产 Boot Guard 未运行；G06/S03/S09、资源写入禁入、S2 日常独立备份恢复仍是生产关键缺口。** P2-C3C 是候选子项，不自动升级为主线门禁完成，也不授权后续服务、Docker/Guest/生产修改。本段为本地文档续记，未经远端 PR/CI。

**2026-10-24 R2-A2-3 当前实验室基线（最新状态；以前 10-23 条目仍为历史阶段快照）：** 新建独立 `SanQ-Runtime-Lab-Jammy-01`（不是旧 Ubuntu 24.04 Test-02）已由操作者在 Mac/VirtualBox/Host-only Guest 取得准确 VM 身份、SSH 指纹互证、Ubuntu 22.04.5 / systemd 249 / Kernel 5.15 基线；取得 `SanQ-Jammy-Clean-Baseline-20261024`；经本机隔离安装明确授权、Docker 与 Ubuntu 发布仓库签名/哈希和 12/12 离线包复核、APT `0 upgraded / 12 newly installed / 0 removed`，完成 Docker CE/CLI 29.2.1、containerd.io 2.2.1、Compose v5.0.2（runc 1.3.4）受控离线安装。安装脚本的 daemon/socket 常规启动被临时 `policy-rc.d=101` 拒绝，随后 `docker.service/docker.socket/containerd.service` 经读回为 `loaded/inactive/disabled`；Guest 经复核关机，第二份 `SanQ-Jammy-Docker-Baseline-20261024` 快照已登记为 CurrentSnapshot，旧快照保留。**快照登记不等于已恢复验证；inactive/disabled 不等于 Boot Guard；新机 Docker/socket 真实启动链、daemon `live-restore`、生产全版本/配置对照、VDI 父链和恢复实测均未完成。** 详细见 [R2-A2-3 §17](Runtime更新-R2-A2-3隔离启动屏障PoC就绪与持久化前置审计.md) 与 [VB-READ-001 §12](Runtime更新-R2-A2-3-VB-READ-001环境核验与下一步审批.md)。**下一阶段 VB-04 限于经过单独授权的准确新 VM 的启动链只读审计和 PoC 设计**；不得扩大此前 Guest 软件安装/快照权限到 Guard 安装、Docker 启停、unit 修改、快照恢复或断电注入。保持 `P0-01 NOT_RUN / S03-G06-S09 OPEN / R2-C4 OPEN / C5-G2 NO-GO`，不改变 R0 / R2-A2-2 `SAFE_STOP_DOCKER_ON_UNCERTAIN_RESTART` 已选设计；此项仅本地文档对齐，尚未 push/PR。


**2026-10-23 R2-A2-3 实验平台决策 — VirtualBox 优先（本批拟撤回 GitHub 方案）：**[PR #2920](https://github.com/sanqin888/sanqinMVP/pull/2920) 的 GitHub-hosted Ubuntu 24.04 Runner 能力探针确实运行，但 [Actions #39993752638](https://github.com/sanqin888/sanqinMVP/actions/runs/39993752638) 报告 `KVM_UNAVAILABLE / capability=BLOCKED`；QEMU 和 Guest 均 `NOT_RUN`。用户决定放弃仓库中的 GitHub 嵌套 VM 实验方案，采用**已有 VirtualBox 独立测试 VM**开展后续 P0-01。撤回限定于 PR #2920 新增的探针工作流、运行脚本、探针单测和对应专门文档；通过新 revert PR 走 `dev`/CI，不重写历史 PR 或证据。保留 R2-A2-1/2 与 R2-A2-3 通用设计、`SAFE_STOP_DOCKER_ON_UNCERTAIN_RESTART`、首验 P0-01 不变量。下一步只允许先只读核验 VirtualBox Host/Guest 精确身份、Ubuntu/kernel/systemd/Docker/Compose 版本、host-only 网络、隔离与可撤回快照；尚未获授权安装 Guard 或执行断电故障注入。`P0-01 NOT_RUN / S03/G06/S09 OPEN / C5-G2 NO-GO` 不变。


**2026-10-23 R2-A2-3 同版本隔离 Boot Barrier PoC 准备（LOCAL DOC / NOT_RUN）：**R2-A2-2 设计 PR #2918 在 CI #7485 SUCCESS 后合并 `dev@d7499297`。本地新建 [R2-A2-3 隔离 PoC 就绪审计与前置门禁](Runtime更新-R2-A2-3隔离启动屏障PoC就绪与持久化前置审计.md)：优先 P0-01“仅 API 改 restart=no，DB/Web/worker 仍 always 即隔离 VM 断电”的 **daemon 在自动恢复之前整体拒绝启动**，并覆盖 socket activation、daemon-only/live-restore/现存 writer、受限救援、合成 Clover 降级；其后才测试受保护资源新写者与 AuthZ。需确证准确可丢弃 Ubuntu/Docker/systemd 同版本 Guest 与 host-only 网络；当前执行环境没有完整 Docker/systemd VM，**真实 PoC 没有执行**。A2-3 root/离机双持久回执、CAS/epoch 和 Guard 安装均**未实现或授权**。仍 `P0-01 NOT_RUN / S03/G06/S09/R2-C4 OPEN / C5-G2 NO-GO`；本地文档审阅后方可另批提交，生产无任何修改。


**2026-10-23 R2-A2-2 禁入 adapter/安装/撤回方案（LOCAL REVIEW / NOT IMPLEMENTED）：**在 [R2-A2-2 设计文档](Runtime更新-R2-A2-2禁入适配器与安装权限撤回设计.md) 只读复核最新 `dev@fac45616` 的 A2-1 离线模型、部署/备份源码、R2-A1 现场事实，区分 Docker 四业务容器 CONTROL 与 Clover 开发 host-network Tunnel `unless-stopped` PRESERVE，并对 `docker.socket`、手工 Compose/Engine API、root-only `deploy_release.py --execute`、备份 timer/service/`ubuntu` 直接脚本/`rclone`/protected Nginx helper 的副作用禁入提出候选 adapter。记录重要缺口：A2-1 期望 systemd `masked` 不可自动假设适用本地安装的 unit，wrapper/ExecCondition 并不能防 Docker socket/root/直接脚本绕过；强制 Engine API 策略、sudoers/backup owner、持久 root guard 和 off-host epoch/CAS、安装/撤回均需单独审阅授权，不能把离线样机视为 S03 PASS。**本轮只写文档，没有实现 adapter、没有生产系统/容器/权限/17 Bundle 变更；R2-C4 / S01–S12 / G06 OPEN / C5-G2 NO-GO 不变**。此条优于更早“准备进入 A2-2”描述，但不改动历史记录。 **同日新增已选失败模式：**用户明确选定 **SAFE_STOP_DOCKER_ON_UNCERTAIN_RESTART**：在 ARMING/冻结/事故/不明阶段遇 VM 或 Docker daemon 重启，先于 Docker 自动恢复由持久 Host/systemd 启动屏障阻止**整个 Docker daemon**；Clover 开发隧道此时可以暂时不可用，不得因此自动解除禁入。正常不中断维护仍保留 Clover 原策略，不主动停用。新增保护资源级写入禁令（DB volume、Uploads、Runtime、Docker socket、host/network/backup side effects），区分历史未安装、预安装/未 ARM、ARMING、FENCED、INCIDENT、损坏/离机失联、待放行及 RELEASED；已登记安装后的文件缺失不能视为 RELEASED。**第一项同版本隔离 PoC**：仅 API 切换 restart=no 即掉电，DB/Web/worker 仍 always，复启必须挡住 daemon，独立 SSH 救援可用，Clover 可降级。A2-1 PRESERVE 模型的异常 Clover 停止仍记 INCIDENT，合同调整另审批；A2-3 真 CAS/epoch/双回执未完成前不允许真实维护。详见 [A2-2 §3/§6/§8](Runtime更新-R2-A2-2禁入适配器与安装权限撤回设计.md)。**只是设计方向授权，不是 Guard 安装或生产权限授权，G06 / S03 / S09 / C5-G2 门禁不变。** 

**2026-10-23 R2-A2-1 离线模型源码验证（SOURCE CI VERIFIED / DEV DELIVERY AUTHORIZED）：**基于 PR #2916 已合并的 `dev@64f9968f`，按用户本次授权在 Runtime/Ops 内新增准确原策略/registry、maintenance owner/txid/epoch、双回执持久化意图、连续观察/事故/重载和全阶段 DENY 模型，25 个 synthetic unittest 已纳入既有 Runtime CI。Clover 独立开发 Tunnel 及管理/系统对象 PRESERVE；无真实持久化/CAS/跨进程锁/Host/AWS/安装/放行 adapter，无生产变更或 17 Bundle/CI/依赖/schema 变化，用户审阅后授权远端交付，[PR #2917](https://github.com/sanqin888/sanqinMVP/pull/2917) → dev；源码 `8d2425d9…` 的 [CI #7482](https://github.com/sanqin888/sanqinMVP/actions/runs/39969268220) SUCCESS（Runtime 559，含本批 25；Release 45）。本次只补验证记录，最终文档 head 的 Checks/合并事件以 PR 为准；MCP 无本地测试。见 [R2-A2 工作包](Runtime更新-R2-A2-MaintenanceFence离线模型与失败测试.md)。**R2-A2-1 源码 CI 已通过，完整 R2-A2/生产验收仍 OPEN；R2-C4 / S01–S12 / R1-C1 OPEN、C5-G2 NO-GO、S2 DAILY PAUSED 保持。**

**2026-10-23 R2-A1 HOST-READ-002 实测续记（LOCAL DOC REVIEW）：**PR #2915（CI #7478 SUCCESS）已合并 `dev@3ba4ac2b`。用户授权的生产 SSH/Cloudflare 控制台 H14–H18、G03 root Cron、G05 Release State、G07 磁盘覆盖已实际回传，详情与精确 rc/时间/身份见 [HOST-READ-002 §§8–12](Runtime更新-R2-A1-HOST-READ-002启动入口与实装身份审计.md) 及 [R2-A1 §10](Runtime更新-R2-A1真实生产清单与接口只读核验.md)。完整 systemd/socket 显示 `docker.socket` active；system Cron/ubuntu/root 私有任务限定已核，`no crontab for root rc1` 不视为故障；unattended-upgrades 每日启用但自身自动整机 reboot 未开启，服务重启仍需协调。生产 Runtime 17/17 与 Manifest SHA 一致，root-only state 经独立批准字段只读得到 `phase=active/current=ff5be8d5…/previous=a84b7200…`；生产当前 `ff5be8d5…` Image 是主动保留，禁止因审计升级。Clover 开发 Tunnel 是 `host` 网络/`unless-stopped` 的独立 MacBook Sandbox 公网入口 `clover-dev.sanq.ca → https://127.0.0.1:18080`，保持 PRESERVE；现场 `:18080` 无监听，不把 Cloudflared running 宣称为公网端到端成功。已识别 Runtime/Uploads/Backups/Sounds 根盘直接确认、PG local Volume 根盘交叉验证（直接目录读取 `rc1` 权限受限）；**仅存储位置 PASS_SCOPED，非 AWS 快照/PG WAL/独立恢复 PASS**。现 `G01 PASS_SCOPED / G02 PARTIAL / G03 PASS_SCOPED / G04 PARTIAL / G05 PASS_SCOPED / G06 OPEN / G07 ROOT_DISK PASS_SCOPED, OVERALL PARTIAL / R2-A1 INVENTORY ENOUGH FOR OFFLINE A2-1 / R2-C4 OPEN / C5-G2 NO-GO / S2 DAILY PAUSED`。本批只同步文档，没有新生产操作、启动策略/镜像/快照/权限变更；旧较早条目的 OPEN/未执行是历史时间截面，不能当作当前结论。

**2026-10-22 R2-A1 真实生产清单/接口只读核验（LOCAL）：**继 `dev@5e1b9608`，现场 MCP 证实生产 Docker/MCP tunnel active、Compose `sanq-app` 四个容器 healthy、当前应用配对镜像 `ff5be8d5…`；GitHub `main@ef5caa32` 和 Compose 的四个 `restart: always` **只是源码视图**，没有读到容器实际 RestartPolicy/Mounts、systemd/cron/非容器写入者/管理权限。按 [R2-A1 审批包](Runtime更新-R2-A1真实生产清单与接口只读核验.md) 冻结 H01–H10 精确 Host 只读命令候选及 G01–G07 UNKNOWN；候选**未获生产现场执行授权，未运行**，没有 root/Docker 变更/AWS/冻结/快照。`R2-A1 MCP PASS_SCOPED / HOST INVENTORY OPEN / R2 C4 OPEN / R1 C1 OPEN / G2 NO-GO / S2 DAILY PAUSED`。本批仅本地文档，未推远端。

**2026-10-22 A2-II-R2 真实只读回执限定裁定（LOCAL）：**用户上传 `A2-II-R2-20261022T190353Z.zip` SHA256 `3a2703c9284937a357f6d1262e9599034e0157bd3feada359dc19ed18f1b82d3`，独立离线重算 80/80 文件摘要，39/39 stdout/stderr/rc 原始记录一致（27×rc0、12×`test -w` rc1 受控负证据）。Guest 的 `user.slice`/`user-1000.slice`/`session-37.scope` 目录均 root:root 0755，`cgroup.procs` 和 `cgroup.subtree_control` root:root 0644、`cgroup.kill` root:root 0200，对这 12 个接口本次 UID1000 不能直接写。cgroup2 挂载 `nsdelegate` 不等于实际委托；A1 ext4 `/dev/sda2 rw,relatime` 没有证明已配置 8MiB 硬 quota。操作器对成功检查仍显示 `...UNEXPECTED` 是 `validate_guest()` 固定 note 的诊断瑕疵，receipt 39/39 `candidateMatch=true`、`gap=null`，无需重跑。见 [R2 §7](R1C-2C-C-C1-SYN-001-A2-II-R2委托权限与Quota精确核验审批.md)，状态 `A2-II-R2 READONLY PASS_SCOPED / RESOURCE HARD QUOTA AND CHILD CONTAINMENT BLOCKED / A2-S/A3/A4 NOT AUTHORIZED / C1 DYNAMIC OPEN / C5-G2 NO-GO / S2 DAILY PAUSED`。任何真正部署委托或 quota 等变更需独立授权；本批仅本地文档。

**2026-10-22 A2-II-R2 精确只读审批包（LOCAL ONLY）：**继 PR #2911 CI #7470 SUCCESS squash merge `dev@f62ee2c31e3527d75e373c1c5aa0f9870716e94a`，在 [R2 审批包](R1C-2C-C-C1-SYN-001-A2-II-R2委托权限与Quota精确核验审批.md) 冻结动态解析当前用户 cgroup session 的严格允许前缀，受限 R07 stat / `test -w` 仅查看本人父级与 session 的 `cgroup.procs`/`cgroup.subtree_control`/`cgroup.kill` 静态能力，R08 仅查 A1 挂载、cgroup2 mount、statfs、既有 `/dev/sda2` 节点元数据。**无写入、无现场 R07/R08 执行授权**；从历史 R01 信息不能断言 delegated cgroup 权限或 8MiB 全 raw 硬限，也不能推出脱离 process-group 后的所有 tracee 可被可靠终止。保持 `A2-S/A3/A4 NOT AUTHORIZED / C1 DYNAMIC OPEN / C5-G2 NO-GO / S2 DAILY PAUSED`，本地待审。另备 Mac 离线操作器 `A2-II-R2-Guest-ReadOnly-20261022.py` SHA256 `73d6a2e3477d1228cba777338b413afee29b53d30597a866eb2be6e6e5495dd7`（未进入 Git、无真实 Guest 运行；运行需另批明确许可）。

**2026-10-22 A2-II-R 现场只读回执限定复核：**用户原件 `A2-II-R-20261022T183900Z.zip` SHA256 `fba18c72a6df84cd88cbb3a0fdbe11873778933d22a3a1dfb5e72a5030234689`，独立重算 30/30 SHA 清单、14/14 原始命令回执 stdout/stderr SHA/bytes 与 rc0，Host pin/Guest boot/UID/GID 与 A0/A1 ZIP 逐字节相符。R01 user.slice/user-1000.slice/session-34.scope；R02 v2 root controllers 可见，R03 root enabled `cpu memory pids`；R04 A1 位于 `/dev/sda2 ext4 rw,relatime`（未显示 quota）；R05 strace 6.8；R06 非 root UID/GID1000 同 boot。此轮只读技术 `PASS_SCOPED`，**并未证明 delegated cgroup/cgroup.kill 写入权、8MiB aggregate 硬限制或 SSH 异常脱离子进程清退保证**。保留原 receipt false，不改安全合同，下一步仅提议另批审阅 R07 scope/cgroup.kill 与 R08 quota 只读查询；需独立授权，不执行 SYN/strace/root/Guest 写入。`A2-S/A3/A4 NOT AUTHORIZED / C1 DYNAMIC OPEN / C5-G2 NO-GO / S2 DAILY PAUSED`。见 [A2-II-R §5](R1C-2C-C-C1-SYN-001-A2-II-R现场只读取证审批包.md)，本地文档未推远端。

**2026-10-22 A2-II-R 本地准备：**PR #2909 经 CI #7466 SUCCESS squash 合并 `dev@2dc710c93fec998c5766a6680bbf5ca26f8297c5`；现在 [A2-II-R 现场只读取证审批包](R1C-2C-C-C1-SYN-001-A2-II-R现场只读取证审批包.md) 已冻结 Mac 宿主 S00–S05 既有 VM/VDI/Host-only/SSH 控制台 pin 前置与 Guest R01–R06 八条精确只读 argv、限制、原始回执完整性及失败冻结。仅本地准备 Mac 独立操作员文件 SHA256 `d6e8b37a095ff12167db4ae533f45b9beff02313c91816e693697ac27489b7ca`、完成语法/纯离线校验；**没有现场运行、没有 Guest R01–R06 执行授权**，未更改既有 `8MiB` 硬预算与进程生命周期安全门禁。

**2026-10-22 A2-II 安全隔离技术方案（LOCAL REVIEW）：**PR #2908/CI #7463 SUCCESS 已合并 `dev@80f970bd6a1845a376fdd520d832a7a3ceead0c0`，但 A2-I 仅提供实验室采集与 Mac 本地封存：单文件 `RLIMIT_FSIZE`、事后查 raw 不满足冻结的全 raw **8MiB 即时硬上限**；process-group `SIGKILL` 也不证明所有 detached 子进程/SSH 断线状态。新 [A2-II 资源/生命周期技术选型](R1C-2C-C-C1-SYN-001-A2-II资源隔离与进程生命周期技术选型.md) 比较受委托 cgroup v2/cgroup.kill、隔离的 FS quota、strace kill-on-exit 以及改变 `-ff` 的替代方案；其中配置、argv/证据形状或放宽硬限额均必须再次明确审批。下一步先做单独授权的同一 Guest **R01–R06 只读能力取证**，再决定实施，无实际 Guest 连接、软件安装、quota/cgroup/strace 动作。**`A2-II READ-ONLY PROBE NOT AUTHORIZED / A3/A4 NOT AUTHORIZED / C1 DYNAMIC OPEN / C5-G2 NO-GO / S2 DAILY PAUSED`**。此批只在本地更新技术审批文档。

**2026-10-22 A2-I 新内部采集/封存代码本地审阅状态：**基于 PR #2907 CI #7461 SUCCESS 的 `dev@16dfab28c5daad40690277002b9cede4642b23fd`，新增 `ops/runtime/c1_syn001_guest_capture.py` 的非 root A1 源检验和本地 fixture 进程组/双流/失败保留核心，以及 `c1_syn001_mac_seal.py` 的仅 Mac 本地独占封存/receipt-pin/SHA256SUMS；配套聚焦 unittest。**真实 `run_scenario` 和 Guest CLI 仍固定拒绝运行**，MAC 封存组件无 SSH/上传能力。8 MiB aggregate 瞬时硬限制和 detached child/SSH 断线无孤儿保证尚不可证明，代码明确不是硬执行许可，不削弱原冻结合同；需后续明确的安全资源隔离方案/单独审批。未运行真实 Guest/strace、未部署生产或改 v1、依赖、CI/schema。`A2-I LAB CORE LOCAL REVIEW / A2-S/A3/A4 NOT AUTHORIZED / C1 OPEN / C5-G2 NO-GO / S2 PAUSED`。见 [A2 §6](R1C-2C-C-C1-SYN-001-A2-CAPTURE-001采集与失败保全审批草案.md)。本地未推远端。

**2026-10-22 A2-CAPTURE-001 采集安全差距审计（LOCAL）：**A1 已经 PR #2906/CI #7459 成功合并 `dev@d746698145a1f340cccacd464f5ddd21249c6519`，三源保持 `PASS_SCOPED` 且 Guest 只读文件不可重投。现 [A2 审阅草案](R1C-2C-C-C1-SYN-001-A2-CAPTURE-001采集与失败保全审批草案.md) 已冻结继承的两条 `strace -ff` argv、非 root/精准 cwd/env、30 秒 wall、4 MiB 单 trace、8 MiB 全 raw 与 stdout/stderr/真实 rc、失败保全要求；同时核查现有纯内存审批模块**并未实现** Guest 本地进程组 watchdog、SSH 断线无孤儿、聚合 8 MiB 硬限制，也未批准 `raw/` 或第四份 collector 文件投送。建议下一批先设计经审源码、离线负例与资源保障，再逐批请求 Guest 投送/单场景权限。`A2 DESIGN DRAFTED / COLLECTOR NOT BUILT / A3/A4 NOT AUTHORIZED / C1 DYNAMIC OPEN / C5-G2 NO-GO / S2 DAILY PAUSED`；本地文档待审，未运行 SSH/strace 或生产操作。

**2026-10-22 A1-SOURCE-001 真实投送 scoped 技术复核：**用户已在已确认的非 root Host-only 隔离 Guest 创建唯一测试目录，并准确投送 SYN-01/SYN-02/input 三份冻结实验文件。独立离线复核 `A1-SOURCE-001-20261022T161938Z.zip`（SHA256 `fc288a8cf804283d9aecc3ae8506511626f4b58b791a42d6597fe0c525db942c`）：原件 52/52 SHA 清单、25/25 原始命令 rc0 与 stdout/stderr SHA/length 一致，现场 VM/VDI/SSH 公钥、Guest boot/ns 同 A0-GUEST 原件；唯一目标初始不存在，目录 mode 0700、UID/GID 1000，三文件 regular/mode 0400/nlink1，大小 25/1028/1641 与来源 SHA 完全吻合。本包是 Guest 命令 SHA 读回结果，**不含再次取得的 Guest 三文件完整字节**，不证明动态消费窗口不可替换。技术结果 `A1 PLACEMENT/READBACK PASS_SCOPED`；原 receipt 权限字段保持 false，既有 Guest 测试目录须留存而不可重复投送。**A2 采集/超时/日志配额与写路径待授权，A3/A4 strace NOT AUTHORIZED；C1 OPEN/C5-G2 NO-GO/S2 DAILY PAUSED。** 详见 [A1-SOURCE §7](R1C-2C-C-C1-SYN-001-A1-SOURCE-001安全投送与冻结审批.md)；本地文档未提交远端。

**2026-10-22 A1-SOURCE-001 用户追加授权：**用户已批准同一已核验隔离 Ubuntu Guest 的 non-root 单次私有目录创建、三份冻结合成源原件投送及严格 SHA/owner/mode 读回。Mac 操作器 SHA256 `51a3c2942ca728b3deab74e22bceebef200f13877e9157d07bbd6eeded8f8267`；现有系统命令 `mkdir`/`dd conv=excl oflag=nofollow`/`stat`/`sha256sum`，不新增 Guest helper、无 `strace` 或实验源码执行。仅本地生成并离线模拟验证，尚无真实 Guest 投送回执；`A1 USER AUTHORIZED / EXECUTION PENDING / A2-A4 NO-GO`。见 A1-SOURCE-001 §6。

**2026-10-22 C1-SYN-001 A1-SOURCE-001 本地准备：**PR #2905/CI #7456 全绿后合并 `dev@d7f57ff2`，历史 C0 LIMITED-ACCEPTED、Host/Guest A0 `PASS_SCOPED`；现将唯一三份合成源/输入原始 bytes（1,028 + 1,641 + 25 = 2,694 B）、SHA、目标 `/tmp/sanq-c1-syn-001`、non-root 0700/0400 权限、无覆盖/无 symlink、已有 Host-only/SSH pin/boot 身份复核和真实 Guest 读回检查冻结成 [A1-SOURCE-001 源文件安全投送审批包](R1C-2C-C-C1-SYN-001-A1-SOURCE-001安全投送与冻结审批.md)。本批仍 **没有** A1 Guest 写入许可，不运行 SSH、文件投送、helper、`strace` 或生产更新；A1 精确命令/辅助程序须另外审阅授权，A2/A3/A4 未授权。`C1 DYNAMIC OPEN / C5-G2 NO-GO / S2 DAILY PAUSED`。本地文档未推远端。

**2026-10-22 A0-GUEST-001 scoped 技术验证续报：**操作者从受控 Ubuntu VM 控制台先验取得 SSH ED25519 主机指纹，再以严格 host-key SSH 执行 G01–G07。新收到原始 ZIP SHA256 `f309e9a96c6cda5c79d7e0fdf452606c53ab6b32237656e387f5fc6e653f70ec`，离线核对 28/28 SHA256 文件清单、13/13 Host/Guest 命令 rc0/原始回执、自行重新计算公钥指纹匹配、非 root UID/GID=1000、boot/ns、ptrace=1、strace/Python/loader SHA 均与既存来源候选吻合。此前 Host scoped 技术核验加上此次 Guest scoped 核验，满足本次隔离 non-root synthetic A0 身份/隔离目标；但原 receipt `a0Approved=false/guestAuthenticated=false/traceAuthorized=false` 仍保留，**不升级为完整 C1 身份授权或动态运行许可**，A1 源材料安全投送、A2 执行准备与 A3/A4 trace 分别需要后续批准。详见 [A0-GUEST 原始证据复核](R1C-2C-C-C1-SYN-001-A0-GUEST-001只读身份复核.md)。本批不改代码、SSH/Guest/VM/生产状态，未推远端。

**2026-10-22 A0-SITE-001 Host 原件回传与 scoped 复核：**已收到 2026-10-22T14:35:28Z 现场 ZIP，原件 SHA256 `c6407f37c73ad98286ee62b8256fa7039e5081ea09b2670c713416972ca95ae7`；独立离机复算 17/17 清单、8/8 命令 rc0、raw 与 receipt 字节一致，VM/VDI/Host-only/转发状态均与既有批准候选配置相符。H05 `hostonlyifs` rc0 但输出为空；H06 `hostonlynets` 有 Enabled 目标网络，不把 H05 判为单独接口存在证明。结论 `A0-SITE-001 HOST PASS_SCOPED`，`A0-GUEST SSH/BOOT OPEN`、`A1/A2 OPEN`、`A3/A4 NOT EXECUTED`。无 Guest/SSH/strace/root/AWS/生产操作，仅本地文档续报。详见 [A0-SITE §6](R1C-2C-C-C1-SYN-001-A0-SITE-001现场只读审批包.md)。

**2026-10-22 A0-SITE-001 Host 只读范围已获用户后续授权，但未取得现场结果：**H01–H08 已获准确限定范围执行批准；仅既有受控实验 Mac/VM，历史 `C1-HOST-005` 标识仅用于当次身份核对，**不自动授权新 VM/Guest/SSH**。本 MCP 不能接入用户 Mac，当前 `A0-SITE-001 SITE NOT EXECUTED / RESULTS PENDING`，未变更 VM/生产。原准备记录：

**2026-10-22 A0-SITE-001 本地 Host 检查范围准备：**在 PR #2904 / CI #7454 成功合并 `dev@03548031` 后，编制 [Mac/VirtualBox 八条非 root 只读 argv 与后续 Guest/SSH 分批审批包](R1C-2C-C-C1-SYN-001-A0-SITE-001现场只读审批包.md)。源于 R0 §4.1 最小必要取证，只围绕本次批准的 VM/VDI/Host-only/转发状态；当前无准确当次 VM/VDI/SSH 私有批准参数、不能声称执行。首次 SSH 指纹必须先在受控 Guest 控制台确立，Guest 读取/trace 需单独审批。`C0 CLOSED/LIMITED-ACCEPTED / A0-SITE-001 COMMANDS DRAFTED NOT EXECUTED / C1 DYNAMIC OPEN / C5-G2 NO-GO / S2 DAILY PAUSED`；本次仅 docs-only、本地未提交远端。

**2026-10-22 C1-SYN-001 A0–A2 离线审批准备（最新 dev `9845e698`）：**在 PR #2903 已按 §4.1 关闭历史 C0 为 `CLOSED / LIMITED-ACCEPTED` 的前提下，本地新增不读现场、不执行命令的 Runtime/Ops 离线审批材料审阅器和聚焦负例测试，并编制 [C1-SYN-001 A0–A2 执行前门禁包](R1C-2C-C-C1-SYN-001-A0-A2离线预检与执行审批.md)。SYN-01/02 精确源码 hash、argv、非 root、cwd/环境、超时/配额、输出回执与失败保全沿用已批准设计；新 A0 保留 VM/VDI/Host-only/SSH host key 的 SanQ 现场安全确认（不再要求外部人士签名），A1 保留关键执行来源校验，A2 保留逐条真实命令批准。即使输入声明自洽，工具也永久 `guestExecutionAllowed=false`，没有执行 `strace`、SSH、VM、root、AWS 或生产更新；不修改 v1 reviewer、normal-update、schema/依赖。`C1-SYN-001 PREPARED / A0–A2 APPROVAL OPEN / A3–A5 NOT EXECUTED / C1 OPEN / C5-G2 NO-GO / S2 DAILY PAUSED`；本地审阅后另授权远端。

> **2026-10-22 全阶段取证规则修订及 C0 限定收口（本地待审）：**用户已明确批准：R0–R5、C1–C8、G2 A–F 的**所有环节取消第三方人员见证、签名 PDF、见证邮件、第三方原始复算底稿以及多主体逐跳交接作为验收门禁**。适用于隔离 VM/Guest、Ubuntu 来源、Root 执行、维护停写、AWS 快照、安装、恢复及生产复验。由 SanQ 内部授权、可信系统来源、必要哈希/签名和分离的内部技术复核替代；独立技术核验不意味着必须有外部人士。基于此新标准，历史 [C0 工作包](R1C-2C-C-C0独立身份与保管链证据复核.md#7-2026-10-22--新-r0-最小必要取证标准下的-c0-限定收口) 拟裁定 **`CLOSED / LIMITED-ACCEPTED`**，旧失败/见证与 LIMITED/BLOCKED 原结论原样保留；新会话 VM/VDI/SSH host key 的安全确认转为 C1-SYN A0 Preflight。正式生效以本次 PR 合并 dev 为准。真实执行精确用户授权、发布完整性、维护冻结、快照/恢复、数据一致性和安全失败停止仍为强制条件。**本次仅修订文档，不解锁现有 reviewer 或生产执行权限。**

**2026-10-21 C0-EVIDENCE-RECONCILIATION-001 本地原件复核：**PR #2901 / CI #7448 全绿已合并 `dev@144abbd1`，C1-SYN-001 设计材料已进入 dev，实际动态实验仍未授权。在独立 C0 分支重新只读复核既有见证回邮与原始签署 PDF（SHA-256 `85440dc4d25600d7dadd5334c304d08a4cad46715b1c96136fafc89f4fccf166`），其 6 项首选由实心圆点标记、但当时实际复算命令/rc 与交接原始回执未填，有限结论 `LIMITED`；PDF 与邮件的 hash 一致不构成采集前独立 Host/Guest/SSH 身份 pin。本轮重新取得旧 witness ZIP 和 B-001～004 四批原件并复算清单（Host 20/23/23/23、Guest 003=28、004=97 全匹配；B-004 的 98 个见证原件与 ZIP 内对应项逐字节一致）；另收到 C1-HOST-001～005 全部 Host 原始包 `归档 2.zip`，五批 23/23 SHA 清单和 7/7 命令回执匹配，001 的 VM 关机导致 16/17，002～005 为 17/17；仍缺独立采集前身份/SSH pin 及跨主体交接证明；新增 [C0 实证矩阵与旧证据复用/材料缺口清单](R1C-2C-C-C0独立身份与保管链证据复核.md)。当前 `C0 IDENTITY-CUSTODY OPEN-LIMITED / C1 DYNAMIC OPEN / C5-G2 NO-GO / S2 DAILY PAUSED`；没有 SSH/Guest/strace/VM/AWS/生产动作，本地文档待审、远端未推送。

**2026-10-21 R1C-2C-C / C1-SYN-001 本地设计准备（非现场授权）：**在 `origin/dev@0fc583b0` 审阅离线 reviewer v1/测试和 R1-C/C0 最新证据后，新增 [C1-SYN-001 受控动态观察设计与逐项审批草案](R1C-2C-C-C1-SYN-001受控观察设计与审批草案.md)及 SYN-01、SYN-02 两份带候选 SHA256 的纯文本源码和固定无业务输入；覆盖 pre-exec、open/read、fork/child exec/mmap、预算、完整原始输出/退出码/交接及负面场景。它仅是 `DISCOVERY_ONLY` 候选，未执行程序、strace 或 Guest 操作，也不改变 v1 合同的 fork-only 事件顺序限制。**复用 C0 已执行但 `LIMITED` 的历史见证/原件信息，不将其解释为新会话身份已认证**；现场 A0–A2 身份 pin、observer/source/保护与逐条命令执行审批仍 OPEN。`C1-SYN-001 DESIGN PREPARED / NOT EXECUTED / C0 IDENTITY-CUSTODY OPEN-LIMITED / R1/C1 OPEN / C5-G2 NO-GO / S2 DAILY PAUSED`。本批只改本地文档和不具执行入口的源候选文本；远端须另授权。

**2026-10-21 R1C-2C-C / C0 身份与保管链历史执行补录（本地待审，未重新取证）：**核对 10/20～21 已发生的 `R1C2C-B-004` Host/Guest 采集、操作员 `SHA256SUMS.host` / `.guest` 全 OK、独立见证回邮 `R1C2C-B-004-WITNESS-EMAIL-001` 及签署 PDF `LIMITED`、随后独立环境对私有 ZIP 的原件结构审核 `OFFLINE_SELF_CONSISTENCY_CHECKED / BLOCKED`。该工作**已经实际执行**，此次只补记证据索引、归档/PDF 摘要、核验层级与缺口，不因历史工作已做而宣称完整 Host/Guest 身份及保管链认证 PASS。身份/来源采集前第二渠道 pin、见证人逐项原件复算命令/rc、完整交接 UTC 和当前后续 C1-HOST 各会话独立绑定仍缺；状态拆分为 `C0 EXECUTION EVIDENCED / C0 OFFLINE STRUCTURE CHECKED / C0 IDENTITY-CUSTODY ATTESTATION OPEN-LIMITED`。详见 [R1-C §15 C0 历史执行证据补录](C5-G2-R1-B-只读GuestFD采集器与执行审批.md#15-2026-10-21--r1c-2c-c--c0-身份与保管链实际执行证据补录非重新取证)。本次不改 Runtime、证据 v1、Guest/VM、AWS、CI、依赖或生产，不另获现场执行权；`R1/C1 OPEN / C5-G2 NO-GO / S2 DAILY PAUSED` 不变。

**2026-10-21 C1-HOST / PIN / SOURCE / OBSERVER Native 全批次续记（本地待审）：**按取证时间线新增 `R1C2C-C1-HOST-001～005` 五批 Host 前置检查与隔离/身份边界；`R1C2C-C1-PIN-001` 四基础 ELF（操作员 SHA 13/13 OK、dpkg 原路径查询 rc=1，整体 PARTIAL/BLOCKED）和 `PIN-002` 三项 owner/diversion 查询（rc 0/0/0、12/12 OK、整体 BLOCKED）；补记 `C1-SOURCE-LIBC` 受既有 keyring 约束的发行包成员核验与 `C1-SOURCE-STRACE-001` 限定来源技术核验（冻结 XZ 审核器仍 BLOCKED），不将来源核验等于 Guest 独立身份。未找到单独准确的 `C1-OBSERVER-001` 追踪执行证据，现有 `strace -V` 只是版本发现，**并未执行动态 trace**。已收到 `C1-OBSERVER-NATIVE-003` 私有原始归档并在独立离线环境完成单文件 Guest ELF → Ubuntu 已验签索引绑定 `libunwind8` 包成员的逐字节比对（36/36 限定检查）；`002` 三份 ELF 仅有操作员本地 SHA 清单及与官方成员摘要匹配，尚缺该批 Guest raw 的独立复算。已识别 `strace` 静态 `DT_NEEDED` 候选图暂未发现新缺失项；**C0 Host/Guest 独立身份/保管链、C1 动态消费/未知动态依赖仍 OPEN**，不升级整体 `C1` 或 `C5-G2`。详细原件 ID、SHA、分层裁定及 C0 / C1-SYN-001 后续审批边界见 [R1-C §14](C5-G2-R1-B-只读GuestFD采集器与执行审批.md#14-2026-10-21--c1-观察器静态-native-来源续审与后续-c0--c1-syn-001-交接本地待审)。本批仅改文档、先本地审阅；远端提交须另授权。`R1/C1 OPEN / C5-G2 NO-GO / S2 DAILY PAUSED` 不变。

**2026-10-20 R1C-1 源码准备续记：**S5/doc-only 收口 PR #2886 最终 head `4e31bd70` / CI #7411 success / dev merge `09354818c37dc5fa649b65ac466448dc5d64494b` 后，用户要求开始 R1C-1。最新 dev 基线 `fa6513a71451309898ffc4ab3c720b8c63458511` 上新增正常更新单次编排核心与不可变启动提案：来源/私有准备→原状态记录→持续维护→准确快照→冻结复核→交接→安装复验→精确策略恢复→复验→最后放行业务。仅合成能力供给，真实准入/Host/AWS/FD/安装/离机持久化及 bootstrap 未接线；18 个聚焦测试已编写，未运行/未推送。按现行 R0 顺序，不复用旧 Kit/故障机自举执行合同、不放宽 lab guard；实例 Lock 不代替 R2 持久排他。详见 [R1C-1 §8](C5-G2-R1-B-只读GuestFD采集器与执行审批.md#8-r1c-1-正常更新流程核心与执行场景)。D1–D5、R1/C1 OPEN、G2 NO-GO、S2 daily PAUSED 和 C2 有限 CLOSED 不变。

**2026-10-20 R1-B/S5 最新续记：**PR #2885 最终 head `0533c209` / CI #7405 success，dev merge `8a99c99eb17a3ff27552e3b0f611204691e72984`。操作员在明确批准的一次准确暂存/root 只读取证范围完成 CAPTURE-003；成功归档 SHA256 `7d33106d340df9727276a969f12925852f6ab9ecc5542ff6ab88b9e8a3300ab9`、27 项清单及三个退出码 0/0/0 已离机核对，三个 FD/三条链接匹配既有独立包成员基线。S5 CAPTURE + ORIGINAL-EVIDENCE CONSISTENCY = PASS_SCOPED；两端时钟有偏差，平台/来源/动态消费/安装授权 false 保留。详情见 [R1-B §6](C5-G2-R1-B-只读GuestFD采集器与执行审批.md)；下一步 [R1-C 就绪与实施拆分](C5-G2-R1-B-只读GuestFD采集器与执行审批.md#7-r1-c-s6-就绪审计与实施拆分)，尚无正式正常更新执行入口/完整 S6 消费见证。下文 §3/§5/§9 等旧未执行状态保留历史范围。D1–D5 不变，C2 有限 CLOSED，R1/C1 OPEN、G2 NO-GO、S2 daily PAUSED，R2–R5/生产/AWS 均未因此放行；不重跑 capture。

**2026-10-20 R1-A 原件复核续记：**已读取六批封存原件（261 files），在独立于采集 Mac/Guest 的环境重验 noble-updates Release 签名、完整索引、七个 deb、三个普通成员及三条链接，准确来源对象技术检查通过；另收到更正日期后的人工文档确认，明确未自行验签/解析，故为 LIMITED，不冒充另一主体的独立技术见证。准确 hash、保管与剩余缺口见 [S1 §9](C5-G2-R1-S1-独立Ubuntu签名验真采集程序.md)。R1-A 整体正式验收仍 OPEN，原回执 BLOCKED、guestRouteAuthenticated=false、R1/C1 OPEN、G2 NO-GO、S2 daily PAUSED。文档 PR 合并后先做 B2-1C optional ar slash/zstd 的最小格式适配，再准备 R1-B；本次没有 root/生产执行授权。下面 2026-10-19 及更早续记均保留历史时间范围。

**2026-10-19 R1 取证状态续记（本次仅本地文档待审）：**S1-W1 可信公钥取得限定独立审批，S1-R1 Hosted Runner 的准确 `noble` Release 签名原件和 S1-D1 加密归档/读回已核对；详见 [S1 §8](C5-G2-R1-S1-独立Ubuntu签名验真采集程序.md)。**仅关闭 R1 内部这组有限取证子项，Runtime R1 / C1 总体继续 OPEN**。R1-A/B/C 仍需推进；R2 MAINT-RESTART-01 依然是下一正式总批次、目前未实施。旧 §3/§5 的历史“未执行”记录不追溯修改；本次没有新源码/Guest/root/AWS/生产授权。

**2026-10-18 两项修订交付：**[PR #2864](https://github.com/sanqin888/sanqinMVP/pull/2864) → `dev`；CI/合并以此 PR 最终 head 的 Checks/事件为准，原 PR #2853 仅为初始 R0 历史交付。

**原 R0 交付记录（历史）：**[PR #2853](https://github.com/sanqin888/sanqinMVP/pull/2853) → `dev`；本批提交、最终 head 的 CI 与合并状态以该 PR 检查和事件为权威。

**原 R0 / C2 冻结记录（历史；本次修订见下文 §2）：D1–D5 APPROVED / R0 DESIGN FROZEN。C2-CHANGE-01 已将 C2 恢复模式唯一确定为「指定 Snapshot → 独立新实例」，并废止原机 `snapshot restore` 验收。2026-10-18 **C2-CHANGE-02 用户明确授权调整证据充分性规则**：现有 A/B Snapshot 来源、克隆操作与 rc、独立 VDI、Host/Guest 有限基线、合成服务及离机归档可被直接独立审查；Marker A/B **不再是强制前置**，而是仅在关键来源/时点证据不足且另获授权时才可能补充。不得把来源链等同整盘内容不变或全部快照后变化不存在。D1–D5 及 C1/C3–C8/G2 授权不变。** 用户明确要求“五项都按照推荐方案进行 R0 一次冻结设计”，本记录据此生效，不再等待重复架构批准。冻结日为 2026-10-17（America/Toronto）；源码核对基线为 `origin/dev@592c534896d18ca51082b708b8ab677402fabe4a`，文档分支为 `docs/runtime-r0-design-freeze-20261017`。

**本次补充状态（2026-10-18）：RUNTIME-SNAPSHOT-01 / MAINT-RESTART-01 APPROVED；DOCUMENTATION DELIVERY AUTHORIZED / IMPLEMENTATION NOT STARTED / AWS ACCEPTANCE NOT RUN / C5-G2 NO-GO。** 上面的 PR #2853 与原 R0 冻结日期是历史交付记录；本批从 `origin/dev@a76d526592b7a46e4659f485a3089d753e267b3c` 审阅，仅更新文档；本批已由用户明确授权提交远端，CI 和合并以本批 PR 最终 head 的 Checks/事件为准。用户已批准两项设计变更，未执行 AWS/IAM/Guest/root/生产操作。C2 的独立证据规则按其最新所属合同保留，本批不重置或补造任何实验结论。

## 1. 权威入口与有限边界

本文统一决策、进度和 C1–C8；[AWS 整机快照与维护冻结方案](Runtime更新-AWS快照与维护冻结方案.md) 是本次两项变更的详细操作/状态/恢复合同。[G2](c5-g2-trusted-runtime-contract-2026-10-13.md) 保留 A–F 精确授权层级；[交付与安装约束](Runtime交付与安装约束.md)、备份恢复手册和总队列按这两个现行入口解释。旧 Kit 合同、S1、历史工作日志保留实现/证据事实，旧恢复路线已明确退役为本次更新必做项。

首版目标是独立 Runtime 正常更新，以及维护窗口内失败后从准确 AWS 快照创建替代实例。固定 17 源文件加 Manifest 不变；应用发布/回退仍属 `ops/release/deploy_release.py`。正常更新不改应用 SHA、schema、DB/Uploads，整机恢复则会恢复快照中的磁盘数据，须遵守持续停写保护窗口，不能冒称业务数据永远不变。外部安装副本兼容、旧 checkout 退役仍分别审阅。

## 2. 五项冻结决策及已批准修订

原 R0 为 2026-10-17 D1–D5 冻结；2026-10-18 两项用户批准修订如下，避免继续执行被替代的恢复链。

| 决策 | 现行方案 | 固定边界与完成条件 |
| --- | --- | --- |
| D1 信任模型与平台 | 以受控 Linux/Ubuntu、Python/loader、受保护的正常更新执行器及必要关键依赖为有限信任前提；AWS 控制面/受控账户、内核和受控 root 管理仍为明示信任前提 | 目标原 Archive、准确发布 proof、正式执行器/解释器及**影响安全和稳定性的关键依赖/输入来源**须验证；发生未知可执行依赖/异常动态加载才按 §4.1 追加专项消费取证，不默认完整重建全部 Python/ELF 动态依赖闭包、不要求第三方见证。不递归自证内核；旧故障机恢复自举闭包不再作为 AWS 前置。现有代码 guard 不因合同修订自动放行。 |
| D2 有限维护（MAINT-RESTART-01） | 先确认管理通道，记录原状态；准确容器临时 `restart=no` 并正常停止，阻止 systemd/cron/Compose/MCP/deploy 重新启动，持续停写直到最终放行 | 停用状态进入快照、跨 Docker/VM 重启及新实例首启有效；验证 namespace/持有者/新消费者禁入；不能仅 stop、flock 或空扫描。不得改受 Manifest 校验的 Compose 文件。成功才按原状态恢复，事故保持冻结。 |
| D3 更新前恢复点（RUNTIME-SNAPSHOT-01） | 由受限代码创建唯一 Lightsail 手动整机快照，等待准确对象 `available`，核对源账户/Region/ARN/时间/盘和 txid，离机保存轻量清单 | 替代同次 mandatory crypt/Drive Kit、双旧/新 Archive 解密读回前置；不是人手点控制台。快照覆盖不足、错误、碰撞或未知结果均阻止安装。手动对象明确保留，不自动清理。 |
| D4 备份与实施顺序 | 现役日常备份健康/独立 DR、持续维护冻结、本次可用快照先于活跃安装；S2 daily 扩充在 v1/C5 后另批 | 日常 DB/Uploads/配置/TLS/roles/escrow 保留，S2 PAUSED 不表示停用现役 timer；本批没有部署新 helper、sudoers 或 AWS 凭据。 |
| D5 中断与恢复 | ABORT 旧更新事务、保持冻结并留证；人工确认本次准确快照→独立新 AWS 实例，验证后受控恢复策略与切流 | 不 replay journal、不依赖故障机自举 clean reinstall；源机必须防双写。仅在快照后到放行前持续停写窗口直接适用；放行后故障/未知外部付款订单转独立 DR/向前修复/权威对账。冷掉电仍 NOT VERIFIED。 |

快照 `available` 仅是控制面完成，不能代替应用/数据恢复验证。快照 ARN 不是 tar.gz SHA256，不虚构整盘 hash、签名或 WORM。准确认证/最小 IAM、执行位置和对象在实现时评审；本批不取得任何云/主机执行权。

## 3. 真实进度与尚未成立的结论

| 工作 | 可追溯现状 | 不能据此关闭 |
| --- | --- | --- |
| S1 protected snapshot | PR #2789，dev merge `7723262e`，PR CI #7164 / dev CI #7165 通过；独立库契约已合并 | 没有真实 crypt/远端适配、生产 helper 安装或 daily 接线 |
| G2-A 及 B 系列模型 | 历史来源检查、维护模型、FD 读取/交付、声明绑定等源码已在核对基线；保持各自非授权边界 | 不是已实现的可信 privileged installer；旧日期“本地待审”不再是总进度 |
| B4B-3A 依赖清单 | PR #2848 已合并；merge `dda7698e00effc37e1e8a76aba7c43e50f8f4061`；final head `d4d5513f5dc734e0f9b9321e99e49582073cd263`；CI #7315 / run `39077195858` 通过 | 仅合成声明图校验；没有真实文件采集、独立来源认证或真实 Operator 执行 |
| B4B-2 Guest 实验 | 操作员报告固定合成字节机制 8/8；hash/原证据定位见对应验收文档 | 不是真实解释器完整闭包、独立见证或安装资格；过去未做的原机 restore 只是历史事实，不再属于新 C2 验收；该实验仍不能代替新实例恢复门禁 |
| B2B8 / H-01–H-08 | B2B8 仅 S1/S2/S11；H 系列为有限负向证据（H08 4/4） | 未形成可阻止新消费者的真实整机屏障，namespace/观察完整性仍需 R2 |
| C2-0 / C2-1A–D 生产式恢复模拟（2026-10-18） | 用户原始两份归档已被独立读取复算 SHA，Guest 22 项中 19 项稳定输出/rc 完全一致，3 项为 UTC、IP、临时 mountinfo 差异；完整来源见 [B2B2 §9](C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md) | 克隆、新 VDI、Ubuntu、合成 HTTP 接管及归档完整性有限 VERIFIED；原始 Host 独立真实性和部分外层 SSH rc 等限制经 [N-07 最终风险裁定](C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md) §9.6 接受，**C2 隔离合成恢复前置项已在限定范围 CLOSED**；真实 AWS/业务恢复不能据此关闭 |
| 正式更新与独立恢复 | AWS 快照/维护冻结合同及部分离线模型已推进；仍缺正式候选的关键可信执行基线、真实持续禁入、代码快照与正式安装/新实例恢复组合 | **C2 已作为可丢弃隔离实验恢复前置项有界 CLOSED（N-07 LIMITED-ACCEPTED）**；C1、C3–C7 仍 OPEN，C8 NOT REQUESTED；真实 AWS S01–S12、安装/维护冻结和生产交付未完成，NO-GO |

上述是源码/已有证据核对，不是重新检查任何生产主机、Guest、快照、凭据或远端对象当前存在。已安装 Runtime 的历史身份仍见[发布与 Runtime 状态](../runbooks/GHCR发布与Runtime状态.md)，不能用 dev SHA 替代 installed source 或 app image SHA。

## 4. 八个最终门禁与证据登记

| 门禁 | 关闭条件 | 当前状态及主要后续 |
| --- | --- | --- |
| C1 来源与可信执行 | 目标原 Archive/发布 proof、正常更新执行器及关键运行环境/依赖可信来源、实际执行位置/权限及必要的完整性核验；遇到未知动态加载、来源或路径替换风险才按 §4.1 专项追踪；当前安装健康与完整性绑定快照 | **OPEN / CANDIDATE PREPARATION STARTED**：见 [C1 最小基线与候选清单](Runtime更新-C1最小可信执行基线对齐与候选准备.md)；最终同正式执行候选收口，不默认全量 Python/ELF/dlopen 消费闭包、第三方见证、旧恢复自举闭包或双 Archive 取回 |
| C2 生产模式可恢复的隔离环境 | 在无生产资产、隔离且独立核实身份的 Guest 上，从**已认证指定 Snapshot 创建独立新实例**，依 [C2-02 N-01–N-07（C2-CHANGE-02）](C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md) 核验 A Snapshot 身份和来源、实际 clone rc、新 VM/VDI、选定 Guest 稳定基线及明确的运行时差异、合成服务、离机归档与独立审阅；**不要求原机 restore / Marker A/B / 新快照** | **CLOSED — ISOLATED SYNTHETIC RECOVERY ONLY / N-07 LIMITED-ACCEPTED（2026-10-18）**：两份已独立核对的归档 SHA/内部清单、22 项 Guest 比对（19 同值/3 预期差异）、准确 Snapshot `showvminfo` rc=0、独立 VM/base VDI `showmediuminfo` rc=0、Host-only 合成 HTTP 接管/停止共同证明该可丢弃隔离实验环境的指定恢复流程。**N-07 风险接受仅适用于这些准确合成资产**：原始 Mac Host 无独立签认、历史 SSH 外层 rc 缺失、本轮 Host 输出未另作离机封存，按 [B2B2 §9.6](C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md) 如实保留，不补造值。不能据此认证真实 AWS 平台、新代码可信来源、持续维护冻结、数据库/Uploads/供应商恢复或授权 Guest/root 操作；C1/C3–C8 仍独立，C5-G2 NO-GO |
| C3 应用与存储一致性 | 本次 current/previous/env/running image、17+Manifest、C4、project/DB/Uploads 及外部安装副本相容，无 pending/未明事故 | OPEN：R3/R4，生产前另做当前主机核对 |
| C4 维护排他与禁入 | 原策略离机记录→准确容器 no/正常停止→所有启动/写入入口持续禁入；跨 reboot/快照首启仍冻结，namespace/持有者覆盖完整，成功精确恢复 | OPEN：R2；按 MAINT-RESTART-01，不修改 Manifest Compose |
| C5 本次 AWS 恢复点 | 代码创建准确手动快照、等待 available、来源/盘/txid/离机清单验证、保留和真实同平台恢复可用；每日备份健康/escrow 保持 | OPEN：R3；旧 crypt/Drive mandatory Kit 适配退出本次关键路径，没有标 PASS |
| C6 正式安装与替代恢复 | 正常 root-private/FD-safe/持久化交接；失败 ABORT 保持冻结，经确认准确快照创建独立 AWS 实例、隔离验证与受控切流；不续 journal | OPEN：R4；普通同 SHA upgrade 仍拒绝，云恢复可返回原已知版本，不要求受损机 fresh reinstall |
| C7 同候选端到端矩阵 | 同一最终候选/平台完成正常更新、拒绝、中断、外部恢复、重复中断、原状态恢复及独立核对 | OPEN：R5，不能拼接不同版本局部 PASS |
| C8 精确生产交付 | C1–C7 后，准确主机/版本/快照/窗口/操作者/原策略和停止条件获 G2-E 许可；执行后 G2-F 独立复验 | NOT REQUESTED / NO-GO：本批仅文档，无生产/AWS 操作 |

### 4.1 最小必要取证与风险分级（2026-10-22）

**只记录会影响 Runtime 安全、稳定、可恢复和维护决策的事实。** 不再默认逐条留存所有 stdout/stderr、全量进程/FD/namespace、反复校验同一稳定依赖、第三方签署及多跳归档。每次操作应可追溯到准确对象/版本、授权范围、关键检查、实际结果和失败原因；与当前候选/环境仍匹配的 CI、可信平台或内部技术验收结果直接复用。

| 环节 | 必要证据 | 只有异常或专项风险时增加 |
| --- | --- | --- |
| 非 root、离线/可丢弃 VM 实验 | 准确 VM/VDI/SSH 身份和隔离状态、实验源码/关键输入 hash、操作结果与真实退出状态 | 目标异常、源码差异、测试失败时保留必要原始错误和 trace；不要求外部见证人 |
| R1/C1 可信执行 | 目标 17+Manifest 与发布证明、真实执行器/解释器及关键依赖的可信来源、执行位置与权限 | 未知可执行依赖、可疑动态导入或路径替换才定向做 FD/ELF/进程跟踪；不强制穷举每个系统库的每次消费 |
| R2/C4 维护冻结 | 原容器/任务策略、批准的业务及后台写入入口实际禁入、跨重启持续冻结结果 | 遇未知写入者/新消费者才深入查询对应 FD/namespace；单次空扫描不是停写证明 |
| R3/C5 AWS 快照 | 账户/Region/源实例/覆盖盘、本次快照 ARN/状态/txid、故障 VM 外恢复清单与一次可复用的真实隔离恢复验收 | API 未知状态或恢复失败时保存相关请求 ID/响应；不虚构整盘 hash |
| R4/C6、R5/C7 安装/验收 | 同一候选版本和完整性、安装状态转换、权限、应用/DB/Uploads 一致性、关键成功/拒绝/中断/恢复场景 | 故障、差异、事故时保存相关原始错误/上下文；不重做无关合成试验 |
| C8/G2 生产授权/放行 | SanQ 明确授权的对象/版本/窗口、备份/快照就绪、停写、安装后关键健康与资金/订单必要对账、恢复原策略和最终业务放行状态 | 任一结果未知必须停在维护并保留必要诊断，**不需要第三方签名或见证** |

**独立核对是技术性质，不是第三方身份要求：**可由 SanQ 内部从 GitHub 发布/CI、官方签名、AWS API、受控 VM/SSH 配置和实际原始状态对照被审核程序的自报。只凭 `authorized=true` 或同一程序自报成功不能授权生产。过去缺少第三方见证所导致的 LIMITED 记录不倒改，但不得据此要求未来重复第三方签署；已存在的 fail-closed `BLOCKED` 代码需要另行审阅和批准才能修改。

## 5. R0–R5 执行队列与依赖

| 批次 | 固定工作包 | 当前进度与依赖 |
| --- | --- | --- |
| R0 | D1–D5、两项批准修订、C1–C8、矩阵及文档收口 | 本次文档审阅通过且远端交付已授权；不重复请求两项设计批准 |
| R1 | 正式执行器最小可信基线、关键来源/平台及条件触发的专项风险取证（按 §4.1） | **IN PROGRESS / C1 OPEN**：R1-A 准确 Noble 七包技术原件、R1-B S5 三 FD/27 项 manifest 的 PASS_SCOPED 可按原对象复用；R1C-1 核心/启动材料已由 PR #2888 / CI #7417 合并，但无真实 bootstrap/完整接线。已启动 [C1 最小基线与候选准备](Runtime更新-C1最小可信执行基线对齐与候选准备.md)，登记实际平台、关键依赖/输入、外置 Guard/CAS、发布物/权限和必要同候选验证缺口。旧 B4B/S6/见证记录留作历史与专项材料，不再据此要求默认全量闭包或重开 C0；最终 C1 随正式执行候选验收 |
| R2 | MAINT-RESTART-01：原策略/任务持久化、no/正常停止、跨重启维护与禁入、精确恢复 | **IN PROGRESS / R2-C4 OPEN**：真实生产清单有限核验、Fence/Boot Guard/Unit 安装清单/认证 Wire 离线合同已推进；Mac SQLite 进程级 PASS_SCOPED；C3C3-READ 只读现场能力已部分核对，实际 mTLS/服务和 Guard 联动待证，以该工作包最新续记为准。真实 Guard、持续写入禁入、P0-01/S03/G06/S09 均未完成；仅源码/候选准备可与 R1 并行，主机/服务/云操作仍须精确授权 |
| R3 | RUNTIME-SNAPSHOT-01：受限 API 创建/等待/验证本次手动快照，离机轻量恢复清单、未知结果处理与保留 | PLANNED；准确 AWS 账户/Region/权限/盘先审，快照前必须 R2 持续冻结 |
| R4 | 正式 Runtime installer + 准确快照→独立新 AWS 实例，首启冻结/数据/身份核对、单写者与人工切流 | PLANNED；组合正常执行来源、R2/R3；不部署旧故障主机自举链，不隐藏改外部 helper |
| R5 | 同最终候选完整端到端、故障和恢复矩阵；再提交精确 C8 readiness/执行/复验 | PLANNED；前四批真实证据成立后进行；不自动取得生产授权 |

**2026-10-18 R1 S1 独立 Ubuntu Archive 真实签名采集 CLI（本地待审）：**继 S0 文档 PR #2872/CI #7375 success 合并 `dev@001d7c345bff43f8c29391fdf9da45286c57fb81` 后，在 Runtime/Ops 外置命令入口增加**仅供独立审阅机未来经精确执行授权使用**的官方 `Release/Release.gpg` 原始 HTTPS 收集、固定本地 Archive keyring SHA、gpgv 实签验证与不可越权 receipt，附 22 个纯 mock 负例和 S1 [审批合同](C5-G2-R1-S1-独立Ubuntu签名验真采集程序.md)。无实际 Archive key、真实 GPG 结果、Guest/root/VM/生产接触；输出永久 BLOCKED，C1 OPEN / G2 NO-GO / S2 PAUSED，R2–R5 不变。本地未运行 tests/CI、未推送，等待审阅。

**2026-10-18 R1 S0 实际 Host 身份转贴审阅：**用户按批准五条 VBoxManage 命令回传 Mac Terminal 输出；指定 C2 VM/Snapshot/VDI、Host-only 网络配置与盘链在操作员所见范围内匹配，Source 快照原双向剪贴板及当前差分盘差异均如实留存。**S0 = IDENTITY MATCHED (OPERATOR-OBSERVED) / EVIDENCE LIMITED，非完整 VERIFIED**；缺每条真实 rc、独立原件/witness/UTC 和 Guest 内隔离证明，不改变原 C2 已限定 CLOSED 及 G2 C1 OPEN；S1 真实官方签名未验、G2 NO-GO/S2 PAUSED。见 [审批包 §9](C5-G2-R1-B21-真实Ubuntu来源与GuestRoot取证审批包.md)。

**2026-10-18 R1 B2-1 真实来源/取证审批准备（本地文档；其后 S0/S1 获授权但环境阻塞）：**B2-1D 已经 PR #2871/CI #7373 success 合并 `dev@e5f2e64376251f9f03edb1ebf337f74fab820d90`，仍只是候选一致性合同。本批从最新 dev 只形成 [真实 Ubuntu Archive 签名、指定 Mac/Guest 只读回执与未来 root-held FD 的分阶段审批包](C5-G2-R1-B21-真实Ubuntu来源与GuestRoot取证审批包.md)，不下载发行对象、不验签、不执行 Host/Guest/root，也不开放 Runtime 安装。根 collector 尚无固定源码、hash 和准确命令；需要另审后才能单独授权。C2 有界 CLOSED，C1 OPEN、G2 NO-GO、S2 PAUSED，R2–R5 与 AWS 门禁不变。

**2026-10-18 R1 B2-1D 跨包 Manifest 归属审阅（首次本地状态，现 PR/CI 已合并）：**B2-1C 已由 PR #2870 / CI #7371 成功合并 dev `3c623b88`。本批外置、纯内存组合 B3A Manifest 的 file SHA 与多个 B2-1C 声明式包内成员 SHA/link text，拒绝缺失、重复或孤儿候选映射；详见 [B2-1D](C5-G2-R1-B2B2-B21D-跨包文件归属候选审阅.md)。无独立真实性、GPG、真实 Mac/Guest/root/FD、安装或 AWS 取证；正常输出永久 BLOCKED。本地 tests 未运行，C2 有界 CLOSED/C1 OPEN/G2 NO-GO/S2 PAUSED，R2–R5 不变。

**2026-10-18 R1 B2-1C 下一离线源码批（当时本地待审，现已 CI 合并）：**B2-1B 已通过 PR #2869/CI #7369 合并 dev e823bb16。本批在既有 Runtime/Ops owner 内增加 .deb ar/data.tar 有界纯内存成员 SHA 与 symlink link text 候选对照，不解包到磁盘、不验证官方 GPG、不操作 Guest/root/安装；详见 [B2-1C 合同](C5-G2-R1-B2B2-B21C-deb包内文件与链接候选合同.md)。候选结果 BLOCKED，测试仅编写未运行，保持 C2 有界 CLOSED/C1 OPEN/G2 NO-GO/S2 PAUSED。

**2026-10-18 R1 B2-1B 后续源码切片（本地、未执行）：**继 B2-1A PR #2868 / CI #7367 全绿、dev merge `5711aa12` 后，外置新增纯内存 Ubuntu Release → Packages[.xz] → 准确 .deb 的候选 SHA256/size/身份一致性校验与合成负例，详见 [B2-1B 原始字节合同](C5-G2-R1-B2B2-B21B-Ubuntu原始字节链合同.md)。未真实下载 Ubuntu 发行原件、不验证官方 GPG、不解包 .deb 成员、不执行 Guest/root/安装，无生产权威；B2-1B tests/CI 尚未执行。C1 OPEN、G2 NO-GO，C2 有界 CLOSED，R2–R5 不变。

**2026-10-18 R1 B2-1A 分批续记：**在 B2-0 PR #2867/CI #7365 合并 `dev@b95f09e1` 后，本地新增固定 C2 Host/Guest 精确只读 argv 的原始 stdout/stderr/rc/摘要离线审阅及纯合成负例，详见 [B2-1A 审批包](C5-G2-R1-B2B2-B21A-原始只读取证审批包.md)。未运行本地 tests/CI、真实 Host/Guest/root、软件包签名验证或安装。当前只是本地源码审阅；B2-1B 的实际 Guest/root 操作与 C1 认证仍待准确对象/命令/来源另批批准。C2 有界 CLOSED、C1 OPEN、G2 NO-GO。

**2026-10-18 R1 B2B2-B2 源码批续记（本地、未执行）：**在 C2 有界 CLOSED 后，B2-0 纯内存 Guest packet / 独立离机候选一致性审核及合成负例已编写，B2-1 外部 Ubuntu 包/Host/Guest 只读取证方案已成文，见 [B2-0/B2-1 合同](C5-G2-R1-B2B2-B2-取证合同与离机审核.md)。未执行本地测试/CI、真实 Guest/root、平台/发行来源验证或动态依赖消费；未推送 PR。**不得将结构一致升级为 C1 PASS；C1 仍 OPEN、C5-G2 NO-GO。** 本地源码不改变 R2–R5、AWS S01–S12 和 C2 有界关闭口径。

S2 新 daily 扩充/接线/sudoers 后置不变；现役日常备份和独立 DR/凭据可用性仍是更新前置。下一批先做真实生产清单、协调器/生产执行器接口、最小 IAM、原策略持久化与恢复清单评审，再按 R1–R5 实现和同平台验收。不继续套用旧 R3 crypt/Drive、旧 R4 clean reinstall 工作单。

实际账户/Region/实例和盘、OS/Python/loader、Operator/pin、旧安装/目标 main SHA、现场 app/state、容器/units/入口/namespace、准确快照/操作 ID、外部事件保留与管理通道目前仍待采集，不编造值。

## 6. 单次操作顺序与保留

完整状态合同见 [AWS 快照方案 §4–5](Runtime更新-AWS快照与维护冻结方案.md)：PREFLIGHT → MAINTENANCE → FROZEN（先记录原策略，再 no/正常停服/一致数据）→ SNAPSHOT_PENDING → SNAPSHOT_READY → UPDATING → VERIFYING → RELEASED。任一活跃写不明/验收失败进入 INCIDENT，维护继续；严禁 finally 无条件恢复写入。

目标发布来源、17+Manifest、正常候选/preimage/原子交接与持久化校验继续；不改 Compose 原字节实现 no。只有控制面准确快照 available、覆盖数据一致和离机清单均成立才进入活跃安装。API 超时先查准确对象，不盲重试、覆盖或选 latest。

保留准确手动快照、原策略与挂载清单、已安装/目标/应用版本、授权/操作 ID/独立验证及原始证据，故障 VM 外必须可取得。每日加密备份、凭据 escrow 继续；本次不新建强制 `gdrive_secure:runtime-recovery/<txid>` Kit，不自动 prune 旧集合、事故/快照或原始证据。GitHub Artifact 90 天与 daily config 30 天不能充当本次快照保留策略。

快照后持续停写至最后放行；外部在途付款/订单仍需事件保存、幂等回放与权威对账，UNKNOWN 不等于失败。失败后准确快照创建替代实例，首启仍维护，旧机防双写；验证来源/数据/身份/入口及外部状态后人工确认恢复策略与切流。已重新营业或发生不明写入，不能直接覆盖新订单，转独立 DR/向前修复。

## 7. 首版固定验收矩阵

下面 18 组是关闭要求，**均不是本批执行结果**。D5 已批准，旧三检查点冷取证退出首版默认范围；不删除原实验或将 NOT EXECUTED 改为 PASS。

| ID | 场景 | 必须观察的结果 / 主要门禁 |
| --- | --- | --- |
| A01 | Guest 身份/隔离/平台不符，恢复基线不可用 | root 实验前停止；C2 不关闭 |
| A02 | 正确来源与真实执行材料 | 准确发布 proof、同候选执行器/解释器/关键依赖和输入的来源、实际位置/权限及必要完整性独立核对一致；未知或替换风险按 §4.1 定向取证；C1 |
| A03 | 错源码/解释器/依赖、路径替换、未知 import/动态库 | 在相关材料被执行前拒绝；不得只靠退出后告警；C1 |
| A04 | 错 main SHA、配对镜像/Archive、seal/run，伪造/重打包 | 无活跃写；历史指定版本不改选 latest；C1/C5 |
| A05 | pending、env/state/running image 不一致、错误 volume/bind/外部 helper | 无活跃写；不自动 normalize 或 repair；C3 |
| A06 | 已有备份服务/后代、deploy/Compose/MCP/SSH cwd/fd/mmap/别名引用 | 检测并等待经授权处置；无法确定就 BLOCKED；C4 |
| A07 | 持有者改名、PID churn、不可读/漏项/预算耗尽、bind/namespace | 不把零已知持有者当全覆盖；unsupported namespace 必须拒绝；C4 |
| A08 | 屏障建立后新消费者尝试进入 | 在批准威胁模型内确实阻止；仅观察到“进来了所以拒绝”不算正向屏障通过；C4 |
| A09 | 快照名/事务碰撞、并发、API 超时/不明成功 | 先查准确操作/对象，不覆盖/删旧对象或猜 latest；无合格快照无 Runtime 活跃写；C5 |
| A10 | 错源/Region/盘、失败/未 available/旧快照，离机清单不可用 | 拒绝安装；不虚构整盘 hash/恢复资格；C5 |
| A11 | 故障 VM 完全不可用，仅云控制面与离机清单可取 | 能准确定位已验证恢复点和保留资料，在真实 AWS 隔离环境完成替代恢复；无需故障机下载双 Archive/自举；C5 |
| A12 | 完整正常更新 | 同一候选真实操作，全量文件/动态 bytes/owner/mode/app/storage/健康前后对照；无隐藏 rollout；C3–C7 |
| A13 | prepare/策略/停服/快照阶段失败，原 enabled-active 或 disabled-inactive | 无 Runtime 活跃写，错误和原状态留证；仅满足安全取消条件才受控退出，不自动启一切；C4–C7 |
| A14 | 准备持久化、交接前后、保留旧树、收尾前等活跃窗口中断 | ABORT、留证、禁止旧事务重入和 journal replay；按本节 I1–I6 冻结检查点执行，并覆盖下述 S 场景映射；C6/C7 |
| A15 | 活跃树/主机不可用，完整云恢复 | 人工确认准确 AWS 快照→独立实例，首启 no/维护，数据/版本/身份/单写者/外部事件核对后切流；C5–C7 |
| A16 | 普通同 SHA upgrade、快照返回已知原版、旧 journal/candidate | 普通升级仍拒绝；独立云恢复允许原已知版本，不 replay 旧 journal、不覆盖旧事故对象；C6 |
| A17 | 恢复创建/核对/切流再次中断 | 新事故、准确新操作/授权；保持维护与单写者，旧恢复点/实例/证据保留；C6/C7 |
| A18 | 成功退出或恢复策略/任务失败；快照后意外写入/业务放行后故障 | 成功按原策略恢复且最后放行；失败冻结、不一律 enable/start；写入/外部未知转独立 DR/向前修复，不直接数据回退；C4/C8 |


**A14 活跃窗口检查点一次冻结为 I1–I6：**I1 候选/preimage 写入与 fsync 完成前；I2 准备持久化完成后、交接前；I3 交接调用前后（须观察结果或不明状态停止）；I4 新树已活跃、父目录持久化完成前；I5 持久化后、独立全量复验/事故收尾前；I6 快照替代实例的创建/隔离验证/受控切流中再次中断。具体 runner 可在这些边界内注入，不能把边界改成单一 prepare 阶段即宣称覆盖。实际交接必须按目标文件系统证明其支持的原子语义，不将 Python mock 或退出后检查代替。

原 S 场景映射：S1/S2 → A13/A18；S3–S7 → A06；S8/S9 → A07；S10 → A08；S11 → A13/A18；S12 的事务中断/禁止 replay 部分 → A14–A17，物理/虚拟掉电持久性部分按 D5 单独标 NOT VERIFIED。既有 S1/S2/S11 局部执行事实保留，不能冒充 R5 同候选整矩阵通过。

## 8. 交付与退出登记

本批两项设计变更已按用户批准写入；旧 R0/PR 交付和实验保留历史身份。本批文档已经用户审阅并明确授权远端交付；按本批 PR 最终 head 的 GitHub Checks 与合并事件登记结果，不提前宣称 CI 通过。未运行本地项目测试、Guest/root 或生产命令，没有创建快照/变更 IAM/重启策略，也无 schema/migration 变更。具体差异与交付记录在同批 worklog 更新，不沿用旧批授权。


后续按修订后的 R1–R5 补齐有限缺口，同一真实 AWS 演练可复用 C2 与快照恢复证据，不能为旧默认路线重复实测。G2 A–F 的精确 Guest/生产许可和安装后独立复验仍有效；此处不再次请求 D1–D5 决策批准，也不因 R0 完成自动开始任何生产操作。

## 9. 2026-10-19 — Runtime R1 最终剩余项审计与后续执行门禁（状态续记）

> **现行适用说明（2026-10-24）：**本节保留 10 月 19 日的证据与队列快照，其“尚缺包来源/root FD/独立见证”“完整动态消费闭包”和 R2 PLANNED 不是当前剩余清单。后续 R1-A/S5/R1C-1/R2 进度依本文最新续记；验收范围按 D1/§4.1 和 [C1 最小可信执行基线对齐与候选准备](Runtime更新-C1最小可信执行基线对齐与候选准备.md)。第三方见证已取消、全量消费追踪仅在风险触发时定向采用，现有代码 guard 不自动放行。

最新核查基线 GitHub `dev@58e317b79024a027644be7ec55e5eb7b9ad71143`。S1-R1 Runner [PR #2876](https://github.com/sanqin888/sanqinMVP/pull/2876) merge `c2e33af27bb15ad5ba209dd3831a2aae5a462d4a`，[Actions run 39285377503](https://github.com/sanqin888/sanqinMVP/actions/runs/39285377503) success。MacBook/Debian 公钥、见证审批及 Google Drive 归档读回为操作员独立保存/回传材料，准确原件和限制见 [S1 §8](C5-G2-R1-S1-独立Ubuntu签名验真采集程序.md)，不能把 GitHub CI 或操作员自报值单独当作完整 C1 独立消费证据。

| 门禁/任务 | 最新裁定 | 不能据此推论 |
| --- | --- | --- |
| S1-W1 可信 keyring + 见证审批 | LIMITED APPROVED；准确 SHA-256 `80a36b0a6de2f69f49d2df75ef473ccde121e9e190b9ea01d20a4f63778d5c31` | 目标 Guest 的具体 Python/loader/deb 已获来源认证 |
| S1-R1 GitHub Runner（**非 Runtime 总 R1**） | `noble` Archive Release 真实签名原件 LIMITED VERIFIED；原 decision=BLOCKED 保留 | 其他 pocket、Packages/deb、生产安装或执行材料已认证 |
| S1-D1 加密归档 | OPERATOR-REPORTED VERIFIED；对象 ID `1cOiq-V7wjef-F5kOivVsD5uC1Ct5QA-y`、读回包 SHA-256 `0f0683a2a9ae2c68c572d28864d66c6e9646cd7da9d287c9423e1574fd282600` | WORM、原子 create-only、U 盘副本已复核 |
| **Runtime R1 / C1** | **OPEN**，尚缺包级来源、真实 root-held FD、动态执行消费与独立见证 | S1-R1/D1 成功即可关闭整个 R1 |
| R2 / C4 | PLANNED / NOT EXECUTED，MAINT-RESTART-01 | 已允许真实生产冻结、快照或跳过 R1 |

**R1 剩余最小顺序：**R1-A（R1-S2：经签名 Release → Packages → 准确 deb/member 外部 pins，并补必要 S0/S3 Host/Guest 身份与原始 rc）；R1-B（S4 真正 root collector 与准确执行材料审阅，S5 隔离 Guest 可信根锚和 FD 实测）；R1-C（S6 / B4B-3C 正式正常更新执行器 CPython/ELF/dlopen 实际消费闭包 + C1 独立验收）。现有 B4B-3A/3B 合成声明、FD 观察、有限别名解析及 B2-1B/C/D 原件对照模块可复用，不为旧故障机自举 clean reinstall 的退役路线重新构建恢复闭包。

**R1 → R2** 是 R0 的总实施顺序；R2 的只读生产清单/接口 readiness 审计可以并行准备，不能据此将维护禁入或服务策略操作视为已实现、已实测或已获生产授权。D1–D5 冻结决策、17 成员、Docker/Compose、现役备份、权限与 G2 A–F 不变。R2–R5 继续按各自审批门禁执行；C2 仅隔离合成 CLOSED / N-07 LIMITED-ACCEPTED；C5-G2 NO-GO，S2 daily 扩充 PAUSED。本批文档尚未 push/PR，也未执行本地 lint/build/test、Guest/root、AWS 或生产操作。
