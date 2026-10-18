# SanQ 项目持续工作日志

## 2026-10-18 — Runtime C2-0 / C2-1A–D 生产式恢复实测记录与文档收口

**状态：OPERATOR-REPORTED C2-0 OBSERVATION + C2-1A–D SYNTHETIC NEW-INSTANCE RECOVERY / LOCAL DOCS REVIEW / NO PR / C2 STILL OPEN。** 基于最新 `origin/dev@5d69eb81` 新建 `docs/runtime-c2-recovery-evidence-closeout-20261018`，审阅 AGENTS/CI/R0/G2/B2B2/现行备份恢复手册；将用户在 Mac VirtualBox 的 C2-0 Host/Guest 普通用户观察、源磁盘/快照/隔离、C2-1 指定 snapshot → 独立 VM、新磁盘与 MAC、Ubuntu/loader baseline `diff=0`、Host-only 合成 HTTP 200/停止后 curl 7、C2-0/C2-1 证据包本机与 Google Drive 下载 SHA 校验 `OK` 的实际范围写入 [B2B2 §9](C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md)；同步 [R0](Runtime更新-R0冻结设计.md)、[G2](c5-g2-trusted-runtime-contract-2026-10-13.md)、[依赖图](current-dependency-graph.md)、[Lightsail DR 草案（备份恢复手册附录 A）](../runbooks/backup-recovery.zh-CN.md)，并校正 B2B2-B1 PR #2861 / CI #7352 / dev `5d69eb81` 已合并事实。**限制：**C2-0 与恢复后 Guest SSH、HTTP 服务外层 SSH rc 未捕获，首次停止 404 已保留；C2-1 archive 完整 SHA 值未在对话提供、离机原件未被 MCP 独立重读。C2-1 为 `clonevm --snapshot --mode=machine` 而非真正 `snapshot restore`，故原 C2-02 与独立见证门禁仍 OPEN；没有真实 Web/API/DB/Static IP/Cloudflare/供应商或 root 测试，**C1/C2 OPEN / C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED**。文档-only，无 owner/依赖/SCC/Bundle/CI/Prisma/业务或生产写入。MCP-workspace 不运行 lint/build/test；首次远端交付待用户审阅授权。

## 2026-10-18 — R1 / B4B-3B-2B2-B1：受限 symlink FD 合成候选解析器

**现行续记：PR #2861 / CI #7352 (run `39103592288`) 已成功合并 dev `5d69eb81`；仅合成检查，不是 Guest/C1/C2/生产验证。以下 LOCAL/NOT RUN 为首次写入时的历史状态。** **历史状态：LOCAL SOURCE + SYNTHETIC TESTS AUTHORED / NOT RUN / NO PR / USER REVIEW PENDING。** 最新源 `origin/dev@c9bfa566`（#2860 设计评审/CI #7350 已合并），工作分支 `feat/c5-g2-b4b3b2b2b1-controlled-alias-fds-20261018`。新增 `root_python_dependency_alias_fds.py` 与 `test_root_python_dependency_alias_fds.py`，精确声明的目录/leaf 链接由 Linux `O_PATH | O_NOFOLLOW` 持有并从链接 FD 读取 link text，限定相对/绝对目标归一、owner/权限/inode、mount ID/namespace、预算与前后验证；对原 B2B1 旧 no-follow 行为作独立回归，合成借出 FD 可送已有 observer 但任何结果仍为 `BLOCKED`，绝不升级权限。无业务 owner、跨模块导入依赖边、SCC/baseline、Runtime 17、HTTP、schema/迁移、CI、依赖、权限/生产写入变化。本地 MCP-workspace 不执行 test/lint/build；真实 Guest、C2 restore、root-anchor/外部 pin/动态消费证据未执行。详见 [B2B2 §8](C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md)。仅获源码和合成测试授权，首次远端推送需另审。**C1/C2 OPEN / C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED**。

## 2026-10-18 — R1 / B4B-3B-2B2-B 受控解析专项评审与 C2 Guest 就绪准备

**状态：MCP-WORKSPACE LOCAL DESIGN/READINESS / USER REVIEW PENDING / NO PR / NO GUEST OR ROOT EXECUTION。** 基于 `origin/dev@d5a8ba0dfc45ed349aa65edba160b0ffa5ee4386` 独立分支 `docs/runtime-b2b2b-c2-readiness-20261018`，审阅 AGENTS/CI、R0/G2、B2B2-D/2B1、实际 manifest/alias/path-FD/observer/offline 实现；更新**原有** #2859 同批记录为 MERGED / SYNTHETIC CI GREEN，不重复开发纯声明模型。新增 [受控解析/C2 就绪评审与准确操作清单](C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md)：根锚/别名/loader/FD/独立 pins 与重复 inode、mount/竞态 fail-closed 语义，C2 只读取证、经新授权才可执行的快照恢复演练、矩阵及分批审批。未实施 B2B2-B 源码、未运行 Guest/快照/云操作或 MCP-workspace 测试；未改 Runtime 17 项、B2B1 no-follow、CI/依赖/Prisma、业务 owner 或依赖边/架构基线/生产状态；R0 D1–D5 不重开，C1/C2 和 C5-G2 仍 NO-GO，S2 daily 扩充继续暂停（现役 timer 不变）。首次远端交付另需用户审阅授权。

## 2026-10-18 — R1 / B4B-3B-2B2-A：有限纯内存 usrmerge 别名声明模型

**状态：MERGED / SYNTHETIC CI GREEN：PR #2859，final head `d366d62a906fe5060f1dbfe85b6e930bfbe77dab`，CI #7348 / run `39101080529` 成功（选中 `ci-change-scope`、`ops-checks`、`api-checks`、`build-test (api)`；Runtime 281 tests OK、Release 45 tests OK；其余按范围跳过），dev merge `d5a8ba0dfc45ed349aa65edba160b0ffa5ee4386`。** 已合并的设计评审 PR #2858、CI #7346、dev `c9db47b7` 是本批源代码基线；实施分支 `feat/c5-g2-b4b3b2b2a-inert-alias-contract-20261018`。新增 `ops/runtime/root_python_usrmerge_alias_claims.py` 和 `ops/runtime/tests/test_root_python_usrmerge_alias_claims.py`，仅使用调用方提出的 B4B-3A manifest/pins 和固定两类**合成** `/lib`、`/lib64` 前缀关系，在内存中严格拒绝额外/错误/冗余路径与超预算；所有模型输出仍是 `decision=BLOCKED`。不会验证真实 Ubuntu 布局、根锚、FD→路径、外部独立来源或 Python/ELF/dlopen 动态闭包，不允许接入现有 B2B1 严格 no-follow 开启器或执行候选代码。无业务 owner / 依赖图基线 / Runtime 17 / 新依赖 / CI / Prisma / 权限 / Guest/root/生产写入变化。MCP-workspace 未运行测试；#2859 的 GitHub Actions `ops-checks` 已有权威**合成**结果，并非全站 E2E、真实 Guest、路径/FD 来源或 C1/C2 通过；B2B2-B 实际可信别名证据链仍单独评审。详细见 [B2B2 评审/实施记录](C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md)。C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED。

## 2026-10-18 — R1 / B4B-3B-2B2-D：Ubuntu usrmerge 别名与可信根锚设计评审

**状态：LOCAL DESIGN REVIEW / USER REVIEW PENDING / NO PR / NO IMPLEMENTATION。** 以 `origin/dev@1a82caff` 和已合并 PR #2857 / CI #7344 为基线，审阅 B4B-3B-2B1 的严格 `O_NOFOLLOW` FD 开启、B4B-3A 固定 `/lib64` loader 路径与 Ubuntu usrmerge symlink 的不兼容处。对比保持严格 no-follow、另建经外部认证的有限 alias 策略、以及不安全的 `realpath`/任意 symlink 直开三种方案；推荐独立审核 B 方案，**未经用户专项批准不得放宽现有代码的 fail-closed 路径规则**。本批仅新增 [B4B-3B-2B2 评审](C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md) 并按真实 PR/CI 更新 B2B1、R0、G2 和依赖图，不修改业务 owner、依赖图边、Runtime 17 文件 Bundle、接口/CI/依赖/Prisma、Guest/root/生产状态；未运行本地测试。C1/C2 和 C5-G2 NO-GO 未关闭；S2 DAILY CONFIG EXPANSION PAUSED，现役备份 timer 不变。

## 2026-10-18 — R1 / B4B-3B-2B1：受控路径 FD 候选开启

**状态：MERGED / SYNTHETIC CI GREEN：PR #2857，head `9ad184a350189d58b557419434d50efd062c3361`，CI #7344（run `39098295751`；选中检查均通过），dev merge `1a82caff22b49881aad2893ae1c9374c03c97ffb`。** 基于最新 `origin/dev@b309c1bb` 的独立分支 `feat/c5-g2-b4b3b2b1-fd-anchored-paths-20261018`。承接 PR #2855 已合并 `dev@2db85d32` 的 Python AST / ELF 静态线索，按照 R0 D1 最小增量新增 `root_python_dependency_path_fds.py` 与纯临时文件合成测试：由调用方传入不自证的 root-anchor FD，基于 B4B-3A 的候选白名单逐段只读、nofollow 开启，保留入口/FD/owner/device/inode/permissions 身份、预借出/结束后复核，供 B4B-3B-1 候选摘要读取。会严格拒绝真实 Ubuntu `/lib64` 等 usrmerge symlink（不能擅自放宽），不证明 `/` 根锚与外部来源，也不执行真实系统/Guest/root。未改旧组件公共合同、17 文件 Runtime Bundle、模块归属/架构基线、CI/依赖/数据库/生产状态。根据最新 CI 范围选择机制，Runtime 测试已在 PR #2857 的 `ops-checks` 运行并通过；MCP-workspace 本地未运行；此 CI 仅证明合成测试。见 [B4B-3B-2B1 文档](C5-G2-B4B3B2B1-受控路径FD候选开启.md)。下一步需独立评审真实 usrmerge 路径解析、可信锚点与离机来源、Python/ELF 动态闭包及 B4B-3C C2 真实恢复演练；**C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED**。

## 2026-10-18 — CI：全部作业按变更范围启动（同批扩展）

**最高状态：REMOTE DELIVERY / [PR #2856](https://github.com/sanqin888/sanqinMVP/pull/2856) / CI+MERGE: SEE PR FINAL HEAD。** 交付分支 `ci/dependency-aware-check-scope-20261018` ，源码审阅基线 `origin/dev@2bab5fe653babb89092f5c102a159d23edc81988`。按用户补充要求，将本批 E2E-only 选择器原子替换为通用 CI 范围与汇总合同；Ops 安全/API 静态/Jest/Web/E2E/printer/Windows 与两镜像仅在有关时启动。保留 API Jest 对 Web 源码的真实架构依赖、Runtime/Release 相互导入、workspace manifests 对两端的影响；原检查名、汇总失败语义、main 完整验收、成对发布/证明不变。不新增依赖/Action/权限，不改业务代码、owner/依赖图/架构基线、schema/migration、17 文件 Bundle 或生产。已编写合成 Git/汇总边界测试，但未在本地或远端执行；用户已授权远端交付；交付基线为最新 `origin/dev@2db85d32541f05e7e3268e7f5a2013812d59690e`，CI/合并以 PR 最终 head Checks 与事件为权威。详见 [CI 范围合同](CI按变更范围执行.md) 与 [CI 工作包](postmod-ci-performance.md)。本条替换同批原 E2E-only 记录，不重复登记批次。

## 2026-10-17 — R1 / B4B-3B-2A 静态 Python / ELF 依赖线索（本地）

**最高状态：PR #2855 OPEN / FIRST CI #7338 FAILED (synthetic fixture overlap) / LOCAL FIX AUTHORED / RERUN PENDING**，本地分支 `feat/c5-g2-b4b3b2a-static-dependency-evidence-20261017` 基于 PR #2854 合并后的 `origin/dev@2bab5fe653babb89092f5c102a159d23edc81988`。B4B-3B-1 已合并：PR #2854，CI #7336 全绿，merge SHA `2bab5fe6`。本批新建独立外置 `ops/runtime/root_python_elf_static_hints.py` 和只用内存源代码/ELF64 人工字节的合成负向测试，提取 Python AST import、ELF PT_DYNAMIC / DT_NEEDED 有限静态依赖线索，记录相对/from/动态导入、ELF 搜索/loader/标签歧义。不是 FD→真实路径认证、完整运行时 import/ELF/dlopen 闭包或来源可信认证；永久拒绝生产 authority。未改 B4B-1/2/3A/3B-1、Runtime 17、业务模块 owner/dependency、CI/依赖/Prisma/部署。文档：[B4B-3B-2A](C5-G2-B4B3B2A-Python与ELF静态依赖线索.md)。首次 PR #2855 / CI #7338 的 `api-checks` 因合成 ELF fixture 中 PT_DYNAMIC（含 RUNPATH）覆盖 PT_INTERP 导致 1 个测试报错；本批在同一 PR 内将 fixture 的 PT_INTERP 调整至不重叠偏移，保留解析器严格拒绝畸形 PT_INTERP 的行为；修复后的 CI 仍需重新运行并全部成功，不预先宣称通过。MCP-workspace 未运行 lint/build/test。后续 3B-2B 真实开链/依赖发现及 3C C2 后实测，均须独立审阅。**C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED**。

## 2026-10-17 — R1 / B4B-3B-1：只读 FD 依赖证据及离机比对

**最高状态：LOCAL SOURCE + SYNTHETIC TESTS AUTHORED / NOT RUN / USER REVIEW PENDING / NO PR。** 基于最新 `origin/dev@1bc1381c` 在 `feat/c5-g2-b4b3b1-readonly-dependency-evidence-20261017` 开展。Runtime 在 B4B-3A 有界声明清单外新增两个非授权外置模块（预打开只读 FD 摘要/metadata 收集、离机 manifest/pins/原始记录摘要一致性比对）及合成负向测试，实际 FD→路径独立真实性、外部 pin 保管链、Python/ELF/dlopen 传递依赖发现均保持未认证，不引入 Host/Guest/root 调用或生产入口。D1–D5 R0 冻结设计及原 B4B-1/B4B-2/B4B-3A 不改；17 文件 Runtime Bundle、CI、所有者/依赖边、schema/迁移/依赖锁与运行状态不变。本地工作区未运行 lint/build/test，待用户授权远端后通过 GitHub Actions 检验。详见 [B4B-3B-1 合同](C5-G2-B4B3B1-只读FD证据与离机比对.md)。下一步 B4B-3B-2 真实路径/独立来源与模块发现须单独审阅，B4B-3C 先满足 C2 并另授实际 Guest 命令。**C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED**。

## 2026-10-17 — Runtime R0：D1–D5 一次冻结与全仓文档对齐

**最高状态：D1–D5 APPROVED / R0 DESIGN FROZEN / DOCUMENTATION COMPLETE / REMOTE DELIVERY / PR #2853 / CI+MERGE: SEE PR FINAL HEAD；C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED。** 基线 `origin/dev@592c534896d18ca51082b708b8ab677402fabe4a`，分支 `docs/runtime-r0-design-freeze-20261017`。

按用户明确批准冻结 D1 有限独立平台与执行闭包、D2-A 有限维护窗口、D3 crypt/Drive create-only 真适配优先、D4 preinstall 先于 S2 扩充、D5 Abort & Clean Reinstall。新增 [R0 冻结设计](./Runtime更新-R0冻结设计.md)，统一 C1–C8、R0–R5、18 组验收与 I1–I6 中断点；同步 G2、Kit、S1、安装约束、状态/runbook、总队列/索引与依赖图。全仓 96 份 Markdown 纳入核对；旧实验/归档/原始证据保持其事实和原状态，仅在适用旧篇加当前入口。B4B-3A 更正为 PR #2848 / CI #7315 已通过，不提升实际采集或安装资格。

仅文档；无代码、17 文件 Bundle、依赖、owner/graph/baseline、CI、权限、云/VM、生产、Prisma/schema/migration 变更；不清除 PEM 等其他批次已有迁移要求。未运行本地 lint/build/test 或 Guest/root/Kit 实验。检查文档引用、字节/readback、历史保真及 diff/status；真实验收与 GitHub CI 不宣称通过。用户已审阅并明确授权本批远端交付，现通过 [PR #2853](https://github.com/sanqin888/sanqinMVP/pull/2853) 交付至 dev；CI/合并以该 PR 最终 head 的 Checks 与事件为权威，本文不预先声明 CI 通过。后续从 R1 继续，不重复请求批准 D1–D5。


本文件遵循仓库 `AGENTS.md` 第 19 节，按批次记录项目后续开发、维护和验收。文件超过 1,000,000 UTF-8 字节前，应续写同目录的 `worklog2.md`，依次递增；旧的 `modularization-worklog*.md` 仍保留为历史资料。

## 2026-10-17 — PEM：付款异常通用案件、STAFF 申请和 ADMIN 审批

**最高状态：MCP-workspace LOCAL SOURCE + TESTS AUTHORED / NOT RUN / MIGRATION REQUIRED / NO PR。** 基线 origin/dev@9621e6af，分支 feat/pem-payment-exception-cases-approval-recovery-20261017。Payments 新增 Case/Evidence/Approval/Execution 与窄公共能力；编排复用既有原付款、Checkout/Benefits RELEASE、Terminal Fence 机制；POS Sandbox 操作员免角色审批但保留隔离环境与完整资金/设备安全检查，Production STAFF 申请、ADMIN+MFA 审批，仅已证实最终失败的资金可受控释放，未决只能调查。AGENTS 第14节经用户专项授权扩展隔离 Sandbox ALL_ATTEMPTS_FAILED 的 PEM 例外，旧 504/NOT_FOUND flag 逻辑保留，避免误将人工未收款记为 Clover 取消。四张 Prisma additive-only 模型需用户本地生成迁移；无依赖/CI/生产 Web Ecommerce 改动，不变更直接跨上下文导入规则或架构基线；差异/CI scanner 待审。详细：docs/payments/支付异常管理-PEM.md；本地未提交/推远端，未进行任何 Sandbox 数据/设备写操作。

## 2026-10-17 — C5-G2 / B02-B4B-3A：Python 依赖闭包清单第一批

**状态：MERGED / SYNTHETIC CI GREEN；PR #2848，merge `dda7698e00effc37e1e8a76aba7c43e50f8f4061`，CI #7315。** 分支 `feat/c5-g2-b4b3a-dependency-closure-manifest-20261017`（基于任务开始时最新 `origin/dev@1cd89d9e`）。新增独立 `ops/runtime/root_python_dependency_manifest.py`：纯内存结构审查含 stdlib .py、package、CPython native extension、ELF loader、shared libraries、builtin/frozen 和 Linux vDSO 的**声明式**哈希与依赖图；异常缺失与不匹配 fail-closed，声称的清单结构闭合仍永久拒绝认证和生产安装。配套合成测试 `ops/runtime/tests/test_root_python_dependency_manifest.py`；不改 B4B-1/B4B-2、17 文件 Runtime Bundle、现有业务所有者/依赖边/架构基线、CI、依赖锁文件、数据库迁移和生产状态。真正 Guest 哈希清单、完整传递导入/ELF 依赖动态可信采集和独立见证仍为 B4B-3B/C 的单独门禁。详见 [B4B-3A 清单合同](./C5-G2-B4B3A-Python依赖闭包清单.md) 及 [C5-G2 可信 Runtime 契约](./c5-g2-trusted-runtime-contract-2026-10-13.md)。最高状态 MERGED / SYNTHETIC CI GREEN，`C5-G2 NO-GO` / `S2 PAUSED`。


**R0 进度校正：**该批已通过 PR #2848 合并，final head `d4d5513f5dc734e0f9b9321e99e49582073cd263`，CI #7315 / run `39077195858` 成功。没有执行本地 lint/build/test；仅合成声明图，不代表真实文件/依赖采集、Guest/root 或生产验收。后续 B4B-3B/3C 进入 R0 队列 R1。

## 2026-10-17 — 文档清理第一批：过期入口与引用收口

**状态：本地改动已审阅并获远端交付授权，现通过 [PR #2849](https://github.com/sanqin888/sanqinMVP/pull/2849) 交付。CI 与合并的权威证据以该 PR 最终 head 的 Checks 和合并记录为准；本文不预先声明 CI 通过。未执行本地 lint/build/test。** 交付分支 `docs/cleanup-obsolete-entrypoints-batch1-delivery-20261017`，已对齐 `origin/dev@dda7698e`；原本地审阅基线为 `1cd89d9e`。第一批移除 Web 通用模板、旧 Uber state 迁移建议及已被替代的 GHCR Batch B/C2/C4-A 文档；在中文文档索引中保留现行 schema/历史 migration/Phase 8 的证据去向，在新的 GHCR 状态入口承接既有发布、迁移、备份、PENDING/回退和 Runtime 安装门禁；同步更新根 README、C0 历史说明和 R5 runbook 引用。属于文档内部原子清理：业务代码、所有权、公共/持久化合同、依赖图/架构基线、CI、Prisma schema/migration、生产主机及历史日志均无变更。另一个 Runtime 任务经 PR #2848 合入后，在最新 origin/dev 上准备独立交付，仅追加本条日志，保留其原记录；本批不包含该任务的源码/测试。后续交付状态更新本条记录。详见 [项目文档索引](../文档索引.md) 和 [GHCR 发布与 Runtime 状态](../runbooks/GHCR发布与Runtime状态.md)。

## 2026-10-17 — 文档清理第二批：Runtime 旧方案整合

**状态：本地改动已审阅并获远端交付授权，现通过 [PR #2850](https://github.com/sanqin888/sanqinMVP/pull/2850) 交付。CI 与合并的权威证据以该 PR 最终 head 的 Checks 和合并记录为准；本文不预先声明 CI 通过。未执行本地 lint/build/test。** 分支 `docs/runtime-history-consolidation-batch2-20261017`，基线 `origin/dev@94bc7be6`。逐篇承接并删除 27 份旧 GHCR/Runtime 方案，新增中文 [交付与安装约束](./Runtime交付与安装约束.md) 与 [历史决策/证据索引](./Runtime历史决策与证据索引.md)；保留 exact Bundle、发布/历史来源、staging、动态状态、备份/消费者、维护屏障和新独立重装约束，并索引原文/blob身份、U2C/2B2-B有限范围PASS、SIGKILL边界与退役冷断电NOT EXECUTED/归档哈希。同步 GHCR 状态入口、R5、项目索引、G2/Recovery Kit/S1 导航，不重写历史日志或原始JSON，不修改代码/测试、17项Bundle、owner/依赖图/架构基线、权限/CI、Prisma/schema/migration、生产主机和VM/离机资产。G2 NO-GO、S2扩充接线暂停及各阶段授权门禁保持原意；本批不构成新实验或生产验收。后续CI/交付更新本条，不重复登记批次。

## 2026-10-17 — 文档清理第三批：已完结工作包全文归档

**状态：本地文档改动已审阅并获远端交付授权，现通过 [PR #2851](https://github.com/sanqin888/sanqinMVP/pull/2851) 交付。CI 与合并的权威证据以该 PR 最终 head 的 Checks 和合并记录为准；本文不预先声明 CI 通过。未执行本地 lint/build/test。** 分支 `docs/archive-completed-work-batch3-20261017`，基线 `origin/dev@b3179ff4`（第二批 PR #2850 已合并，最终 PR CI #7321 七项成功）。将 17 份已完结记录迁入 `docs/archive/`，保留全部原文字节/Git blob 身份及旧路径映射；新增 [归档索引](../archive/README.md)、[长期约束](./已完结工作长期约束.md) 和 [浏览器 E2E 说明](../../apps/web/e2e/README.md)，将 A4 真实运行观察承接到现行工作站手册。同步项目入口、Backlog/Roadmap、依赖图中的文档引用与兼容登记证据路径；只有定位改变，compat_id/状态/owner/退出条件、依赖边/计数/架构基线均不变。Phase 7 保持源码/架构关闭的限定范围，Phase 9/Payroll/provider 及设备的递延证据仍显式保留，不宣称重新完成生产验证。历史 modularization 日志、原始 JSON 收据、Phase 6/8、Payroll、现役 Runtime、代码/测试、schema/migration、依赖/CI 和生产/VM/离机资产不变。详见归档索引；后续交付状态更新本条，不重复登记批次。
