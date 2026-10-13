# C5-G2-B2B9 H-3A — H-01/S3 execution evidence and RERUN-02 receipt

**Date:** 2026-10-13 (America/Toronto).  
**Scope:** Disposable `SanQ-Linux-Test` VirtualBox guest; synthetic systemd unit only.  
**Source review contract:** [H-3A fixed-source/root-command review](./c5-g2b2b9-h3a-s3-source-root-command-review-2026-10-13.md).  
**Disposition:** **H-01/S3 NEGATIVE CASE OPERATOR-REPORTED VERIFIED / INDEPENDENT GUEST CLEANUP OPERATOR-REPORTED VERIFIED / RERUN-02 ORIGINAL JSON ARCHIVED. NO POSITIVE BARRIER AUTHORITY.**

This records the human operator's terminal transcripts and exact uploaded original 1,123-byte RERUN-02 JSON. The assistant did **not** operate the Mac/VirtualBox guest or independently attest guest identity, guest kernel, full experiment environment, timestamps or snapshot recovery. The source remains standalone, off-repository and outside the 17-member Runtime Archive; the committed JSON is evidence, not executable authority.

## 1. Source pin and strictly limited experiment

- Standalone source: `g2b2b9_h3_s3_guest_lab.py`; operator checked SHA-256 `881b0577fc9e3d96c0f86de7ce3b43addc5668875b4c2ff55bb568916848e63e` both before and after root-private fixation.
- Reported guest source path: `/root/sanq-g2b2b-h3-pin/v1/g2b2b9_h3_s3_guest_lab.py`; observed root-owned regular file mode `0600`, link count 1, with root-owned `0700` ancestors.
- The root/systemd experiment was separately and explicitly authorized only on the isolated `SanQ-Linux-Test` guest. The synthetic `Type=oneshot` unit deliberately used `KillMode=process` so that the parent could become inactive while a child retained `cwd` and an open FD.
- The experiment is **negative-only**. The intended observation is to **BLOCK** a hypothetical Runtime handoff when such a holder survives, not to claim any successful system-wide quiescence, runtime swap or production rollout.

## 2. Earlier H-01 attempt (separate and non-substitutable)

The original attempt reported `RESULT=OPERATOR-REVIEW-PASS`, exit code 0, unit `sanq-g2b2b-lab-h3-fb41d44834.service` and surviving holder PID `1658`; the root-private `99-result.json` then had operator-reported SHA-256 `9c53c612d422a089d854b0d71f41d4156dd1e782fea5e05519dc5f206f36de62`.

On that first run, separate guest checks showed `ORIGINAL CHILD: GONE` and unit `not-found/inactive/dead`. Subsequently the VirtualBox guest froze, was powered off, and the original volatile `/tmp` JSON was absent after reboot. That missing artifact is **not** reconstructed from terminal text. The unexplained freeze is **not S12** crash/recovery acceptance, and root cause remains unknown.

## 3. RERUN-02 source-to-archive provenance

The operator explicitly requested a new H-01/S3 run with the same fixed SHA-256 source. The guest reported `RESULT=OPERATOR-REVIEW-PASS`, `EXIT_CODE=0` and:

| Field | Operator / artifact observation |
| --- | --- |
| Fixture directory | `/tmp/sanq-g2b2b-lab-h3-fanuioiq` |
| Original receipt | `/tmp/sanq-g2b2b-lab-h3-fanuioiq/99-result.json` |
| Persistent guest copy | `/home/ubuntu/h01-s3-rerun-02-99-result.json` |
| Original and copied guest SHA-256 | `417a3766f3c13ac01aada6897bce305288ec208cacf90ec17066d9b683a06650` |
| Uploaded original file | 1,123 bytes; same SHA-256; exact bytes archived below |

**Unmodified original receipt:** [RERUN-02 `99-result.json`](./evidence/c5-g2b2b9-h3a-h01-s3-rerun02-99-result.json). This chain of matching hashes establishes reported byte continuity, not independent proof of physical guest identity or a trusted runtime installation gate. Do not reformat or regenerate the JSON.

### RERUN-02 contained observations

- `case=H-01/S3`, `reportedPass=true`, `failures=[]`.
- Parent unit `sanq-g2b2b-lab-h3-c49fb21a7f.service` at the held-child moment: `LoadState=loaded`, `ActiveState=inactive`, `SubState=dead`.
- Child PID `974`, owner UID `0`, kernel `startTicks=18565`, cgroup `0::/system.slice/sanq-g2b2b-lab-h3-c49fb21a7f.service`.
- `cwdHeld=true`, `fdHeld=true`, `hypotheticalRuntimeHandoff=BLOCKED`, reason `inactive oneshot has surviving cwd/fd holder`.
- The script's own `postCleanupUnitState` reports `not-found/inactive/dead`. That self-report alone would **not** be an independent cleanup check.

## 4. Correct-guest independent cleanup confirmation

An earlier terminal command mistakenly executed on **production `ubuntu@sanq-web`** had returned an empty `ps` result and `not-found/inactive/dead` for the test unit. **It is excluded from S3 guest cleanup evidence.** Those commands were read-only and did not change production state.

After this host mismatch was identified, the operator supplied a **new terminal transcript explicitly from `ubuntu@sanq-linux-test:~$`** for RERUN-02:

```text
ps -p 974 -o pid,ppid,uid,stat,etimes,args
    PID    PPID   UID STAT ELAPSED COMMAND

systemctl show sanq-g2b2b-lab-h3-c49fb21a7f.service \
  --property=LoadState --property=ActiveState --property=SubState --no-pager
LoadState=not-found
ActiveState=inactive
SubState=dead
```

The original child PID was no longer present at observation time, so no further PID `startTicks` comparison was needed. The exact synthetic unit was independently reported absent/inactive. This establishes **bounded, operator-reported independent cleanup for this rerun**. It is not independent cryptographic guest identity attestation, whole-host scan, persistent filesystem scan, or admission exclusion. No residual cleanup commands or second experiment were required.

**RERUN-02 case-level disposition:** `NEGATIVE CASE VERIFIED / CLEANUP VERIFIED / RAW EVIDENCE ARCHIVED` **at operator-reported, synthetic guest case scope only**.

## 5. Permanent negative gates, deferred cases, next stage

The original RERUN-02 JSON explicitly retains all of these as `false`:

- `authorizedToMutateProduction`
- `readyToInstall`
- `crossProcessQuiescenceVerified`
- `rootLevelWholeHostExclusionVerified`
- `mountNamespaceCoverageVerified`
- `newConsumerAdmissionPrevented`

Therefore **C5-G2 production stays NO-GO** and **S2 Daily Backup stays PAUSED**. H-01/S3 does **not** provide root-level whole-host exclusion, namespace/inode alias coverage, a new-consumer admission barrier, Recovery Kit authority, or S12 power-loss recovery acceptance.

**Next:** H-02/S4 **read-only readiness/design** for an independent `flock` contender, with separate source review and explicit scoped guest authorization **before** any new root/systemd execution. H-03/S5 and H-04/S8 also require separately reviewed contracts; H-05..H-08 and the admission/namespace gaps remain deferred. The recurrent VirtualBox freeze is unresolved and should not be labeled a successful S12 test.

**Change boundary:** This commit adds only documentation and the exact original JSON receipt. It does not modify production or guest processes, root privileges, sudoers, backup, systemd, Runtime installer, Prisma/migrations, Docker, payments, CI, dependencies or the 17-member Runtime Archive. No direct push to `dev`/`main`; this document follows the required feature PR and CI-green merge gate.
