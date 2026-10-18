# C5-G2 / R1 B4B-3B-2B2 — Ubuntu usrmerge 别名与可信根锚设计评审

**日期：**2026-10-18（America/Toronto）。**设计交付：**PR #2858 / CI #7346 / dev merge `c9db47b74854c96e71879b38a69a1e2fe8e8d91a`。**后续 B4B-3B-2B2-A：**本地纯内存原型已编写，未运行 CI，待本地审阅；下一批 B2B2-B 实际路径/FD 解析仍需独立架构评审。  
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

## 5. 2026-10-18 — B4B-3B-2B2-A 本地纯内存模型（未验证）

从 `origin/dev@c9db47b74854c96e71879b38a69a1e2fe8e8d91a` 新建 `feat/c5-g2-b4b3b2b2a-inert-alias-contract-20261018`。根据继续下一阶段的要求，**只实现 B2B2-A 合成声明的范围**：新增 `ops/runtime/root_python_usrmerge_alias_claims.py`，复用原 B4B-3A 的 manifest/pin 结构核对，仅接受最多 2 项、完全匹配既定合成形状的前缀关系 `/lib`→`/usr/lib` 与 `/lib64`→`/usr/lib64`；最多 64 个候选文件、2 次声明替换，拒绝额外字段、重复、非法目标、未使用的别名、目标碰撞。输出保留逻辑路径与**仅由调用方声称的**替换结果，永远 `decision=BLOCKED`。这两个路径映射是**合成示例而非实际 Ubuntu/发行包证据**；不会解析更深层 loader 文件 symlink、相对目标、真实 inode 或运行时 namespace。

新增 `ops/runtime/tests/test_root_python_usrmerge_alias_claims.py`，用纯内存人工 manifest 测试声明一致、双前缀、非法路径/伪造权限、pin 漂移、超过预算、Bundle 排除以及不变更输入。MCP-workspace 无 lint/build/test 执行权限，**测试源码已写但本地/CI 均未运行**；今后经审阅授权远端交付，由 `.github/workflows/ci.yml` 选中的 `ops-checks` 执行 `python3 -m unittest discover -s ops/runtime/tests -p 'test_*.py'`。

**归属及安全不变量：**外置 Runtime/Ops 候选声明组件；未修改 B4B-3A、B4B-3B-1、B4B-3B-2A、B4B-3B-2B1 的实现或入口，没有文件系统打开/`readlink`/`realpath`、网络/子进程/root/Guest/写操作，不修改 Runtime 17 文件、公共 API、CI、依赖、数据库或权限。不可把提出的替换路径交给现有严格 no-follow 开启器作为已认证输入，所有信任/安装状态继续 false。

**后续 B2B2-B 需独立审阅：**真实 Guest/发行版路径布局和 root-anchor 的非自证来源、有限 `readlinkat` 风格的 FD 对照、loader 内层 symlink、同 inode 别名冲突、mount/namespace/竞态约束及独立外部 hash pin；首次真实 privileged Guest 命令仍需先通过 C2 快照恢复并获得精确操作授权。**C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED**。
