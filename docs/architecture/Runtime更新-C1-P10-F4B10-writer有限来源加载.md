# Runtime 更新 — C1 P10-F4-B10 writer有限来源加载

**2026-10-26｜IMPLEMENTED_LOCAL / TESTS_NOT_RUN / WRITER_ASSEMBLY_ONLY / C1_OPEN。**

F4-B9 [PR #2970](https://github.com/sanqin888/sanqinMVP/pull/2970)最终head64d0e59e8daf5bf45356ed0b3a179eba4943c793 经[CI #7618](https://github.com/sanqin888/sanqinMVP/actions/runs/40326533121)成功（docs-only，1成功/9跳过），合并dev7516529d300e0b0ba848b0e13a84c62ae0b545fa，无修复。本批基于该dev，在feat/c1-p10f4b10-writer-source-loader-20261026实施，未推送/未运行新CI。

## 1. 本批实际切片

新增normal_runtime_writer_loader.load_pinned_writer_candidate，复用原字节核对/私有模块registry/受限import/同组重解析引擎。先解决writer的有限项目依赖；没有把发布/准备/安装模块、完整Flow或生产入口一并加载。

固定拓扑顺序为：

1. normal_runtime_launch
2. normal_runtime_update
3. normal_runtime_inputs
4. normal_runtime_source_snapshot
5. normal_runtime_source_anchor
6. normal_runtime_local_admission
7. normal_runtime_history_review
8. normal_runtime_history_writer

这八模块之间的实际项目导入形成完整writer子图；新入口要求来源集合**恰好八个准确.py文件及声明的独立bootstrap文件**。bootstrap不得与所选模块重名；只核对其原bytes，不编译/执行。未选release/prepare/postinstall依赖不属于此子图，也不声称完整正常流程来源集合已确定。

模块名唯一映射到同名固定叶文件，不接路径/模块选择器；原snapshot须仍由外层受保护reader/ancestor scope持有。源commit、launch摘要、完整清单、类型、immutable bytes、大小/逐文件SHA256及原外部双pin，在编译前全部匹配。全部八模块编译成功后才初始化任一模块，不重开源码路径、不使用canonical缓存或finder fallback。

## 2. 同组类型与有界导入

新私有前缀为_sanq_candidate_writer_<launch SHA256>，与旧三模块命名空间分开。保持包/子模块registry精确核对，拒绝预占、出序/循环、relative、未选模块和退出后的late import；只删除自己仍拥有的registry项，不覆盖外来项。

实际stdlib入口固定为原__future__/dataclasses/hashlib/json/re/threading/typing，加contextlib/fcntl/os/secrets/stat/sys；预先导入的这些模块及其平台/关键原生来源必须由外层信任。本加载器不是Python sandbox，不从stdlib允许集合推导所有传递依赖已认证。

使用新私有inputs重新解析原launch/request，确认request、LaunchMaterials与Flow类来自同一个新core。writer.local、writer.history及anchor/snapshot也必须指向当前私有组，不能混入canonical缓存类。

只有明确调用选定writer的consume_v2_local_attempt才会尝试本机消费；加载/构造/返回不调用它、不调用Flow、不产生StepCompletion或维护/准备/网络/安装/终结效果。退出仅撤销活跃导入scope与自有registry，不能视为任意保留函数都被沙箱撤销；调用者须把使用限制在受保护生命周期内。

## 3. 原入口兼容与边界

原normal_runtime_source_loader.SELECTED_MODULES及_PRELOADED保持三模块和原stdlib集合。公开load_pinned_normal_candidate签名与原命名空间保持，返回原context行为，仍允许原声明清单内未选模块但不编译它们。

本批仅抽取私有_load_candidate/_compile_modules通用引擎，旧_compile_selected包装保持原三模块及patch/验证入口；新入口以内部常量选择八模块及精确清单。没有给旧公开API增加module/stdlib/root覆盖参数，也不修改原九源bootstrap、ASSEMBLY_ONLY CLI、v1批准输入或17 Bundle。

新入口是**另一个需准确交付和验收的候选组成能力**。当前操作器/stdlib/loader自身的来源真实性仍是外部前提；不能把旧711197d2九源的AWS/隔离验收记为此新集合已通过，也不把构造出的snapshot+自给pins视为认证。

## 4. 验证与状态

新增16项测试：真实八模块同组核心/项目导入、canonical缓存污染拒绝、装配不open/write/fsync、实际临时目录reader保持FD组合、缺源/额外声明/坏pin或snapshot、全部预编译、bootstrap不执行、未选stdlib/项目/relative/出序导入拒绝、旧三模块同时存在且类型隔离、嵌套命名空间拒绝、consumer/init异常清理、退出后late import及固定API。复用原source loader回归证明旧行为保持。

3份Python已静态AST语法及差异审阅；**16项测试及项目lint/build/test未运行**。门禁为授权提交后的GitHub Actions Runtime与准确CPython3.12.15回归，无CI/skip/依赖变更。

本批5份文档同步，Runtime/Ops拥有writer_loader→source_loader及固定模块组，单向无循环，无owner/依赖图/债务/scanner基线变化，无包依赖/数据库迁移、root/VM/云/生产操作。

下一步先远端交付并核对新/旧loader实际CI；再把此固定writer子候选与受保护祖先/源码/输入装配scope接通，随后处理实际来源/当前安装验证到消费的FD/锁持有期。发布/准备/R2/R3/R4实际能力与可信终结仍须逐项接入；C1继续OPEN。
