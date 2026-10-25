# Runtime 更新 — C1 P10-F2 来源与当前安装只读审阅

**2026-10-25｜IMPLEMENTED_LOCAL / TESTS_NOT_RUN / READONLY_REVIEW_ONLY / P10-F_OPEN / C1_OPEN。**

## 1. 交付基线与本批边界

P10-F1 [PR #2956](https://github.com/sanqin888/sanqinMVP/pull/2956)的最终head4004fdb6经[CI #7589](https://github.com/sanqin888/sanqinMVP/actions/runs/40216308651) SUCCESS合并dev `9e0f4e87e02cb654e7ad0bf9898bdf0fd580adc3`；变更检测通过，9个重lane按docs-only规则跳过。本批按用户“合并后开始F2”在feat/c1-p10f2-readonly-admission-20261025实现。AGENTS不变，无更深规则；已审阅CI Runtime全量与准确Python3.12.15的test_normal_runtime_*.py发现规则，新增测试会被两者收录，不改CI。

新增外置Runtime/Ops库[normal_runtime_readonly_review.py](../../ops/runtime/normal_runtime_readonly_review.py)与[19个聚焦测试](../../ops/runtime/tests/test_normal_runtime_readonly_review.py)。这是A类内部新增只读能力，不是正式VERIFY_SOURCE completion、事务准入、维护许可或完整执行入口。没有CLI、目录创建/修改、子进程、Docker/AWS/DB或Flow调用。原九源711197d2、三批准输入、loader、核心v1、17 Bundle和依赖清单均不变。

## 2. 实际读取与校验

review_readonly_update接收独立双pin的准确launch/request原bytes、目标原Archive、调用方借出的read-only目录FD及现有C1 preserved-observation原bytes；复用原解析器重建v1，不接受布尔“已批准”代替材料。默认fetch复用固定仓库GitHub GET；注入fetch仅用于离线测试，生产调用仍依赖可信模块/transport来源。

1. **目标发布物：**原bytes有界且不可变，调用既有verify_runtime_publication保持newest completed paired publication规则，再绑定request的target SHA/digest；验证固定17+Manifest与原layout。若之前批准目标已非newest直接拒绝，既不选新SHA、不启用历史fallback，也不修改原verifier。
2. **当前实际文件：**通过借出目录FD只读遍历有限allowlist，O_NOFOLLOW/O_NONBLOCK、有界读取、同设备、root owner/安全mode、regular单链接及无别名；目录集合严格为17+Manifest+3动态文件。全程持有私有复制的root FD、子目录和文件FD，网络核验后退出前重验元数据/目录项身份与集合；关闭自有FD，保留借入FD。FIFO/链接/特殊对象不等待、不修复。
3. **当前历史来源：**不取回/重建旧Archive。复用_main_ancestor和最新可信status规则，核对当前Manifest的main/CI/publish对象、准确repo/head SHA/branch/event及success、配对镜像digest和request旧Archive摘要身份。再从固定current SHA的17个Contents GET读取原始源码bytes，验证Git blob SHA1、大小、实际安装bytes与Manifest SHA256三方一致，避免本地文件和自述Manifest一起篡改仍通过。GitHub仓库/已审发布工作流为有限TCB；这不是证明已持有旧tar或其压缩bytes可恢复。
4. **保留状态：**沿用现有sanq.runtime.c1-preserved-observation.v1规范原件与request摘要绑定，只读核对当前Manifest及.env/state/marker的bytes/UID/GID/mode、app current/previous与active、恰一个SANQ_IMAGE_SHA及原marker。报告只包含摘要/元数据，不返回.env内容。不重新定义R2维护原策略记录，不读取Docker或业务数据。
5. **差异与结果：**比较目标和实际当前17成员原bytes，无成员变化即拒绝；只有全部有限检查及退出复核通过才返回changedMembers及只读证据。report不输出StepCompletion，不消费事务，不允许恢复/安装或改状态。

## 3. 必须保留的证据限制

借出FD实际指向何处、固定/opt/sanq/runtime祖先与namespace、启动入口/解释器/模块来源及当前主机身份须由后续受保护入口核验；本库不接受任意路径参数，也不谎称已建立根路径锚点。FD安全读取和退出复核只是点时观察，不排除读前/读后变化或获得持续维护/冻结。

preserved-observation中的容器/挂载条目只是被摘要绑定的旧观察；本库没有向Docker认证其当前真实性/健康/策略，也不把零漂移文件结果当整个preservedState的实时认证。报告明确installedRootPathAuthenticated=false、containerObservationAuthenticated=false、continuousMaintenanceVerified=false、transactionAdmitted=false、flowInvoked=false、readyToInstall=false、authorizedToMutateProduction=false、decision=BLOCKED。targetPublication.verified仅继承目标发布校验意义，不扩大为执行权。

历史发布物来源分两种对象：request旧Archive digest对应真实可信发布seal，17文件对应准确Git源码及本机当前bytes；没有用Manifest摘要或重压缩冒充旧tar.gz摘要。固定历史目标若要成为正式安装对象，仍须另审目标选择策略；本切片不会借当前历史元数据核对绕过目标newest规则。

## 4. 19个已编写测试与验证状态

使用真实临时目录/FD和有界原Archive，GitHub GET完全fixture模拟；仅将_owners桥接到测试用户，**无项目代码/测试已在MCP运行**。覆盖：正常真实文件核对/不泄露env/权限false，独立pin，目标原bytes/digest，非newest不fallback，缺项/额外成员，symlink/hardlink/FIFO，目录/源码可写与env公开，错误owner，旧seal缺失/错摘要/新failure优先，错发布workflow，当前文件与Manifest合谋篡改，仓库blob/type/base64异常，观察/动态漂移，pending/previous/env重复，网络期间替换，重复JSON键/超大文件，无变化成员，伪marker，即使网络失败也无FD泄漏且调用方FD仍可用。

静态AST Python3.10语法（兼容系统审阅环境）、空白与MCP写入回读核对完成；无新增依赖。未在MCP或scratch执行项目测试/动态导入，不将新19项算作已通过；后续以准确head的GitHub Runtime和CPython3.12.15门禁为准。此前203/871及23手动用例仍是原候选证据，不能声称已验证本库。

## 5. 后续接线

本批只读审阅能与R2并行交付。下一步先将本库作为候选外的审阅工具经过CI，不安装到生产九源目录，不变更旧launch集合。后续组合必须固定新模块/依赖、使用可信根锚点/输入和更新的当前观察；再分别补跨进程一次性准入与FD-safe create-only准备、R2持续维护能力、R3快照和R4交接复验。只读review成功不能被组合器直接转换成VERIFY_SOURCE的真实执行准入。

公共依赖方向仅Runtime/Ops内：新库→既有输入解析/launch、发布信任/暂存/Bundle/历史元数据规则。业务owner、跨上下文导入/循环、scanner基线、兼容登记、17 Bundle、依赖/锁、数据库不变；不修改R2的Guard/Fence/CAS接口或源码。没有实际生产/Guest/AWS/GitHub发布验证运行，未刷新旧现场状态。代码与同步文档本地待审，未推送。
