# Runtime 更新 — C1 P10-F4-B11 受保护writer候选作用域

**2026-10-26｜IMPLEMENTED_LOCAL / TESTS_NOT_RUN / HELD_WRITER_ASSEMBLY_ONLY / C1_OPEN。**

F4-B10由[PR #2971](https://github.com/sanqin888/sanqinMVP/pull/2971)最终headb06c4fc386298c53ff4421529cf6f14ea7ecfe1d经[CI #7620](https://github.com/sanqin888/sanqinMVP/actions/runs/40327593654)成功，4作业成功/6依范围跳过。ops job121588284474实际Release45、Runtime1042、准确CPython3.12.15回归374通过，含16新增测试，无修复；合并devdc195aba5e45d2053fda858507e9616add457902。

本批基于该dev，在feat/c1-p10f4b11-protected-writer-scope-20261026完成。未推送、未运行新CI。

## 1. 新增入口与准确顺序

新增normal_runtime_writer_scope.assemble_protected_writer(transaction_id, *, expected_launch_sha256, expected_request_sha256)，返回context。没有caller root/path/owner、snapshot、loader或callback覆盖参数。

1. 在任何文件访问前校验原v1 txid及两外部非零SHA256 pin。
2. 复用既有bootstrap私有有限读取器，从固定/root/sanq-runtime-operator/normal-update-approvals/<txid>读取且保持pins.json、launch.json、request.json的祖先/文件FD。既有root owner、安全模式、单设备、单链接、精确三成员及大小/读取/退出规则保持。
3. 已交付pins.json必须规范、精确等于该txid及外部双pin；它不能自行覆盖外部批准值。原immutable launch/request bytes再由既有v1解析器校验摘要、canonical字段和相互绑定。
4. txid及bootstrapSource必须符合此入口选择；复用require_current_launch_process核对原批准的Python3.12.15、-I/-S/-B、argv/env/cwd与UID/GID等进程声明。不把内部复查当作已证明启动前真实性。
5. 以root:root要求调用原capture_anchored_candidate_sources，打开固定原sourceRoot祖先与完整来源文件并持有实际FD和原bytes；再进入B10固定八模块私有加载context，用同组核心类型重解析。
6. 三种scope全部保持时才yield ProtectedWriterAssembly(sources, loaded, launch_sha256, request_sha256)。调用者返回后，先退出模块registry，再做源码/祖先退出复核和关闭，最后批准输入/祖先复核和关闭。任一正常退出复核失败均传播，函数不打印成功报告；调用者原始异常/中断按既有工具规则保留。

与旧assemble_pinned_normal_candidate的区别：旧函数在caller entry前关闭源码FD，本入口明确保持它们覆盖consumer scope；旧函数及九源CLI不改，不将新行为静默加到旧入口。

## 2. 本批保证与不保证

保证实际读取的固定批准输入与外部双pin匹配、源/输入文件和祖先在作用域内由FD保持、退出有有限元数据/路径边复核、私有加载使用准确已固定bytes、输入类型来自当前私有core。没有原文件路径重载、缓存canonical模块替代或自行补缺文件。

这些是受控root/namespace信任前提下的对象保护与退出检查，不是恶意root下的持续冻结或可撤销Python能力。退出异常不能追回consumer已经做过的动作，故正式效果adapter仍须在动作前核实自己的实际对象/权限；不从“FD仍开着”推导R2持续维护成立。

bootstrap模块/加载器/stdlib自身已执行代码、平台与独立pins的启动前信任仍由外部建立。ProtectedWriterAssembly不是权限token；相同摘要或受保护路径不自证来源。保留模块/函数也不等于scope外仍获执行许可，调用者不得从旧对象重建合法效果阶段。

输入仍是原批准的launch/request，不新增输入schema；本机永久消费必须由显式writer context另行取得并持有。本入口不调用writer、Flow、准备、Docker、AWS、策略恢复或终结，不返回StepCompletion。真实当前/目标发布、冻结后动态基线、R2及正式更新能力仍未接入。

## 3. 固定候选与交付限制

新入口复用原APPROVAL_ROOT、SOURCE_ROOT及BOOTSTRAP_SOURCE名称，但B10实际来源集合为八个writer依赖模块及声明的独立bootstrap文件。它不是旧九源bootstrap.SOURCE_NAMES，现有ASSEMBLY_ONLY CLI仍拒绝不符合其准确集合的材料；本批没有修改CLI或指导现场用旧CLI执行新候选。

未来完整候选必须分别固定外层scope/bootstrap/loader源码与内部选定模块，审阅准确交付材料、批准输入和启动入口。旧711197d2只读验收不能覆盖此新入口。本批未交付/替换真实sourceRoot、批准目录或现场解释器，不提供生产运行命令。

_SOURCE_OWNER仅为模块私有生产常量(0,0)，无公开非root覆盖。测试替换私有namespace/owner/process观测是隔离fixture，不改变生产进程或权限门禁。

## 4. 聚焦验证与状态

新增16项测试，临时namespace中使用真实批准文件/源码树、祖先与FD、真实八模块私有加载；进程匹配函数由fixture替换，原进程匹配矩阵按现有独立测试复用。覆盖scope内FD保持与同组类型、外部pin/txid提前拒绝、已安装pins不能覆盖外部批准、输入字节漂移、源字节预先漂移、缺输入/链接/坏模式/额外成员、process/loader失败、consumer期间输入/源同bytes替换及两个目录祖先替换、异常/KeyboardInterrupt/SystemExit原实例保留和FD关闭、固定API。

2份Python已静态AST语法解析、生命周期/输入绑定及差异审阅；**16项新测试与项目lint/build/test未运行**。授权交付后的GitHub Actions将执行Runtime全量及准确Python3.12.15回归，无工作流或skip变化。

本批同步5份文档；Runtime/Ops拥有writer_scope→bootstrap/inputs/process_check/source_anchor/writer_loader，既有模块不反向依赖，单向无循环，无owner/依赖图/债务/scanner基线变化。无包依赖或数据库迁移，九源CLI/v1输入/17 Bundle不变，无root/VM/云/生产动作。

下一步先交付并取得实际CI。然后审阅同一候选来源/当前安装/目标发布检查到writer消费的准确锁/FD持有期及实际能力接线；不能把此装配context直接接到未经核验的Flow。C1保持OPEN。
