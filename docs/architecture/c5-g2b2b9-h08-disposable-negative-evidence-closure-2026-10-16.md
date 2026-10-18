# C5-G2-B2B9 — H-08 disposable-guest incomplete-observer negative-case evidence closure

> **R0 现行口径（2026-10-17 Toronto）：**D1–D5 已获用户批准并冻结；当前决策、进度、C1–C8 门禁与 R0–R5 队列以 [Runtime 更新 R0 冻结设计](Runtime更新-R0冻结设计.md) 为准。本文其余内容保留发表/取证时的状态：`LOCAL`、待审、未运行及“下一批”均是当时记录，不能覆盖 R0 当前进度；原始 PASS / NOT EXECUTED 与适用边界不变。旧命令不获得重新执行授权。旧 S12/冷掉电要求按 D5 退出首版默认门禁，进程中断及独立重装仍为必验，掉电持久性仍 NOT VERIFIED。`S2 PAUSED` 指日常配置扩充/接线暂缓，不表示现役备份 timer 已停止。**R0 DESIGN FROZEN；C5-G2 NO-GO。**

**Review date:** 2026-10-16 (America/Toronto).  
**Owner:** Runtime / Data / CI / Ops.  
**Repository read-only baseline:** `origin/dev@d3e10ee9` observed after `git fetch` (H-07 PR #2830 merged at `8b59b218`; later unrelated Clover commits #2831/#2832).  
**Delivery scope:** Documentation-only evidence closure, prepared and reviewed off-repository before the user's explicit remote-delivery approval. Submitted on an independent GitHub feature branch targeting `dev` to preserve the unrelated dirty Clover MCP workspace. No Guest source, raw ZIP/JSON, or production source/configuration changes are included.  
**H-08 bounded outcome:** **4/4 BOUNDED NEGATIVE VERIFIED / 4/4 ORIGINAL EVIDENCE BYTE REVIEW PASSED / 4/4 REPORTED CLEANUP + GUEST INDEPENDENT NAMED-OBJECT READBACK PASSED**. This is negative-only synthetic-fixture evidence, **not** a proven complete observer, all-host barrier, permission to install or production readiness. **C5-G2 NO-GO / S2 Daily Backup PAUSED**.

## 1. Scope, governing contract, and provenance

Refer to `docs/architecture/c5-g2b2b9-h2-guest-whole-host-exclusion-readiness-2026-10-13.md`, `docs/architecture/c5-g2b2b9-h-whole-host-exclusion-local-review-2026-10-13.md`, and `docs/architecture/c5-g2b2b9-h07-disposable-negative-evidence-closure-2026-10-16.md`. H-08 challenges the unsafe inference `knownHolderCount == 0 ⇒ observerComplete == true`. H-04 previously proved six simulated per-PID observation failures; H-08 tests explicit omissions in the synthetic candidate/attribution/scan frame with a real fixture holder. No real kernel read failure, all-process enumeration or actor-admission prevention was induced.

The human operator ran Mac VirtualBox and Guest inventory, installed root-pinned sources in the separately identified disposable `SanQ-Linux-Test` VM, ran each Runner and separately launched Terminal B Witness, exported five original JSONs per case, transmitted them to Mac, and ran four SHA/Run-ID-gated fixture cleanups. The assistant did not run Guest/root/VirtualBox commands, directly attest the guest identity, verify snapshot rollback usability or conduct a production operation.

Reported VM UUID `0d46a6e8-abaf-4fa6-bd8d-987756143ee9`, current snapshot `SanQ-2B2B-Verified` UUID `ba2d04f1-67de-4bc9-9f1b-d11b7841b47c`, Guest DMI `e8a6460d-afab-a64f-bd8d-987756143ee9` (SMBIOS byte order), Ubuntu 24.04.5 / Linux 6.8.0-147 / Python 3.12.3 / ext4 root and `/tmp` dev `2050`, `/tmp` mode `1777`, and `systemd` `running`. VM showed NAT-only with a loopback SSH forward, disabled shared clipboard and drag/drop, and no production Runtime directory or named H-08 collisions on the checked paths. This is operator-provided point-in-time inventory, not complete mount/secret/network/snapshot attestation.

**Off-repository source identity:** Runner `g2b2b9_h8_guest_runner.py`, SHA-256 `4081f38b634e63273148b6a8c685695a5a8932b19517e4aceee5705f331494a5` (18,704 bytes); Witness `g2b2b9_h8_guest_witness.py`, SHA-256 `e16de7e05eaaff4dc96149b273fa4146a01813db4e98b890aa0d0d2be21989bf` (11,248 bytes). Independent review recomputed these off-repository source hashes; operator reported identical Guest staging and root-pin hash readback, `root:root`, directory `0700`, source `0600`, regular files, `nlink=1`. Neither source is a production Runtime Archive member and neither is proposed for commit.

## 2. Four-run bounded negative acceptance

| Case / run ID | Runner / Holder PID | Synthetic omitted/incomplete reason | Explicit frame | Result |
| --- | --- | --- | --- | --- |
| Missing Actor / 漏扫持有者 / `h08miss01` | `1329` / `1330` | `INVENTORY_ACTOR_OMITTED` | omitted `[1330]`, knownHolderCount `0` | `UNKNOWN → BLOCKED` |
| Unreadable Observation / 注入不可读 stat / `h08unrd02` | `1661` / `1662` | `PROCESS_STAT_UNREADABLE_INJECTED` | omitted `[1662]`, knownHolderCount `0` | `UNKNOWN → BLOCKED` |
| Unknown Helper / 注入归属未知 / `h08help03` | `1012` / `1013` | `HELPER_PARENT_ATTRIBUTION_UNKNOWN_INJECTED` | omitted `[1013]`, knownHolderCount `0` | `UNKNOWN → BLOCKED` |
| Truncated Inventory / 受限候选预算 / `h08budg04` | `1352` / `1353` | `SCAN_BUDGET_EXHAUSTED_INJECTED` | candidates `[1352,1353]`, observed `[1352]`, omitted `[1353]`, budget `1` | `UNKNOWN → BLOCKED` |

All four raw Runner records show `reportedPass=true`, `failures=[]`, `cleanupFailures=[]`, `post.holderReturnCode=0`, `independentWitnessProvided=false`; reported Terminal A Runner and Terminal B Witness exit codes were **0/0** for each run. Each has `knownHolderCount=0`, `unknownOrOmittedCount=1`, `observerComplete=false`, `classification=UNKNOWN`, `hypotheticalRuntimeHandoff=BLOCKED`, `hostAdapterCalls=0`, `runtimeHandoffAttempted=false`. H08-04 applied budget 1 to exactly two named synthetic candidate PIDs, not to a whole-host inventory.

The four uploaded original JSON sets agree internally on Run ID, case, source digest, parent/holder identity (including PPID, UID, startTicks and cgroup), fixture dev/inode and payload digest. `pre → first observation → Witness → last observation → Runner end` are monotonic in every case. Each held/ready read proof reports **3,584 bytes**, SHA-256 `2f5c4e0cbe7253ec4335972f8f85db53de0ead7bf4335b6aa557d1f8202d3a31` at dev:ino `2050:1048599`; independent Witness reported the same digest and `holderFdVerified=true`, `frameReconciledAgainstLiveHolder=true`, `syntheticIncompleteObservationVerified=true`, `realKernelFailureInduced=false`. These digest/identity matches were independently checked against the uploaded archive bytes; the Witness itself learns the expected fixture targets from Runner-written records and does not authenticate the host hypervisor.

## 3. Uploaded original evidence archives — independent byte review

All four original Mac ZIP uploads were directly opened in a separate review environment; each passed ZIP CRC, included exactly **five original JSON files plus a directory entry**, and had no extra archive members. All **20 JSONs** parsed. Every original JSON SHA matched the operator-provided Guest original/exported hash. Matching hashes establish the **uploaded byte content**, not direct capture of Guest disk provenance. The raw ZIP and JSON contents remain **outside the Git repo**; do not commit or embed them.

| Run ID | ZIP bytes | Uploaded ZIP SHA-256 |
| --- | ---: | --- |
| `h08miss01` | 4,534 | `64026edca1f078e3e5c0a4fb40f5826e0402dbd44fadb6d0ccf0e7d5e180fa02` |
| `h08unrd02` | 4,580 | `9f04aacab813caa7491889b6a4a1013904c2b54c61e1bed8ba5720906cfc94b7` |
| `h08help03` | 4,542 | `3409090ce5d82364637aca48ea72f56e440bf6ef5442a2aad22bf8e12d914c95` |
| `h08budg04` | 4,586 | `8b3a178b901fccddcdd2e02637e9cce2688289e5e6e8c073b99c2429b6391e36` |

**Original JSON byte hashes** (each name is `<run>-<phase>-original.json` under the ZIP subdirectory `<run>-evidence/`):

### h08miss01

```text
0a05fbc8c477f6acdb9060fc294b1e9f6715b6bad26fd19362765486d51e29af  h08miss01-pre-original.json
e3f5f839a1db5a8f2e83677971c0c1ac14125c545cd9c6f5c8ad55a492a58ff7  h08miss01-ready-original.json
6e1c4ee054d5631d220895856fa3591dcfd513fb6c00b5e3ec439f7e57f70e0a  h08miss01-held-original.json
adb36f00cbbe033fa1d52010949856c8da431f1de91810bef21ef6632a021c50  h08miss01-runner-original.json
987371d0a246ed981a1bcf27f2b7120b9f08747e8fd71035fdd77b051a904228  h08miss01-witness-original.json
```

### h08unrd02

```text
214fdbe3c00e2cf2f42c583d674f05095246a2ac96d3beb587548989a44500fb  h08unrd02-pre-original.json
7a9c1e8743ba7ecab66c9f61ae87377ef6c2643cd1732b5614c75fa78ed87589  h08unrd02-ready-original.json
3590c36818c981f6dfd0ed879d5e1644c5b29fc4b3ba834cdcb703f70f6c7df7  h08unrd02-held-original.json
a2373f4e059dc6bae5edbde6f364f9da6fc5bc57821b7be39a7df2c2e129c64f  h08unrd02-runner-original.json
b507a0edb42c2f6fcd456ab77c333f63eb4a15d160fa5e8fe4102b71087fe3af  h08unrd02-witness-original.json
```

### h08help03

```text
30a2d605706db608314cc770ace60a01677538ca5874cbdfdecf6bdaeaa24eac  h08help03-pre-original.json
6ee3cbf0cf0b6f9fd3af01021b6604de6d77026b4011eff2d812557cbd2534f4  h08help03-ready-original.json
951eb1bfe976d22cf0f3a24c572889f3c39624fe7a79151a51d9eee8929c91f6  h08help03-held-original.json
85ba54f4c2033b00118c5b1c76bfb1b563540ac3948bf3a86091cfa7444f6796  h08help03-runner-original.json
4824ba3954c80644758468daa52d0c18a38489ba21a3dd1c92d3cbb9c3eb4fa7  h08help03-witness-original.json
```

### h08budg04

```text
a15eae5b6fac06eda2acb8a39e3677022b1c20891233bc6d36bdafb505d21191  h08budg04-pre-original.json
b4ae13a82d6c95ea908a0d3ce338008d143a7d098b586dd4d74b6d09d5d85ed9  h08budg04-ready-original.json
dd1e5a9ca6183ea162bd9caf1c17d705750c02301feb1b745fcb65d3d97b0180  h08budg04-held-original.json
cfc4d05b9d76688b2beded95b78674b74af8f403d05036285bbe8e2951b6a1dd  h08budg04-runner-original.json
a4e21b31e11248fe8bbb834762c8e3d65e05b3788635fbb7db4f9b173289b282  h08budg04-witness-original.json
```

Each Guest-only `held-complete.marker` was reported as SHA-256 `0521d5fc666b1e05c8f9f62e21c22ab232cb8fbe05c95557c5075354bfdf59a4`. **Marker bytes are not present in the five-JSON ZIPs** and were not independently audited from uploads. The earlier H08-A source-review ZIP is a separate provenance artifact, not a substitute for these four original evidence archives.

## 4. Exact receipt-hash cleanup and independent named-object readback

| Run ID | Original Runner receipt SHA-256 (cleanup gate) | Operator cleanup result | Independent Guest post-check |
| --- | --- | --- | --- |
| `h08miss01` | `adb36f00cbbe033fa1d52010949856c8da431f1de91810bef21ef6632a021c50` | `H08_SELF_REPORTED_LAB_CLEANED`, `H08_CLEANUP_EXIT=0` | `2026-10-16T19:06:05Z`; `H08_LAB_ABSENT`, known PIDs absent, no matching H08 lab unit/unit-file |
| `h08unrd02` | `a2373f4e059dc6bae5edbde6f364f9da6fc5bc57821b7be39a7df2c2e129c64f` | `H08_SELF_REPORTED_LAB_CLEANED`, `H08_CLEANUP_EXIT=0` | `2026-10-16T19:19:53Z`; `H08_LAB_ABSENT`, known PIDs absent, no matching H08 lab unit/unit-file |
| `h08help03` | `85ba54f4c2033b00118c5b1c76bfb1b563540ac3948bf3a86091cfa7444f6796` | `H08_SELF_REPORTED_LAB_CLEANED`, `H08_CLEANUP_EXIT=0` | `2026-10-16T19:38:57Z`; `H08_LAB_ABSENT`, known PIDs absent, no matching H08 lab unit/unit-file |
| `h08budg04` | `cfc4d05b9d76688b2beded95b78674b74af8f403d05036285bbe8e2951b6a1dd` | `H08_SELF_REPORTED_LAB_CLEANED`, `H08_CLEANUP_EXIT=0` | UTC timestamp **not supplied** in latest operator transcript; `H08_LAB_ABSENT`, known PIDs absent, no matching H08 lab unit/unit-file |

Operator supplied separate pre-cleanup checks that the expected Runner receipt SHA matched and the named Runner/holder PIDs were absent. The pinned Runner `--mode cleanup --run-id <exact> --expected-sha256 <pinned-runner-sha> --receipt-sha256 <exact-receipt-sha>` was then run for each case; all four reported clean exit 0 and self-reported cleanup. The operator separately executed Guest read-only checks of exact fixture directory absence, named PID absence (`ps` showing only header), and guarded `systemctl list-units`/`list-unit-files` absence; H08-04 independently rehashed its five retained exported JSONs after cleanup and all matched. Other post-cleanup export rehashes are not claimed unless expressly shown. These checks are evidence of **named fixture cleanup at the observation time**, not an exhaustive historical process or systemd attestation. The off-repository pinned source cleanup is fixed-inventory, SHA-gated and nonrecursive; no arbitrary PID kill or real SanQ unit operations are reported.

## 5. Frozen authority flags and remaining gates

Every raw stage/decision record remains negative-only. Flags `rootLevelWholeHostExclusionVerified`, `mountNamespaceCoverageVerified`, `newConsumerAdmissionPrevented`, `crossProcessQuiescenceVerified`, `readyToInstall`, and `authorizedToMutateProduction` remain **false**. `independentWitnessProvided=false` in Runner is preserved unchanged; separate Witness bytes were checked without forging a Runner-provided independent attestation. `H-08 CLOSED` means only four bounded synthetic observation-incompleteness scenarios were correctly blocked and their specific fixture artifacts cleaned.

**Unchanged deferred gates:** real complete root-owned all-host census and actor exclusion; B2B9-N bind/mount namespace coverage; B2B9-A enforced new-actor admission control across Backup/Deploy/MCP/SSH and arbitrary noncooperators; prior S3–S10/S12 scope not covered by cases; operator-independent Guest/snapshot recoverability; independently decrypted/readback original Recovery Kit (G2-B3); clean reinstall (G2-C); recovery/cold-recovery matrix (G2-D); exact production execution authorization (G2-E). Historical VirtualBox freeze incidents are not S12 acceptance evidence.

**Architecture boundary:** this repository change is documentation-only. It does not modify the inert H-case reviewer, /proc census, maintenance contract, 17-file Runtime Archive allowlist, Backup, Deploy, MCP, Docker, systemd, sudoers, CI, dependencies, schema/migrations or production data. No local lint/build/test was run under the default `AGENTS.md` review workflow; GitHub Actions on the reviewed PR head is the remote validation gate. Production remains **C5-G2 NO-GO / S2 Daily Backup PAUSED**.

## 6. Isolated documentation delivery

At the time H08-C was prepared, the MCP workspace contained unrelated uncommitted Clover changes on `test/clover-c2c7-s5b2-local-customer-fixture`. Those files must not be switched, stashed, reset, overwritten or staged. To preserve that work, this H08-C document was committed through a **separate GitHub feature branch based on `dev`**, not through the dirty MCP working tree. The original off-repository review draft was adjusted only to remove outdated pre-delivery status instructions; its four-case facts, source digests, archive hashes, cleanup evidence and remaining safety gates remain unchanged. No Clover changes or raw evidence archives belong in this PR. Remote merging to `dev` requires a successful GitHub Actions run against this PR head.
