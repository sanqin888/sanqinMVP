# Runtime 更新 — C1-PREP-07 受保护候选装配与失败测试

**2026-10-24（America/Toronto）｜SOURCE CI #7541 VERIFIED / 21 TEST METHODS INCLUDED / SOURCE ASSEMBLY ONLY / REAL BOOTSTRAP NOT IMPLEMENTED / C1 OPEN。**

前批 [PR #2939](https://github.com/sanqin888/sanqinMVP/pull/2939) 最终 head `ca69f3d293f49d1d7f5b37724facd51ec3d32c7f` 的 [CI #7538](https://github.com/sanqin888/sanqinMVP/actions/runs/40143868669) SUCCESS（Runtime 773 / Release 45，含 PREP-06 的30项），squash 合并 dev `c808484c45096e29dd9760892fcf33f0baa497ea`。用户授权合并后继续，本批以该最新 dev 为基线，在独立缓存完成下一项入口装配。用户现已授权本批远端 PR→dev、最终 head CI 全绿后合并并继续；发布复核 dev 仍为 `c808484c45096e29dd9760892fcf33f0baa497ea`，四份既有文档、六份前置源码、AGENTS 与 CI 的 Git blob 未漂移，通过独立缓存/GitHub 插件交付。共享工作区另一批 mTLS 文档/日志保留。

依据 AGENTS、实际 ci.yml、[R0 D1/§4.1](Runtime更新-R0冻结设计.md)、[C1 最小基线](Runtime更新-C1最小可信执行基线对齐与候选准备.md)、[候选装配 §4](Runtime更新-C1候选入口装配与关键来源绑定方案.md) 与 PREP-[03](Runtime更新-C1-PREP-03受保护源码快照与失败测试.md)/[04](Runtime更新-C1-PREP-04源码目录锚点与失败测试.md)/[05](Runtime更新-C1-PREP-05固定启动输入解析与失败测试.md)/[06](Runtime更新-C1-PREP-06固定源码字节加载与失败测试.md)。没有更改长期架构决策、v1 合同或生产权限。

## 1. 本批落实的边界

前几批已经分别具备双输入解析、真实 sourceRoot 捕获和固定 bytes 加载。真实入口若自行拼接它们，可能接受外部伪造的 snapshot、忘记 root:root 策略，或在源码/祖先正常退出复检之前便把核心交给后续调用方。

本批新增 Runtime/Ops 组合入口 `ops/runtime/normal_runtime_candidate_scope.py`：`assemble_pinned_normal_candidate(launch_bytes, request_bytes, *, expected_launch_sha256, expected_request_sha256)`。它只接收两份 bytes 和两个独立 pin，没有公开 snapshot、owner、root/path、loader 或 callback 覆盖参数。先使用 PREP-05，再以明确 root:root 策略调用 PREP-04，在真实 source scope 内调用 PREP-06，完成所有源码/祖先退出复检后才 yield `NormalCandidateAssembly(sources, loaded)`。

组合入口单列，是为了明确掌管这三个边界的执行顺序和不同生命周期；不把路径访问混入原纯字节 loader，不转发或复制 NormalUpdateFlow，也不增加审批模型。

## 2. 精确生命周期

| 时点 | 资源与结果 |
| --- | --- |
| 双输入核对 | 两份 pin、规范原 bytes、v1 与事务/launch 绑定先于任何 sourceRoot I/O；保持 PREP-05 原拒绝条件 |
| 捕获至初始化 | PREP-04 持有根/祖先/源码 FD，核对 root:root/private/inventory/hash；PREP-06 仅从这些固定 bytes 初始化本组三模块，所有代码仍受原可信来源前提约束 |
| 进入调用方之前 | source/祖先 context 正常退出并完成全部既有复检、关闭其自有 FD；退出复检观察到的路径/权限/源漂移都会拒绝发布结果，同时关闭已创建的模块 scope |
| 调用方作用域 | 只保留 PREP-06 的私有模块 scope，request/flow_type 为同组已加载类型；sources 是已经完成的观察，不是仍然持有文件的 lease |
| 调用方退出/中断 | ExitStack 退出模块 scope，沿用原 registry 复核/只清自有项/保留调用方异常；不重新打开 sourceRoot，不调用 Flow、恢复、修复或重试 |

**文件保护窗口覆盖源码实际被读取、编译、初始化及其退出核对。** 沿用 PREP-03/04 的固定观察点和权限/身份策略，不连续监控 root 修改或 namespace 变化，也不保证发现所有改后复原的祖先动作。之后使用的对象是已核对 bytes 所生成的模块/函数；后续源路径变化不能替换这些已加载代码。此 API 有意不把整个更新期间的 sourceRoot 路径静止作为自己实现的能力，也不在调用方已工作后才补做该次源码装配复检。

NormalCandidateAssembly 是 frozen 的两项结果容器；其 sources metadata 为历史观察，loaded 内的 Python module 仍是可变对象。退出不撤销已被调用方保留的函数、没有防重放/事务消费声明；后续不得把旧路径重开/再导入或启动未核对脚本，冒充使用这组固定对象。新增真实 adapter/子进程及关键输入时，须落实其实际来源和保护，不能从本组三模块的装配结论外推。

## 3. 没有补造的信任和效果

root:root 是传给 source capture 的真实文件/祖先 owner 策略，不等于认证调用进程的 UID/GID、实际 argv/env/cwd/flags、解释器或 namespace。当前进程/外层 parser、anchor、reader、loader 已先运行，其先验可信来源、实际执行平台和外部 pins 必须由正式受控入口建立；同一调用方自供的匹配摘要仍只表示字节一致。

没有 loader/snapshot 注入参数，使这条公共路径确实经过真实捕获实现；这不是对恶意 Python monkeypatch/反射或受控 root 的 sandbox。独立实验的虚拟 root fixture 只存在于测试，不能被当作实际 /root 已安装或 root 权限验收。

本模块不调用 NormalUpdateFlow.run，不提供任何 effect capability，不认证目标原 Archive/publish proof、旧摘要来源或当前安装/状态，也不获取 Guard/CAS/AWS/安装/业务放行权。原 v1 平台/路径/false 字段、能力完整性与 BLOCKED 守卫保持原样；解析或加载成功都不能变成 C1 PASS。

实际平台仍未最终选定，旧 v1 Python3.12.3 与 R2 Jammy3.10.12 不在本批获得平台认证；真正 bootstrap、受信启动前核验、关键输入与真实能力装配和必要同候选验证继续 OPEN。源码组合可与 R2/R3/R4 准备并行，最终 C1 仍随正式执行候选完成。

## 4. 21项测试与验证状态

`ops/runtime/tests/test_normal_runtime_candidate_scope.py` 新增21个 unittest 方法，在 CI 临时虚拟 `/root/sanq-runtime-operator/normal-update-v1` 目录布局中放入当前三份真实源码及会 throw 的 inert bootstrap，调用原真实 reader/anchor/loader。仅测试中替换私有 namespace-root provider，并在桥接 fixture 中将实际 source owner 期望换为 CI uid/gid；同时检查公共入口明确传入0/0。没有真实 /root 安装或用户/生产主机操作。

覆盖完整顺序和源码FD先关闭/模块后关闭、同组类型/不可变容器；错 pin/规范请求在 I/O 前拒绝；无外部snapshot/owner/root/loader/callback参数；错误 bytes/额外源/缺祖先在 loader 前拒绝；语法/未知导入失败；初始化期父目录移动、源文件和权限漂移在 caller 前拒绝；无关父级变化允许；交付后固定代码不再读源路径；调用方异常/中断、同候选占用、registry漂移/外来项保留、原异常不被掩盖；无隐式Flow调用、缺能力仍拒绝/false字段及无CLI/第18成员。

本地只进行 AST/静态导入和调用审阅、基线 Git blob、差异/空白与补丁可应用性核对。**21项已由修复后源码 CI #7541 实际覆盖，Runtime 794 / Release 45 均 OK**；本地没有调用本批入口、执行模块或仓库 lint/build/test/扫描，前批 CI #7538 不作为本批验证。最终 head 全部必需 Checks 仍为合并门禁。首次 CI #7540 在嵌套装配测试结束时观察到旧FD从全进程基线消失；仅修正测试隔离：setUp先gc.collect回收不可达旧fixture，不在退出阶段收集，保留严格FD集合断言，并新增借入/dev/null FD的身份/存活和本次根FD关闭检查；21方法数、实现和guard不变。

## 5. 所有权与下一步

新增同 owner 单向边 `normal_runtime_candidate_scope → normal_runtime_inputs / normal_runtime_source_anchor / normal_runtime_source_loader`，保持低层 reader/anchor/loader 的既有方向，仅在组合层连接时序；当前只有测试消费，无反向引用或新环。没有跨上下文边/债务、12-context owner/部署单元/兼容、依赖/锁、CI、Prisma/migration、17 Bundle、旧字段/guard 或 scanner baseline 变化，未运行扫描器，不宣称重新计算生产依赖基线。

已同步 R0、C1总包、依赖图和工作日志，更新原 PREP-06 的最终CI/合并事实，保留 PR #2938 的 LAB_ONLY mTLS 限定结论。本批已获远端交付授权，使用独立功能分支 PR→dev，待实际 Runtime/Release 与最终 head 全部必需 Checks 全绿后才合并。后续先取得实际 CI，再随正式候选完成受信启动入口、实际平台/解释器/关键来源与保护输入、真实能力及必要验证；不再把分立组件或装配成功当已经收口。**C1 OPEN / REAL BOOTSTRAP NOT IMPLEMENTED / NO PRODUCTION AUTHORITY。**

**同批远端验证：**[PR #2940](https://github.com/sanqin888/sanqinMVP/pull/2940) → dev；修复后源码 head `528088621f06ad7b445fd3cecf56cf3d5a6958c8` 的 [CI #7541](https://github.com/sanqin888/sanqinMVP/actions/runs/40145310353) SUCCESS，Runtime `794 tests / OK`（含本批21）、Release `45 tests / OK`，Runtime shell 语法检查通过。首次 CI #7540 的1项FD基线失败已仅在测试中修复：进入前gc.collect、保留退出时严格集合断言，并增加借入FD身份/存活及根FD关闭检查；未改实现或guard。当前同批只补验证记录，最终 head 仍须实际 CI 全绿才合并；最终 Checks/merge 状态以 PR 事件为准。
