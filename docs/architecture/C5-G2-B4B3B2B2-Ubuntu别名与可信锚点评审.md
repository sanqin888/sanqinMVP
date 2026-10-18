# C5-G2 / R1 B4B-3B-2B2 — Ubuntu usrmerge 别名与可信根锚设计评审

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

### 7.3 C2 的三阶段就绪与准确操作批次（本文件不执行）

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

### C2-1：实际快照恢复演练（**明确另授权后**才做）

**目标对象：**只能是 C2-0 精确认证的可丢弃隔离 VM / 指定 snapshot，优先使用独立克隆来保护旧 Guest 和原始证据；克隆与原 Guest 的 medium/snapshot/UUID 对应关系必须重新证实。不能将“创建/列出快照”“从快照克隆能启动”冒充对**本次批准恢复对象**的实际 restore 成功。

**副作用：**真正 `snapshot restore` 会回退目标 VM 磁盘/配置状态，丢失该目标在快照之后的变化；停机/开机、克隆/新磁盘和测试标记也会改变试验资产。没有保存并核对恢复前磁盘/证据、没有目标隔离/无生产数据保证时，**禁止开始**。原 10-17 Guest 根实验的文件/日志及旧 snapshot 保留，不覆盖、不清理。

**待逐项核准的操作序列（命令模板只用于审核，未获执行许可）：**① Host 只读验明 VM/snapshot/medium 当前身份，复制完整旧证据并独立验证 hash；② 单独核准克隆/快照保全与关机策略；③ 在**批准的目标 VM**上建立唯一、无真实业务数据的恢复后差异标记（记录发生在 snapshot 之后的证据）；④ 确认该 VM 完全 powered off，向用户展示**实际** VM UUID、snapshot UUID、目标 medium、预计丢失的 Guest 改动及恢复点；⑤ 用户批准后才可采用 `VBoxManage snapshot "$VM" restore "$SNAP_UUID"`，不得用未经审核的 `controlvm poweroff` 强断电替代正常收尾；⑥ 重新启动**经批准目标**，Host/Guest 独立复读 UUID/mount/文件 baseline 与差异标记，检查原状态恢复、无真实 SanQ 数据和原始日志留存；⑦ 记录执行者、rc、失败处理、未清理资产。无法恢复、原状态未知或 Host/Guest 不符：**C2 FAIL/BLOCKED**，不继续 root/B2B2-B 实测。

### C2-2：独立源/消费取证（只计划，不随 C2-0/1 自动执行）

待 C2 可恢复性实证后，另行认证软件包外部发行材料及解释器/loader 和实际 Guest 的路径链接映射，并批准只读 Guest root-anchor 预开与观察脚本的**精确源 SHA、root-private 目录、命令、身份/权限、输出位置、负例和清理**。B2B2-B 解析结果仍只是候选；**真实** Operator/Bootstrap、CPython import hook、`sys.path`、ELF `PT_INTERP`/`DT_NEEDED`/`RUNPATH` 与 `dlopen` 的实际消费和传递闭包由后续 B4B-3B-2B3 / 3C 独立见证，不能借 C2 恢复验收把 C1 关掉。

### 7.4 验收矩阵（待执行，不是测试结果）

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
| C2-01 | 新鲜 Host/Guest/磁盘/网络/挂载/凭据隔离证据 | 全部准确、跨侧核对；不确定则 STOP | 原始 Host/Guest 文件+rc+hash |
| C2-02 | 指定恢复对象的实际 snapshot restore | 恢复前后版本与唯一差异标记有独立 readback；失败即 STOP | 克隆映射/恢复日志/原始 hash |
| C2-03 | 10-17 旧 8/8 原始证据 | 保留历史实验，明确 NOT RESTORED/离机原件未证实 | 历史条目不改写 |
| LIVE-01 | 真实 Guest alias / loader / 发行包与独立外部 pin | 每条 logical→FD→bytes→source pin 可复核 | C2 通过后另批准采集；仍非 C1 PASS |
| LIVE-02 | 动态 import、ELF/dlopen 完整消费及独立 witness | 同候选完整一致；缺口 BLOCKED | 后续 B4B-3C，不在 B2B2-B 源码范围 |

### 7.5 下一源码切片与集中审批分组

**下一源码批（B2B2-B；当前仅供批准，不执行）：**新增独立、外置 `ops/runtime/root_python_dependency_alias_fds.py` + `ops/runtime/tests/test_root_python_dependency_alias_fds.py`；仅专用 `root-FD+nofollow link/FD` 解析及非授权轨迹；使用现成 manifest、B2B1 / FD observer 的严格合同和 R0 门禁。临时私有 Linux 文件树聚焦正负测试，不执行真实候选，不调用任意路径/网络/子进程/Guest/root/生产写入；不修改旧 nofollow、observer 重复 inode 策略、17 项 Bundle、安装器/备份/运行服务、依赖/锁/Prisma。路径语义扩展是**专项架构扩展**，需批准上文 §7.2 的白名单/相对目标/预算/重复 inode 拒绝及 fail-closed 边界后才可编码；若真实 Guest 布局证明与本节不相容，退回专项评审，不猜测兼容。

**CI（获得首次远端授权后）：**`.github/workflows/ci.yml` 的 `ops-checks` 选择 Runtime+Release：`bash -n ops/verify-runtime-readiness.sh` 与 `python3 -m unittest discover -s ops/runtime/tests -p 'test_*.py'`；`python3 -m unittest discover -s ops/release/tests -p 'test_*.py'`，以及 `ci-change-scope` / 汇总检查。无关 Web/E2E 按范围跳过，CI 合成 PASS 不等于 Guest/C1/C2。MCP-workspace 不运行 lint/build/test。

**审批批次独立：**

1. **本轮文档交付：**审阅本文件及 #2859 同批记录校正；授权前不推送/PR/合并。
2. **B2B2-B 源码边界：**仅批准受限新模块及合成测试；如无法接受提议预算/相对目标语义，则保持严格 no-follow BLOCKED、不得先写代码。
3. **C2-0 只读取证：**核准实际 Host/VM/Guest 与逐条命令和原始日志保管位置；不授权 snapshot/Guest root。
4. **C2-1 恢复演练：**基于 C2-0 的**精确 VM UUID / snapshot UUID / medium / 保全方案**，单独审批会回退磁盘状态的 restore 和各副作用；不删除旧 VM/snapshot/日志。
5. **C2-2 / B4B-3C Guest root：**满足 C2 后，另交精确脚本 SHA、命令、root-owned 安全路径、独立 pin/witness 和失败保全清单，经新的许可才执行。
6. **生产 G2-E：**R1–R5 同候选证据及 C1–C8 门禁全部满足后独立审批；当前始终 **NO-GO**。

**原 §7 仅设计评审批不修改：**任何 `ops/runtime/*.py` 源码/测试、17 项 Bundle、业务代码或 Prisma、依赖、`sudoers`、现役备份 timer、生产 VM/runtime、Guest/root/快照、远端 Kit/Cloud 权限或真实凭据。生产 installed Runtime / app SHA 本轮未重读，不能使用 `dev` SHA 代替。

## 8. 2026-10-18 — B4B-3B-2B2-B1 合成受限 FD 开链本地实施（待审阅）

**基线：**PR #2860 / CI #7350 已合并的 `origin/dev@c9bfa566d7892042b23508889c95a11334159f5b`；本地分支 `feat/c5-g2-b4b3b2b2b1-controlled-alias-fds-20261018`。**状态：LOCAL SOURCE + SYNTHETIC TESTS AUTHORED / NOT RUN / NO PR / NO GUEST / C1/C2 OPEN**。用户只授权 B2B2-B1 独立解析器与合成测试，**未授权 B2B2-B2 的 Guest/独立来源采集、C2 快照恢复或生产执行**。§7 的待批准状态是设计批历史，不应冒充本批当前进度。

**新增源码：**`ops/runtime/root_python_dependency_alias_fds.py`。仍从调用方提供的**未经认证** root directory FD、B4B-3A manifest/digest 和提出的 file pins 出发，读取逐路径的**精确声明** `proposed_exact_links`（仅作为输入约束，不接受其为外部认证）。目录和普通文件使用 `O_PATH | O_NOFOLLOW` 固定当前条目并逐段核对，symlink 使用 `O_PATH | O_NOFOLLOW` 持有链接 FD，调用 `os.readlink("", dir_fd=link_fd)` 读取**持有的同一个链接对象**，不对路径执行 `realpath` 或调用普通 `os.readlink(name)`。校验链接文本完全一致、类型/owner/权限/FD metadata，展开绝对目标相对于 root FD、相对 `..` 仅在当前 root-FD 内归一，未知/越界/循环/超限拒绝。最终普通文件再次用只读 `O_NOFOLLOW` 打开且与 O_PATH entry FD 同 inode，持有到借出上下文结束；路径字串仅为非授权轨迹，不允许调用方重开。

**限定预算（B1 合成候选合同）：**最多 64 个逻辑文件、每条解析路径 12 段、单文件 32 MiB、总声明字节 64 MiB、每文件最多 8 跳 symlink、单跳文本和路径最多 256 ASCII bytes、最多 8 条精确 link 声明，所有借出路径合计最多 768 个 held FDs；全部受限且不按真实 Guest 失败自动扩大。**Mount 判定：**严格要求 `st_dev` 与 root 一致，另要求 Linux `/proc/self/fdinfo/<fd>` 的真实 `mnt_id` 在 anchor/每个链接/目录/最终文件一致，且 `/proc/self/ns/mnt` 在借出前后不漂移；缺失 mount ID、procfs 不可观测、同设备 bind mount/不同 mount、任何 metadata/path link 改动均 fail-closed。这里的 mount ID 只提供合成路径观察约束，**不是外部 witness，也不证明整段借出期间完全无竞态**；无需引入 `openat2`/`statx` 原始 syscall/ctypes 或额外依赖，此决定不声称内核机制比设计基线更强。未来 Guest 如需可靠独立唯一 mount 标识，另审实现。

**合成测试：**`ops/runtime/tests/test_root_python_dependency_alias_fds.py` 仅在 Linux 使用临时私有模拟目录：`/lib64 → /usr/lib64`、`/usr/lib64/ld-linux... → ../lib/...` 的目录+leaf symlink、可选 `/lib → /usr/lib`、真实借出的只读 FD 交现有 observer 获取依旧 `BLOCKED` receipt；同时覆盖 B2B1 原 strict opener 继续拒绝链接，未登记/错误/冗余 link、root 越界、循环/跳数、owner/mode、FIFO、hardlink、借出后 inode 替换、mount ID/namespace 漂移、pin 不一致与 FD 清理。所有内容为人工字节，**没有真实 Python/ELF 执行，也没有 root/Guest 操作**；workspace 无 test/lint/build 权限，当前尚无测试成功证据。

**权限/架构：**B2B1、B3A、FD observer/offline reviewer 保持原样，原 17 项 Runtime Bundle 与入口无变化；不改变任何业务 owner、模块边、HTTP/DB/API/Prisma、CI workflow、lockfile/sudoers、真实配置或备份服务。返回结果始终 `decision=BLOCKED`、`readyToInstall=false`、`authorizedToMutateProduction=false`、root/外部 pin/动态依赖来源未认证。下一步经用户审阅才允许提交远端跑 `.github/workflows/ci.yml` 的 `ops-checks`；最终仍须 **C2-0/1** 真恢复证据后单独批准 **B2B2-B2** 的准确 Guest/root/witness 操作，**C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED**。
