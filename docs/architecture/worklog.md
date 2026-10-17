# SanQ 项目持续工作日志

本文件遵循仓库 `AGENTS.md` 第 19 节，按批次记录项目后续开发、维护和验收。文件超过 1,000,000 UTF-8 字节前，应续写同目录的 `worklog2.md`，依次递增；旧的 `modularization-worklog*.md` 仍保留为历史资料。

## 2026-10-17 — C5-G2 / B02-B4B-3A：Python 依赖闭包清单第一批

**状态：MCP-workspace 本地源码/合成测试完成、尚未运行 lint/build/test、等待用户审阅；未推送、未建立 PR。** 分支 `feat/c5-g2-b4b3a-dependency-closure-manifest-20261017`（基于任务开始时最新 `origin/dev@1cd89d9e`）。新增独立 `ops/runtime/root_python_dependency_manifest.py`：纯内存结构审查含 stdlib .py、package、CPython native extension、ELF loader、shared libraries、builtin/frozen 和 Linux vDSO 的**声明式**哈希与依赖图；异常缺失与不匹配 fail-closed，声称的清单结构闭合仍永久拒绝认证和生产安装。配套合成测试 `ops/runtime/tests/test_root_python_dependency_manifest.py`；不改 B4B-1/B4B-2、17 文件 Runtime Bundle、现有业务所有者/依赖边/架构基线、CI、依赖锁文件、数据库迁移和生产状态。真正 Guest 哈希清单、完整传递导入/ELF 依赖动态可信采集和独立见证仍为 B4B-3B/C 的单独门禁。详见 [B4B-3A 清单合同](./C5-G2-B4B3A-Python依赖闭包清单.md) 及 [C5-G2 可信 Runtime 契约](./c5-g2-trusted-runtime-contract-2026-10-13.md)。最高状态 LOCAL / UNTESTED，`C5-G2 NO-GO` / `S2 PAUSED`。
