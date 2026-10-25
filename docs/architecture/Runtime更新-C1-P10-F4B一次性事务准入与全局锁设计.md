# Runtime 更新 — C1 P10-F4-B 一次性事务准入与全局锁设计

**2026-10-25 F4-B2：CONTRACT_REVIEW_COMPLETE_LOCAL / FINALIZER_NOT_IMPLEMENTED / C1_OPEN。** F4-B1 [PR #2962](https://github.com/sanqin888/sanqinMVP/pull/2962)经[CI #7601](https://github.com/sanqin888/sanqinMVP/actions/runs/40231097040)成功合并e1b7d9eb：Runtime950/Release45/准确3.12.15回归282，含30新增测试，无修复。本批完成[终结与事故处置合同审阅](Runtime更新-C1-P10-F4B2终结与事故处置合同审阅.md)：现有非空ledger永久阻断，不能靠删除active或追加声明开放下一笔；需真实安装/保留状态/R2终态证据与配套多事务历史/崩溃协议。下一源码优先独立只读安装后目标复验；本批6份文档，无finalizer/schema升级、代码/依赖/迁移、R2或生产操作，无依赖图/债务/scanner基线变化，未运行新测试/CI、未推送。

**2026-10-25 F4-B1：IMPLEMENTED_LOCAL / TESTS_NOT_RUN / LOCAL_CONSUMPTION_ONLY / C1_OPEN。** F4-B设计PR #2961经CI #7599（docs-only，1成功/9跳过）合并dev 99c79221，无修复。新增[本机持久消费内核](Runtime更新-C1-P10-F4B1本机持久消费内核.md)及30项测试：固定既有全安装flock、create-only claim/永久消费副本、文件与父目录fsync、持锁handle、同attempt abort和有界只读事故分类；退出/SIGKILL不清claim，未知阻断。未接Flow/F2/F3/F4-A或R2/云/生产，无效果权限/终结器；仅静态AST与差异审阅，未执行项目测试，分支feat/c1-p10f4b1-durable-admission-20261025未推送。Runtime/Ops同owner单向依赖，无依赖图/债务/scanner基线、九源/v1/17 Bundle、包依赖或数据库迁移变化。下一步先取得实际CI，再审阅独立终结/事故处置与可信组合。

**2026-10-25｜DESIGN_COMPLETE_LOCAL / IMPLEMENTATION_NOT_STARTED / P10-F_OPEN / C1_OPEN。**

基于dev `74b6aba6d49f0a0a29b69240d3bcaada534464e0`。F4-A [PR #2960](https://github.com/sanqin888/sanqinMVP/pull/2960)最终head1ad27216经[CI #7597](https://github.com/sanqin888/sanqinMVP/actions/runs/40224046956)成功：Runtime920/Release45/准确Python3.12.15回归252，4作业成功、6业务lane按范围跳过，无需修复。用户授权合并后继续下一步；本批仅设计，不创建锁、ledger或生产目录，不修改R2。

## 1. 实现前必须分清的三种身份

| 对象 | 保障范围 | 不得当成 |
| --- | --- | --- |
| NormalUpdateFlow._admission | 一个driver的一次调用 | 跨进程/重启的互斥或事务消费 |
| F4-A准备目录<txid> | 准备名字不可覆盖，原静态bytes与证据留存 | 全安装互斥、执行准入、维护或允许重试 |
| R2 InstallationAnchor/FenceBinding/CAS | 经实际适配与验证后提供host/installation、维护epoch及持续禁入 | 本机更新attempt ledger或本对话可自报的维护许可 |

本机ledger负责“哪个更新尝试已消费、哪个尝试未明”，R2负责持续维护/恢复准入。绝不在本机再造第二套epoch/CAS，不从主机名、当前runtime目录inode或caller自填hostId推导可信installation身份。当前R2 InstallationAnchor仍注明注册真实性须未来root adapter证明；本批只登记其既有字段，不声称真实anchor已安装。

## 2. 建议的固定私有布局与前置条件

沿用/root/sanq-runtime-operator作为单个固定/opt/sanq/runtime安装域的受保护根。建议normal-update.lock为外部预先交付的root:root/0600 regular单链接锁；normal-update-transactions为外部预先交付的root:root/0700 ledger父目录，控制文件也只允许root读写。准确布局须随源码审阅，当前并未部署。

入口不接任意root/path/owner/安装ID，不自动mkdir或修复祖先，不unlink/replace锁文件。打开只读或受审的准确FD后核对类型/owner/mode/nlink/device及路径边，LOCK_EX|LOCK_NB只针对同一个稳定inode；持有期间持续保存受保护FD与准确对象关系。仅按txid分锁是不够的：不同tx也不能同时更新这一个安装。

这些本机对象不自证Host/namespace/来源，跨快照回退及克隆双写也不能靠本机ledger排除；R2离机身份/Guard、故障实例隔离和R3恢复审批仍是独立门禁。

## 3. 首版内核的精确顺序

1. 在首次取得效果能力前，验证启动源码/平台/独立输入及当前安装/目标来源；F2/F3只是可复用的有限检查。进入准入时再次核对准确request/launch与执行对象。先取得**全安装锁**，再检查共享未明状态与已消费身份；不能先查“无事务”再取锁。
2. 任意未明active claim、坏/截断/额外控制对象或未核实disposition均拒绝所有新准入。已经消费的同txid，即使request相同、换了driver/进程或原准备完成，也永久拒绝重入；同txid不同request同样拒绝。
3. 在锁内create-only预留全安装active claim，再持久化本attempt的已消费记录。原始记录绑定txid、request/launch摘要、当前/目标Runtime与原Archive摘要及attempt归属；文件和父目录fsync全部完成才允许后续PREPARE_PRIVATE。消费者使用规范有界原bytes，不接受caller authorized=true、字符串摘要相等或一个旧F4-A回执代替真实准入。
4. active claim写入、事务登记或fsync结果未知时不允许下一步：留下占位/残片即未明事故，不删后重试。即使尚未产生Runtime写入也不能自行抹掉消费身份；若恢复后无法确定原tx身份，阻断整个安装域，交由单独事故处置，不猜测可安全复用。
5. 取得的锁作用域覆盖同一core的整个11阶段、完成后的归属检查和必要record_abort；不得在admit_and_verify_source返回时就关闭锁。准备/快照/安装各自失败都停止后续；R2持续屏障在回调间仍必须有效。
6. 正常/异常关闭进程FD只释放OS锁，**不清除active claim、不允许旧tx复用、不恢复策略/业务**。SIGKILL或主机重启更不能因flock空闲而认为原操作没有发生。首版内核宁可保留未明状态，不能以自动rollback/resume来达成可用性。

实现应采用有明确拥有期的context/handle；handle不授予维护/安装权限，也不是从磁盘receipt可重建的执行token。构造和import不产生准入写入，锁只能由明确调用进入；不保存可跨进程pickle并冒充持锁的对象。

## 4. 完成、abort与下次新事务

consumed身份永久保留；允许以后**新tx**的安装域终结/解除active claim，必须由另行审阅的finalizer在全安装锁下核对同attempt、真实效果结果及R2状态，并以独立持久处置证据明确关联旧claim。首版准入内核不提供任意set_complete/delete/reset接口；最终schema和终结器不在本批冻结。

- Flow的flowCompleted=true、REPORTED_COMPLETE及BLOCKED报告只表示相关联的adapter声明，不能单独把事务标成“生产已放行”并允许下一次更新。
- record_abort只保留本attempt事故原件/阶段及归属，创建自身记录不得覆盖其他尝试；记录失败/未知继续阻断，不让最后一次错误掩盖原事故。不能在finally生成成功处置。
- 已验证的正常终结未来可允许全新tx，旧tx仍不可使用；中断/未知/恢复路径须人工决定准确处置。不得为测试方便在生产侧unlink锁或旧claim。
- 锁文件损坏/被替换、先前claim或终结记录含糊时停止。记录关联/完整性不等于真实性，本机JSON不是离机防回滚证据。

## 5. 与R2及原核心的接线

正常核心的admit_and_verify_source处于RECORD_ORIGINAL/FREEZE之前，因而不能强行要求那时已有冻结完成或snapshot摘要；原始策略与快照仍按既有阶段分别进入FlowContext。准入先绑定request/attempt及准确安装域，R2创建/核对维护身份时再由受信组合器关联其实际epoch/registry/head证据，不重新发明R2字段或提前伪造pin。

同一候选的StepCompletion必须来自当前私有加载core类型，准入handle生命周期由外层组合器持有，不能普通import另一份core或从字符串恢复handle。每个adapter仍验证自己的真实权限和对象。后续record_abort发生前可依据attempt判断是否归属本进程；没有成功拥有准入时，不应尝试abort别人的事务。

R2提供真实host/installation及维护状态的认证/连续性；本机消费记录仅关联已核验对象。snapshot恢复到新实例是新事故、新身份/审批边界，不能从快照内旧ledger自动接着跑；原机单写者隔离仍由R2/R3/R5负责。本设计不需要修改R2源码或把其离线SQLite实验迁入生产。

## 6. 下一源码切片与必要测试

下一块F4-B1建议仅实现固定根/锁/claim的本机准入内核及只读事故分类，不接Flow/维护/快照/安装；明确输出false/BLOCKED与本机范围。终结器及完整组合随后实施，避免用占位成功回调把12能力硬凑齐。

测试需覆盖：真实独立进程同tx和不同tx互斥、既有锁/ancestor链接/owner/device异常；claim及消费记录短写/fsync失败；消费后的新driver/新进程重入拒绝；正常context退出不清claim；SIGKILL后OS锁释放但未明状态仍拒绝；锁inode替换/错误attempt abort；有界只读事故观察不修复/删除。重启/物理断电及R2跨克隆防回滚不能从单元测试推出；真实验收仍需准确授权。

本批为5份文档同步，静态对照原核心/F4-A及R2合同，未写准入代码/新schema，未运行项目测试/新CI或创建任何root对象。AGENTS与owner、依赖图/债务/scanner基线、九源/v1/17 Bundle、依赖/数据库均不变。分支docs/c1-p10f4b-durable-admission-20261025本地待审，未推送；P10-F/C1继续OPEN。
