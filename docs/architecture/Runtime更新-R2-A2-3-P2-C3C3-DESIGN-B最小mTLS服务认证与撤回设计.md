# Runtime 更新 R2-A2-3 — P2-C3C3-DESIGN-B 最小 mTLS 实验服务、身份与撤回合同

> **2026-10-24 / 设计稿本地待审 — NO NETWORK / NO KEYS / NO VM WRITE / NO DEPLOY / NO PR。** 审阅基线为 `dev@b7e8d882dbef75705ed63af911e265622fe59acc`（PR #2931，Actions #7513 SUCCESS，docs-only）。本文件基于 [P2-C3C3-READ 最新 Host/Guest 回执](Runtime更新-R2-A2-3-P2-C3C3-READ认证TLS与HostOnly就绪审计.md)，只是实施前的可审阅设计，不是联网授权、证书生成/分发脚本或 Boot Guard 启动许可。**当前 MCP-workspace 旧工作树包含并行 C1 未提交文件，与远端最新 dev 不能混为已同步的本地分支；本文件不推送，后续必须在干净、最新 dev 分支独立移植并审阅。**

## 1. 现有规范、所有权与已证事实

- 按根 `AGENTS.md`、`.github/workflows/ci.yml`、[R0 冻结设计](Runtime更新-R0冻结设计.md)、[C3C1 身份信任边界](Runtime更新-R2-A2-3-P2-C3C1最小认证离机CAS信任边界设计.md)、[C3C2 Wire v1](Runtime更新-R2-A2-3-P2-C3C2离线认证身份与Wire合同实施记录.md)、[VB-04C Service/Socket Boot Guard](Runtime更新-R2-A2-3-VB-04C启动守卫安装依赖与撤回设计.md) 以及现有 `ops/runtime/maintenance_off_host_auth_wire.py`、`maintenance_off_host_cas_{contract,sqlite}.py` 建立本方案。所有权限定 Runtime / Ops；不改变业务、Prisma/schema、CI、17 文件发布 Bundle、P1 启动判定、生产 VM/AWS。
- C3C2 `SyntheticPeerEvidence`、`OfflineEnrollment` 都是**完全可由调用方构造的模拟值**，`assess_offline_binding` 永远 `DENY`；真实服务不得将它们映射为经过认证的生产 `CustodyReceipt(location=OFF_HOST)`。
- 现场：Mac Python 3.8.2 / LibreSSL 2.8.3 支持 TLS 1.2 而不支持 1.3；其默认客户端 Context 最低 TLS1.0、最高 TLS1.2；Guest Python 3.10.12 / OpenSSL 3.0.2 默认最低 TLS1.2；双方客户端 Context 均 `CERT_REQUIRED` / `check_hostname=True`。Mac `get_ciphers()` 原有 37 条而 `protocol` 旧标签皆为 `TLSv1/SSLv3`，按名称与 Guest TLS1.2 清单交集 14/14，包含 ECDHE-RSA/ECDHE-ECDSA AES-GCM。**这只能证明可尝试协商的名字存在，真实证书链、cipher/TLS1.2 协商和 mTLS 握手均 NOT_RUN**。
- Mac Host-only `bridge100 IPv4 192.168.56.1/24`（另有 IPv6 link-local），Recovery Clone `192.168.56.5/24`，Guest 无 IPv4/IPv6 默认路由；原 Jammy VM poweroff 是历史回执，实际操作前必须重新确认准确 UUID。Mac 非 root `lsof` 显示 `rapportd *:49472`、PostgreSQL loopback `5432`；`49472` 禁止挪用。
- C3B-001 原实验 Mac 私有目录 owner=`apple`、mode=`0700`，已有进程崩溃/提交回执证据；不改文件、不重用数据库，不迁移/升级该目录。

## 2. 目标、非目标与依赖

**本阶段目标**：冻结能在**独立、可丢弃的 Mac 用户态实验目录**使用 TLS1.2 双向认证执行 `HEAD_READ` / `COMMIT_LOOKUP` / `CAS_SUBMIT` 的最小架构、精确否决条件、证书/权限与失败撤回顺序，供用户审阅后才决定实施。C3C3 验收上限是 `AUTHENTICATED_HOSTONLY_LAB_CAS_PASS_SCOPED`，非物理离机、生产级防整机回滚和 Boot Guard 正向放行。

**明确非目标**：不部署守护进程/LaunchAgent/LaunchDaemon，不授权 Guest root、不更改 Docker Service/Socket、Docker API、运行策略、Mac PF/ALF 或 AWS。不签发新证书、不触碰系统 Keychain、不监听端口、不在仓库留下 PEM/PKCS#12/私钥或真实安装身份。不得将实验 Host-only Mac CAS 的本机回执直接写入 P1 `CustodyReceipt(location=OFF_HOST)`。

## 3. TLS 版本、证书与密码套件（候选，须先握手验证）

| 合同项 | 本批建议 | 实测/实施门禁 |
| --- | --- | --- |
| TLS 版本 | Mac server 与 Guest client 的 `SSLContext` 显式 `minimum_version=TLSv1_2` 且 `maximum_version=TLSv1_2`；不允许 TLS1.0/1.1/SSLv3 | Mac 现有 `minimum_version` 默认为 TLS1.0，绝不依赖默认；需实测 SSLContext 赋值成功和握手协商版本 |
| 证书算法 | **实验优先 RSA 3072 / SHA256** 的服务器及客户端证书，允许因 Mac 兼容负例改选 ECDSA P-256，但必须重审证书/套件同一变更 | 现有 RSA/GCM 套件仅名称相同，实际 LibreSSL 2.8.3 ↔ OpenSSL 3.0.2 协商尚未证 |
| 首选 TLS1.2 cipher | **候选名单** `ECDHE-RSA-AES128-GCM-SHA256`、`ECDHE-RSA-AES256-GCM-SHA384`；不开放匿名/NULL/RC4/3DES/静态 RSA；ECDSA 证书方案另列两项 `ECDHE-ECDSA-*-GCM-*` | 使用受控上下文级白名单并**读回**真正启用值与 `cipher()`；白名单失效→拒绝，不能自动降级到更多 cipher |
| 服务端 SAN / EKU | 独立 server leaf `subjectAltName: IP=192.168.56.1`，`extendedKeyUsage=serverAuth`；Guest `check_hostname=True` 且连接目标 IP 与证书 IP SAN 匹配 | 必须在旧 Mac 与新 Guest 的真实握手中验证 wrong IP、wrong CA、expired、notYetValid、bad EKU、missing SAN |
| 客户端身份 | 独立 client leaf `extendedKeyUsage=clientAuth`，预登记 `cert_sha256`、CA 及强唯一 instance ID，**每个 VM clone 必须有不同身份** | server `verify_mode=CERT_REQUIRED`，仅在 TLS 链验证成功后从握手的证书 DER 得到 fingerprint；自报 `clientIdentity` 与经验证安装身份不一致则拒绝 |
| CA 与吊销 | 独立**实验 CA** 不与生产共享；预登记 `client cert hash → host_id/installation_id/anchor_sha256/roles`。认证服务自己的耐久 allowlist/denylist、撤销 epoch 与注册身份不得被 Guest 远端写入 | 旧证书撤销、证书到期、时钟不可信、证书校验库失败一律拒绝。LibreSSL 2.8.3 虽暴露 CRL 常量，**真正 CRL 运行效果未证**，不假设凭该常量已完成撤销 |
| Session / TLS resumption | 初次实验不依赖跨连接会话复用来维持身份；每条经过认证的请求都要核对当前 enrollment/revocation，事务不以 TLS session 持续时间代替授权 | 新证书导入与撤销后，旧已建立会话或 session resumption 不得绕过重新认证，实测其行为；不能保证时先停止全部会话和服务 |

**重要区别**：仅在本机读到 cert 的 hash 不等于 `TlsVerifiedPeer`；必须先完成 mTLS server-side trusted CA 链验证、leaf EKU/时间用途与安装登记比对，再允许服务层进行任何 CAS。即便 dataclass 标为“verified”，在同权限 Python 进程内也可能被构造；安全边界依靠受信 TLS transport+最小权限进程+不暴露独立 CAS writer，而不是类名。

## 4. 网络边界、资源上限及被保护的数据库

| 边界 | 设计要求 |
| --- | --- |
| 监听 | **候选** Mac `192.168.56.1:39443`、单 IPv4，`AF_INET` 及 socket bind 前重验该地址/端口无占用；**39443 是仅供审阅的候选，不是端口分配或授权**。不绑定 `0.0.0.0`、`::`、公网、Nginx、Cloudflare 或 Docker Socket，禁止失败后自动退回 wildcard。 |
| 请求 framing | 新受限 transport 层负责编码：固定长度前缀或等价确界帧，**单包 payload 不得超过现有 Wire v1 32768 bytes**；超限、短帧、重复 Key、未知 schema/operation、extra fields 一律拒绝。 |
| 超时及连接限制 | 精确上限方案：TLS 握手候选 ≤5s、单请求总时间候选 ≤10s、活跃连接候选 ≤4、并发 CAS writer 最多 1 个经 SQLite 持久化事务串行化；实际值按隔离负例审查/现场负载调整，不接受无限阻塞或无限并发。 |
| 过程身份 | 初期只在**专门批准的 Mac 非 root 用户态服务会话**运行，不要求 launchd 自动重启、不提权。证书/server key 仅给运行账户必要读权，**不与原 C3B private 0700 目录共享**；今后若使用专门账户，先证明目录父路径遍历和 owner/mode 可用。 |
| 新 CAS 实验目录 | 候选独立 `~/Library/Application Support/SanQ-Runtime-CAS-Lab/P2-C3C3-001/`（**未创建**），单一新 enrollment/store/receipt/audit 文件集合；deny missing DB/无法验 hash/异常 WAL/已有 namespace，不使用 `P2-C3B-001` 历史原件，也不自动新建注册身份。 |
| Admission 与 writer | TLS 连接先完成链/EKU/身份/role/anchor 校验，**再**进入 CAS writer；所有写请求必须经过同一受信边界，禁止用户自报的 `SyntheticPeerEvidence` 直连 SQLite 的执行方法。HALT/错误时所有写操作 DENY，`HEAD_READ` / `COMMIT_LOOKUP` 仅作只读诊断。 |
| 审计 | 记录时间、匿名化安装标识、verified cert fingerprint、request SHA、epoch/head、result reason/timeout/revocation，不记录私钥、完整证书包、原始用户 payload；成功/拒绝与未知提交有耐久索引，敏感目录只授权受限账户。 |

## 5. 三项网络 API、UNKNOWN/掉线与服务失效语义

- `HEAD_READ`：返回经现时 mTLS/登记鉴别的该 `installation_id` 当前 epoch/head/phase；**并不授予 `ALLOW_DOCKER_START`**。权限 READ 足够。
- `COMMIT_LOOKUP`：按固定 request SHA 返回原已提交且可再取回的实验回执及当前/历史头状态；未命中只是当前读未找到，不能由此断言已发出但掉线的提交没有成功。
- `CAS_SUBMIT`：必须先验证 role=SUBMIT、与真实 TLS peer 绑定的 host/installation/anchor/nonce、完整 canonical BootGuardState、CAS 预期 head、单调 epoch、正确事务阶段，再交给新私有 SQLite 实验后端一次原子提交，提交成功后才回应。
- 网络在 COMMIT 后断开或读超时：客户端 `OUTCOME_UNKNOWN_DENY`，先 `COMMIT_LOOKUP`→`HEAD_READ`，不得自动再 `CAS_SUBMIT`、跳 epoch 或放行。
- 数据库/证书/CA/登记/日志写失败、Mac 服务异常退出：CAS 侧永不自动回到 Legacy enrollment，也不通过本地缺文件推定旧实例未登记。错误 reason code 稳定且不泄漏磁盘目录/密钥。
- 如果远端 CAS head 从 `READY` 到 `ARMING` 与 Boot Guard HEAD_READ 之间存在竞争：**C3C3 绝不提供启动票据**。正式放行需另立 trusted admission/ARMING 互斥契约（P2-D），并且在 systemd 249 上动态实测 service/socket + writer fence；本实验无权替代 R0 S03 或生产 G06/S09。

## 6. 身份生命周期与撤回分类

| 状态 | 允许行为 | 禁止行为 |
| --- | --- | --- |
| **未注册 / 实验目录未创建** | 审核先前 host UUID/VDI、证书来源/权限与新目录路径；以本次设计完成门禁 | 自动创建 enrollment、接受未知 cert 首次自注册、从 C3B DB 复制数据作为联网底库 |
| **已注册、正常实验但未 ARM** | 经批准人工停服务、撤销本次登记、保全 receipts、恢复准确端口占用/非 root 进程状态、检查不再监听 | 仅因为进程已停而清空数据库/WAL或默认安全 |
| **提交未知/证书失效/网络失联/INCIDENT** | 在原 Mac 用户态和 Guest Console 做**只读**诊断、保全 SQLite/WAL/请求回执/身份 pin、人工确认单独批准的撤回方案 | 自动重置 epoch、自动发行新客户端身份、无条件清退拒绝记录、`finally` 自动重启服务/Docker |
| **原/克隆身份发生冲突** | 先禁用/撤销旧登记并阻止原 Guest 与 Recovery Guest 双写，保留两端事件证据；要求重新 enrollment 独立审核 | 允许两个 VM 使用同一私钥/InstallationAnchor 直接恢复写事务 |
| **永久卸载或生产迁移** | 另设计真实灾难隔离的 AWS/独立权威、离线验证签名与持久抗回滚，新的 C3C3 实验只做数据隔离回收 | 把实验 Mac SQLite 同机权威凭一次 mTLS 连接升级为生产 OFF_HOST 或 S09 |

服务进程退出后需要用只读 `lsof` 观察候选端口不再监听，并确认没有残存 writer 和没有自动重启；这些仍属用户后续实验执行授权，不是本批实际完成事实。

## 7. 优先试验序列和负例矩阵（未运行）

| 序列 | 限定目标 | 失败标准 |
| --- | --- | --- |
| N00 | 二次确认原 Jammy VM poweroff，Recovery Clone UUID/Host-only 与已有 Mac 保存目录，进程、端口/权限环境 | 任何对象/隔离/救援身份未知立即停 |
| N01 | 用户批准**新的**独立 CA 与证书、实验目录/端口，先非联网证书 IP SAN/EKU 有界校验 | CA/key 泄漏、错误 SAN、旧私钥被复用 ⇒ BLOCK |
| N02 | 经独立批准 Mac 用户态绑定 `192.168.56.1` 单 IPv4 端口，并证实 TLS1.2 两端 ECDHE-RSA-AES-GCM cipher/真实 server IP SAN/ClientAuth/EKU | 任何 SSL/TLS 降级、只有 serverAuth 无 clientAuth、弱套件或其它地址监听 ⇒ FAIL |
| N03 | 合法 READ/LOOKUP/SUBMIT 单一已登记 Recovery Clone，确认 SQLite commit/lookup 后重启进程读回 | 层内自报身份能绕过 TLS、独立 CAS 不能回读 ⇒ FAIL |
| N04 | 错 CA、IP SAN、EKU、未登记 cert、到期/撤销、新 clone 重用旧 leaf、错 role/anchor | 任一请求成功 CAS ⇒ FAIL |
| N05 | 慢客户端/超长帧/断联后提交结果不明/并发抢同 epoch/旧连接撤销重放/错误 TLS 版本 | 自动重试、重复 commit、泄漏、死锁、服务降级为开放监听 ⇒ FAIL |
| N06 | Mac 服务中止，独立 SSH/Host Console 不依赖 CAS/Docker，旧 C3B data 只读哈希核验与事故包保全 | 进程自动复活、回退 Legacy、覆盖旧目录、声称 S03/G06 关闭 ⇒ FAIL |

上述实验全部未执行；N01–N06 涉及真实证书、Mac 目录/网络/用户权限、Guest 凭证投送和测试进程，需逐阶段按准确操作对象另批审批，不能从本设计授权推导。

## 8. 新安全边界变化、备选方案与下一批审批建议

**边界变化：** C3C2 仅为自报 `SyntheticPeerEvidence`，引入真实 TLS Peer → Enrollment → CAS Writer 的运行时 I/O 流程，会创建新的可信运行权、跨进程 RPC 和凭证生命周期。按 `AGENTS.md §10`，在正式写适配器/服务前必须另请明确授权。

| 方案 | 利与弊 | 建议 |
| --- | --- | --- |
| A. 直接将现有合成 Peer/Wire 绑定到 TCP socket，并把原实验回执当已认证 | 实现快，但存在客户端自报身份和对现有 `OFF_HOST` 权威的冒认，无法安全审阅 | **不准实施** |
| **B. 独立 TLS transport（真实握手主体）/受控 Enrollment/原 SQLite CAS 的新实验实例，全部显式 fail-closed** | 复用现有 CAS 事务能力，不改变原 P1/A2-1/C3A/C3C2/Bundles；可分层验证，代价是新增受信适配器与身份管理 | **推荐实验路线；真实代码实现需要单独用户授权** |
| C. 改用外部独立 AWS 控制面及强签名 CAS | 更接近真实跨物理故障域，但涉及 IAM、网络、证书及成本；未具备 C3C3 Mac 实验独立权限 | 作为后续生产权威另行讨论 |

**建议下一批：P2-C3C3-DESIGN-C（批准实施前合同校验与授权清单）**：纯文档或纯离线证书 profile/Peer metadata 结构负例，先完善可复查的 CA/EKU/IP SAN 配置、准确安装文件/owner/mode、端口核验与 rollback manifest，以及强制可信 adapter 与 untrusted Wire 的边界；如需新执行代码、证书或公网/Guest 权限需先报告影响、替代方案，取得明确授权。

**退出状态**：`P2-C3C3-DESIGN-B LOCAL_REVIEW_READY / TLS12_CIPHER_14_OF_14 NAME_MATCH PASS_SCOPED / REAL_MTLS NOT_RUN / CERTS_NOT_ISSUED / MAC_GUEST_WRITE_NOT_AUTHORIZED / P0-01 NOT_RUN / S03-G06-S09 OPEN / R2-C4 OPEN / PRODUCTION NO-GO`。