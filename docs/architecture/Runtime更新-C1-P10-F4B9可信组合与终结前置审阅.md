# Runtime 更新 — C1 P10-F4-B9 可信组合与终结前置审阅

**2026-10-26｜COMPOSITION_AUDIT_COMPLETE_LOCAL / REAL_ADMISSION_NOT_IMPLEMENTED / C1_OPEN。**

基于dev77bf55ddbb273bdcb397cb030de6ca492e172059。F4-B8 [PR #2969](https://github.com/sanqin888/sanqinMVP/pull/2969)最终head029ad1cad12a70e6d5a00b8ca57462f345b99ffe 经[CI #7616](https://github.com/sanqin888/sanqinMVP/actions/runs/40324393082)成功：4作业成功/6依范围跳过；ops job121577293659实际Release45、Runtime1026、准确CPython3.12.15回归358通过，含16新增测试，无修复。

本批在docs/c1-p10f4b9-trusted-composition-20261026核对实际源码选择、组件导入与生命周期，5文档同步；没有写终结器、扩大loader、运行效果或创建root对象，未推送、未运行新CI。

## 1. 已核实能力与没有完成的闭环

v2 writer已经具备空布局首次消费、同handle事故追加及真实文件/目录同步；这部分可复用，不再设计第三套ledger。它刻意拒绝任何非空历史，不接受处置、重入或第二笔事务。B5解释器只证明历史结构，B3只证明目标/原pin保留文件的点时字节；两者都不是可信终结证明。

因此下一阶段应解决“实际受信组件如何被加载和持续持有”，而不是先扩大writer为可自报完成的通用append。终结器仍依赖真实效果/R2闭包，不能用固定类型、matching hashes、Flow成功报告或离线boot guard模型代替。

## 2. 准确源码与有限导入差异

实际normal_runtime_source_loader.SELECTED_MODULES仍只有launch/update/inputs三个模块。bootstrap.SUPPORT_MODULES仍为launch/update/inputs/process_check/source_snapshot/source_anchor/source_loader/candidate_scope八支持模块，加bootstrap共九源；报告仍ASSEMBLY_ONLY，不执行Flow。

本次核对的新增候选组件如下。Git blob定位实际审阅对象，不代替正式候选的逐文件SHA256/大小及启动前真实性。

| 组件 | Git blob | 当前公共边界 |
| --- | --- | --- |
| normal_runtime_history_writer.py | 556bf487278e1a36e4c400d0d397a089e8759c6f | 本机首次消费context，不是正式准入 |
| normal_runtime_history_review.py | b958a67f93f191ceac36f5a9b2f2e6b2817fc553 | 固定布局只读历史 |
| normal_runtime_local_admission.py | 5c2182ddb423edbc45b5a971cfdf12eb240964a1 | 共用锁/旧入口门禁及原v1消费 |
| normal_runtime_readonly_review.py | 9d8190d6d4ad98108e052a610c7612aa5b202b2f | 当前安装/发布/原观察点时核对 |
| normal_runtime_readonly_anchor.py | 854fd6f5cca7312c6182020dd0d35d5b93ddf896 | 固定Runtime祖先FD |
| normal_runtime_private_prepare.py | 13b4b35b922cc4a4060860d23ef959977fb0bf51 | 非活跃create-only静态材料 |
| normal_runtime_postinstall_review.py | 2b8c37522f60c75c20214b49b123439551b65cc1 | 安装后目标字节点时核对 |

writer/review/local还依赖原inputs/launch/source_anchor；只读与准备组件直接依赖build_bundle、release_contract、runtime_trust、runtime_update_contract、stage_bundle、versioned_release_contract及现有只读组件。这里核对的是直接导入，**尚不是完整递归白名单**。后续必须解析这些项目依赖，处理同名模块路径/有限导入与实际使用关系，不能只给上述七文件加pins就普通import整个工作树。

标准库新增用到contextlib/os/fcntl/secrets/pwd/io/tarfile等。正式候选应选择实际需要的受信预加载模块和关键原生依赖来源；不把旧三模块_PRELOADED直接当完整环境，也不默认为所有Python/ELF库做全量闭包取证。未知的实际加载/替换风险做定向核查。

## 3. 组合调用的对象生命周期

| 交接 | 必须保证 | 当前具体缺口 |
| --- | --- | --- |
| 外部启动→装配 | 准确解释器、受保护源码/独立输入pins和有限导入，构造无效果 | 九源旧验收不能自动覆盖新增组件 |
| 装配→原核心 | 当前私有core类型重解析输入，adapter使用同组StepCompletion | 普通import另一份core会违反精确类型身份 |
| 来源/当前安装验证→消费 | 使用原request，准确目标原bytes；持有已核对的FD/路径和同安装域锁 | 不能先关闭F2/F3 scope再以缓存dict声明对象仍一致 |
| 消费→准备→全流程 | 同一个v2 handle和锁覆盖全部阶段与abort，入选源码/输入保持受保护 | 当前writer未接Flow；材料准备返回不等于持续授权 |
| 冻结→HANDOFF→复验 | 实际冻结后的动态基线与对象/维护身份贯穿交接 | 原READ_ONLY_BOOTSTRAP观察不证明冻结后基线 |
| 完成→可信终结 | 实际目标/策略/业务与R2最新处置、同attempt来源关联 | 当前组件报告都不能自授终结或第二笔许可 |

后续组合入口不得接受caller arbitrary callback来执行任意“已批准adapter”，不得构造占位成功能力凑齐12个callable。可以先装配实际已选inert组件，报告未具备的效果能力，但不得在能力不完整时运行原Flow。正式效果候选必须有自己的准确源码/依赖/pins及匹配验收；旧只读候选保持独立历史身份。

## 4. 终结器仍缺哪些真实证据

F4-B2规定的证据闭包保持：原claim/输入/attempt、实际源码与安装域身份、目标17+原Manifest、冻结后动态状态及真实应用/DB/uploads对象、原策略恢复、真实业务结果与R2可信最新终态。不默认下载旧Archive原bytes，不自动改批准目标或放宽newest策略。

当前审阅的maintenance_boot_guard.py仍对RELEASED返回RELEASE_AUTHORITY_NOT_IMPLEMENTED，其纯模型不做真实release/start。另一R2对话的成果交付后需重新核对具体源码和真实验证，C1不修改其epoch/CAS或先自报“R2已释放”。

在真实闭包完成前，保持writer只写claim/abort、任何既有历史不再入。处置事件的格式、local ordinal/链摘要、类型精确或Root所有权均不单独证明处置真实性、离机防回滚或跨克隆单写者。不能为推进进度先提供clear_active/set_complete/force。

## 5. 下一源码与阶段边界

下一源码优先**受保护候选的有限来源集合/加载接线**：先完整确定项目模块递归清单、模块名到固定文件的唯一映射与标准库受信入口，再扩展准确bytes加载及同组核心组合；持有源码/输入保护scope，构造无消费/准备/网络或其他效果。不能用声明成功的验证器跨过缺少真实性的问题。

实现时复用原source_snapshot/source_anchor/loader不变量，保留未知/额外/错源/别名/变化拒绝，并覆盖同组类型、无构造效果、scope退出失败不交付候选。若具体实现需要改变现有输入schema/来源边界，先给出准确兼容与候选迁移差异，不能静默覆盖九源旧输入。

此项完成后才接真实来源/当前安装验证与受限writer的持有期，然后结合R2/R3/R4各实际能力推进完整Flow；可信终结及下一笔准入最后按完整证据闭包实现。不能把这些工作全部标成“writer已完成闭环”。

本批仅源选择/直接导入/生命周期静态审阅，无新源码/schema/依赖/迁移、owner/依赖图/债务/scanner基线、九源/v1输入/17 Bundle或生产变化。C1仍OPEN。
