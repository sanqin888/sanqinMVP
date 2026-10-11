# C5-U2B — Offline Runtime Handoff Transaction / Fault Injection

**Status: LOCAL OFFLINE HARNESS FOR SOURCE REVIEW / NO CI RUN / NO PRODUCTION INSTALL AUTHORITY.**

## Baseline and exact scope

C5-U1 PR #2775 and C5-U2A PR #2776 are merged into `dev` with green CI. The installed production Runtime remains the root-owned real directory `/opt/sanq/runtime`, with application SHA `ff5be8d5…`. It does not yet contain the startup readiness fix. This work does not promote `dev` to `main`, update production, or amend `build_bundle.SOURCE_FILES`.

The existing `ops/runtime/plan_versioned_install.py` stays inert. `ops/runtime/prepare_runtime_update.py` remains independently authenticated **preparation only**. New `ops/runtime/offline_runtime_handoff.py` is a **standalone disposable Linux filesystem harness**, NOT the trusted installer. It does not consume a production prepared archive, assert external provenance, acquire a production-wide lock, or issue operational commands.

## Offline fixture and mutation boundary

Privileged execution (root) is expressly rejected. Only directories whose immediate parent resolves to `/tmp`, whose name begins with `sanq-u2b-offline-`, owned by the invoking nonprivileged test user with mode 0700, and which contain a private exact offline-only marker are accepted. Explicit active production paths, nonmatching directories and symlinks fail closed. No CLI, elevated execution, service restart, Docker, Git, backup, migration or Runtime installation path exists. **Do not copy, sudo-run or reinterpret the harness as a production updater.**

Synthetic `runtime` and `candidate` directories contain exact 17-file manifests and the three preserved dynamic files (`.env`, `.sanq-release-state.json`, C4 marker). The harness verifies SHA256/size of every manifest member, the manifest's fixed shape, ownership/private directory properties, matching dynamic bytes/mode/owner and distinct source SHAs. Unlike real Runtime proofs, the fixture manifests are self-declared test data; this is not archive/GitHub authentication.

## Transaction and durable checkpoints

The disposable transaction acquires an advisory `flock` (insufficient for real host-wide quiescence), writes a `pending` JSON journal via fsynced scratch + atomic replace + parent fsync, and executes one Linux `renameat2(RENAME_EXCHANGE)` between the `runtime` and `candidate` directory entries using a validated parent directory descriptor. Both names stay populated at the syscall's atomic visibility boundary; this is **not** two renames. It then fsyncs the parent, validates the swapped Runtime inventories, writes an `exchanged` journal, renames the now-old `candidate` to `previous`, fsyncs, and records `awaiting_manual_verification`.

The operation intentionally **does not** mark the installed release ACTIVE, update application SHA, rewrite production state, or automatically restore old files. It always returns `readyToInstall=false` / `automaticRecovery=false`. Once a journal exists, a second invocation is rejected; a separate read-only inspector reports whether observed directories are before exchange, after exchange or after retention, without resuming anything.

The offline test module `ops/runtime/tests/test_offline_runtime_handoff.py` runs under existing Python unittest CI on Linux. Fault injection explicitly raises after pending journal fsync, after atomic exchange + directory fsync, after exchange journal fsync, after retaining the previous directory + fsync, and after final journal fsync; a pre-journal fault is also covered. Every post-journal scenario must preserve both full Runtime versions and leave a manual recovery case. Other checks cover dynamic-file drift, corrupted manifests, symlinks, lock contention, replay rejection, unsafe paths and forged journal authority.

## Important unproven production gates

These are **in-process injected interruptions**, not actual SIGKILL, kernel crash, VM crash or power-failure durability evidence. Even a verified `RENAME_EXCHANGE` test on Linux /tmp does not prove support for the production mount/filesystem, open process descriptors, Docker bind mounts or backup/systemd consumers.

Production handoff remains **BLOCKED** until a separately reviewed U2C host-consumer/quiescence audit, real archive provenance verification, immutable previous-version snapshot, root-only trusted operator installer delivery, dynamic-file owner/mode/inode preservation strategy, durable recovery journal design, exact filesystem capability verification and controlled recovery exercise exist. Crucially, a single directory exchange changes inodes for the active Runtime's dynamic files; the offline fixture merely proves bytes/modes/owner match, **not preservation of the live files' inode identity**. A production design must explicitly resolve that without writing to a live backup/config while another process is active. The active tree and the prior tree may both contain .env and release-state; which one is operational at any time must be fixed by the reviewed transaction.

Do not alter `ops/runtime/build_bundle.py:SOURCE_FILES` just to ship this test harness, do not weaken existing trusted-manifest gates, and do not delete `/home/ubuntu/sanq-app` or clean production backups. If a future production installer is needed, explain changed architectural responsibility and obtain separate explicit authorization before modifying the trusted installed Runtime contract.

## Review workflow

Review source/test/doc diff and workspace status; **no local test/build/lint run** under `AGENTS.md` default phase. Push PR to `dev` and use GitHub Actions only after user review authorization. No production mutation is authorized by this work.
