# Runtime 更新 — C1-PREP-09 正式 Python 基线与只读 Bootstrap 候选

**2026-10-24（America/Toronto）｜PYTHON 3.12.3 SELECTED / BOOTSTRAP ASSEMBLY SOURCE_CI_VERIFIED / 32 TEST METHODS CI_VERIFIED / C1 OPEN。**

用户明确确认 AWS VM 使用 Python **3.12.3**，并要求采用该版本开始下一项任务。本批据此选定正常更新执行器的 Python 版本，沿用已有 v1 的 `/usr/bin/python3.12`、Linux/x86_64、root 身份与 `-I -S -B` 声明，实现实际的**只读装配入口候选**。它不运行更新流程；正式执行能力、来源验收及同候选验证继续跟随 R2/R3/R4/R5。

## 1. 基线、归属及已读规则

- 基线：`dev@9a20a0260948edc3a756a0236f0e140290519d53`。前批 [PR #2941](https://github.com/sanqin888/sanqinMVP/pull/2941) 已 squash 合并 `814c14898ce01f915c345af7426de95b3c753bb5`；最终 head `8de14f2061157c8c2604f8a3369d7075c8185d4d` 的 [CI #7548](https://github.com/sanqin888/sanqinMVP/actions/runs/40147153269) SUCCESS。本批保留 PR #2942 的 TLS 限定审计，不修改该服务或其门禁。
- 已读：根 AGENTS、`.github/workflows/ci.yml`、R0 D1/§4.1、Runtime 交付与安装约束、G2 A–F、C1 总包/装配方案及 PREP-03～08 的实现和相关测试。仓库树没有更深层 AGENTS。附件 2026-08-28 全站审计只用作历史架构背景。
- 归属 Runtime/Ops；内部原子新增，没有替换已部署入口，也没有公共/持久化旧合同迁移。LaunchMaterials/UpdateRequest v1、原进程核对器和装配器保持原样。新增控制文件只供这个尚未部署的外置候选读取，不是新的信任授权服务。
- 工作分支：`feat/runtime-c1-prep09-bootstrap-20261024`。MCP-workspace 已清理并与 dev 对齐，本批在其独立功能分支写入；本地缓存只用于源码/差异静态审阅及交付镜像。首次审阅前不提交远端。

## 2. 已确定的版本与尚需核实的现场事实

| 对象 | 本批决定 / 证据等级 |
| --- | --- |
| 正常执行位置 | 以用户指定的 AWS VM 为正常更新执行目标；不把 Recovery Jammy Guest 自动提升为正式平台 |
| Python | **3.12.3 final**，采用既有 `/usr/bin/python3.12`，不自动接受 3.10.12、3.12.4、路径别名或其他解释器 |
| 现有 v1 进程声明 | Linux/x86_64、real/effective UID/GID 0、固定 argv、五键环境、cwd 与 flags；继续严格核对 |
| 尚缺的实际平台材料 | 准确主机/发行/架构、解释器包 revision 与已安装字节、关键 stdlib/native 依赖来源/保护；版本选择和本次用户陈述不替代这些核验 |
| 已有 Ubuntu 来源证据 | R1-A/S5 仅在实际发行、架构、包 revision、成员字节等仍匹配时复用；不因同为 3.12.3 就自动视为全部匹配 |
| R3 协调器 / R2 CAS 平台 | 保持各自所有权与选型；本决定不要求离机协调器、Mac 服务或 Jammy 实验机改装 Python |

本批没有连接生产主机确认或安装解释器，没有执行 root、AWS、Guest 或系统升级。后续平台版本变化时复核受影响对象，不用旧 pins 静默放行。

## 3. 实际入口与受保护控制文件

新增 `ops/runtime/normal_runtime_bootstrap.py`，可作为 v1 声明的 `bootstrapSource`。入口只接受原合同中的 `--transaction-id <txid>`，没有任意路径、URL、模块、owner、pin、命令或 execute 选项。正常调用仍使用 v1 固定 argv/env/cwd；本文件不提供现场运行许可或目录创建命令。

| 固定位置 | 内容 / 权限要求 |
| --- | --- |
| `/root/sanq-runtime-operator/normal-update-v1` | source-only，root:root 0700，准确 9 个 `.py` 文件，无 JSON、子目录或 `__pycache__` |
| `/root/sanq-runtime-operator/normal-update-approvals/<txid>` | root:root 0700，准确 `pins.json`、`launch.json`、`request.json` 三个文件 |
| 每个源/输入文件 | root:root，0400 或 0600，单链接 regular file，同设备，有界读取 |
| 所有祖先 | 从当前进程 `/` 逐段 no-follow 持有 FD；root:root、可遍历、无组/其他写权限或特殊 mode 位、同设备；核对准确目录项身份 |

三文件必须由**外部受信且经批准的交付过程事先安装**，本入口不创建、更新、修复或覆盖它们。`pins.json` 是规范 ASCII JSON，键集合严格为：

| 字段 | 约束 |
| --- | --- |
| `schema` | `sanq.runtime.normal-update-bootstrap-pins.v1` |
| `transactionId` | 与入口事务及 launch/request 相同 |
| `launchSha256` | 经独立审阅固定的 `launch.json` 原字节 SHA256，64 位小写十六进制且非全零 |
| `requestSha256` | 经独立审阅固定的 `request.json` 原字节 SHA256，同上 |

**root 权限和摘要自洽不证明来源可信。** 运行之前仍须独立核对 bootstrap、解释器/关键依赖、操作器 commit/逐文件 pins、控制记录及其交付来源。把不明输入与自行计算的 pins 一起放进 root 目录，不能获得 C1 验收或真实执行权。入口自己的源码哈希是启动后的当前文件核对，不能证明已经执行的初始脚本字节；这一信任根必须在启动前建立。

## 4. 从 `-I` 到现有装配器的接线

1. 严格检查事务与当前进程的 v1 声明，**在文件捕获和项目源码加载前**拒绝错误版本、身份、环境、argv、cwd 或 flags；不清理环境或重新启动进程。
2. 从固定审批路径持有祖先与三文件 FD，读取有界固定 bytes。检查 pins 的规范 JSON/字段/事务，核对双摘要，并初审 launch 的固定 bootstrap/sourceRoot/平台/准确源码集合和空子进程声明。
3. 从固定 sourceRoot 持有祖先及全部源 FD，核对 **bootstrap 自身 + 8 个既有支持模块**的大小与 SHA256。全部支持模块先完成编译，随后才初始化其中任何项目模块；不执行 bootstrap 文件的第二个副本。
4. 通过私有 `_sanq_bootstrap_<launchSha256>` 模块集合按 launch → update → inputs → process_check → source_snapshot → source_anchor → source_loader → candidate_scope 顺序加载。项目导入只返回本组就绪模块，stdlib 只返回明确预载对象；拒绝未知/相对/逆序导入和已占用私有 namespace，不使用 canonical 项目缓存、`sys.path` 或重开代码路径。
5. 调用这组字节生成的既有 `assemble_pinned_normal_candidate()`：由原 parser 完整验证 v1，原进程核对器复检，原目录/快照组件重新固定准确源码，再由原 loader 生成**同一正常核心的类型和请求**。没有复制 `NormalUpdateFlow` 的规则。
6. 完成内外两层输入/源码路径复检并关闭所有自有文件 FD 后，才交付已装配核心。模块 scope 留到调用方退出；正常退出核对 registry，异常只移除仍由本 scope 拥有的注册项，保留外来对象与原异常。

最初的 FD 门禁属于 bootstrap 的启动前提接入，不能先导入尚未验字节的项目 reader 再借它认证自己。它不扩为通用文件/命令框架；后续语义、源码装配和核心仍复用 PREP-03～08。直接把 sourceRoot 加到 `sys.path` 或先 hash 再路径 import 都不能提供相同消费绑定；把完整核心嵌入 bootstrap 又会形成重复实现，故未采用。

## 5. 输出、失败和权限边界

- CLI 退出码 0 只表示 **`CANDIDATE_ASSEMBLED / ASSEMBLY_ONLY`**，不是更新完成；stdout 在全部 context 正常退出后才输出一条规范 JSON。
- 报告包含事务、操作器 commit 和双输入摘要；`flowInvoked`、`sourceProvenanceAuthenticated`、`launchAuthorized`、`readyToInstall`、`authorizedToMutateProduction` 均为 false，`decision=BLOCKED`。
- 文件/字节/解析/加载/退出失败无成功 stdout；stderr 只给固定状态及异常类型，不输出输入、环境、argv 或异常消息。普通失败退出 2，KeyboardInterrupt 退出 130。库调用保留异常，不自动重试/修复/删除/恢复业务。
- 固定 bytes 不等于持续文件租约；交付后的已加载对象不再重开输入/源码路径。新的效果输入仍须由其真实 adapter 独立绑定和保护。
- 没有 `NormalUpdateFlow.run` 调用、事务准入 ledger、Host/Docker/systemd/AWS/安装或放行业务能力；完整运行入口仍未接线。重复只读装配不代表事务可再次执行。
- 它不是恶意 Python sandbox。经外部批准的源码、bootstrap 本身、OS/解释器/预载 stdlib/关键 native 依赖仍是受信前提；导入白名单不认证这些对象的发行来源。
- 外置 9 文件集合与现有 Runtime **17+Manifest** 是不同对象；不增加第 18 Bundle 成员，不移除任何实验/安装 guard，不建立永久 root 服务。

## 6. 聚焦覆盖及验证状态

新增 `ops/runtime/tests/test_normal_runtime_bootstrap.py`，**32 项测试方法已编写、静态审阅，尚未运行**。使用准确现有源字节、真实临时 FD 和真实 parser/anchor/loader/scope；根目录、属主和进程观察有明确模拟桥接，不认证 CI 主机/root 或 Python 3.12.3 现场。

覆盖：完整装配与同核心类型、FD 先关闭再交付；错误版本/身份/flags/事务及实际 CI 调用拒绝；坏/重复/非规范/超预算 pins，双输入与来源集合/子进程错配；等长错误源码/未知文件/缺项、祖先/文件权限、硬/软链接/FIFO、owner/device/size；短读/增长/读错、相同字节换 inode、父目录替换、允许范围内的 mode 漂移与无关父条目变化；v1 跨事务拒绝；canonical cache 污染；全编译先于初始化；未知/相对 import；初始化、namespace、调用方/中断、关闭与 registry 退出失败；CLI 无效果、无成功伪报及无 Bundle 扩张。

本地只做 AST/导入清单与顺序、基线 Git blob、源码/文档差异、空白与状态静态核对；不执行 bootstrap/guard/Flow 或仓库 lint/build/test/scanner。授权提交后，以 `.github/workflows/ci.yml` 的 Runtime/Release 及最终 head 全部必需 Checks 为准；现有 Ubuntu runner 结果不能冒充真实 AWS Python/来源/权限验收。

## 7. 本批退出与下一步

**本地退出：PYTHON VERSION SELECTED / READ_ONLY BOOTSTRAP CANDIDATE AUTHORED / TESTS NOT_RUN / NO PR / C1 OPEN。** 同步 R0、C1 总包、入口装配方案、依赖图和原批工作日志；不需要数据库迁移，无依赖/锁/CI、业务上下文、公共合同、兼容、17 Bundle 或生产变更。

后续先在本批审阅及 CI 通过后，固定同候选的源码/输入可信交付与实际 Python/关键依赖来源，安排经准确授权的同平台只读入口验证；正式效果接线随 R2/R3/R4 的真实能力完成，不为等待这些能力再造一套模拟执行器。C1-PREP 整体与 C1 最终关闭条件不变，真实 root 交付/执行及生产操作须按各自对象单独批准。

**同批远端验证续记（PR #2943）：**用户已授权本批远端提交、最终 head 全部必需 CI 全绿后合并 dev 并开始下一步。完整源码 head `97ac6fd38c6d6b1249636a6952a0bf4e027a966a` 的 [CI #7552](https://github.com/sanqin888/sanqinMVP/actions/runs/40149348914) SUCCESS：Runtime `846 tests / OK`（含本批新增32）、Release `45 tests / OK`、Runtime shell 语法检查通过，无需 CI 修复。上述“未运行/未推送/未创建PR”是首次本地审阅时点；本地仍未运行项目测试，当前只补验证记录，最终 head 的 CI/合并以 [PR #2943](https://github.com/sanqin888/sanqinMVP/pull/2943) 实际事件为准。CI 不认证真实 AWS Python/来源/权限，也不授予任何效果权限，C1 仍 OPEN。
