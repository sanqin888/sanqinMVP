# C5-G2-B2B9 — H-07 disposable-guest uncontrolled-new-consumer negative-case evidence closure

**Date:** 2026-10-16 (America/Toronto).  
**Owner:** Runtime / Data / CI / Ops.  
**Baseline:** latest `origin/dev@77c7efb5` when this standalone documentation branch was created.  
**Disposition:** **H-07 RUN 01 BOUNDED NEGATIVE VERIFIED / ORIGINAL EVIDENCE BYTE REVIEW PASSED / GUEST CLEANUP VERIFIED**. A noncooperating *synthetic* consumer could open and read a fixture while an operator retained an exclusive advisory `flock`; hypothetical Runtime handoff stayed **BLOCKED**. This establishes a *missing* admission barrier, **not** new-actor prevention, host-wide exclusion, permission to install, or production readiness. **Production C5-G2 NO-GO / S2 Daily Backup PAUSED.**

## 1. Boundary, reviewed source, and operator-reported environment

Follow [H2 guest whole-host exclusion readiness](./c5-g2b2b9-h2-guest-whole-host-exclusion-readiness-2026-10-13.md), [H-0 negative-only review contract](./c5-g2b2b9-h-whole-host-exclusion-local-review-2026-10-13.md), and [H-06 negative-case closure](./c5-g2b2b9-h06-disposable-negative-evidence-closure-2026-10-16.md). H-07 challenges the false inference that an exclusive **advisory** maintenance lock bars consumers that do not cooperate with that lock. Actual new-consumer admission prevention remains owned by future **B2B9-A**, not H-07.

Human operator executed the two SSH terminals, VirtualBox checks, Guest root pin and the separate bounded cleanup. Assistant **did not** execute Guest/root or host maintenance commands, independently attest hypervisor state, or exercise production Runtime. Reported Mac VirtualBox `SanQ-Linux-Test` hardware UUID `0d46a6e8-abaf-4fa6-bd8d-987756143ee9`; Guest DMI readback `e8a6460d-afab-a64f-bd8d-987756143ee9` (SMBIOS byte-order representation). Current snapshot was reported as `SanQ-2B2B-Verified`, UUID `ba2d04f1-67de-4bc9-9f1b-d11b7841b47c`. Guest Ubuntu 24.04.5 / Linux 6.8.0-147 / Python 3.12.3, ext4 `/` and `/tmp` (dev `2050`), `/tmp` mode `1777`, systemd `running`. These are operator readbacks, **not** independent VM isolation, secrets/mount inventory, or snapshot-restorability attestation.

H07-A reviewed **standalone/off-repository** Runner `g2b2b9_h7_guest_runner.py` SHA-256 `1d45f0358431a608f56dc1965c1b08aed50db9a0b05367ba63719b09b6a2c197`; Witness `g2b2b9_h7_guest_witness.py` SHA-256 `c99719a89701df0e6414bc062529d01f075d3e059607d3075bdf055694b0f841`. These source bytes were independently hashed in the separate review environment. Operator reported matching Mac, Guest staging and `/root/sanq-g2b2b-h7-pin/v1/` hashes; root-owned `0700` ancestors, `0600` regular source files with hardlink count `1`. Neither standalone lab script is a member of the 17-member production Runtime Archive. No real SanQ systemd unit, Backup, Deploy, MCP, SSH controller, Docker or live HostAdapter was used.

## 2. Run 01 — advisory lock did not block new fixture read

**Run ID:** `h07a01ab`; fixed fixture `/tmp/sanq-g2b2b-lab-h7-h07a01ab`. Runner and separately launched Terminal B Witness each reported exit `0`; Runner `reportedPass=true`, `failures=[]`, `cleanupFailures=[]`, `post.consumerReturnCode=0`.

| Observation | Raw evidence / reported result |
| --- | --- |
| Operator identity | PID `2520`, PPID `2519`, UID `0`, startTicks `1045786` |
| Noncooperating consumer | PID `2521`, PPID `2520`, UID `0`, startTicks `1045798` |
| Both cgroups | `0::/user.slice/user-1000.slice/session-3.scope` |
| Lock identity | dev:ino `2050:1048604`, Runner `flockAcquired=true` |
| Payload identity | dev:ino `2050:1048603` |
| Payload read proof | `4096` bytes, SHA-256 `18b8732781ae775a333a834f71e75b22ca5b8e4c6e70398bcb206eb79c66023b` |
| Runner window | `2026-10-16T17:40:38.012202Z` – `17:41:53.205148Z` |
| Locked / held stage | `17:40:38.020236Z` / `17:40:38.109144Z` |
| Separate Witness | `17:40:38.167745Z` within held window |
| Witness classification | `UNCONTROLLED_ENTRY_OBSERVED` |
| Witness facts | `lockContended=true`, `operatorKernelLockOwnerVerified=true`, `operatorLockFdVerified=true`, `consumerPayloadFdVerified=true` |
| Explicit negative facts | `consumerEnteredAfterLock=true`, `actorDoesNotHonorLock=true`, `admissionStillPossible=true` |
| Safety response | `hypotheticalRuntimeHandoff=BLOCKED`, `runtimeHandoffAttempted=false`, `hostAdapterCalls=0` |

The five uploaded original JSONs agree on run ID, operator, lock dev/inode and payload dev/inode; the held consumer identity equals the Runner first/last and Witness consumer identity; the Runner's 4096-byte read proof matches the held proof and Witness digest. The pre → locked → held → Witness → Runner last/end timestamps are monotonic. The child is a **same-UID root synthetic consumer**; no distinct-UID, externally launched Deploy/MCP/SSH actor or complete production entry vector is tested.

**Independent-Witness limit:** Terminal B independently tested conflicting flock, inspected the matching kernel lock owner via `/proc/locks`, process identities and held payload FD via `/proc`, and cross-checked the payload digest. It learned the expected targets from Runner-created stage records; it did **not** independently trace the consumer's actual `read()` syscall or authenticate the VM. The raw Runner `independentWitnessProvided=false` remains unchanged. This is bounded corroboration, not an independent host trust root or an admission-prevention guarantee.

## 3. Original evidence archive — byte-level review

Operator-uploaded **original ZIP**, retained **off-repository**: `H07-h07a01ab-evidence-2026-10-16.zip`, **4,122 bytes**, SHA-256 `416bf98d601e82ef21f3b3b318f23244ee44fcf6d3c45e8b104f537413a8457e`. A separate review environment directly read the uploaded ZIP: ZIP CRC check passed; all **five original JSON** payloads parsed successfully; byte-level SHA-256 matched the Guest original, Guest export and Mac values reported by the operator. There were exactly five JSON entries and one directory entry; neither ZIP nor raw JSONs are committed to this repository. Matching digests establish uploaded byte consistency, **not** independent Guest/hypervisor authenticity.

```text
3329bea6ff9307a7fd788a62e1732385bb041279a912b551ee0e0dd1416570bb  h07a01ab-evidence/h07a01ab-pre-original.json
78e2ddb3c5ac1dff0cda8ed3aa9a787e71356a97400de6ce4bebd864cd6c1d8e  h07a01ab-evidence/h07a01ab-locked-original.json
2a8016486504ae802fbd5297ff374df99ae2bcf3b71361c96439ca5487d77e50  h07a01ab-evidence/h07a01ab-held-original.json
c644ac51d5b69aab3be854e9d0c5dfbd79d35d73a24e806d8114ad241a0d6328  h07a01ab-evidence/h07a01ab-runner-original.json
66f5b5a3fc17bed81cabcaf5ed5c4c40abe5d630556ab47d2e4af8df8480589d  h07a01ab-evidence/h07a01ab-witness-original.json
```

The original Guest-only `held-complete.marker` was reported with SHA-256 `5b77195595828d335fe7488951334315c6b06f7fba07b329a5f5d56a8eab36f7`; **its bytes were not included in this five-JSON ZIP** and were not independently reviewed from an upload. Do not imply they were archived with the ZIP. The H07-A source-review ZIP is a **different** artifact from the evidence ZIP; neither substitutes for original Guest evidence.

## 4. Exact hash-gated cleanup and independent Guest readback

Before cleanup, operator independently rehashed the Guest `evidence/99-result.json` as `c644ac51d5b69aab3be854e9d0c5dfbd79d35d73a24e806d8114ad241a0d6328` and checked PID `2520`/`2521` absence and no matching lab systemd units. The pinned source `--mode cleanup --run-id h07a01ab --receipt-sha256 c644ac51...0d6328` reported `H07_SELF_REPORTED_LAB_CLEANED; independent readback required` with **`H07_CLEANUP_EXIT=0`**. Source review identified fixed-run, receipt-hash, exact fixture inventory/inode checks and bounded file-removal/`rmdir` behavior; no wildcard process kill or live systemd mutation.

At **2026-10-16T17:50:06Z**, operator ran separate post-cleanup Guest read-only commands: exact fixture `H07_LAB_ABSENT`; `ps -p 2520,2521` printed only the header; two guarded successful `systemctl` queries returned `NO_H07_LAB_UNITS_FOUND` and `NO_H07_LAB_UNIT_FILES_FOUND`. This is verified absence of the **named** lab objects at that moment, **not** exhaustive host or historical forensic proof. The operator retained the five Guest export copies, reviewed root-pinned source and Mac ZIP outside this repository.

## 5. Frozen authority flags, deferred gates, and repository change boundary

All five raw JSONs explicitly retain `rootLevelWholeHostExclusionVerified=false`, `mountNamespaceCoverageVerified=false`, `newConsumerAdmissionPrevented=false`, `crossProcessQuiescenceVerified=false`, `readyToInstall=false`, `authorizedToMutateProduction=false`. The two decision-bearing Runner/Witness records also retain `hypotheticalRuntimeHandoff=BLOCKED`. **The observed success was the noncooperator's fixture read, not success of maintenance exclusion.**

Still deferred: **H-08** missing/unreadable/incomplete observations; S3–S10/S12 limits outside already bounded experiments; **B2B9-N** bind/mount namespace identity; **B2B9-A** enforced prevention of new Backup/Deploy/MCP/SSH or arbitrary actors; real root-owned operator and all-host exclusion; independent Recovery Kit (G2-B3), clean reinstall (G2-C), recovery matrix/cold recovery (G2-D), and exact production consent (G2-E). Prior VirtualBox freeze incidents remain unresolved, not reclassified as S12 evidence.

**Change boundary:** this branch adds this H-07 documentation record and a narrow subsequent-status link in H-06; **no raw evidence ZIP/JSON, no guest runner/witness source, no tests, runtime code, CI, deps, Prisma/schema/migrations, source allowlist, Backup, Deploy, MCP, Docker, systemd, sudoers, production data, Runtime Archive, release state, Guest command or production operation** is changed. Local tests/build/lint are not run under `AGENTS.md` default review workflow. Review this local diff before remote PR delivery; GitHub Actions is authoritative once approved. **C5-G2 NO-GO / S2 Daily Backup PAUSED** remains unchanged.
