# R2-A2-3 — P2-C3C3-READ Mac/Guest TLS 与 Host-only 实验服务就绪审计

> **2026-10-24（America/Toronto）｜REPOSITORY REVIEW + OPERATOR TLS/SSLCTX FIELD RECEIPT PASS_SCOPED / MAC CIPHER METADATA UNRESOLVED / HANDSHAKE NOT_TESTED / C3C3 SERVICE NOT_AUTHORIZED / LOCAL DOCUMENTS ONLY / PRODUCTION NO-GO。** 以 `dev@08e5031cd9f8727e4bbe69cf18e86cf71367bedb`（PR #2929 / CI #7508 SUCCESS）为源码基线。此文依据仓库以及操作者在本对话**最新提交**的 Mac/Recovery Clone Terminal 只读回执；助手没有远程连接 Mac/Guest，没有创建证书、打开新监听、安装服务或修改生产。

## 1. 适用规范与当前权威

- 审阅根 `AGENTS.md`、`.github/workflows/ci.yml` 的 Runtime `ops-checks` 约束、[R0 冻结设计](Runtime更新-R0冻结设计.md)、[C3C1 信任边界](Runtime更新-R2-A2-3-P2-C3C1最小认证离机CAS信任边界设计.md)、[C3C2 合同](Runtime更新-R2-A2-3-P2-C3C2离线认证身份与Wire合同实施记录.md)、[C3B Mac 进程级回执](Runtime更新-R2-A2-3-P2-C3B-001Mac进程持久化实测复核.md) 与 [VB-04C 启动边界](Runtime更新-R2-A2-3-VB-04C启动守卫安装依赖与撤回设计.md)。
- C3C2 新 `ops/runtime/maintenance_off_host_auth_wire.py` 是**合成输入**的严格 JSON/角色/peer fingerprint 静态验证；`SyntheticPeerEvidence` 不等于经 TLS 验证身份，`assess_offline_binding` 始终 `decision=DENY`，`authorized_to_execute_cas=False`、`authenticated_off_host=False`、`authorized_to_start_docker=False`。真实认证的独立适配器尚不存在；P1 `CustodyReceipt` 没有签名/认证；C3A SQLite 仍只接受调用方自报 `client_identity`，其回执 `UNAUTHENTICATED_OFFLINE_LAB_ONLY`。
- 最新既有现场事实：Mac Catalina `10.15.8`、系统 `/usr/bin/python3` 3.8.2/SQLite 3.28.0、Host-only `bridge100`/网关 `192.168.56.1`；Ubuntu Recovery Clone `192.168.56.5/24`、UID1000、Linux 5.15/systemd 249、NIC1 Host-only、其余 none、原 Jammy VM poweroff。**TLS 运行库、证书验证设置、IPv6、当前端口/用户和实时网络隔离尚未本批核查，不得用先前时间点代替现场新证据。**
- 外部对照：Python 3.8 `ssl` API 支持客户端 `PROTOCOL_TLS_CLIENT` 的证书验证/hostname check，与服务端 `CERT_REQUIRED` 检查客户端证书；**API 文档不能证明当前系统 Python 动态链接的具体 SSL/TLS、SAN/IP、CRL、密码套件可用。** Python 标准文档 `https://docs.python.org/3.8/library/ssl.html`（如 3.8 页面不可达，需用官方 Python `ssl` 文档核对旧版支持差异）。服务端证书的 IP SAN、客户端 leaf EKU、CRL/撤销依赖实际 TLS 后端；不能仅校验签名链或 `CN`。

## 2. 当前审计判定

| 事项 | 已知与未证事实 | 门禁 |
| --- | --- | --- |
| C3C2 源码 + CI | PR #2929/CI #7508 SUCCESS，合并后 `dev@08e5031c`；仍 synthetic/DENY | `OFFLINE CONTRACT PASS / ACTUAL TLS NOT TESTED` |
| Mac TLS/SSL 后端 | 现场 Python 3.8.2 / LibreSSL 2.8.3；`HAS_TLSv1_2=True`、`HAS_TLSv1_3=False`；Client/Server API 和 CRL 常量存在；**未验证实际握手、IP SAN 与 CRL 运行行为** | `TLS12_CAPABILITY_PASS_SCOPED / HANDSHAKE_UNKNOWN` |
| Guest TLS/SSL 后端 | 现场 Python 3.10.12 / OpenSSL 3.0.2；`HAS_TLSv1_2=True`、`HAS_TLSv1_3=True`，`openssl version` 与 Python SSL 后端一致；**未测 ClientContext/验签行为** | `TLS12_CAPABILITY_PASS_SCOPED / HANDSHAKE_UNKNOWN` |
| Host-only 单独监听 | 新回执确认 Mac `bridge100` active、`192.168.56.1/24` 和 IPv6 link-local；Guest `192.168.56.5/24` 且 IPv4/IPv6 默认路由未输出；非 root `lsof` 见 rapportd wildcard TCP 49472 和 PostgreSQL loopback TCP 5432；Mac PF/ALF/转发未核验，**未选定 CAS 端口** | `ADDRESS_READ_PASS_SCOPED / BIND_NOT_AUTHORIZED` |
| 证书与角色 | 无实验 CA、server keypair、客户端 keypair、预登记/吊销/证书用途/时钟计划 | `DESIGN ONLY` |
| 低权服务与存储 | 原 C3B Mac 用户私有 DB 是保全原件；无新实验目录、账户与权限审阅结果 | `DO NOT REUSE C3B DB` |
| 抗回滚/启动互斥 | Mac/Guest 同一物理机；HEAD_READ→Docker start 仍有 TOCTOU、P1 Guard 持续 DENY | `CANNOT PROMOTE TO OFF_HOST_PRODUCTION OR BOOT_ALLOW` |

## 2A. 2026-10-24 操作者现场读回验收增记（覆盖上文初始待取证状态）

证据等级为 **OPERATOR-PASTED TERMINAL TRANSCRIPT / READ_ONLY / PASS_SCOPED**，未形成独立签署的 Host/Guest 收据、TLS 握手数据或证书验证证据。用户仅粘贴了输出，不代表 MCP 控制过 Mac/Guest。

| 检查 | 原样重要回执 | 可得结论 |
| --- | --- | --- |
| Mac SSL | `Python: 3.8.2`；`SSL: LibreSSL 2.8.3`；`TLS1.2: True`；`TLS1.3: False` | 双端协议共同交集**候选仅 TLS 1.2**；不要求为实验单独升级 Mac，但该老旧 LibreSSL/Python 不得晋级生产权威 |
| Mac SSL 功能存在性 | `TLS Client: True`，`TLS Server: True`，`CRL Support: True` | 只代表 API 常量存在；未检查 context 的真实 `CERT_REQUIRED`/`check_hostname`、最小版本策略、证书 IP SAN/EKU/CRL 或真实 cipher |
| Guest SSL | `Python: 3.10.12`；`SSL: OpenSSL 3.0.2 15 Mar 2022`；TLS1.2/1.3 都 True；CLI `openssl version` 为同一 OpenSSL 3.0.2 | Guest 与 Mac 可能以 TLS1.2 协商；跨 LibreSSL/OpenSSL 的证书/密码套件实际握手仍未证 |
| Mac IPv4 | `bridge100 UP/RUNNING`，`inet 192.168.56.1` / `255.255.255.0` | 适合作为实验**候选的**单一绑定 IPv4；未建立服务监听 |
| Mac IPv6 | `bridge100` 还有 `fe80::…%bridge100` 链路本地 IPv6 | 不能以 Host-only/Guest 无默认路由推导无 IPv6；服务须显式 IPv4 bind、拒绝 fallback 到 wildcard 或 IPv6 |
| Guest IPv4/路由 | `enp0s3 inet 192.168.56.5/24`；`ip -4 route show default` 和 `ip -6 route show default` 无输出 | 没观察到 IPv4/IPv6 默认路由，非完整 ACL/路由隔离安全审计 |
| Mac 监听 | `rapportd` TCP wildcard IPv4/IPv6 49472；`postgres` 只在 loopback IPv4/IPv6 5432 监听 | 不使用 49472，不改 Postgres；非 root `lsof` 只是一时可见进程快照，不证明任意其他端口永远空闲 |
| 第一次现场读回后仍未提供的项目（历史时点） | 当时缺 Mac 旧证据目录 `stat`、`SSLContext` 默认验证值/最低版本、cipher 清单 | **后续第二次回执已补部分信息，详见 §2B**；不得继续视为最新待取证状态 |

本阶段更新为：`HOST_ONLY_ADDRESS_PASS_SCOPED / TLS12_CAPABILITY_PASS_SCOPED / REAL_MTLS_UNKNOWN / AUTHENTICATED_CAS_NOT_RUN`。**严格限定**：TLSv1.2=True 只证明编译后 SSL 后端报告支持，实际握手还可能因共同 cipher、证书用途、IP SAN、时钟、信任根、LibreSSL 功能限制而失败。LibreSSL 2.8.3 与 Ubuntu OpenSSL 3.0.2 跨版本兼容需在未来经过单独授权的 C3C3/C3C4 负例实测；目前不据此修改 TLS 系统组件。

### 2A.1 候选冻结与不得跨越的权限

- **协议候选**：实验 `TLS 1.2 ONLY`（暂不将 TLS 1.3 列为 Mac 兼容必要条件）；证书+cipher 选型仍待上下文验证、IP SAN 与 ClientAuth EKU 真实回执，必须禁用 TLS1.0/1.1、SSL 和弱套件，TLS1.2 下不能允许没有相互验证的匿名/NULL cipher。
- **绑定候选**：Mac `192.168.56.1` 单独 IPv4；端口仍未确定，`49472` 明确排除，不能通过检测到 `lsof` 没有其它监听就自动开启或自动挑端口。Guest 测试目标只能为已核验 `192.168.56.5` 的已核验 Recovery Clone。
- **角色与存储**：维持 C3C2 的 `SyntheticPeerEvidence` 永远 DENY；真实服务层须从 mTLS 验证后的连接身份派生证据，不能把自报 cert hash 转换成可信凭据。证书、低权账户与新私有 SQLite 实验目录未实现；C3B-001 目录只读保全。
- **安全边界**：Mac 和 Guest 处同一台物理机，**无异地抗整机回滚**；不提供 `ALLOW_DOCKER_START`，也不解决 Boot Guard HEAD_READ→ARMING TOCTOU。
- **下一审计门禁（第一次回执后的历史建议）**：Mac/Guest `SSLContext` 与旧目录元数据随后已由操作者再次读回；**Mac 按 `protocol == TLSv1.2` 筛选为零并不能确定共同 cipher 为空**。下一步需查看 Mac `ctx.get_ciphers()` 的实际条目数、各 `protocol` 元数据和值以及与 Guest 已输出的 14 个 TLS1.2 套件**按名称**交集，仍不能替代真实握手和证书验证。真实监听与发证仍需单独授权。

### 2A.2 下一批最小只读补证（未执行）

在此前已经验证的 Mac 用户 Terminal 上，仅执行 `/usr/bin/python3 -I -S -B` 构造 `ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)`，打印客户端 `verify_mode`、`check_hostname`、`minimum_version` / `maximum_version` 是否存在、`get_ciphers()` 中 TLSv1.2 的 cipher **名称集合**；再用 `stat -f '%Su %Sp %N'` 读旧 C3B-001 **目录** owner/mode，不读取数据库/WAL。Guest 普通用户仅执行 Python `ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)` 的相同属性/候选 cipher 名称检查。没有实体证书、信任根或密钥，**不做实际 TLS 握手**，因此仍不能升级为 `mTLS PASS`。

以上旧文命令可复用；不准额外执行 `openssl req`、`openssl genpkey`、`keytool`、安装任何 `certbot`、启动服务或 `sudo`。后续选定服务端证书 IP SAN、受限 TLS1.2 cipher、专用端口及 CRL 策略前，必须审查两端交集；没有可接受 cipher 则实验服务维持 BLOCKED 而非放宽到匿名/弱套件。

## 2B. 2026-10-24 第二次操作者现场 SSLContext / cipher / C3B 目录回执

**OPERATOR-PASTED RAW OUTPUT / NO NETWORK HANDSHAKE / NO CONFIG CHANGES。** 此批仅构造进程内默认 `ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)`、查询 `get_ciphers()` 元数据以及 Mac `stat` 目录，不能宣称已验证证书链、mTLS 互信或连接稳定性。

| 现场项 | Mac Catalina 3.8.2 / LibreSSL 2.8.3 | Guest Python 3.10.12 / OpenSSL 3.0.2 | 结论 |
| --- | --- | --- | --- |
| `verify_mode` | `VerifyMode.CERT_REQUIRED` | `VerifyMode.CERT_REQUIRED` | 双方客户端 Context 默认请求证书验证 |
| `check_hostname` | `True` | `True` | 双方默认核验服务端名称/IP；IP SAN 实际握手未测试 |
| `minimum_version` | `TLSVersion.TLSv1` | `TLSVersion.TLSv1_2` | Mac 默认最低版本不合意；**服务端与客户端必须显式冻结 min TLS1.2** |
| `maximum_version` | `TLSVersion.TLSv1_2` | `TLSVersion.MAXIMUM_SUPPORTED` | Mac 实验候选只支持 TLS1.2；暂不为实验升级 Mac |
| 以 `entry.get('protocol') == 'TLSv1.2'` 筛选 | **空字符串（0 条命中）** | **14 条名称**，含 `ECDHE-RSA-AES128-GCM-SHA256`、`ECDHE-ECDSA-AES128-GCM-SHA256` 等 | **不能宣告 0 个共同套件**：Mac `get_ciphers()` 总长度、`protocol` 实际值及未过滤名称并未输出 |
| 旧实验目录 `stat` | `apple drwx------ /Users/apple/Library/Application Support/SanQ-Runtime-CAS-Lab/P2-C3B-001` | 不适用 | Mac C3B-001 **目录** owner `apple` / mode `0700` PASS_SCOPED；未触碰 DB/WAL，文件权限及其当前哈希本批未校验 |

**关键诊断区别：** Mac 的空 `TLS12 ciphers:` 是一个**筛选结果**，不是原始 `ctx.get_ciphers()` 总数。可能是旧 LibreSSL/Python 导致条目 `protocol` 元数据命名不同，也可能是该 Context 根本未列出套件；现在不足以选定 mTLS 套件或确认证书兼容。只有看到不经 `protocol` 筛选的 `name/protocol` 才能进一步缩小范围，**即使套件名字有交集也不能冒充已经握手**。

**后续唯一必要的最小只读补证（Mac）：** 在用户原有 `/usr/bin/python3 -I -S -B` 中使用进程内 `SSLContext(PROTOCOL_TLS_CLIENT)`，打印 `len(ctx.get_ciphers())`、`Counter(x.get('protocol') for x in ctx.get_ciphers())`、未过滤的 `name + protocol` 列表；可与前次 Guest 14 个 suite 名称做纯文本交集。若全表实际为空或未找到可接受 TLS1.2 AES-GCM/ECDHE 共同套件，则 **`C3C3 TLS CIPHER BLOCKED`**，绝不降级为弱套件。此操作既不创建连接也不修改系统配置。

证书/IP SAN/EKU、CRL 运行效果、专用端口、Mac 低权服务身份/私钥/新实验数据目录和真实 LibreSSL↔OpenSSL 的 TLS1.2 协商仍待独立验证。旧 C3B 数据不转为联网库。保留 `P2-C3C3-READ TLS12_CAPABILITY_PASS_SCOPED / CIPHER_SUITE_INTERSECTION_UNKNOWN / ACTUAL_MTLS NOT_RUN / NETWORK NOT_AUTHORIZED / PRODUCTION NO-GO`。

## 2C. 2026-10-24 第三次 Mac 全量 Cipher 元数据与交集现场确认

**OPERATOR-PASTED READ-ONLY / NO TLS HANDSHAKE / NO NETWORK LISTENER**。操作者在已有 Mac 系统 Python 3.8.2 + LibreSSL 2.8.3 下，从 `SSLContext(PROTOCOL_TLS_CLIENT).get_ciphers()` 读回 `Total: 37`，全部 `protocol='TLSv1/SSLv3'`。该标签来自此旧运行时返回的 cipher 元数据，**不代表 37 条套件都只能使用 TLS1.0 或 SSLv3**；先前 `protocol == 'TLSv1.2'` 返回空是无效的环境跨版本筛选条件。以**未过滤的 cipher 名称**和 Guest Python 3.10.12/OpenSSL 3.0.2 先前列出的 14 条 TLS1.2 套件相交，准确得到 `Common count: 14`，与操作者的 14 条输出相符。

| 范围 | 现场事实 | 有界判定 |
| --- | --- | --- |
| Mac Cipher 元数据 | 37 条全部标注 `TLSv1/SSLv3` | `FULL_CIPHER_ENUMERATION_PASS`，协议标签不可直接当实际协商 TLS 版本 |
| Mac ↔ Guest 同名交集 | 14 条，包括 ECDHE-RSA/ ECDHE-ECDSA AES128/256-GCM，亦有 DHE-RSA、SHA256/384、ChaCha20 | `CIPHER_NAME_INTERSECTION_PASS_SCOPED`，仅是两端 Context 已启用名称集合交集，**不是完成协商/双向认证的证明** |
| 优先候选 | `ECDHE-RSA-AES128-GCM-SHA256`、`ECDHE-RSA-AES256-GCM-SHA384`，以及同名 ECDHE-ECDSA AES-GCM 两项 | 对应服务端证书需选择相容的 RSA/ECDSA 密钥、serverAuth EKU、IP SAN，实施前另批验证 |
| 现有默认 TLS | Mac min TLS1.0、max TLS1.2；Guest min TLS1.2 | 后续受控服务/客户端均显式 `min=max TLS1.2`；目前**没有写 SSL 配置** |
| 真正 mTLS 与授权 | 没有签发证书、socket 绑定、CA 验证、证书吊销/轮换、证书 IP SAN 真实握手、端到端 CAS | `HANDSHAKE_NOT_RUN / AUTHORITY_NOT_AUTHORIZED` |

**下一阶段从 C3C3-READ 推进到 C3C3-DESIGN-B**：已无需重复 Mac TLS1.2 capability/cipher 列举。候选设计为只读/离线证书布局与身份生命周期：独立实验 CA、RSA/ECDSA 密钥类型决定、server IP SAN `192.168.56.1`、clientAuth EKU、受控证书轮换/撤销、Mac 非 root 进程、全新实验数据目录、只绑定 Host-only IPv4 的专用端口（**端口尚未选定/监听**）、请求 framing/超时/拒绝日志/撤回。随后需要**另次明确授权** C3C3-IMPLEMENT 实际发证与监听及 C3C4 Guest 客户端。现有 P1/A2-1/C3A/C3C2 均维持 DENY；即使 mTLS 未来成功也不自动解决 Docker 启动的 HEAD_READ→ARMING TOCTOU。

**最新状态：** `TLS12_CAPABILITY PASS_SCOPED / CIPHER_NAME_INTERSECTION 14_OF_14 PASS_SCOPED / REAL_MTLS NOT_RUN / C3C3-DESIGN-B READY_FOR_REVIEW / C3C3 NETWORK NOT_AUTHORIZED / P0-01 NOT_RUN / PRODUCTION NO-GO`。

## 3. 现场只读材料采集命令（部分已由操作者执行；其余仍待取证）

以下命令**不会**生成证书、开启 TCP 监听、修改 VM/防火墙或调用 Docker。操作人员先以已验证的 Recovery Clone 身份和可信 SSH known_hosts 进入正确终端。若系统缺命令、权限受限、输出与预期不符，停止，不安装补丁/证书/依赖。禁止粘贴私钥、令牌、`security` 钥匙串秘密、`known_hosts` 原文。

### A. Mac 本地 Terminal（只读）

```bash
echo "=== MAC SYSTEM / SSL READ ==="
/usr/bin/sw_vers -productVersion
/usr/bin/python3 -I -S -B - <<'PY'
import sys, ssl
print("python_version:", sys.version.split()[0])
print("ssl_backend:", ssl.OPENSSL_VERSION)
print("tls12_flag:", getattr(ssl, "HAS_TLSv1_2", "UNAVAILABLE"))
print("tls13_flag:", getattr(ssl, "HAS_TLSv1_3", "UNAVAILABLE"))
print("has_sni:", getattr(ssl, "HAS_SNI", "UNAVAILABLE"))
print("client_context:", hasattr(ssl, "PROTOCOL_TLS_CLIENT"))
print("server_context:", hasattr(ssl, "PROTOCOL_TLS_SERVER"))
print("crl_leaf_check:", hasattr(ssl, "VERIFY_CRL_CHECK_LEAF"))
if hasattr(ssl, "PROTOCOL_TLS_CLIENT"):
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    print("client_verify_mode:", ctx.verify_mode)
    print("client_hostname_check:", ctx.check_hostname)
    print("tls_minimum_version_property:", hasattr(ctx, "minimum_version"))
PY
echo "=== MAC HOST-ONLY ADDRESSES ==="
/sbin/ifconfig bridge100 | /usr/bin/grep -E '^(bridge100:|[[:space:]]*inet |[[:space:]]*inet6 )'
echo "=== MAC TCP LISTENERS (METADATA ONLY) ==="
/usr/sbin/lsof -nP -iTCP -sTCP:LISTEN
echo "=== PROTECTED C3B EVIDENCE DIRECTORY METADATA ==="
/usr/bin/stat -f '%Su %Sp %N' "$HOME/Library/Application Support/SanQ-Runtime-CAS-Lab/P2-C3B-001"
```

该段只输出 SSL 能力、接口、监听者元数据和旧实验**目录** owner/mode。若 Mac 某个命令不可用，记录 `UNKNOWN`，不为凑齐回执而使用 sudo/修改权限；`lsof` 非 root 视图不等于全系统可见。

### B. Ubuntu Recovery Clone 普通用户终端（只读）

先复核 Host VBox VM UUID/NIC/原 VM poweroff，之后在已确认主机密钥的 SSH 会话或 Guest Console 运行：

```bash
echo "=== GUEST ID / SSL READ ==="
id -u
hostnamectl --static
python3 - <<'PY'
import sys, ssl
print("python_version:", sys.version.split()[0])
print("ssl_backend:", ssl.OPENSSL_VERSION)
print("tls12_flag:", getattr(ssl, "HAS_TLSv1_2", "UNAVAILABLE"))
print("tls13_flag:", getattr(ssl, "HAS_TLSv1_3", "UNAVAILABLE"))
print("client_context:", hasattr(ssl, "PROTOCOL_TLS_CLIENT"))
print("has_sni:", getattr(ssl, "HAS_SNI", "UNAVAILABLE"))
if hasattr(ssl, "PROTOCOL_TLS_CLIENT"):
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    print("client_verify_mode:", ctx.verify_mode)
    print("client_hostname_check:", ctx.check_hostname)
PY
echo "=== GUEST NETWORK READ ==="
ip -o -4 addr show scope global
ip -4 route show default
ip -6 route show default
echo "=== TLS TOOL VERSIONS ==="
openssl version
```

这些命令不建立到 Mac CAS 端口的连接；也**不调用** `openssl s_client`、`curl`、`nc`、`sudo`、`systemctl start`、`docker info` 或 `VBoxManage startvm`，避免无意改变隔离实验状态。

## 4. C3C3 候选服务设计与安全门禁（未授权实施）

| 边界 | 执行前需要冻结的准确选择 | 不允许的替代 |
| --- | --- | --- |
| 服务绑定 | 只绑定本次校验的 Mac Host-only 单个 IPv4 与**经端口占用审查后冻结的新专用端口**；最大请求长度 32768 bytes，需选择有界 framing/读超时/连接数与 worker 限制 | `0.0.0.0`、LAN/IPv6 监听、任何公网端点，历史由 rapportd 占用的 49472 |
| TLS 身份 | 完整 server IP SAN、leaf EKU、可信私有实验 CA、client auth required、证书验证后提取 peer 标识，固定 issuer/leaf hash 与安装登记 | `CERT_NONE`、关闭 hostname check、原文请求自报 `clientIdentity` 作为身份、默许 CN |
| 证书/撤销 | 独立 CA 生成与托管、到期与 Guest 时钟、安全分发、轮换、吊销/关闭旧 clone 身份；所有私钥只保存在授权受限目录/OS Keychain | 把 key、p12、PEM private、token 放 Git/CI/聊天或直接使用 C3B 实验数据 |
| Mac 权限 | 不申请 root/launchd/system extension；批准的非 root 服务账户与全新实验数据目录，保持旧 C3B 原件无变更 | 修改现有 user 目录 mode、将 0700 私有 DB 暴露给另一个账户 |
| Guest | 先只读查证身份/证书验证库；C3C4 才另批批准向指定 Recovery Clone 投送受限客户端证书与运行非 root 客户端 | 原 Jammy VM、生产 VM、systemd/docker unit、网络转发 |
| 记录与审计 | 服务拒绝类别、身份指纹（不记私钥）、epoch/txid/requestSha、unknown commit 的 HEAD+LOOKUP，非成功请求审计与保护日志权限 | 日志持久记录密钥或用户敏感 payload |
| 真实 CAS 接口 | 网络适配器必须从握手结果获取 peer identity，先校验注册/role，再允许触发测试 SQLite；错误/断链保持 DENY，绝不生成 P1 OFF_HOST receipt | 以 synthetic `OfflineBindingVerdict` 作为真实的 `authenticated` 或执行许可 |

**C3C3 已知额外架构风险：** C3C2 `SyntheticPeerEvidence` 公开构造，完全不具链验证性质；需通过显式区分 `TlsVerifiedPeer` 只能由受信 transport 获取的 API/受信边界，并补充 tests 防止不可信调用方伪造。单纯引入可构造 Python dataclass 不可能在同权限进程内形成严格不可伪造的安全事实，因此必须在网络真实握手层和服务进程授权边界建立根权限；此变化属于 `AGENTS.md §10` 新认证边界，**本批未实施**。

**C3C3 ≠ S03**：即使 mTLS 与 CAS 通信实测通过，仍不能解决 `HEAD_READ→ALLOW Docker` 检查使用竞态，直接启动 dockerd/socket、containerd/shim 持续写入、事故 G06 恢复或整盘回滚。生产级 OFF_HOST 权威必须选独立物理控制面。

## 5. 分批推进与批准请求

1. `P2-C3C3-READ-A`：操作者按第 3 节取得 Mac/Guest **只读** TLS、网络、监听/目录元数据回执，不提交秘密。再次核验原 Jammy VM poweroff 和恢复 Clone Host-only。完成后在仓库增加证据摘要并审查 Mac SSL 是否适用 Python `ssl` 标准库，**未取得上述回执前不得执行 C3C3 网络修改**。
2. `P2-C3C3-DESIGN-B`：以真实只读回执选择 TLS 最低版本/支持的 cipher/SAN、认证与吊销、Mac 非 root 运行身份、准确端口和文件布局、事故保留/撤回方案、负例矩阵并先通过源码和安全审阅；如必须更新 Python/系统证书工具或依赖须先向用户申请新增依赖/架构变更许可。
3. `P2-C3C3-IMPLEMENT-C`：**再单独授权** Mac 新实验目录、受控 CA/证书、Host-only 监听/进程、受限账户及回退清单；不得自动绑定到旧 DB、自动启动服务或向 Guest 注入凭证。
4. `P2-C3C4`：另行单独批准 Guest 非 root TLS 实测与提交/断线、双客户端冲突、身份撤销/证书过期等；`P0-01`/真实 Guard/root/snapshot 故障验证继续单列授权。

**最新结论（2026-10-24 第三轮现场回执后）：** `P2-C3C2 MERGED / C3C3-READ TLS12_CAPABILITY PASS_SCOPED / CIPHER_NAME_INTERSECTION 14_OF_14 PASS_SCOPED / ACTUAL_MTLS NOT_RUN / CERT_SAN_EKU_CRL NOT_TESTED / SERVICE+KEYS+VM_WRITES NOT_AUTHORIZED / P0-01 NOT_RUN / S03-G06-S09 OPEN / PRODUCTION NO-GO`。本文为现有现场证据归档，真正安装与网络通信仍需用户另行授权。