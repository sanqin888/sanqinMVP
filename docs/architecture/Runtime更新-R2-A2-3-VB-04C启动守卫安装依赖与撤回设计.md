# R2-A2-3 — VB-04C Boot Guard 安装边界、启动依赖与事故撤回设计

> **2026-10-24（America/Toronto）｜DESIGN ONLY / LOCAL REVIEW / INSTALL NOT AUTHORIZED / P0-01 NOT_RUN / PRODUCTION NO-GO**。基线 `dev@427a7195d54d90f4ebb0306143639b1f7f02484b`（PR #2925、CI #7499）。依据操作者本对话 VB-04A/B 只读回执，**不代表 MCP 登录 Mac/Guest**。此文件不含可直接部署的 Unit、安装器或执行授权。

## 1. 依据、所有权与不可改变的安全承诺

- 已核对根 `AGENTS.md`、`.github/workflows/ci.yml`（`ci-change-scope`、`ops-checks`/Runtime unittest）、[R0](Runtime更新-R0冻结设计.md)、[R2-A2-2](Runtime更新-R2-A2-2禁入适配器与安装权限撤回设计.md)、[R2-A2-3](Runtime更新-R2-A2-3隔离启动屏障PoC就绪与持久化前置审计.md)、[VB-READ-001](Runtime更新-R2-A2-3-VB-READ-001环境核验与下一步审批.md)、[P2-C3B 实测](Runtime更新-R2-A2-3-P2-C3B-001Mac进程持久化实测复核.md) 与当前 `maintenance_boot_guard{,_contract}.py`、`maintenance_off_host_cas_{contract,sqlite}.py`、A2-1 合同。
- Owner 是 Runtime / Data / CI / Ops；不更改 NestJS、Prisma、17 文件发布 Bundle、GHCR/Image、生产 Docker/VM/AWS/备份、支付/订单。
- 沿用用户已批准设计 `SAFE_STOP_DOCKER_ON_UNCERTAIN_RESTART`：已可信登记、部分冻结/ARMING/FENCED/INCIDENT/不明时如 Docker daemon 或 VM 重启，**在 daemon 自动恢复前阻断整个 daemon**；事故时合成 Clover/PRESERVE 暂停可接受，独立 SSH/Host Console 必须可救援。
- P1 `evaluate_boot_candidate` 即便返回 `ALLOW_CANDIDATE`，实际 verdict `decision=DENY / authorized_to_start_docker=False`；绝不能与 systemd 执行放行直接接线。P2-C3A 回执为 `UNAUTHENTICATED_OFFLINE_LAB_ONLY`，不是经过身份认证的 `OFF_HOST`。实现正向放行是**新架构/信任边界**，必须另行解释、测试与明确授权。

## 2. VB-04A/B 真实只读回执（操作者来源）

| 对象 | 现场证据 | 判定 |
| --- | --- | --- |
| Host | Recovery Clone `SanQ-Runtime-Lab-Recovery-01` running，原 `SanQ-Runtime-Lab-Jammy-01` poweroff；Clone NIC1 `hostonlynetwork`、NIC2–8 `none` | 精确对象/隔离配置 `PASS_SCOPED`；准确 VM/VDI UUID 原件私有保留 |
| Host-only / Guest | `HostNetwork 192.168.56.0/24`，Guest `enp0s3=192.168.56.5/24`、未看到 IPv4 默认路由、UID1000、hostname `sanq-runtime-lab` | `PASS_SCOPED`；IPv6、Mac 转发、SSH 会话新鲜 pin 非本次独立复核 |
| Guest OS | Kernel `5.15.0-119-generic`、systemd `249 (249.11-0ubuntu3.12)`；此前 Docker CE `29.2.1`/containerd `2.2.1`/Compose `v5.0.2`/runc `1.3.4` | 不能宣称与生产实际 unit/daemon **same-version full pass** |
| `docker.service` | `/lib/systemd/system/docker.service`，`ExecStart=/usr/bin/dockerd -H fd:// --containerd=/run/containerd/containerd.sock`；`Requires=docker.socket`、`Wants=containerd.service`、`TriggeredBy=docker.socket`；无 Drop-in | Socket activation 是**明确存在**的启动入口 |
| `docker.socket` | `/lib/systemd/system/docker.socket`、`Listen=/run/docker.sock (Stream)`、`Triggers=docker.service`；无 Drop-in | socket 活跃时可激活 daemon；目前只是禁用状态 |
| `containerd.service` | `/lib/systemd/system/containerd.service`、`ExecStartPre=/sbin/modprobe overlay`（忽略错误）、`ExecStart=/usr/bin/containerd`；无 Drop-in | 需测试 daemon-only 崩溃及 shim/writer 的持续存在 |
| 进程/配置 | 三 Unit `loaded/inactive/disabled`；未看到 dockerd/containerd/shim/runc 进程；`/etc/docker/daemon.json` 缺失 | **静态候选**，不是 Guard 通过、实际 live-restore=false 验证或 P0-01 成功 |
| G06 | 先前正常状态下 Mac→Guest SSH/Console 有有限观察 | **OPEN**：事故与 daemon 阻断状态未验证 |

特别注意：生产历史 `docker.socket` 是 active；此隔离 Guest 当前 disabled。不能用“静态 disabled”代替有 socket activation 的 P0-01 负例。

## 3. 设计目标：独立三层而不是一个 ExecStartPre

### Layer 0 — 安装登记、状态与 off-host authority

候选落点（**不是创建指令**）：

| 候选 | 职责与最低权限意图 |
| --- | --- |
| `/usr/local/libexec/sanq-maintenance/` | 固定 SHA / 来源核验的 root-owned verifier 二进制或受限解释器入口；禁止可写 PATH/未锁定 import |
| `/etc/sanq-maintenance/` | root-held 安装锚点、已签可信安装标识、独立认证信任根与配置；绝不存原文客户端私钥于 repo |
| `/var/lib/sanq-maintenance/` | 本机 anchor 绑定的 epoch/head、原 restart policies、writer registry、txid、本机 durable receipts；atomic rename + 文件及父目录 fsync、root 权限、拒绝 symlink/hardlink |
| `/run/sanq-maintenance/` | 非权威临时互斥/运行期诊断，不得存唯一真相 |

**预登记外部身份优先于本机自报**。已登记 Guest 的锚点/状态缺失、损坏或 epoch 回退不能降级为 `LEGACY_NOT_ENROLLED`。真实 mTLS 或等价强认证必须将客户端证书、安装实例、Host ID、CAS nonce、请求摘要及不可变事务绑定；离机失联/提交结果不明时仅只读对账，**默认 DENY**。Mac 本机 SQLite/Host-only 同物理主机，只能构成实验室权威模拟，不提供跨物理灾难独立性或抗同机管理员整体回滚。

### Layer 1 — 真实 systemd 启动入口

下列为**候选职责**，绝不在设计批固定未经验证的 unit 指令：

1. **真正的 service pre-exec fail-closed**：在 `docker.service` 原 `ExecStart` 之前进行非忽略失败的可信 Guard 检查，候选 `ExecStartPre`；在 systemd 249 上核验逐行组合/加载优先级/覆盖、超时与 restart，必须由真正 **DENY/ALLOW 的新受信适配器**输出，不把 P1 `ALLOW_CANDIDATE` 接上去。
2. **不能用 `ExecCondition` 的非零状态暗示错误/事故已强制阻断**：systemd 官方手册指出其部分非零码导致跳过、unit 不标记 failed。`ConditionPathExists` 也不能将“文件存在”变成可信状态；不基于一次条件成功就自动放行。
3. **守住 `docker.socket`**：它监听 `/run/docker.sock` 并触发 docker.service。仅 service 前置检查不能证明 socket 本身不监听/不排队；需联合阻止 socket 未授权激活、服务被请求重新启动、直接 API 访问。systemd socket unit 也支持在创建/绑定监听 socket **之前**运行 `[Socket] ExecStartPre=`（上游 [systemd.socket 手册](https://www.freedesktop.org/software/systemd/man/248/systemd.socket.html)），故建议在**候选** `/etc/systemd/system/docker.socket.d/50-sanq-boot-guard.conf` 研究 fail-closed 的 socket pre-bind hook，与 `/etc/systemd/system/docker.service.d/50-sanq-boot-guard.conf` 的 service pre-exec hook **分别检查**；不能仅依赖对方，也不能将这些候选路径当作安装许可。之后仍须研究 socket stop/持久抑制与事故期间拒绝手动重新激活，在 Guest 验证 `docker.service Requires=docker.socket` 的互依赖和 systemd 循环，再决定是否采用可恢复的 mask。不能把 `UnitFileState=disabled` 误当不可手动激活，也不能假定一次 `oneshot+RemainAfterExit` PASS 在状态转到 ARMING 后仍有效。
4. **动态 ARMING 竞态**：如果 daemon 正在运行，`ExecStartPre` 不会重新执行。进入 ARMING 之前须已持续阻止新的 Engine/业务写者准入、证实旧 writer 已排空或仍受保护，再以同一持久 epoch/owner/txid 的操作推进；**不能“CAS 已提交 ARMING，然后慢慢 stop socket”视为原子无竞态**。一旦不能保证此时序，不允许修改任何一个 restart policy。
5. **containerd 与 live-restore**：service 被拒绝启动不代表 shim/已有容器必停。真实 daemon-only crash 在 `live-restore=true/false` 两种场景均须独立记录 PID/FD/资源实际写入；即便默认未开启，也不能拿 `daemon.json` 缺失做全系统写者证明。

依赖语义外部交叉核查：[systemd.service 250](https://www.freedesktop.org/software/systemd/man/250/systemd.service.html)、[systemd.unit 250](https://www.freedesktop.org/software/systemd/man/250/systemd.unit.html)、[Docker restart policies](https://docs.docker.com/engine/containers/start-containers-automatically/)、[Docker Live Restore](https://docs.docker.com/engine/daemon/live-restore/)。以上是**上游原理**，Guest 实际 systemd 为 249，必须按已安装版本动态验证。

### Layer 2 — 不经 systemd 的绕过、已有写者及副作用

| 绕过入口 | 是否由 service pre-exec 单独覆盖 | 退出要求 |
| --- | --- | --- |
| 手工 `systemctl start docker.socket`、已开 socket 的 API / Compose | 不足 | P0-01E 必须证明 socket/daemon 不能被无授权触发，且没有仍开放的写入请求 |
| `/usr/bin/dockerd` 直接执行、改监听 socket/TCP | **不覆盖** | 限制实际执行主体及相关 root/docker-group 权限；若可绕过，标 `P0-01 FAIL / S03 OPEN`，不可假冒覆盖 |
| containerd/shim、已在运行的容器、现存 volume 写 FD | 不覆盖 | P0-01D、P0-02 必须实际观测写者排空或被强制阻断 |
| `deploy_release.py --execute`、备份 timer/service、直接 `backup-db.sh`/`rclone`/sudo helper | 不覆盖 | 各入口在首次副作用前独立 gate；timer disabled 不能杀已启动的后代 |
| 合成 Clover Dev Tunnel | 正常 PRESERVE | 事故全 daemon deny 时允许其暂时不可用；不得借其故障自动 RELEASE |

**威胁模型**：普通未授权服务/容器/客户端必须被拦；不受限、恶意的宿主 root 可以绕过单机应用层 Guard，属于另行界定的受信运维主体，不谎称纯 systemd 能抗 root。Docker socket/docker group 实际授予的高权限必须先复核。仅扫描当前 `ps` 空列表不构成持续资源禁入。

## 4. 安装/启用候选时序（独立审批的实施包，而非授权）

| 阶段 | 预期动作与证据 | 失败策略 |
| --- | --- | --- |
| T00 准确对象 | 在 Mac 复核只允许 Recovery Clone VM/独立 VDI/Host-only/Guest SSH key；原 Jammy VM 保持 poweroff 与双快照不变，独立 Host Console 可恢复 | 身份不确定 ⇒ 停止；不凭 VM 名称执行 root 命令 |
| T01 冻结安装 Manifest | 审核精确 unit 原文/哈希、源 SHA、Python/动态依赖、root owner/mode、备份的 enabled/active、Socket/daemon 依赖图与失败回滚 | 任一缺项 BLOCKED；不得改 vendor `/lib/systemd/system` 原文件 |
| T02 纯离线/非 root 预检 | 候选 unit 与权限声明静态生成、synthetic 负例、dependency/cycle 检查设计；若有实际 unit 验证须在**批准的可丢弃 Guest** | 未经源码审阅/审批不得升级成 root 安装 |
| T03 root 安装 | **仅经单独批准**在 Recovery Clone 按精确 root-owned 文件列表安装、核对 SHA/mode、fsync、安装锚点、Unit 启用边界 | 部分安装失败不能自动降级 legacy 或重启 Docker |
| T04 可信 CAS | P2-C3C 最小双向认证、独立 enrollment、epoch/head/nonce/回执读回与断联 DENY | LAB_ONLY receipt 或 off-host 不明 ⇒ 不放行 |
| T05 正常正例 | `INSTALLED_INACTIVE` 经受信能力确认后，单独批准 Docker/socket/systemd 正常启动 + 原策略对照 | 不应因实验安装把原 disabled 直接变 enabled |
| T06 故障负例 | 可验证 admission 已关闭/真实 Guard 有效，才依单独批准进行合成 API 单个 restart=no 与 P0-01A–F 故障/救援实验 | 任一 daemon 或已有 writer 绕过 ⇒ FAIL；保留原始现场 |

### 关键排序约束

`trusted installation → verified independent custody → proven boot guard → close new admission → durable ARMING → drain old writers → first restart=no → controlled stop → FENCED`。

**在 ARMING 原子落盘后才关闭新 admission 的方案是错误候选**；应先证持续禁入，或采用已验证可整体拒绝写者的原子切换设计。不同执行器之间必须共用 owner/txid/epoch 的可信状态，不把 `systemd` 一次性 PASS 和后续状态更新之间的竞争当作已解决。

## 5. 事故撤回和 G06 独立救援

区分下列三种互不等价的撤回门禁：

1. **尚未完成受信 enrollment、从未 ARM / 无任何副作用**：先核实“确实未登记”，再按原 Unit SHA/Drop-in/owner/mode/enabled/active 精确复原并保留实验失败记录；不能把“本地文件缺失”认定没有 enrollment。
2. **已登记或 ARMING/FENCED/INCIDENT/OFF_HOST_UNREACHABLE、状态损坏或未知 epoch**：保留 root 状态、外部 CAS 头/历史、Host/Guest 原件；禁止自动 uninstall、unmask、enable/start、删除目录、覆盖原单个事故点、删快照或 `finally` 无条件恢复服务。通过 Docker 外 SSH / VM Console 读取拒绝原因，不需要 Docker API 才能诊断。
3. **获得准确恢复/撤回独立授权后**：保全独立故障复本；核对真实来源/epoch、CAS 最后提交与新恢复实例身份，防止原 Guest/Clone 双写；执行签署的恢复/证书撤销/enrollment tombstone 或等效拒绝旧身份方案；逐个复原原状态并实测，不一律 enable/start，事故恢复失败则继续冻结。

G06 实际通过应证明：当 dockerd/docker.socket 无法启动时，依旧可以在无需 Docker、Cloudflared 和 Mac CAS 服务的条件下使用可信 Host Console 与指定 SSH/只读诊断；若 SSH/Console 途径不可用，立即停止后续故障注入，不以“禁入成功”冒充“可安全救援”。

## 6. 方案选择、下一执行切片与证据矩阵

| 方案 | 主要优点 | 排除/限制 |
| --- | --- | --- |
| A. 仅 docker.service 加 ExecStartPre | 改动小、可演示 service 拒绝 | 不防 socket 已监听、direct dockerd、已活写者 ⇒ **不能过 S03** |
| **B. 受信状态 + service/socket 双入口 + admission/Writer Fence（推荐隔离测试路线）** | 覆盖已观测 `-H fd://` / socket 路径和首项 daemon restart 故障 | 需另外批准 root 文件/Unit、真实 CAS 认证、资源保护和 VM 故障执行；目前仅设计 |
| C. AuthZ/代理或 Compose wrapper | 可保护部分 Engine 请求 | 不覆盖 daemon restart manager、直接 dockerd 或存活写者 ⇒ 非 boot barrier |
| D. 生产所有容器永久 restart=no | 降低自动复活 | 改变正常营业与 D2 合同，不采纳 |

P0-01A 正常可用性、B 仅合成 API 改 no 后 VM 断电、C 各异常持久化点、D daemon-only/live-restore 现有写者、E socket/direct dockerd 绕过、F INCIDENT/SSH 救援，**全部 NOT_RUN**。任何需要等价生产 volume、网络写入口或 backup/worker 的资源级禁入属于 P0-02（另审），不能把 P0-01 机制正例越权升级为整个 C4 完成。

**下一批优先建议：VB-04D1 — 仅离线 Unit 依赖与安装 Manifest 合同/负例测试。** 先在 `ops/runtime` 编写无真实系统执行能力的候选合同、依赖图/cycle/fail-closed 源码检查，保持 P1/A2-1 DENY 与 17 Bundle 不变；用户先审此方案，若新增版本化合同需跨现有职责再单列影响与替代方案申请。后续顺序：P2-C3C-min 真实身份/离机读回（另批）→ VB-05 合成负载（另批）→ VB-06 P0-01A–F root/install/fault（另批）→ R2/C4 资源、生产真实写者及 R3/R4/R5。

**本批未获授权**：Mac/Guest sudo/root/系统路径/服务/网络/证书写入，`systemctl daemon-reload/enable/start/mask/unmask`，`docker` API、直接 daemon 运行、VM 电源/快照变更、生产 AWS/IAM/备份动作、远端 PR/合并。候选 Unit 必须先证明在 Guest **systemd 249** 上没有依赖环、Socket 触发可拒绝、重启状态不被缓存；否则设计回退，不通过“部署后再补 Guard”掩盖缺口。

**退出状态：** `VB-04A/B STATIC PASS_SCOPED / VB-04C DESIGN COMPLETE_LOCAL / VB-04D1 NOT_AUTHORIZED / P2-C3C NOT_AUTHORIZED / P0-01 NOT_RUN / S03-G06-S09 OPEN / R2-C4 OPEN / C5-G2 NO-GO`。只变文档，本地审阅后另批授权远端；MCP-workspace 未开放 lint/build/test，本轮没有执行测试。