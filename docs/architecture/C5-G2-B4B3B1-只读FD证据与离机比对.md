# C5-G2 / R1 B4B-3B-1 — 只读 FD 依赖证据与离机比对

> **2026-10-18 已批准更新方案：**[AWS 整机快照与维护冻结方案](Runtime更新-AWS快照与维护冻结方案.md) 更新 R0 D2–D5：代码创建本次 Lightsail 手动实例快照；拍快照前记录原策略，将准确业务容器设为 `restart=no`、正常停止并禁止启动入口，快照及恢复首启均保持维护态。等快照 `available`、来源/覆盖盘与离机清单核对完成才可安装；成功后按记录恢复策略，故障保持冻结并人工确认快照→新实例。旧 mandatory crypt/Drive preinstall Kit、双 Archive 恢复自举不再重复强制。现役每日备份/escrow、目标包来源校验和真实 AWS 恢复验收保留。**仅设计批准 / 未实现未部署 / C5-G2 NO-GO / S2 扩充后置**；不授权本次生产/AWS 操作。本文带日期的设计/实现与有限实验记录保留当时范围；引用旧 Kit/clean reinstall 的段落不再作为本次更新前置。

**日期：**2026-10-17（America/Toronto）  
**状态（现行）：**MERGED / SYNTHETIC CI GREEN：PR #2854、head `b0bca85a46c067ed0c42fcd34e5746523dc6c78d`、CI #7336 7/7、dev merge `2bab5fe653babb89092f5c102a159d23edc81988`。原本地审阅已结束；仍 **NOT REAL GUEST/ROOT VERIFIED**，外部 pin 保管链、FD→路径身份和动态依赖闭包均未独立认证。后续纯内存静态提取见 [B4B-3B-2A](C5-G2-B4B3B2A-Python与ELF静态依赖线索.md)。  
**权威设计：**[R0 冻结设计](Runtime更新-R0冻结设计.md) D1 / C1 / R1；[B4B-3A](C5-G2-B4B3A-Python依赖闭包清单.md)。  
**安全门槛：**C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED；不改变现役备份 timer。

## 1. 本批两个外置组件

| 组件 | 功能 | 不能证明 |
| --- | --- | --- |
| ops/runtime/root_python_dependency_fd_observer.py | 接受 B4B-3A 的清单、提议的 pin 和调用方已经开启的只读 FD；用 fstat/pread 有界读取每个完整文件，输出实际字节 SHA-256、uid/gid/mode/nlink、dev/inode、mtime/ctime/size | 无法独立证明 FD 对应所声称的路径、打开链无 symlink、Guest/OS 可信、文件来源可信或传递 import / ELF 发现完整 |
| ops/runtime/root_python_dependency_offline_review.py | 校验独立参数输入的 manifest hash、逐文件 pins、规范观察记录 hash、文件集合/身份/顺序/数量和字节预算完全匹配 | 这些独立参数究竟是否来自独立可信方、原始保管/发行渠道、文件路径实际映射、全运行时加载依赖完整性 |

即使所有候选数据相符，两个组件仍返回 BLOCKED，不提供 readyToInstall、authorizedToMutateProduction 或真实 Runtime 依赖可信认证。**对参数进行独立比较，不等于独立信任来源认证**。若观察记录和参考 pins 均由 Guest 自己生成，不能据此打勾 C1。

## 2. 采集安全边界

采集器没有 CLI、sudo/root 自动入口、任意路径打开、执行候选脚本、网络、subprocess、写文件、Runtime/备份/Kit 操作；必须由另行审阅的调用方预先开启 FD。本批没有实现或授权可信路径打开器、宿主机扫描器或 Guest 采集命令，不可直接以普通 open(path) 替代将来受信任的 FD-anchor/no-follow 开启链。

输入文件列表必须与 B4B-3A 所声明的全部文件节点精确对应；拒绝缺失/额外/重复 FD、两个路径指向相同 dev/inode、非普通文件、非只读 fd、未知 owner、hardlink count != 1、组/其他用户可写、setuid/setgid。默认期望 uid=gid=0；非 0 fixture uid 只供本地非 root 测试使用，不构成生产认证。单个文件上限 32 MiB，总计 64 MiB，pread 每块 256 KiB；前后 fstat 对比元数据，未知/漂移拒绝。记录永远标注路径/FD 来源未经独立认证。不能将文件内容输出到日志，只有摘要和 metadata。

## 3. 离机对照和信任来源

离机 reviewer 必须从受保护的**外部独立保管链**收到完整 manifest pin、逐文件 hash、原始观察记录的 digest，并验证集合完全覆盖、无路径/别名/metadata 漂移、没有伪造的授权字段。单独提供的 pins 在程序中仍只是调用方数据，不具备签名或信任根；观察记录自己的 hash 可以检测传输中漂移，但 Guest 自算的 hash 绝不等于独立见证。符合结构时仅返回候选摘要一致，真正的 external provenance 仍为 false。

未来真实证据还需要系统包发行源、内核/Guest 身份、真实路径 vs realpath、ELF/CPython import/dlopen、运行时实际加载快照和可信管理入口的分别认证。包含 Linux vDSO 的节点不能伪造一个磁盘 .so pin；现有 B4B-3A 只建模调用方声称的有限闭合依赖图。

## 4. 已有和未有的验收

**本批完成接口和合成测试，不宣称已采集真实 Ubuntu Guest 文件，更不宣称可信 Runtime 可安装。** Python 静态与动态 transitive import 自动发现、ELF DT_NEEDED、dlopen、受信路径与符号链接链，以及完整第三方 trusted origin，仍未实现。采集器自身 Python/fcntl 依赖也未成为独立认证的执行闭包。旧 B4B-1/B4B-2/B4B-3A 均不改。

新增合成回归测试：ops/runtime/tests/test_root_python_dependency_fd_evidence.py。只在测试代码中创建非 root 临时文件并开启 fd，覆盖正常只读候选、坏 fd/权限、硬链接、恶意覆盖、错 hash、记录伪造、manifest 缺失和 Bundle 排除。MCP-workspace 不开放 lint/build/test，授权远端后由既有 api-checks Python unittest discover 与 PR 其它检查正式验证。

后续 **B4B-3B-2（另行审阅）**：独立受控的真实 Guest 文件与路径身份开启，Python import + ELF 动态依赖实际发现，发行包的独立 pins 与 off-Guest custody；不自证。**B4B-3C（另行批准）**：先满足 R0 C2（包括此前跳过的 snapshot 恢复验证），然后才能讨论新的 privileged Guest 演练命令、独立见证。D1–D5 冻结不变；C1–C8 未因本批自动通过，生产 NO-GO。
