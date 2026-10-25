# Runtime 更新 — C1 P10-F4 事务准入与非活跃准备边界

**2026-10-25 F4-B1：IMPLEMENTED_LOCAL / TESTS_NOT_RUN / LOCAL_CONSUMPTION_ONLY / C1_OPEN。** F4-B设计PR #2961经CI #7599（docs-only，1成功/9跳过）合并dev 99c79221，无修复。新增[本机持久消费内核](Runtime更新-C1-P10-F4B1本机持久消费内核.md)及30项测试：固定既有全安装flock、create-only claim/永久消费副本、文件与父目录fsync、持锁handle、同attempt abort和有界只读事故分类；退出/SIGKILL不清claim，未知阻断。未接Flow/F2/F3/F4-A或R2/云/生产，无效果权限/终结器；仅静态AST与差异审阅，未执行项目测试，分支feat/c1-p10f4b1-durable-admission-20261025未推送。Runtime/Ops同owner单向依赖，无依赖图/债务/scanner基线、九源/v1/17 Bundle、包依赖或数据库迁移变化。下一步先取得实际CI，再审阅独立终结/事故处置与可信组合。

**2026-10-25 F4-B本地设计：DESIGN_COMPLETE_LOCAL / IMPLEMENTATION_NOT_STARTED / C1_OPEN。** F4-A PR #2960经最终CI #7597成功（Runtime920/Release45/准确3.12.15回归252）合并74b6aba6，含20新增测试，无需修复。现已审阅[一次性事务准入/全安装锁](Runtime更新-C1-P10-F4B一次性事务准入与全局锁设计.md)：锁与持久消费分开、未知claim阻断、关闭flock不重放、abort仅本attempt，终结器不靠Flow声明自动放行；与R2真实身份/epoch分工，不再造CAS。下一源码限定本机准入内核与事故分类；本批仅文档，无新锁/ledger/schema/代码、R2或生产变化，未运行新测试/CI、未推送，依赖图/owner/基线不变。


**2026-10-25 F4-A本地实施：IMPLEMENTED_LOCAL / TESTS_NOT_RUN / INERT_PREPARATION_ONLY / C1_OPEN。** F4文档PR #2959经CI #7595（docs-only）合并daaf98cf；按用户授权新增固定root私有父目录、dir_fd/O_EXCL静态目标create-only准备库及20项聚焦测试，保存17+原Manifest/原Archive、文件与全部目录fsync/FD读回及失败残片。只生成被动内容证据，不能resume/消费事务或安装，动态配置不复制；namespace/当前安装/维护/Flow与执行权限false。见[F4-A实现](Runtime更新-C1-P10-F4A-FD安全非活跃准备.md)。本批未调用源码或创建真实目录，R2/九源/v1/17 Bundle不变，无依赖图/owner/基线/迁移变化；仅静态审阅，20项测试未运行，未推送。


**2026-10-25｜BOUNDARY_AUDIT_COMPLETE_LOCAL / IMPLEMENTATION_NOT_STARTED / P10-F_OPEN / C1_OPEN。**

本批按用户“F3提交远端，合并后开始下一步”推进。F3 [PR #2958](https://github.com/sanqin888/sanqinMVP/pull/2958)最终headd00b7102经[CI #7593](https://github.com/sanqin888/sanqinMVP/actions/runs/40218245766) SUCCESS（Runtime900/Release45/准确CPython3.12.15回归232），4作业成功、6业务lane依范围跳过，合并 `642453356d62a71ec155fbb7ff0d4a438d6eb06f`。本批在docs/c1-p10f4-preparation-admission-20261025只读核对既有准备函数、核心准入要求、R2维护CAS与owner合同，限定下一块真实写入实现的边界；不新增另一套纯内存流程。

## 1. 现有能力及不能直接复用之处

| 对象 | 实际规则 | 本轮结论 |
| --- | --- | --- |
| NormalUpdateFlow | 单driver Lock；admit_and_verify_source要求持久拒绝active/consumed/aborted事务 | 没有真实跨进程事务准入；不能靠再建一个driver或把F3结果包装为StepCompletion补齐 |
| F2/F3只读review | 当前namespace固定路径点时绑定、实际文件及发布来源核对，全部权限false/BLOCKED | 可以复用输入/来源判断，不能当lock、事务消费或持续冻结 |
| prepare_authenticated_archive | 先验newest目标及17成员，再以Path创建私有新树，O_EXCL文件写/fsync，路径重开回读，最终fsync顶层scratch | 有真实非活跃准备能力；父路径/目录边未持续FD绑定，各层目录持久化不完整，返回未绑定request/tx，不直接接正式PREPARE_PRIVATE |
| R2 FenceBinding | transaction_id、epoch、request_sha256、registry_sha256等维护身份 | R2维护和准入域，需明确与更新request/attempt的交接；本对话不改字段或实现 |
| R2 OfflineSqliteCas | 合成lab的epoch/head/commit/去重、SQLite持久化与lookup | 不是生产更新ledger，不移除lab guard、不建第二套R2 epoch/CAS，也不把旧SQLite成功升级为真实维护权限 |

准确R2维护链之外的更新事务消费确有职责，但“本机flock+一个JSON”只保证受控本机范围，不能宣称跨克隆/快照回退防重放、离机防回滚或单写者。两者应按同一request/installation/维护身份组合，不能互相替代或各自独立放行。

## 2. 先后顺序：准备不复制营业期动态状态

核心顺序仍是VERIFY_SOURCE→PREPARE_PRIVATE→RECORD_ORIGINAL→FREEZE_MAINTENANCE→SNAPSHOT_READY→RECHECK_FROZEN→HANDOFF→复验/原策略恢复/最终放行，本批不重排。

PREPARE_PRIVATE发生在维护冻结之前，只允许准备已验真的**目标静态17+Manifest及原Archive**。不得提前复制.env/state/marker并把该营业期快照当作HANDOFF保留基线；三动态文件的最终独立复制/字节与owner/mode绑定应在R2持续冻结之后、实际交接之前核对完成。F2中的旧观察也是审阅输入，不是冻结后的动态状态来源。

正常准入先核对来源/当前安装/执行对象，之后才原子地消费属于本次attempt的事务身份；无法确认消费结果则拒绝、人工核对，不靠清理文件后重试。PREPARE_PRIVATE的文件准备成功不能自行建立事务消费或正式执行权限。

## 3. 建议目录划分（待实现审阅，不是已创建路径）

沿用既有受保护根/root/sanq-runtime-operator，将未来源码/批准输入、一次性事务记录、非活跃准备材料分目录。建议事务目录normal-update-transactions/<txid>与准备目录normal-update-preparations/<txid>；准确父目录须外部受控交付为root:root/0700，**不由普通入口临时创建或修复祖先**。txid沿用现有v1语法，只能作单一叶组件，无任意路径/URL/命令或owner参数。

准备布局建议为candidate/（原17+原Manifest）、original.tar.gz（发布原压缩bytes）、preparation.json（本次非授权证据）；receipt不写进发布Manifest、17 Bundle或candidate源码集合。私有文件只读/不可被非root修改，候选保持inert，不能从准备目录执行目标代码。将来HANDOFF前另验准确device与同设备交换条件，不从历史AWS磁盘观察推断一直同设备。

这些名字是本批提出的固定准备布局，不是已部署目录、既有public schema或允许生产mkdir的授权；也不将旧proposedStagingRoot自动当作真实安装位置。

## 4. 下一源码切片：F4-A FD安全的create-only非活跃准备

建议先实现这个有实际文件保障价值的纵向切片，不等待R2真实维护完成，也不先造可自报PASS的ledger。

1. 固定并持有准备父目录的真实祖先/目录FD，root owner、安全mode、read-only目录FD及单设备；复用现有有限祖先规则。只接受独立pin的launch/request和准确目标原bytes；newest策略不变，错目标/摘要/发布proof或layout在任何创建前拒绝。
2. 所有待写内容先从已验证的同一个不可变Archive取得；原Manifest bytes原样保留，不重写/补字段。目标源码不编译/import/执行。解析后的字段与原bytes同时核对，不能从另一个文件重新打开目标。
3. 按txid只创建全新准备叶；已有目录、文件、链接、残留或完成记录都拒绝，不覆盖、不复用、不自动resume。即使只是部分材料也保留人工隔离，不能为了重试删除已有资产。
4. 只按固定allowlist用dir_fd进行mkdir/open，O_EXCL|O_NOFOLLOW、regular/single-link/owner/mode/device核对；持有实际子目录FD与文件对象。文件flush/fsync、目录从下至上fsync，必要的父目录项同步必须明确；使用保持的FD读回并在退出前复核路径边和准确成员集合。
5. 只有原Archive、17成员/原Manifest及所有目录同步/复核成功，才能持久化本次preparation证据并返回准备对象身份/摘要。证据关联request/launch/target Archive/txid及实际prepare树，不只返回一个可被替换的字符串路径。
6. 返回始终inert/readyToInstall=false、authorizedToMutateProduction=false；不产生Flow completion或验证维护。失败只关闭自己打开的FD，保留已经创建的这次材料；不清空父目录，不复制动态配置，不接Docker/AWS/active路径。

正式写入实现需要单独审阅新固定布局与持久化/失败语义，先写源码/离线聚焦测试，经CI后才考虑准确对象现场执行授权。本批只形成可审阅设计，没有实施任何上述写入。

## 5. 跨进程事务准入：随后组合，不抢占R2职责

后续准入切片至少需明确：

- 本机全局互斥的准确安装身份和root-owned lock对象，持有时间覆盖整个尝试；不只按txid分锁而允许两个不同事务同时更新同一安装。已有异常/不可信owner/links或未明记录拒绝，不unlink锁制造新inode绕过持锁者。
- admission记录绑定准确request/launch/当前及目标版本/attempt，原子create-only与文件+父目录fsync；同ID不同request也拒绝。源核验/事务消费的边界、消费未知状态、进程退出后已消费身份的处理需明确。
- 操作系统释放flock不表示事务可重试、维护可退出或业务可放行；新driver不得resume既有journal。无论成功、异常或SIGKILL，已消费事务不自动复用。
- record_abort仅追加/保存本attempt归属的事故证据，记录失败也不覆盖原事故；不改其他事务、R2 epoch或恢复业务。真实作用可能发生后的UNKNOWN继续保留。
- 与R2交接request digest、installation及维护epoch/registry/离机head/恢复实例身份；R2提供其真实权限和持续维护，更新ledger只处理更新尝试归属。尚未有该组合时，不声称本机记录抗快照回退/克隆双写。
- AWS快照恢复到新实例始终是新事故/新审批边界，不借恢复出的本机旧记录自动续跑。快照自身和离机权限归R3/R2，业务最终放行归既有R2/R4/R5门禁。

本批没有冻结新的可消费journal schema、写代码或给R2增加接口要求；以上是后续实现必须落实的交接问题。普通source PR授权不等于创建生产ledger/目录或消费真实事务的权限。

## 6. 聚焦验证与证据复用

F4-A编写代码时需实际覆盖：好输入create-only完整准备；错目标/proof/原bytes在创建前拒绝；碰撞/残留/链接拒绝；目录/文件替换或owner/mode/device漂移拒绝；文件短写、fsync/中断失败不报告完成；准确成员和原Manifest回读；无FD泄漏/active变化/动态配置复制；留下的残片不自动清理且第二次拒绝。目录与文件fsync的异常/顺序可离线模拟，不能凭模拟声称物理断电持久性或生产路径已验证。

后续ledger另补真实独立进程竞争、不同tx同安装互斥、锁对象替换/消费未知、异常/SIGKILL后拒重入和错误归属abort；R2的跨重启/离机CAS场景按匹配对象复用，不重复全矩阵。F3的900/232与本批未运行状态分别登记，不为本次文档修改重跑来源/FD/23用例或AWS安装。

本批仅文档，已静态审阅现有源码与规则；未运行项目lint/build/test或新CI，无依赖/数据库迁移、R2代码变化、root/VM/云/生产操作。AGENTS仍blob03045c7d，无更深规则；所有者/依赖图/债务/scanner/17 Bundle不变。本地审阅后另行交付，F4源码尚未开始，P10-F/C1继续OPEN。
