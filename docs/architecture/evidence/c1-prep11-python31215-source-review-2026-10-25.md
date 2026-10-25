# C1-PREP-11 Python3.12.15 本地源码审阅快照

**2026-10-25（America/Toronto）｜LOCAL_UNCOMMITTED_NOT_APPROVED / CI_NOT_RUN / C1_OPEN。**

本清单对应授权实施后的工作树字节，基于 `dev@32963a0c7ed093600aa91847d98204ede0795337`。准确版本为3.12.15，代码固定解释器 `/opt/sanq/python/3.12.15/bin/python3.12`。9文件中2个运行源码变化、7个保持原字节。不是正式批准输入或解释器来源证明。

| 源文件 | bytes | SHA256 | 相对dev |
| --- | ---: | --- | --- |
| normal_runtime_bootstrap.py | 17469 | `490b5678e4902c2a0d693ea88b6cb8d364751c171fcf3843af0d0f294c6a06e9` | 变化 |
| normal_runtime_candidate_scope.py | 2638 | `bc7d269e6e1aaccba66e0ed8fbf31068b282c538aa92e18ad3af40e3d992524a` | 原字节 |
| normal_runtime_inputs.py | 5383 | `423a20bf2dae9d1f8584002a59e0c30febd29eca008746e783c6b0535403d88c` | 原字节 |
| normal_runtime_launch.py | 6254 | `9b0a4b3b4ab2d0749bc8c3388f6a8cbaba9c3df9938af6443db018fee9d48f3b` | 变化 |
| normal_runtime_process_check.py | 4149 | `2310bbc1c9e21e7b2bf30f5842d0ba3e553b1aaf91ffc7437a5604407e6031cc` | 原字节 |
| normal_runtime_source_anchor.py | 8847 | `48f9736d8bdac9ca030a162492ff1eb742245319f96a66b6b161b684cb6ebcac` | 原字节 |
| normal_runtime_source_loader.py | 8861 | `93a53fedaba61105a07d623ff61e92179cab1cac819ea4ab583058569b4a1ecd` | 原字节 |
| normal_runtime_source_snapshot.py | 10273 | `ee2e6d91a44635f78420cef6881f73126895eb3bf45315647e3573ccbd840fb4` | 原字节 |
| normal_runtime_update.py | 14464 | `29756e44c05e0d1a8ca976d75eae9932375d3f23798ed6c7c3ce99478848dacd` | 原字节 |

- 源文件合计：78,338 bytes。
- `source-inventory.json`：SHA256 `8be0f9f9e5ca75b93a4d6b486270f3ade6d8dbd0ebaafd92d65b83faaf1f896e`。
- `SanQ-C1-Python31215-working-tree-review.tar.gz`：21,586 bytes，SHA256 `61d74e138f00ce166c89e746239c1ca6b91e33a037f776469bf6ae68348c6a7e`。
- 归档仅含9源码、审阅JSON、README及SHA256SUMS，12个普通文件；无解释器、秘密、批准输入或安装程序。
- `sourceCommit=null` 明确表示未提交工作树，不能填入运行时v1输入；最终准确源码head与其CI完成后，需重新固定对应候选材料。不得把baseCommit或旧b7b7提交当新源码身份。
- launch源码/解释器路径及bootstrap变化后，launch原字节、request中的 `launchMaterialsSha256`、两份输入摘要及pins必须重新生成并按原门禁交付；本批未创建或认证真实批准输入。
- PREP-10旧归档/九源清单及Noble现场证据保留原身份，不覆盖或重新标记为3.12.15已验收。

详见 [变更审计及实施续记](../Runtime更新-C1-PREP-11-Python31215变更审计.md)。
