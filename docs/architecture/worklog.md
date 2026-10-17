# SanQ 项目持续工作日志

本文件遵循仓库 `AGENTS.md` 第 19 节，按批次记录项目后续开发、维护和验收。文件超过 1,000,000 UTF-8 字节前，应续写同目录的 `worklog2.md`，依次递增；旧的 `modularization-worklog*.md` 仍保留为历史资料。

## 2026-10-17 — C5-G2 / B02-B4B-3A：Python 依赖闭包清单第一批

**状态：MCP-workspace 本地源码/合成测试完成、尚未运行 lint/build/test、等待用户审阅；未推送、未建立 PR。** 分支 `feat/c5-g2-b4b3a-dependency-closure-manifest-20261017`（基于任务开始时最新 `origin/dev@1cd89d9e`）。新增独立 `ops/runtime/root_python_dependency_manifest.py`：纯内存结构审查含 stdlib .py、package、CPython native extension、ELF loader、shared libraries、builtin/frozen 和 Linux vDSO 的**声明式**哈希与依赖图；异常缺失与不匹配 fail-closed，声称的清单结构闭合仍永久拒绝认证和生产安装。配套合成测试 `ops/runtime/tests/test_root_python_dependency_manifest.py`；不改 B4B-1/B4B-2、17 文件 Runtime Bundle、现有业务所有者/依赖边/架构基线、CI、依赖锁文件、数据库迁移和生产状态。真正 Guest 哈希清单、完整传递导入/ELF 依赖动态可信采集和独立见证仍为 B4B-3B/C 的单独门禁。详见 [B4B-3A 清单合同](./C5-G2-B4B3A-Python依赖闭包清单.md) 及 [C5-G2 可信 Runtime 契约](./c5-g2-trusted-runtime-contract-2026-10-13.md)。最高状态 LOCAL / UNTESTED，`C5-G2 NO-GO` / `S2 PAUSED`。

## 2026-10-17 — 文档清理第一批：过期入口与引用收口

**状态：本地改动已审阅并获远端交付授权，现通过 [PR #2849](https://github.com/sanqin888/sanqinMVP/pull/2849) 交付。CI 与合并的权威证据以该 PR 最终 head 的 Checks 和合并记录为准；本文不预先声明 CI 通过。未执行本地 lint/build/test。** 交付分支 `docs/cleanup-obsolete-entrypoints-batch1-delivery-20261017`，已对齐 `origin/dev@dda7698e`；原本地审阅基线为 `1cd89d9e`。第一批移除 Web 通用模板、旧 Uber state 迁移建议及已被替代的 GHCR Batch B/C2/C4-A 文档；在中文文档索引中保留现行 schema/历史 migration/Phase 8 的证据去向，在新的 GHCR 状态入口承接既有发布、迁移、备份、PENDING/回退和 Runtime 安装门禁；同步更新根 README、C0 历史说明和 R5 runbook 引用。属于文档内部原子清理：业务代码、所有权、公共/持久化合同、依赖图/架构基线、CI、Prisma schema/migration、生产主机及历史日志均无变更。另一个 Runtime 任务经 PR #2848 合入后，在最新 origin/dev 上准备独立交付，仅追加本条日志，保留其原记录；本批不包含该任务的源码/测试。后续交付状态更新本条记录。详见 [项目文档索引](../文档索引.md) 和 [GHCR 发布与 Runtime 状态](../runbooks/GHCR发布与Runtime状态.md)。

## 2026-10-17 — 文档清理第二批：Runtime 旧方案整合

**状态：本地改动已审阅并获远端交付授权，现通过 [PR #2850](https://github.com/sanqin888/sanqinMVP/pull/2850) 交付。CI 与合并的权威证据以该 PR 最终 head 的 Checks 和合并记录为准；本文不预先声明 CI 通过。未执行本地 lint/build/test。** 分支 `docs/runtime-history-consolidation-batch2-20261017`，基线 `origin/dev@94bc7be6`。逐篇承接并删除 27 份旧 GHCR/Runtime 方案，新增中文 [交付与安装约束](./Runtime交付与安装约束.md) 与 [历史决策/证据索引](./Runtime历史决策与证据索引.md)；保留 exact Bundle、发布/历史来源、staging、动态状态、备份/消费者、维护屏障和新独立重装约束，并索引原文/blob身份、U2C/2B2-B有限范围PASS、SIGKILL边界与退役冷断电NOT EXECUTED/归档哈希。同步 GHCR 状态入口、R5、项目索引、G2/Recovery Kit/S1 导航，不重写历史日志或原始JSON，不修改代码/测试、17项Bundle、owner/依赖图/架构基线、权限/CI、Prisma/schema/migration、生产主机和VM/离机资产。G2 NO-GO、S2扩充接线暂停及各阶段授权门禁保持原意；本批不构成新实验或生产验收。后续CI/交付更新本条，不重复登记批次。
