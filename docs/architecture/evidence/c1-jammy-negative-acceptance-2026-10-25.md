# C1 — Jammy同候选隔离负例验收归档（2026-10-25）

**ISOLATED_NEGATIVE_PASS_SCOPED / READ_ONLY_ACCEPTANCE_COMPLETE_SCOPED / C1_OPEN。**

## 1. 对象与原始证据

| 项目 | 准确值 |
| --- | --- |
| 手动运行 | [40210744043 / attempt 1](https://github.com/sanqin888/sanqinMVP/actions/runs/40210744043)，workflow_dispatch，dev，SUCCESS |
| 作业 | [121221230335](https://github.com/sanqin888/sanqinMVP/actions/runs/40210744043/job/121221230335) |
| lab/workflow提交 | `ecf8fc31c52a887784e3ecc3cebfb3c940b258c6` |
| 九文件候选源码 | `711197d2f31d1d6198d37f662e072e647f541efb` |
| 事务 | `c1-assembly-20261025-001` |
| 环境 | GitHub托管一次性Ubuntu22.04.5/Jammy/x86_64，真实root身份与准确/root和/opt路径 |
| 解释器 | CPython3.12.15 final，`/opt/sanq/python/3.12.15/bin/python3.12`；准确原tar SHA256 `b8238d97ea09cfb608f5d96cee29f033f91f6bb1ab32365f0049a79bbc698555` |
| 材料来源 | 固定构建run40192632845/artifact12598742317，未重新构建；内部review及关键7库摘要门禁通过 |
| launch / request SHA256 | `1bcfe5482876c79239c9137750cd4b744c82c8604e46b293418c7b0bcae6b395` / `54ee69fd11f188a0ff17b636c77c4213a2cf9bea83a3fa8b361a4de2db954cc6` |
| pins SHA256 | `850a3b5745312540eec7b58b6552518c80522ba943049af5ef8e92de684b542f` |
| 结果artifact | [12605371801](https://github.com/sanqin888/sanqinMVP/actions/runs/40210744043/artifacts/12605371801)，`c1-jammy-negative-40210744043-1` |
| 原ZIP | 18,375 bytes，SHA256 `9392252c8eba14319ff56f621093b52363600bdb7c35128485634daacba3ad7d` |
| GitHub到期时间 | 2026-11-08T16:15:13Z（UTC）；原始文本已随本批归档，不依赖到期后的下载能力 |

[原件文本及逐文件摘要JSON](c1-jammy-negative-acceptance-2026-10-25.json)保留原ZIP全部69个成员的路径、字节数、SHA256及完整UTF-8内容（含23条result、21对stdout/stderr、summary、2份准备记录和held-hardlink输入原件）。这是证据归档格式，**不是入口消费合同或批准输入**；不包含.env原文、凭据或业务数据。原ZIP没有重打包冒充原件；JSON可还原成员文本字节，ZIP压缩元数据仍以原ZIP为准。审核通过GitHub插件下载原ZIP到离机工作区进行，未执行候选/项目代码。

## 2. 首跑失败及最小修复

run40209172466/dev@6d855c9f在case前祖先检查失败，不能计为任何负例通过。PR #2954的最终head ac7bbe34dd6ac5512a343e532c0bee1e24af0b9a经[CI #7585](https://github.com/sanqin888/sanqinMVP/actions/runs/40210512080) SUCCESS，4作业成功、6作业按范围跳过；实际Release45、Runtime871、精确3.12.15 C1回归203均通过，squash合并为ecf8fc31。原工具PR #2952/CI #7579及候选来源身份仍保留。

本次opt-preparation.json证实一次性runner的/opt原uid/gid=0/0、mode=0777，经非递归同目录FD准备后为0/0、0755；没有改变候选权限检查。旧日志没有记录首跑具体owner/mode，不把本次观察冒写成上次精确元数据。preparation.json中的PREPARING/casesStarted=0是起始事件；最终结果以summary和case原件为准。

## 3. 23项逐项结果

| 序号 | case | 实际结果 | 退出码 |
| --- | --- | --- | --- |
| 1 | `baseline` | 基线通过 | 0 |
| 2 | `wrong-bootstrap` | 启动前拒绝 | 未启动 |
| 3 | `wrong-interpreter-path` | 启动前拒绝 | 未启动 |
| 4 | `extra-environment` | CLI拒绝 | 2 |
| 5 | `wrong-cwd` | CLI拒绝 | 2 |
| 6 | `extra-B-argv` | CLI拒绝 | 2 |
| 7 | `tamper-pins.json` | CLI拒绝 | 2 |
| 8 | `tamper-launch.json` | CLI拒绝 | 2 |
| 9 | `tamper-request.json` | CLI拒绝 | 2 |
| 10 | `wrong-support` | CLI拒绝 | 2 |
| 11 | `missing-source` | CLI拒绝 | 2 |
| 12 | `extra-source` | CLI拒绝 | 2 |
| 13 | `missing-input` | CLI拒绝 | 2 |
| 14 | `extra-input` | CLI拒绝 | 2 |
| 15 | `writable-ancestor` | CLI拒绝 | 2 |
| 16 | `public-input` | CLI拒绝 | 2 |
| 17 | `public-source` | CLI拒绝 | 2 |
| 18 | `wrong-owner-input` | CLI拒绝 | 2 |
| 19 | `symlink-input` | CLI拒绝 | 2 |
| 20 | `symlink-source-directory` | CLI拒绝 | 2 |
| 21 | `hardlink-input` | CLI拒绝 | 2 |
| 22 | `fifo-source` | CLI拒绝 | 2 |
| 23 | `final-baseline` | 基线通过 | 0 |

首尾基线均为RC0、空stderr，完整报告与固定13字段逐一相等，包含准确源码/事务/launch/request、CANDIDATE_ASSEMBLED / ASSEMBLY_ONLY、所有权限false与BLOCKED。2项外层拒绝均started=false，没有运行候选或伪造CLI退出码。其余19项均started=true、RC2、空stdout、受控stderr JSON、flowInvoked=false、authorizedToMutateProduction=false、decision=BLOCKED；FIFO有界返回，未触发20秒超时失败。各result与summary对应项相等，21对原始stdout/stderr的SHA256均重算一致。2个基线报告原字节相同。

最终summary准确绑定run/harness/source/transaction，23项无FAIL且complete=true、flowInvoked=false、productionAuthorized=false。原ZIP digest与GitHub元数据一致；69个唯一、有界、安全成员路径均核对，逐成员原文摘要已记录。此处23是手动验收case，不能与CI203/871测试数相加为同一测试套件。

## 4. 限定技术结论与进度

此前AWS准确九源/三输入的只读正例及Python安装smoke/8368成员结果，继续以[PREP-12现场记录](c1-prep12-install-bootstrap-acceptance-2026-10-25.md)的操作者粘贴证据等级复用。本次隔离结果补齐所审九文件入口的外层/真实进程/输入/源码/成员/权限/链接对象必要负例；P10-E更新为READ_ONLY_ACCEPTANCE_COMPLETE_SCOPED。不能把lab副本的成功视为生产持续维护、同业务容器挂载、跨重启屏障或效果能力完成。

有限TCB包含GitHub托管runner、已审工作流、系统Python/OS及固定构建材料。环境guard不是密码学平台认证；来源对象、关键依赖和入口信任只在已记录范围成立，不声称完整依赖闭包、未知动态消费认证或第三方独立见证。CLI输出sourceProvenanceAuthenticated=false等权限字段保持原意，文档结论不会修改它们。

**C1整体继续OPEN；P10-F完整效果候选未形成。** 下一阶段应审阅R2持续维护/Guard/CAS、R3真实AWS快照、R4安装/复验/原策略恢复与最后放行的现有接线缺口，限定下一个源码切片；不得直接解除旧实验guard或把本只读入口改名当完整执行器。实际效果候选改变源码、平台或输入边界后重新固定并验证受影响部分，匹配证据继续复用。不要求重跑已完成AWS安装、只读正例、旧S5或另建全量重复矩阵。

本次只做归档及进度同步，无源码/CI/依赖/数据库迁移/生产操作；归档分支docs/c1-negative-acceptance-20261025尚未推送，当前文档未运行新CI。历史LOCAL/NOT_RUN/首次失败均作为阶段快照保留，以最新续记为准。
