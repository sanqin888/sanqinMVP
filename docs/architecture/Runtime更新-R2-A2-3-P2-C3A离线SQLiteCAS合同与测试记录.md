# R2-A2-3 — P2-C3A 离线 SQLite CAS 合同与失败测试记录

> 2026-10-24（America/Toronto）｜**MCP-WORKSPACE LOCAL IMPLEMENTED / REVIEW PENDING / TESTS NOT RUN / MAC/VM NOT TOUCHED / NO PR**。本批已得到 P2-C3A 的限定授权：仅在 Runtime/Ops 源码中新增离线 SQLite CAS 核心、V2 提交/查询合同和测试；保留 P1、A2-1、17 文件发布清单和所有 DENY；不得安装 Mac 服务、碰 VM 或生产。

## 1. 依据与范围

- 根 [AGENTS.md](../../AGENTS.md)、[R0 冻结设计](Runtime更新-R0冻结设计.md)、[R2-A2-2 守卫设计](Runtime更新-R2-A2-2禁入适配器与安装权限撤回设计.md)、[R2-A2-3 前置审计](Runtime更新-R2-A2-3隔离启动屏障PoC就绪与持久化前置审计.md)、[VB-READ-001](Runtime更新-R2-A2-3-VB-READ-001环境核验与下一步审批.md) 和现有 P1 `maintenance_boot_guard_contract.py`、`maintenance_boot_guard.py`、测试、`.github/workflows/ci.yml`。
- 用户当次 Mac P2-C1 现场回执：macOS 10.15.8 x86_64，用户 Python 3.8.2/SQLite 3.28.0，本地 APFS/FileVault，Host-only bridge100；**以上是运营者提供的环境信息，不是本次源码执行或 Mac/CAS 实机验证**。
- 新增 `ops/runtime/maintenance_off_host_cas_contract.py`：`OfflineCasSubmission` 包含原 P1 `CasRequest`、完整 canonical state bytes、anchor SHA 和实验客户端身份声明；`OfflineCasReceipt` / `OfflineCasLookup` / `OfflineCasHead` 明确只具有 `UNAUTHENTICATED_OFFLINE_LAB_ONLY` 等级，不是 P1 `CustodyReceipt(location=OFF_HOST)`，也不含启动权限。
- 新增 `ops/runtime/maintenance_off_host_cas_sqlite.py`：`initialize_offline_lab` 必须显式调用以登记 synthetic anchor 和声明身份，普通读/提交仅以 `mode=rw` 打开已存在数据库；私有父目录要求 0700 且属当前用户，数据库要求 0600、regular、单硬链接；这只是离线实验前置检查，**不构成 root-owned/抗 TOCTOU 安装证明**。
- 新增 `ops/runtime/tests/test_maintenance_off_host_cas_sqlite.py`：合同、独立连接竞争、错误前驱/nonce、错误身份、RELEASE 禁令、损坏、提交前/提交后模拟中断、重开读回、实验回执不可获得 P1 启动权限等。
- SQLite schema `user_version=1`：`enrollments`、`heads`、`commits`、`audit_events`；只针对合成独立 DB，不使用 Prisma/PostgreSQL，不含真实业务数据。审计事件仅记录**已成功提交**的实验事务；尚无持久独立的失败请求审计。
- 无额外依赖/网络服务、SSH/HTTP、mTLS、证书、系统权限、Docker/systemd、Guest 投送、发布 17 文件清单的变更。

## 2. CAS 安全不变量与测试期待

1. 首次 epoch=1 必须是已明确登记锚点的 `INSTALLED_INACTIVE`；后继必须满足原 P1 epoch/revision、state hash、previous hash、host/installation/owner/txid 关联。
2. 在 `BEGIN IMMEDIATE` 内读取唯一当前 head；比对 `expected_epoch`/predecessor SHA，仅接受 `epoch+1`；同事务持久保存新 head、不可变提交内容、实验回执、审计事件。SQLite PK/UNIQUE 约束覆盖 host+installation、epoch、request hash、nonce 和 proposal hash。
3. 离线状态序列仅允许 `INSTALLED_INACTIVE→READY_TO_ARM→ARMING→FENCED`，并允许安全标记 `INCIDENT`；禁止任何 `RELEASE_PENDING`、`RELEASED` 或 INCIDENT 后恢复。实验接口从不启用真正 Guard。
4. 采用 WAL、`synchronous=FULL`、`fullfsync=ON`、`checkpoint_fullfsync=ON`、`foreign_keys=ON` 候选设置并由每个连接读回检查、执行 `quick_check`。PRAGMA 支持/回执不自动证明 Mac 真实 F_FULLFSYNC 或物理断电耐久性。
5. 重复提交必须作为写冲突拒绝；接收端丢失响应时使用 `lookup_commit(requestSha256)` 与权威 `read_head` 读回，不能自动推进新的 epoch。可查询已提交的旧 receipt，但 `is_current_head=false` 不代表放行。
6. `_test_interrupt=before_commit` 注入事务回滚，`after_commit` 注入已提交但响应丢失；两者都是 **synthetic 异常模拟，不是进程崩溃、Host 掉电或真实 Guest/Host 网络断线**。

## 3. 已知不满足的生产门禁

- 实验客户端身份是传入并与本地登记比对的**普通字符串声明**，不存在 mTLS、签名、独立权限与证书轮换。任何本机同权用户理论上可以冒充客户端；不得宣称 OFF_HOST_AUTHENTICATED。
- Mac 的一份 SQLite DB、WAL 和日志处于同一宿主/故障域；不能抵抗同一权限主体恶意篡改或整盘回滚；状态哈希链并不建立外部最新 epoch 证明。P2-C3B 需要真实文件/进程层验证，C3C 需要独立身份和网络连接审批。
- `fullfsync` 与 `checkpoint_fullfsync` 的配置读回是配置测试，不是断电耐久或业务恢复演练；没有实际 Mac SQLite 文件创建、权限变更或掉电注入。
- 真实 Linux root 安装锚点、启动早于 daemon 的 systemd/drop-in 和 socket/direct-dockerd 绕过、writer quiescence、双回执和 RELEASE 仍**没有实现**；A2-1/P1 `DENY` 原样保持。
- 整体 VM 恢复能力的 P2-B `PASS_SCOPED` 来自用户提供的 Mac/Guest 操作回执，不升级为 `P0-01` 测试成功。
- 当前 CI 不在 MCP-workspace 运行；本批源代码测试和 GitHub Actions **均未实际执行**，须在本地审阅后经额外远端提交授权才有 CI 权威结果。

## 4. 交付与下一道审批

目标工作区分支 `feat/runtime-r2a2-3-p2c3a-offline-sqlite-cas-20261024`（基于当前 `origin/dev`）。本批仅本地文件修改，不提交远端，不新建 PR。下一阶段需先取得用户代码审阅和远端授权，CI 全绿后再讨论 P2-C3B Mac 用户态真实持久化测试的准确命令/目录/恢复边界；网络服务、mTLS、launchd 和 Boot Guard 安装分别请求授权。

`P2-C3A LOCAL_IMPLEMENTED / TESTS_NOT_EXECUTED / REVIEW_PENDING / P2-C3B NOT_AUTHORIZED / P0-01 NOT_RUN / PRODUCTION NO-GO`。
