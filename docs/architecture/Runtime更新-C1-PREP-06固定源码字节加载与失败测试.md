# Runtime 更新 — C1-PREP-06 固定源码字节加载与失败测试

**2026-10-24（America/Toronto）｜SOURCE CI #7535 VERIFIED / 30 TEST METHODS INCLUDED / SELECTED BYTES LOADER ONLY / REAL BOOTSTRAP NOT IMPLEMENTED / C1 OPEN。**

前批 [PR #2937](https://github.com/sanqin888/sanqinMVP/pull/2937) 最终 head `88a774a2e15daeb7cf171d8f4699bb7cf977a110` 的 [CI #7531](https://github.com/sanqin888/sanqinMVP/actions/runs/40141759436) SUCCESS（Runtime 743 / Release 45，含 PREP-05 的28项），squash 合并 dev `102eeeb5ac0c7e6ca658a4436928354925af8559`。用户授权合并后继续；本批以该最新 dev 为基线，在独立缓存新增固定字节消费机制。用户现已授权本批远端 PR→dev、最终 head CI 全绿后合并并开始下一步；发布复核 dev 仍为 `95d470cad5c08f8d6f8d6c49e3ae7726dd1c6d46`，四份既有文档、五份前置源码、AGENTS 与 CI 的 Git blob 未漂移，通过独立缓存/GitHub 插件交付。完成时 dev 已由 PR #2938 推进至 `95d470cad5c08f8d6f8d6c49e3ae7726dd1c6d46`；该并行批只更新 TLS_ONLY 现场验收文档和原日志条目，没有修改代码、AGENTS、CI或依赖。本批已重对齐该最新基线，完整保留其日志更新，共享工作区保持原样。

依据 AGENTS、实际 ci.yml、[R0 D1/§4.1](Runtime更新-R0冻结设计.md)、[C1 最小基线](Runtime更新-C1最小可信执行基线对齐与候选准备.md)、[候选装配 §4](Runtime更新-C1候选入口装配与关键来源绑定方案.md)、[PREP-03](Runtime更新-C1-PREP-03受保护源码快照与失败测试.md)、[PREP-04](Runtime更新-C1-PREP-04源码目录锚点与失败测试.md) 与 [PREP-05](Runtime更新-C1-PREP-05固定启动输入解析与失败测试.md)。属于 Runtime/Ops 内部原子新增能力，不改已有公共合同、长期架构决策或执行权限。

## 1. 补齐的真实缺口

PREP-03/04 已固定源码 bytes 并观察 sourceRoot 目录链，PREP-05 已把输入原字节解码为现有类型；此前这些 bytes 尚没有进入正常核心的加载过程。直接 import 同名模块可能复用进程旧 cache，或再次按路径取得与核对对象不同的代码。

本批新增 `ops/runtime/normal_runtime_source_loader.py` 的 context manager `load_pinned_normal_candidate(snapshot, launch_bytes, request_bytes, *, expected_launch_sha256, expected_request_sha256)`。**它确实提供编译/执行选定源码字节的库机制**，仅选现有 launch、正常核心和输入解析三模块；加载后重解析同一输入，返回这组候选自己的 UpdateRequest、NormalUpdateFlow 类型及固定模块映射，没有新增平行执行器或调用 run。

本地仅编写/静态审阅，没有调用本批 loader 或执行候选代码。真正运行此机制仍须先有可信外置入口、选定平台和准确材料；本包不是该入口已经存在的证明。

## 2. 加载顺序与对象绑定

| 顺序 | 实际行为 |
| --- | --- |
| 双输入先行 | 用已加载且须先验可信的 PREP-05 parser 核对两 pin/规范 v1 原字节、事务和 launch 绑定；不从输入自己取得 expected pin |
| 全集合先行 | 核对 SourceSnapshot 类型、commit/launch digest 与完整 SourceBytes 集合，逐项再查原生 bytes/大小/报告与实际 SHA256；复制固定字节后才编译，缺少选定模块即拒绝 |
| 全部预编译 | 只编译 `normal_runtime_launch.py`、`normal_runtime_update.py`、`normal_runtime_inputs.py`，全部语法成功后才执行任何选定模块；使用虚拟 filename、dont_inherit=True、optimize=0，不重开源码路径或创建 pyc |
| 候选私有 namespace | 以完整 launch digest 派生 `_sanq_candidate_<digest>`，建立一个空 search path 的包及三个 ModuleType；已有该 namespace/子项就拒绝，不覆盖 canonical 模块/cache，不修改 sys.path/sys.meta_path |
| 同字节依赖装配 | 顺序初始化三模块；每个模块私有 builtins 的 import 函数只返回已经就绪的本组模块或明确预载 stdlib。拒相对、循环/逆序、未入选 import，不走同名 cache/文件搜索回退 |
| 再解析与返回 | 调用刚加载的候选 parser，验证其结果恰为本组 parser/core/launch 的类型，request/launch 全部 bytes 仍与独立 pin 原件一致；返回 LoadedNormalCandidate(request, flow_type, modules) |

原 launch v1 的逻辑 entryPoint `normal_runtime_update.NormalUpdateFlow.run`、平台/路径/argv/env 与全部 false 字段不变。私有模块名是本进程装配身份；未来入口应调用返回的同核心类，不再依逻辑字符串重新 import canonical 模块。

本切片需要 pin 清单包含这三个模块及原合同独立 bootstrap，至少四项；这没有改变 v1 的3–64项格式。bootstrap、未选 adapter 的 bytes 也必须在完整 pin 集合中匹配，但**不由本 loader 编译/执行**。真实 bootstrap 自身的启动信任和实际能力装配继续 OPEN，不能把一个带 throw 的测试 bootstrap 当正式入口。

## 3. import、生命周期与有限信任

预载集合固定为 `__future__`、dataclasses、hashlib、json、re、threading、typing，作为当前三份源码的必要导入；其对象引用来自调用前已加载的受控环境，**引用固定不等于包来源或解释器已经认证**。稳定且匹配的关键来源证据可按 R0 复用，未知加载/路径风险仍定向处理，不默认新建完整 Python/ELF 消费闭包。

私有 import 函数限制的是选定代码经本组 import/__import__ 入口的解析；没有替换进程全局 import hook。其他 Python 反射/机制、stdlib 自己的行为、模块对象/类/global 的可变性及受控 root 仍属于可信进程前提。**该加载器不是恶意 Python 的 sandbox，也不能使同一调用方自供的匹配 pin 获得来源权威。** 选定原件必须先经可信来源和技术审阅，不能把任意自洽源码送进它来获取执行许可。

加载器、外层 parser/launch/reader 和解释器在调用前已经运行；其先验信任必须由外部入口建立，不能事后自证。loader 只消费 bytes，不认证 snapshot 的目录/文件 metadata，也不持有或证明外层 FD 仍活跃；调用方须在 PREP-03/04 的 live context 内装配，并独立保护 namespace/平台/pins/关键输入。直接构造一个 SourceSnapshot 只形成数据输入，不认证路径或来源。

每次 import、交付前及调用方正常退出时，复核私有 namespace 的完整 key 集合、本批 module identity 与父包绑定。正常/初始化失败/异常/中断均清理自己仍拥有的四个注册项；不删除被别人替换或新增的条目，不修复 canonical cache/文件。调用方原异常不被退出检查掩盖，后续不调用 Flow 或恢复业务。

RLock 只保护本进程本批 registry 操作；相同 candidate 的同时加载因 namespace 占用拒绝，不同 candidate 可以分别加载。它**不是跨进程事务锁、防重放或维护排他**，context 关闭后可以重新加载。模块映射为只读，Python module 本身可变；退出会关闭本组 import scope，但保留下来的既有函数不因此获得或失去生产权限，不能把清理当能力撤销或原副作用回滚。

[Python import 文档](https://docs.python.org/3.12/reference/import.html) 与 [compile/exec 文档](https://docs.python.org/3.12/library/functions.html) 用于核对该进程内机制；它们不证明正式 VM/解释器来源。当前 C1 的实际 Ubuntu/Python 版本、关键平台来源、外部 pin 来源和真实 bootstrap 仍未冻结，R2 Jammy 3.10.12 与旧 v1 3.12.3 提议均不在本批升级为平台实证。

## 4. 30项测试与当前验证

`ops/runtime/tests/test_normal_runtime_source_loader.py` 编写30个 unittest 方法：从仓库读取当前三份真实源码，另用会立即 throw 的 inert bootstrap/unused adapter；已在本批 CI 中编译/执行这些候选副本，本地未执行。不执行真实 Host/root/Guest/VM/Docker/AWS 或任何维护/安装动作。

覆盖同字节/同组类型与 canonical cache 污染隔离、无路径/finder回退、真实临时目录reader的 held-FD组合；错 pin/快照身份/缺项/重复/额外/异型/错大小/报告/字节在编译前拒绝、材料先复制；只选三模块及编译参数、全部语法先于任何执行；未知/相对/逆序/动态/退出后 import；初始化失败/中断；既有 namespace/子项保留、同候选占用/不同候选类型隔离/退出后重载；调用方异常原实例和registry漂移/外来项保留；候选 parser 类型/launch语义漂移；原核心由调用方显式提供 inert capabilities 才走11步、结果仍 BLOCKED/所有权威 false，以及缺能力仍拒绝、无第18成员/CLI/真实效果。

本地仅完成 AST/静态导入与调用审阅、基线 Git blob、差异/空白与补丁可应用性核对。**30项已由源码 CI #7535 实际覆盖，Runtime 773 / Release 45 均 OK**；本地未运行本批模块/仓库 lint/build/test/扫描，前批 CI #7531 不作为本批验证。最终 head 全部必需 Checks 仍为合并门禁；CI 平台上的 loader 测试不等于正式平台或 C1 验收。

## 5. 所有权、交付与后续

新增静态同 owner 边 `normal_runtime_source_loader → normal_runtime_inputs / normal_runtime_launch / normal_runtime_source_snapshot`，以及从已固定 bytes 装配 launch/update/inputs 的有限运行期关系；这些模块均归 Runtime/Ops，当前只有测试消费。既有 inputs→update/launch、update→launch 和 reader/anchor 关系保留，无反向导入或新环、跨上下文边/债务、12-context owner/部署单元/兼容、依赖/锁、CI、Prisma/migration、17 Bundle、旧字段/guard 或 scanner baseline 改动；未运行生产依赖扫描，不宣称重算其基线。

同步 R0、C1总包、依赖图和原 PREP-05 日志中的最终CI/合并事实；C1证据复用表同时补记 PR #2938 的 LAB_ONLY TLS_ONLY 四项及停止监听 PASS_SCOPED，实际 CAS 服务、正式身份/Guard 仍 OPEN。该限定实测不作为本批 loader 测试或正式平台认证。本批已获远端交付授权，使用独立功能分支 PR→dev，待本批实际 Runtime/Release 及最终 head 全部必需 Checks 全绿后才合并。下一步应先取得真实 CI，再把实际受信入口、平台/解释器/关键来源及保护输入、同字节 adapter 装配与必要真实验证随正式候选完成；不复制第二套核心，不拿 source loader 替代 R2/R3/R4 的真实效果。**C1 OPEN / REAL BOOTSTRAP NOT IMPLEMENTED / NO PRODUCTION AUTHORITY。**

**同批远端验证：**[PR #2939](https://github.com/sanqin888/sanqinMVP/pull/2939) → dev；完整源码 head `42a5642d9b66f5d55910a9ff0e85847e50c79ad0` 的 [CI #7535](https://github.com/sanqin888/sanqinMVP/actions/runs/40143689266) SUCCESS，Runtime `773 tests / OK`（含本批30）、Release `45 tests / OK`，Runtime shell 语法检查通过，无需 CI 修复。当前同批只补验证记录，最终 head 仍须实际 CI 全绿才合并；最终 Checks/merge 状态以 PR 事件为准。
