# R1C-2C-C — C1-SYN-001 / A2-CAPTURE-001 受控采集与失败保全设计审计

**2026-10-22 · LOCAL DRAFT / A2 DESIGN IN REVIEW / NO EXECUTION AUTHORITY**

## 1. 权威基线、精确范围

- A1 文档和 scoped 实证经 **PR #2906 / CI #7459 SUCCESS** squash merge 至 `dev@d746698145a1f340cccacd464f5ddd21249c6519`；在此基础上新建独立本地分支。A0 Host/Guest `PASS_SCOPED`、A1 源投送/Guest 读回 `PASS_SCOPED`；A1 证据包 `A1-SOURCE-001-20261022T161938Z.zip` SHA256 `fc288a8cf804283d9aecc3ae8506511626f4b58b791a42d6597fe0c525db942c`。
- 既有 Guest 是准确的隔离 VirtualBox Host-only Ubuntu（UID/GID 1000/1000），唯一 `/tmp/sanq-c1-syn-001` 已存在且由该用户拥有、目录 `0700`；`syn01.py` 1028 B、`syn02.py` 1641 B、`input.txt` 25 B，三个文件 `0400`、`nlink=1`、Guest 读回 SHA 与冻结的 [A1 §2](R1C-2C-C-C1-SYN-001-A1-SOURCE-001安全投送与冻结审批.md) 吻合。**不得重新运行 A1 独占创建/传输**，也不重写 A0/A1 的历史权限字段。
- A2 的本批任务是**确定下一次真实观察前，采集器必须实现并验证的安全合同、精确 argv、前置检查与拒绝条件**。不是已授权实际创建 `raw/`、投送/运行 collector、SSH、`strace`、SYN-01、SYN-02、`fork` 或 `mmap`。不访问用户 Mac/Guest，不碰 VM 配置、生产/AWS、root、schema、依赖或冻结 v1 reviewer。原 `c1_syn001_approval_offline.py` 永远不授予执行许可。
- 遵守 `AGENTS.md`、[R0 §4.1](Runtime更新-R0冻结设计.md) 最小必要证据规则、[SYN D0 受控动态观察设计](R1C-2C-C-C1-SYN-001受控观察设计与审批草案.md) 和 [A0–A2 方案](R1C-2C-C-C1-SYN-001-A0-A2离线预检与执行审批.md)。仍仅限 synthetic，不推导正常 Runtime 更新消费闭包或生产安装资格。

## 2. 精确候选 argv、环境与观察边界（只供将来审批，禁止直接执行）

### SYN-01 — 仅经批准后单独运行

```text
["/usr/bin/strace","-ff","-ttt","-T","-yy","-s","128",
 "-o","/tmp/sanq-c1-syn-001/raw/syn01.trace",
 "/usr/bin/python3.12","-I","-S","-B",
 "/tmp/sanq-c1-syn-001/syn01.py","SYN-01"]
```

### SYN-02 — 另批批准，不能自动从 SYN-01 继续

```text
["/usr/bin/strace","-ff","-ttt","-T","-yy","-s","128",
 "-o","/tmp/sanq-c1-syn-001/raw/syn02.trace",
 "/usr/bin/python3.12","-I","-S","-B",
 "/tmp/sanq-c1-syn-001/syn02.py","SYN-02"]
```

固定：`cwd=/tmp/sanq-c1-syn-001`；`umask=0077`；无 tty、非 root UID/EUID/GID/EGID 1000；仅环境 `HOME=/tmp/sanq-c1-syn-001`、`PATH=/usr/bin:/bin`、`LANG=C`、`LC_ALL=C`、`TZ=UTC`；不继承 `SSH_AUTH_SOCK/PYTHONPATH/PYTHONHOME`、任何 SanQ 生产 secrets 或 ambient environment。禁止 shell 字符串、`eval`、`sudo`、`PATH` 搜索进程入口、`StrictHostKeyChecking=no/accept-new`。Mac 端 SSH host-key pin 来自当次受控 VM 控制台，与 A0/A1 源标识精确比对；Guest boot ID/namespace/UID、解释器/observer/loader 实际 SHA 在**执行紧前**再次检测，任一不符 `BLOCKED`。

**执行行为候选：**SYN-01 在真实 Python 下打开/读取唯一 `input.txt` 并退出；SYN-02 fork 子进程后 exec 固定 Python，子进程 mmap 同一输入并退出，父进程 waitpid；可能有额外 native 加载事实，按 raw 原样保留。v1 不能表达的 fork-only child 首事件或第二次 exec 不准伪造、重排或补写。输出字符串并不等同追踪成功。

## 3. A2 采集器缺口：当前代码不能直接运行上述 argv

冻结模块仅在纯内存输出 `argv/maxWallSeconds/maxRawBytes/maxSingleTraceBytes` 等**声明**；**没有任何**真实 `Popen`、独立 SSH 执行器、wall watchdog、stdout/stderr 持续读取、进程树退出核对、文件写入配额或异常保全实现。直接在 Guest `strace -ff -o` 会导致：

| 风险 | 必须由下一批已审 collector 证明的行为 |
| --- | --- |
| 超时与 SSH 中断 | **在 Guest 本地**监督试验进程组，而非仅靠 Mac SSH 超时。启动后所有 tracee 属同一专用新 process group；从开始执行至所有子进程及 log flush 的 30 秒墙钟计时，越限先定向 TERM、宽限后定向 KILL、`waitpid` 回收并记录信号/真实 rc。必须探测子进程残留/脱离进程组和 SSH 意外断开，不能把 SSH rc0 等同整个 child 树退出。Mac 超时属于独立故障信号。 |
| `-ff` 产生多份 trace | `-o .../syn01.trace` / `syn02.trace` 会按 PID 产生实际子文件；禁止假定只有一个固定的文件名。Collector 扫描**限定目录与固定前缀**，拒绝未知普通文件、symlink、hardlink、目录外输出、非目标 UID、异常 PID 后缀。SYN-02 fork-only child 的原始先后必须保留。 |
| 文件和总预算 | 每场景 `raw` 总量 **≤8 MiB**、单个 trace **≤4 MiB**；分别计入 stdout/stderr、各 PID trace、collector/meta 关联字节，拒绝静默截断。单个文件建议由 guest child `RLIMIT_FSIZE` 实际施加并通过负例验证；仅循环 `stat` 不能保证写入瞬间不越界。**8 MiB 聚合硬上限目前没有实现/证据**，在实现核验与替代方案审阅之前 `A2 BLOCKED`，不能把“检测到超量后拒绝”冒称事前硬限制。 |
| `stdin/stdout/stderr` 完整性 | `stdin=DEVNULL`；及时排空 `stdout` 与 `stderr` 避免进程等待管道；独立保存两个原始字节流、大小与 SHA、结束前 flush，原样区分 observer 退出、tracee 退出、场景成功标记、SSH 外层退出、采集器自身退出及信号/异常。不能只保存 `strace -o`。 |
| 输出位置/已有 A1 | A1 私有目录已存在并应保持只读源；`raw/` 尚无可信创建/空目录证明。**只能另批批准** `/tmp/sanq-c1-syn-001/raw` 的非 root `0700` 独占创建和场景专属唯一临时输出前缀，避免碰到 A1 的 3 个文件。失败证据禁止 `rm -rf`、truncate、覆盖或在 finally 自动清理。 |
| 主机和 Guest 来源绑定 | 重新证实准确 VM/VDI、Host-only、SSH ED25519、boot/ns、UID/GID、输入/两个源码 `SHA256`、strace/Python/loader pins；异常或重新启动时不得沿用旧回执假装当次 PASS。 |

### A2 需单独决定的技术路线

**建议采用“Guest 本地、非 root 的单用途采集器 + Mac 私有回执封存器”**，而不是在 Mac 用一次 SSH + Python subprocess timeout 假定进程树安全退出。待审 Guest collector 必须是另外冻结、静态审阅和经单独授权落地/执行的新代码，**不能借 A1 的三文件授权偷渡第四份执行源**；优先仅用现有 Python 3.12 标准库和既有 strace，不增加系统软件包、降低 `ptrace_scope` 或配置系统级守护进程。此路线保持 Runtime/Ops 模块边界，不修改证据 v1；但真实 Guest 写入和进程执行仍必须经用户批准。

**严禁当前就认定方案可运行**：如果无法在无 root、仅现有设施条件下实现 `8 MiB` 聚合硬限制、子进程脱离/SSH 断开时的无孤儿保证，则继续 `BLOCKED`，提交针对失败预算/隔离前提的更精确方案与必要的用户批准。可选替代为预批准的受限单场景单文件 I/O 重定向策略、经过审阅的资源隔离实现、或在受控实验中接受“越界即拒绝且停止、不宣称硬预算”的**明确合同调整**；后一项若偏离已冻结的硬上限，必须事先说明影响并由用户显式授权，不能擅自削弱。

## 4. 将来 collector 的验证矩阵（本批未实现/未运行）

| 场景 | 期望拒绝/记录 |
| --- | --- |
| source 改 1 字节、mode 改为可写/owner 不符、symlink 或 boot/ns 变化 | 拒绝启动，保留实际差异；不得重新拷贝源来遮蔽不符 |
| trace 路径已存在、`raw/` 非空、隐藏文件、异常 symlink/hardlink | 拒绝启动并留存，不自动删除 |
| 单个 trace 达 4 MiB；总输出达 8 MiB | 必须准确定位限额故障、停止进程组和保留部分 raw；不得 PASS 或静默截断 |
| 30 s timeout、SIGTERM 不退出、残留 child、SSH 连接断开 | 真正验证 Guest 端全部相关子进程的 TERM→KILL/wait 处理；若无法证明无人存活，按 `BLOCKED/UNKNOWN` 不重试 |
| stdout/stderr 同时突发写入、异常数据、非零 rc、日志 flush 出错 | 双流并行且原样保存，任何缺失或非零按故障保留 |
| fork-only、child exec、child mmap 事件不满足 v1 | 不制造事件、不假 PASS；v1 判 `EVENT_ORDER_INVALID/CHILD_UNTRACED` 时报告原判定 |
| 运行前源/observer 与运行后 hash 不同 | `BLOCKED` 并记录动态不可替换风险，不能将前后相同当成强不可替换证明 |

需要先在**与当前 Guest 无关、非生产、可丢弃的开发测试环境**用合成子进程/日志进行负例测试。测试日志本身不等于真实 A3/A4 的现场证据。MCP-workspace 未开放本地 lint/build/test 执行权限；如后续将实现纳入仓库，需编写对应 `ops/runtime/tests` 并在单独授权的 PR 最终 head 的 CI `ops-checks` 中验证。

## 5. 门禁、授权及停止点

| Gate | 本次实际状态 | 后续所需 |
| --- | --- | --- |
| A0 — Guest/Host 身份隔离 | `PASS_SCOPED` | 执行时最小当次重新绑定 |
| A1 — 三份源与 Guest 读回 | `PASS_SCOPED` | 不重新投送；执行前 readback |
| A2-P — 采集合同与危险点审阅 | **DRAFTED / NOT APPROVED** | 用户审阅聚合硬限制、Guest 本地 supervisor、SSH 断开故障保障及专属 raw 目录 |
| A2-I — 采集器原始代码、负例、路径与 argv 冻结 | **NOT IMPLEMENTED** | 单独本地编写及测试、内部审阅；需真实 helper SHA 后另批授权执行 |
| A2-S — 受控 Guest 投送与预检 | **NOT AUTHORIZED / NOT EXECUTED** | 明确 Guest 文件写入授权与当次身份复核 |
| A3 SYN-01 / A4 SYN-02 live `strace` | **NOT AUTHORIZED** | 各场景独立明确授权，30 s/预算、证据与失败保留达到 A2 要求后才可 |
| C1 / C5-G2 / S2 | **OPEN / NO-GO / PAUSED** | 不继承任何生产安装许可 |

**本批交付仅是 A2 安全/架构差距审计和执行合同草案**：无生产变更、无 Guest 或 Mac 动作、无 `strace`、无文件投送、无架构边界/模块职责变更；不推送远端。下一步不应该立即执行 A3，而应先审阅并决定 A2 的**硬总量上限如何技术强制**及**Guest 端断线/进程树退出保证的具体方式**；在这些关键约束确定且必要代码具备真实可审凭据后，才进入 A2-I。
