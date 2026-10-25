# Runtime 更新 — C1 P10-F3 固定Runtime路径只读锚点

**2026-10-25｜IMPLEMENTED_LOCAL / TESTS_NOT_RUN / FIXED_PATH_REVIEW_ONLY / P10-F_OPEN / C1_OPEN。**

## 1. 基线及目的

P10-F2 [PR #2957](https://github.com/sanqin888/sanqinMVP/pull/2957)最终head46c2458b的[CI #7591](https://github.com/sanqin888/sanqinMVP/actions/runs/40217278502) SUCCESS，4作业成功、6业务lane按范围跳过；实际Runtime890、Release45、精确CPython3.12.15回归222全部通过，含新增19项，无需修复。已合并dev `63d44cb4a724c9a6c8cb0d92e7ec768b5f3afafa`。用户授权“合并后开始下一步”，本批在feat/c1-p10f3-fixed-runtime-anchor-20261025推进。

F2需要调用方借出目录FD，因此不能说明FD指向固定生产路径。本批新增外置[normal_runtime_readonly_anchor.py](../../ops/runtime/normal_runtime_readonly_anchor.py)，把固定/opt/sanq/runtime祖先检查和F2的实际文件/发布审阅组合在同一持有scope；不改F2直接借FD接口或它的证据等级，不改原九文件bootstrap/loader或Flow。

## 2. 实现和失败边界

- 唯一公共入口review_fixed_runtime不接受path/root/installed_root_fd/owner覆盖或任意kwargs，无CLI；默认生产root owner固定0/0，路径组件固定opt→sanq→runtime。
- 从**当前进程namespace**的/打开只读目录FD，逐段no-follow、安全owner/mode、同设备与实际边绑定；直接复用normal_runtime_source_anchor的_platform/_directory_key/_checked_recheck等现有规则，没有复制第二套祖先检查算法。
- 持有4层祖先FD，先复核，再把叶FD传给F2。F2负责17+Manifest+三保留文件、目标newest发布和当前历史来源；F3在F2退出后再次复核祖先，最后关闭所有自有FD才返回结果。不关闭其他caller FD，因为公共入口本身不接收caller FD。
- 路径链接/替换、可写权限/owner漂移、跨设备、不完整路径或检查异常都不给出缓存成功。正常/异常均关闭自有FD，不修复权限、不改目录，不恢复业务。无关父目录条目变化不应误判，沿用PREP-04按准确边核对的规则。
- 只接受F2的完整BLOCKED及7个false边界字段，防止在包装时遗失限制或把错误结果当只读通过；不生成StepCompletion或授权令牌。

新增结果字段fixedRuntimePathBound=true及runtimePathBinding仅表示**当前namespace内这次scope的点时路径绑定**，记录固定路径和4层device/inode。namespaceAuthenticated=false、continuousBindingVerified=false；原installedRootPathAuthenticated=false保持其Host/namespace/执行信任尚未建立的限制，不把它改true。容器/挂载实时认证、持续维护、事务准入、Flow/安装权限及decision仍原值false/BLOCKED；没有声明已冻结生产路径，不能把FD持有当作writer禁入。

这段代码自身和F2的来源、真实执行器/关键平台仍需后续组合固定；没有把程序自报路径当外部来源认证。旧23隔离用例及9源711197d2不为本批新代码背书；目前未运行此库访问真实/opt或生产主机。

## 3. 10个已编写测试

[测试文件](../../ops/runtime/tests/test_normal_runtime_readonly_anchor.py)用真实临时目录/FD构造固定层级，仅patch私有namespace-root provider和root-owner常量到fixture；没有实际chroot/mount或更改真实/opt。

覆盖：叶FD及输入在scope内交给F2、退出关闭；无公共root/path/owner覆盖；祖先/叶symlink在review前拒绝；错误owner/可写祖先拒绝；review期间祖先替换或权限漂移退出拒绝且不修复；无关父条目变化允许；结果授权true/false字段缺失拒绝；异常或缺失路径无FD泄漏；复用F2现有data/fetch fixture进行真实F2文件/发布核对的完整组合，保持changedMembers及权限边界。最后一项不运行F2的测试方法、不复制其19套用例。

静态AST Python3.10、差异/空白及MCP写入回读核对；**新增10项尚未运行，本批没有新CI**。现有CI会通过test_normal_runtime_*.py自动收录准确Python3.12.15回归，同时进入Runtime全量，不修改workflow。MCP/scratch没有执行项目lint/build/test或动态import。

## 4. 下一步及状态

本批为A类内部原子新增只读包装；同Runtime/Ops内仅新增anchor→readonly_review/source_anchor/既有release GET的依赖，无owner/跨上下文导入/循环、债务计数、scanner基线、兼容/17 Bundle、依赖/锁、数据库迁移或R2实现变化。原v1、九源/三输入及权限guard不变，无新的root操作、维护/AWS/容器/业务效果。

后续仍需实际执行组件/输入来源与新鲜容器/存储观察、跨进程一次性事务准入/事故记录及安全私有准备。R2持续维护、R3真实快照、R4安装复验分别交付和验收，不能把本次固定路径读取直接接为实际VERIFY_SOURCE的完整执行许可。下一步可限定审阅事务持久化与create-only准备桥接，先明确准确位置/锁/失败归属与R2身份映射，避免另造平行ledger；本批不实现这些写入。

本批代码/测试和进度文档本地待审，未推送，P10-F/C1仍OPEN。已提交F2的测试结果与本批未运行测试严格区分。
