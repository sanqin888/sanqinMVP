# Runtime 更新 — C1-PREP-04 源码目录锚点与失败测试

**2026-10-24（America/Toronto）｜REMOTE DELIVERY AUTHORIZED / 25 TEST METHODS AUTHORED / CI PENDING / CURRENT-NAMESPACE PATH OBSERVATION ONLY / C1 OPEN。**

前批 [PR #2935](https://github.com/sanqin888/sanqinMVP/pull/2935) 最终 head `c6a1a15875b452be32d5d4e41835cdf9e1b909c3` 经 [CI #7523](https://github.com/sanqin888/sanqinMVP/actions/runs/40139311338) SUCCESS（Runtime 690 / Release 45，含 PREP-03 的27项）后，squash 合并 dev `a667b3a9209ed0124e475fa0b81d1bdf7e7594aa`。用户授权合并后继续，本批以该最新 dev 为基线，在独立缓存实现下一有限能力。用户现已授权本批远端 PR→dev、最终 head CI 全绿后合并并继续下一步；发布复核 dev 仍为 `a667b3a9209ed0124e475fa0b81d1bdf7e7594aa`，既有四份文档及核心/reader/AGENTS/CI 的 Git blob 未变化。共享工作区保留另一批 mTLS 文档和日志改动，本批继续独立缓存/GitHub 插件交付。

依据 AGENTS、ci.yml、[R0](Runtime更新-R0冻结设计.md)、[C1 最小基线](Runtime更新-C1最小可信执行基线对齐与候选准备.md)、[候选装配](Runtime更新-C1候选入口装配与关键来源绑定方案.md) 与 [PREP-03](Runtime更新-C1-PREP-03受保护源码快照与失败测试.md)。没有更改长期架构决策或生产执行权限。

## 1. 补齐哪一部分

PREP-03 从调用方借出的目录 FD 读取固定源码字节，但不负责证明 FD 对应声明的 sourceRoot。本批新增 `ops/runtime/normal_runtime_source_anchor.py`：先打开当前进程 namespace 的 `/`，按已固定 launch 文档中的 sourceRoot 逐段持有目录 FD，再调用已合并的快照读取器；交付给调用方前及正常退出时复核批准路径的目录项绑定。

这提供真实路径走查与字节读取的组合，没有新增源码 loader、bootstrap、CLI、NormalUpdateFlow 接线或执行许可。结果只说明所观察的目录链和字节与批准材料的对应关系，**不是 Host/namespace、发布来源、解释器或 root 身份的独立认证**。

## 2. API、策略与生命周期

- `capture_anchored_candidate_sources(materials, expected_launch_sha256=..., expected_owner_uid=0, expected_owner_gid=0)` 接受现有 LaunchMaterials，不新增 v1 字段。先核对独立固定 digest，再复制全部不可变 pin/子进程声明，避免调用方对象在走查时变化。
- sourceRoot 取自已固定的现有文档，必须为 ASCII 规范绝对路径，至多1024字符/16组件、每组件至多128字符，拒绝空组件、重复分隔、`.`、`..`、尾斜杠等；没有公开的 root_fd/root_path 替代参数。
- 默认 root:root。非零 owner 参数仅供替换 namespace-root provider 的普通用户 fixture，不是实际 root 权限豁免。生产入口固定打开 `/`，没有提权、文件安装或目录创建逻辑。
- 所有祖先用 O_RDONLY/O_DIRECTORY/O_NOFOLLOW/O_CLOEXEC 逐段相对打开；校验目录类型、正确 uid/gid、owner 可搜索、无 group/world 写及特殊 mode 位、有效 device/inode/link。首版只接受与捕获根相同 device 的目录链，其他布局须另评审。
- `AnchoredSourceSnapshot`/`DirectoryBinding` 为 frozen 数据对象，组合 PREP-03 的 SourceSnapshot；不保留可变输入，也没有 execute/authorize 方法或放行字段。

| 时点 | 实际核对 |
| --- | --- |
| 初始走查 | 持有 `/` 和所有批准组件 FD；由 no-follow stat 将每个子目录项与 held FD 的 device/inode/type/owner/mode 对上 |
| 字节取得后、调用方进入前 | PREP-03 已核对源集合和真实 bytes 后，再检查祖先边，防止在材料读取期间换父目录 |
| 调用方正常退出 | 检查祖先边；PREP-03 继续检查叶目录/文件；其退出后再检查祖先链，随后关闭自有 FD |
| 调用方异常/中断 | 原异常不被转成路径错误；两层 context 关闭各自持有的 FD，不恢复文件/目录、不继续更新或续 journal |

祖先指纹只绑定批准路径所需的 type/device/inode/owner/mode，另要求有效链接；**不要求整个 `/root` 或 operator 父目录的 size/mtime/ctime/nlink 值静止**。无关父级文件/目录变化可保留，不读取或认证这些输入。源码叶目录仍服从 PREP-03 的严格私有、完整允许集合和漂移检查；未来关键输入须单列来源及保护，不能借祖先安全自动授信。

## 3. 信任边界与实际仍缺的内容

打开 `/` 是当前受控进程 namespace 内的锚点，不认证这台 VM/云实例或其初始 mount namespace。same-device 也不是整盘来源或排除所有 bind mount 的证明；本批没有引入全量 namespace/FD 扫描。受控内核/root 仍依 R0 的有限信任前提，异常或未知路径风险按具体对象定向处理。

该模块、PREP-03 与 normal_runtime_launch 在调用前已被解释器加载，其先验源码/解释器来源仍必须由外部受信入口固定。本组件不能运行后自证自己的启动信任。FD 走查/持有与退出复检不阻止其他 root 改写，不构成持续维护屏障。

实际解释器/Python 版本、Ubuntu/关键依赖来源、外部 launch pins/目标发布 proof、正式 root-private bootstrap、关键输入与 effects adapter 继续 OPEN。现有 launch 的旧 Python 3.12.3 声明不因本批成为实证；没有把路径观察或 unit fixture 成功升级为 C1 PASS。

原正常核心/launch、PREP-03 代码及其接口、false/BLOCKED 字段、R2 Guard/CAS、固定17 Bundle 均未修改。没有真实 `/root` 目录准备、Guest/Host/root/VM/Docker/AWS 操作或新证书/服务。

## 4. 25项测试与验证状态

`ops/runtime/tests/test_normal_runtime_source_anchor.py` 新增25个 unittest 方法，使用 CI 临时虚拟根；仅在测试中替换私有 namespace-root provider，其他目录/文件走查与快照读取均用真实 FD。**不打开生产的 `/root`，不执行 fixture 源码。**

覆盖正常完整目录链/固定字节、借入前清单复制；错pin/材料/owner/平台/不规范路径在 I/O 前拒绝；祖先错属主、组/他人可写/特殊 mode、缺失、symlink、非目录/O_PATH；叶目录与源码验证不被绕过；读取后换父目录不得进入调用方；scope 内父目录移动、相同源码重建新父 inode、权限漂移均拒绝；无关父级条目变化允许；异常/中断保留原因、不恢复路径、正常及失败 FD 释放；无 loader/CLI/公共替代根和17 Bundle边界。

本地只进行 AST/导入、基线摘要、差异/空白与补丁可应用性静态核对，**没有执行本批模块或仓库 lint/build/test**。25项为已编写/审阅，未声称运行通过；前批 CI #7523 不覆盖本批新代码。下一远端交付须以实际 ci.yml Runtime/Release 及最终 head 全部必需 Checks 为准。

## 5. 所有权、交付与后续

本批为 Runtime/Ops 内部原子新增能力，当前仅测试调用。新增同 owner 单向边 `normal_runtime_source_anchor → normal_runtime_source_snapshot / normal_runtime_launch`，既有 `source_snapshot → normal_runtime_launch` 保留；无反向引用或跨上下文边/债务、owner/部署单元/兼容、依赖/锁、CI、Prisma/migration、17 Bundle 或 scanner baseline 改动。未运行扫描器，不宣称重新计算生产依赖图。

源码/测试、R0、C1总包、依赖图和日志已同步并经本地静态审阅，已获本批远端交付授权。通过独立功能分支 PR→dev 取得实际 CI；最终 head 全部必需 Checks 通过后才合并。下一步先取得实际 CI，再随正式候选完成来源/实际平台/关键输入与消费固定 bytes 的入口；不为旧全量闭包补无关实验。**C1 OPEN / REAL BOOTSTRAP NOT IMPLEMENTED / NO PRODUCTION AUTHORITY。**
