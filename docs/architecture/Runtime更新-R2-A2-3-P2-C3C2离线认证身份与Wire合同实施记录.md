# R2-A2-3 — P2-C3C2 离线模拟对等身份绑定与 Wire 合同实施记录

> **2026-10-24 现行进度续记（下文为实施当时历史状态）：** P2-C3C2 已通过 [PR #2929](https://github.com/sanqin888/sanqinMVP/pull/2929) / CI #7508 全绿并合并 `dev@08e5031c`；目前 `dev@67a88aae` 已另合并 C1 文档（PR #2930），独立保留。后续 [P2-C3C3-READ TLS/Host-only 现场复核](Runtime更新-R2-A2-3-P2-C3C3-READ认证TLS与HostOnly就绪审计.md) 确认 Mac/Guest 支持 TLS1.2、Mac 全量 37 个 cipher 与 Guest 14 个 TLS1.2 cipher 名称交集 14/14，原先空集合源于旧 LibreSSL `protocol` 标签。**实际 mTLS、证书验证、CAS 网络、Boot Guard 正向权限均未验证和未授权**；C3C2 仍 `OFFLINE_SIMULATED_PEER_ONLY / decision=DENY`。

> 2026-10-24（America/Toronto）｜**LOCAL IMPLEMENTED / TESTS NOT RUN / REVIEW PENDING / NO PR / PRODUCTION NO-GO**。基线 `dev@09db31ec8575e4e4d3fb45fdfc88abd2161de5b6`（PR #2928 / CI #7506 SUCCESS）。用户要求合并后开始下一步，按已审 [P2-C3C1 方案 B](Runtime更新-R2-A2-3-P2-C3C1最小认证离机CAS信任边界设计.md) 在 MCP-workspace 实现**纯离线合成身份 / 协议合同**，只新增 Runtime/Ops 模块与负例，不实现 mTLS 服务、网络监听或真实运行权。

## 1. 审前规范、职责和兼容性

- 依据根 `AGENTS.md` 第 1、2、10、11 节、现有 `.github/workflows/ci.yml` Runtime `ops-checks`、[R0](Runtime更新-R0冻结设计.md)、[VB-04C](Runtime更新-R2-A2-3-VB-04C启动守卫安装依赖与撤回设计.md)、[VB-04D1](Runtime更新-R2-A2-3-VB-04D1离线Unit依赖与安装Manifest实施记录.md)、[P2-C3A](Runtime更新-R2-A2-3-P2-C3A离线SQLiteCAS合同与测试记录.md) / [P2-C3B](Runtime更新-R2-A2-3-P2-C3B-001Mac进程持久化实测复核.md)，并阅读 `maintenance_boot_guard_contract.py`、`maintenance_off_host_cas_contract.py`、`maintenance_off_host_cas_sqlite.py` 及对应测试。
- 采用**独立版本化的模拟身份合同**，不修改 P1 `CustodyReceipt`、`OffHostCasCustody`、P2-C3A 的原 SQLite schema、VB-04D1 的 9 项 manifest/Unit 所有权、17 文件发布清单、依赖或 Prisma。
- 安全不变量：P1 即使候选为 ALLOW 也仍 `decision=DENY`；所有 C3C2 静态身份绑定判定保持 `decision=DENY / authenticated_off_host=False / tls_verified=False / authorized_to_execute_cas=False / authorized_to_start_docker=False`。

## 2. 新增源码与测试

1. `ops/runtime/maintenance_off_host_auth_wire.py`：
   - `sanq.runtime.auth-cas-wire.v1`：限定 `HEAD_READ`、`COMMIT_LOOKUP`、`CAS_SUBMIT` 三操作；canonical ASCII JSON、上限 **32768 bytes**、精确字段集、拒绝重复 key/非规范编码/未知 schema；`CAS_SUBMIT` 重用现有 `CasRequest` + 完整 P1 canonical `BootGuardState` + anchor / identity 静态关联，拒绝 RELEASE/未知失败 phase。
   - `SyntheticPeerEvidence`：明确是**调用方注入、未受 TLS 验证**的合成证书指纹、CA 指纹和客户端身份声明，**不是已验证真实 peer fact**；`OfflineEnrollment` 只作为纯离线名单 fixture，绑定 host/installation/anchor/peer/CA 和 `READ`/`SUBMIT` 权限；没有网络 enrollment/证书签发或磁盘读写。
   - `assess_offline_binding` 只计算合成声明是否结构匹配；哪怕 `STATIC_BINDING_CANDIDATE` 也 **没有执行 CAS 或启动 Docker 的权力**。
   - `unknown_commit_recovery(request_sha256)` 明确 `OUTCOME_UNKNOWN_DENY`，仅建议 `COMMIT_LOOKUP→HEAD_READ` 查证，禁止自动重试写 CAS、递增 epoch、启动业务。
2. `ops/runtime/tests/test_maintenance_off_host_auth_wire.py`：25 项聚焦用例，覆盖三操作 canonical roundtrip、读/写角色隔离、伪造 peer/client/CA/Anchor、未登记/无效数据、重复/额外 JSON 字段、非规范与超长/NaN、CAS body/nonce/epoch/phase、未知提交结果及 P1/17 文件清单不变。

**重要说明**：本批不接 `OfflineSqliteCas.submit()`，不调用任何 TCP/SSL/进程或文件操作。证书 hash 字符串是 synthetic fixture，**不能由这些测试宣称真实 mTLS、证书链/SAN/撤销验证通过**。实际 mTLS 必须由独立 C3C3 transport 适配器提供经过独立验证的 peer 事实、明确信任根和注册权限；未实现前不得用于生产或真实 Boot Guard。

## 3. 已知缺口、交接与证据等级

| 待证门禁 | C3C2 的状态 |
| --- | --- |
| Mac Catalina / Python 3.8 SSL 能力、选定固定端口/防火墙与 Host-only 监听 | NOT_RUN / NOT_AUTHORIZED |
| CA/证书签发、Mac 私钥/Keychain、Guest 安全证书投送、吊销与唯一安装实例绑定 | NOT_IMPLEMENTED |
| TLS 真实性、双向信任、网络分包/超时/并发、崩溃及错 cert 实测 | NOT_RUN |
| Mac SQLite 真实服务与 Guest 客户端身份衔接 / 独立拒绝审计 | NOT_IMPLEMENTED |
| 数据库 off-host 真正独立物理故障域 / anti-rollback | UNPROVEN |
| 可信启动准入时序/ARMING TOCTOU、root 安装/Unit/Socket/直接 dockerd 和 shim writer | OPEN |
| P0-01A–F、S03/G06/S09、R2-C4、R3、生产 | NOT_RUN / NO-GO |

源码的本地编写不等于 CI 成功。MCP-workspace 没有 lint/build/test 执行权限；必须由用户审阅后批准首次远端 PR，经实际 GitHub Actions 全绿方能合并。用户许可本批的“合并后开始下一步”仅作用于**上述离线受限代码**，不构成证书、Mac/Guest/网络或生产授权。

## 4. 下一步建议

先完成 C3C2 本地差异审阅、远端 CI 与合并（另批授权）。之后建议 **P2-C3C3-READ — Mac/Guest TLS 能力、证书/监听/低权用户和实验目录的严格只读核验及精确授权方案**，先判断 macOS Catalina 是否满足所需 TLS/SAN 能力、证书生成与安全保管，确认旧 P2-C3B-001 数据库保持只读。只有后续准确批准才能开始 Mac Host-only mTLS 服务或任何 Guest 部署。

`P2-C3C1 MERGED / P2-C3C2 LOCAL_IMPLEMENTED_REVIEW_PENDING / C3C3-C4 NOT_AUTHORIZED / P0-01 NOT_RUN / S03-G06-S09 OPEN / PRODUCTION NO-GO`。
