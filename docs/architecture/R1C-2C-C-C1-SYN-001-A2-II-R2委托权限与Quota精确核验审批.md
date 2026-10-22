# R1C-2C-C / C1-SYN-001 — A2-II-R2 cgroup 委托与 ext4 quota 精确只读核验

**2026-10-22 · LOCAL SCOPE FREEZE / NO GUEST R07–R08 EXECUTION / NO PRIVILEGE CHANGE**

## 1. 权威起点和安全边界

- PR #2911、CI #7470 SUCCESS，squash merge `dev@f62ee2c31e3527d75e373c1c5aa0f9870716e94a`。此前 R01–R06 原包 `A2-II-R-20261022T183900Z.zip` SHA256 `fba18c72a6df84cd88cbb3a0fdbe11873778933d22a3a1dfb5e72a5030234689`，30/30 文件和 14/14 命令回执校验，结论仅 `PASS_SCOPED`；`a2ExecutionAuthorized=false`、`traceAuthorized=false` 等原始字段保留。
- Guest 已核实 UID/GID `1000/1000`，Cgroup v2 R01 原始路径 `0::/user.slice/user-1000.slice/session-34.scope`，根 controllers 列表与根 subtree 已读、A1 位于 `/dev/sda2 ext4 rw,relatime`、strace 6.8。这些**不证明 cgroup 委托或任何 quota 硬保证**。
- 本批仅批准在仓库本地**编写取证命令与拒绝合同**，不批准 Mac/SSH/Guest 实际运行。后续实际执行范围必须由用户在审阅确切 argv、动态路径校验规则、输出/预算及私有证据保管方式后另行授权。绝不运行 `strace` 真实跟踪，不创建 `raw/`，不安装软件，不启动 user manager 或 cgroup。

## 2. 精确的身份复用与动态路径规则

先在**同一已批准的 Mac/VirtualBox 目标**按 A2-II-R 的 S00–S05 复核 VM running、同一 VDI、仅 Host-only、无 forwarding，以及**当前 VM 控制台先验** ED25519 host key；strict SSH 指纹完全一致。R06a/b/c 重新读取 UID/GID/boot，任何不符合 `1000/1000` 与先前冻结 boot ID 的情况，立即 `BLOCKED`。SSH 参数仍使用已冻结的密码认证、`StrictHostKeyChecking=yes`、显式 `UserKnownHostsFile`、`HostKeyAlgorithms=ssh-ed25519`、禁止 agent 与任何 forward；所有 Mac receipts 私有，绝不写入 Guest。

**R07.0 当次重新读取：**`["/usr/bin/cat","/proc/self/cgroup"]`。将 stdout 严格按单行 `^0::/user\.slice/user-1000\.slice/session-[0-9]{1,8}\.scope\n?$` 解析；它反映**这次命令进程的**会话，旧的 `session-34.scope` **不能硬套至另一次登录**。若当前 SSH 会话改变 cgroup，或之后执行命令的 session 不匹配，不能以此前 R01 输出冒充现有 scope 的权限。只允许形成三个层级的候选路径，且每次新批次重新精确记录其文字：

- `/sys/fs/cgroup/user.slice`
- `/sys/fs/cgroup/user.slice/user-1000.slice`
- `/sys/fs/cgroup/user.slice/user-1000.slice/session-<本次正则批准的数字>.scope`

禁止任意路径输入、`..`、symlink 跟随、glob、递归遍历和读取其他用户的 `user-*.slice`；解析失败直接 `BLOCKED`，不自动改选当前“最新”的 scope。

## 3. R07 — 只读 DAC/文件能力候选（每次现场动作须另批批准）

下列 argv **精确命令模板**按上述三个已校验层级逐项实例化，文件名只能从固定集合选择。全部指令**不写 cgroup**。

| ID | 精确 argv 模板 | 精确范围和含义 |
| --- | --- | --- |
| R07.1 | `["/usr/bin/stat","-c","%n:%F:%u:%g:%a:%h","--", CGROUP_DIR]` | 仅目录类型/UID/GID/mode/nlink；root-owned 本身不推导否定/肯定委托 |
| R07.2 | `["/usr/bin/stat","-c","%n:%F:%u:%g:%a:%h","--", CGROUP_DIR+"/cgroup.procs"]` | 仅元数据；**不读取 PID 列表**，避免泄漏会话内其他进程身份 |
| R07.3 | `["/usr/bin/stat","-c","%n:%F:%u:%g:%a:%h","--", CGROUP_DIR+"/cgroup.subtree_control"]` | 已冻结的委托接口候选，**只做 stat** |
| R07.4 | `["/usr/bin/stat","-c","%n:%F:%u:%g:%a:%h","--", CGROUP_DIR+"/cgroup.kill"]` | `cgroup.kill` 可能是 write-only，绝不 `cat` 或试写 |
| R07.5 | `["/usr/bin/test","-w", TARGET]` | 对上述**已通过 stat 确认**的目录或接口做零副作用的用户访问位测试；`rc=0` 仅表示内核对本次凭据的访问检查候选，**不是实际安全委托写入成功证明** |

R07.1–R07.4 对每个已校验目录至多各一次；若 `stat` 返回 `ENOENT` 或 `EACCES`，保留真实 stderr/rc 并分类 `ABSENT_OR_UNREADABLE`，**禁止回退 root/sudo、自动 chown、补建文件、重复失败操作**。R07.5 只对上述已确认**在批准候选列表中的目标**执行，并且先保存对应 `stat` 结果；若 `stat` 明确缺失，额外的 `test -w` 只能确认该既定路径不可写，保留 `rc=1`，**不能把“缺失”误判成“存在但未委托”**。`test -w` 的 `rc=1` 是受控负结果而非 runner 故障，其他 rc 和 unexpected stderr 均 BLOCKED。不可将 `stat` owner/mode 自行提升成能迁移任意 tracee 的证明：真实委托还涉及 common ancestor 访问权、进程来源以及 cgroup namespace/LSM/管理器层权限；`cgroup.kill` 控制权甚至可能超过普通进程信号权限，不能轻易授予。参见 Linux 官方 [cgroup v2 委托与隔离边界](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html)。

重要限制：**单次 R07.0 会话名属于读取进程本身**；若多个 SSH 命令开启不同 session，需要额外证明后续检查目标与实际 collector 可进入/保持同一 cgroup。仅凭静态只读属性，不能证明 SSH 断线能杀死全部后代。

## 4. R08 — 精确 mount / quota 只读能力候选

| ID | 精确 argv | 目的/最大结论 |
| --- | --- | --- |
| R08.1 | `["/usr/bin/findmnt","-T","/tmp/sanq-c1-syn-001","-o","TARGET,SOURCE,FSTYPE,OPTIONS","-n"]` | 复核准确 A1 目录的根文件系统。要求此前证据可对比；不把没有 `prjquota` 标志等同 “必然不能配置” |
| R08.2 | `["/usr/bin/findmnt","-T","/sys/fs/cgroup","-o","TARGET,SOURCE,FSTYPE,OPTIONS","-n"]` | 与 R07 资源组写节点对应的挂载类型/选项，核验 cgroup2 候选；不声称 user slice 可写 |
| R08.3 | `["/usr/bin/stat","-f","-c","%T:%S:%b:%f:%a","--","/tmp/sanq-c1-syn-001"]` | 仅读文件系统类型/块大小与可用空间；**完全不能**证明 8MiB 项目级硬 quota |
| R08.4 | `["/usr/bin/ls","-ld","--","/dev/sda2"]` | 只检查已知分区设备节点的只读访问属性；不对 `/dev/sda2` 原始块设备发读写/超级块 ioctl |

R08.1–R08.4 全部不修改文件系统，**不执行** `quotaon`、`quotacheck`、`mount`、`tune2fs`、`dumpe2fs`、`systemd-run`、`quotactl` 写入或 root/sudo。检查不包含任何递归目录枚举、其他 mount、生产进程或系统服务变动。若无法从现有非 root 权限读出 project quota 真实启用状态，结果只能是 `QUOTA_HARD_GUARANTEE_UNKNOWN`，不能为了取 PASS 自动请求临时提权。

## 5. 输出预算、失败保全、审核门禁

- Host S00–S05 维持上一批已审审批包的时限/输出规则。新 Guest R06、R07、R08 每命令计划 **≤25 s / stdout+stderr ≤8 KiB**，登录密码的**第一条** SSH 允许 ≤90 s；总体原始数据不含敏感凭据，Mac 私有父目录必须已存在、0700；唯一新子目录 0700、原始 `stdout.bin/stderr.bin/rc/UTC/argv` + SHA256SUMS/receipt，不能把这些原件 push 到 Git。
- 只接受 `rc=0` 成功或前述明确的 `stat` 缺失/权限不允与 `test -w rc=1` 的受限负面结果；其余非零/不完整/SSH 指纹或 boot 不符 `BLOCKED`，**不自动切换对象/提权/覆盖/重新运行**。
- 所有原始回执中的 `a2ExecutionAuthorized=false`、`traceAuthorized=false`、`hardAggregateQuotaProven=false`、`detachedDescendantsExcluded=false` 等固定为 false；审核结论独立于原始自报。
- 技术选型门槛：必须 separately establish (a) 与真实 future collector 处于同一可信隔离 scope，(b) 全体后代无法脱离受控隔离及 SSH 断线后可安全停止，(c) **严格 8MiB 总输出硬上限**（trace files + stdout/stderr + evidence）及块分配/metadata 上限，才可考虑 A2-S 投送 / A3/A4。即使 R07 属性显示可写、R08 文件系统可以读，**也不是安全保证的 PASS**。

**本批实际状态：`R2 EXACT READ-ONLY ARGV PROPOSED / SITE READS NOT AUTHORIZED / NO R2 ORIGINAL EVIDENCE / HARD QUOTA AND DETACHED CHILD PROOF BLOCKED`。** 仅本地文档与 R1-C/R0/worklog 同步，既不运行 Guest 或修改源，也不推送远端。当前 `C1 DYNAMIC OPEN / C5-G2 NO-GO / S2 DAILY PAUSED`。

## 6. Mac 受控操作器候选（本地单独文件，不入 Git）

在上一批 `A2-II-R-Guest-ReadOnly-20261022.py` 已核验 Host S00–S05、控制台先验 SSH ED25519、Guest UID/GID/boot 和 Mac 原始回执逻辑上，衍生 **`A2-II-R2-Guest-ReadOnly-20261022.py`**，SHA256：

`73d6a2e3477d1228cba777338b413afee29b53d30597a866eb2be6e6e5495dd7`

- 仅本地用户文件；**不加入仓库/PR**。内部附既有受控 VM/VDI/Host-only/IP/console hostkey/boot pins，运行前重新从同一受控 VM 控制台确认；不根据“最新” VM 自动选对象。
- 程序只使用 S00–S05、R06a/b/c、R07.0、三个被正则限定的本人目录及其固定 `cgroup.procs`、`cgroup.subtree_control`、`cgroup.kill` 的 `stat/test -w`、R08.1–R08.4 和最后的 R07 当前 session 一致性读回。不运行 `strace` 跟踪、`sudo`、`mkdir`/Guest 写文件/项目配额配置命令。该脚本中的 `test -w` 是访问权限检查，**绝无实际文件写动作**。
- Mac Host 每命令 stdout+stderr **64KiB**，Guest 每命令 **8KiB**，Guest 首次 password auth 命令 90 秒、其余 25 秒；使用独占私有 `A2-II-R2-<UTC>` 目录、原始二进制输出/rc/UTC/argv/receipt 和 SHA256SUMS。遇 mismatch/预算/身份变化 BLOCKED，无 Guest cleanup/覆盖/回退 root。
- 已在与真实 Mac/Guest 无关的环境做 Python 语法编译和纯离线 R07 scope allowlist、写入函数禁区、正/负返回解析等 12 项断言通过；**这不是 Mac/Guest 真实执行验证**。
- 脚本仍要求启动参数 `--confirm-a2iir2-guest-readonly` 和操作者明确输入 `A2-II-R2-READONLY`；**操作者确认不代替用户现场执行授权**。未经用户独立授权，不得运行或把任何 candidate 状态提升为 cgroup 委托/8MiB 硬 quota 可用。

本地编制此脚本并不改变前述 `R2 SITE READS NOT AUTHORIZED` 或 A2-S/A3/A4 的拒绝状态。

## 7. 2026-10-22 — R2 真实只读回执离机限定复核（后续新增）

**本节后于 §1–6 的“未执行”历史状态；只记录用户已另行批准、亲自在 Mac 执行 R07/R08 后的独立原始证据复核。** 用户回传 `A2-II-R2-20261022T190353Z.zip`，整包 SHA256 `3a2703c9284937a357f6d1262e9599034e0157bd3feada359dc19ed18f1b82d3`、29,655 bytes，82 ZIP 条目（1 目录、81 文件），CRC 全通过、无条目重名/路径穿越/symlink。`SHA256SUMS.txt` 覆盖其他 **80/80 个文件**并经离线逐字节重算全部一致。原始 `receipt.json` 包含 **39/39** 有序命令（Host S00–S05 = 6、Guest = 33），其 78 个 stdout/stderr 文件字节长度和 SHA 与 receipt 全匹配；**27 次 rc0、12 次 rc1**（恰为 R07 的 `test -w` 权限负结果），其余无非零退出、无 timeout/overBudget/gap，39/39 `candidateMatch=true`。记录 UTC 约 `19:03:53.540743Z–19:04:01.844778Z`。

受控操作器本人提交的源码 SHA256 与 §6 冻结值 `73d6a2e3477d1228cba777338b413afee29b53d30597a866eb2be6e6e5495dd7` 精确一致。控制台事先 pin 的 ED25519 fingerprint 与重新从 `S05-keyscan-stdout.bin` Base64 公钥 wire 独立计算的 SHA256 一致，`known_hosts.approved` 与 S05 扫描原始字节相同；Host VM/VDI/Host-only/转发检查均通过，Guest UID/GID=1000/1000、boot ID 与 A0/A1 前序历史记录一致。R07.0 与 R07.9 的 cgroup 原文完全相同：`0::/user.slice/user-1000.slice/session-37.scope`，不同于早前旧 SSH `session-34.scope` 并不代表 Guest 重启。

### R07 平台真实权限

```text
user.slice                                           directory root:root 0755
user-1000.slice                                      directory root:root 0755
session-37.scope                                     directory root:root 0755
三个层级下各自的 cgroup.procs                      regular root:root 0644
三个层级下各自的 cgroup.subtree_control             regular root:root 0644
三个层级下各自的 cgroup.kill                        regular root:root 0200
12/12 对象的 /usr/bin/test -w -> rc=1、stdout/stderr 皆空
```

**真实结论：**本次 UID1000 会话及所检查的两个父级对这 12 个 cgroup 目录/控制接口均无直接可写 DAC 能力，**没有证据证明这些路径已经是给本用户使用的 delegated subtree**；不能从 `cgroup.kill` 文件存在推导出用户可以调用。不能据此扩大成“整个系统根本不存在任何其他受委托路径”，也没有对 `cgroup.procs` 写入测试、独立进程组杀灭或 SSH 断线后孤儿进程验证。

### R08 平台真实能力与限制

- R08.1 原件 `/ /dev/sda2 ext4 rw,relatime`，没有显示 project quota mount option；既不能认为现在已配置好 8MiB 硬 quota，也不能据此证明永远无法配置。
- R08.2 `/sys/fs/cgroup cgroup2 cgroup2 rw,nosuid,nodev,noexec,relatime,nsdelegate,memory_recursiveprot`。这里 `nsdelegate` 是 cgroup2 **mount option**，不代表 `session-37.scope` 或 UID1000 已得到可写委托。
- R08.3 的 `stat -f` 原始 stdout `ext2/ext3:4096:6405945:5118655:4786918`。文件系统类型标签是 `stat` 的显示字符串（而 R08.1 的确切挂载为 ext4），块大小字段为 4096；它不包含配额配置。
- R08.4 原始 `ls -ld` 是 `brw-rw---- root disk ... /dev/sda2`，设备节点属于已知磁盘；不证明 UID1000 能在不提权的情况下配置 quota。

### 操作器打印 note 的静态缺陷，不应重跑

实际源码 `validate_guest()` 在 R07 stat、R08.1–R08.4 中使用 `return (bool_condition, '...UNEXPECTED')`，其中第二个位置无论 `bool_condition=True` 还是 False 都会固定返回同一个*失败说明标签*；打印层直接无条件显示 note。所以终端显示的 `STATIC_METADATA_FORMAT_UNEXPECTED`、`A1_EXT4_MOUNT_NOT_MATCHED`、`CGROUP2_MOUNT_NOT_MATCHED`、`STATFS_FORMAT_UNEXPECTED`、`KNOWN_DEVICE_METADATA_UNEXPECTED` 不能作为真实失败判据：**上述原始文件按实际条件能通过，而且 39/39 receipt `candidateMatch=true`、`gap=null`**。这是 UI/诊断文案准确性缺陷，不影响已保存的原始 byte/sha/rc；后续在单独的 Mac operator 维护切片修复 `success: "..." / failure: "..." ` 配对，但不动已冻结文件或借机重新执行原现场操作。原始 `receipt` 不能因离线技术裁定而改写。

**限定技术裁定：`A2-II-R2 READONLY METADATA/INTEGRITY = PASS_SCOPED / CURRENT UID1000 CGROUP CONTROLS NON-WRITABLE / QUOTA HARD GUARANTEE UNKNOWN`。** `capabilityOrDelegationProven=false`、`hardAggregateQuotaProven=false`、`detachedDescendantsExcluded=false`、`a2ExecutionAuthorized=false`、`traceAuthorized=false`、`readyToInstall=false` 的原始回执字段一律原样保留。若需下一批**启用委托 cgroup/8MiB 配额**，属于 Guest 环境/权限更改与原生产安全边界以外的专门执行动作，须先解释其必要性、对 VM/冻结 argv/证据格式的影响和替代方案，并得到用户明确授权；仅执行更多 `stat` 或重复 R2 不能解除门禁。

`A0/A1 PASS_SCOPED / A2-II-R PASS_SCOPED / A2-II-R2 PASS_SCOPED / A2 RESOURCE HARD QUOTA AND CHILD CONTAINMENT BLOCKED / A2-S/A3/A4 NOT AUTHORIZED / C1 DYNAMIC OPEN / C5-G2 NO-GO / S2 DAILY PAUSED`。本次仅在 MCP-workspace 本地文档归档审计结论，未连接 Mac/Guest，未修改任何配置，未推送或建立 PR。


