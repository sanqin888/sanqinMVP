# R2-A2-3 — P2-C3C1 最小认证离机 CAS 信任边界与实施分批设计

> **2026-10-24（America/Toronto）｜DESIGN ONLY / LOCAL REVIEW / AUTHENTICATED NETWORK IMPLEMENTATION NOT AUTHORIZED / NO PR / PRODUCTION NO-GO。** 基线 `dev@2b83edf29cde91c2bc9b25ba720c69ecd33357c3`（PR #2927、CI #7504 SUCCESS；Runtime 624/624）。本批按“合并后开始下一步”只审计和编写可审阅设计。P1/A2-1 DENY、P2-C3A LAB_ONLY、VB-04D1 OFFLINE_STATIC_CANDIDATE_ONLY 不变；没有启动 TCP 监听、签发证书、变更 Mac/VM 权限或改 Runtime 可执行代码。

## 1. 依据与已有可复用合同

- 根 `AGENTS.md` 第 4/10/11 节、`.github/workflows/ci.yml`（Runtime `ops-checks`）、[R0](Runtime更新-R0冻结设计.md)、[VB-04C](Runtime更新-R2-A2-3-VB-04C启动守卫安装依赖与撤回设计.md)、[VB-04D1](Runtime更新-R2-A2-3-VB-04D1离线Unit依赖与安装Manifest实施记录.md)、[P2-C3A](Runtime更新-R2-A2-3-P2-C3A离线SQLiteCAS合同与测试记录.md)、[P2-C3B](Runtime更新-R2-A2-3-P2-C3B-001Mac进程持久化实测复核.md)、`ops/runtime/maintenance_boot_guard_contract.py`、`maintenance_boot_guard.py`、`maintenance_off_host_cas_contract.py`、`maintenance_off_host_cas_sqlite.py` 与对应负例测试。
- P1 `CasRequest` 固定 `host_id / installation_id / owner_id / transaction_id / expected_epoch / proposed_epoch / expected_state_sha256 / proposed_state_sha256 / nonce_sha256`；P1 `CustodyReceipt(location=OFF_HOST)` **没有签名或独立身份验证证据**，源码说明只是一份 claim；`OffHostCasCustody` 目前纯 `Protocol`，没有受信网络实现。
- P2-C3A `OfflineCasSubmission` 传入完整 canonical `BootGuardState`、`InstallationAnchor` SHA 和 **调用方自报**的 `client_identity`；Mac SQLite 实验库受限用户态，`OfflineCasReceipt` 分类为 `UNAUTHENTICATED_OFFLINE_LAB_ONLY`，不能被 `CustodyReceipt` 冒名替换。已有显式 enrollment、epoch+1、`BEGIN IMMEDIATE`、前驱比对、唯一 request/nonce、成功事务回执、`read_head()` 与 `lookup_commit()`；C3B 在 Mac 进程级测试限定通过，不是系统级掉电/物理离机证明。
- VB-04D1 只校验受声明的 systemd 249 Unit/9 路径/双 Hook 意图，输出永远 DENY；尚无 root-owned install、真实 `docker.socket` 或 `docker.service` 许可。
- 宿主与 Guest：Mac Catalina 10.15.8，用户态 Python 3.8.2/SQLite 3.28.0，Host-only 网段 `192.168.56.0/24`，Mac bridge100 `192.168.56.1`，Recovery Clone `192.168.56.5`，原 Jammy VM 关机。**这是操作者既有现场回执，不是本次网络/SSL 版本/防火墙或网络可达性重新验证**。Mac/Guest 同一物理主机，不具备独立灾难故障域。

## 2. 决定采用的最小实验目标及明确非目标

**目标：** 只给通过证书和外部预登记校验的 Recovery Clone，提供 *读当前 head / 按精确 request SHA 查询既有提交 / 尝试原子 CAS* 三项最小能力，使 Mac 上的独立 SQLite 进程能够证明“收到了哪个安装实例的请求、是否仅一笔事务发生过”，并确保通信不确定时由 Guest **DENY**。目标是 `AUTHENTICATED_HOSTONLY_CAS_PROCESS_LEVEL` **限定候选**，不是可离线验签、生产级独立 OFF_HOST authority 或 Docker 启动放行。

**明确非目标：** 不实现 RELEASE 或解除 INCIDENT；不接受远程 enrollment、发证、删除/恢复数据库、重置 epoch、改变 Unit/root、自动启动 Docker、生产 VM 管理、AWS/IAM/备份与任何公网服务。最小服务不可直接实现 P1 `CustodyReceipt(location=OFF_HOST)` 的认证断言，须先明确受信交易证明的验签/来源接口，再获得另次授权。**不使用与 Host-only 相同物理主机的 Mac SQLite 结果作为 R0/S03/S09 生产灾难恢复独立证明。**

## 3. 认证模型：IP 仅限流，身份以证书与登记决定

| 层 | 规则 | 失败/未知 |
| --- | --- | --- |
| 绑定与网络 | Mac 实验服务仅绑定经过现时核验的 Host-only IPv4（候选 `192.168.56.1`）和独立专用端口；不绑定 0.0.0.0、IPv6、LAN、Cloudflare、Nginx 或 Docker socket；单连接有界超时/并发/内容长度 | 拒绝；不尝试在失败后切换 LAN/WAN/HTTP |
| 服务端认证 | Guest 显式信任独立实验 CA/服务端证书，验证 Host-only 端点对应的 **SAN（IP）**、有效期、证书用途与信任链；不允许 `CERT_NONE`、`check_hostname=False` 或透明 TOFU；Mac 证书来源与私钥保管须独立授权 | 证书失效/日期时钟不可信/无法验证 ⇒ DENY |
| 客户端认证 | Mac TLS 强制要求客户端证书（mTLS）；用已验证证书链+leaf identity 解析受信安装实例，**而不是依赖 envelope 的 `clientIdentity` 字符串或对端 IP** | 未登记/撤销/错误用途/证书更换/Host 克隆重复使用证书 ⇒ DENY |
| 实例登记 | 独立审批 enrollment：`host_id + installation_id + anchor_sha256 + cert identity + allowed operations`；客户端证书不得自举登记自身，且同一身份不得同时代表原 VM 与 Recovery Clone | 未知或冲突 ⇒ DENY，不自动当成 LEGACY |
| 操作角色 | 只读角色查询 head/status；提交角色可 CAS；证书签发/登记/撤销/事故解除永不对 Guest 网络 API 暴露；签发和登记需额外人员权限 | 最小权限，不暴露 shell 或通用 SQLite 查询 |

**运行平台门禁**：Mac Catalina / Python 3.8 已属不再受主流维护的实验环境，后续设计不得把它用于生产受支持服务。网络实施前只读取得 `ssl.OPENSSL_VERSION`、`ssl.HAS_TLSv1_3`、可用 `SSLContext`、Mac 防火墙/监听及 Guest 证书工具版本；不能仅假设 Mac 原生 Python TLS 支持适当 cipher/TLS 版本、证书 SAN 或独立低权服务账户。尽量复用 Python `ssl` 标准库；若必须引入新依赖/工具版本，依 `AGENTS.md` 单独审批。

## 4. 最小 Wire Protocol 候选（新版本、非 P1 直接实现）

独立新协议名称候选 `sanq.runtime.auth-cas-wire.v1`。候选 transport 为经 mTLS 认证的 **固定端点 + 有界 canonical JSON**；不用通用反向代理、远程 Python eval 或任意路径 REST 控制。最大 body 候选 32 KiB（需加 framing、反复 JSON 键/超时/连接上限/并发测试，原 state `MAX_RECORD_BYTES=16384`）；完整请求/响应 canonical bytes，拒绝重复 JSON keys、非规范数值、非 ASCII 非法编码、未知 schema/operation、未知字段及过大输入。响应不回传 TLS 私钥、macOS 用户目录和 SQLite 内部错误。

| 操作 | 输入合同 | 仅预期输出 |
| --- | --- | --- |
| `HEAD_READ` | 认证的安装主体、`host_id`、`installation_id` | `epoch / state_sha256 / commit_sha256 / phase` + 来源为**在线认证会话**的声明；不代表已证明本地 Guard 放行 |
| `COMMIT_LOOKUP` | 安装身份、`request_sha256` | 如果已持久 commit，返回**原保存且与请求完全一致**的实验回执 + `is_current_head`；未找到时不得宣告请求确定失败 |
| `CAS_SUBMIT` | 原 `CasRequest` + 完整 canonical `BootGuardState` + `anchor_sha256`；**clientIdentity 由 TLS 会话覆盖和绑定** | 仅在 enrollment+权限+状态转换+唯一 nonce/epoch/head 前驱合格、SQLite COMMIT 成功后返回实验确认；永不返回启动许可 |

- MAC 必须以证书导出的 `client_identity` 与 enrollment 对照，并验证 `proposal.request`、完整 `state_bytes`、anchor、writer registry/owner/txid 关联；**拒绝** body 中与证书不一致的任何声明。TLS 会话主体是服务端派生事实，不信任客户端请求字段或代理转发头。
- 在单个持久事务下完成 CAS；返回成功前已经提交并可按 `request_sha256` 读回。若在 COMMIT 后断线/超时，则 Guest 标 `OUTCOME_UNKNOWN`，使用 `COMMIT_LOOKUP` + `HEAD_READ` 对账；**不重试 CAS_SUBMIT、不自动加 epoch、不假定超时即失败**。一旦头已更新或另事务获胜但本请求未出现，转事故/人工核验，不自行放行。
- 服务端不可由于文件缺失、权限错误、SQLite/WAL 损坏或证书错误自动创建空数据库/新 enrollment；错误响应只暴露固定 reason code，保留本机审计证据。拒绝记录另需设计持久审计，P2-C3A 只有成功审计。
- 不能因 mTLS 会话认证就把持久在磁盘上的 `OfflineCasReceipt` “重命名”为 `CustodyReceipt`。TLS 只能认证**当前通信连接及其响应**；若要将回执文件作为离线可信证据，必须另外规定与持久事务关联的可验证签名、信任根、证书轮换、离线验签与独立 anti-rollback。该能力留后批批准。

### 冷启动与 ARMING 竞态

**新的核心阻断项**：即使 Boot Guard 于时刻 T 完成一次经过 mTLS 认证的 `HEAD_READ`，在 T+ε 维护线程可把远端 head 改为 ARMING；若 daemon 只依赖那一次“检查通过”，就可能在错误的许可窗口恢复 writer（check-to-use TOCTOU）。因此本批 CAS 通信**不提供** `ALLOW_DOCKER_START`。正向启动仍为 DENY，直至后续单独冻结并验证“启动准入/维护 ARMING 在同一 authority 上的互斥/租约或能力票据 + 终止/重查协议”，并在 systemd 249 / live Guard 上做时序负例。不能以“最新读 head”替代持续 admission。

## 5. 身份 bootstrap/目录与授权边界

- CA 根/客户端/服务端证书、有效期、SAN、用途、吊销列表/替换/多 Guest 共用身份规则由独立的证书计划生成；不要在 repo/CI/MCP-workspace 写明文私钥或使用自动接受 SSH host key/TLS TOFU。证书签发、Mac 私钥存放、Keychain/权限、Guest 正式证书安装与网络防火墙配置分别经准确授权。
- Mac 原 `~/Library/Application Support/SanQ-Runtime-CAS-Lab/P2-C3B-001/` 的受保护 SQLite 实验目录与最终 epoch3/INCIDENT 证据**只读保全**；**不得重用、删除、重置或升级作为联网服务库**。新的 C3C 实验必须使用全新、明确授权的独立私有目录/实验数据库/enrollment，不能破坏 C3B 的已证基线。
- 本地原型可先在受批准的 Mac 用户态隔离账户/目录验证，不因服务最小就准许 LaunchDaemon/root/自动重启。若未来切换独立低权账户，必须处理 UID/GID 及父目录遍历权限，不能仅凭更改 0700 数据库权限尝试启动。
- 端口未固定、未试监听；Mac `rapportd` 曾占 wildcard TCP 49472，绝不复用此端口、关闭系统服务或认为 firewall enabled 已证明 Host-only 未受影响。Mac → Guest SSH/Host-only 与 mTLS 是不同身份链，不能相互替代。
- 未授权 Guest root 文件、更改 systemd 单元、Docker start、snapshot、AWS/生产、修改 17 文件发布列表。

## 6. 分批实施方案与验收表

| 批次 | 产物与约束 | 当前授权 |
| --- | --- | --- |
| **P2-C3C1** 只读审计/方案冻结 | 此文：新认证信任边界、wire v1、角色、error/unknown、TLS 能力检查与 rollback 风险 | **本次仅设计** |
| **P2-C3C2** 纯离线认证边界合同与负例 | 以注入的 verified peer identity 测试：证书身份↔安装 binding、角色、canonical frame、状态与 nonce/CAS、unknown 查询；没有网络/SSL service、没有 Guard ALLOW，不改 P1 | 需明确许可新的跨进程/公共合同扩展 |
| **P2-C3C3** Mac Host-only 实验服务 | 新实验目录/SQLite、独立 enrollment/证书/CA、仅 Host-only 监听、受控启动/停止、崩溃恢复与审计 | 需单独 Mac 文件、网络、证书与服务身份授权 |
| **P2-C3C4** Ubuntu Recovery Guest nonroot 客户端 | 审核准确 VM/Guest SSH/证书注入路径、mTLS 提交/读回、并发、断线/重放/过期、Mac 服务重启；绝不接入 Boot Guard | 需独立 Guest 文件/网络/进程操作授权 |
| **P2-D / P0-01** Guard 正向身份状态、admission 生命周期、root 安装/service+socket/systemd 249、直接 daemon/shim 与事故救援 | 需要独立版本化启动许可合同、root/Unit/Docker/VM 故障注入授权 |

**最小 P2-C3C2 负例矩阵**：wrong cert ↔ installation、错误 SAN/CA/过期/撤销、未登记 Guest、重复/错 role、body 冒充 clientIdentity、错 anchor/source/nonce/epoch/predecessor、JSON 重复字段/超大包/慢读取、2 客户端抢同 epoch、commit 后断线、COMMIT_LOOKUP 既有/未有、Mac DB 不可读/回滚/损坏、Guest 网络断连/Host-only 被误配、未获授权提交 RELEASE、收到响应时 daemon 仍保持 DENY；网络与真实 TLS 故障需在 C3C3/C3C4 单独实测，C3C2 只验证注入逻辑。

## 7. 需要用户明确批准的架构变化、影响与替代方案

依 `AGENTS.md §10`，接下来引入**认证 peer 身份事实 + V1 wire + Host-only transport 入口 + 网络到原子 SQLite 操作的映射**，这是将纯离线、调用方自报数据跨越到可信 I/O 的**新安全/模块边界**，并非已有内部原子改动。因此在批准之前**停止代码实施**：

| 选择 | 优势 | 风险/建议 |
| --- | --- | --- |
| A. 在原 `OfflineSqliteCas` 上直接加网络并把旧 `LAB_ONLY` 回执当 `OFF_HOST` | 代码看起来最省 | **拒绝**；会破坏 P2-C3A 免责声明和 P1 信任前提，导致过度认证声明 |
| **B. 新 `ops/runtime` 版本化 mTLS/peer-bound adapter，底层先委托现有纯 CAS 核心（推荐）** | 保持 P1/A2-1、C3A 与 VB-04D1 默认 DENY，不影响 17 Bundle；可分别验证认证前后条件 | 新的 wire/身份职责必须先审 API/测试/受信来源，不允许凭 injected identity 假装 TLS 已认证 |
| C. 立即使用 AWS 独立 CAS authority | 改善跨物理故障域 | 当前涉及 IAM、外网、AWS 资源/生产部署，扩大 R2 范围与成本，独立下一阶段选择 |

**建议用户只批准 C3C2 的纯离线协议/身份绑定合同与负例**，并明确该批准**不包含** C3C3/C3C4 TLS 服务部署、密钥、Mac/Guest 操作或 P2-D 正向 Docker 许可。要申请 C3C3，必须补全目标端口、Mac TLS 版本真实只读回执、CA/密钥治理、失败撤回/保管方案。

## 8. 收口状态

`VB-04D1 MERGED / CI #7504 624/624 PASS / P2-C3C1 DESIGN COMPLETE_LOCAL / P2-C3C2 AUTHORIZATION REQUIRED / P2-C3C3-C4 NOT_AUTHORIZED / P2-D-P0-01 NOT_RUN / S03-G06-S09 OPEN / R2-C4 OPEN / PRODUCTION NO-GO`。

本次仅文档，未推送远端/PR；未运行 workspace lint/build/test，未更改证书、服务、Mac、Guest、生产、AWS。