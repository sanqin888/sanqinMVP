# Runtime 更新 — C1-PREP-08 运行进程声明核对与失败测试

**2026-10-24（America/Toronto）｜SOURCE CI #7546 VERIFIED / 20 NEW TEST METHODS INCLUDED / PROCESS DECLARATION CONFORMANCE ONLY / REAL BOOTSTRAP NOT IMPLEMENTED / C1 OPEN。**

前批 [PR #2940](https://github.com/sanqin888/sanqinMVP/pull/2940) 最终 head `8638f522e04862ba30fb7c4b77ac9bf9b2bae87e` 的 [CI #7544](https://github.com/sanqin888/sanqinMVP/actions/runs/40145422597) SUCCESS（Runtime 794 / Release 45，含 PREP-07 的21项），squash 合并 dev `fe170ab1797a7135737d3bd411069ecfeee4fe55`。首次 CI #7540 的FD基线断言仅在测试隔离中修复，修复后源码CI #7541和最终CI均已通过；没有改动原实现/guard。按用户合并后继续授权，本批从该最新 dev 在独立缓存实现下一有限能力。用户现已授权本批远端交付；发布复核dev仍为 `fe170ab1797a7135737d3bd411069ecfeee4fe55`，六份既有文件、AGENTS/CI及前置launch源码的Git blob未漂移，使用独立缓存/GitHub插件PR→dev，待最终head全部必需CI全绿后合并；共享工作区其他改动保留。

依据 AGENTS、实际 ci.yml、[R0 D1/§4.1](Runtime更新-R0冻结设计.md)、[C1 最小基线](Runtime更新-C1最小可信执行基线对齐与候选准备.md)、[候选装配 §4](Runtime更新-C1候选入口装配与关键来源绑定方案.md) 和 [PREP-07](Runtime更新-C1-PREP-07受保护候选装配与失败测试.md)。没有改变v1声明、长期架构决策、平台选择或真实执行权限。

## 1. 为什么现在补这一项

PREP-07 已把输入、真实目录捕获和固定源码加载连通，但只确认文件owner策略和提议字段，没有核对当前进程是否按该提议启动。现有v1已经声明Linux/x86_64、Python3.12.3、`/usr/bin/python3.12 -I -S -B`、uid/gid0及准确argv/env/cwd；此批按原声明实现检查，不另选Jammy或Noble作为最终部署平台。

新增 `ops/runtime/normal_runtime_process_check.py` 的 `require_current_launch_process(materials, *, expected_launch_sha256)`。先验证外部固定launch摘要，再读取当前Python/进程视图，与既有v1逐字段精确比对；匹配时返回None，错误时抛LaunchProcessBlocked，不返回观察包、PASS或授权字段。

在 `normal_runtime_candidate_scope.py` 中，顺序现在是双输入pin与规范解析 → 当前进程声明核对 → 真实sourceRoot捕获/加载/退出复检 → 向caller交付已加载对象。进程不符或观察失败时，尚未进入source capture/loader。

## 2. 核对对象与有意边界

| 对象 | 核对内容 |
| --- | --- |
| 平台/版本视图 | sys.platform、uname.machine与v1的linux/x86_64一致；version_info前三项为3.12.3，未限定后缀的v1版本按final/serial0处理，不接受RC等预发布视图 |
| 解释器 | sys.executable与已固定argv[0]精确一致，不自行realpath/接受未审别名 |
| 身份 | 实际读取real/effective UID/GID，均须与v1的0/0一致；不提权，不改变组/用户 |
| cwd | getcwd与已固定sourceRoot/cwd一致；不自动chdir或准备目录 |
| argv | sys.orig_argv与完整v1解释器argv一致；sys.argv与其脚本参数后缀一致，包含准确bootstrap/transaction；不同排列、别名、合并flags或附加参数不被静默规范化 |
| 环境 | os.environ的Python视图与v1五键精确一致；不清空、填充、修复环境，也不允许额外PYTHONPATH等键 |
| 安全相关flags | isolated/ignore_environment/no_site/no_user_site/dont_write_bytecode为1，safe_path为True，optimize为0；与原-I/-S/-B无优化的声明一致 |

用现有canonical函数比较字段值，避免False/0、True/1混同；没有新增v1字段或外部观察schema。错误正文只包含固定原因/字段名，不拼接实际环境或argv值；不打印、保存这些值或将它们作为授权材料返回。检查本身只读，不执行命令、安装、启动、重启或修复进程。

## 3. 这不是启动前来源认证

函数、外层模块和解释器已经运行，因此此检查不能阻止一个错误解释器自身开始执行，不能证明解释器文件、Ubuntu包、关键库、bootstrap或外部pin的可信来源。Python中的sys字段/对象可被可信进程代码修改，root/内核和受控进程仍是有限信任前提；没有制造不可伪造的process token。

os.environ是Python导入时建立并由Python更新的视图，不能认证libc原生环境的全部后续变化；sys.orig_argv也不是独立内核启动证据。各读取不是原子快照，不是持续监控或namespace认证；不做全量FD/ELF/环境消费跟踪。以上接口机制参见 [Python sys 文档](https://docs.python.org/3.12/library/sys.html) 和 [os.environ 文档](https://docs.python.org/3.12/library/os.html#os.environ)。

本批落实的是现v1声明的一致性守卫；正式Ubuntu/解释器版本和来源仍需随候选选定与核验。旧v1 Python3.12.3不是自动通过的真实平台，R2 Jammy3.10.12会因该版本声明不符而拒绝；以后若选用另一正式平台，必须明确审阅相应声明/代码/验证，不能绕过本检查或给旧false字段填true。

真正受控入口仍需在启动前建立代码/解释器和关键来源信任，实际admission/effect adapter继续独立核验目标原Archive、旧摘要来源、已安装状态、维护/CAS、快照和真实权限。当前没有正式bootstrap/CLI、任何effect capability或生产执行，本批也未运行真实root/Guest/VM/AWS操作。

## 4. 20项新增方法与验证状态

新增 `tests/test_normal_runtime_process_check.py` 的18个方法，另在既有候选scope测试新增2个集成方法（23项scope方法总数）。既有21项scope用例保留，并在测试内替换私有进程observer为明确标记的模拟v1视图；原gc基线隔离、严格FD集合/借入FD身份及根FD关闭检查保留。

18项单元覆盖：匹配只返回None、错pin/材料在观察前拒绝；OS/架构/版本/预发布、解释器别名、real/effective身份、cwd、两层argv、环境/flags/类型混同；不完整视图、OS/缺失API异常与中断；私有observer确实读取对应接口而不修改；真实CI unittest启动方式被拒绝且不清理环境/argv/cwd；无文件/launcher/修改/授权输出和17 Bundle边界。2项新增集成覆盖错误版本与不可读进程视图在source capture前停止。

正例是模拟进程视图，不证明CI或实验机实际为root/Python3.12.3；真实CI用例仅验证不符合v1的unittest入口遭拒绝，不保留其环境值。CI上scope测试的受控虚拟根/真实FD和固定代码加载与正式平台认证仍分开。

本地只完成AST、静态导入/调用与顺序审阅、基线Git blob、差异/空白和补丁可应用性检查。**新增20项方法已由源码CI #7546实际覆盖，Runtime 814 / Release 45均OK**；本地没有调用本批guard/装配入口或执行模块、仓库lint/build/test/扫描，前批CI #7544不作为本批验证。最终head全部必需Checks仍为合并门禁。

## 5. 所有权与后续

新增同owner单向边 `normal_runtime_process_check → normal_runtime_launch`，以及 `normal_runtime_candidate_scope → normal_runtime_process_check`；既有低层loader/anchor/reader和同一核心不变，仅当前测试消费。没有反向边/新环、跨上下文边/债务、12-context owner/部署单元/兼容、依赖/锁、CI、Prisma/migration、17 Bundle、原字段/guard放宽或scanner baseline变化，未运行生产扫描。

同步R0、C1总包、依赖图和原PREP-07的最终CI/合并/最小测试修复事实。本批是Runtime/Ops内部原子源码切片，本批已获远端交付授权，使用独立功能分支PR→dev，待实际Runtime/Release及最终head全部必需Checks全绿后才合并；正式受信启动入口、平台/关键来源和输入保护、真实能力与必要同候选验证继续OPEN。**C1 OPEN / REAL BOOTSTRAP NOT IMPLEMENTED / NO PRODUCTION AUTHORITY。**

**同批远端验证：**[PR #2941](https://github.com/sanqin888/sanqinMVP/pull/2941) → dev；完整源码 head `d40c370eb482e52dd61ae6443429834413331859` 的 [CI #7546](https://github.com/sanqin888/sanqinMVP/actions/runs/40146872548) SUCCESS，Runtime `814 tests / OK`（含本批新增20）、Release `45 tests / OK`，Runtime shell语法检查通过，无需CI修复。当前同批只补验证记录，最终 head 仍须实际 CI 全绿才合并；最终 Checks/merge 状态以 PR 事件为准。
