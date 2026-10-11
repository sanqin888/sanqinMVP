# C5-U2D-2B2-C — VirtualBox cold/power-loss experiment, C2-C1 preparation

**Status: REVIEW-ONLY LOCAL IMPLEMENTATION / NOT EXECUTED / FORCED POWER-OFF NOT AUTHORIZED / PRODUCTION NO-GO.**

This plan continues the 2B2-B root-isolated work and the C1 archived evidence gate. It does **not** approve execution of a root worker, stopping a guest or altering production. User review is required before any remote PR; further explicit per-experiment authorization is required before host-side power loss.

## Source and architecture boundary

Reviewed `AGENTS.md`, `.github/workflows/ci.yml`, the 2B2 readiness audit, 2B2-B closeout, `ops/runtime/offline_root_private_installer.py`, the existing root lab tests and `test_offline_operator_sigkill.py`. The Python test suites run under the API checks in CI, and the default workspace implementation phase stops at diff/status review without local tests.

The proposed helper is `ops/runtime/tests/c2_cold_powerloss_probe.py` (**outside the 17-member production Runtime allowlist**). It imports existing fixture/transaction helpers only after strict host and root-private source checks. It must **never** be included in a production Runtime bundle, deployed as a service, run through MCP root tools or copied to a production VM. The original operator kernel and its strict direct `/tmp/sanq-u2d2a-lab-*` guard remain untouched; so do Compose, schema, CI workflow, app routes and all production services. The Archive verifier remains deliberately synthetic, so no release-provenance or production activation evidence is claimed.

No change to module ownership or production Runtime architecture is proposed. The offline probe merely pauses the disposable VM's existing lab transaction.

## Operator-supplied baseline evidence (not independently remote-executed)

- Original `SanQ-Linux-Test` powered off; snapshots `SanQ-Clean-Baseline` and `SanQ-2B2B-Verified` retained.
- New full clone `SanQ-Cold-Recovery-Test`, NAT SSH through Mac `127.0.0.1:2223`, guest hostname `sanq-cold-recovery-test`, root on guest `/dev/sda2` ext4.
- Clone medium UUID `e163a4fc-f4f4-47fd-8263-8a0c1723ac12`, independent VDI at `/Users/apple/VirtualBox VMs/SanQ-Cold-Recovery-Test/SanQ-Cold-Recovery-Test.vdi`, `Parent UUID: base`. Different disk and VM UUID from source.
- Evidence archive `SanQ-2B2B-lab-evidence-20261010.tar.gz` independently SHA-256 matched on Mac and guest: `78023e504b1fcd423303d808306f2bd21307c5040a41e8eb6f39852c0de10986`. All six critical archive members present, including three Runtime trees and prior lab.
- Clone has immutable-in-purpose (not filesystem-immutable) root-only copy `/var/lib/sanq-c5-u2d2c/verified-baseline.tar.gz`, directory 0700, archive 0600; `sync -f` called and SHA matched. Mac copy stays off-guest.
- `SanQ-C2-PreFault-Baseline` snapshot taken with clone cleanly stopped; screenshot observed both VMs powered off.
- **Important observation:** both earlier root-private lab directories under `/tmp` were absent after a normal clone boot. `/tmp` is on ext4, and systemd tmpfiles timer is active, but the specific deletion cause was not demonstrated. The pre-fault experiment therefore MUST inspect a host-made disk copy **before booting** the faulted guest. A normal cold boot first can erase the very artifact under investigation.

Baseline facts do not establish actual power-failure durability.

## Helper: two distinct stages (NEITHER has been run as part of this implementation)

`prepare --checkpoint NAME` makes a fresh root-private synthetic fixture under a new direct `/tmp/sanq-u2d2a-lab-*` directory using the existing 17-source fixture, inert dynamic `.env`, manifest and archive; it fsyncs initial proof/fixture entries, the lab root, and its `/tmp` parent so the initial state is durable. No cleanup is performed; preserve all created paths until a separate disposal authorization. It writes a root-only `proof/.c2-fault-probe.json` containing the *selected* checkpoint, without secrets. The original `.sanq-u2d2a-lab-only` marker remains mandatory.

`hold --lab /tmp/sanq-u2d2a-lab-<fresh-id> --ack-disposable-root-probe REVIEWED_C2_FAULT_WINDOW` refuses an already-used lab and requires an explicit operator acknowledgement argument (not a substitute for user authorization). It uses existing transaction code, pausing at the selected checkpoint with `SIGSTOP` **after printing a `FAULT_READY` line to the external SSH terminal**. It does not write a ready file or fsync the guest after the barrier, because doing so would contaminate a pre-fsync durability test. Continuing the stopped process (SIGCONT) is forbidden and fails closed rather than completing the transaction. No automatic recovery or host poweroff behavior is included.

Mandatory guards (implemented in the helper): Linux root, exact cloned guest hostname, Python `-I -B`, root-owned 0700 pinned-source ancestors, root-owned 0600 helper, root-only baseline archive with frozen SHA-256, same-device `/tmp` and baseline parent, original guarded lab and fresh preparation marker. All imports of local code occur after these checks. The helper must be independently reviewed and SHA-256 pinned in its root-owned installation location before any privileged invocation. The existing pinned source location is `/root/sanq-u2d2b-pin-956549d3`; original kernel SHA and other source-file digests must also be rechecked against the approved commit `956549d3175dee2681f22475e9d3f322885a0ace`.

Do not execute the helper from `/home/ubuntu`, an untrusted checkout, or a guest directory writable by the `ubuntu` user. `python3 -I -B` does not itself authenticate source code; the root-owned directory and independently reviewed hashes provide that property.

### Checkpoint semantics

| Name | Exact interception | Meaning |
| --- | --- | --- |
| `pending_journal_before_parent_fsync` | `_sync_dir(lab)` after `PENDING_EXCHANGE` journal rename, before parent fsync | Journal may be absent or present on recovered disk. No durability guarantee. |
| `after_journal` | existing `_stop` after `PENDING_EXCHANGE` journal fsync | Old active, new candidate, old preimage expected if committed. |
| `after_exchange_before_parent_fsync` | wrap real `renameat2(RENAME_EXCHANGE)`, then pause before either parent directory fsync | Atomic in-memory namespace exchange, post-crash persistence NOT guaranteed. |
| `after_exchange` | existing `_stop`, after both exchange-parent fsyncs | New active, old staged candidate expected. |
| `after_exchange_journal` | existing `_stop` after `EXCHANGED_UNCONFIRMED` journal fsync | New active, old candidate, updated journal expected. |
| `after_retained` | existing `_stop` after previous no-clobber rename and both parent fsyncs | New active and retained old version, journal may remain `EXCHANGED_UNCONFIRMED`. |
| `after_final_journal` | existing `_stop` after final `PREVIOUS_RETAINED` journal fsync | Fully recorded lab transaction, still manual-only. |

**Minimum reviewed matrix:** start with `after_journal` as a positive durable control, then `after_exchange_before_parent_fsync` as the unresolved critical window, then `after_retained` as the retained-old durability window. One **fresh lab and faulted-disk capture per case**. Do not infer the exact surviving namespace after a pre-fsync power cut: distinguish "unexpected-but-valid older state", missing/ambiguous state, and corruption; a journal state that claims more than disk is never automatically accepted.

## C2-C2 execution protocol — NOT AUTHORIZED YET

The following is a design, **not a command sequence to execute now**.

1. Verify the new helper diff and its hash, VM name/UUID, clone disk chain, baseline snapshot and snapshot scope. Ensure Mac evidence remains independent; deny all production credentials, services, Docker and production mounts. Use the exact pinned root-private source copy, no repo source imported from user-writeable paths. Confirm enough host free space for all forensic copies.
2. With the cloned guest cleanly running, install the reviewed probe only into the verified root-private `ops/runtime/tests` directory, root:root 0600, with an external trusted hash match. Check all fixture-specific source pins. Obtain **separate authorization for root `prepare` and `hold` execution** before starting a fault case.
3. Call `prepare` once to create a fresh synthetic lab for the selected checkpoint; independently note its exact lab name, inode and source/dynamic hashes (never print actual `.env` bytes). Establish fixture preimage hashes and user-operated Mac evidence record.
4. Launch `hold` on a dedicated SSH terminal with no destructive action. Confirm literal `FAULT_READY` and requested checkpoint. If the worker exits early, stalls before READY, reports BLOCKED, or the SSH link fails, **STOP**; do not power off.
5. Only after **fresh explicit user authorization to hard-stop this named disposable clone at this checkpoint**, VirtualBox host forcibly powers off **only `SanQ-Cold-Recovery-Test`**. Do not send `shutdown`, `sync`, SIGCONT, or manually restart the guest at this boundary. This is a sudden *virtual guest* power loss, not proof of physical host/power-controller behavior.
6. While guest remains OFF, identify the clone's **current attached differencing VDI** (the snapshot created a child disk); do not copy only the earlier `e163a4fc-...` base disk. Clone/merge the full powered-off disk chain to a separately identified forensic VDI using host tooling without booting the faulted guest. Record chain UUID, target path, SHA of captured file and creation time. No reuse/overwrite.
7. Attach **the forensic copy only** as a secondary disk to a clean, disconnected disposable Ubuntu forensic VM; never boot it as a system disk. Prevent automatic mounting and journal replay. Use a read-only block device and explicit ext4 `ro,noload,nodev,nosuid,noexec` mount for `/dev/sdX2` (verify the actual disk id before mount). The mount itself and all diagnostic commands must not alter evidence. If external forensic copy cannot be proven read-only, **STOP**.
8. Inspect the captured `/tmp/sanq-u2d2a-lab-<id>` directory without first restoring it into the live system. Record the exact old/new source manifests and hashes, exact 17-source+manifest+3-dynamic contents per present tree, UID/GID/modes/inodes, journal phase/transaction id, snapshot and retained slots, expected synthetic `.env` SHA and file identity (not plaintext), and independent count/device measurements. Use read-only commands from trusted forensic OS. The existing `inspect_offline_operator_incident` and `inspect_lab_inventory` are strictly bound to a direct `/tmp` path; **do not weaken their guards or invoke them against the mounted VDI path**. The independent forensic inspection adapter/procedure needs its own separate review before evidence can be marked VERIFIED.
9. Keep the original captured disk and summary sealed; only then separately create a test copy for normal cold-boot observation, noting that tmpfiles cleanup or ext4 journal replay may alter the observation. A boot result must not replace the pre-boot forensic result.
10. After evidence classification, restore the **experimental clone only** to `SanQ-C2-PreFault-Baseline` for the next distinct scenario; verify original VM snapshots and Mac archive intact. Snapshot restoration or experimental disk disposal requires a separate operator approval. Do not claim automatic rollback or production safety.

### Acceptance and stop gates

- For each checkpoint: intact pre-fault root-owned baseline and hashes; `FAULT_READY` external evidence; host poweroff only after named authorization; independent powered-off disk clone; read-only, no-journal-replay mount; verified relevant trees and manifest/dynamic hashes; journal/actual-tree classification without speculative replay; no unexpected symlinks, aliases, insecure file mode or cross-tree inode sharing; no leak of synthetic `.env`.
- For pre-fsync windows: a crash may legitimately lose recent metadata updates. Record exactly what survived rather than declaring a specific state guaranteed. If state is internally inconsistent, ambiguous, or missing, **manual recovery required** and mark FAIL/BLOCKED pending deeper analysis.
- If the guest boots before disk capture, or the forensic VDI receives writes, mark that case **INVALID EVIDENCE** and repeat only after new authorization.
- Production remains `NO-GO` regardless of clean cold-recovery evidence: separate FD-safe write-kernel, trust/provenance, quiescence and live-service integration gates remain open.

## Implementation review report / future CI

Expected local changes: **one new offline-only Python helper and this document**. No changes to `offline_root_private_installer.py`, 17-source bundle, CI, schemas, Compose, production VM or production `.env`. Under `AGENTS.md`, inspect diff/status and stop; do not run local lint, unittest or install actions before user review. A separate approved PR to `dev` must pass CI before merge. Current code must not be treated as an approved root executable merely because it was written to the workspace.

**Exit: C2-C1 PROPOSAL PREPARED / SCRIPT NOT RUN / VIRTUAL POWER-LOSS NOT VERIFIED / PRODUCTION NO-GO.**
