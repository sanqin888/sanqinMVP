# R1-B S4/S5 只读 Guest FD 采集与 R1-C S6 准备

> **2026-10-22 R0 取证规则更新 + C0 限定收口（本地待审）：**后续 R1-B/C、C0–C5、C1-SYN、Host/Guest/Native 的**第三方见证人员、PDF、邮件、签署和复算底稿均取消**，仅保留 [R0 §4.1](Runtime更新-R0冻结设计.md) 定义的目标 VM/SSH、源码/输入、执行权限、实际结果和内部技术比对。按新标准，**历史 [C0 §7](R1C-2C-C-C0独立身份与保管链证据复核.md) = `CLOSED / LIMITED-ACCEPTED`**（本批与新 R0 同时合并方生效）；旧 §14–§17 `OPEN / LIMITED`、B-004 见证和失败回执保留当时真实结论，不追索见证底稿。未来 VM/VDI/SSH host key 实际核对是 C1-SYN A0 新会话 Preflight，**不是重新开放历史 C0**。Guest/root/strace 仍需单独用户授权，审阅器 `BLOCKED` 不自动放行。

**2026-10-20 最新接续：R1C-1 SOURCE MERGED / SOURCE CI VERIFIED；R1C-2A LOCAL CONTRACT AUTHORED / USER REVIEW PENDING。** R1C-1 已通过 [PR #2888](https://github.com/sanqin888/sanqinMVP/pull/2888) / [CI #7417](https://github.com/sanqin888/sanqinMVP/actions/runs/39478774789) SUCCESS，并合并 `dev@54638f2e`；§8 留存当时本地实现状态。R1C-2A 的观察覆盖、威胁模型及独立 v1 证据合同见本文件 §9；尚未实现观察器/真实 bootstrap/effect adapters、实际 S6 或独立 C1 验收。§6 S5 PASS_SCOPED 不变，R1/C1 OPEN、G2 NO-GO、S2 daily PAUSED。

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

**该准备批次随后已完成交付：**最终 head `4e31bd703442a3c546ad26952935dfabf47e8f0f` / CI #7411 success / dev merge `09354818c37dc5fa649b65ac466448dc5d64494b`。以下 §8 为另一批经用户要求开始的源码实施，不继承其远端交付或现场执行授权。

## 8. R1C-1 正常更新流程核心与执行场景

### 8.1 实施与所有权

**LOCAL SOURCE/TESTS AUTHORED / TESTS NOT RUN / USER REVIEW PENDING / NOT PUSHED。**
前置 doc-only PR #2886 最终 head `4e31bd703442a3c546ad26952935dfabf47e8f0f` / [CI #7411](https://github.com/sanqin888/sanqinMVP/actions/runs/39472256317) success，dev merge `09354818c37dc5fa649b65ac466448dc5d64494b`；该纯文档 CI 的 Runtime/应用 lane 按范围跳过，不算本批新源码测试。用户随后明确要求开始 R1C-1；分支 `feat/runtime-r1c1-normal-update-flow-20261020` 从最新 origin/dev `fa6513a71451309898ffc4ab3c720b8c63458511` 创建，不修改并行 Payments 工作。

新增 Runtime/Ops 内部模块：
- `ops/runtime/normal_runtime_update.py`：`NormalUpdateFlow.run(UpdateRequest, UpdateCapabilities)` 是后续 R4 计划复用的唯一流程核心；本批调用方只有聚焦合成测试。
- `ops/runtime/normal_runtime_launch.py`：`freeze_launch_materials` 从调用方提供的不可变源码 bytes 形成排序元数据和完整启动提案；不读取或执行这些文件。
- `ops/runtime/tests/test_normal_runtime_update.py`：同一核心上的有状态合成资源与 18 个测试方法，含 11 阶段 × 前/后 × 普通异常/KeyboardInterrupt/SystemExit 的 66 个失败子场景。

既有 `runtime_update_contract.py` / `trusted_root_operator_gate.py` 的历史 Kit/clean-reinstall 模型和 lab installer/maintenance guard 均不修改、不放宽。本核心按照现行 R0 D1–D5/AWS 快照方案编排，不把旧模型的布尔通过结果当作执行能力。

### 8.2 阶段顺序与能力合同

| 阶段 | 狭窄能力 | 必须完成的真实责任（本批仅合成） |
| --- | --- | --- |
| VERIFY_SOURCE | admit_and_verify_source | 持久事务准入；认证执行来源/平台/完整依赖、当前及目标 Archive/17 成员与保留状态；拒绝未明事故、同版本和无 Runtime 成员变化 |
| PREPARE_PRIVATE | prepare_private | 只准备来源已核对的完整 root-private 候选，活跃树未写 |
| RECORD_ORIGINAL | record_original_state | 在策略变化之前持久化并离机记录准确原容器/服务/任务状态 |
| FREEZE_MAINTENANCE | freeze_maintenance | 业务入口/写入者禁入、准确 restart=no/正常停止、持续维护；保留管理通道 |
| SNAPSHOT_READY | create_and_verify_snapshot | 唯一准确创建/等待 available、来源/覆盖盘与离机轻量清单，不选 latest、不盲重试 |
| RECHECK_FROZEN | recheck_frozen | 核对快照后保护窗口仍连续冻结 |
| HANDOFF | handoff | 持续冻结下按准确 FD/权限/同设备/持久化边界进行目标交接 |
| VERIFY_INSTALLED | verify_installed | 完整安装/Manifest 与应用、DB、Uploads、配置等保留状态复验，业务仍禁入 |
| RESTORE_POLICIES | restore_original_policies | 只按原记录恢复准确策略/任务；健康启动仍保留业务屏障 |
| VERIFY_RESTORED | verify_restored | 独立核对原状态、健康和单写者/外部对账，尚不放行业务 |
| RELEASE_BUSINESS | release_business | 最后单独放行业务，不与策略恢复合并 |
| 失败旁路 | record_abort | 只保存本次尝试的事故证据，不启动服务、不覆盖唯一恢复点、不重放 journal，不取消其他 owner 的事务 |

所有方法在首个 callback 前检查齐备并固定 bound method；缺能力不先做半套准备。请求固定 upgrade、Runtime/root/project/DB/Uploads 身份，绑定当前/目标 Runtime SHA/Archive digest、当前/上一应用 SHA、保留状态摘要及启动材料摘要。普通同版本和同 Archive 拒绝；实际 Manifest/安装完整性由准入适配器核验，当前没有这样的真实适配器。

每个 `StepCompletion` 只接受明确 COMPLETE、准确阶段/请求摘要/前驱记录摘要、证据与保留状态摘要；原策略记录、快照离机记录一旦获得就在后续阶段保持同值。记录规范编码为不可变 bytes 后交给下一步，不保留适配器返回对象的可变引用。snapshotRecordSha256 指轻量记录 bytes 的 SHA，不虚构快照整盘或 ARN 哈希。

**类型和摘要绑定只证明内部关联，不能认证 callback。** 所有实际认证、独占权、连续屏障和持久化由后续经过审阅的真实能力实现持有；核心不会因为调用方提交 typed completion 而产生 root/安装权限。实例级 Lock 只防本实例并发/重入和再次使用，不是跨进程排他；新进程/新实例同 txid 的拒绝依赖适配器持久事务准入，尚未实现。

### 8.3 失败、中断与未知结果

先登记 attempted，再调用能力；仅返回并通过验证的阶段进入 completed。异常、KeyboardInterrupt 或 SystemExit 后，不运行后续阶段、不重试、不自动恢复策略/业务、不回滚或删证据，抛出带有限回执的 NormalUpdateAborted，并保留原异常 cause。回执不序列化异常消息/参数，事故记录再次失败也不覆盖原 cause。

- 快照调用可能创建后超时：无合格完成记录则不能交接，已有唯一对象留给准确查询/事故处置。
- HANDOFF 可能已改活跃树但未返回：handoffState=UNKNOWN；不把非零/超时等同“没写入”。
- 策略恢复中断：不继续 verify/release，业务屏障仍须由能力持续持有；核心回执不自证实际冻结。
- 最后 release 调用可能部分成功：businessReleaseState=UNKNOWN、maintenanceState=UNVERIFIED，不能声称业务一定仍冻结；留证并转独立事故处理，不自动重发 release。
- record_abort 成功只记 REPORTED_RECORDED；失败/未知单列 FAILED_OR_UNKNOWN，不假装证据已经落盘或离机保存。

实例成功或失败后均不重入，没有从 receipt/journal 恢复阶段的入口。真实 SIGKILL/掉电与跨进程持久化未实现/未验证，本批内存异常场景不替代 R2/R4/R5 的真实中断证据。

### 8.4 启动材料与边界

LaunchMaterials 绑定调用方准确 source commit、txid、排序逐文件 SHA/大小、另列 bootstrap、完整 interpreter/argv/env/cwd/uid/gid 和显式子进程 argv。源码限 3–64 个平铺 .py 文件，必须包括本批两份核心源码与独立 bootstrap；单文件≤64 KiB、总源码≤512 KiB。子进程≤16，每条≤32 个有界 ASCII 参数，拒绝控制字符、相对/逃逸程序路径和重复声明。

提案固定 Python 3.12.3 平台入口路径 `/usr/bin/python3.12`、`-I -S -B`、root-private 来源目录、HOME/LANG/LC_ALL/PATH/TZ 白名单及 uid/gid=0。**这些是待审启动提案，不是现场已验证的权限或可复制执行指令。** 本批尚未实现 bootstrap/真实 CLI，不创建目录，不调用子进程；传入 bootstrap bytes 只作数据哈希，不编译/导入或执行。最终源码/启动值必须在最终 CI 后与完整真实适配器一起冻结；不沿用 S5 计划/批准，不声称整个 Python/native 依赖清单已齐。

流程完成仅表示所有能力按序返回相关联 COMPLETE；回执永久 decision=BLOCKED、adapterEvidenceIndependentlyAuthenticated/actualConsumptionVerified/readyToInstall/authorizedToMutateProduction=false、journalReplayAllowed=false。启动材料的来源/动态闭包/launchAuthorized 均 false。

### 8.5 测试、文档和接续

已编写来源/输入拒绝、缺能力、完整正常流程、各阶段异常/两类中断、原策略包括原本 inactive/disabled 的精确恢复、快照超时不交接、部分 handoff/release 未知、错请求/前驱/原策略/快照/保留状态、typed/dict/boolean 伪回执拒绝、abort 二次失败、实例/ledger 单次使用、并发/重入拒绝、已接纳对象突变隔离、源码/启动材料预算和 Bundle/导入边界测试。全部资源为内存合成字典/字符串，无 Guest、root、云、网络或活跃路径写入。

分类 A 类新增内部编排核心；新内部依赖为 normal_runtime_update → normal_runtime_launch，同 Runtime/Ops owner，未接入任何现役调用方或 17 Bundle。12-context 的 owner/跨上下文边/直接导入债务/SCC/scanner baseline、公共持久化合同、兼容登记、Prisma/migration、CI/依赖锁和生产行为不变；没有设置新的执行权限。同步 S1/R0、current-dependency-graph 和 worklog，保留旧回执与原证据。

MCP-workspace 未开放 lint/build/test，未运行，也未在外部环境代跑本批源码或测试。授权远端后的 ci.yml ops-checks 会选择 Runtime unittest discovery 和 paired-image release 测试；当前 **CI NOT RUN / NOT PUSHED**。下一步先完成本批审阅/源码 CI，再准备完整候选适配器及 R1C-2 观察方案；最终 S6 需真实同候选消费与独立裁定。R1/C1 OPEN、G2 NO-GO、S2 daily PAUSED、C2 有限 CLOSED。

## 9. R1C-2A — 真实消费观察覆盖与证据合同冻结

**日期：2026-10-20（America/Toronto）**  
**阶段：R1-C / S6 / B4B-3C；本批状态：CONTRACT SOURCE AUTHORED / LOCAL REVIEW PENDING / NOT EXECUTED / NOT PUSHED。**  
**源码基线：`origin/dev@54638f2eb80cb6635a17c1d3c286c1c6e2980d2d`（R1C-1 PR #2888 / CI #7417 SUCCESS / dev merge）。**  
**工作分支：`docs/runtime-r1c2a-observation-contract-20261020`。**

> 本文是 **R1C-2A 设计与证据格式冻结**，不是观察器实现、真实 S6 取证、完整来源认证或 C1 PASS。所有 v1 离线候选回执的安全结论固定为 `BLOCKED`；不可在文档中手填 PASS。真实执行器、观察器及精确现场命令均留给后续审阅/授权。

### 9.1. 继承合同、职责与范围

依照 [R0 D1–D5/C1–C8/R1–R5](Runtime更新-R0冻结设计.md)、R1-B §6/S5、R1-C §7.5–7.6 与 [R1-S1 §11–12](C5-G2-R1-S1-独立Ubuntu签名验真采集程序.md)，本批只冻结 **Runtime/Ops 内部**观察覆盖、信任分层、证据格式和离线拒绝规则。

R1C-1 已通过 [PR #2888](https://github.com/sanqin888/sanqinMVP/pull/2888) / [CI #7417](https://github.com/sanqin888/sanqinMVP/actions/runs/39478774789) 并合并 dev `54638f2e`，包含唯一计划正常更新核心 `NormalUpdateFlow.run`、`LaunchMaterials` 的 hash-only 提案及合成失败矩阵。**没有**执行 bootstrap、真实 Host/AWS/安装 effect adapters、持续写入禁入屏障、跨进程事务准入，亦无实际动态消费证明。启动提案为 `/usr/bin/python3.12 -I -S -B`、固定候选 root-private 目录/环境/uid/gid；准确未来候选必须包含后续完整 effect adapters 和 bootstrap，不可用现有合成测试资源替代。

S5 CAPTURE-003 的三文件 FD 和原件一致性 **PASS_SCOPED**，不代表所有动态依赖、完整 Host/Guest 可信来源或 S6；其原 `decision=BLOCKED` 与所有 `false` 权限字段保持不变。R1-A 总验收、C1 独立裁定均 OPEN；R2–R5 不因此启动，G2 NO-GO、S2 daily PAUSED、C2 有界 CLOSED。

**改动类别 A：仅新增内部设计与独立 v1 候选证据合同说明。** 不新增运行时代码、API/DB/持久化合同、跨上下文边、依赖或锁、不改旧 Runtime bundle 的 17 成员、不修改现役/实验安装或维护语义、生产/Guest/root/AWS 配置和权限。R1C-2B 离线解析器、2C 观察器、2D 完整候选与独立来源验证分别后置。

### 9.2. 有限威胁模型与证明边界

#### 9.2.1 继承的可信前提

R0 D1 **有限接受受控云账户/虚拟化平台、Guest 内核和 root 管理**作为信任根；不尝试无限递归证明内核。但**采集器本身、命令行、日志、文件路径、进程元数据、内存模块列表、dpkg 声明和外部传入的 SHA 均不是自动可信根**。独立证据来源的 custody、实际执行主体/Guest 会话同一性和完整动态依赖闭包需要分别证明。未审的外部工具及其启动依赖不得偷偷纳入信任根。

#### 9.2.2 必须考虑的攻击/失败模式

- **启动与覆盖窗口**：观察器晚于 Python/ld.so、未跟踪 fork/clone/vfork/exec 后代、PID/TID 重用、mount/pid namespace 漂移、进程脱离追踪、观察器退出或部分回调失败。
- **真实加载偏差**：Python import hook/loader 自定义、动态 `__import__`/`importlib`、`runpy`/`exec`、`ctypes`/`cffi`、已有 `.pyc`、zip/importer、builtin/frozen、`.so` 扩展、native `dlopen`、`LD_PRELOAD`/`LD_AUDIT`、`DT_RPATH/DT_RUNPATH`、`PT_INTERP`、`DT_NEEDED`、未知 loader/ABI。
- **身份与字节替换**：path reopen/符号链接/硬链接/bind mount、FD 重用、`/proc/.../fd` 指称变化、文件在 open→mmap/read/执行期间变化、既有 mmap/内存中缓存、统计前后相同但中间变动、Namespace/overlay 别名。
- **错误授信**：把成功 open、单次 maps 快照、AST 提示、最终 sys.modules、进程 `rc=0`、采集器报告中的 hash、离线同源自签都提升成“实际消费了认证字节”；事件丢失、记录重排、丢尾、超预算但自动截断。
- **场景遗漏**：仅一次正常路径的发现被当成所有分支/失败时刻、业务维护及外部 child 命令已完整验证；模拟/“hello import”轨迹移植为正式 R4 候选。
- **保管链风险**：收集者自给 expected digest、跨机时钟未经认证、stdout/stderr/exit code 未留原始字节、敏感 env/token 泄漏、人工审阅被标记为独立技术签认。

**明确范围外但作为后续门禁**：通过观察器实现运行前文件字节防篡改或阻止新消费者属于保护/隔离能力，不是解析器的自然结果；R2 持续维护/新写入者禁入、R3 精确 AWS 快照、R4 正式 effect adapters 与安装、R5 同候选故障/恢复矩阵仍各自受原审批。

### 9.3. 覆盖矩阵（v1 冻结）

每行 **必须**通过设计/离线负例纳入 R1C-2B；`DISCOVERY` 不是 `AUTHENTICATED`。最终 C1 需要由独立证据证明实际事件完整、认证字节消费及冻结后的不可污染性；单一工具无法证明时须 BLOCKED。

| ID | 被观察边界 | 最低证据 / 反例 | 只用该材料的局限 |
| --- | --- | --- | --- |
| COV-01 | **起点**：解释器与 loader 启动之前 | 观察器已就位的起点/attestation、完整 argv/env 摘要、原进程 exec 身份、准确平台、启动策略；起点未知拒绝 | Python `sys.addaudithook` 后置不能追溯 loader 启动 |
| COV-02 | 进程全生命周期、全部被允许子进程 | 稳定进程身份 + 父子边、fork/clone/vfork/exec、线程与退出、全体后代退出/未退出、丢事件标记；漏任一后代拒绝 | 单个 PID、一次性 `ps`、shell 返回 0 |
| COV-03 | CPython `.py`/包/`.pyc`/zip/自定义 importer | 模块/loader/origin、文件身份及所读内容绑定；无法绑定动态产生代码拒绝 | 仅模块名、AST import、`sys.modules` |
| COV-04 | builtin/frozen/运行时生成代码 | 明确分类、所属 Python/bootstrapping 二进制的认证关联；`eval/exec` 和不可证明的生成源策略拒绝 | 无路径不等于无需来源或可信 |
| COV-05 | native bootstrap 与 ELF | 实际 `PT_INTERP` 身份、loader、初始环境、`DT_NEEDED` 及传递加载映射、`RPATH/RUNPATH` 与 preload/audit 策略 | 静态 `SONAME` 不等于实际被映射库 |
| COV-06 | 延迟 native 扩展/`dlopen` | 真实扩展和库的加载生命周期、映射身份、失败/重试、依赖闭包 | 仅成功 `open`、`/proc/maps` 快照不足 |
| COV-07 | 文件、FD、别名与实际内容 | mount namespace/id、device/inode、logical/observed/alias、打开时 FD 与读取/映射关联、文件源字节 SHA 和时间窗口保护；替换未知拒绝 | 结束后按路径 hash 或 `fstat` 两次不能证明中间未变 |
| COV-08 | 认证来源与边界内非包文件 | 所有实际文件对应准确 Release→Packages→deb/member 和另有审批的自有源码/非包工具来源；独立原件复核 | `dpkg -S`、Guest 自报 hash 或 S5 三文件不足 |
| COV-09 | 场景和可达分支 | 同一最终候选成功/拒绝/中断路径的场景身份、条件和已到达阶段；未触达分支必须登记 | 单次成功不能证明所有潜在加载 |
| COV-10 | 日志完整性与离机复核 | 完整原始事件/标准流/退出码、连续 seq、无 lost/truncated、预算和清单、独立固定 pin/custody | 采集器自己生成“verified”报告不独立 |

**覆盖策略**：全部 COV-01..10 对每个最终审核场景都需要适用或由明确理由判为“不适用”；重要加载类别不能以“不适用”消除未知输入；事件观察 `NOT_OBSERVED` 不能推论“行为不存在”。受控合成负例成功仅可说明离线格式/判拒实现，不能关闭实际覆盖。

### 9.4. 技术选型状态、失效条件

| 候选层 | 预计用途 | 未达到前的状态 |
| --- | --- | --- |
| Linux 进程/系统调用级受控跟踪（如经过审阅的 ptrace/strace 适配器） | 从 exec 之前开始追踪后代、open/read/mmap/exec 等发现轨迹和丢失信息 | **仅候选**；Guest 工具版本/权限/内核约束尚未核实；系统调用日志本身不证明内容 |
| CPython 审计/import 元数据（若经受控早期安装） | 关联 module/loader 与路径及动态 import | 辅助线索；无法独立覆盖 native/解释器启动与禁入 |
| ELF 静态分析 + 根 FD/别名读取 | 补充预期依赖、来源成员与文件身份 | 复用既有 `root_python_elf_static_hints.py`、`root_python_dependency_*`；原有限回执仍 BLOCKED |
| 文件防替换/内容完整性保护能力（如经独立评审的只读来源/文件系统约束） | 封闭“观察时一致、执行时换字节”的缺口 | 尚未选型/实现/授权；不许把被动跟踪当成主动预执行防护 |
| 独立离机验证器 | 不执行候选，不调用 Guest/root，根据双源原件和闭包审阅 | **R1C-2B 首选实施点**；必须独立于 Guest collector 授信逻辑 |

**架构裁定**：首选 **观察发现 + 独立来源核对 + 额外的消费时字节保护/闭包证明** 的分层模式；**本 2A 不冻结 strace 为最终生产技术、不授权安装系统工具、ptrace/eBPF/IMA 权限或采集 Guest**。不能覆盖的行为标为 `GAP` 并阻断。R1C-2C 技术/权限变动须根据实测限制单独审批。Linux 文件事件观察与实际 mmap/CPU 指令执行之间的证明缺口不得被字段名掩盖。

### 9.5. 证据合同 `sanq.runtime.r1c2-consumption-evidence.v1`

#### 9.5.1 身份、序列与原件约束

为避免既有 Guest/B3A v1 被当作权限证明，**本合同独立命名空间，不替换旧合同，不继承旧 PASS 或 source authority**。v1 设计冻结以下概念及严格字段；2B 可以分拆为原始封套 + 离线复核结果，但必须保持下面的同名字段及关联不变量，额外字段/版本一律拒绝，不允许悄悄接受未审 schema。

**Envelope**（每个授权尝试/每个冻结场景一份；所有身份字段必须从已审来源独立比对）：

| 字段 | 形式与必要性 |
| --- | --- |
| `schema` | 固定字符串 `sanq.runtime.r1c2-consumption-evidence.v1` |
| `captureId`、`scenarioId` | 非空固定字符集 ID，跨原件稳定唯一；场景关联被冻结的候选 |
| `candidate` | `sourceCommit`（40 lowercase hex）、`launchMaterialsSha256`（64 lowercase hex）、`requestSha256`（64 lowercase hex）、`entryPoint`、`bootstrapSource`；关联完整 effect adapters 的冻结清单 hash，缺失即拒绝 |
| `scope` | 冻结观察方案标识及 SHA、声明的 `coverageIds`、`sourceSetSha256`、已批准进程/命令/环境预算摘要；**声明不等于真实授权** |
| `session` | Guest/boot 与 mount/pid namespaces、实际 Python/loader 与观察器进程身份、启动/结束时间（各主体独立时间线）；无准确对象则拒绝 |
| `rawArtifacts` | 原始事件流、argv/env（只保留经批准的脱敏原件）、stdout/stderr、exit status、采集器日志、外部独立 pin 的逐件 `sha256` 与大小、保管方式；缺原件不能凭 summary 代替 |
| `processes` | 进程完整身份表和父子/exec/退出边；覆盖本次全体候选、观察器和受控工具 |
| `events` | 有序观察事实集，格式见下；事件来源属于候选，不自动可信 |
| `fileBindings` | 观察对象与其读/映射/载入关系、身份/别名/来源交叉核验，含明确 gap |
| `completeness` | 覆盖声明、事件丢失/截断/预算/观测中断、后代遗失、起点/终点覆盖及缺口列表 |
| `provenance` | 独立批准和保管的 expected pins（或其原件 hash/reference）、逐文件映射/来源未闭合项、是否真正独立复核；不能由 Guest collector 自生成 expected |
| `assessment` | 仅 `CANDIDATE_REVIEWED` 或 `REJECTED` 的离线判断、原因码及固定 `decision=BLOCKED`、`actualConsumptionAuthenticated=false`、`readyToInstall=false`、`authorizedToMutateProduction=false` |

**v1 子对象的精确字段集合**（以下为强制键，类型按本节定义；2B 不得只验证顶层 schema）：

| 对象 | 强制且仅允许的键 |
| --- | --- |
| `candidate` | `sourceCommit`、`launchMaterialsSha256`、`requestSha256`、`entryPoint`、`bootstrapSource`、`effectAdapterSetSha256` |
| `scope` | `observerPlanId`、`observerPlanSha256`、`coverageIds`、`sourceSetSha256`、`permittedProcessPlanSha256`、`budgetSha256` |
| `session` | `guestIdentity`、`guestBootId`、`mountNamespace`、`pidNamespace`、`rootMountId`、`observerProcessIdentity`、`pythonIdentity`、`loaderIdentity`、`observedStartUtc`、`observedEndUtc`、`clockDomain` |
| `rawArtifacts[]` | `artifactId`、`kind`、`sha256`、`byteCount`、`producer`、`custodyRef`、`collectionScope`、`completeness` |
| `processes[]` | `processIdentity`、`parentProcessIdentity`、`pid`、`tid`、`startDiscriminator`、`pidNamespace`、`mountNamespace`、`binaryFileBinding`、`firstSeq`、`lastSeq`、`exitState` |
| `events[]` | `sequence`、`timeMonotonic`、`captureId`、`processIdentity`、`parentProcessIdentity`、`eventType`、`result`、`object`、`rawReference`、`coverageIds`、`uncertainty` |
| `fileBindings[]` | `logicalPath`、`observedPath`、`mountNamespace`、`mountId`、`device`、`inode`、`fdIdentity`、`size`、`sha256`、`byteEvidenceSource`、`firstEvent`、`lastEvent`、`moduleOrNativeOrigins`、`aliasChain`、`packageOrApprovedNonpackageSource`、`mutabilityGuardEvidence`、`classification` |
| `completeness` | `coveredIds`、`startWitnessed`、`endWitnessed`、`childrenCovered`、`lostEventCount`、`truncationDetected`、`observerInterrupted`、`budgetExceeded`、`gaps` |
| `provenance` | `separatelyPinnedSourceArtifactSha256`、`reviewMethod`、`unverifiedFileBindingIds`、`sourceGaps`、`independentReviewerReceiptSha256` |
| `assessment` | `reviewStatus`、`reasonCodes`、`decision`、`actualConsumptionAuthenticated`、`readyToInstall`、`authorizedToMutateProduction` |

规范化值型：SHA 为 64 位小写十六进制；列表有界、按 ID 去重；计数为非负严格整数，不能是 Boolean；`sequence`/`firstSeq`/`lastSeq` 为有界正整数；`coverageIds` 仅允许 COV-01..COV-10；`reasonCodes` 仅允许下文 §9.5.4 的原因码；`reviewStatus` 为 `CANDIDATE_REVIEWED` 或 `REJECTED`；`decision` 固定 `BLOCKED`，最后三项布尔值固定 `false`。`startWitnessed/endWitnessed/childrenCovered` 等声称性布尔不得自行产生授信。`observedStartUtc/observedEndUtc` 只在各自时钟域内有意义，不作跨机先后结论；`timeMonotonic` 采用观察器原始单时钟域的非负整数 tick 和该域声明，无法界定单位时禁止时间关联。

`kind`/`eventType`/`classification` 等枚举按本节明确列值；每个 `object` 必须是带 `kind`、`identity`、`fileBindingRef` 三键的对象（不适用字段允许 null，但必须说明 uncertainty）。`rawReference` 必须是带 `artifactId`、`startByte`、`endByte` 三键的对象，区间为 `[startByte,endByte)`，对应真实原件字节范围、`0≤startByte<endByte≤byteCount`；不能只凭解释文本。`processIdentity` 是由 pid namespace + PID + 不可复用进程代际标记形成的稳定键，不允许仅用 PID 推导。

**取值为 null 或 `UNKNOWN` 不等于满足覆盖**：必须产生对应 gap/原因码并阻止后续完整认证；`CANDIDATE_REVIEWED` 只对结构合规的离线候选开放，不表示上述声明已经技术独立验真。内部字段若仍需细化（如 `fileBindingRef` 的完整传输编码），2B 必须在编写解释器前提交明确 schema 修订并审阅，不能自行增加信任或改变 `BLOCKED` 判定。

**Event 最低字段（不得把 open 当作 consume）**：`sequence`（从 1 连续递增）、`timeMonotonic`（单时钟域；跨 Host/Guest UTC 不排序）、`captureId`、`processIdentity`（pid/tid + process-start discriminator + namespace）、`parentProcessIdentity`（若适用）、`eventType`（白名单见下）、`result`（`SUCCESS/FAILURE/UNKNOWN`）、`object`（明确 file/FD/mapping/module/child 类型与身份；不适用时 null）、`rawReference`（可证明对应原始事件区段）、`coverageIds`（满足的具体 COV）、`uncertainty`（非空/空但不能省略）。事件顺序不等于因果闭包；缺关联 raw bytes → `BLOCKED`。

**Event type v1 词表**：`OBSERVATION_START`、`PROCESS_FORK`、`PROCESS_CLONE`、`PROCESS_EXEC`、`PROCESS_EXIT`、`FILE_OPEN`、`FILE_READ`、`FILE_MMAP`、`FILE_IDENTITY`、`PYTHON_IMPORT`、`PYTHON_CODE`、`ELF_LOADER`、`NATIVE_LOAD`、`NATIVE_UNLOAD`、`EVENT_LOSS`、`OBSERVATION_END`。复用同一 `processIdentity` 需证明进程代际一致，若 PID 复用无法区分一律 gap。该词表为**归一化事件类别**，不是承诺 Linux 单一跟踪技术能提供全部信号。

**File binding 最低字段**：`logicalPath`、`observedPath`（皆可为受限未知而非伪造路径）、`mountNamespace`、`mountId`、`device`、`inode`、`fdIdentity`（含使用区间/进程和 FD 代际）、`size`、`sha256`、`byteEvidenceSource`、`firstEvent`、`lastEvent`、`moduleOrNativeOrigins`、`aliasChain`、`packageOrApprovedNonpackageSource`、`mutabilityGuardEvidence`、`classification`（`DISCOVERED_ONLY`、`MATCHED_UNAUTHENTICATED`、`INDEPENDENTLY_AUTHENTICATED` 或 `GAP`）。**分类不可单凭 sha 一致升级**；依赖来源、consumer→FD 内容、不可污染窗口须分别有原始独立证据。

#### 9.5.2 证明等级，不允许默默提升

| 等级 | 含义 | 是否支持 C1 PASS |
| --- | --- | --- |
| `OBSERVED` | 观察器报告了带原始索引的事件 | 否 |
| `DISCOVERY_COMPLETE_CANDIDATE` | 在固定预算内未声明丢失、并记录所有已知场景/子进程；未独立核验 | 否 |
| `SOURCE_MATCHED_SCOPED` | 有限文件 SHA 与独立包/源码 pin 核对通过，缺执行时字节保护或完整覆盖 | 否 |
| `CONSUMPTION_AUTHENTICATED` | **仅供未来另批独立 C1 裁定合同**；必须有同候选、完整覆盖/来源/消费字节/保护与独立复核 | 本 v1 禁止输出或宣称 |

`assessment` 的 `CANDIDATE_REVIEWED` 仅表示候选格式和局部证据满足离线评审的限定条件，不是 `sourceProvenanceAuthenticated`、`dynamicClosureVerified` 或 `C1 PASS`。v1 不允许结果 `PASS`、`READY`、`AUTHORIZED`；不可用传入 true 授信。

#### 9.5.3 精确编码、配额与不可变原件

- v1 离线归一化封套编码：UTF-8 JSON 对象，键字典序、`separators=(',', ':')`、`ensure_ascii=True`、`allow_nan=False`；字节级 SHA256 小写 hex。拒绝重复 JSON key、未知字段、NaN/Infinity、非精确整数、过长文本、不合格 SHA、重复 identity 或跨封套引用。原始日志不用二次转码代替原件。
- **初始候选预算（2B 必须落实，后续真实平台实测前可提交独立变更评审）**：事件 ≤32768、进程 ≤64、文件绑定 ≤512、场景每份 ≤1、raw artifact 件数 ≤64、事件归一化封套 ≤32 MiB、单条 event 序列化 ≤16 KiB、单路径 ≤256 个 ASCII 字符、证据引用 ID ≤128 个 ASCII 字符。超预算必须 `REJECTED/BLOCKED`，严禁静默截尾、抽样后宣称完整。这些是 **v1 离线合同限额**，不取代现有 B3A/B3B1 manifest/FD 文件读取的更严格限额，也不是对生产更新耗时的批准。
- 每个 artifact 记录 `sha256`、准确 `byteCount`、`producer`、`custodyRef`、`collectionScope` 和 `completeness`；无原件或原始退出码非已知时必须作为 gap。源 hash 和审核 hash 不能都由同一不受信的采集器产生；保留独立基线的证据位置与权限。
- 非包执行源码、bootstrap、effect adapters、观察器与其工具、系统解释器/ld.so/native 闭包都应纳入同一个受限来源审阅，不得仅校验消费者而把观察器提升为天然可信。
- **不在 Git 存储**真实 Guest UUID、boot/ns、Root/Host 现场路径、原始回执、登录材料、令牌、原始 env 或生产秘密。日志受预算约束并作保密分级；脱敏报告必须保留审计所需的独立保管原件哈希与批准的读取路径，不能通过删掉原件伪称完成。

#### 9.5.4 Fail-closed 规范

任一以下条件直接拒绝，且记录**一项或多项可机器处理原因码**：`START_NOT_WITNESSED`、`END_NOT_WITNESSED`、`CHILD_UNTRACED`、`PROCESS_IDENTITY_AMBIGUOUS`、`EVENT_LOST`、`EVENT_ORDER_INVALID`、`EVENT_BUDGET_EXCEEDED`、`ARTIFACT_MISSING_OR_MISMATCHED`、`RAW_REFERENCE_MISSING`、`IMPORT_ORIGIN_UNKNOWN`、`NATIVE_LOAD_UNMAPPED`、`FILE_BINDING_AMBIGUOUS`、`BYTE_CONSUMPTION_UNPROVEN`、`SOURCE_UNAUTHENTICATED`、`FILE_MUTABILITY_UNCONTROLLED`、`CANDIDATE_CHANGED`、`SCENARIO_COVERAGE_GAP`、`OBSERVER_DEPENDENCY_UNKNOWN`、`UNSUPPORTED_PLATFORM_OR_NAMESPACE`、`SCHEMA_INVALID`、`EXECUTION_INTERRUPTED_OR_UNKNOWN`。

若观察状态未知、部分归档失败、进程被强制终止、真实执行 `rc=0` 但事件未全覆盖，`completeness` 只能记 `INCOMPLETE/UNKNOWN`，不能称完整；离线 reviewer 输出 `REJECTED` 与固定 `decision=BLOCKED`。任何碰触真实状态的阶段，仍遵守 R1C-1 fail/UNKNOWN/事故冻结；观察器不能发出业务放行或重新启动命令。

### 9.6. R1C-2B 聚焦实现/测试矩阵

R1C-2B 首先只写 **无执行、无 filesystem/Guest/root/网络、仅 caller-supplied bytes** 的离线 validator/reviewer；不得自动从 PATH、procfs、VM、URL 或 Repo 读取现场原件，也不得通过 import/exec 执行候选源码。应与既有 `root_python_dependency_offline_review.py` 保持独立模块/独立 v1 格式（旧 BLOCKED 合同不改）。

| 测试组 | 最小正向合成/负例 |
| --- | --- |
| 结构与编码 | 合成最小完整封套仅获 `CANDIDATE_REVIEWED/BLOCKED`；错 schema、重复 key、类型、字段、大小、顺序、UTF8、hash、event/raw 引用均拒绝 |
| 进程完整性 | start/exec/exit/observer end 闭合；启动晚、后代漏捕、PID 复用、命名空间漂移、退出未知、跟踪器挂掉拒绝 |
| Python/ELF | .py/pyc/zip/native/builtin/frozen 分型；动态 import、自定义 loader、`DT_RUNPATH`/dlopen、未绑定 ELF/扩展拒绝 |
| 文件身份与内容 | 相同路径不同 inode、fd 重用、硬链接/软链接/bind mount、open 后替换、二次 hash 相同但无持续保护、mmap 未观察全部拒绝 |
| 外部独立来源 | 错包 SHA、同 collector 自给 expected、未认证非包文件/观察工具、来源缺项均拒绝 |
| 原件与预算 | 事件丢失/超限、重复/跳 seq、原件 hash 漂移、原始 rc 缺失、尾部丢失、跨主体时钟不一致但错误强行排序拒绝 |
| 候选/场景 | 同 SHA 源码但不同 bootstrap/argv/env/effect adapters、场景 ID 错配、失败路径遗漏、模拟轨迹充当正式候选拒绝 |

**2B 允许验证的最高状态**：`OFFLINE CONTRACT/PARSER TESTS CI VERIFIED`；不代表`OBSERVATION COMPLETE`、`ACTUAL CONSUMPTION VERIFIED` 或 `S6 C1 PASS`。

### 9.7. R1C-2C/2D 后续门禁与公开未决点

- **2C 技术选型**：核实准确 C2 Guest 的现有 trace 工具/版本、kernel 约束、ptrace_scope/capabilities/namespace、工具自身动态依赖、实际记录的系统调用/mmap/import 映射覆盖、非侵入与失败冻结。当前只允许提出候选方案，不安装、不提权、不运行。所需新增依赖、策略权限或架构行为变更必须按 AGENTS 取得用户独立授权。
- **bootstrap/import 策略**：R1C-1 `-I -S -B` 隔离参数需要与 import 路径/既有 .pyc/c-extension/自定义 loader 的真实语义逐项核实；不能仅靠 `-B` 就推定所有 .pyc 读取被禁止；完整启动源码与 import 入口必须在 S6 前冻结并重审。
- **真实字节污染窗口**：ptrace/系统调用追踪是发现线索，仍缺“实际已消费 byte stream”和执行前/期间保护。此项若无法证明，最终 C1 永远 BLOCKED；不得用环境中的假设性 `read-only`、fd 同 inode 或运行后 hash 简化证明。
- **同一最终候选**：2D 前需要真实 bootstrap + R1C-1 同核心 + 完整 effect adapters + 每个可能子进程的准确 argv/来源及 scenarios，真实观察和认证都须基于该冻结候选；不能以仅 hello/import 演示替代。真实维护、AWS、安装按 R2/R3/R4/R5 的独立门禁。
- **来源与独立裁定**：基于全部实际发现加载对象完成外部可信发行/非包来源原件复核和第三方离机审阅；未获证据仅作 `DISCOVERY`。S6 真实执行命令、使用的 root/Guest、权限、环境和失败事故保管另交明确审批；不继承 S5 一次 root-only 批准。

### 9.8. 本批审阅、CI 与停点

本批仅将合同附入既有 R1-C 工作包 §9，并同步 [依赖图状态](current-dependency-graph.md) 与 [worklog](worklog.md)。保留历史“NOT RUN/NOT PUSHED”为各自当时记录，不把它冒充 R1C-1 的最新状态。无新增代码/运行入口或自动化测试；MCP-workspace 无 lint/build/test 权限，未运行；GitHub Actions 未针对本批执行。待用户审阅本地合同后另授权 PR→dev，依最终 head CI 全绿合并；2B 另批启动。

**冻结的是设计契约，不是 S6 实测认证。** 本批最高状态为 `R1C-2A CONTRACT AUTHORED / REVIEW PENDING`；R1/C1 OPEN、G2 NO-GO、S2 daily PAUSED、C2 LIMITED CLOSED。

## 10. R1C-2B — 离线动态消费证据解析器与独立审核器

**2026-10-20（America/Toronto）／LOCAL SOURCE+TESTS AUTHORED / NO TESTS EXECUTED / NO REMOTE AUTHORIZATION。** 从最新 `origin/dev@5a026e68` 创建 `feat/runtime-r1c2b-offline-consumption-review-20261020`。此前 R1C-2A 已通过 [PR #2889](https://github.com/sanqin888/sanqinMVP/pull/2889) / [CI #7419](https://github.com/sanqin888/sanqinMVP/actions/runs/39482206485) success、合并 `dev@f8dc9808`。本批落实 §9 冻结的 v1 契约，不改变合同名称、字段列表、结果授权或已有 B1/B3A/B3B1/Guest v1 语义。

### 10.1 源码责任与数据流

- `ops/runtime/r1c2_consumption_offline_review.py`：Runtime/Ops 独立纯内存 reviewer。输入为调用方提供的规范 JSON `bytes`、原件 `bytes` 字典、独立渠道提供的 envelope SHA、candidate/scope/session/source pins 和逐件原件 SHA。无 path opens、网络、subprocess、Guest/root、VM、安装、运行、动态 import 或 provenance 提权；只消费传入 bytes。与旧 `root_python_dependency_offline_review.py` 和 S5 collector 不互相导入或更改历史 receipts。
- `ops/runtime/tests/test_r1c2_consumption_offline_review.py`：合成 v1 完整实例和多组恶意/不完整证据负例，仅 Python 标准库、`unittest`，由既有 `.github/workflows/ci.yml` Runtime unittest discovery 选中；该测试没有任何现场取证权限。
- 结果另列 `sanq.runtime.r1c2-offline-review.v1` **非授权离线审阅器输出**：`reviewStatus=CANDIDATE_REVIEWED/REJECTED`、具体 reasonCodes，始终 `decision=BLOCKED`，`actualConsumptionAuthenticated/sourceProvenanceAuthenticated/eventCoverageIndependentlyVerified/readyToInstall/authorizedToMutateProduction=false`。此处不为任何旧或新回执创造 PASS 字段。外部 pins 只是另一参数渠道传入的待比对值，程序**无法证明该渠道真正独立、可信或未被串改**。

### 10.2 严格校验与有界预算

先拒绝非规范 JSON、未知/重复字段、重复 JSON 键、非 UTF-8/NaN/Infinity/floats、混用 bool/int、原件 SHA/长度不一致、非法 ID、无法关联的事件与进程引用。严格校验全部 v1 子对象字段；排序事件 seq 从 1 连续、同一 monotonic 时钟域有序、observer start/end、全部被审核候选进程 exec/exit、父子关系与 process-generation/PID 区间、受控 fork/clone、原件 byte-range 与 process/file event-time 区间。

`fileBindings[].fdIdentity` 用作 v1 `object.fileBindingRef` 的**有界关联键**，不将其名称推断为实际内核 FD 所有权。具体 `rawReference` 使用 `artifactId/startByte/endByte` 绑定传入原件，起止区间 `[startByte,endByte)`。每份文件 SHA 与提供的来源原件及独立比对值对照，但一致性**不证明执行时不可替换**。完整覆盖清单 COV-01..10 必须在事件声明并与 scope/completeness 精确一致；任何未知进程、动态代码/ELF 文件关联、缺原件、丢事件/超限、中断、来源缺口均保留 BLOCKED 并给出原因码。审核器只能处理已归一化事实，不会尝试自行推导系统调用的真实 native/Python 语义。

沿用 §9.5.3 冻结预算：envelope ≤32 MiB、event ≤32768 且单条 ≤16 KiB、process ≤64、file ≤512、raw artifact ≤64；离线 bytes 输入额外采取**实现内部的防滥用上限**：单件 raw artifact ≤32 MiB、全部原件总和 ≤64 MiB。不改变 §9 v1 基础合同，也不以此批准现场采集规模；超过预算一律拒绝，不截断。

### 10.3 有意保持未认证与后续门禁

- `CANDIDATE_REVIEWED` 仅证明**在用户提供的输入与独立声称的比对值范围内结构一致**；不会因成功读 FD、看到 mmap、生成 SHA、日志 rc=0、claim `INDEPENDENTLY_AUTHENTICATED` 而授予 C1 PASS。
- 不发明真实 Guest/loader/文件路径、Session/boot UUID、签名、发行链或 S5 候选验证结果；所有测试均使用 `synthetic-*` 身份与纯数据 bytes。
- 真正覆盖 `-I -S -B`、.pyc/zip、ELF DT_NEEDED/RUNPATH、native dlopen、实际读/映射与字节保护、来源认证需要 R1C-2C/2D 和独立 S6 实测批准。实际记录若存在无法表达的字段，必须**另提交 v1 合同修订评审**，不得在 parser 私下加入信任。
- 现有 17 Bundle、R1C-1 正常更新核心、B3A/B3B1/S5 receipt、CI workflow、Prisma/migration、依赖锁、运行时/部署拓扑、业务所有权和跨上下文依赖图均不修改。分类 A 类内部新能力，不新增兼容路径、SCC/cycle/scanner baseline 或公共/持久化接口。

### 10.4 验证及停点

MCP-workspace 未授权本地 lint/build/test，本批仅可进行静态代码/差异审阅，**不得声称新测试已经通过**；须等待首次远端提交授权后的 GitHub Actions Runtime CI 结果。新增源码与测试必须随本批 PR 一起交付；不能只提交文档。若 MCP-workspace 的 `git add` 无法暂存新文件，须经用户远端交付授权后通过同一功能分支补齐完整文件，并在创建 PR 前核对全部五个文件确已在远端。没有 Guest/root/AWS/生产访问或执行。R1/C1 OPEN、C5-G2 NO-GO、S2 daily PAUSED、C2 LIMITED CLOSED。首次远端 PR 提交与后续阶段须分别按 AGENTS 批准。

## 11. 2026-10-20 — R1C-2C-B MacBook / VirtualBox Ubuntu 观察能力只读取证（操作员报告；独立见证待审）

**范围与来源：**操作员在 Mac Host 上使用独立的 R1C2C-B ReadOnly Kit v1/v2/v3 对指定可丢弃 VirtualBox 恢复 Guest 做只读调查。`R1C2C-B-001` 因 v1 未识别 `nic1=hostonlynetwork` 而 `BLOCKED`；`002` 因 v2 错把 VM 绑定名称 `HostNetwork` 与 `VBoxNetworkName=hostonly-HostNetwork` 等同而 `BLOCKED`；`003` v3 Host 自动预检 **17/17 SATISFIED（仍需人工复核）**。`004` 为新一次 Host/Guest 原件批次；其 Host 清单和 Guest 清单由操作员分别执行 `shasum -a 256 -c SHA256SUMS.host` / `SHA256SUMS.guest` 并贴回所有 `OK`，**不视为独立 witness**。本次仅基于操作员提供的终端摘要与错误原件摘录登记；尚未收到 `004` 离机全量原件并独立复算。`004` 的 Host 逐项预检 JSON 未在本轮聊天逐项展示，不能把 `003` 的 17/17 直接冒充 `004` 的同次独立结果。

**Guest 实际调查（`R1C2C-B-004`）：**SSH outer `rc=0`、`guest-review.json.result=DISCOVERY_ONLY`、`guestSelfReportedUid=1000`、`remoteDataDecoded=true`、`remoteCommandCount=23`。23 项内 20 项 `rc=0`；DMI UUID 查询 `rc=1`、stderr 为普通用户 `/sys/class/dmi/id/product_uuid: Permission denied`；`readelf_interpreter` 与 `readelf_needed` 均 `rc=127`，stderr 为 `No such file or directory: 'readelf'`。`installed_packages` 查询中 `binutils` 仅有名称、无版本，不能单凭这一项认定精确安装状态。其余可读观察包括 Ubuntu 24.04.5 LTS / Linux 6.8.0-146-generic x86_64、Python 3.12.3、rootfs ext4、`strace 6.8`（版本命令 `rc=0`）、`ptrace_scope=1`、`perf_event_paranoid=4`、`unprivileged_bpf_disabled=2`、`unprivileged_userns_clone=1`、当前采集进程 `CapEff=0` / `Seccomp=0`。未报告所查询的 vboxsf/NFS/CIFS 挂载和 IPv4 默认路由；这些单项阴性结果**不是完整网络、namespace、Host 资产或持续隔离证明**。`guest-review.json` 仍声明 `sshCombinedChannelWarning=true`、`hostIndependentWitnessVerified=false`、`guestIdentityIndependentlyAuthenticated=false`。

**技术裁定：**`2C-B CAPABILITY DISCOVERY CAPTURED / OPERATOR MANIFEST MATCHED / WITNESS PENDING`；当前组合存在 `strace` 候选，但只证明工具发现和有限配置，不证明 ptrace 实际可跟踪目标 Runtime/root 全部进程，不证明字节消费、不可替换窗口、Python `.pyc`/native/`dlopen` 全闭包或第三方可信发行来源。`readelf` 缺失留作已知技术缺口；本轮不得为清理状态而 `sudo`、安装 binutils、改 ptrace 参数、重启/重配 Guest、执行真实 trace 或维护更新。若 2C-C 需要合同表达变更、新增依赖、精确 Guest 操作或权限，须另行申请逐项授权，不得改变 §9 v1 fail-closed 合同。

**待独立见证：**见证人须在**独立环境**取得 `004` 的离机私有原件与准确清单，逐件复算 Host/Guest SHA-256、读取 Host/Guest/SSH 内外 rc 和 UTC、审阅已知 `rc!=0` 与复合通道缺口、记录原始归档 hash 和通过独立渠道预冻结的预期 hash（缺失如实标记）。电子签名须列明见证人身份、签署 UTC、所审核对象、`LIMITED/BLOCKED/NOT REVIEWED`、未证明范围及签署后文档 hash；仅收到摘要或签字本身不得升级 Guest 独立认证或真实采集时平台真实性。私有原件、Guest UUID/IP、Host 绝对路径、密钥、原始 stdout/stderr 不纳入 Git；仓库仅存脱敏证据 ID 与限制。见证回执由操作员从独立见证人邮箱收取，核对后再单独续记审阅状态。

**2026-10-21 回邮续记（证据已收到，未升级认证）：**操作员提交一份 Gmail 格式的独立见证回邮原件 `R1C2C-B-004-WITNESS-EMAIL-001`（.eml，含 PDF 附件），邮件正文声明见证结论为 `LIMITED`。离线解析确认：邮件声明的签署 PDF SHA-256、同封附件实际 SHA-256 与操作员此前上传的同名 PDF 字节一致；邮件认证头声称 `dkim/spf/dmarc=pass`，**本轮未独立密码学验证 DKIM 或发件人真实控制权**。PDF 中限定结论标记 `LIMITED`，但 `pdfsig` 检查未找到嵌入式数字签名，电子签名栏没有可验证证书/平台凭证；见证人六项选择使用实心圆点，仍缺独立复算原始 Host/Guest 清单的准确命令/rc、跨渠道预期 hash 来源记录、原件完整数量与签署时间精确 UTC。邮件所述与 PDF 附件是可保留的有限见证声明，**不能代替对本批私有 ZIP 原件的独立访问和逐件复算**；本审阅会话未获该 ZIP 字节。结论仅 `WITNESS EMAIL RECEIVED / PDF ATTACHMENT HASH MATCHED / LIMITED CLAIM RECORDED / INDEPENDENT RAW-EVIDENCE VERIFICATION NOT ESTABLISHED`，不得提升成 `VERIFIED` 或 `C1 PASS`。EML、PDF、完整邮件头和个人信息仅留私有档案，不入 Git。

**停点：**本续记不修改任何 Runtime 源码/观察器、启动器、CI、依赖、Prisma、17 Bundle、部署、VM 或生产策略；没有 GitHub CI/2C-C 实验或任何新 root/Guest/生产授权。`R1/C1 OPEN`、`C5-G2 NO-GO`、`S2 daily PAUSED`、`C2 ISOLATED SYNTHETIC LIMITED CLOSED`，`R1C-2C-C NOT AUTHORIZED`。

## 12. R1C-2C-C — 真实动态观察实验就绪与执行审批包（待审草案）

**2026-10-21 / LOCAL DESIGN AUTHORED / LIVE TRACE NOT APPROVED / C1 OPEN。**

### 1. 依据、边界与目标

- 基线为 `origin/dev@7638832a322a61f5c4fde6f62a63ca037750afad`，承接 [R1-C §9–§11](C5-G2-R1-B-只读GuestFD采集器与执行审批.md)、[R0 D1–D5/C1–C8](Runtime更新-R0冻结设计.md)、`AGENTS.md` 和现有 `ops/runtime/` 实现。PR #2891 只完成纯离线 v1 reviewer；PR #2893 / CI #7432 success 只登记 Host/Guest 能力调查与有限见证邮件，不认证真实消费。
- **本工作包的当前目标是设计并冻结下一批审批所需的对象、威胁模型、候选观察技术、证据格式适配差距、准确执行条件和停止规则；不代表执行实验。**
- Runtime/Ops 是唯一代码职责；不改变 17+Manifest、`NormalUpdateFlow`、`LaunchMaterials`、现役 Docker/部署拓扑、业务模块、Prisma、CI/依赖锁或生产策略。R2 的维护排他与 R3 AWS 快照不因观察研究而自动生效。
- 当前上限：`2C-C READINESS DESIGN / NOT READY FOR LIVE EXECUTION`。不新建 Guest 用户、权限/挂载、交换介质；不运行 `strace`/候选源码；不安装 `binutils`、不改 `ptrace_scope`、不使用 sudo/root、不接触 AWS 或生产。

### 2. R1C-2C-B 已取得的有限证据与剩余缺口

| 项目 | 已知范围 | 不得推论 |
| --- | --- | --- |
| Host | 批次 `003` v3 自动预检 17/17；`004` Host/Guest 操作员逐文件 SHA256SUMS 核对返回 OK | `003` 预检不能代替同次 `004` 的完整人工平台见证或持续隔离 |
| Guest | `004` SSH outer rc 0；UID 1000；23 项命令中 20 项 rc 0；Ubuntu 24.04.5 x86_64、kernel 6.8.0-146、Python 3.12.3、rootfs ext4 | 仅 SSH 返回 0/Guest 自报值，不证明可信 host key/Guest boot/mount namespace 的独立保管 |
| Observer | `strace` 6.8（命令 rc 0）、`ptrace_scope=1`、有效 capability 为零；无被批准的 tracing 执行 | 没有真实 fork/exec/clone/线程/映射 coverage 结果；普通用户不能推断可完整跟踪 root |
| 已知失败 | DMI UUID 普通用户读取 rc 1 / Permission denied；`readelf` 两项 rc 127 / executable not found；共享挂载和默认 IPv4 路由查询未命中 | 不自动提权、安装工具、声明无外联/无所有共享资产 |
| Witness | `R1C2C-B-004-WITNESS-EMAIL-001` 邮件和附件可有限匹配，结论 `LIMITED`；邮件头声明 DKIM/SPF/DMARC pass | 无独立完整 ZIP 原件复算/跨渠道 expected hash 来源及签署证书验证；不升级 Host/Guest provenance verified |

原始 SSH combined-channel warning 仍在，`004` 的准确 Host 状态、离机 witness 命令与回执仍待独立核对。若下一步审批依赖这些身份与保管链，须先补证；不能用模板字段 `verified=true` 代替。

### 3. 观察技术与信任分层

| 层级 | 候选职责 | 缺口 / 拒绝条件 |
| --- | --- | --- |
| 启动前进程/系统调用观察 | 经来源审阅的 `strace 6.8` 作为实验候选；观察 fork/clone/vfork/exec、open/read/mmap/exit、追踪器起止/子进程集合 | 它尚未运行；strace 本身及 loader/native 闭包未独立认证，trace 也不能证明实际消费的每个文件字节 |
| CPython 模块线索 | 附加且必须明确启动时点的 import/audit/origin 元数据，覆盖 `.py`、`.pyc`、zip、自定义 importer、builtin/frozen、`exec` | 后装 hook 无法回溯 Python/loader 启动；`-I -S -B` 不保证未读旧 `.pyc` |
| ELF/native 辅助 | 复用已有 `root_python_elf_static_hints.py` 等离线线索，实际 `PT_INTERP`、`DT_NEEDED`、`RUNPATH`、`dlopen` 必须映射到已消费对象 | Guest `readelf` 不存在；静态提示不是实际映射，也不能为了补齐表格擅自安装 |
| 来源及字节保护 | 基于独立 Ubuntu Release→Packages→deb/member、批准的非包源码与观察器来源 pin，绑定读/映射时 FD/文件身份及持续不可替换窗口 | 同路径/同 inode/执行前后两次 hash 不证明消费时未污染；真实保障方案尚未冻结 |
| 独立离机审核 | 接受真实 raw bytes 与独立保管 pins，调用现有 `r1c2_consumption_offline_review.py` 作结构审阅 | 现有 v1 永久 `decision=BLOCKED`，`CANDIDATE_REVIEWED` 不代表认证或允许安装 |

技术选型暂推荐**pre-exec 受控系统调用发现 + Python/ELF 补充 + 独立内容来源与文件保护 + 离线复核**。不采用事后单 PID `strace -p` 代替从启动前全量观察，也不通过虚构 `PROCESS_EXEC` 等方式让不符合实际的 trace 通过 reviewer。

### 4. v1 合同对接问题：必须在现场格式改变前复核

| 编号 | 源码已存在的限制 | 真实记录影响 | 允许的下一动作 |
| --- | --- | --- | --- |
| CONTRACT-01 | `_events` 对每个非观察器进程要求首个为 `PROCESS_EXEC`、末个为 `PROCESS_EXIT` 且 `PROCESS_EXEC` **恰一次** | fork-only child、clone/线程、重 exec 或退出丢失无法按真实内核时序归一化 | 先记录 raw 和 `EVENT_ORDER_INVALID/CHILD_UNTRACED`，不补造 exec；如确需支持真实语义，提交 v1→v2 合同修订另授权 |
| CONTRACT-02 | `session` namespace 与 `startDiscriminator` 要求 ASCII `ID=[A-Za-z0-9._:-]`，进程身份还要求固定拼接 `ns:pid:gen` | Linux 原始 namespace 常见 `mnt:[N]` / `pid:[N]` 不可直接填充 | 原始 readlink 作为独立 raw artifact；如果正规化，单独提出无损映射来源/冲突校验合同，未经批准不改变既有 reviewer |
| CONTRACT-03 | 原件最多 64 份、单件 ≤32 MiB、总计 ≤64 MiB；events ≤32768、封套 ≤32 MiB | 完整追踪可能超出预算 | 超出立刻 `EVENT_BUDGET_EXCEEDED/BLOCKED`；缩小**新批准的实验范围**，不截尾伪称完整；扩大预算需另授权 |
| CONTRACT-04 | v1 `rawArtifacts` 仅通用 kind 字段，`_raw_artifacts` 无按类别强制 stdout/stderr/rc 各有原件的细粒度保证 | 即使结构审阅成功，也不能用它证明全部标准流与内外退出码齐全 | 外部原件清单逐项独立核查；如欲程序自动强制，先审计并单独批准合同/校验增强 |
| CONTRACT-05 | `_files` 以 `fdIdentity` 作抽象引用，要求 `file.sha256==rawArtifact.sha256`、`size==byteCount` | 某些 trace 字节仅是 read 子范围/栈映射线索，不能等价于完整文件已消费 | 没有完整 raw 实际文件原件与独立持久保护时标 `BYTE_CONSUMPTION_UNPROVEN`，不将日志映射到伪文件原件 |
| CONTRACT-06 | `PROCESS_EXEC` 等 event / `PYTHON_IMPORT` / `ELF_LOADER` 需严格绑定文件与起止事件 | `strace` 一种信号不足以产生全部语义事实 | 保留 `IMPORT_ORIGIN_UNKNOWN`、`NATIVE_LOAD_UNMAPPED`，不推断不存在动态行为 |

**授权分界：**上述为差距登记，不是自动批准修改 `sanq.runtime.r1c2-consumption-evidence.v1`、解析器、数据预算或 Runtime 的 owner。两个备选路径：A) 只做不改变 v1 的有限 `DISCOVERY_ONLY` 生数据实验，未经承认证明就停；B) 在独立样本证据支持后，另审严谨的 v2 合同与其失败路径，获明确授权才修改。默认先 A；如果不能保证 A 的身份、预算和退出规则，也必须停在本工作包。

### 5. 分段实施与独立门禁（未授权，不得直接执行）

| Gate | 交付物 / 独立复核标准 | 当前状态 |
| --- | --- | --- |
| C0 — 原件与 Host/Guest 绑定 | 复核 `004` Host 与 Guest、准确 VM/VDI、Host-only、ssh host key、boot/ns、非生产资产和原始归档；形成不可由采集器自行签认的 pin/保管证据 | `LIMITED`；缺独立 raw 原件复算 |
| C1 — 完整实验候选固定 | 精确观察器 binary/loader/包版本/来源、独立来源 pins；准确拟观察的**无业务副作用、非 root** synthetic 子进程源字节/SHA、完整 argv/env、Guest 账号和 cwd | `NOT READY`；只有 strace version discovery |
| C2 — 精确实验批准 | 先交人类审阅：实际 VM/Host 管理通道、SSH known_hosts pin、起止 UTC、实验命令逐条 argv、cwd/env、UID、隔离检查、资源/超时/日志配额与事故停止方式；另获**准确命令和权限的明确授权** | `NOT APPROVED` |
| C3 — 受控无副作用 tracing | 仅在 C0–C2 成立后开展非 root、disposable Guest synthetic 程序 fork/exec/open/read/mmap discovery；观察器先于被测子进程启动、子进程退出后保全全部 stream/rc | `NOT RUN`；不触碰 Runtime root 核心或生产 |
| C4 — 离机与结构审阅 | 保留每个真实命令的 stdout/stderr 和 inner/outer rc、UTC、丢失/截断、父子关系、原始 namespace、budget、原始 file IDs、raw bytes 与独立来源 hash；用严格 reviewer 检查，任何不能表达或来源不明一律 `BLOCKED` | `NOT RUN` |
| C5 — 下一决策 | 比对观察器覆盖与 v1 合同、决定是否必须另提 v2 或 2D 完整候选准备；不得把 synthetic 正向路径当作完整 S6 | `PENDING` |

**建议的第一批现场实验最大边界（提案、不是当前授权）：**只允许普通用户的非 root synthetic 子进程；不设置内核策略、不用 `sudo`、不执行实际更新、不访问生产连接；单次 wall-time 上限建议 30 秒，raw trace 单份上限建议 8 MiB，并受既有 v1 更严格总配额和保密要求限制。超时/超预算的进程终止策略、证据受损与回滚仍须在准确命令审批中说明；不预先承诺事故自动恢复或 Guest 数据完全无变化。日志在 Guest 上的创建属于写操作，必须明确批准路径、umask、quota、离机转移与保留方式。

### 6. 真正 S6/C1 继续缺少的材料（不能由 synthetic 取代）

1. 冻结同一最终候选的**真实 bootstrap、全部 `UpdateCapabilities` effect adapters、配置与每个外部命令 argv/来源**；目前 `normal_runtime_launch.py` 仅 hash-only 提案，`NormalUpdateFlow` 是 in-process 核心，不是已准生产的安装器。
2. 经独立来源认证的 Python/loader、observer/辅助工具、非包模块和 native 闭包；真实读取或映射时文件身份与字节的持续不可替换保护。
3. 真实成功、拒绝和中断的全场景可达性、后代/namespace 完整覆盖与离机原件独立验证；当前 2B 结构审核仍永久 `BLOCKED`。
4. R2 持续维护禁入、R3 精确 AWS 快照、R4 正式安装/root 授权和 R5 同候选故障/恢复矩阵，仍独立开放；C2 限定 CLOSED 不能转化为生产 AWS 许可。

### 7. 本次交付停点和下一次需要的授权

本文件是 **docs-only readiness/approval draft**；不包含可立即运行的 `strace` 命令或 root/sudo 执行许可。实际实验命令必须在 C0/C1 身份与源码 pins、C2 操作员/独立见证/失败保全确定后，作为后续**单独精确审批包**提交，不继承 S5 或 2C-B 的 SSH 授权。

需要用户下一批明确决定：是否先解决 `004` 独立 raw ZIP 复算及准确 Guest identity；是否批准以后编制 C1–C2 的**非 root synthetic strace 精确命令**；任何证据 v1→v2、工具安装/运行权限变更或扩大范围都需要另授权。本文件本身**没有申请执行权限**。

本地 MCP-workspace 未开放测试/lint/build，本工作包没有代码或测试改动，也没有执行 Guest/VM/root/AWS/生产操作；GitHub CI 只在本文件经用户审阅、单独授权推送 PR 后才进行。**R1/C1 OPEN、C5-G2 NO-GO、S2 daily PAUSED、C2 ISOLATED SYNTHETIC LIMITED CLOSED、2C-C LIVE TRACE NOT AUTHORIZED。**

## 13. 2026-10-21 — R1C-2C-C / C0 原件离线复核与 C1 观察器候选冻结就绪（本地待审）

### 13.1. C0 实际原件复核：已通过的内容与未成立的身份认证

在**独立于采集 Mac/Guest 的只读文件分析环境**读取操作员提供的原归档 `R1C2C-B-004-witness.zip`，归档 SHA-256 为 `d1bc78e709591eade7df67584e7340b6c6cc14edae5b9f49b597c866f544139b`，与此前见证表中记录值相同。执行既有独立 C0 ZIP reviewer（无 Guest、SSH、VirtualBox、root、网络或原件更改），报告 `OFFLINE_SELF_CONSISTENCY_CHECKED / BLOCKED`：`hostManifestEntries=23`、`guestManifestEntries=97`、`payloadFileCount=98`、Host 17/17 自动检查真、Guest 23 个记录与 SSH 原始 JSON/解码文件字节一致、非零回执仅 DMI rc 1 和两条 readelf rc 127。归档无路径穿越成员或 symlink。核验报告 `externalPrePinnedArchiveShaMatched=false`，因为调用时未传独立前置签定 expected pin，后验跨文件相等**不能被替换为来源独立认证**。

**限定关闭**：`C0-OFFLINE-STRUCTURE = CHECKED`，但 `C0-IDENTITY/CUSTODY = OPEN`。Host 自动回执仍 `classification=DISCOVERY_ONLY`、`authorizationGranted=false`、`operatorIsolationAndHostIdentityReviewStillRequired=true`；Guest `result=DISCOVERY_ONLY`、`hostIndependentWitnessVerified=false`、`guestIdentityIndependentlyAuthenticated=false`、`sshCombinedChannelWarning=true`。见证邮件/PDF 声明 `LIMITED` 并有归档 hash，但尚缺独立采集前预冻结 pin 的渠道证明、见证人运行的逐项复算命令/退出码、准确 Host/Guest 现场身份及保管链。**不宣布 C0 全部 PASS，不从有限签名推导平台真实性。**

### 13.2. C1 当前已有来源与无法冻结的对象

| 角色 / 检查 | 来自真实 004 原件的已知事实 | C1 缺失的准确 pin / 下一步证据 |
| --- | --- | --- |
| trace observer | Guest 回执 `argv=['/usr/bin/strace','-V']`，rc 0，版本 `strace 6.8`；`ptrace_scope=1`，采集进程 `CapEff=0` | **准确 strace ELF 文件 bytes/SHA、device/inode、symlink 链、dpkg 包归属与发行原件关联、解释器/依赖 ELF/native、观察器实际启动权限**均未认证；不能由 `-V` 推导完整闭包 |
| guest Python / loader | Ubuntu 24.04.5、kernel 6.8.0-146、Python 3.12.3、rootfs ext4、`/lib64/ld-linux-x86-64.so.2` link 可读 | `/usr/bin/python3.12`、真实 loader/库字节、PT_INTERP/NEEDED/RUNPATH、包/member 独立 pins 与映射关系；原 Guest `readelf` 不存在，不安装 |
| synthetic 场景候选 | 预定 **non-root + disposable Guest + 非业务程序**，仅用于有限进程/syscall discovery | 尚无冻结的 source bytes/sourceCommit、scenarioID、完整 argv/env、cwd、uid/gid、读取目标的独立 pins、精确预期事件、日志预算/离机路径；暂不生成可直接运行的现场命令 |
| 身份与独立见证 | Host 17/17 自报检查、Guest 23 项非 root 取证，原件内部字节完整 | 现场前**重新确认** Host/Guest/VDI、SSH host key、Host-only/无 shares、boot ID/namespace/时间、介质交付与第二渠道 expected pins；`004` 旧会话不能证明将来会话身份 |
| 合同承载 | `r1c2_consumption_offline_review.py` 是纯离线、fail-closed v1，仅 `CANDIDATE_REVIEWED/BLOCKED` | 真实 clone/fork/re-exec 事件可能与恰一次 `PROCESS_EXEC`、ns ID 传输、byteEvidenceSource、raw stdout/stderr/rc 证据粒度或预算冲突；不得补造/截尾/放宽 v1 |

**C1 裁定**：`C1 PROPOSED OBJECTS IDENTIFIED / FREEZE BLOCKED BY MISSING BYTES, SOURCE PINS AND SESSION AUTHENTICATION`。可以继续**准备**下一轮只读来源材料采集审批，不允许将 `strace 6.8` 的版本号标记为 `OBSERVER_PINNED`，也不允许把 `ptrace_scope=1` 当作已验证 tracing 功能。需确认可追溯的 Ubuntu signed Release→Packages→deb/member 以及另外批准的非包源码来源；仅 Guest `dpkg-query` 不构成可信来源。

### 13.3. 最小 C1 后续计划与授权分割

**C1-PIN-001（建议单独只读审批）**：在唯一准确 Guest/Host 目标经操作员重新确认后，只采集 `/usr/bin/strace` / Python / loader/native 的真实文件身份、有限文件 SHA256/ELF 原件、安装包状态/准确归属、当前 boot/ns/权限、rootfs/mount 与 SSH provenance，保留每一命令完整 argv、原始 stdout/stderr/退出码、UTC、大小上限和 off-Guest custody。采集器只可使用已审 argv 白名单、普通用户与 SSH strict host key；涉及文件读取/网络传输的具体路径、复制大小、敏感环境边界必须写入**新的逐项执行审批**。不使用 `sudo`、不读 root-only DMI、不 `apt install`、不触发 `strace` 跟踪、不更改 VM/Guest/config。单独说明 Guest 不可读的 ELF/依赖字节会使 C1 继续 BLOCKED，不以宽权限绕过。

**C1-SYN-001（可先离线编制，尚未冻结/执行）**：从最新审定源码基线选一个标准库 Python 极小非业务探针，并明确两个独立场景：SYN-01 精确 exec/open/read/exit，SYN-02 fork/child exec/mmap/exit；预先冻结**实际源代码字节**、预期读取输入的原件哈希、完整 argv/env/cwd/UID、允许子进程、事件/时间/文件尺寸配额与失败/信号退出规则。执行前必须保证使用对象的时间窗口保护和离机证据保管；synthetic 观察永远不能替代最终 Runtime bootstrap + effect adapters 的真实 S6 同候选证明。

**C2 执行审批（单独）**：只有 C0-IDENTITY/CUSTODY 与 C1-PIN/SYN 的冻结材料达到可审阅状态，才能提交精确的 pre-exec non-root `strace`  argv、现场读取和写入路径、隔离复核/清理策略、事故中断、资源预算、独立回执给用户另批明确授权。凡需新增依赖/修改内核 ptrace/合同 v1→v2/跨 owner 变更，**先说明原因、影响、替代方案，另获明确授权，修改之前停**。

**本地停点**：本节仅为 Runtime/Ops 文档与证据摘要，不更改任何 Runtime code、observer、离线 reviewer、旧 evidence v1、CI、依赖、schema、Docker/AWS/VM；未运行 Guest 取证、trace 或更新。最高结论 `C0 STRUCTURE CHECKED; C0 IDENTITY OPEN; C1 FREEZE NOT READY; C2 TRACE NOT AUTHORIZED`。R1/C1 OPEN、C5-G2 NO-GO、S2 daily PAUSED。

## 14. 2026-10-21 — C1 观察器静态 Native 来源续审与后续 C0 / C1-SYN-001 交接（本地待审）

本节仅记录 §13 之后取得的操作员回执与独立离线审核原件；§13 保留当时状态，不追溯改写。原始 Guest ELF、SSH/Host 原始流、Ubuntu 包与可信 keyring 留存在私有离机证据档案，不提交仓库。后验归档 SHA、同一 boot ID、Host 17/17 自报、已签名发行索引的技术验证，均**不等于取证前经独立第二渠道固定的 Host/Guest 身份与保管链**。

### 14.1 分批证据及来源限定裁定

| 批次 | 已取得的证据 | 限制 |
| --- | --- | --- |
| `R1C2C-C1-PIN-001` | 已按另批非 root SSH 授权从 Guest 获取 `/usr/bin/strace`、`/usr/bin/python3.12`、`/lib64/ld-linux-x86-64.so.2`、`/lib/x86_64-linux-gnu/libc.so.6` 四份 ELF 原始文件，操作员 `SHA256SUMS` **13/13 OK**、SSH 外层 rc `0`；`dpkg-query -W` 内层 rc `0`，原路径 `dpkg-query -S` 内层 rc `1`，定位 libc 的 `/lib/` → `/usr/lib/` 路径别名问题 | `PIN_DISCOVERY_PARTIAL / BLOCKED`；不能因四份文件采集成功将整批改记 PASS；未在本审阅环境独立读取 PIN-001 的 Guest 原始 ELF、Host/Guest 身份或运行期消费 |
| `R1C2C-C1-PIN-002` | 独立批准的补充**三项查询、无 ELF 再采集**：`dpkg-query -S -- /usr/lib/x86_64-linux-gnu/libc.so.6`、同命令查 `ld-linux-x86-64.so.2`、`dpkg-divert --list /lib64/ld-linux-x86-64.so.2`；三条内层 rc **0/0/0**，操作员 `SHA256SUMS` **12/12 OK**，解析 libc/loader 归属 `libc6:amd64` 与 loader diversion 线索 | `PIN002_DISCOVERY_CAPTURED / BLOCKED`；dpkg 数据只是 Guest 安装库线索，不是发行包来源信任根、独立身份见证或动态加载证据 |
| `C1-SOURCE-STRACE-001` | Ubuntu `noble` 签名 `Release → Packages.xz → strace_6.8-0ubuntu2_amd64.deb → usr/bin/strace` 独立离线复验；包内 ELF SHA `28f957c227012de0b18d1bd7fff2d396cb693ea60ed8013be68de071e84b5001` 与 C1-PIN-001 操作员报告相符 | 冻结 `review_strace_offline.py` 对合法多 Stream XZ 误拒绝，**不能标记旧自动审核器 PASS**；Guest 字节与动态消费未经该项独立原始复算 |
| `C1-SOURCE-LIBC` | 已保存 R1-A 的 `noble-updates` 签名索引、`libc6 2.39-0ubuntu8.9`、`python3.12-minimal 3.12.3-1ubuntu0.17` 的包成员离线复验与 Guest 报告 SHA 对照匹配 | R1-A keyring 的先前批准范围不消除 Host/Guest 独立身份缺口 |
| `C1-OBSERVER-NATIVE-001` | 第一次 SSH 建连超时，rc `255`；操作员报告失败证据清单 6/6 OK，原目录保留 | `NATIVE_DISCOVERY_PARTIAL`，不是成功采集；不覆盖或删除 |
| `C1-OBSERVER-NATIVE-002` | 单独批准的非 root Guest 只读采集，SSH rc `0`、三份 ELF `3/3 CAPTURED`、两项 `dpkg-query` rc `0`、Mac 自报清单 13/13 OK；安装版本 `libunwind8=1.6.2-3build1.1`、`liblzma5=5.6.1+really5.4.5-1ubuntu0.3`、`libc6=2.39-0ubuntu8.9` | **本离线审核环境没有收到 002 三份 Guest ELF 的原始归档**，只能称“操作员报告的 SHA 匹配”，不能称独立 raw PASS |
| `C1-OBSERVER-NATIVE-SOURCE-001` | 经单独批准的两个准确 HTTPS GET，归档 SHA `7d983097398526b4537208c8586c791abcd712974ca39681979b7809aac3e9e0`；离线核验 11 个归档成员、Ubuntu `noble-updates` `Release.gpg`（`gpgv rc=0`、`VALIDSIG F6ECB3762474EDA9D21B7022871920D1991BC93C`）→ Packages → 两份准确 `.deb` → 三份包成员，SHA 与 002 报告相符 | 签名验真基于已封存/既定 keyring；不证明 002 原始 ELF 已在本环境独立复算，亦不证明取证机器身份 |
| `C1-OBSERVER-NATIVE-003` | 单独授权仅采 `/usr/lib/x86_64-linux-gnu/libunwind.so.8` → `libunwind.so.8.0.1`；SSH rc `0`、非 root UID/EUID 1000、没有 dpkg 或 trace。原始归档 SHA `c8e58e483d5c667b83734fc28c8dc0b702f74b7e101bd02a3422f86334ad3cc4`；独立审核 8 个归档普通文件、内部 7/7 SHA、36/36 离线检查；从 SSH stdout 解码的 **63,776 B 原始 Guest ELF** 与归档及经签名索引绑定的 `libunwind8_1.6.2-3build1.1_amd64.deb` 成员**逐字节一致** | 仅该单文件可判独立 raw/source member MATCH；Host-005 17/17 和人工复核来自同批自报 `host-context`，不等于 C0 独立身份验收；未运行 `strace` |

本次识别的 Native 成员摘要（前三项来自官方包内独立重算且匹配 **002 操作员报告**；第四项另获 **003 Guest 原始字节独立复算**）：

| ELF | 字节 | SHA-256 | Guest 验证层级 |
| --- | ---: | --- | --- |
| `libunwind-ptrace.so.0.0.0` | 18,656 | `ec993e45c024b66ea0f17085be1333001428dc714bd9f0520f44a0cde18b921b` | 002 报告 SHA MATCH |
| `libunwind-x86_64.so.8.0.1` | 67,672 | `70a88c376a1aced719ca7bdcd5cdd6c5d3bdce44b99f5ab2037fdad096bbf03d` | 002 报告 SHA MATCH |
| `liblzma.so.5.4.5` | 202,904 | `696e868dd0700a19a6d65fc01608ec2d70d3cb91f65710e89180cd2e688f30cb` | 002 报告 SHA MATCH |
| `libunwind.so.8.0.1` | 63,776 | `28e77a498f2f17f8cb883c91303f9901343ea0d8e34959d138dd462fcc9b201f` | 003 Guest raw + 包成员 BYTE-IDENTICAL |

独立静态 ELF `DT_NEEDED` 分析：`strace` 引用 `libunwind-ptrace / libunwind-x86_64 / libc`；`libunwind-x86_64` 进一步引用 `libunwind.so.8 / liblzma / libc`，新补 `libunwind.so.8.0.1` 直接需要 `libc.so.6`、`ld-linux-x86-64.so.2`、`liblzma.so.5`。已识别的静态候选图中**未发现新的待补采 ELF**，可限定为 `KNOWN STATIC DT_NEEDED CANDIDATE: NO IDENTIFIED MISSING ELF (LIMITED)`；不等于完整 `dlopen`/CPython import/native 映射、真实读/执行时消费、不可替换窗口或 Runtime S6 的证明。

### 14.2 C1-HOST 现场预检批次与 Observer 对象登记

这些都是 **Mac Host 的现场只读取证/预检**，不是独立身份来源证明，也不是 Guest 追踪。使用的是已审阅的独立 Mac v3 工具 `collect_r1c2c_b.py`（SHA-256 `c7a5d712b7078edf31fefae5e5899449c478cd7b44495c777b6f5ee5b9b32781`），输出 Host 原始标准流/退出码、VM/VDI/Host-only 隔离线索及 `SHA256SUMS.host`。17/17 自动检查通过需要 23 份原始证据和人类独立身份复核；**自动通过 ≠ C0 PASS**。

| C1-HOST 原件目录 | 对应取证批次与已知结果 | 独立核查状态 |
| --- | --- | --- |
| `R1C2C-C1-HOST-001` | C1-PIN-001 的新 Host 预检目录；批准计划要求独立 VM/VDI、Host-only/SSH 身份人工复核、17/17 自动检查 | 本轮未收到完整 HOST-001 原件/全部 rc，不回填 17/17 PASS 或独立身份认证 |
| `R1C2C-C1-HOST-002` | C1-PIN-002 的新/有效期内 Host 预检；PIN-002 批次成功查询不消除原 PIN-001 部分失败 | 未取得 HOST-002 全量原始证据及独立事前 pin，不推断跨批次身份连续性 |
| `R1C2C-C1-HOST-003` | C1-OBSERVER-NATIVE-001 前置 Host 预检；虽之前报告自动 17/17，Native-001 SSH 建连超时、未读取 ELF | Host 门禁自身不保证随后 SSH 可达；失败证据需原样保留；无 Host-003 独立全量复验 |
| `R1C2C-C1-HOST-004` | Native-002 单次重试的新 Host 前置批次；Native-002 采集器通过了 Host 上下文门禁后取得三个 ELF 与两条 dpkg 查询 | 未在本轮取得 HOST-004 全量原件/第二渠道身份固定；不把采集成功倒推出 Host 身份认证 |
| `R1C2C-C1-HOST-005` | Native-003 单文件补采前置新 Host；其已上传 `host-context.json` 自报 `automatedChecksPassed=17`、`manualReviewConfirmed=true` | 仅为 Native-003 附带的操作员/工具回执，**缺 HOST-005 全量原件独立复算与身份见证** |

先前 `R1C2C-B-003/004` 属于另一批 Host/Guest 能力调查及有限见证，不能改名成 C1-HOST 或跨会话代替预检。Host 原件中的 VM/VDI/SSH/网络标识与真实路由、安全策略应留私有档案；后续 C0 审核应列出每批原始回执、采集前独立 pins、UTC、known_hosts 审批来源、介质交接和独立复核的缺失/满足项，不能仅做自动检查计数归档。

**C1-OBSERVER 名称边界：**本轮仓库与现存本地资料没有可核实的独立 `C1-OBSERVER-001` 执行批次。已完成的「观察器来源」是 `C1-SOURCE-STRACE-001` 与 `C1-OBSERVER-NATIVE-SOURCE-001` 的官方签名包/成员静态核验；「观察器 Native Guest 文件」是 `C1-OBSERVER-NATIVE-001/002/003` 的失败、补采与有限独立原件审核。原 `R1C2C-B-004` 的 `strace -V` 仅为版本发现，**没有实际 strace trace**。不因为“OBSERVER”存在工具/来源准备就虚构已经运行观察器。真正 `C1-SYN-001` 和 C2 live trace 仍在方案审批前，不存在观察输出或消费 PASS。

### 14.3 先前来源/取证测试的原始技术回执

**基础四 ELF 的来源验证（C1-SOURCE-LIBC）：**独立审核者只读检查 `R1A-private-review.tar(1).gz`（归档 SHA-256 `7ebd8a8fabf78c586ad0055b4c4049f0f99e14f06d91020e2150d7ec802e453a`）；归档 268 个普通文件、`review/PAYLOAD-SHA256SUMS` 266/266 匹配，六批清单分别为 HOST 15、GUEST 45、SOURCE-INDEX 18、DEBS 35、MEMBERS 92、BASEFILES 50。重验原始 `noble-updates` `Release.gpg` 与 `Release`，`gpgv rc=0`、`VALIDSIG F6ECB3762474EDA9D21B7022871920D1991BC93C`，已冻结 keyring SHA-256 `80a36b0a6de2f69f49d2df75ef473ccde121e9e190b9ea01d20a4f63778d5c31`；签名索引 `main/binary-amd64/Packages.xz` SHA `424e9966d4d549da3f08f0737b0cefbcfffd76464ba25efee146647b198bd6f5` 与原件一致。包内真实普通文件成员分别为：`libc.so.6`（2,129,424 B，SHA `3a15d66867d83762c7f2f1e37359cb8f6c5743edb369c65285cb0b1c4f7498bf`）、`ld-linux-x86-64.so.2`（236,616 B，`c20a2dc8917c755f02b94049356320fe1f62ac7d9f8994731f807d9df39302da`）、`python3.12`（8,020,928 B，`e50d468e8b0adfb05733f5b87b3cff34829c4a8c1aea50c865aa8bdfe4bb150f`）。这些官方原件**独立复算结果与 PIN-001 操作员报告一致**，不是对 PIN-001 Guest 原始文件重新读取，也不是 C0 身份证明。旧 PIN-001 `dpkg-query -S` 原始路径失败由 PIN-002 的补充查询解决，不删除旧失败回执。

**观察器来源验证（C1-SOURCE-STRACE-001）：**经用户批准的官方对象只读取得、再上传独立审阅的 `C1-SOURCE-STRACE-001-review.tar.gz` 原始归档 SHA-256 `b5eee402222be4f9257b26411b55e4b49c8d76a49b5742c4bdb069f49a764cdc`；6/6 归档文件合规，内部 `SHA256SUMS` 5/5，`fetch-manifest.json` 4/4 下载对象字节吻合。使用已保存的既定 Ubuntu Archive keyring 对 `noble/main/amd64` `Release.gpg → Release` 验签：`gpgv rc=0`、单个准确 VALIDSIG，故意修改 Release 一个字节的负例被拒绝。Release `2024-04-25` 签名覆盖的 `Packages.xz` 为 1,401,160 B、SHA-256 `2a6a199e1031a5c279cb346646d594993f35b1c03dd4a82aaa0323980dd92451`；其中 `strace_6.8-0ubuntu2_amd64.deb` 为 584,172 B、SHA-256 `d588810ae26b06fee6678dc81e5b54f6efcde8e718e4589adb4d11d254b9820b`，包内 ELF `usr/bin/strace` 为 2,087,432 B、SHA-256 `28f957c227012de0b18d1bd7fff2d396cb693ea60ed8013be68de071e84b5001`，与 PIN-001 操作员报告 SHA 匹配。**原冻结自动审核器并没有 PASS：**该 `Packages.xz` 有合法的第二个空 XZ Stream（32 B），冻结的单 Stream `lzma.LZMADecompressor` 将其 `unused_data` 错当非法尾部，返回 `UNSAFE_OR_TRUNCATED_XZ / BLOCKED`；另外执行的 `xz --test` 和独立完整多 Stream 解压、索引/包 SHA 验证通过。此为**限定范围的独立来源技术核查 PASS**，不得把冻结审核器的 FAIL 更写成 PASS；后续如果修复，必须另审源码、恶意尾部/截断/预算负例和新 SHA。

**Host / Session 关联：**PIN-001 与 PIN-002 的现场 Host v3 预检、以及随后 Native-001/002/003 使用的 HOST-003、HOST-004、HOST-005，为不同时间窗口的操作员批次，不允许用一批旧 17/17 替代下一批；每份 Host 结果需要核对完整原件、23 项证据清单、真实 17 个自动门禁、VM/VDI/Host-only 及人工身份见证、SSH known_hosts 预先批准指纹、当次 Boot ID/ns/UTC。当前仅记录操作员回执、采集器对 Host context 的门禁和 003 原件中 Host-005 的自报；**没有得到这几次 Host 全量原件的独立认证**。Native-001 失败是 TCP 建连超时（未经认证通道，未进入文件读取），Native-002/003 是后续各自独立新证据目录的成功只读采集；不同批次不可合并伪称一次连续受保护执行会话。

### 14.4 保留门禁与后续审批拆分

1. **C0-IDENTITY/CUSTODY = OPEN。** 复核既有 `R1C2C-B-004` raw 原件与有限 witness、Host-005 的完整原件/准确 VM/VDI/Host-only/SSH known_hosts/boot/ns/时间和证据交接记录；把采集器自身 `17/17`、后验 hash 与外部**事前冻结** pin 的第二渠道分别列明。没有的证据必须记为缺失，禁止事后伪造；先设计证据矩阵和见证方案，任何新 Guest/Host 采集另报准确命令并获批。
2. **C1 静态来源 = 限定完成 / 原件复算仍有缺口。** 003 单文件 Guest raw 对签名包成员 PASS，002 三份 Guest 原始 ELF 未在本环境独立复验；补齐优先受控离机转交已有原件，不默认重新 SSH。不把静态 `DT_NEEDED` 收口扩大成运行期来源闭包或整体验收。
3. **C1-SYN-001 = DESIGN PENDING / NOT EXECUTED。** 下一独立设计阶段按 §12–§13 分开冻结两个非业务、非 root、可丢弃 Guest 场景：`SYN-01` 精确 exec/open/read/exit 和 `SYN-02` fork/child exec/mmap/exit。设计须列出标准库探针真实源字节/SHA、输入 pins、完整 argv/env/cwd/UID/GID、子进程关系、UTC、stdout/stderr/内外 rc、超时/输出上限、失败保留和证据保管/隔离/见证；**先形成只读审批草案**，不直接运行 `strace` 或 synthetic 程序。
4. **C1 动态消费 / v1 合同 = OPEN。** §12 记录的 fork-only、重 exec、namespace ID、预算和证据粒度限制继续有效。若确需 v1→v2、新依赖/权限/架构职责改变，说明原因、影响及不变更合同的限定 `DISCOVERY_ONLY` 备选方案，获独立授权后才实施。C2 精确 trace 命令仍未授权。
5. **总门禁不变。** `R1/C1 OPEN`、`C5-G2 NO-GO`、`S2 DAILY PAUSED`；C2 限定合成恢复 CLOSED 不等于 C1 动态消费 PASS；R2–R5、S6、AWS、root、安装与生产均未被放行。

**本地改动/交接边界：**此续记只同步文档证据与待审工作项，不修改 Runtime、观察器/离线审核器、v1 合同、测试、CI、依赖、schema、Docker/VM/AWS 或生产权限。本次没有新 SSH/trace/Guest/root 执行。依 `AGENTS.md` 先本地审阅，**远端 PR、CI 与合并须经用户在审阅后单独授权**；合并后再开始 C0 与 C1-SYN-001 **设计与审批准备**（非现场运行授权）。

**当前裁定：**`NATIVE-003 INDEPENDENT RAW MATCH / NATIVE-002 OPERATOR-REPORTED SHA MATCH / KNOWN STATIC DT_NEEDED LIMITED / C0 OPEN / C1 DYNAMIC OPEN / C5-G2 NO-GO`。

## 15. 2026-10-21 — R1C-2C-C / C0 身份与保管链实际执行证据补录（非重新取证）

**补录性质：**本节依据 2026-10-20～21 已执行的 `R1C2C-B-004` 采集、操作员摘要复核、独立见证回邮/署名 PDF 和随后独立离线 ZIP 结构审核，整理**实际发生的工作**。它补充 §11、§13、§14 当时的阶段记录，不回写历史门禁、不声明新执行了 Host/Guest 命令。准确区分两层状态：

- **工作已做：**`C0 CAPTURE / OPERATOR MANIFEST RECHECK / WITNESS LIMITED STATEMENT / OFFLINE RAW ZIP STRUCTURE REVIEW = EXECUTED`；不再把这些活动笼统描述成“尚未进行”。
- **认证未关闭：**`C0 IDENTITY & END-TO-END CUSTODY ATTESTATION = OPEN / LIMITED`。独立见证人的 `LIMITED`、原件一致及后验 SHA 相同，不构成采集前身份 pin、现场 Guest 来源、介质连续保管或真实 Runtime 消费认证；不能写 `C0 PASS`。

### 15.1 历史实际操作与可公开证据索引

| 证据/时间 | 已执行的工作与明确结果 | 验证层级与不得外推的范围 |
| --- | --- | --- |
| `R1C2C-B-003` / 2026-10-20 | Mac Host v3 自动预检 17/17；由后续 `004` 的 Host/Guest 采集继续形成见证包。 | Host 工具/操作员现场自报，不能跨批次证明 Guest 精确身份；`003` 不充当 `004` 的完整独立见证。 |
| `R1C2C-B-004` / 2026-10-20 | Host/Guest 只读采集已执行；Guest SSH outer rc `0`、非 root UID `1000`、23 项中 20 项 rc `0`；DMI UUID 读取 `rc=1`（Permission denied），两条 `readelf` `rc=127`（command not found）；Guest 结果为 `DISCOVERY_ONLY`，保留 combined-channel warning。 | 已记录现场命令结果及异常，不视为所有身份/隔离要求通过；没有安装、提权或执行 `strace` 追踪。 |
| 操作员 `SHA256SUMS.host` / `SHA256SUMS.guest` 复算 | 两份清单逐件 `OK`；形成供后续转交及核验的原件。 | 证明操作员现有文件与其本地清单一致，**不是独立事前摘要固定或来源见证**；完整逐项命令与 rc 未从见证人一方独立取得。 |
| 私有原件 `R1C2C-B-004-witness.zip` | 原始归档 SHA-256：`d1bc78e709591eade7df67584e7340b6c6cc14edae5b9f49b597c866f544139b`；PDF 中的原件值/其记载的预期值与该值相同。 | PDF 的预期值来源及其是否**在采集前经独立第二渠道冻结**未有可审计原始记录；后验相同不补足该门禁。 |
| `R1C2C-B-004-WITNESS-EMAIL-001` / 2026-10-21 收取 | 已收到独立见证人回邮 `.eml` 和同封签署 PDF；邮件及 PDF 选择 `LIMITED`，认领对所收到材料及可复算一致性的有限见证。 | **见证流程实际已执行并回复**，但签署表没有给出完整 Host/Guest 逐项复算命令/退出码、准确原件数量及签署 UTC；不可将该声明改写为全链独立验真。 |
| `SanQ-R1C2C-B-004-Witness-Signature.pdf` | PDF SHA-256：`85440dc4d25600d7dadd5334c304d08a4cad46715b1c96136fafc89f4fccf166`；邮件正文声明值、邮件附件实际摘要、先前单独上传的同名 PDF 字节相符。 | 是**附件字节和回邮陈述的一致性**；`pdfsig` 未发现嵌入式数字证书签名，邮件头 `dkim/spf/dmarc=pass` 为头部声明，未在此完成独立密码学验证或发件人控制权认证。 |
| 独立离线 ZIP reviewer / 2026-10-21 | 在独立于采集 Mac/Guest 的只读分析环境实际读取上述 `004` 私有 ZIP：Host manifest 23 项、Guest manifest 97 项、payload 98 个普通文件；Host 17/17、Guest 23 项原始 SSH JSON/解码字节一致，异常 rc 保留；无路径穿越成员或 symlink。结果 `OFFLINE_SELF_CONSISTENCY_CHECKED / BLOCKED`，`externalPrePinnedArchiveShaMatched=false`。 | **这一步已独立读取并复核 ZIP 内部原件**，纠正此前“该审阅会话未获 ZIP”的时间性描述；但 reviewer 未获得采集前由独立渠道冻结的 expected pin，也不能替见证人补作现场身份或连续保管认证。 |

邮件/PDF 的有限结论是 `LIMITED` 而不是 `NOT DONE`；独立离线 reviewer 对 ZIP 内部结构的检查已经执行，但其 `BLOCKED` 仍是来源授权判定。两种复核不是同一执行主体、同一时间的证明，不应混合成单一 `PASS`。见证签署表标记 `DISCOVERY_ONLY / NOT AN EXECUTION AUTHORIZATION`。

### 15.2 C0 身份与保管链逐门禁登记

| 门禁 | 执行/证据状态 | C0 认证裁定及仍缺的材料 |
| --- | --- | --- |
| 原件采集与本地双清单核验 | **EXECUTED** — `004` Host/Guest 原始材料及两份 SHA 清单核过 | `CHECKED / LIMITED`；操作者清单匹配不等于采集时 Host/Guest 独立认证。 |
| 见证人接收、审阅、回邮与署名 PDF | **EXECUTED** — `WITNESS-EMAIL-001` 和 PDF 已收取；附件字节一致 | `WITNESS STATEMENT LIMITED`；见证人逐项原件验证的命令/rc、签署准确 UTC 和独立签名凭据未建立。 |
| 独立只读原件结构审核 | **EXECUTED** — 独立分析环境实际读取 `004` ZIP | `C0-OFFLINE-STRUCTURE CHECKED`；这是离线自洽性而非现场 provenance。 |
| 采集**之前** Host/Guest/VM/VDI/SSH known_hosts 身份的第二渠道 pin | **NOT ESTABLISHED** — 工具输出、同批 host/guest 自报及后验归档值已有 | `OPEN`；缺采集前批准的独立身份、host key 指纹来源、当次 boot/ns/UTC 对照与跨批次连续性见证。 |
| 原件离机交付、独立渠道 expected hash 与保管人/交接时间 | **PARTIALLY DOCUMENTED** — 有 ZIP 标识/哈希、邮件/PDF 回执 | `OPEN`；缺交付介质、各跳交接/接收人及准确 UTC、事前 expected pin 的独立渠道凭据；不得据回邮反推完整连续保管链。 |
| 当前后续 C1-HOST-001～005 各会话身份 | **SEPARATE BATCHES / NOT INFERRED** | `OPEN`；不得用 `004` 的 witness 或其中一次 17/17 自动门禁跨会话覆盖；详见 §14.2。 |

### 15.3 C0 补录收口与下游限制

- **C0 执行记录补录：完成（文档层）。** 历史采集、复算、见证回邮/署名 PDF、离线原件结构审核均已明示为实际执行；不要求为“补文档”重跑既有采集。
- **C0 身份/全链保管认证：仍 `OPEN / LIMITED`。** 如需升级裁定，优先审阅**已有私有**独立渠道事前 pin、原始见证复算命令/rc、准确身份与交接 UTC/介质凭据；确实缺失则标为缺失，不能事后制造采集前证明。任何后续新 Host/Guest/SSH 操作须另审准确命令并获明确授权。
- **后续边界不变：** `C1 DYNAMIC CONSUMPTION OPEN / C2 LIVE TRACE NOT AUTHORIZED / R1-C1 OPEN / C5-G2 NO-GO / S2 DAILY PAUSED`；任何 `strace`、root、正常更新、VM、AWS 或生产动作均未因 C0 文档补录获准。

**保存与隐私：** `004` ZIP、原始 stdout/stderr、SSH/VM/VDI/host key/boot/network 识别信息、EML 完整头、PDF 及见证人身份仅留独立私有档案；Git 只登记脱敏 ID、摘要、范围和负面/有限结论。此次为类别 A 的 docs-only 状态补录，不改变 Runtime/Ops 代码、合同、权限、17 Bundle、CI、依赖、schema、架构边界或生产。MCP-workspace 不执行 lint/build/test，先供用户本地审阅，远端推送/PR/CI 需单独授权。

## 16. 2026-10-21 — R1C-2C-C / C1-SYN-001 受控动态观察设计与审批准备（本地待审）

承接 §14.4 与 §15，已从最新 `origin/dev@0fc583b0` 审阅 v1 离线 reviewer、对应聚焦测试、`normal_runtime_launch.py` 与既有 R0/2C-C 边界。在不改变 v1、Runtime owner、Guest/权限或生产的前提下，准备了 [C1-SYN-001 精确设计及逐项审批草案](R1C-2C-C-C1-SYN-001受控观察设计与审批草案.md)，以及两个不具执行权限的 `.py.txt` 纯文本 source 候选和一份固定合成输入；分别针对 `SYN-01 exec/open/read/exit`、`SYN-02 fork/child exec/mmap/exit`。草案记录原始字节大小/SHA、拟议准确 argv/env/cwd、身份与来源 pin 的缺口、观察预算、失败保全、独立见证和未来授权门禁。仅文档源候选，未运行、未向 Guest 转交。

**关键兼容性风险：**当前 v1 reviewer 强制非 observer 进程的首事件为唯一 `PROCESS_EXEC`、末事件为 `PROCESS_EXIT`，不能直接表达全部真实 fork-only/重 exec 时序；若实验发现不兼容，只能如实记录 `EVENT_ORDER_INVALID/CHILD_UNTRACED`，不得伪造事件、修改 v1 或把 `CANDIDATE_REVIEWED/BLOCKED` 提升为授权。既有 C0 `LIMITED` / C0 离线结构 CHECKED 被真实复用但不充当将来会话的独立身份/保管认证，C1-NATIVE-002 原始文件独立复算和观察器来源候选缺口仍在。**当前裁定：`C1-SYN-001 DESIGN PREPARED / NOT EXECUTED / C0 IDENTITY-CUSTODY LIMITED / C1 DYNAMIC OPEN / C5-G2 NO-GO`。** 下一批只可另行提交准确 A0–A2 审批材料；没有新 SSH、strace、root、Host/Guest、VM/AWS、更新执行、安装或生产授权。纯 docs-only 准备，MCP-workspace 不运行 lint/build/test，远端须用户审阅后另行授权。

## 17. 2026-10-21 — C0-EVIDENCE-RECONCILIATION-001 独立身份与保管链原件复核（本地待审）

在 PR #2901 / CI #7448 SUCCESS、`dev@144abbd1` 合并后开启独立 C0 分支，以 [C0 证据复核矩阵与后续材料清单](R1C-2C-C-C0独立身份与保管链证据复核.md) 继续 §15 历史操作补录之后的真实缺口追踪。本批**重新审阅邮件附件原始 PDF 字节**，SHA256 `85440dc4d25600d7dadd5334c304d08a4cad46715b1c96136fafc89f4fccf166` 与邮件正文一致；PDF 6 项首选由实心圆点标记（用户确认表示已选择），但见证时逐项命令/rc/差异原始凭据没有在表内填写，见证结论 `LIMITED`，介质声称 `email`，但没有事前第二渠道 expected hash 的消息原件或精确交接时间线。PDF 的本地生成元数据及邮件时间戳不构成采集前身份/授权证明。现已取得独立见证 ZIP 原件与 B-001～004 四批历史包并重新离线核查：B-001 Host 20/20、B-002 Host 23/23、B-003 Host 23/23 + Guest 28/28（SSH rc255）、B-004 Host 23/23 + Guest 97/97（SSH rc0，23 条记录）；B-004 98/98 项与旧 witness ZIP 逐字节一致。详情见新增证据复核文档 §5。后续现又取得完整 C1-HOST-001～005 原始包 `归档 2.zip`，逐批 Host 清单均 23/23、7/7 命令原始 receipt/标准流完整匹配；C1-HOST-001 仅 `vmRunning=false`、工具检查 16/17，C1-HOST-002～005 为 17/17。归档 SHA256 `2ef869603ae00cf62b195fe9b0d59abdf5c8978c89827a6a38bf443749acb0b8`，核验详情见新文档 §6。五批仍不具独立事前身份/SSH pin 与 Guest 绑定的证明。

下一步只应先从已有私有原件中复核 Host/Guest/SSH 事前批准、known_hosts 来源、原始清单复算/rc、见证人历史工作底稿、每次封存/交接 UTC 以及 C1-HOST-001～005 的逐批凭据；缺失则诚实记录未建立，不要求事后伪造。既有 S1-W1/R1 的 Ubuntu 来源链可作为 C1 软件包来源历史材料，但不能替代 C0 平台身份。**裁定：`C0 CAPTURE EXECUTED / OFFLINE STRUCTURE HISTORICALLY CHECKED / WITNESS PDF CONTENT-HASH CHECKED / IDENTITY-CUSTODY OPEN-LIMITED`**。本批未运行 Guest/SSH/strace、未发信、未修改 v1/Runtime/生产；远端未提交，需用户另批。

## 18. 2026-10-22 — C1-SYN-001 A0–A2 离线预检与逐项审批源代码准备（本地待审）

**依据：**2026-10-22 最新 `dev@9845e698`（PR #2903）已将历史 C0 按新 R0 §4.1 **`CLOSED / LIMITED-ACCEPTED`** 限定关闭；上述 §14–§17 为准确时间范围内的旧审阅记录，不再把缺第三方签署/逐跳交接当作 A0–A2 必须重做历史 C0 的理由。R0 只要求与 Runtime 安全/稳定/可恢复有关的最小必要证据，既有 C1-SYN-001 两场景属于可丢弃 VM 上的**专项动态观察**，不要求无条件追踪全部 Python/ELF/dlopen 来源。

**新工作：**在 Runtime/Ops owner 内新增只消费调用方 `bytes` 的 `c1_syn001_approval_offline.py` 与聚焦 `unittest`，校验既有三个 inert 源文件的固定 SHA256/大小、现场声明精确字段和身份/SSH 摘要一致性，仅生成 SYN-01 和 SYN-02 的准确 `argv`、白名单环境、cwd/umask、30s/8MiB/4MiB 预算与失败保全方案。代码不打开路径、不运行命令、不连接 Guest/SSH、不提升权限；即使全部声明匹配也仅 `CLAIMS_CONSISTENT_ONLY`，`a0Approved/a1Approved/a2ExecutionAuthorized/guestExecutionAllowed/readyToInstall/productionAuthorized=false`。实际 Host/VM/VDI/SSH trust 仍须执行前从受控来源核对，不能靠同一输入自报成功。精确方案和门禁见 [C1-SYN-001 A0–A2 审批包](R1C-2C-C-C1-SYN-001-A0-A2离线预检与执行审批.md)。

**没有新增观察权限**：A0 现场检查、A1 现场文件投送与 native/source pin、A2 真实采集器/写路径/受控执行命令都需逐项批准；A3 SYN-01 与 A4 SYN-02 的真实 strace 更需分别批准。本批不改 `r1c2_consumption_offline_review.py`/v1、Runtime 正常更新核心、Root/AWS、CI/依赖/Prisma 或生产。CI 应在用户授权提交远端后按现有 Runtime unittest lane 核实；MCP-workspace 不运行 lint/build/test。**状态：`C0 CLOSED LIMITED-ACCEPTED / C1-SYN-001 D0 MATERIALS PROPOSED / A0–A2 APPROVAL OPEN / A3–A5 NOT EXECUTED / C5-G2 NO-GO`。**

## 19. 2026-10-22 — C1-SYN-001 / A0-SITE-001 Mac Host 现场只读命令审批范围（本地待审）

PR #2904 / CI #7454 已针对离线审批模块与 15 项测试通过并 squash 合并 `dev@035480312048b2af91ab24d3e184397cab2873a2`，仅说明**代码和离线测试已合格**，不代表真实 VM/SSH 已经检查。已基于此最新 `origin/dev` 创建独立文档分支，编写 [A0-SITE-001 Mac/VirtualBox Host 只读检查的准确 argv 候选和后续 Guest 门禁](R1C-2C-C-C1-SYN-001-A0-SITE-001现场只读审批包.md)：八条 Mac 读取类命令分别定位已批准 VM/VDI、运行状态、Host-only 网络与转发设置；只用占位标识，操作者须在私有环境从已认可来源核对准确 UUID/网络，禁止自动挑“最新”。Guest/SSH 的 boot/UID/ns/host-key 检查属于后续单独审批，暂不连接；首次 SSH 主机 key 须从受控 VM 控制台确立信任，绝不盲目 accept-new。所有 raw/真实设备标识留私有、不进 Git。

**2026-10-22 实测离线复核续报（本地待审）**：后续取得 `A0-SITE-001-20261022T143528Z.zip`，SHA256 `c6407f37c73ad98286ee62b8256fa7039e5081ea09b2670c713416972ca95ae7`；逐份独立复算 `SHA256SUMS.txt` 17/17，8 条命令 rc0、原始 stdout/stderr 长度/摘要逐项一致、无 timeout/预算溢出。H01–H04 的目标 VM 运行中、VDI 与已定候选相连、nic1 Host-only/nic2–8 关闭、无剪贴板/拖放；H06 `HostNetwork=Enabled`，H07/H08 IPv4/IPv6 forwarding 均为 0；H05 `hostonlyifs` stdout **为空**，不能声称其单独接口验证通过。最终仅 `A0-SITE-001 HOST RAW OFFLINE REVIEW=PASS_SCOPED`，未验证 Guest SSH key、boot/ns、现场来源，`a0Approved=false` 与 `traceAuthorized=false` 原件值保留。私有原件未入 Git，详细见新 A0-SITE 审批包 §6；A0-GUEST/A1/A2 仍 OPEN，A3/A4 未授权。

**2026-10-22 用户后续明确批准 H01–H08 Host 只读检查范围。** 审批不包含 Guest/SSH、startvm/modifyvm/snapshot、strace/root、未知 VM 自动选择或生产。依据 `C1-HOST-005` 历史回执，`/usr/local/bin/VBoxManage` 和既有 VM/VDI 身份可作为当次核查比对目标；**尚无实时 Mac 连接或现场结果**。现为 `A0-SITE-001 H01–H08 EXECUTION SCOPE USER APPROVED / OPERATOR RESULTS PENDING`。此前阶段裁定为：`A0-SITE-001 COMMAND CANDIDATES PREPARED / NO LIVE HOST OR GUEST EXECUTION / USER APPROVAL OPEN`。 历史 C0 仍 `CLOSED/LIMITED-ACCEPTED`，C1-DYNAMIC OPEN、G2 NO-GO、S2 DAILY PAUSED。无 Host/Guest/SSH/strace、VM/权限/AWS/生产动作，也不改 reviewer v1、Runtime core、CI/依赖/数据库。下一步待准确对象/命令/预算经用户审阅后，才可以触发本次 Host 现场只读取证；本批仅本地文档，未推送远端。

## 20. 2026-10-22 — A0-GUEST-001 实测原始身份与来源技术复核（本地待审）

用户在已核对的隔离 VM 控制台预先采集 ED25519 host-key 指纹，再运行受控 Mac 严格 SSH（无自动信任、不使用 sudo）。本轮收到 `A0-GUEST-001-20261022T145533Z.zip`，原包 SHA256 `f309e9a96c6cda5c79d7e0fdf452606c53ab6b32237656e387f5fc6e653f70ec`；独立复算 28/28 原始文件摘要、Host S00–S05 6/6 + Guest G01–G07 7/7 真实 rc0、13 组 stdout/stderr 长度和 SHA 一致。重新解码 SSH keyscan 原始 ED25519 公钥计算 SHA256 指纹，与控制台给定 pin 和 `known_hosts.approved` 一致；Guest UID/GID 1000/1000、boot ID/ns 形式有效、ptrace_scope=1，`strace`/Python3.12/loader 三个 SHA256 与本工作包 §14.3 已验 Ubuntu 来源包成员候选一致。S05 stderr 中 60 B SSH banner 原样保留；不宣称本轮重新执行 GPG 签名验证。单独回执仍 `guestAuthenticated=false`、`a0Approved=false`、`traceAuthorized=false`、`readyToInstall=false`，不可因离线证据校验更写。结合 A0-SITE Host PASS_SCOPED，当前 `A0-GUEST RAW REVIEW PASS_SCOPED / A0 SYNTHETIC NON-ROOT PREFLIGHT TECHNICALLY SATISFIED`，并非 C1 动态认证或真实 strace 许可。详情见 [A0-GUEST-001 新审计文档](R1C-2C-C-C1-SYN-001-A0-GUEST-001只读身份复核.md)。A1、A2 仍 OPEN；A3/A4 不得执行，生产 C5-G2 NO-GO、S2 daily PAUSED。原始 ZIP 仅存私有文件；本批无新现场命令和远端交付。

## 21. 2026-10-22 — C1-SYN-001 / A1-SOURCE-001 安全投送与冻结方案（LOCAL REVIEW）

PR #2905 经 CI #7456 success，squash merge `dev@d7f57ff23814168a38d9eb4ea2d3489e2fee6965`。继承 §19–20 的 `A0-SITE HOST PASS_SCOPED`、`A0-GUEST CONSOLE-PINNED SSH PASS_SCOPED`；这些为本次隔离 non-root synthetic 环境的受限技术核验，不改变原回执 false，也不自动授予任何文件写入或 `strace` 权限。本批在最新 dev 新分支仅编制 [A1-SOURCE-001 三源准确 bytes/目标及写入审批包](R1C-2C-C-C1-SYN-001-A1-SOURCE-001安全投送与冻结审批.md)：复用 D0 的两个惯性 `.py.txt` 和 25 B 输入，总计 2,694 B，固定唯一 Guest `/tmp/sanq-c1-syn-001` 目标；规定源 Mac 前后 hash/size、A0 同 VM/VDI/Host-only/先验 SSH key/boot 身份、非 root UID/GID1000、目录 0700、文件 0400、单链接/regular/无 symlink、独占创建不覆盖、Guest 读回 SHA 与失败冻结。精确 SSH argv、传输 helper 的源字节和文件创建效果须在下一批逐项用户审批后才能执行。未新增重复 `review()` 模块、证据 v1 更动、任何 Guest/SSH 实操、root/strace/VM/AWS/生产动作。

**A1 原始方案裁定：`SOURCE MAPPING/SAFETY PLAN PREPARED / GUEST WRITE NOT AUTHORIZED / SOURCE NOT DEPLOYED`；A2/A3/A4 仍禁止真实运行，C1 OPEN、C5-G2 NO-GO、S2 DAILY PAUSED。**

**后续用户明确授权续报：**允许同一已确认 Guest 的 non-root 唯一私有目录创建、三份冻结文件写入与只读 mode/owner/SHA 回检。Mac 端固定操作器 `A1-SOURCE-001-Mac-Guest-Placement-20261022.py` SHA256 `51a3c2942ca728b3deab74e22bceebef200f13877e9157d07bbd6eeded8f8267`，无需在 Guest 新增第四份 helper、采用 `mkdir -m0700` + `dd conv=excl oflag=nofollow` + `stat/sha256sum`；每次都须核对已 pinned SSH/Guest boot 身份与目录不存在。静态/模拟测试完成，但暂无现场证据：`A1 WRITE AUTHORIZED / OPERATOR EXECUTION PENDING / A2-A4 NO-GO`。见 A1 文档 §6。 本地文档待审、未经用户授权不提交远端。

## 22. 2026-10-22 — A1-SOURCE-001 三份实验材料真实投送离机复核（LOCAL REVIEW）

**原件：**用户执行用户批准的 Mac 非 root Guest 投送后提交 `A1-SOURCE-001-20261022T161938Z.zip`，整体 SHA256 `fc288a8cf804283d9aecc3ae8506511626f4b58b791a42d6597fe0c525db942c`；本轮独立只读打开 ZIP，54 条目（1 目录、53 文件）、无 CRC/重名/穿越/symlink 问题。SHA256SUMS 清单覆盖 **52/52** 个应验文件并全部匹配，包含 25 组命令 stdout/stderr、receipt、SSH pinned known_hosts；25/25 原始命令回执 `rc0`、无 timeout、overBudget、gap，长度/哈希逐项与归档一致。

**现场身份与文件：**A1 VM/VDI、Guest/IP、SSH 控制台 ED25519 pin 与此前 A0-GUEST 原件一致；A1 keyscan `94/94` bytes 对应 A0 公钥原件、现有私有 known_hosts 与重新计算指纹匹配；Guest boot ID、mount/PID namespaces 三份 stdout 与 A0 同字节；VM 运行中且 nic1 Host-only、其他网卡关闭、HostNetwork Enabled、两类 forwarding=0。`/tmp` 为本地 ext4 根分区挂载，目标此前不存在，目录独占创建后 `directory|1000|1000|700|2`。恰三次 `dd conv=excl oflag=nofollow` 写入 `input.txt`、`syn01.py`、`syn02.py` 分别 `rc0`；Guest `stat`/SHA 读回：三文件均为 regular、UID/GID=1000/1000、mode=0400、nlink=1，大小 25/1028/1641，SHA 与原冻结精确相符。keyscan stderr 的 60 B banner 原样保留。

**技术边界：**原 ZIP 未包含从 Guest 再读取并封存的三份完整文件字节，确认的是现场系统 `stat`/`sha256sum` 命令及返回的原始证据，而非第二渠道独立取得的 Guest 内容；文件执行时不可替换性仍未证明。`receipt.json` 原值 `classification=A1_PLACEMENT_CANDIDATE_ONLY`、`a1Approved=false`、`a2Authorized=false`、`traceAuthorized=false`、`productionAuthorized=false`、`cleanupPerformed=false` **永久保留不改写**。

**独立技术裁定：**`A1-SOURCE-001 PLACEMENT/ATTRIBUTES/SHA READBACK PASS_SCOPED`。详情见 [A1 审批文档 §7](R1C-2C-C-C1-SYN-001-A1-SOURCE-001安全投送与冻结审批.md)。已创建的 Guest 唯一路径必须保留原样，**禁止重跑 A1 投送/删除失败证据**；A2 独立采集器与预算/受限写路径授权仍 OPEN，A3/A4 实际 strace 禁止；`C1 DYNAMIC OPEN / C5-G2 NO-GO / S2 DAILY PAUSED`。仅本地文档更新，未推远端。

## 23. 2026-10-22 — C1-SYN-001 / A2-CAPTURE-001 受控采集与失败保全审计（LOCAL DRAFT）

继 **PR #2906 / CI #7459 SUCCESS** squash merge `dev@d746698145a1f340cccacd464f5ddd21249c6519` 后，新建本地 A2 审计分支并读取 `AGENTS.md`、R0 §4.1、D0 SYN-01/02 设计、A0–A2 冻结审批与现有纯内存 `ops/runtime/c1_syn001_approval_offline.py`/测试。该代码只提出 `strace` argv/env/cwd/30 秒/单 trace 4 MiB/总量 8 MiB **声明**，不具 stdout+stderr 完整回收、Guest 子进程组 watchdog、SSH 断线保全或硬预算强制实现。详见 [A2-CAPTURE-001 审批草案](R1C-2C-C-C1-SYN-001-A2-CAPTURE-001采集与失败保全审批草案.md)。

A2 下一步应在不碰 v1 reviewer、不改正常 Runtime、不加 root/包依赖的前提下，审阅仅限现有 Ubuntu Guest 的 **Guest-local 非 root collector + Mac 私有归档** 技术路线；精确两个场景 argv 仍保持既有冻结值、分批批准；仅建议不执行。**尚需证明**总 raw 8 MiB 的真正执行前硬约束与断线时所有 tracee 的退出/无孤儿保证，不允许用事后发现超限或 Mac SSH timeout 伪称已实现强制策略。独占 `raw/` 的创建/collector 代码投送/执行均须单独批准；已落地 A1 三源原样保留，不自动清理/重送。本轮结论 `A2 POLICY DRAFTED / EXECUTABLE COLLECTOR NOT IMPLEMENTED / A2-A4 NOT AUTHORIZED / C1 DYNAMIC OPEN / C5-G2 NO-GO / S2 DAILY PAUSED`。仅本地文档，未推远端。










