# R1C-2C-C — C1-SYN-001 / A2-II-R Guest 环境能力只读取证审批包

**2026-10-22 · LOCAL APPROVAL PACKET / GUEST R01–R06 NOT AUTHORIZED / NO SITE EXECUTION**

## 1. 前置结果与最小范围

PR #2909 已在 GitHub Actions CI #7466 显示 SUCCESS 后通过固定目标/Head 的受控 Squash Merge 合并至 `dev@2dc710c93fec998c5766a6680bbf5ca26f8297c5`。新建本地 `docs/runtime-c1-syn001-a2iir-readonly-probe-20261022`。本阶段从 [A2-II 资源与进程生命周期技术选型](R1C-2C-C-C1-SYN-001-A2-II资源隔离与进程生命周期技术选型.md) §3 继承准确 R01–R06 候选，只为下一次同一隔离 Ubuntu Host-only Guest 的**读操作审批**作准备，不修改 A0/A1 证据或重新投送源文件。

本地脚本准备：`A2-II-R-Guest-ReadOnly-20261022.py`（**Mac 操作员文件，不进入 Git**），SHA256 `d6e8b37a095ff12167db4ae533f45b9beff02313c91816e693697ac27489b7ca`。它沿用已审 A0-GUEST Mac 操作器的 VirtualBox 宿主对象、控制台 ED25519 主机指纹 pin、strict SSH 及 raw 证据收集结构；仅在新的现场只读授权后由用户自己操作，现阶段不允许运行。这个脚本不验证 cgroup 权限“已获得”，不调用任何 cgroup 写入，不运行 SYN/真实 strace、不查询生产数据。

## 2. 唯一获准候选的 Host + Guest 操作列表（尚未批准现场执行）

Mac Host 既有只读前置检查复用 A0 受限模型（目标 VM/VDI/HostOnly 不变；不修复）：

| ID | 精确命令结构 | 判定目标 |
| --- | --- | --- |
| S00 | `/usr/local/bin/VBoxManage showvminfo <已批准VM_UUID> --machinereadable` | VM running、nic1 hostonlynetwork、nic2..8 none、clipboard/drag-and-drop disabled；值私有 |
| S01 | `/usr/local/bin/VBoxManage showmediuminfo disk <已批准VDI_UUID>` | 绑定该 VM 与批准的同一磁盘 |
| S02 | `/usr/local/bin/VBoxManage list hostonlynets` | 已批准 HostNetwork Enabled 与原 subnet |
| S03 | `/usr/sbin/sysctl -n net.inet.ip.forwarding` | 0 |
| S04 | `/usr/sbin/sysctl -n net.inet6.ip6.forwarding` | 0 |
| S05 | `/usr/bin/ssh-keyscan -T 5 -p 22 -t ed25519 <控制台已核IP>` | 公钥计算出的 ED25519 SHA256 必须与**事先从同一 Guest 控制台**输入的完整 `SHA256:` 指纹、既有批准原件同时匹配，才能将它作为 strict SSH known_hosts |

每条 Guest 访问使用由 S05 生成的单批私有 `known_hosts.approved`，`StrictHostKeyChecking=yes`、`HostKeyAlgorithms=ssh-ed25519`、禁用公钥代理/身份继承/端口转发，SSH 密码由 Mac TTY 交互输入且**不得保存**。Guest 登录用户名固定既有非 root 操作员；控制台再次读取 user/IP/pin，**与冻结对象任何不一致立即停止**。Mac 只保存证据，不修改 VM/VDI/网络设置，不向 Guest 写文件。

下表 R01–R06 共**8 个独立 SSH 只读子命令**，全部从已固定绝对路径运行、不经通用远程 shell 脚本拼接。Guest stdout/stderr 原始 byte 原封不动封存于 Mac 私有目录，保留真实 rc、UTC 起止、SHA/长度。R02/R03 空输出不能代表命令失败，也**不能推导未委托或已委托**。

| ID | Guest argv（准确） | 仅可证明 |
| --- | --- | --- |
| R01 | `["/usr/bin/cat", "/proc/self/cgroup"]` | 当前被调用读取进程所在 cgroup 层级标识；不能证明其可写 |
| R02 | `["/usr/bin/cat", "/sys/fs/cgroup/cgroup.controllers"]` | 根控制器列表候选；不是 delegated 子树清单 |
| R03 | `["/usr/bin/cat", "/sys/fs/cgroup/cgroup.subtree_control"]` | 顶层已启用控制器候选；空值允许 |
| R04 | `["/usr/bin/findmnt", "-T", "/tmp/sanq-c1-syn-001", "-o", "TARGET,SOURCE,FSTYPE,OPTIONS", "-n"]` | 已落地 A1 目录的当前文件系统/mount options；无具体 quota 授权信息 |
| R05 | `["/usr/bin/strace", "--version"]` | strace 二进制版本显示，不附加/跟踪进程，也不代表已经验证 `--kill-on-exit` 效果 |
| R06a | `["/usr/bin/id", "-u"]` | 非 root UID=1000 |
| R06b | `["/usr/bin/id", "-g"]` | 非 root GID=1000 |
| R06c | `["/usr/bin/cat", "/proc/sys/kernel/random/boot_id"]` | 与 A1 的 boot ID 精确绑定；重启即 BLOCKED |

这些操作足以缩小 cgroup/quota 选型范围，但**不能单凭结果批准** cgroup subtree 写权限、文件系统真实项目配额、`cgroup.kill` 是否可写、SSH 断开后的 supervision 生命周期；更不能把 A2-I 的 `aggregateHardLimitEnforced=false` 或 `detachedDescendantsExcluded=false` 改为 true。

## 3. 输出与操作边界

- 只能在既有已核准的 Mac 与可丢弃 VM 上进行、`UID=1000`，不得 `sudo`/root/apt/install/mount/systemd-run/quotactl 设置，不得修改 cgroup、quota、sysctl 或 VM 配置。
- Host 身份命令单项 12 秒（按现有 A0 脚本），SSH keyscan 12 秒，首条 SSH 查询最高 90 秒供交互密码输入，其他 SSH 命令 25 秒；每条 stdout+stderr **最多 64 KiB**，超时/超预算/rc 非 0 或不符合严格格式均 `BLOCKED`。首轮 SSH 通过密码认证不是允许自动授予 Guest 读写/trace 权限。
- 输出目录仅 Mac `~/sanq-r1c-private/A2-II-R-<UTC>`、父目录必须预先存在、非 symlink；umask 077、新目录 0700、含 `receipt.json`、`known_hosts.approved`、逐条 binary stdout/stderr 和 `SHA256SUMS.txt`。不要把包含 Guest IP、VM UUID、boot ID、host key 或登录名的原件提交 GitHub；只向内部审阅人以私有包交接。
- `receipt` 均固定 `a2iirSiteReadonlyApproved=false`、`a2ExecutionAuthorized=false`、`traceAuthorized=false`、`a3Authorized=false`、`a4Authorized=false`、`hardAggregateQuotaProven=false`、`detachedDescendantsExcluded=false`，用户批准/审阅结论另立记录，**不改原始字段**。
- 任何与 A1 先前 pin/boot 不一致、不明可执行文件路径/VM 网络状态或无法读取时：停止当前批次，保留失败原件，**不自动修复、不第二次投送 A1 文件、不降低 SSH 安全检查**。
- 若命令返回文本说明需要扩大到 cgroup 实际委托目录权限、`systemd` user slice 等新增查询，**先生成新的只读命令清单请求批准**，不自动遍历 `/sys/fs/cgroup` 或扫描其他进程/系统文件。

## 4. 已有的仅本地离线验证及本批裁定

Mac 操作器已在隔离工具环境进行 Python 语法编译、允许命令白名单检查，以及 R01–R06 正例/UID 非 root/不同 boot、mount 类型和 rc 失败负例验证。**未连接 Mac/VirtualBox/Guest/SSH；没有实际现场日志或证据包**。操作器脚本仅是随对话交付的文件，不随此仓库 PR 分发。

本次最高状态：`A2-II-R OPERATOR PREPARED / LOCAL STATIC AND PURE VALIDATION CHECKED / FIELD GUEST READ-ONLY NOT AUTHORIZED / SITE RESULTS PENDING`。

下一步需要用户的**准确现场操作授权**：允许在既有 VM/VDI/SSH ED25519 pin 均匹配的隔离 Guest 中，经 Mac 严格 host-key SSH 以 UID/GID 1000 **仅读取 R01–R06**，Mac 本地保存有限原始回执，不能新建 Guest 文件、不能运行 strace trace、不能修改 quota/cgroup/系统设置。不获授权则保持此阶段停止。此处不影响 `C0 CLOSED/LIMITED-ACCEPTED / A0/A1 PASS_SCOPED / A2 REAL TRACE NOT AUTHORIZED / C1 DYNAMIC OPEN / C5-G2 NO-GO / S2 DAILY PAUSED`。

**本地分支只提交上述文档与同步日志，未经下一次远端交付授权，不推送 PR。**
