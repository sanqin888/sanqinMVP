# R1C-2C-C — C1-SYN-001 / A1-SOURCE-001 源材料安全投送与冻结审批

**2026-10-22 / LOCAL DOC-ONLY PREPARED / GUEST WRITES NOT AUTHORIZED / LIVE A1 NOT EXECUTED**

## 1. 继承的实际结论与本批范围

本批从最新 `dev@d7f57ff23814168a38d9eb4ea2d3489e2fee6965` 开始；PR #2905 的 CI #7456 全绿，A0-SITE 与 A0-GUEST 技术复核以 `PASS_SCOPED` 纳入主线。A0 是本次 **非 root、可丢弃的 Host-only Ubuntu Guest 合成实验**的限定身份与隔离技术核验；历史 C0 为 `CLOSED / LIMITED-ACCEPTED`。原始 `guestAuthenticated=false/a0Approved=false/traceAuthorized=false` 回执不改，A0 成功也**不自动授权在 Guest 创建文件或执行程序**。

**本切片的目标是 A1 计划与逐项写入审批范围冻结，而非实际 Guest 投送。**只复用既存 [C1-SYN-001 实验设计](R1C-2C-C-C1-SYN-001受控观察设计与审批草案.md)、[A0–A2 离线预检](R1C-2C-C-C1-SYN-001-A0-A2离线预检与执行审批.md) 与 [A0-GUEST 原始核验](R1C-2C-C-C1-SYN-001-A0-GUEST-001只读身份复核.md)。不新建 Runtime 模块、不修改 `c1_syn001_approval_offline.py` 或 v1 reviewer、不新建兼容路径或迁移、不要求第三方见证。Mac/VM/SSH/IP/boot/namespace 原始身份信息留在用户受控私有档案，不入 Git/CI。

## 2. A1 三份唯一获准候选源（直接承袭既有 SHA）

**必须从同一已审 Git 版本取原始字节**，不能从聊天渲染、复制代码块、邮件、Word 或重新键入生成。来源仓库 `sanqin888/sanqinMVP`，推荐锁定本工作包源基线 `d7f57ff23814168a38d9eb4ea2d3489e2fee6965`（该提交继承 D0 三文件）；若未来重新下载，必须核对准确 Git tree/commit 与下列原始内容的 SHA。私有 Mac 中的 source snapshot 必须是逐字节文件，而非重新编码文本。

| 从 Git 取用的惰性原件（均在 `docs/architecture/` 下） | Guest 最终目标 | bytes | SHA256 |
| --- | --- | ---: | --- |
| `C1-SYN-001-SYN-01.py.txt` | `/tmp/sanq-c1-syn-001/syn01.py` | 1,028 | `7e5d7e810ffd1e0a2720ada15a26e9a39004fda50ecd1317c8f80c82c9974cac` |
| `C1-SYN-001-SYN-02.py.txt` | `/tmp/sanq-c1-syn-001/syn02.py` | 1,641 | `411fa8ebc54301c554d3380d7d778d9cd7ae176b62833a3218673b5054c7c546` |
| `C1-SYN-001-input.txt` | `/tmp/sanq-c1-syn-001/input.txt` | 25 | `8df9b096863665361212a14784dccabcc9de929bd524ec1529ed1eb2f1df6552` |

期望总载荷 **2,694 字节**；不允许任何额外随包 `.py`、隐藏文件、`requirements`、可执行 binary、Python bytecode。源文件尾部 LF 是哈希覆盖内容。三份来源必须在 **Mac 传输前与传输后各核验一次 SHA256 和 byte size**；若存于 `~/Downloads` 或共享文件夹，仅作为未认证输入，须复制到私有非共享 source staging 后才计入本批。

## 3. 目标身份、路径与可写权限的准确约束

| Gate | 必须核实 | 异常处理 |
| --- | --- | --- |
| A1-00 Target binding | 当次 VM/VDI 与 A0-SITE 一致，Host-only 网络仍为已准隔离网络；控制台预先 pinned ED25519 host key 与本次 SSH 严格验证结果相符；连接用户 `ubuntu` 的 UID/GID 1000/1000。**不得凭历史 A0 后重启的 boot ID 继续使用旧会话。** | 任何 VM/VDI/key 变动、Guest 重启或无法读取当次状态：停止并重新做相关的最小 A0 核验，不再使用未确认 key |
| A1-01 Parent/target | 只允许 Guest 路径 `/tmp/sanq-c1-syn-001`；创建前确认 `/tmp` 为该 Guest 本地受控文件系统、不是共享/bind 路径；拒绝任何既存同名目标（含目录、符号链接、挂载点），不 `rm -rf`、不重用旧目录 | `BLOCKED_TARGET_EXISTS`，原样保留，不清除现有原件来凑 PASS |
| A1-02 Owner/modes | 非 root UID=GID=1000；目录 **0700**，由本次普通用户唯一创建；三个 regular files **0400**，owner 1000，`nlink=1`，非 symlink，大小/哈希严格等于表中原件；不需要给脚本文件 executable bit | 权限、uid/gid、文件类型、硬链接、mode 不符均 `BLOCKED` |
| A1-03 Placement | 单次创建唯一私有目录，在该目录内逐份以 **create-exclusive + no-follow** 语义写入恰三份源字节；任何重名失败必须停止；通过真实 Guest 本地读回文件核验，不信任传输进程的写入成功自报 | write/rename/sha/copy 结果未知时记 `UNKNOWN/BLOCKED`，禁止无审查重试或覆盖 |
| A1-04 Persistence | 输入/脚本只读不可执行，文件和父目录归属相同非 root 用户；如后续 A2 需新增 `raw/` 子目录，应 **另批批准**，本批不写 trace/log 到 Guest | `A2/A3/A4 NOT AUTHORIZED` |
| A1-05 Audit | 记录准确审定 Git commit、Mac 原始 SHA/size、批准的 SSH 指纹来源（私有）、每一条写入/核对动作 argv、rc、日期 UTC、Guest SHA/size/uid/gid/mode/nlink、失败原因与有限私有记录索引 | 任一凭证缺失就保留 `A1 INCOMPLETE`；无需第三方签字或逐跳 ZIP 交接 |

## 4. 未来执行操作的审批清单（尚未授权）

下面是**效果与预期对象**，不是可立刻复制粘贴运行的脚本。准确 Mac 端工具路径、SSH argv（`-o StrictHostKeyChecking=yes`、私有 `UserKnownHostsFile`，与控制台公钥 pin 绑定）、Guest 端具体 `python3 -I -S -B` 启动与输入流格式、超时/预算、stdout/stderr/rc 采集器在下一版操作包中逐 token 冻结后，**再次经用户批准**。工具不能默许通过 `scp` 覆盖文件、远端宽泛 shell、`chmod 777`、`sudo`、`ssh-keyscan` 自动建立信任，或 `StrictHostKeyChecking=no`。

1. **M01 本机只读阶段**：从固定 Git commit 提取上述三份 bytes；确认大小/SHA 三项全部一致，固定私有 staging，绑定源提交与文件原始哈希。
2. **G00 本次安全前检（只读）**：原先受控 VM/VDI/Host-only 与 SSH host key、UID/GID/boot/ns 重读；只允许在确认 Guest 文件系统无共享挂载、精确目标不存在时继续。
3. **G01 单次创建（写入）**：非 root Guest 原子创建 `/tmp/sanq-c1-syn-001`，权限 0700；与已冻结 A0 对象一致且用户明确批准后才允许。
4. **G02 传入恰三文件（写入）**：限制总流原始大小为 2,694 B；接收时核对每个成员的 exact name/size/SHA，`O_CREAT|O_EXCL|O_NOFOLLOW`、文件初始权限 0400、仅匹配的三条目标路径；不从未验证压缩包自动展开到 Guest。
5. **G03 Guest 只读回检**：从实际 Guest 路径独立读取模式、owner、nlink、三份 SHA 和长度，结果与源 commit/本批事前哈希相互一致，记录真实退出码；在 Guest 侧不运行源程序。
6. **G04 Mac 归档与退出**：保留有必要的准确审阅摘要（不用保存密码或私钥），任何失败保持残留/未知并停止；不自动删除 Guest 测试目录，不重试创建，不跨 A2/A3/A4 门禁。

**明确的额外审阅点：**如果需通过 SSH 启动 Guest helper 去完成目录和三文件创建，该 helper 本身也属于额外传入的代码/执行动作，其完整字节、来源、执行方式和授权需在下次审批单中单独冻结。不要只因写入三份脚本就视为允许第 4 个 Guest helper 未审核代码。

## 5. 本地交付边界与后续审批

本次只完成 A1 的**目标、三份冻结输入、强制核对项、必要写入效果及失败停止条件**。先复用 PR #2904 经 CI #7454 验证的纯内存三源 byte/SHA 审核，不复制其功能形成冗余代码；不构建新的解释器/SSH 客户端/安全 shell 兼容层。若下一阶段源投送的实现必须改动架构边界或新增依赖，先提供影响与替代方案并另获授权。

- `A0-SITE=PASS_SCOPED / A0-GUEST=PASS_SCOPED`（技术核验，不修改原权限 false）。
- `A1-SOURCE-001 PLAN FROZEN / GUEST WRITE NOT AUTHORIZED / SOURCE NOT DEPLOYED`。
- `A2 EXECUTION APPROVAL OPEN / A3/A4 TRACE NOT AUTHORIZED / A5 NOT EXECUTED`。
- `C0 CLOSED/LIMITED-ACCEPTED / C1 DYNAMIC OPEN / C5-G2 NO-GO / S2 DAILY PAUSED`。

**下一次需要用户确认的准确授权范围：**在已核对的这台 Host-only Ubuntu 隔离 VM 内，允许非 root 用户单次创建上表唯一测试目录，严格传输/落地三份固定源原件并作只读文件 SHA/mode/owner 复核，允许辅助程序时必须同时审阅其精确源字节；不包括 `strace`、执行 SYN-01/02、额外网络通道、root、安装/升级、VM 写配置、AWS 或生产写操作。

本批不触碰 Mac/Guest/SSH/VirtualBox/VM/AWS/生产，未运行本批 CI、不新增任何真实文件投送行为。完成本地改动报告后暂停，未经用户再次明确批准不推 PR/合并。

## 6. 后续用户授权与准确 Mac 操作器冻结（2026-10-22）

**审批更新：**用户随后明确批准，仅在此前 A0 限定技术核验的同一 Host-only Ubuntu Guest 内，以非 root 身份单次创建 `/tmp/sanq-c1-syn-001`、准确传入上述三份原始 bytes、核验 owner/mode/nlink/size/SHA；不授权 SYN-01/02、`strace`、root、自动清理、VM 配置变化或生产写入。此项属于 **`A1 SOURCE PLACEMENT USER AUTHORIZED / SITE EXECUTION PENDING`**，而非历史 §5“尚未授权”状态的覆盖。

Mac 操作器 `A1-SOURCE-001-Mac-Guest-Placement-20261022.py` 已单独以用户文件形式准备，SHA256 **`51a3c2942ca728b3deab74e22bceebef200f13877e9157d07bbd6eeded8f8267`**。程序内嵌从受控 Git 提交 `d7f57ff23814168a38d9eb4ea2d3489e2fee6965` 原始 SHA 校验的三份精确 bytes，进入真实写入路径前要求操作者再次从同一 VirtualBox **控制台**确认既有 ED25519 pin，重查 VM/VDI/Host-only/转发与 boot/ns/UID、`/tmp` mount 和目标不存在。它不在 Guest 传入或运行第四份 Python helper：远端仅用现有 coreutils `mkdir -m 0700`、带固定 `umask 0266` 的 `dd conv=excl oflag=nofollow iflag=fullblock` 逐份创建只读文件，以及 `stat`/`sha256sum` 回检。固定权限 `0400` 在文件创建时即成立；全部真实输出与 rc 只保存在 Mac 的受控私有证据目录。任何失败停止，保留部分原件且不自动覆盖/清理；该程序**绝不会**执行三份实验源码。需由用户在 Mac 上实际执行，此 MCP 无访问用户 Mac 的渠道。

已做离线静态语法编译、三份原始字节 SHA/长度核对、受控的无 VM/SSH subprocess 模拟成功路径、GNU `dd` 独占写入/再次写入拒绝语义测试。**没有**本次真实 Guest 文件落地结果、实测 SHA/权限或任何 A1 技术 PASS；结果须由用户回传私有 `A1-SOURCE-001-*` 证据包后再独立审核。仓库本地文档未推远端。

## 7. 2026-10-22 当次投送回执与独立离机复核（A1 技术验收）

**最新结论优先于 §5–§6 历史阶段状态。** 用户已按明确批准在既有隔离 Ubuntu Guest 执行一次投送；真实 Mac Terminal 返回 `A1_PLACEMENT_CANDIDATE_ONLY (NOT A2 / TRACE AUTHORIZATION)`。独立读取用户提交的 `A1-SOURCE-001-20261022T161938Z.zip` 原件，完整 ZIP SHA256：

`fc288a8cf804283d9aecc3ae8506511626f4b58b791a42d6597fe0c525db942c`

**原件检查：**54 个 ZIP 条目（1 目录、53 普通文件；解压总量 28,441 B），无重名、CRC 错、路径穿越或 symlink；`SHA256SUMS.txt` 对除自身外 **52/52 个文件**覆盖并逐字节重算全匹配（包含 `receipt.json`、SSH `known_hosts.approved`、25 组 stdout/stderr）。`receipt.json` 共 25 项有序命令，每一项 stdout/stderr 原始长度与 SHA256 严格吻合、全部 `rc=0`、`candidateMatch=true`、`timedOut=false`、`overBudget=false`、`gap=null`；起止 UTC 自报从 `2026-10-22T16:19:38.738463Z` 至 `16:19:46.451872Z`。唯一非空 stderr 为 SSH keyscan 对端版本 banner（60 B），无报错性非零退出；归档中已原样保留。

**对象再绑定：**A1 的 VM UUID、VDI UUID、Guest 用户/IP、控制台先验 ED25519 指纹，与另批 `A0-GUEST-001-20261022T145533Z.zip` 原件中的对应字段一致；`H05-keyscan-stdout.bin` 与原 `S05-keyscan-stdout.bin` **94/94 B 完全一致**，与本次 `known_hosts.approved` 也逐字节一致，并从 Base64 公钥原始字节独立重算 SHA256，结果匹配已批准控制台 pin。A1 当前 Guest boot ID、mount/PID namespace 的原始 stdout 与旧 A0-GUEST G03/G04/G05 **分别完全一致**，未发现中途重启/身份变更的记录。H00 当前 VM 仍 `running`、NIC1 为 Host-only、NIC2–8 `none`、剪贴板/拖放禁用；H01 磁盘 UUID/归属一致、H02 HostNetwork Enabled、H03/H04 IPv4/IPv6 forwarding 均为 0。该交叉一致性是**两批受控输出**的技术证据，不意味着跨窗口绝对不可替换。

**Guest 操作原始检查：**

| Gate/命令 | 当前真实回执 | 判定 |
| --- | --- | --- |
| G00 UID/GID、boot/ns、`/tmp` 父目录 | UID/GID `1000/1000`；`/tmp` `directory|0|1777`；`findmnt -T /tmp` 为根分区 `ext4 rw,relatime /`；目标目录不存在的查询 `rc0` | `PASS_SCOPED`，不涉及生产路径或 root 执行 |
| W01 创建 + V01 回检 | `/usr/bin/mkdir -m 0700 -- /tmp/sanq-c1-syn-001` `rc0`；`directory|1000|1000|700|2` | 独占私有目标已创建、owner/mode 匹配 |
| W02–W04 独占文件写入 | 每份 `/usr/bin/dd` 分别使用 `conv=excl`、`oflag=nofollow`、`iflag=fullblock`，写入目标 `input.txt/syn01.py/syn02.py` 均 `rc0` | 记录的命令禁止覆盖及 symlink 跟随；无第四个 helper、无实验脚本执行 |
| V02–V04 真实 Guest 读回 | `input.txt: regular file|1000|1000|400|1|25`；`syn01.py: ...|400|1|1028`；`syn02.py: ...|400|1|1641`；三份 `sha256sum` 的 raw 输出与上表源冻结 digest 逐项一致 | `3/3 FILE ATTRIBUTES + SHA MATCHED` |

**独立离机核验的实际边界：**此 ZIP **不含从 Guest 再上传的三份文件完整字节**；复核的是 Guest `stat` 和 `sha256sum` 的确切原始回执（及操作者程序冻结 SHA `51a3c2942ca728b3deab74e22bceebef200f13877e9157d07bbd6eeded8f8267`），不能声称离机直接对 Guest 文件进行完整原始字节重算，更不能证明未来实验执行窗口内内容绝无更换。归档仍明确 `classification=A1_PLACEMENT_CANDIDATE_ONLY`、`a1Approved=false`、`a2Authorized=false`、`traceAuthorized=false`、`productionAuthorized=false`、`cleanupPerformed=false`；不倒改原始字段。

**本批最终限定裁定：**`A1-SOURCE-001 PLACEMENT AND READBACK = PASS_SCOPED / THREE FROZEN FILES PRESENT`。这是 SanQ 内部离机技术审阅后的判断，覆盖源投送与当次属性/SHA 检查；不改变原 operator `a1Approved=false`，也不授权 A2 的 trace/raw 采集器准备写入或 A3/A4 的真实 `strace`。已有目录应原样保留，**不得重新执行独占创建或覆盖投送**。后续单独进入 `A2` 精确执行命令、stdout/stderr/rc/预算、写入路径与异常冻结门禁审批；`C1 DYNAMIC OPEN / C5-G2 NO-GO / S2 DAILY PAUSED` 不变。本地文档待用户审阅，未经授权不推远端。


