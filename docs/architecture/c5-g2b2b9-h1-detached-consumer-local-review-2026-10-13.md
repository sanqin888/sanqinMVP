# C5-G2-B2B9-H1 — Orphan-holder kernel evidence (local source review)

> **R0 现行口径（2026-10-17 Toronto）：**D1–D5 已获用户批准并冻结；当前决策、进度、C1–C8 门禁与 R0–R5 队列以 [Runtime 更新 R0 冻结设计](Runtime更新-R0冻结设计.md) 为准。本文其余内容保留发表/取证时的状态：`LOCAL`、待审、未运行及“下一批”均是当时记录，不能覆盖 R0 当前进度；原始 PASS / NOT EXECUTED 与适用边界不变。旧命令不获得重新执行授权。旧 S12/冷掉电要求按 D5 退出首版默认门禁，进程中断及独立重装仍为必验，掉电持久性仍 NOT VERIFIED。`S2 PAUSED` 指日常配置扩充/接线暂缓，不表示现役备份 timer 已停止。**R0 DESIGN FROZEN；C5-G2 NO-GO。**

**Date:** 2026-10-13 (America/Toronto)  
**Baseline:** `origin/dev@6b08c64e6935877c73b5bb73ec475dd9a6fd1b97`, H-0 PR #2807 merged with CI #7207 (7/7 green).  
**Status:** H1 SOURCE/TARGETED UNIT-TEST REVIEW ONLY; LOCAL TESTS NOT RUN; NO GUEST ROOT/SYSTEMD EXECUTION; C5-G2 PRODUCTION NO-GO; S2 PAUSED.

## 1. Why this slice exists

H-0's `isolated_whole_host_exclusion_review.py` strictly reviews **caller-supplied**
negative evidence for H-01 through H-08. It does not produce independent
process evidence. B2B4 observes one owned PID's live `cwd/fd` and B2B3
exercises a competing kernel flock; neither by itself demonstrates the
failure mode in which a **parent process exits but a detached child still
holds a Runtime-like directory/file**.

H1 adds a narrow **unprivileged** Linux characterization only. It does not
make the H-0 claim reviewer authoritative, change the B2A path-only sensor,
or create a production maintenance operator.

## 2. Implemented source (pending independent CI)

`ops/runtime/tests/test_h1_detached_consumer.py` reuses the existing
`/tmp/sanq-g2b2b-lab-*` private synthetic fixture and the B2B4
`observe_isolated_pid()` probe. A short-lived **same-UID parent** starts
a detached child and exits. The child retains the lab `cwd` and an
open `probe.txt` FD until the test releases it through a fixture marker.

| Test | Expected evidence | What it does NOT show |
| --- | --- | --- |
| Parent exit / live child | After parent exits, B2B4 still detects child `cwd` and `fd` references; receipt remains all authority flags false | Real systemd oneshot stopping, root/other UID or full host coverage |
| Free flock / residual child | The lab lock may be acquired while the uncooperative child remains a detected holder | A real maintenance barrier or enforced admission control |
| No privilege/production surface | 17-member allowlist unchanged; only existing lab fixture/Python child commands | Guest identity and command provenance or production install authorization |

The test suite registers cleanup using the child's PID and Linux process
start ticks; it first requests voluntary exit and only attempts a bounded
same-PID termination after validating its observed birth identity. It does
not enumerate arbitrary user processes, alter production services, use
systemctl, sudo, Docker or mounts, or run against `/opt/sanq/runtime`.
No production paths are provided to the existing B2B4 probe.

## 3. Remaining H guest acceptance gate

H1 is **partial H-01 characterization**, not an S3 PASS. H-01 still needs
independently approved disposable-guest synthetic **oneshot systemd**
evidence, including a surviving helper, parent/cgroup and start-tick
identity, actual controlled stop, and exact original unit/timer restoration.

Separately, the guest must test H-02 cross-process flock; H-03 foreign-UID
noncooperator with lock free; H-04 PID reuse and unreadable proc entries;
H-05 helper/rclone analog after timer stop; H-06 renamed prior-tree
identity; H-07 uncontrolled entry; H-08 partial census failures. Unknown
or unverified observations must BLOCK. H-06 identity nuances also belong
to B2B9-N and H-07 actual prevention belongs to B2B9-A; this slice
grants neither namespace coverage nor admission prevention.

**No privileged guest execution is authorized here.** Next approval
requires independently rechecked VM/snapshot/isolated ext4 evidence,
separately pinned exact guest source and root-owned path, reviewed exact
commands, scoped synthetic units/processes only, and dated negative-only
pre/held/post + independent cleanup receipts. The earlier B2B8 RERUN-01
JSON is historical support for S1/S2/S11 only, not this guest acceptance.

## 4. Architecture / validation / delivery

No new runtime API, production sensor, installed helper, sudoers entry,
backup/Deploy/MCP ownership or systemd wiring. No dependency, Prisma,
migration, lockfile, `AGENTS.md`, CI workflow, source allowlist or
production configuration change. Existing `.github/workflows/ci.yml`
`api-checks` includes Python `unittest discover -s ops/runtime/tests`
so the new file is picked up automatically **after user review and PR approval**.

Per `AGENTS.md`, no local lint/build/test is run in this workspace stage.
Remote PR delivery and real guest root/systemd experiments require separate
user approval. All resulting test observations are negative-only and can
never change `readyToInstall=false` or
`authorizedToMutateProduction=false`. C5-G2 remains NO-GO and daily
S2 backup remains PAUSED.
