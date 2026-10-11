# C5-U2D-2B2-B — Isolated root/ubuntu verification and closeout

**Status: 2B2-B OPERATOR-EVIDENCED ISOLATED ROOT LAB VERIFIED/CLOSED / RETAINED SUMMARY READBACK PASS / 2B2-C COLD RECOVERY PENDING / PRODUCTION NO-GO**  
**Baseline:** PR #2783 merge `956549d3175dee2681f22475e9d3f322885a0ace`; dev push CI `38052072638` 7/7 green. Branch `audit/c5-u2d2b2b-root-isolated-probe-readiness`.

## Scope and source audit

Read `AGENTS.md`, `.github/workflows/ci.yml` (Python unittest under API checks), `docs/architecture/c5-u2d2b2-root-cold-recovery-readiness-audit-2026-10-10.md`, `docs/architecture/c5-u2d2b2a-offline-fd-inventory-2026-10-10.md`, `ops/runtime/offline_root_private_installer.py`, `ops/runtime/offline_fd_inventory.py` and existing offline fixture/tests.

The initial source baseline contained a separate unprivileged Linux FD-anchored **point-in-time** inventory and race-detection test. The later operator-executed root lab full transaction and retained-evidence readback are recorded below; neither establishes cold/power-loss evidence or production permission. The U2D-2A lab guard only admits privately owned `/tmp/sanq-u2d2a-lab-*`, and the existing synthetic archive verifier is intentionally not a real trust anchor.

## Architecture and test host selection

**Recommended:** use a newly provisioned **disposable dedicated Linux VM**, no inbound ports, no SanQ secrets, no production containers/volumes, no production NFS or Cloudflare/GitHub tokens, no bind-mount of `/opt/sanq/runtime`, and a throwaway ext4 virtual disk with independently snapshotted raw image. A precreated nonprivileged `ubuntu` account should have a distinct real uid/gid from root, with controlled, inert synthetic `.env` (no real credentials). The testing copy of the approved source must be pinned by an independently verified hash and installed into root-owned, mode-0700 read-only-to-ubuntu storage **before** any privileged execution. No `sudo python` on ubuntu-writable checkout or MCP workspace.

**Alternative:** a disposable Linux container/user namespace may verify some ownership rules but cannot prove host-systemd isolation, inode persistence across reboot, block-device power-loss recovery, or the absence of higher-level mount-sharing. Treat it as a narrower early smoke test, not the required isolated VM gate.

The existing lab code uses an explicit `/tmp` prefix; do **not** remove the guard or add production paths to accommodate the test. Root-only fixture creation requires a narrowly reviewed, separately authorized operator wrapper, not an internet-fetched or writable-script sudo command.

## Required evidence matrix

| Gate | How to collect from isolated VM | Pass condition / no-go |
| --- | --- | --- |
| Identity | `id -u`, `getent passwd ubuntu`, `stat` of test tree | real root=0 and separate ubuntu uid/gid; no broad ACL grants |
| Source trust | independently record source commit/file sha256 and copied root-owned file sha256 | exact bytes equal, scripts not ubuntu-writable |
| Root-private fixture | dedicated `/tmp/sanq-u2d2a-lab-*` with 0700 root ownership and marker | no symlink, mount escape or unexpected file |
| Dynamic state | inert `.env` ubuntu:ubuntu 0600, state root:root 0600, C4 root:root 0644 | identical byte hashes/uid/gid/modes across candidate, snapshot, retained tree, active tree |
| Trusted source members | exact 17-member manifest and executable-bit modes | no extras, special files, symlinks or hardlinks |
| Cross-parent exchange | `renameat2(RENAME_EXCHANGE)` on throwaway root-owned trees | paired inode and sentinel swap, full post-swap inventory, no live SanQ paths |
| Fsync/journal/retention | preimage fsync; journal staged+renamed+fsynced; exchange+both parents fsynced; retention `RENAME_NOREPLACE` | no previous overwrite, no misleading VERIFIED without manual confirmation |
| Concurrency | another *disposable fixture-only* process holds directory cwd, read fd, flock; test mount crossing with a disposable mount only | blocked or explicitly classified/manual-only; note `flock` only protects cooperating participants |
| Corrupt/dirty fixture | target/source hash drift, owner/mode drift, symlinked intermediate, inode slot exchange, unexpected directory entries | fail closed without app/deploy/DB operations |
| Audit logs | only sanitized status, transaction sha, inode/device, UTC timestamps | never print synthetic `.env` content as groundwork for real secret-bearing data |
| Cold recovery | **NOT within this gate** | separate virtual disk power-loss test and approval required |

## Preconditions before running any isolated root test

1. User approves the exact **disposable VM test environment and narrowly scoped root commands**. The earlier U2D-2A authorization was for local/offline **development**, not production VM root execution, and no dedicated root-test host has been connected in this session.
2. Review root-owned fixture generator and immutable source-verification entrypoint for unsafe path operations; current `_source_tree` still uses `Path.rglob()` and `_build_tree` path-based writes. The new read-only FD helper is **not yet integrated** into active transaction; a green standalone inventory is insufficient evidence that the write path is race-safe.
3. Freeze test host device/FS mount, read-only command outputs, root/ubuntu uid/gid, resource identifiers and rollback/snapshot procedure. Deny production mount, network credentials and any service targets.
4. Run tests only after source pinning and authorization. Tests must be fully disposable; destroyed VM/disk and off-host logs retained.
5. Record failures and unresolved risks in a separate evidence report. Never mark host root semantics, cold restore, or actual production switch as VERIFIED from source review alone.

## Operator-supplied isolated MacBook VM evidence — 2026-10-10

These are **user-executed SSH terminal observations**, not VM commands issued by MCP or by this assistant. The MacBook (Intel/Catalina, VirtualBox) hosts a fresh Ubuntu 24.04.5 LTS x86_64 VM with a baseline snapshot `SanQ-Clean-Baseline`; SSH to the isolated VM is via the Mac's loopback NAT forwarding. Read-only inventory returned `ubuntu uid/gid 1000:1000`, `root 0:0`, `/dev/sda2 ext4 rw,relatime`, Linux `6.8.0-146-generic`, Python `3.12.3`, and a 25 GB guest-only VDI.

A separate root-private test parent at `/tmp/sanq-u2d2b-tbhu1h4i` was created on st_dev **2050**, mode 0700, root uid/gid 0:0; `.env` ubuntu:ubuntu 0600 inode 1048595, `.sanq-release-state.json` root:root 0600 inode 1048596, `.sanq-backup-layout-activated` root:root 0644 inode 1048597. All are on st_dev 2050. This **OWNER/MODE/DEVICE — POINT-IN-TIME PASS**.

With separate operator authorization and no production paths, the operator ran a manually reviewed, standalone `sudo python3` scratch probe (not `offline_root_private_installer.py` nor a full 17-member source-pinned archive) creating disposable `live/runtime` and `stage/candidate` sibling directories under `/tmp/sanq-u2d2b-tbhu1h4i/.sanq-u2d2b-xchg-j0ck_0e9`. Source-less A/B sentinel directory exchange used **`renameat2(RENAME_EXCHANGE)` with separate opened parent directory fds and fsync**. It checked three **synthetic, nonproduction** dynamic file byte contents/UID/GID/mode across exchange and reverse exchange, verified old and new active-path dynamic inode mapping and checked original lab files unchanged. Terminal output:

```text
Atomic exchange: PASS
Dynamic bytes / UID / GID / mode: PASS
Active dynamic inode change: PASS
Reverse exchange: PASS
Original lab files untouched: PASS
RESULT: PASS
Filesystem device: 2050
Retained scratch: /tmp/sanq-u2d2b-tbhu1h4i/.sanq-u2d2b-xchg-j0ck_0e9
```

**Disposition:** `ISOLATED ROOT/UBUNTU POLICY AND EXT4 CROSS-PARENT DIRECTORY EXCHANGE — OPERATOR-EVIDENCED PASS`. The test assets remain in place pending separate safe cleanup approval. This provides evidence that logical dynamic-file preservation permits inode changes under real root and ubuntu IDs. It **does not** verify C5-U2D-2A full source+Archive transaction, externally trusted source provenance, full preimage or previous retention, anti-TOCTOU write-path protections, exclusivity against live consumers, SIGKILL on this guest, or cold/power-loss recovery. Production installation stays **NO-GO**.

## Operator-supplied root integration test results — 2026-10-10

The user independently cloned and detached the fixed commit `956549d3175dee2681f22475e9d3f322885a0ace` into `/home/ubuntu/sanq-u2d2b-source`, checked clean Git status and eight required source files, and checked each installed `/root/sanq-u2d2b-pin-956549d3` source copy against `git show PIN:path | sha256sum`. A directory-mode discrepancy was caught and corrected: root source tree `/root/sanq-u2d2b-pin-956549d3` and all directories `ops`, `ops/runtime`, `ops/runtime/tests`, `ops/release` now report `root:root 0700`, and installer file `root:root 0600`.

The user executed from the private copy (not from ubuntu-writable checkout):

```text
sudo /usr/bin/python3 -I -B -m unittest discover -s /root/sanq-u2d2b-pin-956549d3/ops/runtime/tests -p test_offline_root_private_installer.py -v
Ran 9 tests in 6.076s
OK
```

All nine named `OfflineOperatorTests` passed: synthetic archive failures, corrupt active Manifest denial, 17-source candidate/exchange/preimage/previous transaction, six exception-injection handoff boundaries, concurrent lock/preoccupied slot, lack of production interfaces, improper owner/mode/symlink/hardlink denial, corrupt snapshot/journal classification, and unsafe lab-path denial. Because the existing tests use `TemporaryDirectory`, test fixtures are auto-deleted; retained after-the-fact *independent* FD inventory evidence is still pending. Test archive publication verification is **synthetic**; no genuine GitHub release provenance or production trust claimed.

The operator then installed and executed the separately prepared non-repository root-private proof script `sanq-u2d2b-root-full-transaction-proof.py`, SHA-256 `64ff3ba1ac69e2f20437c9d2bb797440440533a69f1a373212e486705b0b8030` (content and hash independently inspected on the assistant side). The root-only copied executable is `/root/sanq-u2d2b-pin-956549d3/ops/runtime/tests/sanq_u2d2b_root_full_transaction_proof.py`. It creates and retains a fresh `/tmp/sanq-u2d2a-lab-*` fixture, runs the existing fixture `activate()` using the existing lab-only transaction, verifies source contents and separate FD inventories of 21 members each in the active, preimage and previous trees, checks synthetic dynamic bytes/uid/gid/modes/inode distinctness, source executable mode, journal classification, and refusal to rerun an occupied lab.

Operator-submitted terminal output:

```text
EVIDENCE LAB: /tmp/sanq-u2d2a-lab-8x1jy0gd
Verified 17 sources + manifest + 3 dynamics in EACH of 3 trees: PASS
Independent FD inventories and unique cross-tree file inodes: PASS
Journal / retained old tree / source executable mode: PASS
Unfinished transaction re-run rejected: PASS
RESULT: ISOLATED_ROOT_FULL_TRANSACTION_PASS
Evidence path: /tmp/sanq-u2d2a-lab-8x1jy0gd/evidence.json
Retained lab: /tmp/sanq-u2d2a-lab-8x1jy0gd
```

The script's evidence JSON is a **summary** (booleans and counts), not a per-file cryptographic snapshot; the terminal report and executed script are operator-supplied evidence. The script calls `operator._write()` with root-only `0600` and fsyncs the evidence parent directory, and the operator subsequently submitted a separate read-only `stat` plus `cat` evidence readback. This confirms the retained summary and directory metadata exist; it is **not** a separate post-reboot scan of all 63 file entries. The synthetic Archive proof callback is not independent GitHub publication evidence. This tests real root/ubuntu ownership and ext4 directory semantics for the lab kernel, **not** live production, real release publication, exclusion of noncooperating writers, integration of the FD helper into the write kernel, or 2B2-C sudden power-loss recovery. No production paths, services, Docker or databases were accessed by this probe.

## Independent persisted-evidence readback — 2026-10-10

After the full lab transaction completed, the user ran **read-only** `sudo stat` on the lab parent, evidence JSON and three Runtime trees; independently `sudo cat`-read the evidence JSON. Observed (operator-supplied):

```text
/tmp/sanq-u2d2a-lab-8x1jy0gd                    root:root 700 inode=1048615
/tmp/sanq-u2d2a-lab-8x1jy0gd/evidence.json      root:root 600 inode=1048703
/tmp/sanq-u2d2a-lab-8x1jy0gd/live/runtime       root:root 700 inode=1048650
/tmp/sanq-u2d2a-lab-8x1jy0gd/recovery/preimage root:root 700 inode=1048676
/tmp/sanq-u2d2a-lab-8x1jy0gd/retained/previous root:root 700 inode=1048622
```

The `evidence.json` readback includes `status=ISOLATED_ROOT_FULL_TRANSACTION_PASS`, `filesystemDevice=2050`, `sourceCommit=956549d3175dee2681f22475e9d3f322885a0ace`, `sourceMembers=17`, `perTreeVerifiedMembers=21`, `preservedMembers=3`, `verifiedSlots=[active,preimage,previous]`, `journalPhase=PREVIOUS_RETAINED`, `incidentObserved=previous_retained`, `dynamicBytesUidGidModePreserved=true`, `crossTreeInodesDistinct=true`, `oldRuntimeExecutableModeRetained=true`, `automaticRecovery=false`, `productionActivationAuthorized=false`, `syntheticArchiveVerifierOnly=true`, and `powerLossRecoveryVerified=false`.

The retained JSON is a **script-produced summary**; readback independently verifies persistence/ownership/modes of the specific directory paths and JSON existence/content, **not** a reboot/disk-cache flush or new content hash inspection of all 63 entries. Cross-tree inode independence is supported by the three distinct observed directory inodes and the script's per-member checks, but the 63 individual inode values were not themselves recopied in this readback.

**Disposition:** `2B2-B ISOLATED ROOT LAB VERIFIED / CLOSED` within the **synthetic-source, lab-only** gate. Root ownership, the full lab fixture, cross-parent exchange, metadata consistency, journal/retention and persisted summary are evidenced on genuine Ubuntu/ext4 as requested. Retain the VM snapshot, root-private source and lab evidence; do not delete/restore/overwrite without a separate evidence archival decision. Production installation remains `NO-GO`.

## Next implementation choice

After 2B2-B isolated-lab closure, next separate choice is **2B2-C power-loss/cold restart testing** on a disposable VM snapshot or, independently, **FD-anchored write-kernel hardening** and trustworthy published-Archive provenance plus maintenance quiescence. The existing read-only FD inventory is not integrated into all active writes. Either path requires its own scoped review and authorization; 2B2-B does not authorize a production root entrypoint, service stoppage, backup shutdown, real Runtime modification, or power-off fault injection. No such code change was made here.

**Exit: `2B2-B ISOLATED ROOT LAB VERIFIED/CLOSED / RETAINED SUMMARY READBACK PASS / 2B2-C COLD RESTART NOT VERIFIED / PRODUCTION INSTALL NO-GO`.** No repository source, runtime allowlist, CI workflow, schema, service, installer permissions, or production environment changed. The document was locally reviewed and submitted to the dev PR/CI gate after explicit user authorization; this evidence report itself grants no production permission.
