# Runtime 更新 — C1 P10-F4-B7 v2有界追加writer合同

**2026-10-26 F4-B8：IMPLEMENTED_LOCAL / TESTS_NOT_RUN / LOCAL_CONSUMPTION_ONLY / C1_OPEN。** F4-B7 PR #2968经CI #7614（docs-only，1成功/9跳过）合并707749fd，无修复。本批新增[受限v2 writer](Runtime更新-C1-P10-F4B8受限v2历史writer.md)及16项测试，仅空双布局首claim与同handle abort；create-only/文件及目录fsync/原bytes复核，未知留原件阻断，无处置/第二笔准入/终结或Flow。共用目录身份scope与只读完整stat快照分开，原读者不放宽。5文档同步，Runtime/Ops单向边，无owner/依赖图/债务/scanner基线、九源/v1输入/17 Bundle、依赖/迁移或生产变化；仅静态AST/差异审阅，未运行新测试/CI、未推送。

**2026-10-26｜CONTRACT_COMPLETE_LOCAL / WRITER_NOT_IMPLEMENTED / C1_OPEN。**

F4-B6 [PR #2967](https://github.com/sanqin888/sanqinMVP/pull/2967)最终head f7202f3641aaede69635d05ef5137b3d88356366 经[CI #7612](https://github.com/sanqin888/sanqinMVP/actions/runs/40284643873)成功，4作业成功/6依范围跳过；ops job121445395397实际Release45、Runtime1010、准确CPython3.12.15回归342全部通过，含6新增测试，无修复。合并dev 564f63d2f5a6f14454faa5c200c95cbbbf7ea73f。

本批基于该dev，在docs/c1-p10f4b7-v2-writer-contract-20261026审阅下一源码合同；仅文档，不实施writer、消费现场事务或创建固定目录，未推送、未运行新CI。

## 1. 下一实现的有限范围

首个v2 writer仅允许**空历史的一次本机消费**和同一活跃handle的一次abort观察，不提供通用append(event)、DISPOSITION写入、历史终结解释或开启第二笔事务。即使已有历史完全规范、最后为处置声明，也拒绝消费。

这种切片可落实真实FD/create-only/fsync保障，又不在R2真实处置与效果闭包尚未接通前，用自报成功拼出终结器。它仍是LOCAL_CONSUMPTION_ONLY，不是正常流程admit_and_verify_source，不调用Flow或PREPARE_PRIVATE。

候选API建议为consume_v2_local_attempt(原launch/request bytes, *, 原独立双pin)，惰性context持有全局锁至同一attempt全部调用/必要abort结束。没有caller path/owner、verified=true或“允许第二次”参数。最终函数名/接口随源码审阅冻结。

## 2. 固定对象及共同门禁

使用既有同一BASE和normal-update.lock，准确root身份、保护祖先/目录/锁FD及同设备规则不变；两个目录均须预交付0700，缺失即拒绝、不创建/修复。

锁内同时要求v1 ledger完全为空、v2 history完全为空。原v1入口对任何v2对象存在即拒绝的B6规则保持。因此新writer不能调用v1_locked（会正确拒绝），必须复用BASE+锁及准确双子目录能力；不得换锁、使用..、跳过旧ledger或为测试放宽owner。

固定旧入口控制只落实当前源码。正式候选必须固定实际使用的新旧操作器版本与受保护源码；本机目录门禁不等于抗root变化/快照回退/克隆。R2身份与离机head仍独立负责。

## 3. 生命周期与准入权限

解析原canonical v1输入及外部双pin，不改变request current/target或输入schema。取得锁、持有两个目录、核空后，由内核生成随机attemptId和准确CLAIM，沿用B5识别的v2事件格式及完整claim payload；首序号1、前序全0、claim摘要指向payload原canonical bytes。

外部自给pin不认证源码/平台/当前安装/目标来源。未来可信组合器仍须独立完成这些验证并保持实际对象/权限生命周期，再持有本context覆盖全流程。本机writer不接收缓存的F2/F3报告作为执行token，不将返回handle或localConsumptionRecorded提升为生产权限。

handle仅本进程/线程活跃context可用，不可pickle/从磁盘重建。观察复核全局锁、目录边、准确成员及每个持有文件FD/原bytes；关闭后拒绝使用。进程结束只释放FD，不抹掉消费、不自动恢复维护/策略/业务。

## 4. create-only写入顺序

1. 核对全部前置与内存中的规范有界事件，输出预算沿用256项/16KiB/4MiB，但首版只写准确00000001.json及可选00000002.json。
2. 使用dir_fd与O_CREAT|O_EXCL|O_NOFOLLOW创建准确下一事件；root/regular/单链接/同设备，只规范刚创建对象0600，绝不truncate/replace原件。
3. 完成有进度短写循环、文件fsync、同FD原bytes读回、准确stat/目录项核对、history父目录fsync和祖先/锁/成员复查。
4. 全部成功才yield已消费handle或返回本次abort记录确认；任何写入/同步结果未知均停止，不返回成功，不删后重试。留下的空/短/规范原件都阻断新context。

现有B5只读_scope固定目录完整stat快照，会正确拒绝自己范围中的任何写入。不能给它加公开allow_writes开关或取消读者检查；应抽取不可变祖先/锁/双目录边的共用scope，读者继续叠加原完整stat/名字/原bytes检查；writer独立维护自己已创建对象和精确成员表，仅认可本次受审创建的变化。重构须证明原只读拒绝语义保持。

## 5. Abort与未知结果

只有本handle、相同attempt和原request/launch的有界ABORTED观察可写第二事件，前序为第一事件原bytes摘要。写之前毒化该handle的abort尝试状态；创建/短写/fsync未知后不能再试一次，也不能让最后错误覆盖最初Flow事故。

不得在finally自动生成abort或成功记录。首版没有DISPOSITION_OBSERVATION写接口，关闭/异常/SIGKILL后第二个context均因非空历史拒绝，包括只留下claim残片的情况。

磁盘中事件存在/可读或结构正确不证明原进程收到fsync成功。重启解释器不得补fsync后自动恢复、重放Flow或把声明变成可信终结；真实事故恢复与离机核验另审。单元测试不声称物理断电/跨实例单写者已通过。

## 6. 源码切片必须覆盖的验证

真实临时FD树与共享flock下覆盖：准确原输入/随机attempt及两事件原bytes；v1非空、v2非空/处置声明、任意旧对象/重复事务均拒绝；同/不同tx独立进程互斥；旧入口不能绕过v2；短写/零进度、文件与父目录fsync顺序/失败、同FD读回损坏、文件/目录/锁替换、预算/owner/mode/device/link/FIFO；关闭/异常/SIGKILL仍保留消费，wrong-attempt/关闭handle/重复abort拒绝，所有自有FD关闭，无动态状态/安装/业务效果。

原37项history与原30项v1回归必须继续通过，确保共用scope重构不削弱只读/旧门禁。MCP-workspace仅静态审阅；项目测试由授权交付后的实际GitHub Actions执行。

## 7. 状态与后续

本批同步5份文档，Runtime/Ops同owner依赖方向不变，无源码/schema、九源/v1输入/17 Bundle、依赖/迁移、R2/root/VM/云/生产变化。下一步按本合同实现首个受限v2 writer；可信终结、下一笔事务的实际准入、冻结后基线/效果/R2闭包与完整候选仍未完成。C1保持OPEN。
