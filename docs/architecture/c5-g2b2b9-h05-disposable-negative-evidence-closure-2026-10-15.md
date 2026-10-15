# C5-G2-B2B9 — H-05 synthetic timer/orphan-helper negative-case closure

**Date:** 2026-10-15 (America/Toronto).  
**Owner:** Runtime / Data / CI / Ops.  
**Scope:** isolated disposable Ubuntu 24.04 / real systemd H-05 experiment; **documentation + one unchanged original receipt only**.  
**Disposition:** **H-05 v3.3 Run 05 — BOUNDED NEGATIVE CASE VERIFIED / CLOSED**, based on operator-supplied Guest receipt, a separate human-operated Terminal B witness transcript and post-run readback. Earlier failed/inconclusive attempts remain failed/inconclusive. **Not** whole-host quiescence clearance, admission prevention, production root-operator acceptance or an installation token. **Production C5-G2 NO-GO / S2 Daily Backup PAUSED.**

## 1. Contract and provenance

Follow the [H2 guest whole-host exclusion readiness](./c5-g2b2b9-h2-guest-whole-host-exclusion-readiness-2026-10-13.md) and the earlier [H-01–H-04 negative-case closure](./c5-g2b2b9-h01-h04-disposable-negative-evidence-closure-2026-10-14.md). H-05 specifically tests the false assumption **“systemd Timer stopped ⇒ all related file consumers have stopped.”** The test is an isolated synthetic **root-owned timer/service + fixture-only orphan helper**, **not** production backup, actual rclone or an installed SanQ Runtime exchange.

The human operator ran the experiment using Mac/VirtualBox and Ubuntu Guest SSH; the assistant did not execute Guest root commands or independently attest the VM. Operator-reported Mac VBoxManage identity: `SanQ-Linux-Test`, UUID/hardware UUID `0d46a6e8-abaf-4fa6-bd8d-987756143ee9`, attached image UUID `9e0ede1f-50a2-4bdc-961a-adbe771a95b0`. Guest hostname `sanq-linux-test`, Linux `6.8.0-147-generic`; original source pinned root:root/0600 under a root:root/0700 directory outside production. Identity and Guest/output provenance rely on operator readbacks, not independently authenticated hardware/snapshot or recovery proof. A separate restore-check clone had previously booted, which does **not** prove original-VM in-place rollback.

**Immutable uploaded source receipt:** [H-05 v3.3 Run 05 original `99-result.json`](./evidence/c5-g2b2b9-h05-v33-run05-99-result.json). This file is the **unaltered user-uploaded 4,945-byte JSON**, SHA-256 `bc8ec90635f96fb7d5126a91b1d3ee0ab7145ca521858a5cb7ba82867bb3281a`, matching the operator-reported Guest `sha256sum`. The hash establishes byte consistency, **not** independent Guest authenticity or a trusted timestamp. The v3.3 standalone source is **off-repository**, Root pin `/root/sanq-g2b2b-h5-pin/v33/g2b2b9_h5_guest_lab.py`, source SHA-256 `0ae08883199dfae54e120d9727f63c1e15ae352ce3c1a8ba1d399d3e1e53d9bf`. It must **not** enter the 17-member production Runtime Archive by implication.

## 2. Earlier H-05 iterations remain recorded as negatives/inconclusive

| Attempt | Observed operator evidence | Disposition |
| --- | --- | --- |
| v2 Run 01 | Helper readiness/cleanup evidence incomplete; missing `ready.json`, blocked receipt; source SHA `efc87b0ae803b975c3b50677b22d890bcc4032c5ce880272718edb0b8fe589c1` | BLOCKED; no H-05 acceptance |
| v3 Run 02 | `systemctl list-unit-files` exit 1 on zero matching units caused preflight stop; no synthetic fixture or result JSON | PREFLIGHT BLOCKED |
| v3.1 Run 03 | Parent/service ran, helper PID 1070 reached ready; transient Timer became auto-unloaded, `systemctl stop` nonzero was treated as fatal. `held=null`, `post=null`, cleanup not verified; receipt SHA `92afd1e8f1d75233cb8d3d6c7b81d10c6e6106b330f9100aa84a08975c0b1b27` | BLOCKED / INCONCLUSIVE / CLEANUP UNVERIFIED |
| v3.2 Run 04 | Helper PID 1107 reached ready, but `UNKNOWN_TIMER_LOAD_STATE` and `UNKNOWN_CLEANUP_UNIT_STATE` occurred when transient Timer was `not-found` without a `MainPID` property. Terminal B: `WITNESS_NOT_OBSERVED`; `held=null`, `post=null`. Original receipt SHA `b1657822700d2811efab37378aa6349b26eae8a6f44ad445dbcabd579b088c3e` | BLOCKED / INCONCLUSIVE / CLEANUP UNVERIFIED |
| **v3.3 Run 05** | Corrected Timer-vs-Service unit-state contracts; Guest receipt PASS, independent Terminal B live witness and final cleanup readback | **BOUNDED NEGATIVE VERIFIED**, only for H-05 |

The operator previously reported intermittent VirtualBox freezes. Run 03 fixture files were seen before a reboot but disappeared afterward; Run 04's six-file fixture was likewise not archived and was later absent after a new Guest boot at `2026-10-15 20:26:10 UTC`. **Do not** retroactively mark Run 03/04 cleanup verified, infer deliberate cleanup, or classify any freeze/reboot as S12. Run 04 original JSON was independently copied to Mac with the above hash, but the six fixture files were **not** preserved before disappearance. Freeze root cause remains UNKNOWN. v3.3 did not erase or overwrite v3.1/v3.2 Root receipt paths.

## 3. Run 05 — Guest receipt and independent Terminal B

**Guest self-report:** `RUN05` started `2026-10-15T20:51:05.104451+00:00`, ended `2026-10-15T20:52:38.491987+00:00`; terminal A printed `RESULT=NEGATIVE_CASE_REPORTED_PASS` and `H05_V33_RUN05_EXIT_CODE=0`. Receipt: `reportedPass=true`, `failures=[]`, `cleanupFailures=[]`, `hostAdapterCalls=0`, `runtimeHandoffAttempted=false`, `hypotheticalRuntimeHandoff=BLOCKED`. Parent PID 1957 / startTicks 149679 and helper PID 1959 / startTicks 149689 were fixture-only.

**Operator Terminal B witness, separately run and reported in chat (not a separate raw uploaded file):** armed at `20:50:45Z`; returned `INDEPENDENT_SYNTHETIC_H05_HELD_OBSERVED` at `2026-10-15T20:51:07.869160+00:00`; concluded `H05_V33_RUN05_INDEPENDENT_WITNESS_COMPLETE`. The witness inspected live `/proc` and `systemctl` independently of terminal A self-report:

| Witness detail | Actual reported observation |
| --- | --- |
| Helper identity | PID `1959`, PPID `1`, UID `0`, startTicks `149689` |
| cgroup | `0::/system.slice/sanq-g2b2b-lab-h5-v33-review05.service` |
| Fixture CWD dev/inode | `2050 / 1048598` |
| Payload dev/inode | `2050 / 1048599` |
| Open payload FD | **FD number `3`** (`fds: [3]`; not three FDs) |
| Timer | `LoadState=not-found`, `ActiveState=inactive`, `SubState=dead`, `NextElapseUSecRealtime=""` |

The receipt's `held.afterWitnessWindow` independently **self-reports** the same PID/startTicks/UID/cgroup and CWD/FD dev/inodes still retained after its 90-second observation window. This provides the narrow observed counterexample: **a synthetic systemd Timer/Service can be inactive or auto-unloaded while a previously spawned orphan remains alive holding fixture cwd and an open file descriptor**. Merely stopping the Timer/Service is therefore **not** a sufficient whole-host consumer exclusion gate.

**Crucial evidence distinction:** `independentWitnessProvided=false` remains **unchanged** in the raw JSON. Terminal A did not ingest Terminal B's witness receipt. Terminal B's operator-supplied transcript is **separate corroborating observation**, not a cryptographically attached or machine-ingested witness token; do not rewrite that flag to true or claim a combined trusted attestation.

**Timer fidelity note:** `timerSettingsRequested.AccuracySec="1us"` while the observed `AccuracyUSec="1min"`. The Timer did trigger the Service and the negative held-state was observed, but the requested scheduling precision was not proven to have applied.

## 4. Post-run cleanup: limited independent readback

Run 05 receipt `cleanupFailures=[]`, `post` reports both synthetic Unit states `not-found/inactive/dead`, Service `MainPID=0`, Timer no next trigger; `cleanupUnitActions` says `already-unloaded`. The operator separately executed `systemctl show` for timer and service, reported the same states, `sudo find /tmp -maxdepth 1 -name 'sanq-g2b2b-lab-h5-*'` returned no paths, and `/proc/1959` was absent. This is **bounded synthetic-case cleanup verification**, not exclusion of every process, mount namespace, deleted inode alias, mmap or future entrant on the host. Guest SHA and metadata readback reported the original receipt as root:root/0600, 4,945 bytes.

## 5. Negative-only barrier gates and next task

The receipt deliberately retains `rootLevelWholeHostExclusionVerified=false`, `crossProcessQuiescenceVerified=false`, `mountNamespaceCoverageVerified=false`, `newConsumerAdmissionPrevented=false`, `readyToInstall=false`, `authorizedToMutateProduction=false`. The isolated H-05 proof **blocks** unjustified promotion; it is **not** a positive implementation or acceptance of whole-host exclusion.

Still deferred: H-06 (renamed/moved inode/namespace aliases), H-07 (new noncooperating actor/admission), H-08 (missing/unreadable/incomplete observation); remaining S3–S10/S12 coverage outside the already bounded cases; real Backup/Deploy/MCP/SSH/root owner cooperation; B2B9-N and B2B9-A design/acceptance; independent Recovery Kit, clean reinstall, recovery matrix and controlled production approval. Work on these gates requires separately reviewed contracts and new authorization. No other case inherits H-05's PASS.

**Change boundary:** this closure only adds this architecture document and the operator-uploaded raw H-05 v3.3 Run 05 JSON. No guest source, runtime code, dependencies, CI, Prisma, migration, Docker, backup scheduler, sudoers, production data, Runtime Archive member, deploy or production action changes. No local lint/build/test under AGENTS.md default workflow. At local review gate, stop for user inspection before pushing a feature PR targeting `dev`; merge only after all required GitHub Actions checks are green.

**Frozen production status: `C5-G2 NO-GO / S2 Daily Backup PAUSED`.**
