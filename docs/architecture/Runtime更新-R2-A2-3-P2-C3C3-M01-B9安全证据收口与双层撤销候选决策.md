# Runtime 更新 R2-A2-3 — P2-C3C3 M01-B9 安全证据收口与双层撤销候选决策

> **2026-10-24～25 操作者回执 / 2026-10-24 仓库基线复核 / DOCUMENTATION EVIDENCE ONLY。** 代码基线为远端 `dev@814c14898ce01f915c345af7426de95b3c753bb5`；从原 P2-C3C3 文档合并基线 `95d470ca` 到本次 `dev` 的后续提交为 C1-PREP-06/07/08，未触及 `maintenance_mtls_hostonly_lab_service.py` 及其单元测试。Mac/Ubuntu 测试只取自操作者粘贴的终端回执，助手没有远程重跑或独立封存原始证据。**本文件只对 M01-B4～B8 无 CAS 的 LAB_ONLY TLS 测试及 B9 只读审计作限定收口；不授权修改 TLS/enrollment、运行正式 CAS、安装可信身份、部署 Guard 或生产。**
>
> **最终状态：`M01-B9 EVIDENCE_AUDIT_CLOSED_PASS_SCOPED / OPTION_B_PREFERRED_NOT_IMPLEMENTED / FORMAL_CAS_ENROLLMENT_BLOCKED / P1_DENY / P0-01_NOT_RUN / PRODUCTION_NO-GO`。** 本记录经独立文档 PR 交付；该 PR 的 CI、合并状态以 GitHub Actions/PR 实际记录为准，不将旧源码 CI 或文档 CI 冒充现场 TLS 验收。

## 1. 基线、来源与验收分层

- 仓库准则：根 `AGENTS.md`、`.github/workflows/ci.yml`（Runtime `ops-checks`）、[C3C1 可信安装身份边界](Runtime更新-R2-A2-3-P2-C3C1最小认证离机CAS信任边界设计.md)、[C3C2 合成 Peer/Wire](Runtime更新-R2-A2-3-P2-C3C2离线认证身份与Wire合同实施记录.md)、[C3C3 DESIGN-B](Runtime更新-R2-A2-3-P2-C3C3-DESIGN-B最小mTLS服务认证与撤回设计.md)、[IMPLEMENT-A](Runtime更新-R2-A2-3-P2-C3C3-IMPLEMENT-A本地Mac服务与证书交付门禁.md)及 [R0](Runtime更新-R0冻结设计.md)。归属 Runtime/Ops，不改变其他上下文、17 文件 Bundle、CI 或持久化合同。
- 远端实际代码：`ops/runtime/maintenance_mtls_hostonly_lab_service.py`、`ops/runtime/tests/test_maintenance_mtls_hostonly_lab_service.py`（14 项纯离线用例）、`ops/runtime/maintenance_off_host_auth_wire.py` 与 SQLite CAS 实验实现。本次**只读**检查；代码/测试不因本文件变化获得新的运行证明。
- 证据分层：`FIELD_RECEIPT` = 操作者双端终端输出；`STATIC_VERIFY` = openssl 静态检查；`SOURCE_REVIEW` = 仓库实现审读；`CI` = 已合并旧代码的 Actions，**不包括**本次 Mac/Guest 握手。
- 实验环境：Mac Python 3.8.2 / LibreSSL 2.8.3，Ubuntu Recovery Guest Python 3.10.12 / OpenSSL 3.0.2；Mac `192.168.56.1:39443`、Guest `192.168.56.5` Host-only，**独立一次性 Python TLS_ONLY 服务，没有调用仓库 CAS service / SQLite / enrollment**。双方仍在同一物理故障域。
- 实验 CA DER SHA256 `40788f66c5eb4572f41d7b49019a87d9138d4f2676be1a9ca1a8ee6f90e449e8`；原服务端 leaf `06b1d2f197565ab9b57222ff8317f2cb28e92e39dce671b9272855760800888d`；原客户端 leaf `d5dfb4c13a87295f1f2567b67ff65bc593045c727a08d48844ccce8bc83bdab7`。以上是 **X.509 DER 指纹，不是 PEM 文件字节哈希**；正式 enrollment 的 `caCertSha256` 在源码中对应 PEM 原字节 SHA256，后续不得混用。

## 2. M01-B4～B8 现场矩阵（仅 TLS_ONLY 实验）

| 阶段 | 双端 / 静态证据 | 结论与范围 |
| --- | --- | --- |
| M01-B4 | Mac/Guest TLSv1.2、`ECDHE-RSA-AES128-GCM-SHA256`、双方证书 DER pin、一致的 TLS ACK | 正向真实 mTLS `PASS_SCOPED` |
| M01-B5 | Mac `PEER_DID_NOT_RETURN_A_CERTIFICATE`，Guest 握手失败告警 | 缺客户端证书拒绝 `PASS_SCOPED` |
| M01-B6 | Guest `VERIFY_CODE=19`、Mac unknown-CA alert | 未受信 CA 拒绝 `PASS_SCOPED` |
| M01-B7 | Guest `VERIFY_CODE=64`，期待 IP `192.168.56.254` 与实际 SAN `192.168.56.1` 不匹配 | 错误 IP SAN 拒绝 `PASS_SCOPED` |
| M01-B8-1A/B | 同一公钥、有效 CA 但 EKU 仅 `serverAuth`；Mac 静态 `error 26: unsupported certificate purpose`；Ubuntu 真实握手 `unsupported_certificate` alert 43，Mac `NO_CERTIFICATE_RETURNED` | 错 EKU 连接被拒 `PASS_SCOPED`；**服务端内部精确拒绝阶段未证** |
| M01-B8-2A | Ubuntu `openssl verify -attime`：生效前 1 秒 `error 9`，有效期内 OK，过期后 1 秒 `error 10` | 时间边界**离线**验证 `PASS_SCOPED` |
| M01-B8-2B | 独立过期服务器证书 DER SHA256 `ee0448277b03b24f0a57ef3c669deb9cd3a493209bcb48a90cc0ecf9b77c1717`；Guest 真实 TLS `VERIFY_CODE=10`，Mac `SSLV3_ALERT_CERTIFICATE_EXPIRED` | 真实过期证书拒绝 `PASS_SCOPED` |
| M01-B8-3A/B | Mac `VERIFY_CRL_CHECK_LEAF` 可设置、`cert_store_stats` 显示 `crl=1`；专用撤销序列号 `74DC653253E89C60D3DD51ED3C369CA6`；静态 `error 23: certificate revoked`；原客户端 + CRL 验证 OK | CRL 预检、签发与静态对照 `PASS_SCOPED` |
| M01-B8-3C | 启用 CRL 的独立 Mac TLS 服务：原客户端 TLSv1.2 正例和 ACK 成功；已撤销客户端 Ubuntu 收到 `SSLV3_ALERT_CERTIFICATE_REVOKED`，Mac `NO_CERTIFICATE_RETURNED` | 真实 CRL 撤销阻断 `PASS_SCOPED`；**Mac 内部 `verify_code=23` 未直接取得** |
| M01-B8-4 | Mac `OP_NO_TICKET` 可配置；双端两次握手/认证成功，第二次显式尝试复用 Session，但 `session_reused=False`、server `hits=0` | 本实验配置下未观察到 Session 恢复 `PASS_SCOPED`；**非所有恢复路径的禁用证明** |

注意：Mac LibreSSL 2.8.3 的 `openssl verify` 对错误 EKU/过期证书曾同时输出错误行与尾部 `OK`、并可能返回退出码 0；现场已使用**错误码内容**而非单独的退出码判定负例。错误字符串 `SSLV3_ALERT_*` 是历史命名，不意味着 SSLv3 协商。B8-4 后 Mac `lsof -nP -iTCP:39443 -sTCP:LISTEN` 无输出，只证明该次观察到的 TCP LISTEN 为空，不是永久端口保留。

B8-3 使用独立实验 CRL，`nextUpdate=2026-10-26T00:04:02Z`；这是**局部测试登记**，不包含实验 CA 的完整撤销生命周期，不能作为正式 CAS 的 CRL 数据源或续期基线。原客户端 leaf `notAfter=2026-10-31T22:50:49Z`；原服务端 leaf `2026-11-07T22:35:28Z`；实验 CA `2026-11-23T22:32:19Z`。不得为后续测试忽略有效期或改变系统时钟。

**本节收口上限：`TLS_ONLY_EXPANDED_NEGATIVE_EVIDENCE_CLOSED / PASS_SCOPED`；原 DESIGN-B 中 N03/N04/N05 的真实 CAS/身份撤销/重放/并发范围并未因此关闭。**

## 3. 实现差距及仍未关闭的安全门禁

| 优先级 | 已审计代码事实 / 尚缺证据 | 门禁 |
| --- | --- | --- |
| P0 | 正式 `InstallationAnchor` 仍 `NOT_PRESENT`；不能从 LAB_ONLY 的 CN/CSR 或私钥导出受信 host/install/anchor 身份，亦不能以自报 synthetic peer 自注册 | `ENROLLMENT_BLOCKED` |
| P0 | 真正 `serve_manually` 需已存在的 canonical enrollment 与独立 SQLite 数据库；本轮没启动该服务，也没执行线上 `HEAD_READ / COMMIT_LOOKUP / CAS_SUBMIT` | `REAL_CAS_NOT_RUN` |
| P1 | 当前 `tls_context()` 只有 `ctx.load_verify_locations(cafile=ca_path)` 与 `CERT_REQUIRED`，**未加载 CRL，也未启用 `VERIFY_CRL_CHECK_LEAF`** | TLS 层 CRL 防护在**仓库实现**中 `NOT_IMPLEMENTED` |
| P1 | `serve_manually` 握手后读取 enrollment、检查 `current == cfg`，随后读取请求才执行；尚未证明撤销与请求/SQLite COMMIT 原子互斥 | 已建立连接撤销、并发提交/旧身份重放 `NOT_RUN` |
| P1 | 离线 tests 以 synthetic DER/mock SSLContext 测合同，不能代替正式 Mac 服务运行；未见真实联网 UNKNOWN、断线重连、CAS 提交 lookup、DB 故障审计 | `NETWORK_AND_DURABILITY_OPEN` |
| P2 | Missing SAN、真实 notYetValid、TLS 1.0/1.1、拒绝非白名单 Cipher、Session ID 恢复与撤销后旧 Session 的联合负例尚未形成完整实测 | `REMAINING_TLS_NEGATIVES_OPEN` |
| P0 | 同机 Mac/Guest 实验缺物理故障域独立性；生产级可验证 OFF_HOST 回执、ARMING/Boot Guard TOCTOU、Service/Socket/root Guard、G06/S09、P0-01 仍 OPEN | `PRODUCTION_NO-GO` |

说明：`_strict_config()` 严格审查 enrollment 字段；`dispatch_authenticated_lab()` 用 TLS peer DER hash 及 role/host/install/anchor/body 对照后才调后端；当前返回继续声明 `authorizedToStartDocker=False` 和 `offHostProductionAuthority=False`；`build_bundle.py` 固定的 17 个源文件**不包括**该实验服务。这些都是代码结构事实，不是已运行受信服务证明。

## 4. B9 撤销策略选择：优先候选 B（文档决策，不是运行授权）

**用户于本次 B9 收口明确采纳“方案 B — Enrollment + X.509 CRL 双层撤销”为后续正式身份体系的优先实施候选**。选择理由：TLS 握手的证书状态校验与每项 CAS 请求的安装身份/角色/撤销状态复核彼此独立，避免把单一短期握手等同于持续授权。此处只确认**方向**，不宣称策略细节已全部冻结，也不改变现有源码。

| 责任边界 | 候选 B 规则 / 仍待审批事项 |
| --- | --- |
| CA / CRL 维护方 | 由离机受信证书管理者维护**完整**签发序列号与撤销历史、CRL 签名及有效期；明确唯一发行来源、发布路径与密钥轮换治理，拒绝以 B8 测试 CRL 冒充正式总账 |
| TLS 服务入口 | 只在获得批准、正确验证 CA/CRL 签名、issuer、时效和发布版本后装载，启用 `VERIFY_CRL_CHECK_LEAF`；CRL 缺失、过期、无法校验或信任降级须拒绝建立新认证会话，不得关闭 flag 继续运行 |
| Enrollment 权威 | 独立可信 `InstallationAnchor` 与不可由 Guest 自注册/自编辑的 host/install/client cert DER pin/CA pin/roles/revoked；按请求检查身份及最小权限，拒绝旧实例/克隆身份碰撞 |
| 撤销线性化 | 必须定义撤销生效点、正在处理请求与 SQLite 提交谁先完成、已建立连接断开/终止策略、撤销 epoch 或等价互斥方案；需要专门并发/旧 Session 负例后才可声称“撤销即刻生效” |
| 更新/失败 | CRL 原子投送、版本与重放拒绝、短时可用性与失效后的停机/事故处置、人工恢复与审计记录**尚未定稿**；不得把过期 CRL 设为“软失败” |
| 证书哈希定义 | CA 文件原始 PEM 字节 SHA256 与证书 DER SHA256 不混用；必须明确 enrollment 字段格式、规范化和轮换后迁移语义 |
| 对外响应 | 继续无 Docker 启动授权、无 `CustodyReceipt(location=OFF_HOST)` 正式证明，失败/未知默认 DENY，避免把 TLS 成功误提升为 P1 正向准入 |

**影响与替代方案：** 候选 B 相比 A（仅 enrollment 为撤销权威）需新增完整 CRL 治理和服务加载/失效检查、测试及运维操作，可能导致缺失或过期 CRL 时服务不可用（预期 fail-closed）。A 更省改动，但握手层无法独立证明吊销；更彻底的独立受信平台/CA 方案超出当前 Mac Host-only 实验。**改变 TLS 服务入口或 enrollment 运行安全职责、引入 CRL 生命周期或修改持久化/公共合同之前，必须按 AGENTS.md 单独说明影响并取得明确代码授权**；本次只授权文档选择。

## 5. 后续执行路线与明确门禁

1. **M01-B9 文档收口：** 将现场矩阵、代码差距、Option B 优先候选及保留缺口写入本报告、IMPLEMENT-A 最新收口节与 worklog；按本地审阅 → 已获用户远端交付授权 → GitHub Actions 全绿后合并 `dev` 的流程交付。旧条目的 `NOT_RUN` 为当时历史状态，由本节最新快照覆盖，不篡改历史证据。
2. **B9-DECISION（独立批准）：** 明确可信 Anchor 来源、完整 CA/CRL 总账 owner、CRL 原子版本/过期恢复与撤销线性化、不同证书标识编码的合同；评审架构变化与替代方案后才可改代码或签发正式材料。
3. **B10-TLS（另行授权）：** 补 missing SAN、真实 notYetValid、TLS 降级/弱 Cipher 等纯 TLS 负例；不得启用 CAS，独立 CRL 已过期时不可继续拿它执行“当前有效”校验。
4. **C3C3 M02/M03（可信来源可用后）：** 全新私有受控目录、正式 enrollment 与新 SQLite，仅在经授权的安装身份来源和管理员操作下创建；拒绝从本次实验 leaf/CSR 猜造 anchor。
5. **C3C4（另行授权）：** 经独立受信身份绑定的真实 Guest 客户端/Host-only CAS 请求、读回、UNKNOWN、角色、撤销竞争、旧会话复用以及服务停机恢复；仅达到 `AUTHENTICATED_HOSTONLY_LAB_CAS_PASS_SCOPED`，不能替代 P0-01 与生产抗回滚。
6. **P2-D/P0-01 与生产：** Guard/ARMING admission、systemd service/socket、直接 daemon/shim writer、AWS/G06/S09 等仍保持单独 NO-GO 与审批。

**M01-B9 退出：`AUDIT_DOC_CLOSED_LOCAL / TLS_B4_B8_PASS_SCOPED / OPTION_B_PREFERRED_NOT_IMPLEMENTED / FULL_FORMAL_CAS_NEGATIVE_MATRIX_OPEN / ANCHOR_NOT_PRESENT / CAS_NOT_RUN / DOC_PR_CI_GATE / P1_DENY / P0-01_NOT_RUN / PRODUCTION_NO-GO`。**


## 6. B9-DECISION 决策合同交接（2026-10-24 最新）

B9 的“优先候选 B”已经按用户本批远端交付授权，明确选择首版 **Option B / B1（Enrollment + 完整 CRL + fenced stop-and-replace）** 的**文档安全语义基线**：受信发行/注册分权、CRL 签名和版本/时钟 fail-closed、停服屏障与撤销线性化点 F、UNKNOWN 对账、证书轮换和 T01–T08 负例矩阵。详见 [B9-DECISION 双层撤销权威与 CRL 生命周期合同](Runtime更新-R2-A2-3-P2-C3C3-B9-DECISION双层撤销权威与CRL生命周期合同.md)。

**此收口不提升运行权限**：可信 InstallationAnchor、CA/CRL operator、跨回滚最小版本源、可执行 fence、正式 enrollment 与联网 CAS 均未实现/未授权。现有本节早期“待决策”表述保留历史时点，不得把文档合并视为功能已实现。

`B9_DECISION_DOC_FROZEN / OPTION_B_B1_SELECTED / IMPLEMENTATION_NOT_AUTHORIZED / P1_DENY / P0-01_NOT_RUN / PRODUCTION_NO-GO`
