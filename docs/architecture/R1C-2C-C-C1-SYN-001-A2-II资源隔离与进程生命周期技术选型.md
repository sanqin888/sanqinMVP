# R1C-2C-C / C1-SYN-001 — A2-II 资源隔离与进程生命周期技术选型

**2026-10-22 · LOCAL READINESS DESIGN ONLY / NO GUEST EXECUTION / NO SECURITY CONTRACT CHANGE**

## 1. 当前起点与边界

- **权威基线：**PR #2908 / CI #7463 SUCCESS，squash merge `dev@80f970bd6a1845a376fdd520d832a7a3ceead0c0`。现有 A2-I `ops/runtime/c1_syn001_guest_capture.py`、`c1_syn001_mac_seal.py` 及其 unittest 已经 CI 通过，**仅实验室非 root fixture/本地封存技术就绪**，并未实现可获授权的真实 Guest SYN 入口。沿用 A0/A1 `PASS_SCOPED`，A1 原始 Guest 文件保持原样。
- **冻结合同不得偷改：**Guest UID/GID 1000/1000、cwd 和白名单环境、两个分开的 `strace -ff -ttt -T -yy -s 128 -o /tmp/sanq-c1-syn-001/raw/syn0{1,2}.trace` 方案、单 trace **4 MiB**、全部原始输出和元数据 **8 MiB**、wall **30 s**，真实 stdout/stderr/rc、超预算 BLOCKED/部分证据保留、无 root、不自动重试/删除，来源与 Host-only/SSH/boot/ns 的执行前再绑定。
- **本阶段性质：**只核查代码与 Linux 机制，冻结下一批 **只读现场能力预检** 命令候选与修改合同前需审批的技术选择。不会在仓库之外运行 SSH/VM/strace、不会写 Guest/raw、不会加入系统包/依赖/改迁移/evidence v1/运行时生产代码。此处引用官方手册仅佐证**能力机制存在**，不能代替这台 VM 上的实际权限/选项支持证据。

## 2. 机制分析与无法忽略的差异

| 机制 | 能保证 | 不能保证 | 对已冻结合同的影响 |
| --- | --- | --- | --- |
| `RLIMIT_FSIZE=4MiB` | 在执行者继承正确 rlimit 时约束其**单个**文件写入大小，超过时信号或写入失败 | 两个以上 `-ff` trace 文件加 stdout/stderr 的**合计**不超过 8MiB | **不够**，保留为单文件防线；不可据此标记 aggregate hard PASS |
| Python polling `stat` / stdout+stderr byte counter | 超量后标 `BLOCKED` 并尽量停止、保存部分原件 | 多 PID 文件的并发写入瞬间硬配额、强制不产生超过配额的物理内容 | **不够**；若改为“事后判负即可”属于削弱硬约束，须用户另批明确批准 |
| 受托管的**独占 8MiB 文件系统/项目配额** | 若已正确配置并可核验，能对该卷/项目的**块使用量**施加强限制并覆盖同一文件系统上多个 PID 文件 | 不等于对所有文件的逻辑 byte count 精确 8MiB；无法从当前 A0/A1 证明配置已就绪，启用 ext4 project quota/mount 往往需要特权、涉及新挂载点/目录 | 保留原 `-ff`，但会改变 Guest 环境/写路径或需要特权的**准备动作**；必须先做 read-only readiness 并另获授权。容量应预留元数据/receipt 预算与块粒度余量，不能保证精确逻辑 byte quota |
| `-f -o 单一 trace`（配有单文件硬限制） | 更容易严格界定 trace 文件总量；stdout/stderr 可单独由受控写入器强制总预算 | 不保留目前 `-ff` 的每 PID 单独原件形状、原 v1 证据关系可能不等价 | **改变已冻结观察 argv/证据拓扑**：只有用户单独批准修订 D0、来源/consumer/v1 兼容性证明后才能实施 |
| `strace --kill-on-exit` | strace 6.6 起提供此选项，通过 `PTRACE_O_EXITKILL` 尽量避免 tracer 死亡后 tracee 继续运行；Ubuntu 6.8 候选可能具备 | 无法单凭工具版本证明运行路径已覆盖全部 child、失败时成功安装 ptrace 选项及异常期间无需 cgroup 复核 | 在两个冻结 argv 新增选项**也是合同变更**，需另批审阅/批准，不能静默添加 |
| **cgroup v2 delegated 子树 + `cgroup.kill`** | 对已纳入该 cgroup 子树的全部进程和子 cgroup 发送 SIGKILL，覆盖 `setsid` 脱离传统 process group 的情况；委托模型规定受托用户可在受托边界中组织进程 | 不会自动赋予普通用户创建子组/移动自身/写入 `cgroup.kill` 的权限；不保证 SSH 连接断后 supervisor 永远运行，也不能强制多个文件的存储总量 | 建议作为**进程生命周期候选**；需要本 Guest 只读核验 delegated subtree / 许可模型，设计独立内核级 child containment。任何建立 delegated slice/cgroup 写操作均须单独授权 |

**官方机制来源（本次仅研究，不代表现场实测）：**
- Linux kernel cgroup v2 `cgroup.kill` 与委托/继承边界：<https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html>
- strace `-ff -o` 为每 PID 单独输出，且管道 `-o '|cmd'` 与 `-ff` 不兼容：<https://man7.org/linux/man-pages/man1/strace.1.html>
- strace 6.6 发布说明：`--kill-on-exit`：<https://lists.strace.io/pipermail/strace-devel/2023-October/011369.html>
- Ubuntu 24.04 quotactl 手册特权要求：<https://manpages.ubuntu.com/manpages/noble/man2/quotactl.2.html>

## 3. 推荐两阶段路线（保持不改变业务 Runtime/Ops 模块）

**先 A2-II-R（READ-ONLY ENVIRONMENT FEASIBILITY），后 A2-II-C（选定技术与实施审批）。**

### A2-II-R：仅准备候选现场只读命令，尚未获得本批 Guest 执行许可

以下命令**尚未执行**；真正向 VM 运行前应另批授权准确 argv、身份 pin、预算、输出长度和回执保管。不能假定本次 A0/G01–G07 授权可无限复用。

| 候选 | Guest 只读目的 | 禁止推论 |
| --- | --- | --- |
| R01 `/usr/bin/cat /proc/self/cgroup` | 当次 SSH 非 root 会话的 cgroup 所属路径 | 单凭名称不能证实委托可写 |
| R02 `/usr/bin/cat /sys/fs/cgroup/cgroup.controllers` | cgroup v2 root 已启用控制器候选 | root 控制器存在不代表当前用户具有 subtree 写入权限 |
| R03 `/usr/bin/cat /sys/fs/cgroup/cgroup.subtree_control` | 检查顶层实际启用委托控制器候选 | 不证明 `cgroup.kill` 子树可写或祖先共同写权限 |
| R04 `/usr/bin/findmnt -T /tmp/sanq-c1-syn-001 -o TARGET,SOURCE,FSTYPE,OPTIONS -n` | A1 目录准确的挂载/配额选项及 ext4 环境候选 | mount options 不能证明配额限额已对本目录单独配置 |
| R05 `/usr/bin/strace --version` | 对照已 pinned 的 observer executable 版本 | 版本不能证明 `--kill-on-exit` 运行实证或更改冻结 argv 的许可 |
| R06 `/usr/bin/id -u`、`/usr/bin/id -g`、`/usr/bin/cat /proc/sys/kernel/random/boot_id` | 与 A0/A1 精确身份/boot 的最小重绑定 | 不能重用旧 boot 结果，也不代替完整 Host/SSH pin |

**特别缺失：**上表不能单独验证宿主用户是否得到 writable delegated cgroup、cgroup.kill 真实操作许可、有效 8MiB 硬配额配置、systemd user manager 的异常断线生命期、对当前 `raw/` 的适用性。后续若要补充这些只读证据，应冻结无写副作用、无敏感泄漏的准确命令，并独立审批。不能自动改用 `sudo`、`mount`、`quotactl` 设置或 `systemd-run` 创建 scope 去碰运气。

### A2-II-C：真实代码实现许可之前必须作出的决定

- **优先保持 `-ff` 原有原始证据格式。** 如果已有独立可验证的非 root 委托 cgroup 和原先授权的 per-output-group quota，审查“在同一场景内严格容纳所有 trace 文件/双流/元数据 + 异常 cgroup.kill”方案，在全负例通过后再审批 Guest 受限写动作。
- 如果 Guest **不具备该能力**：不把 `RLIMIT_FSIZE` 或 polling 偷改称 aggregate hard limit。需要用户选择：`A` 在**可丢弃 VM、非生产**准备新受控 quota/cgroup 隔离（涉及额外 VM/Guest 配置或特权动作，须准确审批及回滚）；`B` 修改冻结 `-ff` 观察命令为便于硬预算的单流设计（必须证明 PID/child/raw evidence 不失真且经用户批准后单独修改 D0）；`C` 明确放弃强硬预算、改越界 BLOCKED 的语义（本次**不推荐**，属于降低原定安全保证，必须独立明确授权）。
- 所有路线还需证明 **断线/超时/崩溃下进程终止及无孤儿**（不能仅用 group kill 或 SSH rc0）；必须保留 fail-closed 和不自动清理的原证据路径。Guest 运行 SYN-01 与 SYN-02 均须分别授权。

## 4. 本次结论与下一审阅门禁

**结论：`A2-II TECHNICAL OPTIONS REVIEWED / READ-ONLY SITE PROBE NOT AUTHORIZED / HARD 8MiB + LIFECYCLE PROOF STILL BLOCKED`。** 因现有平台事实不足，不能在不突破环境/冻结 argv 承诺下宣布资源隔离已实施，也不改写已有 `run_scenario() = A2_EXECUTION_NOT_AUTHORIZED`、`aggregateHardLimitEnforced=false`、`detachedDescendantsExcluded=false`。与 A2-I 已 CI 通过不同，本地 A2-II 文档尚未推远端，未做 Guest/SSH/VM/生产写操作。

**推荐下一批最小授权：**仅在同一受控 Host-only Guest 上以 UID 1000 运行 R01–R06 的准确只读指令，取得受限 stdout/stderr/rc 与 SHA 回执，用于确认是否存在安全实现选项；权限/挂载真相未核实时不提前生成可执行 `strace` operator。
