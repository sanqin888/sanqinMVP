# C5-G2 / R1 B4B-3B-2B2 — Ubuntu usrmerge 别名与可信根锚设计评审

> **2026-10-18 已批准更新方案：**[AWS 整机快照与维护冻结方案](Runtime更新-AWS快照与维护冻结方案.md) 更新 R0 D2–D5：代码创建本次 Lightsail 手动实例快照；拍快照前记录原策略，将准确业务容器设为 `restart=no`、正常停止并禁止启动入口，快照及恢复首启均保持维护态。等快照 `available`、来源/覆盖盘与离机清单核对完成才可安装；成功后按记录恢复策略，故障保持冻结并人工确认快照→新实例。旧 mandatory crypt/Drive preinstall Kit、双 Archive 恢复自举不再重复强制。现役每日备份/escrow、目标包来源校验和真实 AWS 恢复验收保留。**仅设计批准 / 未实现未部署 / C5-G2 NO-GO / S2 扩充后置**；不授权本次生产/AWS 操作。本文带日期的设计/实现与有限实验记录保留当时范围；引用旧 Kit/clean reinstall 的段落不再作为本次更新前置。

**日期：**2026-10-18（America/Toronto）。**设计交付：**PR #2858 / CI #7346 / dev merge `c9db47b74854c96e71879b38a69a1e2fe8e8d91a`。**后续 B4B-3B-2B2-A：**已由 PR #2859 合并至 dev `d5a8ba0dfc45ed349aa65edba160b0ffa5ee4386`；final head `d366d62a906fe5060f1dbfe85b6e930bfbe77dab`，CI #7348 / run `39101080529` 合成检查通过。B2B2-B 实际路径/FD 解析仍需独立专项评审。  
**基线：**`origin/dev@1a82caff22b49881aad2893ae1c9374c03c97ffb`；B4B-3B-2B1 已经 PR #2857 / CI #7344（run `39098295751`）全部选中检查成功并合并；原 PR head `9ad184a350189d58b557419434d50efd062c3361`。  
**权威边界：**[R0 冻结设计](Runtime更新-R0冻结设计.md) D1 / R1 / C1 / C2，以及 [B4B-3B-2B1](C5-G2-B4B3B2B1-受控路径FD候选开启.md)。**C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED**；不影响现役备份 timer。

## 1. 问题与现有证据

已合并的 B4B-3B-2B1 从调用方预开、但未经外部认证的 root-anchor FD 出发，将 B4B-3A manifest 中每个路径逐段按目录 FD + `O_NOFOLLOW` 开启候选，只在借出/归还前后检查目录项与 FD 身份/owner/权限；会拒绝 symlink 和不同设备。B4B-3B-1 能对这些候选 FD `pread` / 计算 digest，B4B-3B-2A 能分析调用方提供的 Python/ELF 内存字节。**三者都不能证明 root anchor 确属可信目标 Guest 的 `/`、声明的路径对应实际 loader 使用的对象、外部 pin 可信，也不能证明动态加载闭包。**

B4B-3A 把 loader 模型路径固定为 `/lib64/ld-linux-x86-64.so.2`，native 候选包含 `/lib/x86_64-linux-gnu/` 和 `/usr/lib/x86_64-linux-gnu/`。真实 Ubuntu 常见 usrmerge 布局中 `/lib64` 和 `/lib` 可能是 symlink。当前 B2B1 对它们 **fail-closed 是正确的已提交行为**，但因此不能声称具备对目标 Ubuntu 的真实路径采集能力。单靠调用方提供 `realpath`、转换字符串、`stat(follow_symlinks=True)` 或“文件 SHA 相同”无法替代从可信锚点到加载字节的受控验证。

## 2. 可选方案（均不直接赋予生产权限）

| 方案 | 范围 | 优点 | 未解决或代价 |
| --- | --- | --- | --- |
| A. 继续严格 no-follow，仅要求平台物理路径不经 symlink | 维持既有 B2B1、3A 不变；若候选真实平台无法满足则 BLOCKED | 零额外路径解析策略和攻击面 | 常见 Ubuntu usrmerge 可能无法完成 C1，不能靠换 manifest 假装实际 loader 从未使用别名 |
| B. 对 manifest 增加经独立认证的别名关系，再独立实现受限解析（推荐分阶段评审） | 先固定平台的规范路径、别名白名单与预期目标；后续单独模块使用 root-anchor FD、nofollow `readlinkat` 等价机制、限定 hops，验证别名项和 canonical 实体的身份/来源 | 可在不偷偷放宽现有 B2B1 的前提下建模真实 Ubuntu | 改变原路径语义；涉及外部 pin、目录链完整性、替换/namespace/mount/loader 身份，必须先获专项授权 |
| C. 直接 `realpath` 后普通 `open` 或允许任意 symlink | 放宽路径遍历规则 | 实现简单 | 无法维持当前 TOCTOU、来源与身份安全保证；**否决** |

**推荐：先把 B 方案的证据合同与测试界限冻结，经用户批准后才添加独立只读组件；B2B1 默认严格 no-follow 不改变。**若无法取得真实目标平台的独立布局/alias 证据，则采取 A 的拒绝路径，不能降级成 C。此处的“推荐”不是对架构扩展的自动授权。

## 3. B 方案实现前必须冻结的合同

1. **可信根锚/命名空间：**定义谁在隔离 Guest 中预开 root-anchor FD，如何由独立 witness 验证真实 `/`、mount namespace/rootfs/dev/inode、平台/发行包身份；调用方布尔值或 root 自报不能成为信任根。
2. **别名策略：**仅允许发行平台经预审的绝对路径别名，固定可解析前缀、目标路径、最大 hop、是否允许相对 symlink 和跨设备挂载；不得支持任意用户路径、`..` 越界、未知 link / mount 逃逸；所有别名目录项均需 nofollow 的 `lstat` / `readlink` 身份记录，目标仍由锚定 FD 分段开启。
3. **路径—对象关系：**manifest 的逻辑加载路径、规范实体路径、FD dev/inode、symlink inode/metadata、每次读回字节和外部 SHA pin 必须有一对一的审计关系；对于不同别名指向同一实体要显式限定，而不是绕过 B4B-3B-1 对重复 inode 的拒绝。
4. **加载行为：**证明真正解释器/loader 的路径决策、`DT_INTERP`、`DT_NEEDED`、RPATH/RUNPATH、环境变量、import hook、CPython 动态 import 与 `dlopen` 的实际解析和完整传递闭包。AST/ELF 静态线索只用于辅助发现缺口，不是 PASS 证据。
5. **攻击与竞态：**在预开、观察、离机对照、消费执行整个窗口内仍须约束路径替换、bind mount、namespace 漂移及新 writer。仅前后 `fstat` 不能独立保证两次检查之间没有攻击；未证明则 BLOCKED。
6. **来源及离机见证：**发行包/系统安装来源、原始文件字节 pins 和独立保管链必须脱离目标 Guest 自报；离机见证需有来源、执行身份、原始结果、时间、命令/脚本精确 SHA 和独立 hash 对照。
7. **权限界限：**组件仍为外置、只读、非授权；不加入冻结 Runtime 17 文件 Bundle，不开放任意命令、root/Guest 执行入口或生产安装。所有 receipt 保持 `BLOCKED` / `readyToInstall=false` / `authorizedToMutateProduction=false`。

## 4. 建议工作拆分及验收

- **B4B-3B-2B2-D（当前）：**本次只读设计评审，记录 A/B/C、安全影响及专门决策点；不改现有代码或合同，不宣称 C1 有进展。
- **B4B-3B-2B2-A（需批准）：**仅基于调用方声明的独立、纯内存 alias mapping / 规范化模型与合成负向测试；证明输入被约束，不证明实际文件、可信 Guest、外部 pin。
- **B4B-3B-2B2-B（另行审阅）：**对已独立认证的 Guest 平台布局设计 nofollow 别名采集/FD 解析合同和外部 pin 对照；将 A 与 B2B1 组合前，必须解决重复 inode、anchor、命名空间和竞态的策略。无需、不得在此次设计工作中实现。
- **B4B-3B-2B3 / B4B-3C（后续）：**真实 Python/ELF/dlopen 完整依赖发现与消费见证；任何新的 privileged Guest/root 命令之前，**先满足 R0 C2 的快照恢复实测与原始证据离机保全**，再按准确脚本 SHA/Guest/命令/权限单独申请批准。

**截至设计评审：**B4B-3B-2B1 为 MERGED / SYNTHETIC CI GREEN；B4B-3B-2B2-D 仅设计审核。D1–D5 既定设计不重开，C1–C8 全部门禁仍未关闭；生产 Runtime 更新、S2 扩充及新的 Guest/root 实测一律未授权。

## 5. 2026-10-18 — B4B-3B-2B2-A 原始本地实施记录（后续已合并；不改写当时证据）

从 `origin/dev@c9db47b74854c96e71879b38a69a1e2fe8e8d91a` 新建 `feat/c5-g2-b4b3b2b2a-inert-alias-contract-20261018`。根据继续下一阶段的要求，**只实现 B2B2-A 合成声明的范围**：新增 `ops/runtime/root_python_usrmerge_alias_claims.py`，复用原 B4B-3A 的 manifest/pin 结构核对，仅接受最多 2 项、完全匹配既定合成形状的前缀关系 `/lib`→`/usr/lib` 与 `/lib64`→`/usr/lib64`；最多 64 个候选文件、2 次声明替换，拒绝额外字段、重复、非法目标、未使用的别名、目标碰撞。输出保留逻辑路径与**仅由调用方声称的**替换结果，永远 `decision=BLOCKED`。这两个路径映射是**合成示例而非实际 Ubuntu/发行包证据**；不会解析更深层 loader 文件 symlink、相对目标、真实 inode 或运行时 namespace。

新增 `ops/runtime/tests/test_root_python_usrmerge_alias_claims.py`，用纯内存人工 manifest 测试声明一致、双前缀、非法路径/伪造权限、pin 漂移、超过预算、Bundle 排除以及不变更输入。MCP-workspace 无 lint/build/test 执行权限，**测试源码已写但本地/CI 均未运行**；今后经审阅授权远端交付，由 `.github/workflows/ci.yml` 选中的 `ops-checks` 执行 `python3 -m unittest discover -s ops/runtime/tests -p 'test_*.py'`。

**归属及安全不变量：**外置 Runtime/Ops 候选声明组件；未修改 B4B-3A、B4B-3B-1、B4B-3B-2A、B4B-3B-2B1 的实现或入口，没有文件系统打开/`readlink`/`realpath`、网络/子进程/root/Guest/写操作，不修改 Runtime 17 文件、公共 API、CI、依赖、数据库或权限。不可把提出的替换路径交给现有严格 no-follow 开启器作为已认证输入，所有信任/安装状态继续 false。

**后续 B2B2-B 需独立审阅：**真实 Guest/发行版路径布局和 root-anchor 的非自证来源、有限 `readlinkat` 风格的 FD 对照、loader 内层 symlink、同 inode 别名冲突、mount/namespace/竞态约束及独立外部 hash pin；首次真实 privileged Guest 命令仍需先通过 C2 快照恢复并获得精确操作授权。**C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED**。

## 6. 2026-10-18 现行状态续记（非历史试验重写）

B2B2-A 已由 [PR #2859](https://github.com/sanqin888/sanqinMVP/pull/2859) 合并，final head `d366d62a906fe5060f1dbfe85b6e930bfbe77dab`，CI #7348/run `39101080529` 的 Runtime 281 / Release 45 合成测试通过，dev merge `d5a8ba0dfc45ed349aa65edba160b0ffa5ee4386`；非全站 E2E，更非真实 Guest、来源、C1/C2 PASS。上文 §5 的“本地/未运行”系开发时原记录，现行进度以本节为准。下文 §7 提交 B2B2-B 专项边界、验收和操作清单供用户审阅；尚未批准新解析源码、Guest/root/快照/生产执行。

## 7. B2B2-B 受控解析专项评审与 C2 Guest 就绪包

**日期：**2026-10-18（America/Toronto）。**审计基线：**`origin/dev@d5a8ba0dfc45ed349aa65edba160b0ffa5ee4386`。**状态：**DESIGN/READINESS LOCAL REVIEW；B2B2-B 源码 NOT IMPLEMENTED；C2 真实恢复 NOT EXECUTED；**C1/C2 NOT PASSED / C5-G2 NO-GO**。仅用于审阅，不是 Guest/root/生产命令授权或平台证明。

**上位合同：**[R0 D1–D5 冻结设计](Runtime更新-R0冻结设计.md)、[B2B2-D / B2B2-A 记录](C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md)、[B2B1 严格 FD 开链](C5-G2-B4B3B2B1-受控路径FD候选开启.md)、[G2 A–F 权限层级](c5-g2-trusted-runtime-contract-2026-10-13.md)、[H2 Guest Gate 0/1](c5-g2b2b9-h2-guest-whole-host-exclusion-readiness-2026-10-13.md)、[10-17 Guest 原始实验范围](c5-g2b4b2-disposable-guest-byte-consumption-acceptance-2026-10-17.md)。不重开 R0 D1–D5，不重造声明模型。

### 7.1 当前已存在的能力与精确边界

| 能力 | 实现 / 真实状态 | 未证明 |
| --- | --- | --- |
| B4B-3A 清单 | `root_python_dependency_manifest.py`：固定 Linux x86_64 / Python 3.12.3 / `-I -S -B`、逻辑路径与提出的 SHA；纯声明，最大 512 nodes、4096 edges | Guest 平台、完整真实闭包和外部 pin 来源 |
| B4B-3B-1 FD 观察/离机核对 | `root_python_dependency_fd_observer.py`、`root_python_dependency_offline_review.py`：对**预开** FD `pread`，拒绝重复 (dev,inode)、硬链接 `nlink != 1`；64 MiB 总额 | FD 实际路径、独立 pin 保管链、连续排他 |
| B4B-3B-2A 静态线索 | `root_python_elf_static_hints.py`：AST / ELF 候选关系 | CPython 动态 import、ELF 搜索决策及 dlopen 闭包 |
| B4B-3B-2B1 候选 FD | `root_python_dependency_path_fds.py`：调用方预开且**未经独立认证**的 root FD 下逐段 `O_NOFOLLOW`，前后检查 | symlink、真实 `/`、mount namespace / 竞态 |
| B4B-3B-2B2-A | PR [#2859](https://github.com/sanqin888/sanqinMVP/pull/2859)，final head `d366d62a906fe5060f1dbfe85b6e930bfbe77dab`、CI [#7348](https://github.com/sanqin888/sanqinMVP/actions/runs/39101080529) success、dev merge `d5a8ba0dfc45ed349aa65edba160b0ffa5ee4386`。`root_python_usrmerge_alias_claims.py` 仅限定两条**合成**前缀 `/lib`→`/usr/lib`、`/lib64`→`/usr/lib64`，最多 64 文件 / 两轮前缀替换 | 真实 symlink/readlink、loader leaf、root-anchor、独立来源、安装资格 |

#2859 的四个选中作业 `ci-change-scope`、`ops-checks`、`api-checks`、`build-test (api)` 成功，**后两个为汇总作业**；Runtime **281 tests OK**、Release **45 tests OK**（`ops-checks` 日志）。Web/E2E 等无关作业按变更范围跳过；非完整全站 E2E，非 C1/C2 认证。本批与 B2B2-A 的所有返回仍 `BLOCKED`，`readyToInstall=false`、`authorizedToMutateProduction=false`。

### 7.2 B2B2-B 的专项架构决议——拟批准边界，而非已批准实现

**推荐：在现有 B2B1 外部新增一个独立、只读、非授权的「root-FD 约束 symlink 解析与身份记录」模块，限定于经 C2、独立平台来源与精确路径白名单核验的 Guest。** 不改旧 opener 的 `O_NOFOLLOW`；不让 B2B2-A 的 `proposedPathAfterClaims` 直接进入旧 opener；不把结构通过升级为 `PASS`。若不能认证发行版布局与根锚，**退回方案 A：全部拒绝**；直接 `realpath → open`、跟随任意 symlink 的方案 C 否决。

#### 7.2.1 谁建立根锚、谁见证

1. **Host 操作者**（非 MCP/Repo）先独立识别 VirtualBox VM 的 VM UUID、磁盘 ID、快照 UUID、网卡/共享目录/设备映射、管理身份与证据保存位置；同机同次采集，不沿用 10-17 的 UUID/hash 充当实时值。
2. **经单独 root 命令授权的 Guest 操作者**在隔离 Guest 中，从经过审核的固定入口取得 root 目录只读 FD（限定目标 Guest 的 `/`），记录 FD 的 (dev,inode,uid,gid,mode)、当前进程 PID/start-time、root/mount namespace、`/proc/self/mountinfo`、磁盘 UUID 与 rootfs。此步骤**尚未授权，也未运行**；不能把简单打开 `/` 当成外部认证。
3. **独立 Host witness / 离机复核者**核对 Guest 与 Host 持有的是同一经认可的 VM/磁盘与恢复基线，核对 mount/namespace 观察及原始证据的保管链，再将「仅本次 Guest/会话有效」的根锚身份作为**外置前置条件**提供给组件。必须列明 witness 运行身份、命令/脚本 SHA、日期、原始 stdout/stderr/rc 与离机 hash；不能用调用方 `trusted=true`、Guest 自报、两份同源 hash 自证。
4. **信任前提的边界：**承认经批准的 Host/Guest、虚拟化平台及内核，按 R0 D1 不进行无限递归证明；如果源头、mount namespace 或动态生命周期不确定，维持 `BLOCKED`。Root FD 只在本次受控会话有效，不能跨运行或跨 namespace 复用 receipt。

#### 7.2.2 允许的链接及路径语义

- **先取真实事实再冻结白名单：**Host/Guest 双侧核对 Ubuntu 发行版、已安装 Python/loader/包身份、实际 `/lib`、`/lib64` 与解释器 ELF `PT_INTERP`、loader leaf、native `DT_NEEDED` 路径链。候选 `/lib → /usr/lib`、`/lib64 → /usr/lib64` **仅作为待检查案例**，不是批准的实际目标；每一跳都要列出发行包/独立来源及准确 link text。
- Manifest 的原始逻辑绝对路径和节点身份**不得修改**。入口字符串必须遵守 B4B-3A 的绝对无 `.`/`..` 路径规则；只允许**平台独立核验的有限 linkPath + exact link text + expected target + 文件类型/来源**。不接受用户任意 symlink、`/proc` magic link、跨 root 跳转、相对调用方 cwd 的目标、Unicode/控制字符/NUL、未登记的 link 路径或目标。
- 真实 link 若为**相对目标**，仅以「包含该 symlink 的已认证父目录」为基准；遇 `.`/`..` 须在受控 root-FD 内进行逐段栈规范化，任何跨锚点尝试即拒绝。**绝对 link 目标**从已认证 root-anchor 重开，不是宿主机 `/`。leaf loader 的 symlink 与目录别名使用同样规则，不可只实现两条前缀替换。
- **提议的 hard cap（专项源码授权时再冻结）：**沿用 B2B1 最多 **64 个逻辑文件、每条 canonical 展开最多 12 路径段、每文件 32 MiB**；沿用 B3B-1 **64 MiB 总读取字节**；新增最多 **8 次实际 link hop/文件、单条 link text ≤256 bytes、展开后的绝对路径 ≤256 bytes**，总体 FD 与目录项记录按逻辑文件总数/展开 hop 显式计数、超预算立刻拒绝。数字是拟实施上限，**不是实机已验证值或获准扩大 B2B2-A 两轮模型的证据**；若 Guest 实际需要更多，不自动升额。目录项链在归还前后全量复核；达到预算视为未知，不容忍部分证据。
- **mount/设备：**保留原有同 `st_dev` 及 root:root、不可被非特权者写的安全约束。除此还须用独立 mountinfo 与可靠 mount ID/namespace 记录识别同设备 bind-mount、overlay/其它 mount 穿越；**仅 `st_dev` 相等不充分**。mount ID 不可可靠关联或发生变化时 `BLOCKED`，不偷偷支持跨设备。支持新 mount 模式需重新专项批准。
- 每个 symlink 通过锚定的 parent dir FD、nofollow 元数据与受限的 `readlinkat` 等价方法获得 link text；记录 symlink inode/owner/mode/link text，校验展开目标链、最终只读普通文件 FD 的元数据。**注意：**Python `os.readlink(...,dir_fd=...)` 按名字观察，单靠前后 `lstat` 不能保证读到同一个 inode 或持续排除替换；必须持有可验证的 link 身份，并依赖 R2 连续维护/写入者约束及独立 witness，未证明则仍不能认证 C1。
- 正常并行路径按逻辑路径准确留存，不重新打开 resolved string；从安全打开的**同一已持有 FD**读取字节。结束前复核 root FD、每个目录/别名及文件，始终关闭内部 FD；发现路径替换、inode/metadata 漂移、namespace/mount 漂移、不可读项、竞争结果不明，直接拒绝并留原始记录。前后 `stat` 不是整窗口排他证据。

#### 7.2.3 逻辑路径、alias、实际字节与 pin 的最小接口

拟新增 `ops/runtime/root_python_dependency_alias_fds.py`（名称待源码批最终审阅）仅接收：**现有** B4B-3A manifest 与提出的 pins；**已预开** root FD；独立预审的 exact alias/loader link 清单及本次 Guest identity/mount witness 的只读证据；有限预算。仅导出一个 context manager 借出 `dict[logicalManifestPath, readOnlyFD]` 给已有 FD observer，并另给**非授权解析轨迹**（`logicalPath → symlink items[(path,text,dev,inode,mode,uid,gid)] → canonicalPath → finalFD(dev,inode) → actualBytesDigest → externalPin{sha,来源/对象ID/保管链}`），所有 receipt 不提供安装权。

- 外部 pin 必须先由不同于 Guest 收集者的权威离机渠道绑定**具体软件包/原始发行材料与原始字节**，并与 Host/Guest witness 跨源复核；Guest `sha256sum` 或 `dpkg -V` 仅候选，不是来源认证。此前 offline reviewer 只能检验“另外提供的值与观察一致”，不得将其 `candidateFileDigestsMatchSeparatePins` 当作可信来源结论。
- **重复 inode 明确拒绝，不暗中合并：**同一个**逻辑节点**经多个 symlink hop 得到一个 FD 可记录；但是不同 manifest 逻辑节点若终结于同一 (dev,inode)，或真实硬链接 `nlink>1`，仍按现行 observer/offline reviewer 拒绝。若 Ubuntu 实机显示不可避免的同实体多节点，先给出具体样本与消费语义，再就去重/分组合同单独获授权；不得删掉原断言或把其中一个节点静默跳过。
- 不修改 B4B-3A 的固定解释器版本字符串、既有 `root_python_dependency_path_fds.py`、observer 或 offline reviewer 的公开行为；若新解析路径需要扩展其合同或提升 authority，**先停止另审**。不修改 `build_bundle.py` 的 17 项、Runtime 安装入口、CI、依赖/锁、Prisma、业务组件、系统权限或生产配置。

### 7.3 C2 生产模式新实例恢复验收：现行合同与准确操作批次（本文件不执行）

**C2-CHANGE-01：用户于 2026-10-18 明确授权将 C2 恢复验收直接替换为方案 B。唯一现行恢复路径为「从明确指定的 Snapshot 创建独立新实例 → 恢复点一致性/隔离/合成服务验证 → 原始证据离机独立核查」。不再要求 VirtualBox 原机 `snapshot restore`，不设置 C2-02I 可选分支；旧 §7/§9 的原机回退描述仅为 2026-10-18 变更前的历史记录，不得再作为关闭门禁、后续操作指令或待决替代方案。** 本条为文档合同授权，**不是** VM、Snapshot、root、生产执行授权。R0 D1–D5、C1/C3–C8 及 G2 A–F 原边界不变。**C2 的现行实际结果以后续 §9.6 为准：隔离合成恢复有界 CLOSED、N-07 LIMITED-ACCEPTED，其他真实 AWS/Guest/root/生产门禁不变。**

### C2-0：只读材料/身份（可以先独立取得，仍须人类执行授权）

**目标：**冻结本次实际 Host/Guest 身份与可恢复实验资产，不操作 VM 电源/快照，不写 Guest。原 2026-10-17 历史值仅对照；不得自动指定为新 `VM`/`SNAP`。

**操作员必填表（未知留空，不猜）：**Host 名称、操作者、UTC、VirtualBox 版本；VM 的显示名/UUID、Guest DMI normalized UUID、**准确磁盘 medium UUID / backing-file 和 hash**、snapshot 名称/UUID/父子关系/当前分支、VM power state；NIC 及 Host routing/forwarding/共享文件夹/USB/剪贴板策略；Guest OS/kernel/arch/Python/systemd/rootfs ext4 UUID、mount namespaces、无真实 SanQ mounts/keys/凭据和旧 fixture；实验 runner 与 witness 源 SHA；off-Guest 原始证据目录、复制人、hash 清单。

**Mac Host 只读命令（在本地 Terminal，`VBoxManage` 位于 PATH 后；先由人工把已核实对象填入变量，绝不以历史名字自动选择）：**

```sh
date -u '+%Y-%m-%dT%H:%M:%SZ'
VBoxManage --version
VBoxManage list vms
VBoxManage list runningvms
VM='<填入人工核准的确切 VM 名称或 UUID>'
VBoxManage showvminfo "$VM" --machinereadable
VBoxManage snapshot "$VM" list --machinereadable
VBoxManage showvminfo "$VM" --details
sysctl net.inet.ip.forwarding net.inet6.ip6.forwarding
# 从 showvminfo 中确认特定 medium ID 后，另行读取：
DISK='<填入刚刚核实的磁盘 medium UUID>'
VBoxManage showmediuminfo disk "$DISK"
```

**Guest 普通用户只读命令**（只有 Host 证明目标是该 disposable Guest 后才进入；不用 sudo，不下载/安装/执行 candidate，不读取 `.env`、secret 内容）：

```sh
date -u '+%Y-%m-%dT%H:%M:%SZ'
id; uname -srmo; cat /etc/os-release
/usr/bin/python3.12 --version
systemctl --version | head -n 1
systemctl is-system-running --no-pager
lsblk -o NAME,TYPE,FSTYPE,UUID,MOUNTPOINTS
findmnt -n -o SOURCE,FSTYPE,OPTIONS /
findmnt -n -o SOURCE,FSTYPE,OPTIONS /tmp
stat -c '%n uid=%u gid=%g mode=%a dev=%d inode=%i type=%F' / /tmp /lib /lib64 /usr/bin/python3.12
readlink /lib
readlink /lib64
readlink /lib64/ld-linux-x86-64.so.2
readlink -f /lib64/ld-linux-x86-64.so.2
cat /proc/self/mountinfo
readlink /proc/self/ns/mnt
ip -4 route show; ip -6 route show
findmnt -t vboxsf,nfs,cifs
systemctl list-units --all --no-pager 'sanq-*'
systemctl list-unit-files --no-pager 'sanq-*'
```

`readlink -f`、`dpkg-query` 和 `sha256sum` 后续仅用于**候选平台探索**，不能交给解析器替代受控 FD 路径证明；不存在的 link、未装的包或无匹配挂载产生的非零退出码须原样保留并解释，不能当 PASS。

**证据：**Host/Guest 的原始终端输出分别采集原样 stdout/stderr/rc、执行日期/顺序、命令文本与观察身份；只向 Host 私有、非 Guest、非 Repo/Drive 公共目录保存，不上传密钥或原始环境变量。为每份原始文件在 Host 计算 `shasum -a 256 <实际文件>`，保留原件+manifest，另由独立核对人读取并复算；报告用文件名+hash+保管责任人引用，不从聊天记录重建原始 JSON。

### C2-1：Snapshot → New Instance 实际恢复演练（对象与副作用逐项另授权）

**唯一 C2 恢复机制不变：**按照生产 Lightsail「指定 Snapshot → 独立替代实例」的模式，使用隔离 VirtualBox 合成环境证明恢复能力。`clonevm --snapshot=... --mode=machine` 是现有实验的实际机制，但创建成功并不等于整盘或业务恢复已验证；真实 Lightsail/DB/Uploads/支付流量不在本轮范围。不要求、不执行原机 `snapshot restore`。

**C2-CHANGE-02（2026-10-18 用户批准）：N-02、N-03、N-05 改用既有 A/B 原始证据的充分性比对。** 预先植入 Marker A、快照后写入 Marker B、另建一轮快照/新实例，都不再是强制验收条件。先核对原始 Host 记录、准确快照及介质来源链、clone 操作与 rc、独立 VDI、恢复 Guest 的有限稳定基线、合成 HTTP 与离机 hash。不得把该链条说成整盘逐字节一致、任意未观测的快照后变更不存在，或第三方对 Host 原生状态签名。关键证据存在不可解释的矛盾则 fail-closed。

**现行 C2-02 / N-01–N-07 核查合同：**

1. **N-01 身份/隔离：**记录并交叉核对真实 Host、源 VM UUID、Snapshot UUID/名称、源介质链、恢复 VM UUID、Guest UID/GID、Host-only 网络/共享目录/剪贴板/挂载。源 Test-02、旧 Snapshot 与历史证据一律保留。
2. **N-02 A（Snapshot）锚定：**直接用历史 Host `snapshot list`、Snapshot 配置、源 VM/介质信息、归档时间与 hash 确认本次克隆选择的**确切恢复点**。没有预置 Marker A 不构成自动失败；只有 snapshot 名称或一次自行报告的值而缺身份链，不能 PASS。
3. **N-03 A→B 来源因果：**核对 `clonevm --snapshot=<准确名称/UUID>` 原始执行材料、成功退出码、新 VM/VDI、独立 base medium/Parent UUID 与源 VM/快照关联；排除从 source 当前态误克隆或 linked clone。无 Marker B 不构成自动失败，但该链条只能证明操作与来源，**不能断言未观察到的任意快照后文件均被排除**。
4. **N-04 实际新实例：**确认 clone 真实成功、恢复实例独立 UUID/MAC/VDI、正确容量和来源绑定、成功启动；保留原始 stdout/stderr/rc。不能只因 `VBoxManage` 返回 0 就判定业务完全恢复。
5. **N-05 A/B 选定内容一致性：**按采集脚本的 22 个命令名、原始 rc 与输出逐项对照；对 OS/kernel/Python、rootfs UUID、stat、usrmerge/loader、mount 和 isolation 等稳定字段进行严格比较，UTC、Guest IP 与 mountinfo 中临时内核标识作为**明确列出的预期差异**，不能隐去。须注明源 Guest 观测发生于快照之后，**不能冒充快照创建时的逐字节内容**；可以增加已有的快照时点固定文件摘要，但并非必需 Marker A/B 或整盘 hash。
6. **N-06 合成服务：**在隔离 Host-only 环境核对旧目标不可用、新目标 HTTP 200 且身份/run_id 准确、受控停止与随后探针失败，连同失败/重试证据一起保存；不测试真实 Web/API/DB/外部 provider 或公网切换。
7. **N-07 独立原件审阅：**逐归档及内部 manifest 复算 SHA；复核 snapshot、clone、Guest、HTTP 原始文件，留存执行时间、身份、成功/失败及缺失项。若外层 SSH rc 当时未捕获，原样标注 `MISSING`，不补造，也不为该单项重做全部演练。独立审核用户上传包只能证明收到的**字节完整性和内部一致性**，不能仅此认证原始 Mac Host 身份或不可篡改的采集链。

**验收决策：**每项记录 `VERIFIED / LIMITED / BLOCKED` 与受影响的具体结论。关键来源身份、恢复机制或所依赖的系统状态出现不能解释的冲突时 C2 保持 OPEN；仅补最小的必要证据。先使用现有档案及只读 `VBoxManage` 查询，不要求再造 Snapshot 或 VM；后者及 Guest/Host 操作有副作用时仍须单独提供对象、影响和审批。C2 不是生产 Lightsail 全业务恢复认证，C1 与 C5-G2 始终独立。

### C2-2：独立源/消费取证（只计划，不随 C2-0/1 自动执行）

待 C2 可恢复性实证后，另行认证软件包外部发行材料及解释器/loader 和实际 Guest 的路径链接映射，并批准只读 Guest root-anchor 预开与观察脚本的**精确源 SHA、root-private 目录、命令、身份/权限、输出位置、负例和清理**。B2B2-B 解析结果仍只是候选；**真实** Operator/Bootstrap、CPython import hook、`sys.path`、ELF `PT_INTERP`/`DT_NEEDED`/`RUNPATH` 与 `dlopen` 的实际消费和传递闭包由后续 B4B-3B-2B3 / 3C 独立见证，不能借 C2 恢复验收把 C1 关掉。

### 7.4 验收矩阵（SRC/LIVE 仍为拟验收合同；C2-01/02 本次结果见 §9.6）

| ID | 范围 / 输入 | 预期 | 证据 / 门禁 |
| --- | --- | --- | --- |
| SRC-01 | CI 私有临时树：已登记目录 usrmerge 和 leaf loader symlink，绝对/相对目标 | 相同逻辑节点映射固定 canonical FD，读出限定 bytes；receipt 仍 BLOCKED | 新模块单元测试；仅源码切片 |
| SRC-02 | B2B1 严格 no-follow 对同样链接 | 继续拒绝，无调用方越权回退到 `realpath` | B2B1 回归，无兼容性放宽 |
| SRC-03 | 未登记链接、错误 link text、绝对逃逸、相对 `..` 逃逸、循环或超 hop | 拒绝、无可借出 FD | 合成负向断言 |
| SRC-04 | 超文件/路径/单文件/总字节预算、FIFO/目录/错误 owner/权限 | 拒绝，关闭全部打开 FD | 合成负向、FD 泄漏检查 |
| SRC-05 | 不同逻辑路径同 inode、硬链接、重复 pin/canonical 碰撞 | 按既有 B3B-1 语义拒绝，不静默去重 | observer/offline 回归 |
| SRC-06 | symlink/父目录/leaf 替换、竞争时序、FD 生命周期异常 | 发现即 BLOCKED；前后相等不产生持续排他 PASS | 人工可控 swap fixture + 未覆盖竞态登记 |
| SRC-07 | 不同设备、同设备 bind mount、mount ID/namespace 漂移、不可读取 | BLOCKED；不以 dev 相等自动准入 | Linux fixture/Guest 专项，缺 mount 覆盖时不 PASS |
| SRC-08 | 正确 FD bytes 但外部 pin 错、pin 仅自报或 receipt 丢失 | BLOCKED，来源/保管链不认证 | 独立核对与错误来源负例 |
| C2-01 | 新鲜 Host/Guest/源磁盘与网络/挂载/凭据隔离身份 | 准确跨侧核对；未知 STOP | N-01 Host/Guest 原始记录、rc、独立证据 |
| C2-02 / N-01–N-04 | A Snapshot 身份与 B 新实例的来源链 | 指定 Snapshot、source/medium、克隆成功和独立 base VDI 交叉核查；**不强制 Marker A/B** | Snapshot/source/clone/target 原件；来源不明则 BLOCKED |
| C2-02 / N-05–N-07 | A/B 已有 Guest 基线、合成 HTTP 与证据完整性 | 22 项逐项对照稳定值和预期差异、身份与 rc；合成接管/停止；离机 SHA 与独立包内审阅 | 必须区分被核实的字节/功能与尚未独立认证的 Host 来源，关键矛盾 BLOCKED |
| 历史 B4B-2 8/8 | 2026-10-17 当时的实验原件 | 保留历史观察和当时缺失项；**非 C2 现行关闭条件** | 历史记录不重写，不把旧实验升级为 PASS |
| LIVE-01 | 真实 Guest alias / loader / 发行包与独立外部 pin | 每条 logical→FD→bytes→source pin 可复核 | C2 通过后另批准采集；仍非 C1 PASS |
| LIVE-02 | 动态 import、ELF/dlopen 完整消费及独立 witness | 同候选完整一致；缺口 BLOCKED | 后续 B4B-3C，不在 B2B2-B 源码范围 |

### 7.5 下一源码切片与集中审批分组

**以下 B2B2-B 设计语义来自 PR #2860 时的源码实施前评审，属于历史记录；截至本次 PR #2861 / CI #7352 的 B2B2-B1 合成候选已合并，而真实 B2B2-B2 Guest/root 未获授权。**

**当时拟实施的源码批（B2B2-B；历史提案）：**新增独立、外置 `ops/runtime/root_python_dependency_alias_fds.py` + `ops/runtime/tests/test_root_python_dependency_alias_fds.py`；仅专用 `root-FD+nofollow link/FD` 解析及非授权轨迹；使用现成 manifest、B2B1 / FD observer 的严格合同和 R0 门禁。临时私有 Linux 文件树聚焦正负测试，不执行真实候选，不调用任意路径/网络/子进程/Guest/root/生产写入；不修改旧 nofollow、observer 重复 inode 策略、17 项 Bundle、安装器/备份/运行服务、依赖/锁/Prisma。路径语义扩展是**专项架构扩展**，需批准上文 §7.2 的白名单/相对目标/预算/重复 inode 拒绝及 fail-closed 边界后才可编码；若真实 Guest 布局证明与本节不相容，退回专项评审，不猜测兼容。

**CI（获得首次远端授权后）：**`.github/workflows/ci.yml` 的 `ops-checks` 选择 Runtime+Release：`bash -n ops/verify-runtime-readiness.sh` 与 `python3 -m unittest discover -s ops/runtime/tests -p 'test_*.py'`；`python3 -m unittest discover -s ops/release/tests -p 'test_*.py'`，以及 `ci-change-scope` / 汇总检查。无关 Web/E2E 按范围跳过，CI 合成 PASS 不等于 Guest/C1/C2。MCP-workspace 不运行 lint/build/test。

**审批批次独立：**

1. **本轮文档交付：**审阅本文件及 #2859 同批记录校正；授权前不推送/PR/合并。
2. **B2B2-B 源码边界：**仅批准受限新模块及合成测试；如无法接受提议预算/相对目标语义，则保持严格 no-follow BLOCKED、不得先写代码。
3. **C2-0 只读取证：**核准实际 Host/VM/Guest 与逐条命令和原始日志保管位置；不授权 snapshot/Guest root。
4. **C2-1 生产式新实例恢复：**先复核现有 C2-0/C2-1 原始归档、A/B Snapshot/clone/VDI 来源链、Guest 22 项结果与合成 HTTP。已证明部分直接认可；只针对关键不可替代的证据缺口另行审批最小补测，不默认新建 Snapshot/VM、不要求 Marker A/B，不回退或删除旧资产。
5. **C2-2 / B4B-3C Guest root：**满足 C2 后，另交精确脚本 SHA、命令、root-owned 安全路径、独立 pin/witness 和失败保全清单，经新的许可才执行。
6. **生产 G2-E：**R1–R5 同候选证据及 C1–C8 门禁全部满足后独立审批；当前始终 **NO-GO**。

**原 §7 仅设计评审批不修改：**任何 `ops/runtime/*.py` 源码/测试、17 项 Bundle、业务代码或 Prisma、依赖、`sudoers`、现役备份 timer、生产 VM/runtime、Guest/root/快照、远端 Kit/Cloud 权限或真实凭据。生产 installed Runtime / app SHA 本轮未重读，不能使用 `dev` SHA 代替。

## 8. 2026-10-18 — B4B-3B-2B2-B1 合成受限 FD 开链本地实施（待审阅）

**基线：**PR #2860 / CI #7350 已合并的 `origin/dev@c9bfa566d7892042b23508889c95a11334159f5b`；本地分支 `feat/c5-g2-b4b3b2b2b1-controlled-alias-fds-20261018`。**状态：LOCAL SOURCE + SYNTHETIC TESTS AUTHORED / NOT RUN / NO PR / NO GUEST / C1/C2 OPEN**。用户只授权 B2B2-B1 独立解析器与合成测试，**未授权 B2B2-B2 的 Guest/独立来源采集、C2 快照恢复或生产执行**。§7 的待批准状态是设计批历史，不应冒充本批当前进度。

**新增源码：**`ops/runtime/root_python_dependency_alias_fds.py`。仍从调用方提供的**未经认证** root directory FD、B4B-3A manifest/digest 和提出的 file pins 出发，读取逐路径的**精确声明** `proposed_exact_links`（仅作为输入约束，不接受其为外部认证）。目录和普通文件使用 `O_PATH | O_NOFOLLOW` 固定当前条目并逐段核对，symlink 使用 `O_PATH | O_NOFOLLOW` 持有链接 FD，调用 `os.readlink("", dir_fd=link_fd)` 读取**持有的同一个链接对象**，不对路径执行 `realpath` 或调用普通 `os.readlink(name)`。校验链接文本完全一致、类型/owner/权限/FD metadata，展开绝对目标相对于 root FD、相对 `..` 仅在当前 root-FD 内归一，未知/越界/循环/超限拒绝。最终普通文件再次用只读 `O_NOFOLLOW` 打开且与 O_PATH entry FD 同 inode，持有到借出上下文结束；路径字串仅为非授权轨迹，不允许调用方重开。

**限定预算（B1 合成候选合同）：**最多 64 个逻辑文件、每条解析路径 12 段、单文件 32 MiB、总声明字节 64 MiB、每文件最多 8 跳 symlink、单跳文本和路径最多 256 ASCII bytes、最多 8 条精确 link 声明，所有借出路径合计最多 768 个 held FDs；全部受限且不按真实 Guest 失败自动扩大。**Mount 判定：**严格要求 `st_dev` 与 root 一致，另要求 Linux `/proc/self/fdinfo/<fd>` 的真实 `mnt_id` 在 anchor/每个链接/目录/最终文件一致，且 `/proc/self/ns/mnt` 在借出前后不漂移；缺失 mount ID、procfs 不可观测、同设备 bind mount/不同 mount、任何 metadata/path link 改动均 fail-closed。这里的 mount ID 只提供合成路径观察约束，**不是外部 witness，也不证明整段借出期间完全无竞态**；无需引入 `openat2`/`statx` 原始 syscall/ctypes 或额外依赖，此决定不声称内核机制比设计基线更强。未来 Guest 如需可靠独立唯一 mount 标识，另审实现。

**合成测试：**`ops/runtime/tests/test_root_python_dependency_alias_fds.py` 仅在 Linux 使用临时私有模拟目录：`/lib64 → /usr/lib64`、`/usr/lib64/ld-linux... → ../lib/...` 的目录+leaf symlink、可选 `/lib → /usr/lib`、真实借出的只读 FD 交现有 observer 获取依旧 `BLOCKED` receipt；同时覆盖 B2B1 原 strict opener 继续拒绝链接，未登记/错误/冗余 link、root 越界、循环/跳数、owner/mode、FIFO、hardlink、借出后 inode 替换、mount ID/namespace 漂移、pin 不一致与 FD 清理。所有内容为人工字节，**没有真实 Python/ELF 执行，也没有 root/Guest 操作**；workspace 无 test/lint/build 权限，当前尚无测试成功证据。

**权限/架构：**B2B1、B3A、FD observer/offline reviewer 保持原样，原 17 项 Runtime Bundle 与入口无变化；不改变任何业务 owner、模块边、HTTP/DB/API/Prisma、CI workflow、lockfile/sudoers、真实配置或备份服务。返回结果始终 `decision=BLOCKED`、`readyToInstall=false`、`authorizedToMutateProduction=false`、root/外部 pin/动态依赖来源未认证。下一步经用户审阅才允许提交远端跑 `.github/workflows/ci.yml` 的 `ops-checks`；最终仍须 **C2-0/1** 真恢复证据后单独批准 **B2B2-B2** 的准确 Guest/root/witness 操作，**C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED**。

## 9. 2026-10-18 — C2-0 / C2-1 生产式新实例恢复演练：操作员历史实测续记

**记录口径：**下表来自操作者在 Mac Terminal / VirtualBox / Ubuntu Guest 的原始输出和对话内 SHA-256 校验反馈；MCP-workspace **没有直接访问、下载、重算或独立鉴证其 Mac / Google Drive 原件**。Git 仓库只保存脱敏的证据**索引和可复核结论**，不收录原始系统配置、密钥、压缩包或个人路径。§7 原「未执行」代表当时设计交付状态；本节记录之后的有限观察，**2026-10-18 C2-CHANGE-01 已将原地 restore 门禁替换为 §7.3 新实例恢复唯一现行合同**。本次旧实测的不足仍必须按 N-01–N-07 评估，不能追认完整 C2 PASS。

### 9.1 准确资产与 C2-0 观察

| 资产/对象 | 操作员核对的值 | 结果与边界 |
| --- | --- | --- |
| Host | macOS + VirtualBox `7.0.26r168464`，独立 Host/Guest 命令输出 | Host IPv4/IPv6 forwarding 均为 0；未读取 Host 全局其它通道的形式化认证 |
| 源 VM | `SanQ-Linux-Test-02` / `4b1bd5e7-54c5-45c4-9cc3-dba2ed48a033` | C2-0 后正常关机，演练期间保留；Test-01 未操作 |
| 源恢复点 | `SanQ-Runtime-B4B2-Clean-Baseline-20261017` / `028a681b-18b9-4dc7-a67f-69257e7cf85b` | snapshot 名称/UUID 经 Host 只读取得；`CurrentSnapshotUUID` 本身不证明发生 restore |
| 源磁盘链 | base `66ad835f-8e92-4e9f-96e0-5907f6296169` → differencing `dec27e4f-b4ef-4e0f-9cfb-612931fd2aca` | VirtualBox medium parent/child 与 source VM 引用吻合；未执行原地恢复 |
| C2-0 隔离 | 只有网卡 1 Host-only，其余 none；Guest `192.168.56.2/24`、无 IPv4/IPv6 default route；共享文件夹 none、drag&drop/clipboard disabled、VRDE off；录屏全局 disabled | 第一次 Host 观察曾显示 clipboard bidirectional，**操作者已更改并由后续查询复核 disabled**；不将 Host-only 当作无限的整机隔离证明 |
| C2-0 Guest | `ubuntu` UID 1000；Ubuntu 24.04.5 / Linux `6.8.0-146-generic`、Python 3.12.3、`/dev/sda2` ext4 / UUID `24895113-d19d-4b65-84ea-ca5098f95ae5` | 普通用户读取，rootfs `rw`；启动本身允许系统写日志，不是只读磁盘 |
| usrmerge/loader | `/lib -> usr/lib`；`/lib64 -> usr/lib64`；`/lib64/ld-linux-x86-64.so.2 -> ../lib/x86_64-linux-gnu/ld-linux-x86-64.so.2`；`readlink -f` 得 `/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2` | 是实际 Guest 的路径观察；`readlink -f` **不构成**经可信 root FD 持有的安全开链/独立软件发行源证明 |
| C2-0 mount | `mnt:[4026531841]`；根挂载 mountinfo `8:2 /dev/sda2`；无观测到 `vboxsf`、NFS/CIFS 或外部 mount | 仅该次普通用户 namespace 观测，不代表全系统所有 namespace 完整覆盖 |
| 缺失项 | `tmp-mount exit=1`：/tmp 未独立挂载；`sanq-unitfiles exit=1`：未找到匹配 unit；其他 20/22 项返回 0 | 属有限观测范围的预期缺失；**C2-0 SSH 外层退出码未捕获**，有独立缺失说明而非补造值 |

**C2-0 证据索引（Host 私有／离机、非 Git）**：原始 5 个 Host 采集目录 `host-20261018T195002Z.SjFMbO`、`host-20261018T195155Z.hwxNSq`、`host-20261018T195200Z.4lYrOt`、`host-20261018T195701Z.HMdSPt`、`host-20261018T195901Z.fOvkOJ`；Guest `guest-20261018T200644Z.Odwu7P`。打包 `SanQ-C2-0-evidence-20261018.tar.gz`，**操作员报告的 archive SHA-256** `5503b6f9942613e66e886ddd945aad4544c4f4d56835539db97cd8bc0683eaea`；Mac 原包及从私人 Google Drive 下载的副本均 `shasum -a 256 -c ...portable.sha256` 为 `OK`。这证明所校验的字节相等，**不是** Google 对象不可篡改、密码学来源签章或第三方独立 witness。云端是否以客户端 crypt 加密未证明；不能把普通 Google Drive 文件说成已 crypt 加密。

### 9.2 C2-1A–D：从快照创建独立新实例（生产式模拟）

| 阶段 | 操作/结果 | 真实状态 |
| --- | --- | --- |
| C2-1 preflight | 6 个 Host 查询均 rc=0；源 VM `poweroff`、指定快照/磁盘链匹配；Mac 当时可用 59 GiB；snapshot 内 clipboard 为 **Bidirectional** | 恢复后配置可能回退，禁止启动前跳过隔离核查 |
| C2-1A 创建 | 源关机；`VBoxManage clonevm SOURCE --snapshot=SanQ-Runtime-B4B2-Clean-Baseline-20261017 --mode=machine --name=SanQ-C2-1-Recovered-20261018 --register`；clone rc=0 | **不是** `VBoxManage snapshot restore`；原源机/快照未回退、未删除 |
| 新实例身份 | VM `162701f1-bf68-413d-9f2d-76c513554881`；新 base VDI `39381cc9-f526-4e35-8a09-3a265cfe79f4`（Parent=base，独立目录）；MAC `08002703FDC2` | 新 VM 无历史 snapshots（`--mode=machine` 预期）；不是差异磁盘依赖原 source |
| C2-1B 启动 | 新实例 `192.168.56.3/24`，原 source 保持关机；启动前禁用新 VM clipboard，Host 查询复核 disabled、Host-only 及无共享目录；Ubuntu 24.04.5/Kernel/Python 与原观察相同 | 文件系统 UUID 继承（`24895113-d19d-4b65-84ea-ca5098f95ae5`），并不与新 VDI UUID 独立矛盾；SSH keys/machine-id 是否重复仍未对照 |
| C2-1B Guest | 22 项同组采集，20 项 rc=0，`tmp-mount`、`sanq-unitfiles` 为 1；7 组选定 rootfs/stat/loader 观测 `diff -u` rc=0；采集文件清单 SHA 均 OK | 只是选定属性和路径一致，**没有整盘逐字节核验**；此次 Guest SSH 外层 rc 仍未捕获并如实记录 |
| C2-1C 端点接管 | 源 `192.168.56.2:18081` curl rc=28 / HTTP 000；恢复机 `192.168.56.3:18081` HTTP 200，JSON 为 `service=sanq-c2-1c-synthetic`、`instance=recovered`、`uid=1000` 与非空运行 ID | 证明 Host-only 上**合成客户端改用新目标**，不证明真正 DNS/Static IP/Cloudflare 流量切换、Web/API/DB 或 provider |
| C2-1C 停止 | 第一次 `/__stop` 返回 404（窗口 B 未设置正确 RUN_ID），该失败留证；改用记录在 `run-id.txt` 的精确 ID 重试得 HTTP 200/rc=0、服务打印 `STOPPED`；后续 `/healthz` HTTP 000/curl rc=7 | 故障检测通过；原自动 `grep` 对空 ID 可误判，**以实际非空 ID 与两次 JSON 显式对照为准**；`server.exitcode` 缺失，外层 SSH rc 不得补造 |
| C2-1D 归档 | preflight/clone/recovered Guest/HTTP/final Host 五组文件校验与 `tar -tzf` OK；`SanQ-C2-1-evidence-20261018.tar.gz` 原本机与 Google Drive 下载回来的副本 `portable.sha256` 均报告 `OK` | **C2-1 压缩包的具体 64 位摘要在最初验收时未提供（本节为历史观察；后来上传归档并于 §9.3 由独立环境计算）**；此历史阶段尚未由 MCP/外部 witness 直接读取原件 |

**C2-1 证据索引（仅文件夹 basename）：**`c2-1-preflight-20261018T202134Z.gbChJv`、`c2-1-recovery-20261018T203356Z.IyFAre`、`c2-1-recovered-20261018T204616Z.e2yM2t`、`c2-1c-20261018T205243Z.q4e9R1`、`c2-1d-final-20261018T210512Z.PjjytD`。C2-1C 合成运行 ID `c2-1c-20261018T205243Z-FD359935-33A1-481E-808F-F6E173538607`；其不是 Operator/Runtime 源 pin。证据包在私人 Google Drive 上用户报告已上传/下载并校验；**Host witness 对原始 Mac 状态的独立签认仍缺失；C2-1 SHA 完整值已在后续 §9.3 独立回填**。

### 9.3 C2-CHANGE-02 下的现有 A/B 原件复核（不追认未知内容）

- **可记录：**`C2-0 HOST/GUEST READ-ONLY OBSERVATION REVIEWED`；`C2-1A–D PRODUCTION-STYLE SYNTHETIC NEW-INSTANCE RECOVERY OBSERVED`。上述后者证明 VirtualBox 新实例从指定 snapshot 的有限恢复、启动和合成 endpoint 读回；原 Guest/Host 离机证据最初经操作者自行核验，随后本次 §9.3 的**上传归档字节**已在独立环境验证，但仍不代表 Host 身份的独立签认。两次 Guest SSH、HTTP Server SSH 退出码缺失以及早先 404 均为正式已知限制。
- **已独立读取两份上传的归档：**C2-0 SHA-256 `5503b6f9942613e66e886ddd945aad4544c4f4d56835539db97cd8bc0683eaea`；C2-1 SHA-256 `29257b278195725002754d8925edec5b7328526df5afe8da7f6d2872fe43f3cd`。本次独立复算所解析的内层摘要清单均匹配；两份 `guest.stdout` 的 22 项记录中 **19 项输出与 rc 完全一致**，其余仅 `time`、`mountinfo`（运行时 `pipe_ino`）、`ipv4-routes`（源 `.2` / 恢复 `.3`）存在预期差异。克隆 rc=0、目标独立 base VDI parent=base、合成 HTTP 成功/受控终止等已有事实可直接复用。**留存限制：**仅凭归档无法独立认证原始 Host 身份及最初采集过程的不可篡改性；`clone.stdout` 未保存完整命令字符串，虽然对话记录了 `--snapshot` 精确操作，但不能把它称作已封存在该 stdout 中；C2-0/C2-1 Guest 和 HTTP server 外层 SSH rc 未捕获。上述 Guest 对照系快照之后的有限观察，不是快照时刻整盘或未知快照后更改不存在的证明。N-02/N-03/N-05 **不再因缺 Marker A/B 自动失败**，但关键来源证明若复查失败仍 BLOCKED。未补足独立 Host 来源见证和准确验收签署前 **C1/C2 OPEN、C5-G2 NO-GO、S2 PAUSED**；不因本轮变更自动开展 Guest/root 或生产执行。
- **下一步审批：**① 用**现有** Host 归档和 `VBoxManage snapshot SOURCE showvminfo SNAP` / `showvminfo RECOVERED` / `showmediuminfo disk` 作只读 A/B 复核，重点补上真实 Snapshot 配置与恢复目标绑定，逐项签出 `VERIFIED/LIMITED/BLOCKED`；② 如果关键内容确实无法证实，只针对最小缺口提出补证及相应操作授权，不以缺 marker、缺外层 SSH rc 作为自动重做理由；③ C2 满足现行合同且经独立验收后，另批 C2-2/B2B2-B2 Guest/root/pins/消费取证。参见 [备份恢复手册附录 A](../runbooks/backup-recovery.zh-CN.md)。生产 Lightsail、Static IP、Cloudflare、业务 DB 与支付恢复未执行。

### 9.4 只读 A/B 比对命令（本条不授权创建 Snapshot/VM）

在操作者 Mac 上使用**现有**两份已离机归档和准确的 VM/介质 UUID；首先核对离机摘要和 `tar -tzf` 的完整性，再执行以下 `VBoxManage` **只读**命令（无需关停现有恢复实例）：

```sh
SOURCE_VM='4b1bd5e7-54c5-45c4-9cc3-dba2ed48a033'
SNAP_UUID='028a681b-18b9-4dc7-a67f-69257e7cf85b'
RECOVERED_VM='162701f1-bf68-413d-9f2d-76c513554881'
RECOVERED_DISK='39381cc9-f526-4e35-8a09-3a265cfe79f4'
VBoxManage snapshot "$SOURCE_VM" list --machinereadable
VBoxManage snapshot "$SOURCE_VM" showvminfo "$SNAP_UUID"
VBoxManage showvminfo "$SOURCE_VM" --machinereadable
VBoxManage showvminfo "$RECOVERED_VM" --machinereadable
VBoxManage showmediuminfo disk "$RECOVERED_DISK"
```

每条命令保存真实 stdout/stderr/rc 后核对：Snapshot 是否仍属于 source、恢复实例 SATA VDI 是否等于 `RECOVERED_DISK`、其 `Parent UUID` 是否为 `base`，是否存在共享磁盘引用或危险网络/剪贴板变化。对既有 C2-0 `guest.stdout` 和 C2-1 `guest.stdout` 按 §9.3 的 22 项命令名+rc+输出复核；当前 19 项相同、3 项动态差异的审核结论不等于将所有运行时字段视为不可变。可增加只读已有 Guest hash 证据；**不对正在运行的两个磁盘直接运行整盘 SHA 比对，也不为了形式上产生新的 Snapshot 做任何 VM 写操作**。

### 9.5 2026-10-18 — 最终 A/B Host 实时只读复核与 C2-02 分项结论

**证据口径：**用户在 Mac Terminal 对已保存的 C2-0、C2-1 原件重新执行只读审阅脚本，并展示原 Snapshot 和现有恢复 VM 的实时 `VBoxManage` 查询输出。这是 **VirtualBox 合成新实例恢复** 的证据，不是实际 AWS Lightsail 控制面、持续维护冻结或业务 DB/Uploads 的验收。以下 Host 实时查询目前仅有对话原始终端输出，**未见本轮命令另行封存 stdout/stderr、完整 rc、离机 hash 与独立 Host 签认**；仅在所观察范围下判定，不补造更高等级证明。

**A — Test-02 现存 Snapshot（`snapshot showvminfo`，查询 rc=0）：**

| 字段 | 观测值 |
| --- | --- |
| Source VM | `SanQ-Linux-Test-02` / `4b1bd5e7-54c5-45c4-9cc3-dba2ed48a033`；查询显示 `powered off` |
| Snapshot | `SanQ-Runtime-B4B2-Clean-Baseline-20261017` / `028a681b-18b9-4dc7-a67f-69257e7cf85b` |
| 快照 SATA 盘 | Port 0 / Unit 0，base VDI UUID `66ad835f-8e92-4e9f-96e0-5907f6296169` |
| 快照 NIC | MAC `08002797C9EA`，唯一 Host Only Network `HostNetwork`，NIC 2–8 disabled |
| 快照其它隔离参数 | Shared folders `<none>`、Drag and drop disabled、VRDE disabled；**快照中的 Clipboard Mode = Bidirectional**（不能写成快照内已 disabled） |

**B — 已创建的恢复实例（非重新克隆）：**

| 字段 | 观测值 |
| --- | --- |
| VM / 运行状态 | `SanQ-C2-1-Recovered-20261018` / `162701f1-bf68-413d-9f2d-76c513554881` / `running` |
| NIC / MAC | `hostonlynetwork` / `08002703FDC2`；`clipboard=disabled`、`draganddrop=disabled` |
| SATA VDI | `39381cc9-f526-4e35-8a09-3a265cfe79f4`，仅被该恢复 VM 使用，位于其独立目录 |
| VDI 独立性 | `Parent UUID: base`、`Type: normal (base)`、VDI dynamic、容量 25600 MBytes、实际 4345 MBytes |
| VDI 查询状态 | `locked write`（与运行中 VM 相符，不当作磁盘损坏）；`Disk query exit: 0` |

**历史归档的本次复核输出：**C2-0 SHA-256 `5503b6f9942613e66e886ddd945aad4544c4f4d56835539db97cd8bc0683eaea`（237 regular files、6 manifests、231 file-hashes）；C2-1 SHA-256 `29257b278195725002754d8925edec5b7328526df5afe8da7f6d2872fe43f3cd`（60 regular files、3 manifests、50 file-hashes）；均 PASS。22/22 Guest 命令名相符，19 组输出/rc 完全一致，3 组为已解释的时间、Host-only IP `.2 → .3`、mountinfo 临时 `pipe_ino` 差异。已保存的 clone rc=0；合成 HTTP 旧目标 rc=28/HTTP 000、恢复目标 rc=0/HTTP 200、停止重试 rc=0/HTTP 200、停止后 rc=7/HTTP 000；首次停止 HTTP 404 与 `STOPPED` 日志一并保留。

**N-01–N-07 分项裁定：**

| 项目 | 当前判断 | 有限边界 |
| --- | --- | --- |
| N-01 身份/隔离 | **VERIFIED（已观察范围）**：两 VM 与快照 UUID、Host-only/独立 MAC、恢复后关闭剪贴板一致 | A 快照保留双向剪贴板；未认证整个 Host 上所有隔离通道/命名空间 |
| N-02 A Snapshot 锚定 | **VERIFIED**：Snapshot UUID 与原 base VDI 的 `showvminfo` 读回一致，查询 rc=0 | 不是快照创建瞬间全盘字节证明 |
| N-03 A→B 来源因果 | **VERIFIED / LIMITED**：对话中的精确 `clonevm --snapshot` 操作与原 clone rc=0、新 VM/base VDI 交叉一致 | `clone.stdout` 不含命令全文；不能证明未观察的任意快照后变更被排除 |
| N-04 新实例 | **VERIFIED**：独立 VM、MAC、base VDI、成功启动运行 | 非真实 AWS / 业务恢复 |
| N-05 选定 Guest 内容 | **VERIFIED（22 项） / LIMITED（未观测数据）**：19 同值、3 项合理动态差异 | A 的 Guest 观察采于快照之后，非快照时刻整盘 hash |
| N-06 合成接管 | **VERIFIED**：Host-only HTTP 身份、非空 run ID、停止和故障探针通过 | 不涵盖生产 Web/API/DB、Cloudflare、Clover、Uber 或 Static IP |
| N-07 原始证据与见证 | **LIMITED**：两份归档字节/内部清单独立复算、历史失败与缺项如实保留 | 原始 Mac Host 的采集真实性没有独立见证；Guest/server 外层 SSH rc 缺失；本轮 Host 查询未另行离机封存 |

**总判定：**`C2-02 NEW-INSTANCE SYNTHETIC RECOVERY VERIFIED (DEFINED SCOPE) / N-07 LIMITED / C2 OPEN / C1 OPEN / C5-G2 NO-GO`。**不因已验证的来源链与合成接管重复创建快照/VM，也不恢复 Marker A/B 为必选项。** C2 关闭前仍需对 N-07 的 Host 来源认证与证据保管边界进行单独书面风险裁定；只有关键不可替代的证据缺口才提出具体最小补证（任何 Host/Guest 写入需另授权）。PR #2864 新批准的 AWS 快照/维护冻结及其同平台 S01–S12 属于**后续独立验收**，不得用本次 VirtualBox 结果宣布其 PASS。

### 9.6 2026-10-18 — N-07 最终证据风险裁定与 C2 有界 Closeout

**裁定：`C2 CLOSED — ISOLATED VIRTUALBOX SYNTHETIC RECOVERY VERIFIED / N-07 LIMITED-ACCEPTED`。** 本次用户要求对剩余证据风险作最终裁定，若无重大问题即可 closeout C2。复核 §7.3/§7.4、§9.1–§9.5 与两份已经独立读取的归档后，**未发现关键来源 UUID/介质链相冲突、独立新实例无法启动、Guest 稳定观测出现无法解释的差异，或合成接管/受控停止失败**。仅在**指定 Test-02、指定快照、独立恢复 VM、Host-only/无业务数据及现有合成测试**范围内满足 C2-01 / C2-02；本裁定不放宽任何未来执行的来源认证/隔离/原件要求。

| N-07 剩余限制 | 已知证据与风险分类 | 处置 / 不得推导 |
| --- | --- | --- |
| 原始 Mac Host 采集时没有独立签名/可信第三方 Host witness | **低影响残余风险（仅隔离、可丢弃、无生产数据 Guest）**：来自操作员的来源身份不能变成密码学独立签认；历史 Source/Snapshot/VDI/VM UUID 与本轮 Host 只读读回、clone 成功、Guest 与 HTTP 多侧记录相互吻合，没有观察到来源矛盾 | **接受为 N-07 LIMITED**；保留当时执行主体自报及独立归档校验范围；禁止借此认证 AWS IAM/云控制面、真实 root/发行源或 production host |
| 部分 Guest / HTTP server SSH 外层 exit code 未采集 | **低影响记录缺口**：内部 Guest 每条命令各有 rc；Host curl / clone 的实际退出码和 HTTP 正负测试已保存且逻辑一致；缺少的是部分外层 SSH rc | 原样登记 `MISSING`，不编造，不强制为了历史调用包装退出码重复恢复；将来新采集一律保留真实外层 rc |
| 本轮 `snapshot showvminfo` / `showmediuminfo` 为对话终端输出，尚无该轮独立离机原件 | **低影响保管链差异**：两份旧归档 SHA-256 和包内清单独立复核成功，Mac/Drive 的既有副本由操作者报告可取回；本轮实时输出不是已经签名封存的 Host 原始档案 | 对话值仅作为辅助印证，不能宣传为新 off-host witness；未来真实系统必须有独立保管链 |
| A 快照含 Bidirectional clipboard；恢复 B 已 disabled；未审查全 Host namespace、machine-id/SSH keys 重复和整盘字节 | **对限定范围可接受**：启动前已禁用 B clipboard/Drag & Drop、NIC Host-only；Snapshot → 独立 base VDI 与 Guest 选定基线/合成 HTTP 已证明。未知平台/身份/整盘状态没有被标 PASS | 不宣布任意隔离/全盘/生产真实性。真实 AWS 新实例身份去重、防双写、数据/WAL 一致性及首启冻结保留后续门禁 |

**N-01–N-07 最终汇总：**N-01、N-02、N-04、N-06 为 `VERIFIED (defined scope)`；N-03 的完整 clone 命令未随 stdout 封存、N-05 未进行整盘时点对照，均为 `VERIFIED with scope limits`；N-07 为 `LIMITED — ACCEPTED FOR THIS SYNTHETIC C2 ONLY`。该接受是**特定现有证据和非生产实验资产的风险裁定**，不是修改第 7.3 节普遍规则，也不是把缺失值假称为实际采集。

**关闭范围与执行门禁：**仅关闭 R0 **C2「可恢复的隔离实验环境」** 这一前置项，保留 Test-02、原 Snapshot、恢复 VM、两份私有离机归档与 SHA；不删除、不重演、不要求 Marker A/B、VirtualBox 原机 restore 或整盘 hash。**C1、C3–C8 仍 OPEN/NOT REQUESTED；C5-G2 仍 NO-GO；S2 DAILY CONFIG EXPANSION 继续 PAUSED**。PR #2864 的 **RUNTIME-SNAPSHOT-01、MAINT-RESTART-01** 实际 AWS 代码创建/available/隔离新实例、跨重启停写与 [S01–S12](Runtime更新-AWS快照与维护冻结方案.md) 同平台验收均**没有执行、不能从 C2 closeout 推导通过**。C2 closeout 也**不授权**任何 B2B2-B2/root/发行来源 pin、VM/Host 写入、IAM、生产安装或流量切换；对应执行仍须具体对象、命令、证据保全方案及新的明确授权。

## 10. 2026-10-18 — B2B2-B2 第一批 B2-0 源码与 B2-1 取证合同

**LOCAL SOURCE + SYNTHETIC TESTS AUTHORED / NOT RUN / NOT PUSHED / USER REVIEW PENDING。** 以 C2 已有界关闭后的 `origin/dev@eec9668c` 为基线，在独立 `feat/c5-g2-r1-b2b2b2-evidence-contract-20261018` 分支新增外置、**纯内存且永久 BLOCKED** 的 Guest packet 合同、与 Guest 组包代码独立的离机交叉比对以及虚构 Python/ELF/包/Host 身份的聚焦负例；不改变 B2B2-B1 解析器、B3A 清单、B3B1 observer/offline 的既有拒绝行为，不开放 root/Guest/生产执行。

详见 [B2-0 数据合同及 B2-1 只读取证设计](C5-G2-R1-B2B2-B2-取证合同与离机审核.md)：`root_python_dependency_guest_evidence.py` 和 `root_python_dependency_guest_offline_review.py` 仅验证**多份调用方提供材料之间的形状和候选摘要一致性**，不验证 Guest `/` 锚点的独立来源，不验官方软件包签名，不执行动态 Python/ELF/`dlopen` 消费。CI、Guest/root、Host 新采集、真实 .deb 来源和离机 witness **尚未执行/核验**；精确 Guest 命令/执行身份/Root-private 来源与原始证据链仍需另行审核授权。C2 不重开；C1 OPEN、C5-G2 NO-GO、S2 PAUSED。


