# Runtime 更新 — C1 P10-F4-B6 v1旧入口与v2布局共同门禁

**2026-10-26｜IMPLEMENTED_LOCAL / TESTS_NOT_RUN / LEGACY_ENTRY_GATE_ONLY / C1_OPEN。**

F4-B5由[PR #2966](https://github.com/sanqin888/sanqinMVP/pull/2966)最终head e65ee0031a42e6e653c0394bb2c36b649752e5ef 经[CI #7610](https://github.com/sanqin888/sanqinMVP/actions/runs/40274211158)成功合并dev ab49b2c82faaea25bd1b4c1b16794dae32da6e23。4作业成功/6按范围跳过；ops job121413409111实际Release45、Runtime1004、准确CPython3.12.15回归336通过，包含31项新增测试，无CI修复。

本批基于该dev，在feat/c1-p10f4b6-legacy-entry-gate-20261026完成下一源码切片，尚未推送/运行新CI。

## 1. 解决的问题与准确行为

F4-B5已能在同一全局锁下观察两个布局，并让v1任何残留阻断v2观察路径；但旧v1消费入口此前只看v1为空，可能绕过另一个目录中的v2历史。本批补齐旧入口侧的拒绝门禁：

- 原_locked持有固定BASE+normal-update.lock后，每次recheck均用dir_fd及follow_symlinks=false核对固定normal-update-history-v2。
- 只有准确FileNotFoundError表示v2路径不存在。任何既有对象——空目录、有内容目录、普通文件、FIFO或悬空symlink——均拒绝旧入口；permission/其他stat错误也拒绝，不能当“为空”。
- 检查先于v1 claim创建，覆盖handle观察、abort和成功退出时的后续复查；若持有期间出现v2，停止后续，保留原v1已消费/未明记录，不恢复策略或删除资产。
- 原inspect_local_admission也走_locked，所以v2存在时拒绝旧接口，不返回旧布局可用的暗示；应使用固定双布局只读解释器观察，仍全部false/BLOCKED。
- v2不存在时保持原v1行为与签名，不自动创建v2、不改变原消费schema/写入顺序/权限/永久消费和失败语义。

normal_runtime_history_review的固定_HISTORY统一引用local_admission._HISTORY，避免两入口对不同名字实施门禁；没有循环导入。history原只读规则不变：v1有任何内容仍阻断，v2观察只输出未认证结构，不准入/写入/终结事务。

## 2. 效果与边界

这是一项有意收紧的内部入口兼容规则：**即使v2目录为空，也停用v1消费路径**。不提供自动迁移、fallback到v1、清空或移走v2后重试的操作。现场交付/创建v2布局必须先确认适用源码和完整入口控制，本批不提供或执行部署命令。

它没有实现v2消费入口、历史writer、可信终结器或完整Flow装配；也没有给结构解析成功的报告增加许可。所有未来writer仍须共用同一锁与双布局检查，先完成其真实证据/权限及写入未知协议审阅。

本地目录存在性不是不可回滚的模式注册：旧版本源码、整机快照/克隆或root管理变化不能靠此gate排除。正式候选必须固定实际使用的源码/入口，R2离机身份及恢复门禁仍独立负责；不能以门禁代码已合并宣称旧操作器已在生产禁用。

## 3. 测试与文档

新增6项测试到既有history suite（31→37项）：真实消费被空v2拒绝且无写入；普通文件/悬空链接/FIFO拒绝；活跃v1消费后出现v2立即拒绝并保留两消费原件；v2存在时旧观察/关闭handle abort不可改记录；stat权限错误不当缺失；v2缺失时原消费成功且不会创建v2。原跨进程稳定锁、v1/v2冲突、只读无写入及30项原v1回归继续适用。

3份Python源码/测试已静态AST解析、检查门禁先后与失败路径；**新增测试/项目lint/build/test未运行**。实际验证依授权交付后的GitHub Actions Runtime全量和准确CPython3.12.15回归，无CI或skip变化。F4-B5的1004/45/336仅归档已合并证据，不声称覆盖本批新代码。

本批同步6份文档，归属Runtime/Ops，history→local单向边不变；无owner/依赖图/债务/scanner基线、九源/v1批准输入/17 Bundle、包依赖或数据库迁移变化。未操作root/VM/云/生产对象。

## 4. 下一步

先审阅并交付本批门禁，取得最终head实际CI。之后落实有界追加writer的准确接口、持有期与fsync未知语义；writer仅消费经独立验证的权限，不能接受自报成功或把DISPOSITION_OBSERVATION升级成可信终结。真实终结仍需安装/冻结后保留状态/策略恢复/业务结果及R2处置证据和同候选验收。C1继续OPEN。
