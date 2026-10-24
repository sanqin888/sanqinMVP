# Runtime 更新 — C1-PREP-03 受保护源码快照与失败测试

**2026-10-24（America/Toronto）｜LOCAL IMPLEMENTED / 27 TEST METHODS AUTHORED / TESTS NOT RUN / SOURCE PROVENANCE NOT AUTHENTICATED / C1 OPEN。**

前批 [PR #2933](https://github.com/sanqin888/sanqinMVP/pull/2933) 最终 head `185f962368b1d52d28c29dce05e54098f18b5bd5` 经 [CI #7518](https://github.com/sanqin888/sanqinMVP/actions/runs/40137391840) SUCCESS（Runtime 649 / Release 45），squash merge `51c7d01ba5928b5532d9e965b78797b8e372382b`。本批根据用户“合并后开始下一步”及共享工作区占用时的本地缓存授权，新增真实 FD 读取能力和失败测试。用户现已批准远端交付，发布基线复核为 `dev@0fad2000c05b76d2d0ec7ccb2514cde0bc12f4e4`；保留随后 PR #2934 的 mTLS 实验服务及其 R0/日志记录，仅提交本批七文件增量。

依据 AGENTS、实际 ci.yml、[R0](Runtime更新-R0冻结设计.md)、[C1 最小基线](Runtime更新-C1最小可信执行基线对齐与候选准备.md)、[候选装配方案](Runtime更新-C1候选入口装配与关键来源绑定方案.md)；已审阅 normal-runtime 核心/启动材料和旧 dependency FD observer/alias opener。ops、ops/runtime、ops/runtime/tests 未发现额外 AGENTS。

## 1. 为什么是这个切片

现有 `LaunchMaterials` 只对调用方给出的 bytes 求哈希；正式 bootstrap 尚不能通过它取得一组受保护、可供后续加载的真实源码字节。旧 `root_python_dependency_fd_observer.py` 返回观察摘要而非加载用的固定 bytes，且以旧依赖图为输入；本批不把全量依赖图重新变成 C1 默认前置。

新增 `ops/runtime/normal_runtime_source_snapshot.py`：复用现有 LaunchMaterials 的允许名称/文件数/大小预算及 canonical/digest，从调用方借出的目录 FD 读取真实文件并返回不可变 bytes。**不编译或 import 所读候选 bytes，不实现 loader/CLI，不调用 NormalUpdateFlow，不授予维护/安装/root 权限。**

## 2. 输入和数据输出

- `capture_candidate_sources(directory_fd, materials, expected_launch_sha256=..., expected_owner_uid=0, expected_owner_gid=0)` 是有限生命周期的 context manager。目录 FD 和清单/预期摘要必须由外层独立认证，本组件只核对实际对象与这些批准值是否一致。
- `SourceSnapshot` 保存 operator source commit、固定 launch 文档摘要、目录身份、每份 SourceBytes 的名称/原始 bytes/摘要/文件身份；全部采用 frozen dataclass/tuple/bytes，不保留调用方可变映射。`bytes_for(name)` 只返回入选字节，不重开路径。
- 输出是观察材料，不含执行器、执行方法或认证/放行能力。其值与调用方 pins 匹配不代表 pins 可信，不能升级为 C1 PASS。
- 目录专用于源码：只能含 LaunchMaterials 清单内的 `.py` 文件，索引/审批/业务输入应放在其外；本切片的严格目录合同不等于已冻结正式生产路径布局。
- 默认 owner 为 root:root；非零 UID/GID 只供普通用户 fixture 使用。调用方必须按真实用途固定 owner，不得把用户态测试成功解释为 root 身份成立。

## 3. 实际保护与生命周期

| 检查 | 本地实现 |
| --- | --- |
| 清单绑定 | 验证既有 LaunchMaterials，序列化一次并与外部固定 launch digest 比对；复制不可变 pin 值后才做 I/O |
| 平台能力 | 仅 Linux 和所需 FD API；这不是解释器、Ubuntu 包或平台来源认证 |
| 借出目录 | 拒绝 bool/无效/关闭/不可读/O_PATH/非目录 FD；先 dup，再相对 `.` 打开独立描述，保留调用方 FD/flags/目录位置 |
| 目录属性 | owner/gid 正确、mode 0700、有效 inode/device/link；起止元数据一致 |
| 有界集合 | scandir 逐项检查允许集合/重复/缺失，遇首个异常即停止，不对未知目录做无界 listdir；每次只重置自有目录描述的位置 |
| 文件打开 | 相对目录、O_RDONLY/O_NOFOLLOW/O_CLOEXEC/O_NONBLOCK；没有任意路径、创建/写入或 subprocess |
| 文件属性 | regular、同设备、正确 owner/gid、0400 或 0600、nlink=1、准确大小；拒绝 symlink/hardlink/目录/未知文件 |
| 字节固定 | pread 有界读取并检查 EOF，摘要必须符合 pin；所有选中文件先持有 FD，再取字节，不从名称二次读取来生成输出 |
| 替换/漂移 | 交付给调用方之前与正常退出时，复核 held FD、no-follow 目录项及目录身份；同 bytes 换 inode 也拒绝 |
| 异常路径 | 关闭自有 FD，不关闭借出 FD；调用方异常/KeyboardInterrupt/SystemExit 保留原对象和原因，不做成功复验或文件恢复 |

继承旧 launch 的 3–64 文件、单文件 ≤64KiB、合计 ≤512KiB 预算。限制的是读取/持有的有限源码集合；不宣称可中止任意阻塞内核 I/O，也没有新增 strace、配额、cgroup 或进程管理路线。

固定 bytes 可在 context 结束后保留；FD 持有和目录复检的保证只覆盖 context 生命周期。未来入口应使用这些已核对 bytes 或另经审阅的等效保护，不能之后随意按路径重新 import，再声称仍由本组件保护。

## 4. 仍待正式候选解决

本组件不认证目录 FD 与声明 sourceRoot 的真实绑定、祖先/namespace/mount 来源、外部 launch pins、解释器/关键系统依赖、发布 proof 或执行前用户许可；这些仍归正式入口与 C1 来源核验。它也不提供跨进程锁/ledger、持续维护、AWS 快照、真实交接或业务放行。控制 root/内核仍依 R0 有限信任前提。

reader 自身及 normal_runtime_launch 在本函数调用前已被 Python 加载，必须由外部受信入口事先固定其源码/解释器；不能用运行后自测建立自己的启动信任。FD 持有/复检不阻止其他 root 写入；本组件保证交付所核对的固定 bytes，不宣称持续防写屏障。

现有 normal_runtime_launch/update、全部 false/BLOCKED 字段、请求 v1、17 Bundle、旧 SYN 禁令和 R2 Guard/CAS 合同未修改；没有为新 reader 解锁任何旧 guard。实现入选 bytes 的读取不代表正式 bootstrap 或完整候选已经成立。

## 5. 失败测试与真实验证状态

`ops/runtime/tests/test_normal_runtime_source_snapshot.py` 新增 **27 个 unittest 方法**，采用 CI 临时目录/真实 FD/私有 fixture，源码内容包括一段若执行即抛错的 bootstrap，以确认读取不会执行它。聚焦覆盖：

- 正确字节/不可变结果、借出 FD 的位置/flags/所有权、调用方关闭借出 FD 后自有观察继续有效。
- 错 launch pin、非法 proposal/owner/FD、缺失 Linux 能力、O_PATH/非目录、错误 owner/mode、未知/缺失输入。
- symlink、目录、硬链接、非私有/可执行 mode、大小/哈希错误、pread 短读/失败/读取中增长。
- 读取期间同 bytes 换路径 inode、context 内改写/替换/额外输入、调用方原异常/中断不被覆盖、失败不恢复文件、自有 FD 不泄漏、原 proposal 被强行修改不改写快照。
- 架构约束：不执行候选代码、不增加 CLI/执行或授权方法、不加入固定 17 Bundle。

本地只进行 AST/导入/差异/空白和基线摘要静态核对，**没有执行 reader、仓库 tests/lint/build 或用本地缓存绕过 MCP 的测试规则**。27 项为已编写/已审阅，未声称通过。下次远端交付后以实际 ci.yml 的 Runtime unittest discovery 和 Release 检查为准；前批 CI #7518 不覆盖本批新增代码。

API 语义核对参考 [Python 3.12 os](https://docs.python.org/3.12/library/os.html#os.scandir) 的 FD scandir/pread 与 [contextlib](https://docs.python.org/3/library/contextlib.html#contextlib.contextmanager)；文档只能说明接口机制，不证明本机权限、来源或运行结果。

## 6. 所有权与后续

这是 Runtime/Ops 内部原子新增能力，当前仅测试消费；唯一同 owner 新边为 `normal_runtime_source_snapshot → normal_runtime_launch`。没有跨上下文导入/债务、SCC/cycle/部署单元/兼容登记、依赖/锁、CI、Prisma/migration 或 17 Bundle 变更；未运行扫描器，不改 scanner baseline。

本批源码/测试及 R0、C1 总包、依赖图和日志已同步并经用户授权远端交付，实际最终 head CI 尚待核对。下一步先让该 reader 通过实际 CI，再为同一正式候选补 sourceRoot 受保护锚点、来源/平台绑定和消费固定 bytes 的真实入口；R2/R3/R4 效果源码可继续并行准备。**C1 OPEN / REAL BOOTSTRAP NOT IMPLEMENTED / NO PRODUCTION AUTHORITY。**
