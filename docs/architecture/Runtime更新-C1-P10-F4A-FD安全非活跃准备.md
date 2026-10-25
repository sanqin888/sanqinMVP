# Runtime 更新 — C1 P10-F4-A FD安全非活跃静态准备

**2026-10-25｜IMPLEMENTED_LOCAL / TESTS_NOT_RUN / INERT_PREPARATION_ONLY / P10-F_OPEN / C1_OPEN。**

## 1. 基线与范围

[F4边界](Runtime更新-C1-P10-F4事务准入与非活跃准备边界.md)已由[PR #2959](https://github.com/sanqin888/sanqinMVP/pull/2959)最终head7eb0c320经[CI #7595](https://github.com/sanqin888/sanqinMVP/actions/runs/40218694980) SUCCESS合并dev `daaf98cfa660ee48e7f1d729507cbb635cb53e66`；scope通过、9重lane依docs-only规则跳过。用户已授权合并后开始F4-A。分支feat/c1-p10f4a-private-prepare-20261025；AGENTS仍blob03045c7d，无更深规则。

新增[normal_runtime_private_prepare.py](../../ops/runtime/normal_runtime_private_prepare.py)和[20项测试](../../ops/runtime/tests/test_normal_runtime_private_prepare.py)。这是A类内部新增准备库，会在未来明确执行授权下创建准确非活跃材料；**本轮只写源码/测试，没有调用它或创建真实root目录**。无CLI/任意路径或owner参数、长期root launcher、ledger、Flow、维护、Docker/AWS/DB或active Runtime切换。

## 2. 实际准备边界

公共函数prepare_private_target复用原v1双pin输入解析、现有newest目标发布核验和固定17/layout校验，要求原目标Archive不可变bytes、有界且与request摘要一致。校验在打开准备输出scope/创建之前完成；旧批准目标已非newest则拒绝，不自动换目标或启用历史fallback。原Manifest按准确tar成员bytes保留，额外拒绝重复JSON key/过大Manifest，不重写发布字段。

真实/effective UID/GID固定0/0；从当前namespace的/逐段持有root/sanq-runtime-operator/normal-update-preparations，只接受事先存在的root:root/0700祖先，复用既有FD/no-follow/同设备/边复核规则。入口不自动mkdir、chown或chmod这些已有祖先；缺项/可写/owner或路径不符拒绝。本机实际是否已交付该父目录本轮没有探测，不把设计名称当部署事实。

按已解析txid只创建新叶，布局为：

| 对象 | 内容/权限 |
| --- | --- |
| <txid>/candidate/ | 精确17份静态源码+原Manifest，固定子目录0700/文件0600，无执行或激活 |
| <txid>/original.tar.gz | 原发布压缩bytes，0600，保留原digest |
| <txid>/preparation.json | 本次内容已同步的被动证据，0600；不放进candidate或17 Bundle |

共20个regular文件：17源码、1原Manifest、1原Archive、1证据；证据列出前19对象的大小与SHA256，自身摘要由返回结果单列，不造循环自摘要。既有Path式prepare保持原状，新库不放宽或替代其接口。

## 3. FD、同步与失败行为

- 目录mkdir使用固定父dir_fd，已存在目录/文件/链接/残片一律碰撞拒绝。每次创建目录后同步父目录，再持有新目录FD；只规范自己刚创建对象的0700/0600，不修复已有对象。
- 文件以O_EXCL/O_NOFOLLOW新建，regular/单链接/root owner/同设备/准确mode检查；循环处理真实短写，零进度/无效长度拒绝。持有文件FD，fsync后通过同一FD的pread逐块核对原bytes，并复核元数据/目录项。
- 完整静态内容核对后，从叶到根同步全部新目录及准备父目录，再写证据文件；证据fsync后再次同步目录，复查准确成员集合、文件bytes/metadata、目录边及祖先。全部检查/FD关闭完成才返回。无tar.extractall、递归动态扫描或用户路径输出。
- 文件/目录fsync、写入、读回、类型/权限/设备或路径复核有任何失败都不给成功结果。只关闭自己的FD；已创建部分、原件、证据或残留都保留，不删父目录/不覆盖/不自动retry或resume。
- 证据phase=CONTENT_SYNCED_NOT_ADMITTED仅记录当时内容观察，不是可恢复journal提交点。写出证据后若目录同步/最终复核失败，文件可能仍在，但入口没有返回完成；再调用同txid仍碰撞拒绝，不能凭证据恢复流程。

返回包含request/launch/target digest、txid、准备树device/inode和证据摘要，不只给字符串路径。FD在返回前关闭，**这些是点时身份/完整性证据，不是长期持有的准备capability或写路径冻结**；后续HANDOFF必须重新绑定/持有真实对象并核验，不能盲信旧path或inode。源代码/平台/namespace信任和精确现场权限仍由受保护执行入口另行建立。

## 4. 未提升的权限与R2分工

status=INERT_STATIC_PREPARED_ONLY、decision=BLOCKED；currentInstallationVerified、namespaceAuthenticated、continuousMaintenanceVerified、transactionAdmitted、flowInvoked、readyToInstall、authorizedToMutateProduction均false，dynamicStateCopied=false。targetPublication的verified只保留发布来源校验含义，不授权安装。

F4-A不读取当前/opt/sanq/runtime，不复制.env/state/marker，不声称已刷新容器/挂载或营业期状态；最终三动态文件留待R2持续冻结之后交接核对。txid mkdir只解决同准备名字碰撞，不是同一安装的全局互斥、跨进程更新ledger、R2 epoch/CAS或跨快照防回滚。

未来正常Flow调用仍先经过真实VERIFY_SOURCE/事务准入，再接PREPARE_PRIVATE；本库不会返回StepCompletion、消费事务或自行调用核心。原九源711197d2/三输入、loader/v1/17 Bundle、旧lab guard及R2实现不变。准备代码本身尚未进入已固定可执行候选。

## 5. 测试与当前验证

20项离线测试使用真实临时目录/FD与静态原Archive，复用F2既有data/fetch fixture，GitHub GET完全模拟。仅patch私有namespace-root provider、owner常量和root guard以供非root临时目录测试；无真实root/opt操作，不把fixture结果当生产身份验证。

覆盖准确17+原Manifest/原Archive/证据及权限false；完成后重复拒绝；已有文件/目录/链接和残片不覆盖；错pin/原bytes/目标digest/newest在创建前拒绝；缺失/不私有祖先不自动修复；短写及零进度；写入失败、文件fsync失败、证据后的目录fsync失败都不完成/不resume；同步顺序及证据最后写入；读回篡改、目录替换；真实双线程同txid仅一创建者；异常FD清退；错误设备的新目录拒绝并保留；无公共root/path/owner覆盖与真实root guard；新文件symlink碰撞不改外部文件。

本批仅做AST Python3.10语法、空白和MCP写入回读/差异静态核对；**20项尚未运行、未推送或运行新CI**。现有CI的Runtime全量与准确CPython3.12.15 test_normal_runtime_*.py会自动收录，无workflow/依赖更改。fsync失败/顺序的模拟不能认证物理断电持久性；此前900/232与23用例保持原候选范围，不冒写为本库验证。

## 6. 后续

先交付本源码切片并通过准确head CI，再审更新尝试的全局锁/一次性消费与R2身份映射；避免再造R2 CAS。真实父目录交付、有限一次准备执行或完整Flow/AWS/安装均分别需要准确对象的执行授权，不能从本次源码授权推导。

Runtime/Ops内新增private_prepare→输入解析/祖先FD/发布与Bundle校验的单向依赖；无业务owner/跨上下文边/循环、债务/scanner基线、兼容、部署单元、17 Bundle、依赖/锁或数据库变化。五份适用进度文档同步，本地待审；无需迁移，P10-F/C1继续OPEN。
