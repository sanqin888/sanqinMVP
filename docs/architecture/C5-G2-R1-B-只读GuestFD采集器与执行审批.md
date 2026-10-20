# R1-B S4/S5 只读 Guest FD 采集与 R1-C S6 准备

**2026-10-20 最新状态：SOURCE MERGED / S5 CAPTURE COMPLETED / ORIGINAL-EVIDENCE REVIEW PASS_SCOPED；R1/C1 OPEN。**
[PR #2885](https://github.com/sanqin888/sanqinMVP/pull/2885) 最终 head `0533c209a9a34a2f33902ef9731a9a5053f9537c` / [CI #7405](https://github.com/sanqin888/sanqinMVP/actions/runs/39455730047) success，squash merge dev `8a99c99eb17a3ff27552e3b0f611204691e72984`。此前源码 head `523a973c` / CI #7404 的 Runtime 465 与 release 45 测试只记录合成软件验证。
**§1–§5 保留源码准备时的历史状态和执行前要求；其“未取原件/未执行/未批准”停点已由 §6 的实际批准、执行和离机复核续记更新。** 原源码分支为 `feat/runtime-r1b-readonly-guest-capture-20261020`，基线 dev `ac5fcfef`；本次文档续记不修改采集器或原回执。
S5 只批准并完成这一次准确暂存与 root 只读取证；它不授予新的 root、正常更新、安装或生产权。R1-C 就绪准备见 [S6 工作包](C5-G2-R1-B-只读GuestFD采集器与执行审批.md#7-r1-c-s6-就绪审计与实施拆分)。

## 1. 前置证据与状态

- B2-1C PR [#2883](https://github.com/sanqin888/sanqinMVP/pull/2883)，最终 head `15e6ff4bb3643303d522cdc5634d1a3dfb082c4e` / [CI #7401](https://github.com/sanqin888/sanqinMVP/actions/runs/39442850626) success，squash dev `ac5fcfef2ab43489a9b35be7048c93b1b2d31b6a`；Runtime 436 与 release 45 项测试 OK。
- 操作员用该固定版本在 Mac Python 3.14.8 / zstd 1.5.7 重放封存七包；七条 data.tar 哈希与前批独立技术复核一致，四包的三个目标 regular 与三条 link text 候选匹配。其余三包只验证完整 data.tar 解码/哈希，不冒称新增成员 pin。
- 已实际读取私有 `B21C-REPLAY-001-review` 原件：13,813 bytes、归档 SHA `d692d1b943165f732e8053203e8fa670eb1bf7776b67e155f1212943881a8590`；回执 SHA `a8b33d5defcc9408ccc275b15b24006c60fd08781339c8cabfa0a1ce3d0de8bf`；五个 manifest 条目逐项重算一致，参考 pins、外置采集脚本与交付版本逐字节一致，两个 Runtime 源码快照与冻结 Git blob 对应。没有在审阅容器运行仓库测试或重新执行该 Runtime 读取器，不将操作员实测冒称第二次独立执行。
- R1-B 非 root 预检：`HOST-R1B-PRECHECK-001` 记录关机；开机后 `HOST-R1B-PRECHECK-002` 回执 SHA `939cc24469c9da26f0d6276d8bc6a88334a85901a1bef0cd499ed03f00b498ff`，操作员贴回完整 manifest OK 与 running/目标 VM/磁盘/host-only 隔离摘要。
- `GUEST-R1B-PRECHECK-001` 回执 SHA `daa189febe3f4a5b82abb8bb15cbcc0ca028e09f87c62d184e59ff585bcb9c1a`；操作员摘要 collectionCompleted=true/failure=null、UID 1000，前后 boot ID/mount namespace 稳定，rootfs UUID、root 元数据、三个链接及八个已装包版本与前批候选相符。**本批尚未取得这两批预检原件，Guest manifest 校验输出也未贴回；只记 OPERATOR SUMMARY MATCHED，不记原件独立 VERIFIED。** 现场身份和 boot/ns/路径不复制到 Git。

`rw,relatime` 是文件系统挂载属性，与采集器打开 O_RDONLY FD 不同；本批不执行 remount。软链接常见 mode 0777 不代表父目录可写，仍检查 FD/link text、父目录 owner/mode、inode 和 mount identity。历史回执保留，不因 30 分钟 Host 新采集前置校验而作废；实际 root 执行前再刷新必要现场信息，不在源码准备期间循环重采。

## 2. 所有权与实现

新增 `ops/runtime/root_python_r1b_guest_capture.py`，归 Runtime/Ops，独立 CLI，不导入生产 installer、17 Bundle、API、Docker 或备份流程。

1. CLI 仅接受 Linux x86_64、Python 3.12.3、real/effective uid/gid 全 0 和 `-I -S -B`。不 sudo、不安装、不联网、不运行 subprocess，不执行包内 Python/ELF 或维护脚本。
2. 源码集合 index 与 proposal 都需事先独立固定 SHA。逐级持有 root-owned nofollow 祖先 FD，拒绝 group/world writable、setuid/setgid、软链接路径和多硬链接文件；index/proposal 的直接父目录须 0700、文件须 0600。六份源码先全部读取并逐一核对哈希，再从这些冻结 bytes 加载原合同模块，拒绝未知/缺失模块或 collector 路径不符。初始 collector/解释器启动前的安全暂存和验证是外部操作员责任，运行时自校验不是自举信任证明。
3. 对真正的 `/` 建立 O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC FD，核对 root inode/device/owner/mode、boot ID、mount namespace 与 proposal；用 procfs fdinfo 的 mnt_id 和 mountinfo 的 device/root/mountpoint/fsType/source 交叉对应。根 FD 禁止 O_PATH 代替可读 FD。挂载 options 原样记录并在会话前后比较，不要求只读挂载。
4. 保持 B2B2-B1 原入口与拒绝语义。其两项准确 links 是 `/lib64 → usr/lib64` 和 `/usr/lib64/ld-linux-x86-64.so.2 → ../lib/x86_64-linux-gnu/ld-linux-x86-64.so.2`；同一次有界 context 将其借来的三个 regular FD 直接传给原 B3B1 observer，以 pread 得到字节摘要并与 proposal pin 对照，之后执行原 B1 的退出重检。无 realpath→open 路径重开。
5. `/lib → usr/lib` 不在这三个逻辑文件的 B1 遍历路线中；它在同一会话单独以根 FD 相对 O_PATH|O_NOFOLLOW 的 symlink FD 读取，持有并重检 entry/inode/text/owner/mount。它记录为外层 `extraRootAlias`，**不**塞入 B1 的 used-links 集合或改变既有 Guest packet v1 schema。
6. 使用现有 `build_claimed_guest_packet` 组装 B1/B3B1 的候选 packet，外层 R1-B v1 receipt 记录实际 root collector 启动状态及失败。成功也永久 BLOCKED、所有来源/root/消费/安装授权字段 false。B3B1 的 `rootExecutionAttempted=false` 仍指没有执行候选依赖字节；外层 `collectorRanAsRoot=true` 单独表达采集进程提权，不混淆两者。

本批限定三个候选文件：Python executable、os.py、ELF loader；没有生成完整 Python/native 传递依赖闭包。proposal 的 VM/disk/snapshot/rootfs UUID/OS 身份为外部预检声明，rootfs UUID 本批没有独立 blkid/Host 物理映射认证，mount ID 则由当前 FD/procfs 观察取得。即使自报匹配，也不把它们提升为物理来源或 Guest root 信任认证。

## 3. 输入与输出合同

源码 index v1 字段为 schema、repoCommitSha、files；files 必须恰好为：
- root_python_r1b_guest_capture.py
- root_python_dependency_manifest.py
- root_python_dependency_alias_fds.py
- root_python_dependency_fd_observer.py
- root_python_dependency_offline_review.py
- root_python_dependency_guest_evidence.py

proposal v1 字段为 schema、sessionClaims、manifest、manifestSha256、filePins、mountRecord。sessionClaims 沿用既有 Guest session 字段，去掉实时观察的 rootMountId/observedAtUtc；filePins 必须恰好覆盖上述三个路径；mountRecord 固定 device、mountRoot、mountPoint、fsType、source 并要求 ext4 根挂载。准确 proposal、源码 index 与两个外部 SHA 必须在 CI 后用最终冻结源码生成，不能现在填猜测 hash 或复用过期 boot 值。

保留 B1/B3B1 的 64 文件、单个32 MiB/总64 MiB、链接/组件/FD 上限；本 CLI 再缩为恰好三个文件。源码单文件≤64 KiB，JSON≤512 KiB、proc mountinfo≤1 MiB，最终 stdout receipt≤2 MiB。CLI 不写 Guest 文件，只向 stdout 发出一次 JSON；捕获失败退出 2 并记录 failure，不尝试修复机器、重试换 pin 或恢复业务。输入 CLI argv 语法错误仍由 argparse 非零退出，由未来 Host wrapper 保存原始 stderr/rc。

## 4. 聚焦测试和验证状态

新增 tests/test_root_python_r1b_guest_capture.py：临时非 root Linux 目录中的不可执行虚构 bytes，真实 B1→B3B1 FD 交接、两个 loader links、额外 /lib FD、元数据和摘要漂移、namespace/root 身份错、root link 替换、保留 unused-link 拒绝、错误 root FD、来源 index/全文件 hash/路径约束、重复/非有限 JSON、有界读取、私有权限/硬链接/owner 拒绝、普通用户 CLI 拒绝、失败回执，以及 mock root CLI 的完整成功 packet 组装且所有 authority false。

测试不会执行真实 Guest/root、包内字节、sudo、网络或生产目录写入。合成正向只证明程序内部行为，不是实际 root 来源认证。
**MCP-workspace 未运行 lint/build/test，也未在外部环境代跑仓库测试；上述 GitHub Actions 已实际验证源码 head 的 Runtime 465 项和 release 45 项。没有真实 Guest root 采集。**
授权远端后由现有 ci.yml ops-checks 运行全部 Runtime 离线测试，不新增/削弱 CI 或依赖。

分类 A 类新增内部候选工具：同 Runtime/Ops owner，不改既有 B1/B3A/B3B1/Guest v1 入口与语义，外层新 v1 receipt 没有现役消费者。无双读、过渡 facade 或兼容登记新增；无 owner/应用导入/依赖边/SCC/scanner baseline、Prisma/migration、lockfile 或 17 Bundle 变化。

## 5. 执行审批前仍须完成的具体工作

1. 源码静态审阅 → 用户授权远端 → 本批最终 head 的 PR/CI 全绿 → dev 合并。
2. 从最终 commit 生成六份准确源码/源码 index/proposal，离机核对 SHA；在指定 recovered Guest 以已批准命令暂存 root:root/0700/0600，验证解释器及 source/input 全部祖先，冻结 env 白名单/原生加载器环境与完整 argv；-I/-S/-B 不能独自证明原生加载器及完整 stdlib/native 依赖可信。不能直接以 root 执行用户可写 Downloads/共享目录/未审阅 Git 工作区。
3. 独立 Mac wrapper 留在仓库外单独交付；它必须保留 Host/Guest 原始 stdout/stderr、inner/SSH outer RC、UTC、源码/参数 SHA，处理 SSH 与 sudo 密码而不写入回执，校验新鲜 Host、主机密钥及目标身份；不能用混入终端提示的文本冒充原始 JSON。本批尚未实现/执行该 wrapper。
4. 执行前核对准确 VM/盘/boot/rootfs/namespace、root mnt_id 与 isolation、外部包 pin、失败冻结/证据保存路径，形成最终逐条权限/命令清单并取得实际 root 执行批准。
5. 第一次真实 root capture 后，对原件、Host 预检和经独立复核的包来源做离机三侧审阅。无成功就不进入 R1-C；完整动态消费、正式正常更新执行器与 C1 独立裁定仍另行完成。

因此本版没有可立即复制执行的 sudo/SSH root 命令，也不要求操作员此时重采 Guest、升级 Guest Python、改 mount、创建 sudoers 或更改 VM 设置。C1/R1 OPEN、G2 NO-GO、S2 daily PAUSED，C2 保持既有有限 CLOSED。

## 6. 2026-10-20 — S5 准确批准、一次成功采集与原件复核

### 6.1 批准及失败保全

用户在独立准备包交付后明确授权「S5 暂存与一次 root 只读取证」。PREP 原件归档 SHA256 `cec930bdcfea32ae663d17c9f37f6b54875e37a6b3ebafec3aecab253517d994` 已读取复核：外层 70 项、Host 15 项、Guest 45 项清单、原始命令/回执/源码索引及既有来源 pins 匹配；原来的“只有操作员摘要”停点已补齐为原件技术核对，不扩大平台/独立见证真实性。

CAPTURE-001 保留了已暂存 incoming 和 rootCommandSubmitted=true，但实际 root SSH 返回 255、stdout 为空、stderr 为准确 Permission denied 认证错误。已读取其失败原件归档并核对 23 项 manifest，确定这条连接未启动远端 root 命令；没有通过覆盖输出目录或删除暂存来重跑。CAPTURE-002 操作员回传显示 incoming verification 的 SSH 认证失败、rootCommandSubmitted=false；002 原件未上传，不冒称已独立复核其归档。

仓库外 RESUME-v2 复核准确 001 失败链并只读验证/复用原 incoming，批准计划 SHA256 为 `45380611a6799f1c350f32ac33c881024eba0ba467db5850ec860ec134fa109a`。root-command SHA256 `2e8bfa81f4df8a1299b4d153e3681a93b3549bd0c0744a0226e6a270e74e38be` 与 v1 相同，仍限定八个输入的 root 私有暂存和原采集器；没有扩大为第二次成功 root 执行许可。密码由操作员交互输入，不写入证据或 Git；四条独立 SSH 登录与一次 sudo 密码输入分别处理。

### 6.2 成功原件链

| 对象 | SHA256 / 结果 |
| --- | --- |
| CAPTURE-003-review 归档 | `7d33106d340df9727276a969f12925852f6ab9ecc5542ff6ab88b9e8a3300ab9`，18,758 bytes |
| SHA256SUMS | `b9f819e20ac00d589ade3a4250ba3dc9e510fdb72ba795198f077fe0a783184a`，27 项全部重算一致 |
| Mac receipt | `94c23cb2abb0e6118aed8706823e9fa1ea0a9129f19bdca5e221cfc0c2614c89` |
| Guest collector receipt / 原始 stdout | `2a193cb976e48590f554bdb8e440c7c4f4061cba8a2dc9f901184507898cb955`，逐字节相同 |
| source-index | `e3e2bda4fbc26ef53c41c264c6472c4b43f45d5a26c111688b7bad8de7ca9d05` |
| proposal | `52912c7531c75dd27d47fcf6af81f955f86eb333492befcb9307cb83c1606195` |
| SSH outer / root command / collector | `0 / 0 / 0`；两个 inner 标记唯一，complete=true/failure=null |

归档 28 个普通文件及其路径/集合已核对，无链接、重复成员或路径穿越。plan/wrapper-source/root-command 与交付版本逐字节一致，六份源码/index/proposal、SSH 主机密钥和 prior failure chain 均匹配。七条命令的完整 argv、原始 stdout/stderr 摘要、RC 与 Mac 本地顺序匹配；root stderr 是 UID 0、三个系统文件和八个 root 暂存输入的 OK 校验及成功标记。

Mac 回执 collectionCompleted=true、rootCommandSubmitted=true、remoteRootCommandStarted=true、guestIncomingReused=true、guestIncomingWritten=false；Guest collectorRanAsRoot=true，real/effective uid/gid 全为 0。原 incoming 未重写；本次准确批准的 root 私有暂存/采集已完成，不再运行 capture。001、002、003 均须保留，不因最终成功删除失败证据。

### 6.3 限定三侧核对

三个 FD 的 Python executable 8,020,928 bytes、os.py 39,786 bytes、loader 236,616 bytes，合计 8,297,330 bytes；各 SHA 与 [S1 §9.3](C5-G2-R1-S1-独立Ubuntu签名验真采集程序.md) 已独立复核包成员匹配。终点 device/inode/mount 与 alias trace、根 FD context 一致；实际 mnt_id 由 FD/procfs 观察，非从 proposal 猜测。loader 两条 used-links 与单独 /lib alias 均匹配既有包成员原文，未改变 B1 的 used-links 集合。packet 与 rawObservation 的 FD/alias 记录完全一致。

三次 Host 输出及两次原生 Guest 预检分别逐字节相同；目标 VM/盘/snapshot、rootfs 声明、boot/ns、根元数据、平台与原方案匹配，Host-only/其余 NIC none/无共享目录及禁用剪贴板/拖放符合批准记录。该核对不扩张为完整路由/防火墙隔离或物理 root 来源认证。现场 UUID/boot/ns/路径保留私有原件，不入 Git。

Mac guest-root 调用为 17:36:21.767219–17:36:35.653106 UTC，Guest collector 为 17:35:55.859988–17:35:55.921881 UTC。**两端时钟存在偏差，不能拼接为统一 UTC 时间线。** 各自记录有序及同会话字节/退出标记匹配成立；不把跨机时间相减当成真实耗时，也不为此改时钟或重采。既有包来源基线本轮只做交叉比较，未重新运行 GPG 或软件包读取器。

### 6.4 裁定与接续

**S5 CAPTURE + ORIGINAL-EVIDENCE CONSISTENCY = PASS_SCOPED。** 采集由操作员执行，离机复核核对原件；没有在审阅环境重复执行 collector/仓库测试，不声称另一主体独立现场见证。所有原始 trust/closure/installation/production authority 仍 false、decision=BLOCKED；外层 root collector 成功与内层未执行传入候选 FD 的消费语义分别保留。

R1/C1 OPEN、G2 NO-GO、S2 daily PAUSED、C2 既有限定 CLOSED。下一步进入 [R1-C S6 就绪与首批源码范围](C5-G2-R1-B-只读GuestFD采集器与执行审批.md#7-r1-c-s6-就绪审计与实施拆分)，完整 import/ELF/dlopen、正式正常更新入口及独立 C1 裁定均未完成。本轮只更新文档，用户已授权将本续记与 R1-C 准备包一同提交；最终 CI/合并以本批 PR 为准，S5 的批准不延伸至新执行命令。

## 7. R1-C S6 就绪审计与实施拆分

**日期：2026-10-20（America/Toronto）；状态：READINESS AUDITED / EXECUTOR AND LIVE S6 NOT IMPLEMENTED / DOC-ONLY DELIVERY AUTHORIZED。**
分支：`docs/runtime-r1c-readiness-s5-closeout-20261020`；基线 `origin/dev@acd7f19311bd1117aab4f67f3c293f1a47d8758e`。本轮完成 S5 证据收口和 R1-C 实施拆分，无新源码或现场执行；用户已审阅并授权本批远端交付，最终 CI/合并以本批 PR 的实际 head 检查与事件为准。

### 7.1. 目标与现行决策

上位合同为 [R0 D1–D5、C1–C8 与 R1–R5](Runtime更新-R0冻结设计.md)、[S1 的 R1-A/B/C 队列](C5-G2-R1-S1-独立Ubuntu签名验真采集程序.md)、[R1-B S4/S5](C5-G2-R1-B-只读GuestFD采集器与执行审批.md)。R1-C 对应 S6 / B4B-3C：确定正式正常更新执行器、证明其实际 CPython import、ELF PT_INTERP/DT_NEEDED/RUNPATH、dlopen 及传递依赖消费与认证字节一致，提交独立 C1 裁定。

R0 D1 已明确接受受控云账户/虚拟化平台、内核和 root 管理为有限信任前提，不递归证明内核。旧故障机 clean-reinstall 自举闭包已退出首版关键路径。C2 已有限 CLOSED，不重做恢复实验或强制 Marker A/B。后续维护冻结、AWS 代码快照、安装和同候选矩阵仍归 R2/R3/R4/R5；本包不重开这些设计、不改变其顺序，也不授予运行权。

### 7.2. 进入本阶段的证据

- R1-A 准确七包对象的签名/索引/包内成员已完成技术原件复核；人工文档确认仍 LIMITED，R1-A 整体与 C1 未关闭。
- R1-B 源码 PR #2885 最终 head `0533c209a9a34a2f33902ef9731a9a5053f9537c` / CI #7405 success，合并 dev `8a99c99eb17a3ff27552e3b0f611204691e72984`。源码阶段 CI #7404 的 Runtime 465 与 release 45 测试仅证明合成软件行为。
- 用户随后明确授权 S5 暂存及一次 root 只读取证。成功批次 `R1B-S5-CAPTURE-003` 的归档 SHA256 为 `7d33106d340df9727276a969f12925852f6ab9ecc5542ff6ab88b9e8a3300ab9`；27 项 manifest、准确计划/源码/命令、原始 stdout/stderr 与三层退出码交叉核对通过。
- 同会话三个 FD 共 8,297,330 bytes，哈希与既有独立包成员基线匹配；loader 两条 used-links 与单独 /lib alias 匹配。Host、Guest 原生预检及 root FD context 一致性通过，证据详情统一见 R1-B §6。
- Mac 与 Guest UTC 有偏差；只保留各自时间线和命令/摘要/会话关联，未认证跨机统一时钟。
- 本次 root 执行已完成；不重跑 capture、不改写 001/002/003，S5 的批准不延伸到新的动态执行命令。

### 7.3. 当前源码审计发现

| 已审阅实现 | 当前真实能力 | 对 S6 的意义 |
| --- | --- | --- |
| `runtime_update_contract.py` | 惰性正常更新声明合同，明确不认证证据、不安装或执行命令 | 可复核不变量；不能作为真实更新入口 |
| `prepare_runtime_update.py` | 来源核对和非活跃私有暂存，明确没有 activation/服务写操作 | 可评估有限复用；不能将其单独运行等同完整正常更新 |
| `offline_root_private_installer.py` | 限定 /tmp 合成 fixture 的交接内核，无生产入口 | 保留 lab guard；不能删除限制直接升级为正式安装器 |
| `isolated_maintenance_operator.py` | 合成 HostAdapter 的隔离维护模型，无真实 Docker/systemd 接线 | 失败保持冻结的规则可复用审阅，生产维护实现仍归 R2 |
| `root_operator_execution_binding.py` | 调用方字节/claimed FD 的纯模型，不编译或执行 | 同 bytes 对象不等于真实解释器已消费这些字节 |
| `root_python_elf_static_hints.py` | 有界 AST/ELF 静态线索，永久 BLOCKED | 用于发现遗漏的提示；不能证明实际动态闭包 |
| `root_python_r1b_guest_capture.py` | 三个固定候选文件的 root-held FD 读取与回执 | 给出起始字节/路径基线；不观察完整解释器和进程生命周期 |

**主要缺口是尚无可冻结的正式正常更新执行入口与完整场景集。** 不能先对无关“hello/import 演示”取得跟踪结果，再转称正式执行器认证。现有七包也不覆盖已知静态线索中的全部 libm/libz/libexpat/libc 与可能的运行期加载对象。

### 7.4. 首批源码的明确范围：R1C-1 执行入口与场景冻结

下一源码批先实现正常更新流程的同一受限核心及其可审阅入口材料；首批不接真实维护、AWS 或活跃路径写入。具体文件/API 在源码批开工前根据现有合同审阅确定，当前尚未建立该入口。

需要在该源码批交付：

1. 明确未来 R4 将实际调用的核心入口和源码闭包、执行阶段及能力边界；所有 Host/快照/活跃交接效果使用明确能力接口，缺少能力必须拒绝。不得创建长期并行的“认证用假执行器”和“生产用真执行器”。
2. 在同一核心上定义来源拒绝、私有准备、交接前拒绝、正常交接、交接后失败和中断保全场景，明确哪些仅合成覆盖、哪些必须后续真实演练。R2/R3 的前置证明未成立时不能越过活跃写入边界。
3. 冻结待审的完整启动材料：候选 commit、逐文件 SHA/大小、解释器和隔离 flags、完整 argv、env 白名单、cwd、uid/gid、输入归属/权限及子进程清单。准确值由该批最终 CI 后生成，不能复用 S5 计划或猜测 hash。
4. 保持既有 B1/B3A/B3B1/Guest v1 与 17 Bundle 不变；不修改实验 guard、不给模型布尔值授信、不恢复旧事故事务或在失败 finally 中恢复业务。
5. 编写能验证阶段顺序、越权拒绝、能力缺失、失败冻结和中断语义的聚焦合成测试。现有 Runtime/release CI 承担验证，不能把 mock 合成成功登记为 S6 真实消费完成。

R1C-1 的有限核心软件测试可以先准备，但 **C1 的真实关闭必须等待最终实际执行器候选及其完整真实路径已存在并验证**。为避免“R1 等 R4 实现、R4 等 R1 通过”的循环，S6 前必须在 R1-C 的后续源码准备中冻结同一候选的完整入口和 effect adapters；这是提前准备待审源码，不是提前执行 R2/R3/R4 的维护、快照或安装。首批纯核心/模拟能力测试本身不能关闭 C1。最终同候选的受控隔离验证方案另交准确审批，R4 实际执行仍按 R0 队列；若届时修改源码、启动环境、依赖或行为场景，必须先重新打开并核验相应 C1 消费证据。不得将早期合成核心的 profile 转移为后续正式接线的认证。

### 7.5. R1C-2 观察器选型与证据合同

选型前先提交覆盖矩阵，不在本 doc-only 批次增加系统工具、第三方包、audit 配置、内核探针或 Guest 权限。观察方案须覆盖下表；不能覆盖的阶段明确 BLOCKED，不能用多份不完整日志拼成已验证全闭包。

| 必须观察的对象/阶段 | 要形成的证据 | 单项不足以证明的材料 |
| --- | --- | --- |
| 解释器启动前至退出及全部受控子进程 | 进程身份、父子关系、exec、候选启动材料、事件序号和丢失/截断状态 | Python 启动之后才安装的单一 hook |
| CPython 真实模块消费 | 模块名、origin/loader、源码/pyc/native 或 frozen/builtin 分类、实际输入字节绑定、环境和场景 | 仅 AST、sys.modules 最终快照或 import 名称 |
| ELF 与运行期 native 加载 | 实际解释器/loader、DT_NEEDED 搜索结果、RUNPATH 影响、dlopen/dlclose、实际映射/文件身份 | 仅静态 SONAME、一次 maps 快照或成功 open |
| 被消费的真实文件 | logical/canonical/alias、namespace/mount、device/inode、元数据与稳定字节摘要 | 执行结束后重新按路径打开再 hash |
| 外部认证来源 | 每个实际文件到准确包/发行链和 source pin 的映射，非包文件单列来源 | 只用本机 dpkg 所属信息或采集器自报 SHA |
| 未消费路径和拒绝分支 | 已冻结场景集、动态代码/条件分支策略、未知加载的拒绝 | 一次成功路径覆盖全部潜在输入 |
| 离机保管与审阅 | 原始事件流/命令/退出码、严格预算、摘要、顺序和独立复核来源 | collector 自写报告的再次读取 |

必须纳入 bootstrap 依赖、观察器本身、其所调用工具及 native 扩展；按 R0 有限信任前提闭合，避免依靠观测脚本自证全部依赖。冻结字节仍需运行时污染/替换窗口控制；连续新消费者/写入者排他归 R2，S5 两次 stat 或 root FD 回执不能替代。

原始记录须区分完整、未知与拒绝；发生事件缺失、未绑定文件、摘要漂移、来源缺口、未覆盖动态加载或命令中断，保留原件并拒绝。各阶段新回执可采用独立版本，但原有永久 BLOCKED 回执不得改写成授权凭证。

### 7.6. 依赖补齐与现场执行顺序

| 顺序 | 交付 | 进入下一步的条件 |
| --- | --- | --- |
| R1C-1 | 同一正常更新核心、启动材料与完整场景合同，源码/测试 PR | 审阅与准确 head 的 GitHub CI 完成；仍无现场执行权 |
| R1C-2 | 观察器覆盖/信任/预算/丢失事件设计及最小源码 | 选型成立，必要依赖或权限变更已按范围批准 |
| 完整执行候选冻结 | 同一正常更新入口、完整 effect adapters 与全部场景源码/测试 | 在 S6 前准备并审阅准确代码，真实操作仍受 R0 的 R2–R4 门禁；不能只用模拟核心关闭 C1 |
| 来源补齐 | 根据真实发现清单补齐准确 package/index/signature/member 与非包来源 | 原件离机复核通过，缺项维持 BLOCKED |
| 动态现场执行 | 准确候选/Guest/源码/SHA/argv/env/场景/权限/失败保全包 | 另有具体执行批准；不沿用 S5 的一次授权 |
| S6 与 C1 裁定 | 同候选实际消费、全部来源映射和独立证据 | 限定前提/缺口显式裁定；不自动放行 R2–R5 或生产 |

来源补齐可随有界发现迭代；执行探索所得的未经认证依赖只能登记为 discovery，不能倒推该次执行已可信。最终受控执行必须使用已冻结且认证的完整清单。S6/C1 最终判定由实际证据决定，不预先创建 true/授权字段或修改旧 receipts。

### 7.7. 本批变更、验证与停点

本批为 **A 类内部文档准备**，归 Runtime/Ops；无实现、公共或持久化合同变更，无新兼容路径。已审阅且无业务 owner、跨上下文导入/依赖边、SCC/cycle、债务计数或 scanner baseline、部署单元、CI/依赖/锁文件、Prisma/migration、17 Bundle、生产/Guest/AWS 配置变化。

同步 R1-B、S1、R0、B2-1C、current-dependency-graph 和 worklog；原件、Mac wrapper、密码、现场 UUID/boot/ns/私有路径不进入 Git。MCP-workspace 未运行 lint/build/test，未在外部环境代跑仓库实现或测试。按现行 change_scope，纯 docs Markdown 不选择应用/Runtime 测试 lane，实际授权后 CI 才是交付证据，不把预期跳过记为测试成功。

本地差异已审阅，用户已明确要求“提交远端”，授权本批 [PR #2886](https://github.com/sanqin888/sanqinMVP/pull/2886) → dev、必要 CI 修复及全绿后合并；最终交付以该 PR 实际 head 的 CI 与合并事件为准。R1/C1 OPEN、G2 NO-GO、S2 daily PAUSED、C2 有限 CLOSED。


