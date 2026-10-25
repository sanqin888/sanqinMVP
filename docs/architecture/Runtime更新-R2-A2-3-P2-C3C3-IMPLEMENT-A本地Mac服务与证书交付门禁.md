# R2-A2-3 — P2-C3C3-IMPLEMENT-A Mac Host-only mTLS 服务候选及证书交付门禁

> **最新状态索引（M01-B9）：** M01-B4～B8 无 CAS 的 TLS 正反向实验与时间/CRL 静态检查已 `PASS_SCOPED`，Option B（Enrollment + CRL）仅定为后续优先候选；正式 CAS/enrollment/SQLite/InstallationAnchor/Guard 仍 `BLOCKED/NOT_RUN`。详见本文件 §6 与 [M01-B9 审计及候选决策](Runtime更新-R2-A2-3-P2-C3C3-M01-B9安全证据收口与双层撤销候选决策.md)。下文旧 `NOT_RUN` 是历史时点。

> **2026-10-24 / LAB_ONLY_MTLS_CORE_CLOSED PASS_SCOPED 4/4 / REAL_CAS_NOT_RUN / PRODUCTION NO-GO**。DESIGN-B 已通过 PR #2932 / CI #7515，IMPLEMENT-A 实验 CAS 服务候选源码及单元测试已通过 PR #2934 / CI #7520 合并 `dev`。本轮从最新 `dev` 独立补交 **M00～M01 真实 Mac/Recovery Guest 的 TLS-only 现场回执**，保留并行 C1 工作，不修改服务代码；**GitHub CI 仅验证文档/代码门禁，现场 TLS 验收以操作者真实双端终端记录为准**。

## 1. 审前规范与架构归属

- 已查阅根 `AGENTS.md`、实际 `.github/workflows/ci.yml` Runtime `ops-checks`、[R0](Runtime更新-R0冻结设计.md)、[P2-C3C1](Runtime更新-R2-A2-3-P2-C3C1最小认证离机CAS信任边界设计.md)、[C3C2](Runtime更新-R2-A2-3-P2-C3C2离线认证身份与Wire合同实施记录.md)、[C3C3-READ](Runtime更新-R2-A2-3-P2-C3C3-READ认证TLS与HostOnly就绪审计.md)、[DESIGN-B](Runtime更新-R2-A2-3-P2-C3C3-DESIGN-B最小mTLS服务认证与撤回设计.md)，并核查当前 `ops/runtime/maintenance_off_host_{auth_wire,cas_contract,cas_sqlite}.py`。
- 用户已明确同意开始真实 mTLS/证书/Mac 服务阶段，**本批先实现可审阅源码**。但当前 MCP 服务**没有 Mac Host 文件、Terminal、Keychain 或 Recovery Guest 的写入/运行工具**，因此无法替用户签发证书、执行 TLS 握手、启动真实监听或收集运行证据；尤其不能把本次源码提交称为真实服务 PASS。
- 不改变 P1/A2-1/C3A/C3C2 既有 owner/判定，不改 17 文件 Bundle/CI/Prisma/生产；新模块为手动启用的 Runtime/Ops 实验侧服务。**新可信边界已在 DESIGN-B 列明并由用户明确请求开展，但任何超出所述 TLS 身份/读取/原子 CAS 范围的新网络接口或 Docker 许可继续须先审批。**

## 2. 本地代码及静态安全属性

- `ops/runtime/maintenance_mtls_hostonly_lab_service.py`：一个**显式手动执行才监听**的 Mac Python 标准库 TCP/TLS 服务候选，绑定 `AF_INET 192.168.56.1:39443`（39443 尚为**设计候选端口，并未实际占用或分配**）；只接受 TLS1.2、`CERT_REQUIRED` 与 ECDHE-RSA AES-GCM 两项白名单，5s 握手及绝对 10s 帧读取限时，单次连接一帧（32KiB 上限），最多 4 个 socket backlog 请求，串行服务端执行；不启动后台服务/守护进程/launchd。
- 需由运营者**另行预置**的私有 `enrollment.json`，字段 `schema,hostId,installationId,anchorSha256,clientIdentity,clientCertSha256,caCertSha256,roles,revoked`，使用仓库 `canonical()` 格式，只接受严格精确字段与 `READ/SUBMIT`；**不会从网络自动登记**。收到请求前从磁盘重新读取该文件，若与启动时配置不同、已撤销、证书 SHA 与已登记不一致、请求 body 自报身份/锚点不一致即拒绝；不能通过纯 C3C2 `SyntheticPeerEvidence` 获取执行 CAS 权限。
- 系统内真实 `SSLContext(PROTOCOL_TLS_SERVER)` 且 `load_verify_locations(cafile=…)`、`load_cert_chain(certfile=…,keyfile=…)`；只从**成功 TLS 握手的 SSLSocket** `getpeercert(binary_form=True)` 获取 leaf DER 并求 SHA256，然后校验登记与 client role，授权后才委托现有 `OfflineSqliteCas` 的 `read_head/lookup_commit/submit`。
- CA/public cert/key/enrollment 文件需由**当前非 root UID**持有，所在父目录 `0700`、各文件 `0600`、硬链接计数 1，拒绝 symlink；DB 仅接受父目录精确名 `P2-C3C3-001`，要先独立人工初始化、必须已存在且具有原 SQLite 的 0700/0600/WAL/完整性约束。**明确拒绝旧 `P2-C3B-001`**；不会自行新建数据库、覆盖证据。
- 实验返回永远 `authorizedToStartDocker=False / offHostProductionAuthority=False`，成功只为 `HOSTONLY_LAB_RESULT_NONATTESTING`，原 CAS `OfflineCasReceipt` 仍为 `UNAUTHENTICATED_OFFLINE_LAB_ONLY`；不可冒充独立离机签名/持久反回滚权威。
- 非成功 CAS 结果通过 `OUTCOME_UNKNOWN_RECONCILE` 按 `COMMIT_LOOKUP→HEAD_READ` 判断，不自动重试。服务器 SSL 错误/无法读取证书/错误身份/DB 异常均不允许业务启动；**无自动 RELEASE/INCIDENT 撤销**。

- `ops/runtime/tests/test_maintenance_mtls_hostonly_lab_service.py`：聚焦模拟后端和假的 peer DER 的**单元测试**，覆盖身份/证书 SHA/CA/role/状态 PIN、framing 上限、密钥目录权限、重复键、拒绝 C1/C3B 跨界、TLSContext 参数及 17 文件 Bundle 不变。模拟 DER 的测试**不能证明真实 mTLS 握手**；本地 MCP-workspace 不具备测试执行接口，本地 MCP `TESTS NOT RUN`，远端 Actions 为权威。

## 2A. M00-A 只读现场预检回执（操作者提供；2026-10-24）

**MAC_READ_ONLY_PRECHECK PASS_SCOPED / NO BIND / NO CERT / NO TLS_HANDSHAKE**。

| 检查项 | 现场输出 | 验收边界 |
| --- | --- | --- |
| Mac OpenSSL CLI | `/usr/bin/openssl version` → `LibreSSL 2.8.3` | CLI 与此前系统 Python `ssl.OPENSSL_VERSION=LibreSSL 2.8.3` 一致；没有证明证书扩展生成参数已正确支持 |
| 候选端口 `39443` | `/usr/sbin/lsof -nP -iTCP:39443 -sTCP:LISTEN` **无输出** | 本次非 root 可见监听快照**没有发现占用者**，不是专用端口分配/保留，不能确保稍后 bind 不发生竞态，不能证明 Mac PF/ALF 已放行 |
| `bridge100` IPv4 | `UP/RUNNING`，`inet 192.168.56.1` / `0xffffff00`（/24），`status: active`，`member: en7` | 和 DESIGN-B 的 Host-only 单 IPv4 候选一致；未测试可达性、完整路由隔离或服务进程监听 |
| `bridge100` IPv6 | `fe80::1cd9:9334:5038:dfcb%bridge100 /64` | 存在 IPv6 link-local，因此服务必须保持 `AF_INET / 192.168.56.1`，严禁 wildcard/IPv6 fallback |
| 其它本批未取证 | 本次没有 VBox VM UUID/原 VM poweroff 的**最新**核对、Mac TLS 证书 SAN/EKU/实际 cipher 握手、Mac 防火墙/私有证书路径身份 | 不能将整个 M00 / M01 / M04 / M05 标记为 PASS |

**判定**：`M00-A MAC_SSL_TOOL_AND_ENDPOINT PASS_SCOPED`；`M00_VM_IDENTITY_PENDING / TLS_CERT_PROFILE_UNPROVEN / PORT_NOT_RESERVED / LIVE_MTLS_NOT_RUN`。操作者提供的是命令输出，助手未连接 Mac、未检查真实端口保留或执行写入。此回执不构成创建 CA、私钥、实验 CAS 数据库或启动监听的授权完成证明。

## 2B. M00-B Recovery Clone 身份与 Host-only 预检（操作者回执）

Mac `VBoxManage list runningvms` 只列出 Recovery Clone `SanQ-Runtime-Lab-Recovery-01` UUID `d60b89a0-6d55-4658-ad6b-948a4d033901`；原 Jammy VM UUID `dc8c8dc0-56ea-45af-ba2c-a9e6652f60cc` 未运行。Ubuntu Guest `sanq-runtime-lab`、UID1000、`enp0s3 192.168.56.5/24` dynamic、无 IPv4/IPv6 default route、root `/dev/sda2 ext4`；Mac `bridge100 192.168.56.1/24`。以上仅 `M00-B PASS_SCOPED`，不构成 VM VDI 或正式安装来源的密码学证明。

## 2C. M01-A 独立实验 CA 签发（操作者回执）

Mac 生成加密 RSA3072 实验 CA：CN `SanQ-P2-C3C3-Experimental-CA`，`ca.pem: OK`，critical `CA:TRUE,pathlen:0`、critical `Certificate Sign, CRL Sign`；UTC `2026-10-24T22:32:19Z`—`2026-11-23T22:32:19Z`，DER SHA256 `40788f66c5eb4572f41d7b49019a87d9138d4f2676be1a9ca1a8ee6f90e449e8`。独立 `P2-C3C3-CA-001` 目录 0700、ca.cnf/key/pem 均 0600；CA 私钥留在 Mac。`CA PASS_SCOPED`。

## 2D. M01-A2 Host-only 服务端证书签发（操作者回执）

Mac 签 RSA3072/SHA256 server leaf，CN `SanQ-P2-C3C3-HostOnly`，`openssl verify -purpose sslserver` → `server.pem: OK`；critical `CA:FALSE`、critical `Digital Signature, Key Encipherment`、`serverAuth`、`IP SAN:192.168.56.1`，序列号 `6CB4D71126D0A2703989A97CB71DEA05`，UTC `2026-10-24T22:35:28Z`—`2026-11-07T22:35:28Z`，DER SHA256 `06b1d2f197565ab9b57222ff8317f2cb28e92e39dce671b9272855760800888d`。独立 `P2-C3C3-SERVER-001` 目录 0700、server.cnf/key/csr/pem 各 0600。`SERVER_LEAF PASS_SCOPED`。

## 2E. 正式 Guest 安装锚点不存在（操作者回执）

Recovery Guest `/etc/sanq-maintenance` 和 `/etc/sanq-maintenance/installation-anchor.json` 均为 `NOT_PRESENT`；OpenSSL 3.0.2。不得由 VM hostname/UUID、IP 或任意自建文件生成正式可信 `InstallationAnchor`；`FORMAL_ENROLLMENT_BLOCKED`。

## 2F. 用户单独授权 LAB_ONLY 方案 B

用户明确授权不等待正式安装锚点，先进行**独立 LAB_ONLY TLS-only** 的 Guest 加密 RSA3072 私钥/公开 CSR、Mac CA 签 `clientAuth` 公钥证书和真实双向 TLS1.2 正反握手。Guest 私钥只留 Guest，Mac 仅收 CSR/回送公开证书；双方独立非 root 0700/0600。临时 Mac 服务**不导入 CAS、不创建 enrollment/SQLite/Guard、不发 Docker 启动许可**。不得将 LAB_ONLY 证书自升为正式 OFF_HOST 身份。

后续 §2G—§2N 保留分阶段原始现场回执，其 `PENDING/NOT_RUN` 代表**记录当时**；最终状态以 §2N/§5 为准。

## 2G. M01-B1 Recovery Guest 私钥/CSR 及 Mac 公开 CSR 交叉验证（2026-10-24）

**OPERATOR_PASTED_TERMINAL / LAB_ONLY_CLIENT_CSR PASS_SCOPED / PRIVATE_KEY_STAYS_GUEST / LEAF_NOT_ISSUED / REAL_MTLS NOT_RUN**。

| 检查项目 | 原始回执 | 判定范围 |
| --- | --- | --- |
| Guest 本地 CSR | `Certificate request self-signature verify OK`，`subject=CN = SanQ-C3C3-LAB-ONLY-Recovery-01` | 客户端 CSR 公钥签名自验证通过；并非 CA 已签证书 |
| Guest SHA-256 | `fd9c809c5c64e6dfb8715970fffc8d88a8e03e9f4be2640e6a8a3db4b7c8879e`（`client.csr`） | 公共 CSR 文件 pin |
| Guest 本地目录与密钥 | `/home/ubuntu/sanq-c3c3-lab-tls-client-001` 属主 `ubuntu:ubuntu`、目录 `0700`，`client.cnf/client.key/client.csr` 均 `0600` | 私钥已在 Guest 非 root 用户目录内生成且加密；密码未透露，未由 Mac 复制 |
| Mac CSR 接收 | `scp` 传输 `client.csr` 1265 bytes 到 `P2-C3C3-CLIENT-ISSUE-001`；`openssl req -verify -subject` 输出 `verify OK` 和相同 CN | Mac 可验证 CSR；不能凭此证明正式 InstallationAnchor / ssh 主机长期信任 |
| Mac SHA-256 | `fd9c809c5c64e6dfb8715970fffc8d88a8e03e9f4be2640e6a8a3db4b7c8879e` | 与 Guest 摘要完全一致，内容传输一致 |

**下一步 M01-B2**：保持相同 CSR、不重新生成或触碰 Guest 私钥，在 Mac 原独立实验 CA 下签 `CA:FALSE`、`keyUsage: digitalSignature`、`extendedKeyUsage: clientAuth` 的短期**测试专用** leaf；只用本机交互方式解锁 CA 私钥，签发后按 `openssl verify -purpose sslclient`、证书 profile/有效期/指纹、文件 owner/mode 验收。向 Guest 仅投送签好的公钥证书及 CA 公钥证书，明确不携带 CA key、server key 或任何 client key。**LAB_ONLY TLS endpoint 必须没有 CAS writer**，正式 `InstallationAnchor` 仍缺失，`P1/CAS ENROLLMENT BLOCKED`。

## 2H. M01-B2 LAB_ONLY 客户端证书 Mac CA 签发回执（2026-10-24）

**OPERATOR_FIELD_RECEIPT / CLIENT_LEAF_CERT PASS_SCOPED / TWO_WAY_TLS_HANDSHAKE NOT_RUN。** 现场仅执行 Mac 实验根 CA 对先前经过双端 SHA256 交叉校验的公开 CSR 签发及证书静态验证；未接触/搬移 Ubuntu 私钥，没有监听、安装身份或 CAS 写入。

| 检查 | 现场结果 | 判定边界 |
| --- | --- | --- |
| CA 签发与用途验签 | `Signature ok`；`openssl verify -purpose sslclient …/client.pem` 输出 `client.pem: OK` | 本机证书链和 SSL 客户端用途符合预期；尚未真实握手 |
| Subject / Issuer | `/CN=SanQ-C3C3-LAB-ONLY-Recovery-01` / `/CN=SanQ-P2-C3C3-Experimental-CA` | 完全隔离的 LAB_ONLY 凭据；不是正式 InstallationAnchor |
| 序列号 | `44601F8916F41C943163C93F75FF65B1` | 已固定本轮测试证书序列号 |
| UTC 有效期 | `2026-10-24T22:50:49Z` ～ `2026-10-31T22:50:49Z` | 7 日短期证书；过期后必须 fail-closed，禁止忽略证书时钟 |
| X509 SHA256 指纹 | `D5:DF:B4:C1:3A:87:29:5F:1F:25:67:B6:7F:F6:5B:C5:93:04:5C:72:7A:08:D4:88:44:CC:CE:8B:C8:3B:DA:B7` | CLI Fingerprint 与公钥 DER 字节 SHA256 `d5dfb4c13a87295f1f2567b67ff65bc593045c727a08d48844ccce8bc83bdab7` 一致；**并非 PEM 文件字节 SHA** |
| X509 扩展 | `CA:FALSE` critical；`Digital Signature` critical；`TLS Web Client Authentication`；SKI 存在，AKI=`4E:C1:73:C0:78:5C:24:F8:6D:DD:21:BF:FA:38:0A:0D:63:A4:74:6F` 与实验 CA SKI 一致 | clientAuth 独立端实体，不是 CA / 服务器身份；实际 Mac LibreSSL client-cert chain/EKU 校验仍待握手 |
| 文件权限 | `P2-C3C3-CLIENT-ISSUE-001` `apple drwx------`；`client.csr/client-leaf.cnf/client.pem` 各 `apple -rw-------` | Mac 只持有签发材料与公钥证书；Ubuntu `client.key` 不离开 Guest |

**下一门禁 M01-B3**：仅经既有已验证 Host-only SSH（`StrictHostKeyChecking=yes`）将 Mac `client.pem`、CA `ca.pem` 两个**公开证书**送回 Recovery Guest **现有** `/home/ubuntu/sanq-c3c3-lab-tls-client-001/`，转送前核验两端文件不存在，转送后在 Guest 验 CA X509 指纹/客户端 DER SHA256、`openssl verify -purpose sslclient`，并**交互输入客户端密钥口令**验证 Guest 本地 `client.key` 公钥与签发的 `client.pem` 一致。不得复制 `ca.key`、`server.key`、`client.key`；不得输出私钥 PEM。完成这些只读验收后，另一步开始**无 CAS 的隔离 TLS 双向握手**，不使用原 `maintenance_mtls_hostonly_lab_service.py` 的 CAS endpoint。

`M01-B2 PASS_SCOPED / LAB_ONLY TLS-ONLY APPROVED / GUEST_CERT_DELIVERY_PENDING / REAL_MTLS NOT_RUN / FORMAL_ENROLLMENT_BLOCKED / P1 DENY / PRODUCTION NO-GO`。

## 2I. M01-B3 公开证书回传与 Guest 原生私钥匹配（操作者回执，2026-10-24）

**OPERATOR_FIELD_RECEIPT / GUEST_CLIENT_MATERIAL_READY_PASS_SCOPED / REAL_MTLS_HANDSHAKE NOT_RUN。** 已见 Mac → Recovery Guest `scp` 仅传输公开 `client.pem`（1554 bytes）和 `ca.pem`（1476 bytes），返回 `PUBLIC_CERT_TRANSFER_COMPLETED`；无 CA 或 client/server 私钥传输证据。

| Guest 核验 | 原始实测 | 有界结论 |
| --- | --- | --- |
| CA 和 client 链 | `openssl verify -CAfile ca.pem -purpose sslclient client.pem` → `client.pem: OK` | OpenSSL 3.0.2 下证书链和用途验签通过；不代表已完成 TLS 握手 |
| 客户端证书 DER SHA256 | `d5dfb4c13a87295f1f2567b67ff65bc593045c727a08d48844ccce8bc83bdab7` | 等于 Mac 证书签发回执指纹 |
| CA 证书 DER SHA256 | `40788f66c5eb4572f41d7b49019a87d9138d4f2676be1a9ca1a8ee6f90e449e8` | 等于 Mac 根 CA 指纹；**不要混淆 PEM 文件原字节哈希** |
| 原私钥与签发证书 | `Enter pass phrase for client.key` 后 `CLIENT_PRIVATE_KEY_MATCH=PASS；公钥 SHA256=`e32e01ada02811fd907f4f3299d8080c3fdbf0c3e10cc597a74d939663dbd991` | Guest 原 RSA 私钥所导出公钥与客户端证书匹配；没有暴露私钥字节 |
| Guest 权限 | `/home/ubuntu/sanq-c3c3-lab-tls-client-001` owner `ubuntu:ubuntu` / 0700；`client.key/client.pem/ca.pem` 全部 0600 | 独立实验身份权限 PASS_SCOPED |

**下一步 M01-B4（已批准 LAB_ONLY）**：在 Mac **非 root** 用户态仅临时运行无 CAS import、无持久存储、无业务 API、仅允许单次 TLS1.2 双向认证的独立 Python SSL 测试监听 `AF_INET 192.168.56.1:39443`。严格使用 `SSLContext(PROTOCOL_TLS_SERVER)`、`CERT_REQUIRED`、指定 CA、受限 `ECDHE-RSA-AES128/256-GCM` cipher，核验客户端 leaf DER SHA256；Recovery Guest Python 3.10 以 `PROTOCOL_TLS_CLIENT`、`check_hostname=True`、`server_hostname=192.168.56.1`、固定 CA/服务端 leaf 指纹连接。**双方实际输出 TLSv1.2/cipher/对端证书 SHA + 进程停监听后才可判 PASS**；仅本轮正例不代表缺客户端证书、错误 CA/SAN、吊销、时钟失效等负例已经 PASS。不能使用已合并的 `maintenance_mtls_hostonly_lab_service.py` CAS 服务来代替 TLS_ONLY 测试；绝不生成正式 `InstallationAnchor`、enrollment、DB 或 Docker 授权。

`M01-B3 PUBLIC_CERT_TRANSFER_AND_GUEST_KEY_MATCH PASS_SCOPED / LAB_ONLY_HANDSHAKE_READY / LIVE_MTLS NOT_RUN / FORMAL_ENROLLMENT_BLOCKED / P1 DENY / PRODUCTION NO-GO`。

## 2J. M01-B4 TLS_ONLY Mac ↔ Ubuntu 真实 mTLS 正例执行回执（2026-10-24）

**OPERATOR_LIVE_TWO_SIDED_TRANSCRIPT / POSITIVE_MTLS_HANDSHAKE PASS_SCOPED / NEGATIVE_TESTS NOT_RUN / CAS_NOT_USED**。操作者依用户授权的方案 B 在 Mac 非 root Python SSL 一次性测试端点 `192.168.56.1:39443` 和 Recovery Clone Guest Python 客户端手工执行真实网络握手。服务为仅一次连接且无 CAS/SQLite/Boot Guard 导入的临时进程，不是 `maintenance_mtls_hostonly_lab_service.py` 的 CAS endpoint。

| 双方证据 | 现场输出 | 限定验收 |
| --- | --- | --- |
| Mac 服务启动 | `LAB_ONLY_SERVER_READY 192.168.56.1:39443` | 实际绑定指定 Host-only IPv4；运行时已配置 `CERT_REQUIRED`、TLS1.2 上下限、指定实验 CA、ECDHE-RSA AES-GCM 白名单 |
| Mac 协商结果 | `SERVER_TLS_VERSION= TLSv1.2`；`SERVER_CIPHER= ECDHE-RSA-AES128-GCM-SHA256` | 真实 LibreSSL 2.8.3 TLS1.2 白名单协商成功 |
| Mac 验证客户端 | `VERIFIED_CLIENT_SHA256= d5dfb4c13a87295f1f2567b67ff65bc593045c727a08d48844ccce8bc83bdab7`；`SERVER_MTLS_PASS` | SSL server 经过 CA 链验证的 Guest leaf DER SHA256 与实验注册候选指纹一致 |
| Guest 协商结果 | `CLIENT_TLS_VERSION= TLSv1.2`；`CLIENT_CIPHER= ECDHE-RSA-AES128-GCM-SHA256` | OpenSSL 3.0.2 端 TLS1.2 与服务端结果匹配 |
| Guest 验证服务端 | `VERIFIED_SERVER_SHA256= 06b1d2f197565ab9b57222ff8317f2cb28e92e39dce671b9272855760800888d`；`CLIENT_MTLS_PASS` | `check_hostname=True` 和 `server_hostname=192.168.56.1` 的 IP SAN + CA 验证通过，并收到 `SANQ_LAB_ONLY_TLS_OK` |
| 进程与监听退出 | Mac `LAB_ONLY_SERVER_STOPPED`，随后 `lsof -nP -iTCP:39443 -sTCP:LISTEN` 无可见输出 | 一次性实验服务结束，端口无观察到的残留 LISTEN |

**正式判定**：本轮 `LAB_ONLY_MTLS_POSITIVE_PASS_SCOPED` 成立；**尚未**完成缺客户端证书、错误受信 CA、错误 IP SAN、坏 EKU、过期或撤销、session resumption 等真实拒绝用例，因此不能将 `LAB_ONLY_MTLS_COMPLETE` 标为 PASS。负例应继续使用完全**无 CAS** 的一次性监听，不得为方便排错关闭证书验证或改用 `CERT_NONE`。本试验没有检查生产守卫或授予 `OFF_HOST` 正式授权；Recovery Guest `InstallationAnchor` 仍缺失，CAS enrollment **BLOCKED**，`P1 DENY / P0-01 NOT_RUN / PRODUCTION NO-GO`。

## 2K. M01-B5 缺失客户端证书真实 TLS 负例（2026-10-24）

**OPERATOR_LIVE_BOTH_SIDES / MISSING_CLIENT_CERT_REJECTED PASS_SCOPED / NO_CAS / OTHER_NEGATIVES NOT_RUN**。Mac 使用相同已批准实验根 CA/服务器叶子证书、`SSLContext(PROTOCOL_TLS_SERVER)`、TLSv1.2 only、受限 ECDHE-RSA AES-GCM cipher、`CERT_REQUIRED`，一次性 Host-only 端点 `192.168.56.1:39443`。Recovery Guest SSL 客户端仍验证服务器 CA/IP SAN，但**有意不加载 `client.pem/client.key`**。

| 双端结果 | 原始证据 | 判定 |
| --- | --- | --- |
| Mac 监听进入 | `NEGATIVE_SERVER_READY` | 临时端点实际已监听 |
| Mac 拒绝握手 | `SERVER_HANDSHAKE_REJECTED`；`[SSL: PEER_DID_NOT_RETURN_A_CERTIFICATE] peer did not return a certificate (_ssl.c:1108)` | 服务端拒绝无客户端证书的握手，未进入成功 SSL 会话 |
| Ubuntu 观察 | `CLIENT_OBSERVED_TLS_REJECTION`；`[SSL: SSLV3_ALERT_HANDSHAKE_FAILURE] sslv3 alert handshake failure (_ssl.c:1007)` | 收到服务端拒绝握手的 TLS Alert；`SSLV3_ALERT` 是历史错误名称，**不是 SSLv3 降级证据** |
| Mac 一次性服务退出 | `NEGATIVE_SERVER_STOPPED` | 服务进程正常走完测试代码；此次 **未收到独立 `lsof` 退出后快照**，不能声称已再次观测端口无占用 |
| 数据/权限边界 | 本次只有证书验证代码，无 CAS 客户端、writer、`InstallationAnchor`、enrollment 或 Docker 操作 | 保持 `P1 DENY / FORMAL_ENROLLMENT BLOCKED` |

**限定判定**：`M01-B5 MISSING_CLIENT_CERT_REJECTED PASS_SCOPED`。需进一步针对错误受信 CA、错误 IP SAN（可用正确服务器证书但强制错误 `server_hostname`）做互相独立的无 CAS 真实负例，并核对相应 Mac 单次监听停止后端口状态；不能把错误 CA 客户端自检失败或握手前本地配置拒绝冒称服务端证书拒绝。**不应以 `verify_mode=CERT_NONE`、降低 TLS 或更改默认 Host-only 绑定绕过测试失败。**

## 2L. M01-B6 未受信任 CA 的真实握手拒绝（操作者回执，2026-10-24）

**OPERATOR_LIVE_BOTH_SIDES / WRONG_CA_REJECTED PASS_SCOPED / TLS_ONLY / NO_CAS**。Mac 仍运行单次非 CAS Host-only TLS server（`192.168.56.1:39443`），Ubuntu 的 client 仍提供已签发的正常 `client.pem/client.key`，但将信任源改为系统默认 CA 集合，不加载实验 CA；客户端之前的本地检查证实 SanQ 实验 CA 不在该信任集中，避免产生错误“被信任”的原因混淆。

| 检查项 | 操作者终端回执 | 安全判定 |
| --- | --- | --- |
| Mac server | `WRONG_CA_SERVER_READY` | 实际一次性端点进入监听 |
| Ubuntu client | `CLIENT_CA_VERIFICATION_REJECTED`; `VERIFY_CODE=19`; `VERIFY_MESSAGE=self-signed certificate in certificate chain` | 独立 OpenSSL3.0.2 服务端证书链验证失败；错误码 19 是证书信任链拒绝，非 Host-only 连通性故障 |
| Mac TLS Alert | `SERVER_HANDSHAKE_FAILED= [SSL: TLSV1_ALERT_UNKNOWN_CA] tlsv1 alert unknown ca (_ssl.c:1108)` | 服务端观察到客户端因未知 CA 终止握手；错误名称不表示 TLS 协议降级 |
| Mac 退出 | `WRONG_CA_SERVER_STOPPED` | 本次单连接服务正常退出；**没有本次独立 `lsof` 快照**，故不另称端口空闲已检查 |
| 其它合同 | 未使用 CAS writer、InstallationAnchor、enrollment、生产服务或 Docker | 仍是 LAB_ONLY 纯 TLS 负例，未增加 Guard 放行能力 |

**本次判定**：`M01-B6 WRONG_TRUST_CA_REJECTED PASS_SCOPED`。累计 `M01-B4 POSITIVE PASS`、`M01-B5 MISSING_CLIENT_CERT REJECTED PASS`、`M01-B6 WRONG_CA REJECTED PASS`。尚需独立 `M01-B7 WRONG_SERVER_IP_SAN` 用例，固定**正确的实验 CA 与合法客户端证书**，仅令客户端 `server_hostname` 为不在已签 server leaf SAN 中的地址，预期 OpenSSL hostname verification 拒绝（通常 `VERIFY_CODE=64`，以现场错误为准），而不是通过无 CA 或无客户端证书间接失败。服务端只运行一次性非 CAS 端点；不得关闭 IP 核验、降级 TLS、变更服务端 SAN/密钥来人为制造测试 PASS。

## 2M. M01-B7 错误服务器 IP SAN 真实负例 + 四项核心结果（2026-10-24）

**OPERATOR_LIVE_BOTH_SIDES / WRONG_IP_SAN_REJECTED PASS_SCOPED / CORE_TLS_4_OF_4_PASS_SCOPED / NO_CAS**。单次运行的非 CAS Mac TLS 端点保持已签发 server leaf `IP SAN:192.168.56.1`、正确的实验 CA 和 `CERT_REQUIRED`，Ubuntu 保留该 CA 及合法 client leaf，仅将 `server_hostname` 从实际连接 IP `192.168.56.1` 故意设为 `192.168.56.254`，检验证书内 IP SAN 与期待服务器身份不一致后的拒绝。

| 验收项 | 操作者回执 | 判定 |
| --- | --- | --- |
| Mac 测试监听 | `WRONG_IP_SAN_SERVER_READY` | 单次 TLS_ONLY 服务进入监听 |
| Ubuntu 证书身份验证 | `CLIENT_IP_SAN_VERIFICATION_REJECTED`；`VERIFY_CODE=64`；`VERIFY_MESSAGE=IP address mismatch, certificate is not valid for '192.168.56.254'.` | 明确证实服务端身份/IP SAN 校验失败，与 CA 受信与否或客户端缺证书无关 |
| Mac TLS alert | `SERVER_HANDSHAKE_FAILED= [SSL: SSLV3_ALERT_BAD_CERTIFICATE] sslv3 alert bad certificate (_ssl.c:1108)` | 服务端观察到证书拒绝引发的警报；错误历史命名**不能解释为协商 SSLv3** |
| Mac 单次服务退出 | `WRONG_IP_SAN_SERVER_STOPPED` | 处理结束；本次未收到退出后的独立 `lsof` 快照，端口状态应额外只读核验 |

**已通过的核心范围**：`M01-B4` 正常 Mac↔Guest 双向 TLS1.2 + 正确 CA、证书叶子指纹、IP SAN、`ECDHE-RSA-AES128-GCM-SHA256`：PASS；`M01-B5` 无 client cert → server `PEER_DID_NOT_RETURN_A_CERTIFICATE`：REJECTED/PASS；`M01-B6` 未受信 CA → client X509 code 19：REJECTED/PASS；`M01-B7` 错误 server IP SAN → client X509 code 64：REJECTED/PASS。四项均为操作者双机真实回执，不是单元模拟；但只验证**临时无 CAS 的实验 TLS 端点**，并不能推论 `maintenance_mtls_hostonly_lab_service.py` 与真实 SQLite writer 已部署或完整验收。

**剩余门禁**：独立 `lsof -nP -iTCP:39443 -sTCP:LISTEN` 最新停止后快照尚未提供；错 EKU、过期/未生效、CRL/登记撤销、session resumption、错误客户端身份/role、CAS 请求和失败恢复均 **NOT_RUN**。客户端证书在 `2026-10-31T22:50:49Z` 失效，Mac server leaf 在 `2026-11-07T22:35:28Z` 失效，CA 在 `2026-11-23T22:32:19Z` 失效；后续不得关闭证书过期检查。Recovery Guest 正式 `InstallationAnchor` 仍 `NOT_PRESENT`，不准从 LAB_ONLY 证书提升权限。状态限定为 `LAB_ONLY_MTLS_CORE_PASS_SCOPED / FULL_NEGATIVE_MATRIX_OPEN / FORMAL_ENROLLMENT_BLOCKED / P1 DENY / P0-01 NOT_RUN / PRODUCTION NO-GO`。

## 2N. M01-B7 结束后 Mac 监听端口只读检查与 LAB_ONLY 核心关闭（2026-10-24）

**OPERATOR_FIELD_RECEIPT / POST_TEST_LSOF_EMPTY PASS_SCOPED / LAB_ONLY_MTLS_CORE CLOSED。** 继 §2M 的错误 IP SAN 拒绝及 `WRONG_IP_SAN_SERVER_STOPPED` 后，操作者在 Mac Terminal 执行 `/usr/sbin/lsof -nP -iTCP:39443 -sTCP:LISTEN` 并反馈**无输出**。这证明当次非 root 可见的检查快照中，没有观察到 39443 端口的 TCP LISTEN 占用；不等于永久端口保留、完整 OS 进程列表证明，也不补称先前每轮单独执行过 `lsof`。

**关闭依据**：M01-B4 实际 TLSv1.2/ECDHE-RSA-AES128-GCM-SHA256 双向正向握手 + 公钥指纹/正确 IP SAN PASS；M01-B5 缺客户端证书拒绝 PASS；M01-B6 不受信任 CA 拒绝（verify 19）PASS；M01-B7 错误服务器 IP SAN 拒绝（verify 64）PASS；B7 后 Mac 端口无可见监听。仅授权范围内 `LAB_ONLY_MTLS_CORE_CLOSED / PASS_SCOPED`；M01-B2/B3 的材料交叉核验亦完成。

**明确 OPEN**：bad EKU、过期/未生效、撤销/CRL、session resumption、证书/CA 轮转的真实负例未覆盖；此结果**不验证真正的** `maintenance_mtls_hostonly_lab_service.py`、`enrollment.json`、SQLite CAS、role/identity pin 或 Boot Guard 安装。Recovery Guest `/etc/sanq-maintenance/installation-anchor.json` 仍无正式受信材料；`FULL_NEGATIVE_MATRIX_OPEN / FORMAL_CAS_ENROLLMENT_BLOCKED / P1 DENY / P0-01 NOT_RUN / PRODUCTION NO-GO`。

本次仅追加本地中文审计证据，**不创建提交/PR，不触碰私钥、Guest、Mac、Docker 或生产环境**。

## 3. 真正发证与运行前必须审阅的 Mac 操作清单

**本节为原始 M00–M06 实施计划（历史基线）**，现场已完成的仅是 §2B–§2N 中无 CAS 的 CA/证书签发及 TLS-only 验收；实际 CAS 服务、enrollment、SQLite 和正式 Guard 未运行。私钥与口令不得提交仓库。

| 阶段 | 执行对象与可审阅产物 | 准入与撤回 |
| --- | --- | --- |
| M00 | Mac Host 再次只读核对 Recovery Clone UUID、原 Jammy VM poweroff、`bridge100` IPv4、Port 39443 监听者与 Mac `openssl version`；Guest 只读核对 `hostname / ip / TLS` | 发现 VM/端口/网络差异 `BLOCKED`；不修改现有 `rapportd`、PostgreSQL |
| M01 | **在 Mac 本地**、独立于联网服务目录的 0700 管理位置签发一套**仅合成实验使用、短期有效**的 RSA3072 / SHA256 CA 私钥和自签 CA 证书；单独签发 `serverAuth` (IP SAN=192.168.56.1) 和 `clientAuth` leaf；CA 私钥保留在离线管理位置，不驻留运行服务目录 | 任何 Keychain/账户或目录创建都先由操作者确认准确目标；证书/密钥绝不提交仓库、聊天或 CI。生成后用 `openssl x509 -text -noout` 与 `sha256` 只读核查 |
| M02 | 单独新建 `P2-C3C3-001` 0700 私有目录；仅投送运行所需 `server.pem/server.key/ca.pem` 与 canonical `enrollment.json`；各文件 0600。Guest 私钥仅经另授权、经确认的 Recovery Clone 可信渠道投送，不进入原 VM | 不迁移/覆盖 `P2-C3B-001`。MAC 私有数据、Guest root/systemd 权限均不能由代码默认取得 |
| M03 | 准确受信 `InstallationAnchor` / host/install/client identity + 注册证书 DER SHA / CA PEM SHA 绑定后，**独立手动执行** `initialize_offline_lab` 创建这次新 SQLite，读回原始数据库 owner/mode/epoch | 若缺真实 anchor 来源、已有同名文件、hash、角色不可信即停；不自动自登记、不生成虚构 Host pin |
| M04 | 用**经 CI 验证且固定 SHA 的源代码副本**在 Mac 非 root Terminal 手工调用服务（不依赖 launchd），先验证证书/TLS 参数加载后，才在批准的 `192.168.56.1:39443` 上监听 | 如 LibreSSL 拒绝 TLS1.2、密码套件、CA/证书或权限，**fail closed**；不放宽到 TLS1.0、`CERT_NONE` 或 wildcard |
| M05 | 在准确 Recovery Clone 的普通用户上，用独立批准的 mTLS 客户端做真实 IP SAN/证书链/ClientAuth/EKU、`HEAD_READ / CAS_SUBMIT / COMMIT_LOOKUP` 正例，及错证书/错安装/断线后未知提交、证书撤销等负例 | 证书/文件生成、Host-only 真实监听、Guest 凭证写入及实验执行**尚未发生**；测试失败后服务停止，保全 SQLite/WAL/log/证书 fingerprint |
| M06 | 手工中止非 root 服务，观察 Port 39443 无残存监听，保留失败现场与准确原本文件 SHA；撤回签发证书/吊销独立 Guest 角色；不触碰 Docker | 出事故不得自动删 DB、重启服务、重置 epoch、恢复旧证书或解除 Guard 冻结 |

### 运行入口（**仅供后续批准的 Mac Operator，当前禁止实际执行**）

由于 `-I` 可能移除 Python 本地源码目录导入路径，后续可用 Mac 系统 Python 的 `-E -S -B` 配合**固定、已验证的源码绝对路径**，禁止不可信 site-packages 和 `PYTHONPATH` 注入。五个路径参数必须是后续审批的真实私有绝对路径，不填占位符执行：

```text
/usr/bin/python3 -E -S -B <reviewed-absolute-path>/ops/runtime/maintenance_mtls_hostonly_lab_service.py \
  --enrollment-file <private-approved-enrollment-json> \
  --ca-file <private-approved-ca-public-pem> \
  --server-cert <private-approved-server-public-pem> \
  --server-key <private-approved-server-private-key> \
  --db-file <private-approved-C3C3-001-sqlite>
```

**密钥不要经 ChatGPT/MCP 传递，证书/登记指纹可发**。当前还需要决定 RSA3072 与本机 `openssl` 命令行兼容的 `openssl.cnf` profile、Host/Guest 非 root 数据目录、独立证书撤销登记位置及安全拷贝方式；这些必须在实际 M01/M02 前冻结。临时提高宿主用户权限、打开防火墙、修改 `launchd` 或启动 Docker 属新执行边界，本轮一概不实施。

## 4. 必须明确保留的缺口

1. 操作者真实验证的是独立无 CAS 临时 TLS-only 端点，而不是 `maintenance_mtls_hostonly_lab_service.py` 的实际 CAS 监听、enrollment 或 SQLite writer；助手没有直接访问用户 Mac/Guest。
2. Mac LibreSSL 2.8.3 ↔ Guest OpenSSL 3.0.2 已实测 TLS1.2、ECDHE-RSA-AES128-GCM-SHA256 和三项拒绝负例；错误 EKU、过期/未生效、CRL/撤销、session resumption 仍 NOT_RUN。
3. 证书签发/唯一身份的链下审批、真正 trusted peer 产生、客户端安装、失败持续性审计仍需落地；由系统同一 Mac UID 控制的 CA/状态目录**无法抗本机完全可信账户恶意篡改或物理整机回滚**。新服务只在已验证 TLS socket 下调用原 CAS，纯 Python 内部可构造的 `dispatch_authenticated_lab()` 函数不是不可伪造的操作系统安全边界。
4. 缺少 C3C4 真实 Guest mTLS client / 端到端正反用例、systemd 249 Service/Socket Guard、直接 dockerd + 存活 shim writer 限制、ARMING TOCTOU、G06 救援/S09 AWS 首启；生产仍 `NO-GO`。
5. 操作者已在 Mac/Guest 受限目录生成实验公私钥；仓库只保存非秘密指纹和验收回执，不包含任何私钥、口令或证书文件。

## 5. 本地退出及下批提议

`IMPLEMENT-A PR#2934 CI#7520 MERGED / LAB_ONLY_MTLS_CORE_CLOSED PASS_SCOPED 4_OF_4 / POST_TEST_39443_NO_VISIBLE_LISTENER / FULL_NEGATIVE_MATRIX_OPEN / FORMAL_ANCHOR_NOT_PRESENT / CAS_NOT_RUN / P1_DENY / P0-01_NOT_RUN / PRODUCTION NO-GO`。

原 IMPLEMENT-A 源码已通过 PR #2934 / CI #7520 合并。本次仅同步操作者现场证据；下一步先只读审计 EKU、过期/未生效、撤销和 session resumption 扩展负例。真正 CAS 仍需正式受信身份门禁。

## 6. M01-B9 扩展安全负例证据收口与后续撤销决策（最新快照）

> **2026-10-24～25 操作者双端回执；B9 只读仓库基线 `dev@814c14898ce01f915c345af7426de95b3c753bb5`。** 本节是 **B8 实测完成之后的最新阶段结论**，覆盖上述较早 M01-B7 时点的 `FULL_NEGATIVE_MATRIX_OPEN` 和 `bad EKU / expiry / CRL / session NOT_RUN` 历史表述，**不篡改历史回执**。详见 [M01-B9 安全证据收口与双层撤销候选决策](Runtime更新-R2-A2-3-P2-C3C3-M01-B9安全证据收口与双层撤销候选决策.md)。

| 已完成的范围 | 关键证据 | 结论 |
| --- | --- | --- |
| M01-B4～B7 | TLSv1.2 + AES-GCM 正向双向握手；缺 client cert、CA 错 code19、IP SAN 错 code64 拒绝 | `CORE_TLS_PASS_SCOPED` |
| M01-B8-1 | 正确 CA / 公钥但 serverAuth-only 错 EKU：离线 error26；Ubuntu `unsupported_certificate` Alert43；Mac `NO_CERTIFICATE_RETURNED` | `BAD_EKU_DENIED_PASS_SCOPED`；Mac 内部精确拒绝步骤未证明 |
| M01-B8-2 | 指定时点离线 notYetValid error9、有效控制 OK、expired error10；真实过期服务器证书 Guest verify_code10、Mac certificate_expired alert | `TIME_OFFLINE_AND_EXPIRED_LIVE_PASS_SCOPED` |
| M01-B8-3 | CRL 加载计数 `crl=1`、静态 revoked error23；原客户端握手成功，撤销测试客户端收到 certificate_revoked Alert；Mac `NO_CERTIFICATE_RETURNED` | `CRL_LAB_DENIAL_PASS_SCOPED`；不是仓库实际服务的 CRL 防护证明 |
| M01-B8-4 | `OP_NO_TICKET` 可配置、两次认证握手成功；双端第二次 `session_reused=False`，server `hits=0` | `SESSION_REUSE_NOT_OBSERVED_PASS_SCOPED`；非所有恢复路径永不复用证明 |
| M01-B8 最终端口 | Mac `lsof -nP -iTCP:39443 -sTCP:LISTEN` 无输出 | 停止后的该次检查快照未观察到监听 |

**安全实现审阅差距：** 仓库 `maintenance_mtls_hostonly_lab_service.py::tls_context()` 设置 TLS1.2、`CERT_REQUIRED`、指定 CA 和 `OP_NO_TICKET`，但**没有**加载 CRL，也**没有**启用 `VERIFY_CRL_CHECK_LEAF`；14 项离线单元测试中的 SSLContext mock 及 `revoked=true` 逻辑负例不能替代真实 CAS 服务。该服务在握手后读取 enrollment 并检查 identity/role/anchor/pin，**尚未验证撤销与正在执行的 CAS COMMIT 之间无竞态**。正式 `InstallationAnchor` 仍缺失，真实 `serve_manually`、enrollment、SQLite CAS、C3C4 客户端、P1/Guard 均未执行。

**选定的后续优先方案：Option B — Enrollment + X.509 CRL 双层撤销。** 本次用户批准的是**文档上的实施方向**，不代表批准 CRL 权威/维护机制、代码改动、创建正式身份或真实 CAS 执行。下一批需单独冻结：受信 Anchor 来源，完整 CRL 总账的 owner/签发/轮换/原子交付与 fail-closed，enrollment 的 role/pin/撤销语义，已建立连接及 SQLite 提交的撤销线性化，DER 指纹与 PEM 文件哈希边界，然后评审代码影响、替代方案并单独申请实施授权。B8 测试 CRL 只含局部证书撤销，`nextUpdate=2026-10-26T00:04:02Z`，禁止直接用于正式 CAS。

**退出状态：`M01-B9 AUDIT_DOC_CLOSED_LOCAL / M01-B4_TO_B8_TLS_EXPERIMENT_PASS_SCOPED / OPTION_B_PREFERRED_NOT_IMPLEMENTED / FORMAL_CAS_ENROLLMENT_BLOCKED / CAS_NOT_RUN / P1_DENY / P0-01_NOT_RUN / PRODUCTION_NO-GO`。** 本次只同步文档，不授权私钥/CA 操作、网络服务、SQLite、Docker、VM/AWS 或生产变更。
