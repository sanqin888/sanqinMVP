# Runtime 更新 — C1 P10-F 完整候选装配就绪审计

**2026-10-25 F4-B3：IMPLEMENTED_LOCAL / TESTS_NOT_RUN / READ_ONLY_POSTINSTALL_SCOPE / C1_OPEN。** F4-B2 PR #2963经CI #7603（docs-only，1成功/9跳过）合并2240f5e0，无修复。本批新增[安装后目标独立只读复验](Runtime更新-C1-P10-F4B3安装后目标只读复验.md)及23项测试，保留原双pin request、F3固定路径/F2有限FD树，核对原批准Archive/原Manifest/17成员与原pin三动态文件。仅提取F2共用私有检查，原安装前语义不变；旧观察不升级冻结基线，实际挂载/维护/R2/策略恢复/业务放行/终结权限均false/BLOCKED。Runtime/Ops单向依赖，无owner/依赖图/债务/scanner基线、九源/v1/17 Bundle/依赖/迁移变化。已静态AST/差异审阅，未运行项目测试/新CI，分支feat/c1-p10f4b3-postinstall-review-20261025未推送；无root/VM/云/生产操作。

**2026-10-25 F4-B2：CONTRACT_REVIEW_COMPLETE_LOCAL / FINALIZER_NOT_IMPLEMENTED / C1_OPEN。** F4-B1 [PR #2962](https://github.com/sanqin888/sanqinMVP/pull/2962)经[CI #7601](https://github.com/sanqin888/sanqinMVP/actions/runs/40231097040)成功合并e1b7d9eb：Runtime950/Release45/准确3.12.15回归282，含30新增测试，无修复。本批完成[终结与事故处置合同审阅](Runtime更新-C1-P10-F4B2终结与事故处置合同审阅.md)：现有非空ledger永久阻断，不能靠删除active或追加声明开放下一笔；需真实安装/保留状态/R2终态证据与配套多事务历史/崩溃协议。下一源码优先独立只读安装后目标复验；本批6份文档，无finalizer/schema升级、代码/依赖/迁移、R2或生产操作，无依赖图/债务/scanner基线变化，未运行新测试/CI、未推送。

**2026-10-25 F4-B1：IMPLEMENTED_LOCAL / TESTS_NOT_RUN / LOCAL_CONSUMPTION_ONLY / C1_OPEN。** F4-B设计PR #2961经CI #7599（docs-only，1成功/9跳过）合并dev 99c79221，无修复。新增[本机持久消费内核](Runtime更新-C1-P10-F4B1本机持久消费内核.md)及30项测试：固定既有全安装flock、create-only claim/永久消费副本、文件与父目录fsync、持锁handle、同attempt abort和有界只读事故分类；退出/SIGKILL不清claim，未知阻断。未接Flow/F2/F3/F4-A或R2/云/生产，无效果权限/终结器；仅静态AST与差异审阅，未执行项目测试，分支feat/c1-p10f4b1-durable-admission-20261025未推送。Runtime/Ops同owner单向依赖，无依赖图/债务/scanner基线、九源/v1/17 Bundle、包依赖或数据库迁移变化。下一步先取得实际CI，再审阅独立终结/事故处置与可信组合。

**2026-10-25 F4-B本地设计：DESIGN_COMPLETE_LOCAL / IMPLEMENTATION_NOT_STARTED / C1_OPEN。** F4-A PR #2960经最终CI #7597成功（Runtime920/Release45/准确3.12.15回归252）合并74b6aba6，含20新增测试，无需修复。现已审阅[一次性事务准入/全安装锁](Runtime更新-C1-P10-F4B一次性事务准入与全局锁设计.md)：锁与持久消费分开、未知claim阻断、关闭flock不重放、abort仅本attempt，终结器不靠Flow声明自动放行；与R2真实身份/epoch分工，不再造CAS。下一源码限定本机准入内核与事故分类；本批仅文档，无新锁/ledger/schema/代码、R2或生产变化，未运行新测试/CI、未推送，依赖图/owner/基线不变。


**2026-10-25 F4-A本地实施：IMPLEMENTED_LOCAL / TESTS_NOT_RUN / INERT_PREPARATION_ONLY / C1_OPEN。** F4文档PR #2959经CI #7595（docs-only）合并daaf98cf；按用户授权新增固定root私有父目录、dir_fd/O_EXCL静态目标create-only准备库及20项聚焦测试，保存17+原Manifest/原Archive、文件与全部目录fsync/FD读回及失败残片。只生成被动内容证据，不能resume/消费事务或安装，动态配置不复制；namespace/当前安装/维护/Flow与执行权限false。见[F4-A实现](Runtime更新-C1-P10-F4A-FD安全非活跃准备.md)。本批未调用源码或创建真实目录，R2/九源/v1/17 Bundle不变，无依赖图/owner/基线/迁移变化；仅静态审阅，20项测试未运行，未推送。


**2026-10-25 P10-F4边界审计（本地）：BOUNDARY_AUDIT_COMPLETE_LOCAL / IMPLEMENTATION_NOT_STARTED / C1_OPEN。** F3 PR #2958最终CI #7593成功（Runtime900/Release45/准确3.12.15回归232），已合并64245335。下一步已核对既有prepare的路径写入/目录fsync缺口与R2 CAS职责，形成[事务准入及非活跃准备边界](Runtime更新-C1-P10-F4事务准入与非活跃准备边界.md)：建议先FD安全create-only准备，静态目标材料与冻结后的动态状态分开；ledger后续结合R2身份，不冒充维护CAS或新增第二套epoch。拟议固定目录未创建，未实施新写入或schema；无源码/依赖图/owner/基线/17 Bundle/依赖/迁移/生产变化。本批未运行项目测试/新CI，未推送。


**2026-10-25 P10-F3本地实施：IMPLEMENTED_LOCAL / TESTS_NOT_RUN / FIXED_PATH_REVIEW_ONLY / C1_OPEN。** F2 PR #2957已由最终CI #7591成功（Runtime890/Release45/精确3.12.15回归222）合并63d44cb4，无需修复。本批新增固定/opt/sanq/runtime只读wrapper，复用既有祖先FD规则，持有路径scope内调用F2并退出复核；只新增点时绑定元数据，Host/namespace/维护/事务/Flow/权限仍未认证或false/BLOCKED。10项新测试已编写未运行，见[F3实现](Runtime更新-C1-P10-F3固定Runtime路径只读锚点.md)。无R2实现、原九源/v1/17 Bundle、依赖/数据库/生产变化；静态审阅，未推送。


**2026-10-25 P10-F2本地实施：IMPLEMENTED_LOCAL / TESTS_NOT_RUN / READONLY_REVIEW_ONLY / C1_OPEN。** P10-F1 PR #2956最终head4004fdb6经CI #7589（docs-only）合并9e0f4e87。本批新增外置只读review库及19项聚焦测试，复用目标newest发布校验，借入目录FD核对实际17+Manifest/三保留文件，按当前准确Git SHA源码+发布元数据认证旧摘要身份，不要求旧Archive bytes；保持所有安装/维护/事务权限false。FD不自证固定生产路径、容器/挂载未实测，故不作为正式VERIFY_SOURCE completion。见[F2实现与证据限制](Runtime更新-C1-P10-F2来源与安装只读准入.md)。原九源/输入/17 Bundle及R2实现不变，无依赖或数据库迁移；AST/差异静态审阅，未执行项目测试/真实现场核查，未推送。


**2026-10-25（America/Toronto）｜P10-F1 READINESS_AUDIT_COMPLETE_LOCAL / P10-F OPEN / C1 OPEN。**

本批接续用户“继续P10-F，我另开对话进行R2”的授权，基于 `dev@7c368ca50a921bf05592a8f7a9cd56d40e1d6896`。验收归档PR #2955最终head78457ee5的CI #7587十项成功并合并该基线；准确九源711197d2的AWS只读正例与run40210744043的23项隔离结果继续按[原归档](evidence/c1-jammy-negative-acceptance-2026-10-25.md)范围复用。P10-F1是本批审计子项，不是新增执行模式或审批协议。

本批归属Runtime/Ops，仅文档/静态分析，无代码、依赖、CI、数据库、AWS或生产变更。原[入口装配方案](Runtime更新-C1候选入口装配与关键来源绑定方案.md)继续作为历史设计及责任基线；本文件登记实际已验收对象之后的新增差异和可实施顺序，不再重复建设另一套纯内存更新流程。

## 1. 已存在对象与关键接线差异

| 对象 | 准确基线Git blob / 现有能力 | 对完整候选的影响 |
| --- | --- | --- |
| normal_runtime_update.py | `866a5f53e8a57ef48e629f27dd799adc1759c12f`；11正常阶段+record_abort Protocol、FlowContext/StepCompletion、单次driver | 保留同一核心。搜索ops/runtime的同名能力实现和调用点，正式实现仍缺，实际演示调用在测试中 |
| normal_runtime_bootstrap.py | `8f1f7c39ce29ca5d7ffbd4c9d312e039c7e10a53`；准确9源完整集合、8个支持模块、ASSEMBLY_ONLY | 不调用Flow，无execute模式；新adapter不能简单放进现目录或追加launch来源清单 |
| normal_runtime_source_loader.py | `027d30294340c1dccf2d0ca869895ffcd6329dd0`；仅私有加载launch/update/inputs三个模块 | adapter依赖/构造及生命周期尚未接入；不能从未审路径普通import后宣称已绑定 |
| prepare_runtime_update.py | `43a1668d63eb1e244339cf90bccec139665405a1`；独立验源、create-only非活跃暂存 | 尚无Flow能力封装；路径祖先检查与重新开路径读回不能直接算完整FD安全的真实写入适配器 |
| runtime_trust.py / stage_bundle.py | `58d015f1f663f2039b8bb0d15cc4d96bf26360b6` / `adb42895603ed90628a6a8d92f439810da8772e6` | 现默认准备链要求newest completed paired publication，不能假设永远接受此前固定目标 |
| versioned_release_contract.py | `2892ed71bb00821003778163cb6736d466008359`；exact历史发布验证/惰性transition | 可审阅其准确SHA验源规则；不等于已接入prepare，也不授予历史任意版本的安装权限 |
| offline_root_private_installer.py | `89cb36766509e42f6071db9671cd2bdf0b08e446`；仅/tmp lab、注入verifier、原子交换/事故观察 | 只能复用已审不变量和匹配测试。正式root安装仍缺，禁止删除_guard或把lab副本接入生产 |
| maintenance_fence.py / boot_guard_install_manifest.py | 离线Fence/Unit/PathIntent与DENY类判定 | R2负责真实持续维护/Guard/CAS/安装验证；离线manifest和模拟receipt不是live权限 |
| Lightsail创建/查询 | 在本基线ops目录检索lightsail/CreateInstanceSnapshot及snake_case调用均无命中 | 没有发现正常流程R3真实adapter；该结论不代表仓库外或AWS实际账户已检查 |

Git blob只定位本次审阅对象，不代替未来逐文件SHA256来源pin。新增组件尚未选择/实现时不编造摘要，不把全部实验模块自动加入候选。

**同一核心的类型身份必须保持。** `_completion`要求type(raw) is StepCompletion，request也要求同组精确类型；loader特意从固定bytes重新加载并重解析。未来adapter构造必须使用当前候选core的FlowContext/StepCompletion类型，不能混入普通import得到的canonical缓存类。源码通过/字段相等/类型自报均不能替代这一绑定，更不能变成执行权。

**九文件候选保持原身份。** 本批不改变711197d2、原三批准输入或既有只读CLI。完整效果候选需要另固源码集合/loader导入边界、平台关键依赖、argv/env/cwd、具体效果输入与事务；涉及改变现有边界时先审具体差异，不以旧run结果冒充新完整候选验收。操作器、目标17 Bundle、当前应用、外置Guard/CAS分别登记版本。

## 2. 11阶段加失败旁路的组合表

| 阶段 / 既有方法 | 需要的真实对象及保留证据 | 负责实现 / 当前状态 |
| --- | --- | --- |
| VERIFY_SOURCE / admit_and_verify_source | 实际源码/解释器/关键依赖、目标原Archive和发布proof、当前17+Manifest/动态状态/应用存储、事务未消费 | P10-F/C1：无正式adapter；driver内Lock不证明跨进程或重启准入 |
| PREPARE_PRIVATE / prepare_private | 独立验真的目标原bytes、受保护create-only目的树、实际FD/祖先/同设备及完整回读 | P10-F准备接线：有prepare函数，正式安全桥接未实现 |
| RECORD_ORIGINAL / record_original_state | 准确容器/任务原策略、active/enabled、挂载与writer清单，先持久化并离机保管再改变 | R2交付；当前只读观察记录不是维护操作原始状态能力 |
| FREEZE_MAINTENANCE / freeze_maintenance | 持续禁入、原策略no、正常停止一致点、跨daemon/VM重启与新writer防护 | R2交付；本对话不改Guard/Fence/CAS实现 |
| SNAPSHOT_READY / create_and_verify_snapshot | 本次准确源实例/账户/Region/盘/事务的手动快照及离机恢复记录 | R3接口设计已批准，真实受限协调器/认证位置/实现尚缺 |
| RECHECK_FROZEN / recheck_frozen | 同一维护身份/epoch和连续保护窗口，不是两次stat或自报FROZEN | R2交付；成功后到最终放行仍持续生效 |
| HANDOFF / handoff | 目标17+Manifest、三动态文件独立副本、preimage、独占准入/事务日志、可信目录FD、原子交换和持久化 | R4正式adapter缺；旧lab guard不动 |
| VERIFY_INSTALLED / verify_installed | 完整安装清单、动态bytes/owner/mode、应用/卷/Uploads及外部安装副本兼容 | R4真实复验缺；健康检查不能提前开业务/后台副作用 |
| RESTORE_POLICIES / restore_original_policies | 同一原策略记录，准确恢复曾变更对象；失败保留维护 | R2/R4交接项，不一律enable/start |
| VERIFY_RESTORED / verify_restored | 原策略/任务与单写者实际读回、恢复动作范围和保留对象 | R2/R4交接项；尚无正式adapter |
| RELEASE_BUSINESS / release_business | 全部前置验证与必要外部对账完成后的独立最终业务准入 | R2/R4/R5共同边界；单次health或Flow报告不授权放行 |
| 失败旁路 / record_abort | 本次ctx/attempted阶段与原始事故回执、归属和离机保管；失败/未知不影响其他事务 | P10-F持久化接线缺；不restore、不删唯一资产、不重试/回放旧journal |

核心在调用前记录attempted，调用后才接受completion；HANDOFF/RELEASE超时可能已有真实效果，不能从异常或未完成字段推出“未写入”。所有adapter先验证自身真实权限/证据，才返回相关联completion；填入正确摘要不能代替持有对象。核心报告继续BLOCKED/false，不能把它改成通用许可证以接线。

## 3. 给并行R2工作的最小交接要求

R2可独立准备，不等C1关闭。交付时登记准确源码/组件版本、平台、安装路径/owner/mode/Unit和实际接线入口，以及必要真实验证结果；P10-F消费已核实组件，不改其状态机或另造一份屏障。

1. 将record_original_state、freeze_maintenance、recheck_frozen及策略恢复/最后放行的边界映射到同一request/transaction与R2维护身份；request pin与R2 epoch/registry等内部身份如何相互绑定须明确，不能只因名称相同而混用。
2. 记录原策略先于改变，副作用前已有持久化/离机身份；Guard覆盖service+socket、重建容器、任务及新writer，并给出跨重启准入与管理/救援边界。当前实验室DENY/静态unit清单不能声明生产已持有屏障。
3. 从freeze直到安装/复验/策略恢复及最终放行，维护能力持续有效；adapter调用之间也不能失效。失联、状态回退、CAS未知、原状态漂移或业务UNKNOWN均拒绝继续。
4. record_abort仅记录本次事故，不放行业务；恢复原策略与最终业务放行分开。R2提供的接口和证据不能要求Flow在finally自动恢复。
5. R2类型可保持其owner职责；组合器使用同一加载core的completion进行适配，转换只表达阶段完成，不提升R2证据等级。先共同审映射，再接运行路径。

本对话只登记交接面，不安装/启动Guard，不操作CAS服务、证书、Docker/VM或P0-01。共享进度文档以PR合并后的最新dev同步，避免互相覆盖本地记录；R2工作应使用自己的功能分支，并先核查MCP工作区是否有本批未提交变更。

## 4. R3/R4具体开放项及选择门禁

R3沿用[AWS快照方案](Runtime更新-AWS快照与维护冻结方案.md)：故障VM外受限协调器负责云控制面和离机清单、生产侧负责维护/安装，这是既定推荐分工，尚未固定准确运行机、认证/最小权限和transport实现。本批不选择新的SDK、不加boto3/依赖、不要求VM存放长期AWS密钥。实现相关云调用前须明确这些对象/边界，不把“给一个snapshot ARN”当完成。

快照应绑定本次创建及查询的准确对象和来源/覆盖盘、available与离机恢复记录；未知结果先对准确对象进行核对，不盲目重建或选latest。snapshot_record_sha256应指向受保护的完整记录bytes，不是对ARN、名字或磁盘猜造的摘要。R2连续维护与R3记录/真实恢复分别负责；无合格快照记录，HANDOFF不可开始。

R4以[交付安装约束](Runtime交付与安装约束.md)为准：root真实active树、可信FD、安全独立复制、完整preimage、先fsync再PENDING、同设备原子交换/保留槽、独立复验。所审原文件不能只因为内容相同便当作全写路径/断电持久性已证实。当前应用SHA/current/previous、.env、state、marker和DB/Uploads身份不改；旧实验的finally恢复与清理不能成为正常失败路径。云恢复是人工确认准确快照到新实例，不是重放旧journal或自动本机回滚。

**发布选择有真实差异，不能静默改目标。** 先前只读事务目标913258eb及当前安装/容器观察是当时的固定输入，不能当作本次新维护窗口的实时事实。现默认prepare经stage调用runtime_trust要求最新完成发布；固定批准历史SHA与newest策略不是同一条规则。下一切片应明确采用哪个已有验源入口及其适用范围：不把913自动替换为最新main，不放宽newest校验，不把verify_historical_release当任意历史安装许可。若正式选择策略需变更，说明具体行为与证据后再审；本次不做该变更。

## 5. 实施切片与可复用验证

| 子项 | 产出及完成条件 | 可并行 / 必要前置 |
| --- | --- | --- |
| P10-F1（本批） | 准确源码差异、阶段/owner表、R2交接面、R3/R4开放项与验证范围 | READINESS_AUDIT_COMPLETE_LOCAL；无新运行证据 |
| P10-F2（本地源码） | 已实现目标newest发布核验+当前历史发布元数据/17源码原字节+借入目录FD/三保留文件审阅，19项测试已编写未运行，见F2文档 | IMPLEMENTED_LOCAL / TESTS_NOT_RUN；根路径/容器实时性/事务/维护未认证，不调用Flow或效果，不是正式准入 |
| 后续准备/准入持久化 | 正式create-only准备桥接、跨进程一次性ledger/事故归属和源/输入生命周期；逐项明确写入范围 | 在相关实现前审持久化位置、锁/复用与未知状态；不拿core Lock当完成 |
| 组合加载与能力装配 | 入选adapter固定bytes/有限导入、同组类型、无构造副作用、持有scope贯穿实际调用 | 随已选真实组件准备；新增集合/输入/入口必须新固候选 |
| R3/R4真实能力与组合验收 | 经限定审阅实现快照/安装复验；准确同候选正常路径、必要失败/中断、恢复原策略及最终放行 | 实际执行分别满足R2/R3/R4/R5授权及门禁；不能用placeholder补齐12个callable便放行 |

现有核心18项方法和准确Python3.12.15的203回归、原始来源/FD/race/清理负例按对象匹配复用；23个隔离case仍只覆盖九文件只读入口。下一块源码需要的新增验证包括：正确目标与当前身份、重打包/错proof/缺成员/动态漂移/不可信旧摘要的拒绝，以及不产生Flow/云/安装效果。之后新增能力的错误对象/事务、混合类型、重复/并发、中断/UNKNOWN和维护丢失按真实接线补验，不先为所有未来组合建全量矩阵。

F2的审阅产物也不是VERIFY_SOURCE阶段的真实completion，不能绕过正式事务准入、维护或随后新鲜性核对。准备实现不等于授予执行许可，真实执行授权也不由GitHub源码PR授权推导。

## 6. 本批状态与交付

审阅了AGENTS（blob03045c7d，无更深规则）、现有核心/入口/loader、相关测试、发布/暂存/安装组件、AWS/安装owner文档及CI门禁；仅搜索/读取与静态对照。MCP未运行lint/build/test/架构扫描；本批新文档尚未提交、未运行新CI。没有任何AWS凭据、账户/Region/VM/快照访问或主机效果，未修改R2源码/候选9源/17 Bundle/原v1/兼容合同。

**结论：可以推进F2来源与当前安装只读准入准备，无需等R2全部完成；尚不能宣称完整能力已接线、执行候选已冻结、P10-F或C1已关闭。** 下一次改变安全边界/平台/输入或使用历史目标策略，按具体差异审阅，匹配的既有证据继续复用。本批新增文档和同步进度停在本地待审；分支docs/c1-p10f-candidate-readiness-20261025。
