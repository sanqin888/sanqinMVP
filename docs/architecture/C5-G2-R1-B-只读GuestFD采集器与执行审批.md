# R1-B S4 — 只读 Guest FD 采集器与执行审批

**日期：2026-10-20；状态：SOURCE IMPLEMENTED / SOURCE CI VERIFIED / ROOT EXECUTION NOT APPROVED。**
[PR #2885](https://github.com/sanqin888/sanqinMVP/pull/2885) 源码 head `523a973caa38b863ba9cee2f584fbf42756c96bb` / [CI #7404](https://github.com/sanqin888/sanqinMVP/actions/runs/39455452477)：ops-checks 已成功，Runtime 465 项与 paired-image release 45 项测试均 OK；最终文档 head 仍须通过 CI 后才可合并。
分支：`feat/runtime-r1b-readonly-guest-capture-20261020`，基线 dev `ac5fcfef2ab43489a9b35be7048c93b1b2d31b6a`。
本批只实现可审阅候选源码和合成测试。它不是正常更新执行器、可信加载器、安装器或已获授权的 root 命令。

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
