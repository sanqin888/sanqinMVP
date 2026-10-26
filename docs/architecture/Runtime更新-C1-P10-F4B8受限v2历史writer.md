# Runtime 更新 — C1 P10-F4-B8 受限v2历史writer

**2026-10-26｜IMPLEMENTED_LOCAL / TESTS_NOT_RUN / LOCAL_CONSUMPTION_ONLY / C1_OPEN。**

F4-B7 [PR #2968](https://github.com/sanqin888/sanqinMVP/pull/2968)最终head76a756b4fa5b92392f2e0010a5674f47e500d539经[CI #7614](https://github.com/sanqin888/sanqinMVP/actions/runs/40323096587)成功，docs-only：1成功/9跳过，无修复，合并dev707749fd04837ce819f82fdea457dd9c2b074650。本批基于该dev，在feat/c1-p10f4b8-restricted-writer-20261026实施，未推送、未运行新CI。

## 1. 实际入口与权限

新增normal_runtime_history_writer.consume_v2_local_attempt，参数仅原canonical launch/request bytes及独立双pin，返回惰性context。准确root身份/既有固定BASE与稳定全局锁、两个预交付0700目录沿用原规则。锁内必须v1/v2均为空；任何既有历史，包括规范处置声明，都阻断，不清理或迁移。

生成随机attemptId和准确原输入绑定CLAIM，写00000001.json，文件与父目录fsync及同FD读回/路径边复核全部通过才yield活跃handle。仅该进程/线程context可观察/记录abort；不可pickle或从磁盘恢复。没有Flow、准备、安装、R2认证、通用public append、DISPOSITION、第二笔准入或finalizer。私有_append也限制为首CLAIM及次ABORT_OBSERVATION。

这是本机消费，不证明源码、平台、当前/目标或真实效果已认证。匹配pins、handle或报告都不是效果许可；输出复用history非授权报告，所有相关标志false/BLOCKED。未来受信组合器须独立完成来源/对象/权限认证，并保持锁和对象生命周期覆盖实际步骤。

## 2. 文件与生命周期

writer复用local._write的O_EXCL/NOFOLLOW、新regular/root/单链接/同设备、仅新对象0600规范、短写进度、文件fsync/原bytes读回及父目录fsync。事件原bytes先按B5结构规则和单项16KiB校验；仅两个准确名字，无原件替换或尾部修复。

重构history._scope：共用_layout_scope仅保护不可变祖先/锁/双目录身份边；只读_scope继续叠加原完整目录stat快照。writer自行保持旧ledger完整stat和空集合，以及准确已创建事件集合、文件FD/stat/原bytes；自己的写入不能成为容忍其他变化的开关。

handle.record_abort要求原ABORTED观察、原request/launch与准确attempt，先毒化一次尝试状态，再追加00000002.json并完整同步，前序绑定首事件原bytes。写入/同步未知后不能再次abort；异常不掩盖最初失败，不在finally自动记录成功/事故。关闭仅关闭FD和活跃handle，所有原件永久保留。

任意claim写/读回/fsync失败不yield；残片/规范但同步未知的原件仍阻断新context。正常/异常/SIGKILL都不能重新消费历史、恢复策略或业务。物理断电/跨克隆单写者不由这些本机文件证明。

## 3. 验证

新增16项测试，复用临时假namespace/既有输入fixture，真实FD/fsync/flock及独立进程。覆盖claim/abort原bytes及前序、原解释器可读、权限false、二次/旧入口拒绝、处置声明和v1残留拒绝、错pin/缺目录、短写/零进度、文件/父目录fsync失败及顺序、wrong/重复/未知abort、禁止处置追加、同bytes替换、原异常保留、FD关闭和SIGKILL后阻断。原37项history与30项v1回归继续覆盖共用scope。

3份Python源码/测试仅静态AST语法检查及差异/生命周期审阅；**16项新测试与项目lint/build/test未执行**。实际验证等待授权后的GitHub Actions Runtime全量及准确Python3.12.15回归，无CI/skip改动。

## 4. 状态与后续

本批5文档同步，Runtime/Ops同owner、writer→history→local单向依赖无循环，无owner/依赖图/债务/scanner基线变化。沿用既有事件schema，无九源/v1批准输入/17 Bundle、包依赖或数据库迁移变化；无root/VM/云/生产操作。

下一步先交付并核对实际CI；后续仍需可信来源/效果组合、冻结后保留状态与R2处置闭包，才能实现独立终结和全新事务准入。本writer刻意不提供后两者，C1仍OPEN。
