# C5-G2 / R1 B4B-3B-2B1 — 受控路径 FD 候选开启

> **2026-10-18 已批准更新方案：**[AWS 整机快照与维护冻结方案](Runtime更新-AWS快照与维护冻结方案.md) 更新 R0 D2–D5：代码创建本次 Lightsail 手动实例快照；拍快照前记录原策略，将准确业务容器设为 `restart=no`、正常停止并禁止启动入口，快照及恢复首启均保持维护态。等快照 `available`、来源/覆盖盘与离机清单核对完成才可安装；成功后按记录恢复策略，故障保持冻结并人工确认快照→新实例。旧 mandatory crypt/Drive preinstall Kit、双 Archive 恢复自举不再重复强制。现役每日备份/escrow、目标包来源校验和真实 AWS 恢复验收保留。**仅设计批准 / 未实现未部署 / C5-G2 NO-GO / S2 扩充后置**；不授权本次生产/AWS 操作。本文带日期的设计/实现与有限实验记录保留当时范围；引用旧 Kit/clean reinstall 的段落不再作为本次更新前置。

**日期：**2026-10-18（America/Toronto）。**状态：**MERGED / SYNTHETIC CI GREEN：PR #2857，final head `9ad184a350189d58b557419434d50efd062c3361`，CI #7344 / run `39098295751`（按变更范围选中作业全部成功），dev merge `1a82caff22b49881aad2893ae1c9374c03c97ffb`；未做真实 Guest/root 验证。**生产：**C5-G2 NO-GO；S2 DAILY CONFIG EXPANSION PAUSED（现役备份 timer 不受影响）。

**基线：**最新 `origin/dev`；PR #2855 已在 `dev` 形成 merge `2db85d32`；本地分支 `feat/c5-g2-b4b3b2b1-fd-anchored-paths-20261018`。**归属：**Runtime / Ops 的外置、非授权组件；不属于冻结的 17 文件 Runtime Bundle。

## 1. 第一批范围与现有合同

B4B-3A 只审查调用方提出的依赖清单，B4B-3B-1 从**预打开 FD** 读出哈希与元数据，B4B-3B-2A 只静态解析内存 Python/ELF 字节。至此仍缺少安全的路径分段开启与目录项/FD 身份一致性检查。本批新增 `ops/runtime/root_python_dependency_path_fds.py`，以已打开、但**独立信任来源未认证**的根目录 FD 为锚点，逐段以 `openat(dir_fd=...)` 和 `O_NOFOLLOW` 打开 B4B-3A 白名单中的文件；通过上下文管理器把有界只读 FD 暂借给现有 B4B-3B-1 观察器，并在进入、退出时重新对照目录项和已经持有的 FD。测试中可使用可丢弃的私有目录作为**模拟根**；绝不声称这是 host `/`。

与仓库既有 `root_private_source_fd.py` 的固定目录 FD、`O_NOFOLLOW`、`fstat`、`stat(follow_symlinks=False)` 和元数据比对策略保持一致；不变更或复用其真实 Operator root-private 源路径职责。**没有 CLI、sudo/VM/root 执行入口、安装器、任意 `/root` 或 `/opt/sanq/runtime` 访问、真实 Guest 数据采集、候选 Python/ELF 执行、权限变更、网络访问、子进程、生产状态写入或新依赖。**

## 2. 严格检查

- 只接受结构与哈希声明符合 B4B-3A 的 manifest 中**恰好声明**的文件型路径；最多 64 个候选文件，单文件最多 32 MiB，路径最多 12 段；不以被篡改的相对路径或 `..` 退出锚点。超过预算直接拒绝；不静默跳过。
- 调用方预交付一个只读目录 FD，要求锚点、后续目录、文件的 owner 为 root:root（非 root 临时测试另以明确的 fixture UID/GID 提供）。验证类型、同一 device、无 group/other write、无 setuid/setgid、文件硬链接计数 1、大小有界；通过目录项与 FD 的 dev/inode/mode/metadata 绑定阻止已检测的替换。
- 对路径**每一段**使用目录 FD 相对寻址、`O_DIRECTORY`（目录）、`O_NOFOLLOW`、`O_CLOEXEC`；最终文件使用 `O_NONBLOCK`，避免在遇到 FIFO 等非普通文件时阻塞。父目录和文件的身份在交出只读 FD 前及结束后重新检查；检测到变化则 fail-closed，最后始终关闭内部 FD。
- **有意不接受**软链接、挂载设备变化和路径别名。Ubuntu `/lib64`、`/lib` 可能通过 usrmerge 符号链接映射到 `/usr/lib`；当前 v1 会拒绝，不能简单放宽 `O_NOFOLLOW` 或手工调用 `realpath` 当作安全旁路。真实 Ubuntu 的别名解析、可信实体身份与 B4B-3A manifest 路径语义必须作为后续架构/证据门槛单独审阅。
- `_fixture_owner_uid` / `_fixture_owner_gid` 仅用于合成测试，绝不是生产授权入口。调用方输入的 anchor 甚至可能根本不对应主机 `/`；FD 检查**不能独立认证** anchor 信任根、父 namespace、外部 SHA pin 的来源、软件包来源、加载前后的全部竞态窗口或整机隔离。

## 3. 测试、CI 与未完成门禁

新增 `ops/runtime/tests/test_root_python_dependency_path_fds.py`，只在 CI 临时私有目录构造虚假的 `/usr/bin/python3.12` 与 `/lib64/ld-linux-x86-64.so.2` 相对路径（**不是**真正的 Python 或 ELF 程序），检查稳定 FD 交接到 B4B-3B-1、使用结束关闭、符号链接、权限、硬链接、缺失文件、错误 hash、未受信任锚点模式及确定性的捕获后替换拒绝。真实系统没有执行、加载或读取。

本批已通过按依赖范围选择的 CI #7344：`.github/workflows/ci.yml` 的 `ops-checks` Runtime 步骤已运行 `python3 -m unittest discover -s ops/runtime/tests -p 'test_*.py'`，包括本批合成测试；`ci-change-scope`、`api-checks` 与 `build-test (api)` 均成功，其余无关作业按范围跳过。MCP-workspace 本地未执行。此结果不是实机/Guest 或生产验证，也不能用旧工作流的 `api-checks` 代替真实 Runtime 测试证据。

**尚未实现 / 不因本批 PASS：**真正主机 `/` 锚点的独立认证、Ubuntu usrmerge 别名的可信解析、所有文件/软件包的外部来源 pin、完整 CPython 动态 import 和 ELF/dlopen 依赖图、运行中 namespace/替换攻击的连续阻断、离机证据与独立 root 消费见证。B4B-3C 新 root/Guest 实测仍先受 R0 C2 约束，旧实验未做原机 `snapshot restore` 仅为历史事实；当前按 R0 C2-CHANGE-01，以快照创建独立新实例的 N-01–N-07 为唯一强制恢复验收，已有合成证据不自动豁免新恢复门禁。

**结果语义：**本组件仅提供候选 FD；B4B-3B-1 观察 receipt 仍是 `decision=BLOCKED`、`preopenedFDAndPathProvenanceAuthenticated=false`、`readyToInstall=false`、`authorizedToMutateProduction=false`。不自动扩展 B4B-3A/B4B-3B-1 的公共合同，也不增加正式 C1–C8 任何 PASS。下一阶段先做 [B4B-3B-2B2 Ubuntu 别名与可信锚点设计评审](C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md)，未经审批不放宽现有 `O_NOFOLLOW`。
