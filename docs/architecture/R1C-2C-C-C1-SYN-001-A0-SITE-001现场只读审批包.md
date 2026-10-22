# R1C-2C-C — C1-SYN-001 / A0-SITE-001：指定 Mac/VirtualBox 只读身份与隔离预检

**日期：2026-10-22。状态：H01–H08 HOST READ-ONLY SCOPE USER APPROVED / SITE NOT EXECUTED / GUEST ACCESS NOT AUTHORIZED。**

## 1. 已达门禁与本批准确范围

本批由 `dev@035480312048b2af91ab24d3e184397cab2873a2` 开始：PR #2904 / CI #7454 SUCCESS，仓库已有 `ops/runtime/c1_syn001_approval_offline.py`、聚焦测试及 [A0–A2 执行审批草案](R1C-2C-C-C1-SYN-001-A0-A2离线预检与执行审批.md)。[R0 §4.1](Runtime更新-R0冻结设计.md) 规定“非 root、可丢弃 VM 实验”只需准确 VM/VDI/SSH 身份与隔离状态、源码/关键输入 hash、真实退出结果；不再要求独立第三方见证、多主体逐跳 ZIP 交接和重复采集稳定依赖。[C0 §7](R1C-2C-C-C0独立身份与保管链证据复核.md) 已为 `CLOSED / LIMITED-ACCEPTED`，此次**不是重做历史 C0**。

**当前首批只申请下一次现场检查的 Mac Host/VirtualBox 只读操作清单**。由于本 MCP-workspace 只连接远端代码工作区，不具备用户 MacBook/VirtualBox 现场会话，不可能在此声称当前 VM running、SSH 主机身份已确认或 Guest 就绪。**本文编制阶段未执行任何命令。2026-10-22 用户已明确批准本批 H01–H08 Host 只读检查范围**；允许操作员在已批准的 Mac 上执行准确八条只读命令并保留必要 stdout/stderr/rc/UTC，但此审批**不认证历史目标一定仍是当次目标，也不包含 SSH、Guest、VM 配置修改、strace 或 root**。由于 MCP-workspace 无 Mac Host 会话，本轮由操作员在 Mac 终端执行并回传有限结果；执行前仍需确认目标是既有受控实验 VM/VDI，若不符立即 BLOCKED。

## 2. 执行前必须在私有环境填写的准确对象（不入 Git）

| 槽位 | 来源 | 当前 |
| --- | --- | --- |
| `APPROVED_VM_UUID` | 用户认可的 VirtualBox VM；可用既有 `R1C2C-C1-HOST-005` 原件的历史值作**比对线索**，但应确认仍是要用的那台 | 未取得当次批准 |
| `APPROVED_VDI_UUID` | 同一 VM 被批准的准确磁盘；历史 005 原件可作比对线索 | 未取得当次批准 |
| `APPROVED_HOSTONLY_NETWORK` | 现有隔离 Host-only 网络的精确名字/身份 | 未取得当次批准 |
| `APPROVED_GUEST_IP/USER` | 只在以后另获 Guest 审批时使用；本次不调用 SSH | 不属于本批 |
| `APPROVED_SSH_ED25519_FINGERPRINT` | 首次须在受控 VM **控制台**验证 Guest host 公钥，绝不借 SSH 第一次返回值自我背书 | 尚未确认 |
| `A0_SITE_001_OPERATOR/REVIEWER` | SanQ 内部操作者、审核人、当次操作时间、私有资料存储位置 | 待填 |

上述私有原件不应粘贴进公开仓库、PR、CI 日志、聊天公开位置；不包含 SSH 私钥、密码或 tokens。

## 3. 建议逐条审批的准确 Host 原始 argv

仅供 Mac 本地已有 VirtualBox 安装环境运行，要求 **普通登录用户、不 sudo、无写入的读取类子命令**。实际可执行绝对路径 `VBOX` 需先由操作者独立确认后固定；已知候选是 `/Applications/VirtualBox.app/Contents/MacOS/VBoxManage`，**未现场核实存在**。`APPROVED_VM_UUID`、`APPROVED_VDI_UUID` 均是**私有批准参数占位符**，批准前不可用“最新 VM / latest disk”或模糊名字替代。

```text
H01  [VBOX, "list", "vms"]
H02  [VBOX, "list", "runningvms"]
H03  [VBOX, "showvminfo", APPROVED_VM_UUID, "--machinereadable"]
H04  [VBOX, "showmediuminfo", "disk", APPROVED_VDI_UUID]
H05  [VBOX, "list", "hostonlyifs"]
H06  [VBOX, "list", "hostonlynets"]
H07  ["/usr/sbin/sysctl", "-n", "net.inet.ip.forwarding"]
H08  ["/usr/sbin/sysctl", "-n", "net.inet6.ip6.forwarding"]
```

对每条命令逐项保存原始 stdout/stderr、真实退出码、执行起止 UTC 与来源命令序号；不通过 shell 插值/管道改写 stdout，不接受非零退出却标成 PASS。若 Host 的 VirtualBox 版本不支持 H05 或 H06，需要保留准确错误并评审**替代查询**，不能默默跳过；如某 sysctl 不存在也如实标记 `UNSUPPORTED/UNKNOWN`。日志每条 stdout+stderr 建议上限 256 KiB、每条命令 15 s，超限/超时应记录 `INCOMPLETE` 并停止本批剩余命令，不截断后假报完整。

**已知风险控制：**命令不调用 `startvm`、`controlvm`、`modifyvm`、`snapshot`、`ssh`、`sudo`、`strace`、`apt`，不读取私钥/生产配置，不安装依赖，不改 VM/NIC/转发。目标 VM 不一致、Running 状态未知、VDI 身份不同、存在启用的 NAT/桥接或共享剪贴板/拖放异常时，判为 `A0_SITE_BLOCKED`，**不通过自动修复配置来凑 PASS**。本批只读数据需在 Mac 私有目录存储，不加入 Git。

## 4. 后置 Guest 身份/SSH 来源核验，不属于这次 Host 只读授权

完成 Host 原件核对后，下一独立批次 `A0-GUEST-001` 应先从受控 VirtualBox 控制台验证可信的 Guest SSH host-key，保存准确 `SHA256` 指纹，再审阅并授权**非 root 且 host-key strict 的 SSH** 与最小只读 Guest 命令。候选命令如下，全部属于**后续待审**：

```text
G01  ["/usr/bin/id", "-u"]
G02  ["/usr/bin/id", "-g"]
G03  ["/usr/bin/cat", "/proc/sys/kernel/random/boot_id"]
G04  ["/usr/bin/readlink", "/proc/self/ns/mnt"]
G05  ["/usr/bin/readlink", "/proc/self/ns/pid"]
G06  ["/usr/bin/cat", "/proc/sys/kernel/yama/ptrace_scope"]
G07  ["/usr/bin/sha256sum", "/usr/bin/strace", "/usr/bin/python3.12", "/lib64/ld-linux-x86-64.so.2"]
G08  ["/usr/bin/ssh-keygen", "-lf", "/etc/ssh/ssh_host_ed25519_key.pub", "-E", "sha256"]
```

准确存在的可执行路径、当前 Guest 用户、SSH host-key 算法与 ptrace/解释器前提必须当次检查。G08 的公钥由**受控 VM 控制台**取得更合适，不能在未可信的 SSH 会话中读取 G08 再把它当连接身份来源。未知/变化 SSH host-key 一律停，不启用 `StrictHostKeyChecking=no`、`accept-new` 之类的首次自动信任。**不需要第三方人员见证**，内部复核须独立于程序自报的内容。

## 5. A0-SITE-001 私有结果索引与退出

最小私有结果应包含：当次批次 ID、获准精确 VM/VDI/Host-only 标识来源、操作者与 SanQ 审核人、每条实际 argv/起止 UTC/真实 rc、关键原始输出的摘要、声明 `PASS/BLOCKED/UNKNOWN` 和不符项清单。上送仓库仅保留脱敏 ID、SHA、计数和负例，不存实际 MAC/IP/SSH 指纹或原始日志。不要为完成表格重做 C0 旧完整 ZIP。

- **当前：** `C0 HISTORICAL CLOSED/LIMITED-ACCEPTED`；`A0-SITE-001 H01–H08 USER AUTHORIZED / NOT EXECUTED BY ASSISTANT / SITE EVIDENCE PENDING`。
- **后续：**现场 H01–H08 逐条授权并执行/离机比对 → `A0-GUEST-001` SSH 信任与 Guest 最小身份另批批准 → A1 源/输入文件实际固定 → A2 精确启动/日志预算审阅 → 经单独批准才可 A3 SYN-01 / A4 SYN-02 真实动态观察。
- **保持禁区：**不授权更新/安装、VM 写操作、root/sudo、strace/ptrace 实验、AWS/生产环境、修改证据 v1 reviewer、跳过 C5-G2；`C1 DYNAMIC OPEN / C5-G2 NO-GO / S2 DAILY PAUSED`。

## 6. 2026-10-22 H01–H08 实测回传与离线技术复核（本批已获得原件）

**准确接收对象：**用户在 Mac 运行已冻结的 `A0-SITE-001-Mac-Host-ReadOnly-20261022.py`，原程序 SHA256 `c22005b6aa76474b468eae0744af3d0509f8c6f2638adcd92b1be40215cceb56` 与上传本地副本逐字节摘要一致；运行原始输出报告 8×`MATCHED_CANDIDATE`、8×rc0、`PASS_CANDIDATE_ONLY (NOT A0 APPROVAL)`。原件 `A0-SITE-001-20261022T143528Z.zip` SHA256 为 `c6407f37c73ad98286ee62b8256fa7039e5081ea09b2670c713416972ca95ae7`，共 19 ZIP 条目（1 目录+18 普通文件），未见 CRC 错、路径穿越、重复名称或符号链接。此 ZIP **不入 Git**。

**离机复核（本次真实执行，并非 operator 自报）：**
- `SHA256SUMS.txt` 覆盖除了自身之外的 17 份文件（`receipt.json`+ H01–H08 的 16 份 stdout/stderr），**17/17 精确内容哈希匹配**；每项 receipt 声明的 stdout/stderr 字节长度、原始 SHA256、起止 UTC 顺序都与 ZIP 内原始字节一致；8/8 命令 `rc=0`、`timedOut=false`、`overBudget=false`、`gap=null`、stderr 空。
- H01 指定 VM 见于已注册清单，H02 正在运行清单中匹配唯一指定 VM；H03 真正机器可读配置中的 VM UUID 与硬件 UUID、`VMState=running`、`nic1=hostonlynetwork`、`nic2..8=none`、`clipboard/draganddrop=disabled` 与脚本历史候选目标相符，无 SharedFolderNameMachineMapping/TransientMapping；H04 盘 UUID、真实挂载路径和 `In use by VMs` 相互一致。完整 UUID/MAC/Host 路径只在私有原件。
- H05 `VBoxManage list hostonlyifs` **rc0 但 stdout 0 字节**，不能声称验证了单独的 Host-only 接口存在；H06 `list hostonlynets` 原始 stdout 则明确显示 `HostNetwork` 状态 `Enabled`，VM Host-only 网络名称与此一致。现有 Host 侧配置佐证足以作**限定技术核验**，但 Guest 内的实际连接/SSH host key 仍完全未知。
- H07/H08 的内核原始值都严格为 `0\n`，IPv4/IPv6 forwarding 均关闭；无其他网卡被启用的配置声明。起止时间集中于 `2026-10-22T14:35:28Z` 约 0.51 秒，首次 VM 启动时间来源于同批机器输出，不作为独立可信时间锚。
- `receipt.json` 显式 `classification=PASS_CANDIDATE_ONLY`、`historicalComparisonOnly=true`、`a0Approved=false`、`guestSshAuthorized=false`、`traceAuthorized=false`。**独立哈希复算证明本次归档内部一致和原始输出与历史候选匹配，未单独证明获批准对象可信来源、当前 Guest 身份或 SSH 首次信任链**；不把程序自报升级为独立平台公证。

**最终 scoped 裁定：**`A0-SITE-001 HOST RAW OFFLINE REVIEW = PASS_SCOPED`（限于准确 Mac/VirtualBox 已批准的 H01–H08 目标配置）；`A0-GUEST-001 = OPEN / NOT AUTHORIZED`、`A1/A2 = OPEN`、`A3/A4/A5 = NOT EXECUTED`。历史 `C0 CLOSED / LIMITED-ACCEPTED` 继续有效，`C1 DYNAMIC OPEN / C5-G2 NO-GO / S2 DAILY PAUSED`。不因 Host 结果自动批准新的 SSH、Guest 指纹建立、文件投送或 `strace`。本次仅更新本地审批文档/状态，未推送。

**后续 Guest 续报（2026-10-22）：**用户另批授权、执行 A0-GUEST-001；其独立原始 ZIP 已复核 28/28 SHA 清单、13/13 Host+Guest rc0，控制台 ED25519 pin 与扫描公钥重新计算指纹严格匹配，Guest UID/GID=1000，三个关键执行文件 SHA 与既有来源候选吻合。详细见 [A0-GUEST-001 只读身份复核](R1C-2C-C-C1-SYN-001-A0-GUEST-001只读身份复核.md)。Host 本批原件裁定仍为 `PASS_SCOPED`；A0 内部合成实验范围核验满足，但原 A0/Guest 回执权限 false 不变，A1/A2/trace 仍需另批审批。

