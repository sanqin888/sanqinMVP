# Runtime 更新 — C1 P10-F4-B4 多事务历史与崩溃协议设计

**2026-10-25｜DESIGN_COMPLETE_LOCAL / HISTORY_IMPLEMENTATION_NOT_STARTED / C1_OPEN。**

基于dev `9434ab6956c9f3d0b8276b9beb26ac8707381bce`。F4-B3由[PR #2964](https://github.com/sanqin888/sanqinMVP/pull/2964)交付，最终head `39e98077583610a78416ec303c4589022d09a3c2` 经[CI #7606](https://github.com/sanqin888/sanqinMVP/actions/runs/40233916932)成功：4作业成功/6业务lane依范围跳过；ops job121291339616实际Release45、Runtime973、准确CPython3.12.15回归305通过，含全部23项新增测试。首轮CI #7605仅因重排Manifest测试生成了原样bytes失败；39e98077改成compact JSON并断言语义相同/字节不同，未改生产实现或削弱检查。

本批在docs/c1-p10f4b4-history-crash-protocol-20261025完成设计与7份文档同步；不新增history源码/schema/现场目录，不切换v1入口，不改R2，不运行项目测试或新CI，尚未推送。

## 1. 审阅决定

采用**有界、只追加事件历史提案**：全局active不再由可删除指针表达，而由完整事件链中尚未被真实处置证据覆盖的claim推导；所有消费身份与旧事件永久保留。这里只选定设计方向和下一只读解释器的范围，不修改F4-B1入口，不交付可放行的v2 writer/finalizer，也不把本机hash链当R2离机CAS。

相较F4-B1平面active+消费副本，事件历史避免“先清active还是先留消费”的双对象退役问题；仍须严格处理新事件创建与fsync未知窗口，不能声称只追加即可提供真正的跨资源原子终结。最终on-disk字段/schema及写入接口须随下一源码单独审阅。

## 2. 提议的固定对象与兼容门禁

继续使用/root/sanq-runtime-operator下既有稳定normal-update.lock，root:root/0600空regular单链接；所有读/追加/将来终结使用同一非阻塞全安装flock，整个attempt和必要abort持有，不创建第二把锁。

建议另行预交付root:root/0700目录normal-update-history-v2，位于同一BASE及设备；本批不创建、不改变normal-update-transactions，也不授权现场mkdir。只有日后受控交付准确固定源码/布局时才可能使用此目录。

- v1目录缺失、不安全、非空、含未明claim/消费/abort：v2拒绝。不得把非空v1迁走、改名或忽略来避开未知状态。
- F4-B1旧入口也不能在v2已有历史时绕过新记录：**部署v2写入能力之前必须先加入共享双布局门禁并禁用旧直接入口**。仅新入口检查v1为空是不够的，旧入口仍会看v1空而消费新tx。
- 因而下一只读解释器可以先独立检查两个布局；v2写入/真正admission仍不能启用，直到所有入口共用门禁、来源装配和旧版本控制完成。
- 已存在的v1事故不自动转成v2“已完成”；兼容迁移须另行审批并保留原bytes、身份与阻断事实。没有已部署生产v1的历史观察不等于将来可假定空目录。

复用固定祖先/设备/owner/mode、O_NOFOLLOW、单链接和保持FD的检查。不能通过从v1 FD走..寻找新目录，也不接任意root/path/owner；应抽取准确BASE+lock scope，分别打开两个固定子目录并持续复核边关系，原v1约束不得削弱。

## 3. 有界历史与身份

拟采用平面、严格连续编号的create-only事件文件，准确文件名、event字段及canonical schema随实现审阅冻结。首版预算建议最多256个事件、每个至多16384字节、合计至多4 MiB，保持有界FD/内存/扫描；读取第257个成员或超限立即拒绝，不自动扩容、删除、归档或截断历史。

本地ordinal只用于文件顺序和完整性，**不是维护epoch、installation世代或离机防回滚计数**。R2的InstallationAnchor/FenceBinding/CAS字段不变。

每个事件至少准确绑定：本地序号、前事件原bytes摘要（首项为约定空前序）、事件种类、本次claim/tx/随机attempt、request/launch摘要与适用证据摘要。claim必须完整保留当前/目标Runtime/Archive、应用与保留状态身份；不在历史中复制.env秘密或接受可任意读取的证据路径/URL/命令。

全部历史推导永久已消费tx集合，重复tx无论request相同或不同均拒绝；同一安装最多一个结构上未终结attempt。完整扫描必须拒绝缺号/多号/陌生名/截断/重复JSON键/错schema、坏链接/owner/mode/device/超限、错前序/错claim/错request或attempt以及跨attempt事件串接。

本机前序摘要不认证来源，不能检测整个尾部被撤销或快照回退；R2离机身份/最新head、主机隔离与R3/R5恢复门禁仍独立必需。不能把“hash链一致”表述成真实性、断电持久性或克隆单写者证明。

## 4. 事件种类与真实权限分开

| 事件语义提案 | 结构检查 | 权限上限 |
| --- | --- | --- |
| CLAIM | 无其他结构上未终结attempt，tx永久未消费，输入身份准确 | 本机消费/未明；不准入Flow |
| ABORT_OBSERVATION | 当前claim/attempt/input一致，有界原事故观察 | 保留事故，不结束attempt |
| DISPOSITION_OBSERVATION | 当前claim、证据摘要及处置类型准确关联 | 仅终结声明，不自证实际效果或R2终态 |

结构解释器可以把DISPOSITION_OBSERVATION后的链标记为“结构上有处置声明”，但始终dispositionAuthenticated=false/newAttemptAuthorized=false/BLOCKED。即使后面又出现新CLAIM，语法相关也不能证明它当时经过真实准入；只读报告保留所有未认证处置这一事实。

未来能追加下一笔真实CLAIM的受信组合器，必须独立核实上一笔完整效果闭包、R2真实最新处置、当前安装与本次输入；不能凭结构解析成功、一个布尔参数、Flow COMPLETED/REPORTED_COMPLETE或F4-B3匹配报告建立许可。写库本身不提供force/clear/reset/accept_disposition或默认成功回调。

正常完成与事故处置证据仍采用F4-B2边界：真实目标与冻结后保留基线、原策略恢复、实际业务结果及R2处置都须独立认证。ABORTED、观察中未请求HANDOFF或仅有本机静态准备，均不能单独证明没有发生效果。旧tx即使独立证明无效果也永不复用。

## 5. 写入线性化与崩溃矩阵

未来writer在同一全安装锁下，先完整解释两个布局及全部历史，独立核验应有权限，然后仅O_CREAT|O_EXCL创建准确下一事件。全写循环、文件fsync、同FD读回及owner/mode/device/entry复核、history目录fsync、全局边/序列复核全部完成，才返回本次写入确认；不使用可覆盖的latest/active指针，不执行旧事件内容。

| 中断窗口 | 重启后可观察情况 | 必须行为 |
| --- | --- | --- |
| 创建前 | 原链未变 | 重新完整审阅；不能从“没有新文件”断言未发生外部效果 |
| 创建后未写完 | 空/短/坏尾项 | UNKNOWN_BLOCKING；不删尾项重试 |
| 文件写全但文件或目录fsync失败/未知 | 可能有规范尾项，也可能丢失 | 当次不返回成功；停止后续，保留事故 |
| claim确认后、任何Flow效果前后 | 完整claim且无可信终结 | 已消费、安装域阻断；不得重放Flow |
| abort确认后 | 完整claim及事故观察 | 仍阻断，不恢复策略或营业 |
| 处置观察写入但R2/效果核验不足 | 结构相关的处置声明 | 不开放新事务 |
| 处置观察规范尾项在重启后存在 | 仅磁盘bytes，无法证明原进程曾收到fsync成功 | 只读分类为未认证声明；不能推断提交或自动恢复 |
| 已有可信终结后，下一claim创建中断 | 旧tx仍消费，新claim完整或坏尾项 | 新attempt消费/未知均阻断；旧终结不能覆盖新事故 |

“文件现在存在/可读”不等于原fsync成功返回；不能在重启解释器中补fsync后把未知尝试自动改成已确认。要对先前处置重新认证并决定是否可新事务，需要另行审阅的事故恢复协议及R2实时权威核验；本批不提供这种自动路径。物理断电、远端效果与磁盘原子性没有统一事务，不能靠单元测试或一个新commit marker消除所有未知窗口。

## 6. 下一源码切片

先实现**固定v1/v2布局、有界事件历史的独立只读解释器**：核对稳定全局锁、两个固定目录及准确原bytes/完整序列/身份/消费集合，输出空历史、未明attempt、处置声明未认证、结构未知等非授权分类。所有新事务/维护/终结/恢复/业务效果标志false，**没有writer、finalizer或旧入口切换**。无论观察为空还是处置链看似完整，都不能授予准入。

这会给后续存储/事故审阅提供可核对的真实文件边界，同时不提前引入能放行业务的占位权限。若v2目录尚未预交付，拒绝并明确缺前置条件，不自动创建目录。测试用临时假namespace，不能据此运行生产对象。

必要测试包括：两个独立进程共用稳定锁、双布局冲突、v1残片/既有消费、同tx重复/错request/错attempt、缺号/多余/损坏/链接/预算、网络/外部声明不授予权限、文件/目录替换和FD关闭、只读绝无写入/删除/修复。写入/fsync崩溃注入留待writer切片；不把只读测试记为物理断电或R2恢复验证。

## 7. 不变边界

本提案不改变已合并v1内核、F4-B3只读报告、正常核心11阶段顺序、九源白名单、v1批准输入、固定17 Bundle或Python3.12.15基线。无R2实现/epoch、依赖、数据库、owner/依赖图/债务/scanner基线变化，不创建root对象、执行生产源码、调用Docker/AWS或恢复业务。P10-F/C1仍OPEN。
