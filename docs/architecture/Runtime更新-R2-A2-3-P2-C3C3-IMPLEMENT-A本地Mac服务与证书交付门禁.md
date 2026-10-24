# R2-A2-3 — P2-C3C3-IMPLEMENT-A Mac Host-only mTLS 服务候选及证书交付门禁

> **2026-10-24 / REMOTE FEATURE PR REVIEW / LIVE CERTS & MAC SERVICE NOT_RUN / PRODUCTION NO-GO**。设计依据已合并 `dev@a8898a90a4d71fec1d2bba871b63b70dbb86268c`（PR #2932 / CI #7515）。远端代码交付已另从最新 `dev` 建立独立功能分支 `feat/runtime-p2c3c3-implement-a-mtls-hostonly-20261024`，仅移植本批 2 个代码文件与本实施文档，不包含旧 MCP-workspace 中的并行 C1 文档或未授权改动；**新代码的 CI 结果以该 PR 最终 Actions 为准**。

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

## 3. 真正发证与运行前必须审阅的 Mac 操作清单

**目前没有在 Mac/Guest 执行以下任何一步。** 用户如批准真实操作，应由其在 Mac Terminal/Guest Console 精确执行，先根据本机当前 `openssl version` / `/usr/bin/python3` / 可信 VM UUID 结果确认发行版和命令兼容性，**切勿把私钥内容或带密码命令输出粘贴到聊天或 Git**。

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

1. 这是**Mac 服务源码候选**，不是完成的 Mac 安装；当前工具无法连接用户 Mac Terminal、Guest SSH/Console，故没有证书、真实 SSLContext 加载/握手、端口或 CAS 联网验收回执。
2. Mac Catalina Python 3.8 / LibreSSL 2.8.3 是老旧实验环境，仅从 14/14 套件名交集推导 TLS1.2 **可能**兼容；证书 EKU/IP SAN/CRL、TLS session resumption/撤销即时性、实际 TLS version/cipher 仍待负例。
3. 证书签发/唯一身份的链下审批、真正 trusted peer 产生、客户端安装、失败持续性审计仍需落地；由系统同一 Mac UID 控制的 CA/状态目录**无法抗本机完全可信账户恶意篡改或物理整机回滚**。新服务只在已验证 TLS socket 下调用原 CAS，纯 Python 内部可构造的 `dispatch_authenticated_lab()` 函数不是不可伪造的操作系统安全边界。
4. 缺少 C3C4 真实 Guest mTLS client / 端到端正反用例、systemd 249 Service/Socket Guard、直接 dockerd + 存活 shim writer 限制、ARMING TOCTOU、G06 救援/S09 AWS 首启；生产仍 `NO-GO`。
5. 默认不创建 GPG、PKCS#12/PEM/密钥或认证配置文件；这样可以保证远端 PR/CI 无 secret 泄露。**源码审阅通过及 CI 绿之后**再以准确 Mac/Guest 受控实验处理真实私钥与端口。

## 5. 本地退出及下批提议

`DESIGN-B MERGED / C3C3-IMPLEMENT-A SOURCE_WRITTEN_LOCAL / TESTS_NOT_RUN / MAC_CERTS_NOT_ISSUED / MAC_TLS_LISTENER_NOT_STARTED / GUEST_NOT_TOUCHED / P1_DENY / P0-01_NOT_RUN / PRODUCTION_NO-GO`。

用户已明确批准此批远端提交；已以最新 `dev` 独立 feature 分支交付 2 个代码文件/1 份中文文档，待最终 Actions CI 绿后合并。CI 通过后，再逐项申请 Mac M00（只读）→ M01–M03（证书/私有目录/数据库）→ M04–M06（手工监听/Guest 客户端/撤回）的准确实际操作，绝不能宣称 CI 等于真实 mTLS PASS。