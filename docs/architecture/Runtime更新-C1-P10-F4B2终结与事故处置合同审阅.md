# Runtime 更新 — C1 P10-F4-B2 终结与事故处置合同审阅

**2026-10-25 F4-B4：DESIGN_COMPLETE_LOCAL / HISTORY_IMPLEMENTATION_NOT_STARTED / C1_OPEN。** F4-B3 [PR #2964](https://github.com/sanqin888/sanqinMVP/pull/2964)经[CI #7606](https://github.com/sanqin888/sanqinMVP/actions/runs/40233916932)成功合并9434ab69：Runtime973/Release45/准确3.12.15回归305，含23新增测试；仅修正重排Manifest测试夹具，生产实现未改。本批完成[多事务历史/崩溃协议设计](Runtime更新-C1-P10-F4B4多事务历史与崩溃协议设计.md)：提出固定v2只追加有界历史、永久消费、双布局共同门禁、未知写入/处置声明不放行；下一源码限定真实FD/锁下的只读历史解释器，无writer/finalizer/入口切换。本批7份文档，无新schema/源码/依赖/迁移、R2/root/VM/云/生产动作，无owner/依赖图/债务/scanner基线变化，未运行新测试/CI、未推送。

**2026-10-25 F4-B3：IMPLEMENTED_LOCAL / TESTS_NOT_RUN / READ_ONLY_POSTINSTALL_SCOPE / C1_OPEN。** F4-B2 PR #2963经CI #7603（docs-only，1成功/9跳过）合并2240f5e0，无修复。本批新增[安装后目标独立只读复验](Runtime更新-C1-P10-F4B3安装后目标只读复验.md)及23项测试，保留原双pin request、F3固定路径/F2有限FD树，核对原批准Archive/原Manifest/17成员与原pin三动态文件。仅提取F2共用私有检查，原安装前语义不变；旧观察不升级冻结基线，实际挂载/维护/R2/策略恢复/业务放行/终结权限均false/BLOCKED。Runtime/Ops单向依赖，无owner/依赖图/债务/scanner基线、九源/v1/17 Bundle/依赖/迁移变化。已静态AST/差异审阅，未运行项目测试/新CI，分支feat/c1-p10f4b3-postinstall-review-20261025未推送；无root/VM/云/生产操作。

**2026-10-25｜CONTRACT_REVIEW_COMPLETE_LOCAL / FINALIZER_NOT_IMPLEMENTED / P10-F_OPEN / C1_OPEN。**

基于dev `e1b7d9ebd6daa8c1bad358e1caeae7371b5ac291`。F4-B1由[PR #2962](https://github.com/sanqin888/sanqinMVP/pull/2962)交付；最终head `c55000c2862c0912a24371be4bb34f74f825ae25` 的[CI #7601](https://github.com/sanqin888/sanqinMVP/actions/runs/40231097040)成功，4作业成功、6业务lane按范围跳过。实际ops job121282829813中Release45、Runtime950、准确CPython3.12.15回归282通过，包含全部30项新增测试，无CI修复。证明本机FD/flock/持久消费内核通过离线回归，不等于生产准入、断电或R2验收。

本批在docs/c1-p10f4b2-disposition-contract-20261025审阅现有消费、Flow与R2合同，产出可实施边界；不编写终结器、不更改持久记录格式、不调用源码或创建root对象。尚未推送或运行新CI。

## 1. 审阅结论：不能直接补一个clear_active

F4-B1的consume_local_attempt在全局锁内要求ledger完全为空；inspect_local_admission只识别active.json、同tx永久消费副本及可选abort共至多3项。它有意没有历史终结解释器。

- 只删除active.json后，永久消费副本会成为孤立记录，仍UNKNOWN_BLOCKING；新tx不会获准。删除副本以腾空目录则破坏永久消费，禁止。
- 直接追加一个disposition文件也超出既有精确成员集，仍拒绝。不得仅放宽_names数量或忽略旧文件来“兼容”。
- F4-B1的只读空目录报告恒newAttemptAuthorized=false。Flow成功、os锁空闲或report中localConsumptionRecorded不能转成终结证明。
- 因而真正开放后续新tx，需要**历史存储布局、旧记录解释、崩溃协议和可信终结证据消费者一起审阅**。当前设计没有可消费的新schema、清除权限或迁移脚本。

当前现场从未交付/调用这个新内核，也没有已验真的生产ledger；不能据此推定任意将来路径为空。未来部署必须现场确认对象，遇到既有/坏/陌生记录保留阻断；不能自动“迁移成功”或重建空目录。

## 2. 三个独立结论

| 结论 | 必须证明 | 不能推出 |
| --- | --- | --- |
| 本机attempt已消费 | 准确claim/永久副本、输入摘要、attempt归属及持久化 | 已验证来源、维护或生产效果 |
| 某attempt已核实终结 | 相同身份、实际效果与独立R2终态、完整处置证据 | 旧tx可复用、从journal续跑 |
| 可考虑全新tx | 旧attempt已终结、无其他未明控制、历史可解释、当前状态重新完整准入 | 当前Flow自动获准或R2持续许可 |

后两项本批都未实现。任何终结器不得执行恢复业务、修复安装或云端恢复；这些效果归各自已有阶段/事故流程。它只在那些效果已被真实适配器独立核实后，登记旧attempt处置，并使新事务入口有可能继续完整验证。

## 3. 正常完成的证据闭包

未来受信组合器必须在持有同一个安装域锁时核对以下闭包。字段名称只是现有合同定位及待审证据需求，不冻结新的终结schema，也不接受caller传一组matching hashes或verified=true代替证据。

| 证据域 | 同一attempt须关联及独立核验 | 当前可复用与缺口 |
| --- | --- | --- |
| 输入与归属 | 原canonical launch/request、独立pins、claim原bytes/摘要、txid与随机attemptId | F4-B1可验证本机归属；不能从磁盘记录恢复原活跃handle |
| 启动与安装域 | 实际源码、解释器/依赖、root namespace、host/installation身份、准确固定路径与lock inode | 九源旧bootstrap及F2/F3有限能力；完整组合/真实性尚缺 |
| 安装后静态对象 | 请求批准的target Runtime/Archive、原Manifest、17成员准确bytes/owner/mode/设备/路径边 | F4-A只准备inert树，F2验证原当前安装；均不是安装后目标复验 |
| 保留动态状态 | 冻结后实际.env/state/marker与原保留基线，应用current/previous、DB/uploads/compose身份 | 旧AWS观察只作历史证据，未完成冻结后的采集/交接适配 |
| 原策略恢复与营业结果 | 准确原策略记录与实际恢复对象、效果未知处理、业务放行真实结果 | Flow StepCompletion/REPORTED_COMPLETE是声明，不能单独证明实际消费 |
| R2终态 | 真实InstallationAnchor、相同host/installation/owner/tx/request/registry，真实维护epoch/head与可信离机最新处置 | 现有合同字段可关联，但本审阅未证明真实R2 release adapter已存在 |
| 持久处置 | 原消费身份永不撤销，处置原件有界/规范/不可覆盖，文件与目录同步，恢复后解释唯一 | 现有F4-B1没有finalizer或多事务历史解释器 |

安装后目标验证不能把原request.currentRuntimeSha偷偷替换为target再重签输入；应新增明确的post-install验证语义，仍绑定原输入与原批准target。发布策略也不得因旧目标不再newest而静默改目标/降级校验，冲突应停留事故边界。

本批直接检查到maintenance_boot_guard.py对RELEASED仍返回RELEASE_AUTHORITY_NOT_IMPLEMENTED；其模块说明不执行真实release/start。maintenance_fence.py也明确为纯声明转换，phase仅PREPARED/FREEZING/FROZEN/INCIDENT。这是本提交中这些模块的准确能力上限，不代表另一个R2对话的后续成果永远不可用；接线时必须重新核对其实际合并实现、接口和验证证据，不能在C1先伪造“R2已解除”。

## 4. 事故处置必须分开

正常完成终结只能走全部效果已独立核实的路径。任一阶段异常、超时、传输丢失、策略/安装/业务效果UNKNOWN、claim残片、R2离机不可达或主机身份变化，都继续阻断。

- claim创建/消费结果不明：保留原件，不能仅凭“看起来还没安装”删除消费身份。缺原claim或坏记录时，不接受caller手填tx/attempt后覆盖。
- 有ABORTED观察：仅证明该handle保留了输入绑定的事故声明。不能从failure.step、attemptedSteps或无handoff报告推断无实际效果；abort记录失败也不得掩盖最初事故。
- 事故终结应绑定独立事件/审批、现场效果复核、R2处置结果和原消费身份；即使处置证明未产生安装效果，旧tx依然永久消费。没有核实结论时，不生成“已完成/可新事务”。
- AWS快照恢复到新实例是新事故、新host/installation与独立审批；快照内旧本机ledger不是有效续跑许可。原机隔离与克隆单写者由R2/R3/R5负责，本机JSON不承担离机防回滚。
- 本次仓库提交/合并授权不授权执行这些现场处置、删记录、恢复业务或创建云资源。

## 5. 多事务布局与崩溃协议的实施约束

下一存储设计必须分清一个全局active槽、永久已消费tx集合与不可覆盖的处置历史。可以审阅新的固定子目录布局，但不能一边保留F4-B1“任意非空即拒绝”的入口，一边声称finalizer已经开放新tx。

必须落实：

1. 使用同一预交付稳定lock inode，跨完整尝试及终结检查持有；不能finalizer另开一套锁或通过重建lock避开旧持锁者。
2. 启动/准入先解释全部适用控制与消费身份，明确有界扫描/历史容量、精确成员/owner/mode/device及陌生对象处理；达到容量上限拒绝，不自动清历史。不能只看“没有active”。
3. 旧tx消费检查必须保留永久来源，不接受只检查最新一条或从处置文件反推未消费。所有同tx不同request重用均拒绝。
4. 在允许新tx前，处置原件及关联目录必须已确认持久化，且与准确旧claim/消费身份和核实证据一致。未明write/fsync不推进为成功。
5. 任何旧active退役/新active登记，都需要经过审阅的create-only或原子替换/目录同步协议、明确线性化边界和准确对象核对；不得把普通Path.unlink当原子事务。原消费与原claim/处置历史均须保留可审计原件。
6. 对“处置未写、写残、文件已同步但目录未知、处置已同步而active未退役、active已退役但目录结果未知、新tx开始前/后崩溃”等每个窗口定义重启后的唯一解释；含糊状态阻断，不能重放原Flow或自动恢复策略。
7. 如果要识别“已核实正常终结可进入下一笔”，消费者必须验证真实证据/权限边界；纯文件写库只能存被动观察，不能通过布尔许可或调用者自建类型把本批缺口藏起来。

本批不选定未验证的具体on-disk v2格式，也不修改F4-B1已有schema/测试。现有已消费或陌生状态不自动转为新布局；后续兼容/迁移必须单独明确，并在实现前保留失败拒绝语义。

## 6. 接下来的可实施切片与门禁

优先补齐**安装后目标与保留状态的独立只读复验**，使终结器有真实安装对象证据可消费：输入仍为原独立pins/request与原批准target，固定Runtime路径/实际FD/17成员和Manifest，实际三动态对象及应用/存储身份；无finalize、修复、Flow、R2或生产放行。与R2并行，不要求本对话修改其接口/epoch。

随后评审多事务持久布局及完整崩溃矩阵，再实现其存储内核；生产终结入口仍须等同attempt效果适配、R2真实终态验证和完整可信组合器到位。不得先做一个能凭成功报告清claim的公共入口，再把真实证据验证留作TODO。

后续测试应包括错误target/动态状态/发布proof、旧现场证据、错host/installation/epoch/request/attempt、Flow伪成功、只有ABORTED声明、额外/损坏控制、处置各fsync/崩溃窗口、同/不同tx并发、永久消费不丢失及R2不可达。离线测试不证明真实断电/跨恢复实例单写者；生产窗口另行取得准确授权。

## 7. 本批状态

本批仅新增此审阅文档并同步F4-B1/F4-B/总体就绪审计、依赖图和工作日志。Runtime/Ops所有权、依赖图/债务/scanner基线、AGENTS、九源/v1/固定17 Bundle、包依赖和数据库均不变；未运行项目测试/新CI、未写finalizer或升级ledger，未执行root/VM/云/业务效果。F4-B1的950/45/282是已合并实际CI；本批合同审阅是LOCAL，P10-F/C1继续OPEN。
