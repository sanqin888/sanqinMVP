# SanQ 项目持续工作日志

## 2026-10-17 — R1 / B4B-3B-2A 静态 Python / ELF 依赖线索（本地）

**最高状态：LOCAL SOURCE + SYNTHETIC TESTS AUTHORED / NOT RUN / USER REVIEW PENDING / NO PR**，本地分支 `feat/c5-g2-b4b3b2a-static-dependency-evidence-20261017` 基于 PR #2854 合并后的 `origin/dev@2bab5fe653babb89092f5c102a159d23edc81988`。B4B-3B-1 已合并：PR #2854，CI #7336 全绿，merge SHA `2bab5fe6`。本批新建独立外置 `ops/runtime/root_python_elf_static_hints.py` 和只用内存源代码/ELF64 人工字节的合成负向测试，提取 Python AST import、ELF PT_DYNAMIC / DT_NEEDED 有限静态依赖线索，记录相对/from/动态导入、ELF 搜索/loader/标签歧义。不是 FD→真实路径认证、完整运行时 import/ELF/dlopen 闭包或来源可信认证；永久拒绝生产 authority。未改 B4B-1/2/3A/3B-1、Runtime 17、业务模块 owner/dependency、CI/依赖/Prisma/部署。文档：[B4B-3B-2A](C5-G2-B4B3B2A-Python与ELF静态依赖线索.md)。MCP-workspace 未运行 lint/build/test，本地 diff/status 审阅后停下等待用户批准远端。后续 3B-2B 真实开链/依赖发现及 3C C2 后实测，均须独立审阅。**C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED**。

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
