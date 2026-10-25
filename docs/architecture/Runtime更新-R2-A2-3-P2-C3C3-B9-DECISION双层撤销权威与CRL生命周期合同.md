# SanQ Runtime R2-A2-3 — B9-DECISION 双层撤销权威、CRL 生命周期与撤销时序合同

> **2026-10-24 / DOCUMENT-ONLY SEMANTIC FREEZE / IMPLEMENTATION NOT AUTHORIZED / PRODUCTION NO-GO**。本文件依据操作者已审阅的 `B9-DECISION 本地设计稿，在最新 `dev@17188367684a155b7217881d695c8c615589e940 上独立交付。M01-B9 证据经 PR #2942、merge `9a20a0260948edc3a756a0236f0e140290519d53 收口。此前 M01-B4～B8 的 `PASS_SCOPED 仅属于无 CAS 的 LAB_ONLY TLS 实验，不是正式 CAS 验收。
>
> **冻结的是 Option B / B1 的安全语义与后续实施门禁，不是代码或运维配置**。CRL 管理 owner、受信时钟/版本锚、InstallationAnchor 来源、可执行 fence/generation 和正式证书发行尚未获得单独实施授权。本合同不创建 CA、CRL、私钥、enrollment、SQLite 数据库、监听、Guard、Docker 启动或生产许可。`P1 DENY / P0-01 NOT_RUN / PRODUCTION NO-GO。

## 1. 依据及源码事实

- 依据：根 `AGENTS.md、`.github/workflows/ci.yml 的 Runtime/ops-checks、[P2-C3C1 信任边界](Runtime更新-R2-A2-3-P2-C3C1最小认证离机CAS信任边界设计.md)、[P2-C3C2 synthetic peer/wire](Runtime更新-R2-A2-3-P2-C3C2离线认证身份与Wire合同实施记录.md)、[P2-C3C3 DESIGN-B](Runtime更新-R2-A2-3-P2-C3C3-DESIGN-B最小mTLS服务认证与撤回设计.md)、[IMPLEMENT-A](Runtime更新-R2-A2-3-P2-C3C3-IMPLEMENT-A本地Mac服务与证书交付门禁.md)、[M01-B9 证据收口](Runtime更新-R2-A2-3-P2-C3C3-M01-B9安全证据收口与双层撤销候选决策.md)及 R0。所属 owner 是 Runtime/Ops；不改变业务上下文、17 文件 Bundle、P1 启动权威或 CI 规则。
- `ops/runtime/maintenance_mtls_hostonly_lab_service.py::tls_context()` 当前仅 TLS1.2、`CERT_REQUIRED`、指定 CA、cipher 白名单和存在时的 `OP_NO_TICKET`；未载入 CRL、未设置 `VERIFY_CRL_CHECK_LEAF`。禁 Ticket 不等于禁所有 TLS1.2 Session ID 恢复。
- `serve_manually()` 在握手后读取文件型 enrollment，检查与启动快照相等，再读取/分发请求；没有**撤销事件与 SQLite COMMIT 的共同线性化屏障**。`revoked: bool` 是本机配置声明，不是可信独立撤销事件。
- `maintenance_off_host_cas_sqlite.py` 的 `enrollments(host_id,installation_id,anchor_bytes,client_identity)` 不存证书撤销版本；`submit()` 在 `BEGIN IMMEDIATE` 内查静态 enrollment/Anchor、epoch/head 和 CAS 前驱，不查独立同步撤销 generation。现有 schema v1、P1 Receipt、Wire v1 不得暗改。
- 已有 `caCertSha256` 是**CA PEM 文件原始字节**的 SHA-256，`clientCertSha256` 是**X.509 leaf DER** 的 SHA-256；独立 TLS 实验所记 CA 指纹也是 DER SHA-256，不能混用。
- 正式可信 `InstallationAnchor` 尚未具备；Mac 与 Guest 同一物理故障域，独立生产 OFF_HOST/anti-rollback 未证，真实仓库 CAS/SQLite/Guard 验证未运行。代码/CI 旧记录不得提升为生产许可。

## 2. 冻结的安全语义 D01—D08

| 决策 | 合同约束 | 禁止推断 |
| --- | --- | --- |
| **D01 权威划分** | 离机受信 **CA/CRL 发行者**维护唯一受控签发/撤销总账；独立 **Enrollment 审批者**绑定 `hostId + installationId + anchorSha256 + leaf identity + roles + revoked`；TLS/CAS 只消费受信版本。Guest 网络 API 不得发证、登记、撤销、扩权。 | TLS 认证成功不等于受信安装身份；同一 Mac 用户控制所有文件不构成跨故障域独立。 |
| **D02 双层 AND / OR 拒绝** | 仅证书链/用途/时效/服务端 IP SAN、完整有效 CRL 未撤销、可信 enrollment 精确绑定且未撤销、角色及 CAS 条件全部成立才允许相应 LAB 操作。任一层失败或未知则 DENY。 | CRL 不替代 enrollment；`revoked=false` 绝不覆盖 CRL 的拒绝。 |
| **D03 唯一证书身份** | 首版限定单层 CA 直接签发 leaf，发行身份以 `issuer + serial` 唯一；leaf DER SHA256 绑定 TLS peer，可信 anchor hash 绑定安装实例。既有 PEM-bytes pin 保持原语义。要更改用新字段/合同版本及迁移。 | CN、IP、CSR、单独公钥相同均不足以确认授权身份。 |
| **D04 完整 CRL** | 只接收目标 issuer 的 X.509 v2 **完整、直签、非 delta、非 indirect** CRL，严格验证签名、issuer、AKI、CRL Number 单调、`thisUpdate <= trustedNow < nextUpdate`；完整性须对受信 CA 签发/撤销总账独立核对。 | B8 的局部实验撤销文件不是完整总账；`cert_store_stats()['crl']==1` 不是验真。 |
| **D05 时钟/失效** | 缺失、过期、不完整或不受信 CRL；不匹配 issuer/签名/AKI/number；版本回退；可信当前时间不可确立：**停止/不启动服务，拒绝新认证操作**；不得关掉 CRL flag 或 CA-only 软失败。运行期间同样要求检查，不得让旧 SSLContext 绕过过期边界。 | OS wall clock 未独立验证前只具有 LAB 限定信任；本机时间不是正式 anti-rollback。 |
| **D06 撤销时序** | 首版采用 **fenced stop-and-replace**：先阻断新连接和 CAS 请求，处理/隔离全部在途事务，再替换 CRL + enrollment、证明旧 listener/context/worker 失去写能力并生成受信耐久回执。只有证实屏障才宣告撤销生效。 | 改磁盘字段不等于实时撤销；在途旧凭据不能穿过已宣告的生效点后 COMMIT。 |
| **D07 UNKNOWN** | COMMIT 前后掉线/kill/超时都可能结果未知；一律 `OUTCOME_UNKNOWN_DENY`。仅由批准的独立恢复身份或离线人工取证按 `COMMIT_LOOKUP -> HEAD_READ` 对账，绝不自动重试提交、跳 epoch、启动 Docker。已撤销身份不可重新获得任何 READ/SUBMIT 角色。 | `NOT_FOUND`、TCP reset、进程退出都不证明原事务已失败。 |
| **D08 证书轮换** | 旧身份必须经 fence 撤销；新 leaf 须独立审批并重新绑定可信安装实例。未经专门授权，同一安装身份不可让两台 VM 或两张证书同时保有 SUBMIT。CA/CRL 轮换另审，不能自动重发。 | 复用旧私钥签新证书，不自动继承旧授权。 |

### 合同表达式

```text
ALLOW_LAB_OP = trusted_anchor
            AND verified_tls_chain_eku_time_and_endpoint
            AND loaded_fresh_complete_crl_and_not_revoked
            AND approved_exact_enrollment_and_not_revoked
            AND operation_role_allowed
            AND current_fence_generation_allows_requests
            AND existing_cas_preconditions

UNKNOWN or CHECK_ERROR => DENY
ALWAYS authorizedToStartDocker=false
```

`trusted_anchor` 和 `fence_generation` 是待独立建设的**前置条件**，不得把它们写成当前源码已满足的事实或允许 Guest 自报的凭据。

## 3. CRL 生命周期、完整性与单调发布

1. **签发总账**：唯一受信 CA/CRL operator 对每一张 leaf 的 `issuer + serial`、审批、续期和撤销保留完整记录。不得拼接多个独立实验 `openssl ca` index 文件充当真实完整总账；CA 私钥不进入 Guest、CAS 服务、GitHub、CI、MCP。
2. **发行内容**：完整 CRL 包含 issuer、Authority Key Identifier、CRL Number、`thisUpdate` / `nextUpdate`、签名，发布证据记录 CA 身份、CRL DER SHA256、批准人员、前后 CRL Number、时效、来源与确认时间；按确定的 issuer/scope 单调前进。必须核对所有签发/撤销事实。
3. **首版运营候选参数**：CRL 有效期**最长 24 小时**，至少提前 **6 小时**准备刷新；任何撤销事件立刻触发新的受控发布。这是项目建议值、**不是 RFC 强制期限**，正式运维实施前仍须模拟断电/过期与人工恢复并复审。
4. **原子交付**：在隔离的新 generation 检验发行者、签名、AKI、number、时钟、pin、数据完整性及 leaf 正反例，再受控切换目录及读回；只有经过一致性确认的新 generation 可以启动新 SSLContext。失效绝不自动恢复旧版许可。
5. **抗回滚**：CRL Number 单调是版本比较规则，不足以抵御 CA/CRL、本地数据库及 pin 一起回滚。最低已接受 number/generation 必须置于**独立可验证的受信状态**；若不可获得，只能归档为 LAB 限定，不得宣称生产 anti-rollback。
6. **范围限制**：首版仅直接 CA 签发的客户端 leaf。若新增中间 CA、链级吊销、间接或增量 CRL，必须另行评审链及各级撤销处理；`VERIFY_CRL_CHECK_LEAF` 不等同于所有证书链级撤销验证。
7. **过期与运行中版本**：CRL 更新/发行成功不代表旧 TLS 会话失效；旧 session/SSLContext 及缓存 enrollment 必须被 fence 覆盖。CRL 失效时不得运行“仅 CA 验证”后备路径。

依据：RFC 5280 `5.1、`5.2；Python SSL `VERIFY_CRL_CHECK_LEAF` 的显式 CRL 加载与检查。参考 https://www.rfc-editor.org/rfc/rfc5280.html 、https://docs.python.org/3/library/ssl.html#ssl.VERIFY_CRL_CHECK_LEAF 。

## 4. 撤销线性化：首版 B1 停机屏障

```text
SERVING(g)
  -> REVOKE_REQUESTED
  -> FENCE_ENTERED          (停止新 accept / 新 CAS 请求)
  -> QUIESCED               (证明所有在途旧身份写入已停/隔离)
  -> REVOKE_STAGED          (新完整 CRL + enrollment 撤销记录已验真耐久)
  -> REVOCATION_EFFECTIVE(g+1)  [linearization point F]
  -> OPTIONAL_SERVING(g+1) (仅经独立审批有效身份，重建 SSLContext)
```

- **生效点 F**：必须同时具备旧进程/长连接/SSLContext/worker 没有继续 COMMIT 的可核验证据、全部先前 COMMIT 的已知归属或保守隔离、已受信耐久记录的新 CRL/enrollment/generation 与 anti-rollback pin，方能耐久记入 `REVOCATION_EFFECTIVE(g+1)`。此点前旧身份事务**可能**已经提交；此点后旧身份不准再成功提交。
- **F 之前的 COMMIT 未知**：若停机发生在 SQLite COMMIT 附近，不能假设已回滚。保留 SQLite DB、WAL、事务请求 SHA、epoch/receipt，并标记 `OUTCOME_UNKNOWN_DENY`；由批准的只读取证确认是否已于 F 前提交。无法证明 QUIESCED/COMMIT 归属，维持 `REVOCATION_PENDING_BLOCKED`，不宣称 F 已成立。
- **旧 Session/长连接**：F 前必须关闭并证实旧 listener、旧 context 和 worker 不可再写；新服务只从有效完整 CRL 和批准 enrollment 创建新 TLS context，不依赖 B8-4 的一次 `session_reused=False` 宣称恢复永久禁用。
- **启动失败**：任何可信 anchor、受信 generation、CRL、enrollment、时间、DB/WAL 与审计不一致均不启动服务；不从旧 `revoked=false` 缓存恢复。
- **撤销后只读查询**：已撤销身份不允许 `HEAD_READ` / `COMMIT_LOOKUP`；未知结果通过另行批准的恢复身份或离线只读取证。
- **独立故障域界限**：Mac 内的停服证据至多证明本节点拒绝能力，不等于整个证书生态撤销完成或跨故障域持久性证明。

首版**不实施在线热撤销**。以后如要求不中断服务的撤销，需要与 SQLite `BEGIN IMMEDIATE` 序列化提交一致的受信授权 generation/epoch，可能影响持久化 schema；应单独提出架构、测试及迁移审批。

## 5. 边界扩展、替代方案与实施前授权

| 方案 | 价值 | 影响与代价 | 决策 |
| --- | --- | --- | --- |
| **B1：Enrollment + 完整 CRL + stop-and-replace fence** | 双层撤销并有明确生效点；首版无在线撤销 API，暂不改 CAS SQLite v1 schema | 撤销期间停服；新 CA/CRL owner、generation、fence/审计、重启与负例测试不可省 | **本合同选定首版语义** |
| B2：CRL + 在线热撤销，与 CAS 事务 revision 同步 | 可持续服务 | 新的原子授权 owner、schema、死锁/回滚风险与迁移；不属于首版范围 | DEFERRED |
| A：只依赖 Enrollment | 维护简单 | TLS 握手不能验证撤销，不符合已选双层方向 | 不采纳 |
| 外部独立 CA/CAS | 改善 anti-rollback/故障域 | AWS/IAM/联网/成本及运维边界扩张 | 需独立项目 |

新增/变更的职责在本合同中**只定义，不执行**：

1. CA/CRL operator：完整发行总账、私钥保管、受信签发/撤销回执、CRL 原子交付与独立受信版本记录。
2. TLS transport owner：验证受信 CA+CRL，启用相应 flags，版本与超时 fail-closed、会话缓存策略及 SSLContext generation 的安全轮换。
3. Enrollment owner：基于真实受信 InstallationAnchor 的独立审批与撤销、证书 pin、角色单向收缩，禁止 Guest 自注册。
4. Fence/审计 owner：强制停止接入、隔离并证明无在途提交、保证旧身份不能在 F 后写入，处理 UNKNOWN、发布新 generation/恢复记录。
5. 保留 CAS v1、P1 Receipt、Wire v1、17 Bundle：如需跨崩溃单调版本源或在线热撤销 schema，必须另议新 owner 与版本/迁移。

**实施门禁**：代码修改、证书/CRL 管理器、可信 Anchor、SQLite/Enrollment 真实数据、Mac/Guest 运行、Guard、Docker/生产操作全部须先明确责任归属、风险/替代方案，并得到用户的**单独授权**。本文件的合并不能被解释为上述许可。

## 6. 验收矩阵 T01—T08

| 测试 | 后续验收必须成立的事实 |
| --- | --- |
| T01 正常双层认证 | 受信完整 CRL、有效证书、精确 enrollment/Anchor、最低所需角色在批准的 LAB CAS 下通过；始终不授予 Docker 启动。 |
| T02 CRL 失效 | 缺失/过期/错签名/issuer/AKI/CRL Number 倒退/总账不完整，均不监听或 DENY；不得 CA-only 回退。 |
| T03 双层不一致 | CRL 已撤销但 enrollment 未撤销，或 enrollment 已撤销但 CRL 未发布，均 DENY；后一种须停机直至双层一致。 |
| T04 旧会话撤销 | 在长连接/待提交/显式 Session ID 或 Ticket 恢复尝试时启动撤销；F 后旧身份无任何成功 CAS COMMIT。 |
| T05 UNKNOWN | `CAS_SUBMIT` 在 SQLite COMMIT 前/中/后断连、kill、回执丢失；只读对账，禁止自动重试/扩大 epoch。 |
| T06 身份轮换与克隆 | 换 leaf、原 VM/Guest Clone 重用证书，错 anchor/host/install/role，未审批身份全部拒绝。 |
| T07 事故/回滚 | CRL 发行成功但投送失败、旧 context 未关、时钟回退、旧 generation 恢复，均停服并保持待处理，不能误报生效。 |
| T08 耐久/恢复 | 验证 CRL/审批/版本/审计证据、进程/断电恢复、无静默回退；不一致保持 DENY。 |

验证层级严格分离：**离线合同/Mock → TLS_ONLY → 经授权的 Mac CAS+SQLite LAB_ONLY → 正式 Guard/跨故障域**。现有 B4～B8 的前两层证据不能替代后两层。

## 7. B9-DECISION 文档冻结与交接

- 本合同明确选择 Option B 双层撤销与首版 B1 fenced stop-and-replace；D01–D08、CRL 生命周期、撤销生效点 F/UNKNOWN、T01–T08 是**可作为后续实施基线的文档合同**。
- 实际 owner/审批人、可信时间/最低 CRL number 存放后端、正式 InstallationAnchor 发行、可执行进程 fence/generation 机制、CRL 发行工具及证书资料尚未选择或实现；不能用本合同宣称它们已通过。
- 本批只增加/同步架构文档，不修改服务源码、SQLite schema、测试、依赖、CI、Prisma、密钥、17 Bundle 或任何运行环境。
- 下一阶段仅可按既有规则先执行 **B10-TLS 只读就绪与缺口审计**；真实 Mac/Guest 负例测试、B1 安全功能代码、注册/发证、CAS 服务均需要独立执行授权。

`B9_DECISION_DOC_FROZEN / OPTION_B_B1_SELECTED / IMPLEMENTATION_NOT_AUTHORIZED / FORMAL_ANCHOR_NOT_PRESENT / CAS_NOT_RUN / P1_DENY / P0-01_NOT_RUN / PRODUCTION_NO-GO`
