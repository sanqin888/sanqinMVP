# R1C-2C-C — C1-SYN-001 受控动态观察实验设计与审批草案

> **2026-10-22 取证规则更新及 A0 责任迁移（本地待审）：**C1-SYN-001 的 A0–A5 取消第三方人员见证、签署 PDF、外部 SHA 通知和跨主体 ZIP 交接强制要求，保留批准的 VM/VDI/SSH 对象、执行者权限、源码/输入 SHA、真实结果和必要日志，以及与采集器自报分离的 SanQ 内部技术核验。依据 [C0 §7](R1C-2C-C-C0独立身份与保管链证据复核.md)，**历史 C0 已拟定 `CLOSED / LIMITED-ACCEPTED`，A0 尚为 `OPEN`，只针对下一次现场实验的执行前安全核对**；不要求把 B-004 重新采集或补签。下文旧日期草案中的“见证人签认后”不再作为未来执行前置；历史 B-004 LIMITED 和 v1 `BLOCKED` 保留。详情见 [R0 §4.1](Runtime更新-R0冻结设计.md)，执行 `strace` 仍须另获授权。

**2026-10-21 / LOCAL DESIGN + EXACT SOURCE CANDIDATES PREPARED / NOT EXECUTED / C2 LIVE TRACE NOT AUTHORIZED。** 此文属于 Runtime/Ops 的 C1 离线设计切片，继承 [R1-C 主工作包 §9–§15](C5-G2-R1-B-只读GuestFD采集器与执行审批.md) 和 [R0 冻结决策](Runtime更新-R0冻结设计.md)。源码审计基线 `origin/dev@0fc583b071bf92a62d645fe5153051ccb37d525b`（PR #2900）。本批不变更生产 Runtime、真实 bootstrap、17+Manifest、evidence v1、离线 reviewer、VM/Guest/SSH、AWS 或权限。

## 1. 审计事实与授权边界

- C0 已执行 `R1C2C-B-004` Host/Guest 采集、操作员 `SHA256SUMS`、见证人回邮/PDF `LIMITED` 以及独立离线 ZIP 结构审核。复用该**历史有限证据**作为实验背景，不重新采集旧件，不声明任何新会话得到身份认证。参考主文 §15：`C0 EXECUTION EVIDENCED / OFFLINE STRUCTURE CHECKED / IDENTITY-CUSTODY OPEN-LIMITED`。历史 ZIP SHA256 `d1bc78e709591eade7df67584e7340b6c6cc14edae5b9f49b597c866f544139b`；见证 PDF SHA256 `85440dc4d25600d7dadd5334c304d08a4cad46715b1c96136fafc89f4fccf166`。这些摘要是既有证据标识，不是本次前置认证新 pin。
- 已审阅 `ops/runtime/r1c2_consumption_offline_review.py` 和 `ops/runtime/tests/test_r1c2_consumption_offline_review.py`：v1 只接受固定精确字段、事件顺序与实际 raw 引用，最多 32768 events、64 processes、512 file bindings、64 artifacts、单 raw 32 MiB、raw 合计 64 MiB、封套 32 MiB；任何结果均 `decision=BLOCKED`、`readyToInstall=false`。这些限制**不改变**。
- `_events` 对每个非 observer 进程要求初始 `PROCESS_EXEC`、结束 `PROCESS_EXIT`、且 `PROCESS_EXEC` 恰一次。真 fork-only child 的第一事件可能不是 EXEC；必须保留真实先后顺序并报告 `EVENT_ORDER_INVALID` / `CHILD_UNTRACED`，**不得伪造或重新排序来让 v1 通过**。
- `ops/runtime/normal_runtime_launch.py` 仅为 hash-only launch proposal（`uid=0` 的正式 Runtime 不属于此次实验）；`normal_runtime_update.py` 目前为 in-process core，不存在已批准执行的真实 bootstrap/effect adapters。本批 synthetic 是单独受限候选，绝不能与真实 S6 / R4 换用。
- C1 静态来源：`C1-OBSERVER-NATIVE-003` 单 ELF raw → 包成员独立对照限定匹配；`NATIVE-002` 三 ELF 只有操作员 SHA 对包成员的报告匹配，缺独立 raw 复算；旧 `C1-SOURCE-STRACE-001` 冻结 XZ 审核器仍有合法多 stream 误拒绝。不能把静态候选图当作观察器/CPython/dlopen 的完整执行时闭包。

## 2. 精确的纯文本源候选（当前不具执行权）

下列仓库文件是 **inert UTF-8 文本**，故意使用 `.py.txt` 文件名；只用于设计冻结与本地审阅，不属于 Runtime 启动模块，不会被现有装配器调用。拟在将来经过**单独逐项批准的 Guest 私有临时目录**，由操作员校验准确 SHA 后映射为 `syn01.py` / `syn02.py`；本次未复制/执行。

| 候选 | 相对路径 | 字节数 | SHA-256（草案内容固定值，转交时仍须独立复算） |
| --- | --- | ---: | --- |
| SYN-01 | [C1-SYN-001-SYN-01.py.txt](C1-SYN-001-SYN-01.py.txt) | 1028 | `7e5d7e810ffd1e0a2720ada15a26e9a39004fda50ecd1317c8f80c82c9974cac` |
| SYN-02 | [C1-SYN-001-SYN-02.py.txt](C1-SYN-001-SYN-02.py.txt) | 1641 | `411fa8ebc54301c554d3380d7d778d9cd7ae176b62833a3218673b5054c7c546` |
| 唯一合成输入 | [C1-SYN-001-input.txt](C1-SYN-001-input.txt) | 25 | `8df9b096863665361212a14784dccabcc9de929bd524ec1529ed1eb2f1df6552` |

源文件均为 ASCII / UTF-8，无 BOM；本表的文件长度和 SHA 针对**包含末尾一个 LF 的完整原始字节**。独立源文件重新落地、传输和在 Guest 上读取后须以原始字节重新验 hash，任何大小/摘要不一致直接停止。真实私有来源介质、权限/生命周期、独立预冻结 SHA 渠道当前尚未建立，不能把该表视为 `SOURCE_AUTHENTICATED`。

### SYN-01：exec/open/read/exit

拟观察从预 exec 的 strace 启动 Python 3.12，隔离 flags `-I -S -B`；脚本在非 root、cwd 固定条件下，对非符号链接且归实验 UID 所有的只读 `input.txt` 执行 `open(O_RDONLY|O_NOFOLLOW|O_CLOEXEC)`、`fstat`、25 字节 `read` + EOF 检查、SHA256 比对与退出。预期**仅在全部条件成立时** stdout 有 `SYN-01:READ-COMPLETE`，退出 0；不是已观测结果。任何读取失败、摘要不匹配或非零退出均保留原始 stderr/rc，视作 `DISCOVERY/BLOCKED`。

### SYN-02：fork/child exec/mmap/exit

拟观察父 Python `fork()`，子进程以准确 `os.execve('/usr/bin/python3.12', [...], fixed_env)` 自 exec 同源脚本的 `SYN-02-CHILD` 分支；子进程 `mmap(ACCESS_READ)` 并读取映射内 25 字节计算 SHA256，然后退出；父进程 `waitpid` 收尸并确认子进程完整成功。仅条件满足时，子 stdout `SYN-02:CHILD-MMAP-COMPLETE` 与父 stdout `SYN-02:PARENT-WAIT-COMPLETE`，各进程 rc=0。Python `mmap` 与 `hashlib` 自身可能加载额外 native ELF，**会计入真实观察/来源缺口**；不得假定只触及单个 input 文件。fork-only 阶段及 child exec 的实际次序/父子关系必须按 raw trace 保留，不以 v1 的生命周期限制反向修饰事实。

## 3. 拟议准确执行对象（只用于下一批审批）

**所有以下对象均为提议而非已核实的现场值。** 暂定 disposable、非生产、独立 host-only Guest；VM UUID/VDI、实际 UID/GID、SSH known_hosts 指纹、当前 boot/ns/UTC、目录 owner/mode、真实 source copy 通道需要在**本次执行前的独立审批凭据**中填写。历史 `004` 的 UID 1000 不是将来场景的自动许可。不得因为只做 synthetic 而借用正式 root bootstrap 身份。

- 拟议 Guest 私有目录：`/tmp/sanq-c1-syn-001`，要求真实运行用户独占 `0700`、预检查绝无 symlink/bind/shared mount、不是 SanQ Runtime/数据库/生产文件目录；输入只读、独立 hash、禁止更改模式绕过；`raw/` 作为唯一候选 trace 文件写入位置，须在执行批准中列准确创建/清理命令。此路径是否存在**未核实**。
- 拟议原始 argv，逐个 token，不经 shell 组合（`-ff` 为跟随并按 PID 拆分日志候选，实际语义/兼容性必须实验前独立复核）：

```text
SYN-01:
["/usr/bin/strace","-ff","-ttt","-T","-yy","-s","128","-o","/tmp/sanq-c1-syn-001/raw/syn01.trace","/usr/bin/python3.12","-I","-S","-B","/tmp/sanq-c1-syn-001/syn01.py","SYN-01"]

SYN-02:
["/usr/bin/strace","-ff","-ttt","-T","-yy","-s","128","-o","/tmp/sanq-c1-syn-001/raw/syn02.trace","/usr/bin/python3.12","-I","-S","-B","/tmp/sanq-c1-syn-001/syn02.py","SYN-02"]
```

- 拟议 `cwd=/tmp/sanq-c1-syn-001`；`env` 精确白名单为 `HOME=/tmp/sanq-c1-syn-001`、`PATH=/usr/bin:/bin`、`LANG=C`、`LC_ALL=C`、`TZ=UTC`，不携带任何 SanQ secret、SSH agent、Python path、tokens、生产环境变量；不传 `PYTHON*`。如何由有权限的启动者施加**完全精确的 env/cwd/UID/GID/umask 0077** 尚待审批，不能凭 `-I` 推断环境安全。
- 本次**没有**批准执行上述 argv；即使工具已存在，也不得据此新建目录、拷贝候选、SSH/strace/fork 或修改 Guest。候选 `-ff/-yy` 写含真实路径的日志，必须离机私有受控；真实系统调用事件可能超量、无法仅通过 synthetic 列出全部解释器来源。准备执行前需额外冻结观察器 binary/loader/native package member 与现场原始字节 pin，及其运行条件。

## 4. 两实验分立的预算、负例与失败保全

| 项目 | 提议上限与 fail-closed 规则（尚未执行） |
| --- | --- |
| 单场景 wall time | 建议 30s，包括 observer、所有后代与完整 flush；超时需终止**本次已批准的私有实验进程树**并登记信号、退出态、可能存活后代；不假设 kill 后即完成无污染 |
| 原始写入预算 | 每场景拟议 raw 总量最多 8 MiB、单文件最多 4 MiB；每个 PID trace、stdout、stderr、observer stderr、argv/env 脱敏回执、内外 rc、时间/身份回执单独计数；不允许静默截尾以伪称覆盖 |
| v1 上限 | 同时严格服从事件 32768、进程 64、file 512、artifacts 64、单 raw 32 MiB、raw 总计 64 MiB 和封套 32 MiB；任何更严的存储配额优先，超额 BLOCKED |
| 留存与交接 | 保存实验源码与输入 SHA、准确 VM/Guest、相关 trace、stdout/stderr、内外 rc、异常时必要系统状态及私有归档 SHA；无需每跳 ZIP 交接证明、第三方签认或独立渠道通知 |
| 单场景负例 | 启动点缺失、child 未跟踪、exec 事件缺失或重排、input 改字节/size/mode、SHA 不符、unknown native import、日志截断/丢失、现场 VM/SSH 身份核对失败；技术异常按真实结果记录，不伪造缺失事件 |
| 日志完整性限制 | `strace -o` 本身不保存完整 stdout/stderr/rc；应由经批准的采集器保存本场景必要日志/退出状态并计算归档摘要。无需外部见证或第二渠道哈希通知；但仅凭日志完整性不能证明被观察文件在实际消费时不可替换 |
| 清理与中断 | 异常时先停止实验并保全，禁止自动恢复/删除失败原件；完成内部归档与必要 SHA 核对后，再按批准范围清理私有目录。运行结束不意味着隔离/时间窗口全部得到认证 |

审批时将 stdout 期望视为单纯程序行为候选，而非健康证明；非零退出、部分成功、raw 缺失也要留下逐项证据。前置静态源 hash 与尾随复算只能佐证文件完整性，不证明观察时段不可替换。

## 5. 分阶段批准矩阵（不可跨门禁）

| Gate | 所需交付/内部技术核验 | 当前 |
| --- | --- | --- |
| D0 离线方案与纯文本 source | 本文、两份确切文本候选、固定 input 长度与 SHA、当前 v1 限制/负例；核对仓库源码和字节 | `PREPARED FOR LOCAL REVIEW`；现场输入/执行尚未完成验证 |
| A0 现场 C0 单次绑定 | 实验前核对 SanQ 批准的 VM/VDI、Host-only、SSH host key、boot/ns/UID/GID；受控 Mac/VirtualBox 与既有 SSH 记录可作为可信来源，不要求第三方身份批准 | `OPEN` |
| A1 observer/source/实验输入冻结 | 现场 observer/Python/native 真实原件及签名来源、全部 source/fixture hash、只读输入身份、不可替换窗口措施；C1-NATIVE-002 raw 缺口独立登记 | `PARTIAL / BLOCKED` |
| A2 逐条执行审批 | 用户审阅完整 Host/SSH/Guest argv、cwd/env、UID/GID、限定写入路径、超时/日志配额与失败保留；在 SanQ 内部保存输出，不要求第三方人员见证或签署 | `NOT REQUESTED / NOT AUTHORIZED` |
| A3 SYN-01 live discovery | A0–A2 成立后单独运行、收全 raw，不碰生产；局部结构分析可 REJECTED | `NOT EXECUTED` |
| A4 SYN-02 live discovery | 同上，重点保留 fork-only child 的真实 first event、child exec、mmap、exit；不能压平 v1 | `NOT EXECUTED` |
| A5 独立离机结果判定 | 离机 raw 核验与逐场景对照，判断 v1 的表达缺口；如需 v2、观测器补丁、依赖/权限、平台策略变更，另提交影响与替代方案获授权 | `NOT EXECUTED` |

**下一批准确授权申请不是“运行 C1-SYN-001”，而是“允许完成 A0–A2 的现场对象/命令/证据封存审批包，供再次人工审阅”。** 该批仍须列出任何拟进行的独立 Host/Guest 只读操作和文件写入/转交准确命令，不能把本设计文档当作已授现场取证或 ptrace 权限。

## 6. 退出裁定

最高结论仅：`C1-SYN-001 DESIGN MATERIALS PREPARED / SOURCE TEXT CANDIDATES RECORDED / LIVE DISCOVERY NOT AUTHORIZED / C0 IDENTITY-CUSTODY LIMITED / C1 DYNAMIC OPEN / C5-G2 NO-GO`。

此次设计不修改冻结 v1 / `NormalUpdateFlow` / `LaunchMaterials` / root bootstrap；不更改权限、依赖、CI、schema、数据库、Guest、VM、AWS、业务或生产。新的脚本仅作为文档目录的 inert source 候选，MCP-workspace 未运行 lint/build/test，也没有执行 Python/strace/SSH。后续任何真实 trace 及 v1→v2 必须分别审阅、取得明确授权。
