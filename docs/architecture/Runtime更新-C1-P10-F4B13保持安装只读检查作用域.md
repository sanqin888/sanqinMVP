# Runtime 更新 — C1 P10-F4-B13 保持安装只读检查作用域

**2026-10-26｜IMPLEMENTED_LOCAL / TESTS_NOT_RUN / HELD_READONLY_REVIEW_ONLY / REAL_ADMISSION_NOT_IMPLEMENTED / C1_OPEN。**

基于 `dev@61bb0e484f0748646ac5740bb2d69d31c85b07e4`，分支 `feat/c1-p10f4b13-held-readonly-review-20261026`。前批 [F4-B12 合同](Runtime更新-C1-P10-F4B12检查至消费持有期与锁合同.md) 已通过 [PR #2976](https://github.com/sanqin888/sanqinMVP/pull/2976) 的 [CI #7629](https://github.com/sanqin888/sanqinMVP/actions/runs/40340308379) 并合并；准确 head `08bcca56c18564b6af85f806869a9cff387f5d96` 为 docs-only，1 作业成功、9 个按范围跳过，未运行 Runtime 测试。

本批实现 B12 规定的独立只读生命周期切片，未连接消费/Flow 或改变认证边界。

## 1. 两个新增 context 与原报告接口

| 入口 | 对象范围与保持期 | 使用边界 |
| --- | --- | --- |
| `normal_runtime_readonly_review.hold_readonly_update` | 借入已打开安装目录 FD；复制并持有有限目录/17 成员、Manifest、三保留文件的自有 FD，直到 consumer 退出 | 借入 FD 始终归调用方；不认证其固定路径或 Host |
| `normal_runtime_readonly_anchor.hold_fixed_runtime_review` | 固定 /opt/sanq/runtime 的祖先 scope 包住上述完整安装 scope | 无公开 root/path/owner/FD 覆盖；固定当前 namespace 仍非 Host 认证 |
| `review_readonly_update / review_fixed_runtime` | 复用同一检查实现，读取报告后先完成 scope 退出再返回 | 原点时报告字段/非授权语义保持，没有第二套校验或过渡别名 |

两个新增 context yield 内部 `_HeldReadonlyReview`。其 `report` 从进入时的规范化 JSON 原字节返回独立深副本；`recheck()` 显式检查原对象。更改返回 dict 或嵌套字段不改变库内观察。报告仍是进入时点的记录，读取 report 本身不重新查询 GitHub、也不表示连续新鲜性；要核对当前文件/路径，须在有效 scope 内显式 recheck。

handle 仅在原进程/线程且 scope 存活时接受 report/recheck，退出即失效，禁止 pickle。它没有公开 FD、调用效果或许可方法；这是进程内生命周期约束，不是防恶意 Python/Root 的安全 token。

## 2. 检查、退出与异常顺序

进入仍按原 F2 规则先解析独立双 pin/原 v1 输入、核对原 target Archive 与既有 newest 发布策略、解析原保留观察，再打开有限安装树并验证当前发布/原成员和三保留文件；不选择新目标、不允许历史回退，不将旧 READ_ONLY_BOOTSTRAP 观察升级为冻结后基线。

完整检查后先 recheck，再 yield。安装层 recheck 同时核对：

- 所有持有目录的原完整元数据、精确成员集合及路径边；
- 所有成员的原 inode/owner/mode/link/size/mtime/ctime 和目录项；
- 从持有 FD 有界 pread 的原完整 bytes，以及读后元数据。

固定路径层的显式 recheck 同时检查祖先和安装成员；正常退出先完成安装层复核/关闭，再完成固定祖先复核/关闭。父目录中与固定路径无关的兄弟项变化不被误判为固定边替换，原规则保留。

`_owned_fds` 统一用 ExitStack 尝试全部自有 FD 的关闭：已有 consumer/核验异常或 KeyboardInterrupt/SystemExit 时，关闭失败不替换原始异常；正常关闭失败则传播，不返回成功报告。consumer 抛出时不会以退出漂移错误覆盖它，也不会产生成功结果。正常退出的检查由生成器实际控制流决定，不依据环境中的 sys.exc_info；即使调用发生在外层 except 处理中，也不能跳过正常退出复核。

本次没有更改祖先/成员所有权规则或正常成功的校验条件；新读取进一步比较原 bytes。异常优先级的有意变化适用于共用私有 scope：保留原失败而不以清理/退出失败覆盖，绝非忽略错误后继续运行。

## 3. 私有调用方与迁移分类

属于同一 Runtime/Ops owner 内部原子改动。私有 `_installed` 与 `_fixed_runtime` 的 yield 元组增加 recheck，已一次性更新所有源码使用方：

- F2/F3 新 context 消费三元组并组合检查；旧公开报告函数复用它们。
- `normal_runtime_postinstall_review.review_fixed_installed_target` 只同步两处私有三元组解包；原 B3 点时复验、目标/观察/policy/false 字段不变，不获得持有到 consumer 的新接口。
- 原 F3 单元夹具改为 context 形式模拟 F2，所有原拒绝断言继续保留；真实 F2/F3 组合测试继续走真实有限 FD 树。

没有保留旧私有形状、过渡兼容 facade 或重复实现。公开输入 schema、原双 pin、固定路径、sourceRoot、17 Bundle、旧九源 CLI 和八模块 writer loader 均不变。sys/threading 为已有 Python 标准库，不新增包或修改清单/锁文件。

## 4. 聚焦测试与已达到的验证状态

新增 **22 项**测试：F2 新类 15 项、F3 新增 7 项，复用原 F2 数据/GET fixture，非继承重复运行原测试。覆盖：

1. consumer 期间真实成员/祖先 FD 保持、正常退出全部自有 FD 关闭、借入 FD 保留、原 bytes 不写；
2. 同 bytes 替换、原地内容/保留文件漂移、合法但改变的模式、额外成员、成员目录及固定祖先替换；显式重检和正常退出拒绝；
3. GET 期间替换或失败、错误独立 pin 时不 yield，部分打开对象全部清理；
4. report 深副本隔离、退出后/错进程或线程使用/序列化拒绝，recheck 不重新联网；
5. 原 consumer 异常/KeyboardInterrupt/SystemExit 与文件或祖先漂移、关闭错误组合的原异常优先，正常关闭错误传播；
6. 外层 except 中正常使用仍执行成员/祖先退出检查，不受 ambient exception 影响。

5 份 Python 仅完成静态 AST 解析、调用方/生命周期与最终差异审阅。**未在 MCP-workspace 运行 lint/build/test，也未运行本批 GitHub Actions，22 项新测试尚未执行。** 授权提交后按现有 ci.yml 的 Runtime 全量、Release 和精确 CPython 3.12.15 C1 门禁验证，无工作流/skip 变更。既有 F2 19 项、F3 10 项及 B3 复验回归仍须在该最终 head 实际通过。

## 5. 真实组合仍未完成

保持 FD 与反复读回不冻结文件，退出失败不能撤回 consumer 已做的动作。本 context 只能在安装前只读检查期使用，不能跨有意改变动态状态的冻结或替换安装目录的 HANDOFF，不能忽略退出失败或重设快照。

本批没有全局锁、CLAIM/ABORT、准备、Docker、快照、R2、策略恢复、业务放行或终结能力，不返回 StepCompletion。没有把两个新 context 加入 B11 私有 loader，发布依赖的顶层 sys.path/构造副作用和受保护 Bundle 影响仍按 B12 开放。没有启动现场解释器或替换真实候选材料。

下一步先取得本批实际 CI；随后审阅发布检查所需来源的最小提取/有限导入方案与受保护 Bundle 使用方，解决同组装配，再按 B12 一次锁/动作前重检合同接线。不得跳到缓存 report 后消费、递归重开锁或未经真实 R2/效果闭包的 Flow。可信终结与再次消费继续阻断。

## 6. 交付状态

本批 3 源码 + 2 测试 + 5 文档，B12 结果归档及原 worklog 记录就地更新，本批新增一条日志。Runtime/Ops 所有权和既有单向项目依赖边不变，无依赖图/循环/债务/scanner 基线变化；未执行架构扫描。无依赖、数据库迁移、R2 认证/权限、root/VM/AWS/生产变化。

最高状态为 `IMPLEMENTED_LOCAL / TESTS_NOT_RUN`，本批尚未推送/创建 PR；C1 保持 OPEN。
