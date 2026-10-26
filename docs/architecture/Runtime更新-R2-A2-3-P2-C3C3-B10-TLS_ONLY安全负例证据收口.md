# SanQ Runtime — R2-A2-3 P2-C3C3 B10 TLS_ONLY 安全负例证据收口

> **2026-10-26 / FIELD_RECEIPT_REVIEW / DOCUMENTATION_ONLY**。本记录根据操作者于本对话提供的 Mac 和 Ubuntu Recovery Guest 双端终端输出作限域审阅，**不是由助手独立复跑**，不包含原始终端文件/外部见证封存。本次只审阅一次性 TLS_ONLY 实验；没有运行仓库正式 mTLS CAS、SQLite、Enrollment、Boot Guard 或任何生产服务。
>
> **结论：** \`B10_TLS_ONLY_NEGATIVE_MATRIX_CLOSED_PASS_SCOPED / FORMAL_CAS_NOT_RUN / FORMAL_ANCHOR_BLOCKED / P1_DENY / P0-01_NOT_RUN / PRODUCTION_NO-GO\`。验收状态仅对当次实验、所列工具链、证书、网络与观察时刻有效，不得扩大为正式服务 TLS / CRL / CAS 或生产准入证明。

## 1. 基线、来源与归属

- 仓库文档：根 \`AGENTS.md\`、\`.github/workflows/ci.yml\`（\`ops-checks\`）、[C3C1 可信身份边界](Runtime更新-R2-A2-3-P2-C3C1最小认证离机CAS信任边界设计.md)、[C3C3 DESIGN-B](Runtime更新-R2-A2-3-P2-C3C3-DESIGN-B最小mTLS服务认证与撤回设计.md)、[IMPLEMENT-A](Runtime更新-R2-A2-3-P2-C3C3-IMPLEMENT-A本地Mac服务与证书交付门禁.md)、[M01-B9 scoped 证据](Runtime更新-R2-A2-3-P2-C3C3-M01-B9安全证据收口与双层撤销候选决策.md)与 [B9-DECISION 合同](Runtime更新-R2-A2-3-P2-C3C3-B9-DECISION双层撤销权威与CRL生命周期合同.md)。
- 基线：\`dev@dc195aba5e45d2053fda858507e9616add457902\`；\`ops/runtime/maintenance_mtls_hostonly_lab_service.py\` 配置 \`192.168.56.1:39443\`、TLS1.2 min/max、\`ssl.CERT_REQUIRED\`、\`ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384\`，有 \`OP_NO_TICKET\` 才配置它。此为 **SOURCE_REVIEW**；其 \`serve_manually()\` 并未参加本次 TLS 实验。
- 现场：Mac Python 3.8.2 / LibreSSL 2.8.3；Ubuntu Recovery Guest Python 3.10.12 / OpenSSL 3.0.2；Host-only Mac \`192.168.56.1\`、Guest \`192.168.56.5\`。所有连接均发往独立的、单次短时运行的 TLS_ONLY Python 服务，不含 CAS/SQLite/enrollment 后端，机器仍处于**同一物理故障域**。
- 实验材料的 **X.509 DER SHA256**：CA \`40788f66c5eb4572f41d7b49019a87d9138d4f2676be1a9ca1a8ee6f90e449e8\`；原 Server \`06b1d2f197565ab9b57222ff8317f2cb28e92e39dce671b9272855760800888d\`；原 Client \`d5dfb4c13a87295f1f2567b67ff65bc593045c727a08d48844ccce8bc83bdab7\`。**这些不等同于 enrollment \`caCertSha256\` 的原始 PEM 文件字节 SHA256。**
- 证据分类：\`FIELD_RECEIPT\` 为用户粘贴的双端输出；\`STATIC_VERIFY\` 为实测 openssl 验证及证书文本；\`SOURCE_REVIEW\` 为仓库源码；\`CI\` 仅是远端本文件交付的工作流，**不包含本次 Mac/Guest 网络实验**。

## 2. B10-0～D 现场证据矩阵

| 阶段 | 可核对的双端/静态回执 | 本阶段判定 |
| --- | --- | --- |
| **B10-0 平台预检** | Mac/Guest \`TLS_1_2_SUPPORTED=True\`；CA DER pin 一致，原 Server/Client DER pin 对齐；原 Server SAN \`IP Address:192.168.56.1\`、EKU \`serverAuth\`、双方 openssl verify 为 OK；Guest 具备旧 CBC Cipher 枚举能力；Mac 39443 在检查时无监听。 | \`PASS_SCOPED\`。两个 UTC 读数不是同时采样，不能据 10.46 秒显示差值断言真实时钟漂移；可信时钟仍 OPEN。 |
| **B10-A 缺失 SAN** | 独立 CA 签发 Server DER SHA256 \`4fbe070d8204849c1f95b44eadbf745769b0218a835ef3cea8d385e619027721\`；\`CA:FALSE\`、\`serverAuth\`、SAN 完全缺失；Guest 设置 \`check_hostname=True\`、\`hostname_checks_common_name=False\` 且验证 \`192.168.56.1\`，真实握手 \`VERIFY_CODE=64\` / \`IP address mismatch\`；Mac \`SSLV3_ALERT_BAD_CERTIFICATE\`；停止后 39443 无监听。 | \`CLOSED_PASS_SCOPED\`；独立 TLS 客户端对缺失 IP SAN 的拒绝。 |
| **B10-B notYetValid** | 独立 Server DER SHA256 \`b09e83bc46db7364995350da1ea9892c61460ac41c9b4ba9b80d5dc01f4bfe04\`、serial \`6599937C699FB497BE38F7761ABE3586\`；\`notBefore=2026-10-27 12:40:31 UTC\`、\`notAfter=2026-10-29 12:40:31 UTC\`；正确 IP SAN 与 \`serverAuth\`；Mac 静态 \`error 9\`；Guest 真实握手 \`VERIFY_CODE=9\` / \`certificate is not yet valid\`；Mac \`SSLV3_ALERT_BAD_CERTIFICATE\`；39443 无监听。 | \`CLOSED_PASS_SCOPED\`；在现场检查时证书尚未生效，未修改系统时钟。 |
| **B10-C TLS1.0 / TLS1.1 降级** | Mac min/max 均 \`TLSv1.2\`。Guest 分别强制 TLS1.0、TLS1.1，两次 \`CLIENT_TCP_CONNECTED\`，Mac \`SERVER_ACCEPTED_ATTEMPT=1/2\`、Peer \`192.168.56.5\`，两次服务端 \`WRONG_VERSION_NUMBER\`、客户端 \`TLSV1_ALERT_PROTOCOL_VERSION\`；服务停止且端口无监听。 | \`CLOSED_PASS_SCOPED\`，2/2 旧协议被拒。Guest \`@SECLEVEL=0\` 仅限当次进程，不属于服务端降级。 |
| **B10-D 非白名单 Cipher** | Mac \`SERVER_ALLOWED_CIPHERS\` 仅为两种 GCM。Guest 均强制 TLS1.2，D1 精确只有 \`ECDHE-RSA-AES128-SHA\`，D2 精确只有 \`AES128-SHA\`。均成功 TCP 到达 Mac，服务端两次 \`NO_SHARED_CIPHER\`，客户端两次 \`SSLV3_ALERT_HANDSHAKE_FAILURE\`，双端拒绝计数各 2/2；\`B10_D_SERVER_STOPPED\`，最终 \`lsof\` 无返回。 | \`CLOSED_PASS_SCOPED\`；2/2 因无共同 Cipher 而拒绝。 |

**判定警戒：** \`SSLV3_ALERT_*\` 为传统错误字符串，不表示实际 SSLv3 握手；B10-C/D 是负例，不能将先前 M01-B4 的正常 mTLS 正例误算为 B10 正例。

## 3. B10-D 实测退出准则及证据细节

1. 服务端列出白名单 \`['ECDHE-RSA-AES128-GCM-SHA256', 'ECDHE-RSA-AES256-GCM-SHA384']\`，仅以 TLS1.2 运行。
2. Guest 分别列出 \`B10_D1_CLIENT_CIPHERS=['ECDHE-RSA-AES128-SHA']\` 和 \`B10_D2_CLIENT_CIPHERS=['AES128-SHA']\`，没有误混入被批准的 GCM TLS1.2 Cipher。
3. D1/D2 均 \`CLIENT_TCP_CONNECTED\`，服务端显示 \`SERVER_ACCEPTED_ATTEMPT=1\`、\`2\`，且 peer IP 为 \`192.168.56.5\`，因此不是本地 cipher 设置失败或网络不可达导致假阳性。
4. Mac 的两次 \`SERVER_SSL_REASON=NO_SHARED_CIPHER\` 与 Ubuntu 的两次 \`CLIENT_SSL_REASON=SSLV3_ALERT_HANDSHAKE_FAILURE\` 相互对应；\`B10_D_SERVER_CONFIRMED_REJECTIONS=2\`、\`B10_D_CLIENT_CONFIRMED_REJECTIONS=2\`。
5. 最终 Mac 输出 \`B10_D_SERVER_STOPPED\`，\`/usr/sbin/lsof -nP -iTCP:39443 -sTCP:LISTEN\` 无输出，只证明该次检查时**未见监听**，不是永久端口保留保证。

**结果：** \`B10-D CLOSED_PASS_SCOPED\`，B10 负例矩阵可按上述独立实验的范围收口。

## 4. 未关闭的安全缺口

- **仓库服务并未真正集成测试。** \`maintenance_mtls_hostonly_lab_service.py::serve_manually()\` 未运行，不能据临时服务器握手结果宣称正式的 \`HEAD_READ / COMMIT_LOOKUP / CAS_SUBMIT\` 已通过。
- **CRL 未在仓库服务中实现。** 当前 \`tls_context()\` 只加载 CA 而未加载完整 CRL，未启用 \`ssl.VERIFY_CRL_CHECK_LEAF\`；B9-DECISION 的 Option B / B1 仍为文档冻结合同，B8 的局部 CRL 不能代替完整 CA 总账。
- **撤销权威与时序尚未验证。** 正式 \`InstallationAnchor\`、受信 CRL 单调版本、独立受信时钟、可执行 B1 fence、撤销生效点 F 之后旧身份不得提交 CAS 的证据仍缺失。Session 恢复、运行中 CRL 失效/回滚、旧身份/角色、UNKNOWN/断线后对账尚 OPEN。
- **生产级独立性与启动准入仍未证。** Mac/VirtualBox Guest 同物理故障域；P1 Boot Guard、P0-01、systemd/root、Docker writer 和生产 AWS/S2 不在本次范围。TLS 验证不能提升为可信 OFF_HOST 证明。
- **证据类型限制。** 本报告只综合操作者回执及仓库只读审查；并未独立抓取双端现场环境或在 GitHub Actions 中重跑这些真实网络负例。

## 5. 交付界限、后续门禁与验收用语

1. 本次仓库交付仅新增这份 B10 证据报告，并在 IMPLEMENT-A 与 \`worklog.md\` 增加新状态索引；保留 B4～B9 历史结论和 C1 并行提交，不修改源码、证书、私钥、CA 签发数据库、Enrollment/CRL、CAS/SQLite、Guard、CI、17 Bundle 或生产环境。
2. \`B10_0,A,B,C,D_FIELD_RECEIPT_PASS_SCOPED\` 是本轮可支持的最高状态；正式身份系统、受信 CA/CRL 生命周期 owner、CAS 运行和 P1 准入仍分别 \`BLOCKED/NOT_RUN\`。
3. 下一阶段须独立审阅并取得实施授权：可信 \`InstallationAnchor\` 来源、CA/CRL 签发总账 owner、B1 fence/CRL 实施和并发负例测试；随后另行开展 C3C4 真实联网 CAS/UNKNOWN/恢复。不得由 B10 证据自动升级成正式准入。

**退出：** \`B10_TLS_ONLY_NEGATIVE_MATRIX_CLOSED_PASS_SCOPED / FORMAL_CAS_BLOCKED / P1_DENY / P0-01_NOT_RUN / PRODUCTION_NO-GO\`。
