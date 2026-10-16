# C5-G2-B2B9 — H-06 disposable-guest renamed-inode negative-case evidence closure

**Date:** 2026-10-16 (America/Toronto).  
**Owner:** Runtime / Data / CI / Ops.  
**Baseline:** latest `origin/dev@9a209849` when the standalone documentation branch was created.  
**Disposition:** **H-06 FIVE BOUNDED NEGATIVE CASES VERIFIED / EVIDENCE REVIEW PASSED**. These are five distinct fixture-only **BLOCKED** counterexamples; this is **not** proof of whole-host quiescence, independent VM attestation, production exclusion, Runtime handoff eligibility, or install authorization. **Production C5-G2 NO-GO / S2 Daily Backup PAUSED.**

## 1. Scope and provenance

Follow [H2 guest whole-host exclusion readiness](./c5-g2b2b9-h2-guest-whole-host-exclusion-readiness-2026-10-13.md), [H-01–H-04 closure](./c5-g2b2b9-h01-h04-disposable-negative-evidence-closure-2026-10-14.md), and [H-05 closure](./c5-g2b2b9-h05-disposable-negative-evidence-closure-2026-10-15.md). H-06 challenges the unsafe assumption that changing the active Runtime-like path ensures old file/tree objects are no longer referenced. These tests used **disposable synthetic fixtures only**, not production Runtime, installed backups, Docker, real systemd units, or a live HostAdapter.

The human operator executed both Guest SSH terminals and Mac/VirtualBox checks. The assistant did **not** execute Guest root commands or independently attest the VM, snapshot or disk. Operator-reported Guest: `SanQ-Linux-Test` / `sanq-linux-test`, VirtualBox VM UUID `0d46a6e8-abaf-4fa6-bd8d-987756143ee9`, snapshot `SanQ-2B2B-Verified` UUID `ba2d04f1-67de-4bc9-9f1b-d11b7841b47c`, Ubuntu 24.04.5, ext4 `/tmp` on st_dev 2050. Isolation and snapshot recovery were operator-reported, not independently attested here.

Root-private pinned **off-repository** H-06A source SHA-256: Runner `179f3fc60d8b0ef027205e212b12df54380b78a7718c80c8562043cb80fd261b`; Witness `6ce14df96777e7b2f820f3b178285adcd25a46b860c0d03dee1150e38b8775f9`. The guest source files are **not** members of the 17-member production Runtime Archive.

**Original evidence archive remains operator-controlled, off-repository:** `H06-five-runs-evidence-2026-10-16.zip`, SHA-256 `77596cfc071938b22c87eb5e28f8448a11604ca2f6bcafc706e1225a652325eb`. The uploaded ZIP's **25 unmodified raw JSON bytes** were read, CRC/JSON checked and individually SHA-256 matched to the operator-provided Guest/Mac values in the separate review environment. This repository change records a digest manifest and conclusions; **it does not embed the ZIP or its 25 raw receipts**. Do not treat a digest list as equivalent to repository-hosted raw evidence.

## 2. Five distinct observed BLOCKED cases

| Case / Run | Holder PID/startTicks | Original → replacement object (dev:ino) | Old-inode reference detected | Result |
| --- | --- | --- | --- | --- |
| `H06-REPLACE / h06r01ab` | `1006 / 44156` | tree `2050:1048596 → 2050:1048603`, payload `2050:1048601 → 2050:1048604` | `cwd:tree` + `fd:payload` | BLOCKED |
| `H06-FD / h06fd02a` | `1825 / 137211` | payload `2050:1048601 → 2050:1048603` | `fd:payload` only | BLOCKED |
| `H06-CWD / h06cwd03a` | `1033 / 168752` | tree `2050:1048596 → 2050:1048603` | `cwd:tree` only | BLOCKED |
| `H06-DIRFD / h06dir04a` | `1366 / 228318` | tree `2050:1048596 → 2050:1048603` | `fd:tree` only | BLOCKED |
| `H06-MMAP / h06map05a` | `1737 / 290558` | payload `2050:1048605 → 2050:1048607` | `mmap:payload` only | BLOCKED |

Each separate Runner and independent Terminal B Witness reported exit code `0`; `HOLDER_DETECTED`, `oldInodeReferenceVerified=true`, `pathOnlyReferenceDetected=false`, and hypothetical Runtime handoff `BLOCKED`. Runner first/last and Witness concur on holder PID, PPID, kernel start ticks, UID, relevant old/new (dev,ino), and reference kind. Runner `reportedPass=true`, `failures=[]`, `cleanupFailures=[]`, `holderReturnCode=0`; both report `hostAdapterCalls=0`, `runtimeHandoffAttempted=false`. All cases are **rename-based**, including `H06-MMAP`; no unlink-only test is claimed. The old and new **tree** inode are intentionally equal only in the file-only MMAP fixture; this is not a tree replacement test.

**Independent-witness qualification:** Witness independently read live `/proc/PID/cwd`, `/proc/PID/fd` and/or `/proc/PID/maps`, but got the target identity from Runner-created `ready.json` and separately checked old/new filesystem objects. The raw Runner `independentWitnessProvided=false` remains untouched. This corroborates a bounded detection, not an independent trust root or all-PID/namespace-wide observer.

## 3. Original 25-file SHA-256 manifest

Digest lines refer to the operator-uploaded ZIP entry paths, not files added to this repository. Stage files `pre/ready/held`, Runner `99-result`, and separate Witness are preserved as different original JSON artifacts.

```text
22d95acf5f873f545014767f376c13348c4d9b0b6e18e1ac5214762e379ef205  h06r01ab-evidence/h06r01ab-pre-original.json
c4d01877032f8c9415e8d8c431875d16f1eb014c84bc31bcca58316a1463348d  h06r01ab-evidence/h06r01ab-ready-original.json
36f5ff4bf887ee3a139f943b15ee5f001b04771999e7b4312a26d70e9fde4e9d  h06r01ab-evidence/h06r01ab-held-original.json
4fb4957eb4588f1c1556121f691ee5956b12db537ccde492cc907fee425a5a38  h06r01ab-evidence/h06r01ab-runner-original.json
f8b964231a5346256face6464ce4c4fceb3fe915267f10076c5886f280947b38  h06r01ab-evidence/h06r01ab-witness-original.json
fe6336ca159c29cd92a836dfdea16538face9ca804c369fab1f762a4746c16b3  h06fd02a-evidence/h06fd02a-pre-original.json
47ce5128829f44b2971acc86819c760cc9975442be2b005225604b9b3a6a1551  h06fd02a-evidence/h06fd02a-ready-original.json
873d811e473811835479676c871450b1a67fda01eb5756807bb6f9078ee397f9  h06fd02a-evidence/h06fd02a-held-original.json
2ef573cdb28418befdba327690d303214d7035d261ab7f7ec25e39edeb08d83e  h06fd02a-evidence/h06fd02a-runner-original.json
43badef86e8749a0b0c2224810f07a9e6793f88205148e0e261ede15799b5c28  h06fd02a-evidence/h06fd02a-witness-original.json
65c53af470b0948b08673ae35ea1c596a02718a7a9c7ed6ad9a2d08b5cb93921  h06cwd03a-evidence/h06cwd03a-pre-original.json
15f46d97abc54ee3f8df215f3cbc421fa06422fbc2adb892dda06f055e6e5b64  h06cwd03a-evidence/h06cwd03a-ready-original.json
c9be7573ca69d2d1402b247530be09f8199593b657f1311002e8262606624b8d  h06cwd03a-evidence/h06cwd03a-held-original.json
db56736895023972c434398498ef5487d5798fcf4f6f02c2c935485230280aed  h06cwd03a-evidence/h06cwd03a-runner-original.json
436ca50a089fa3321f5253edc522cf4a06ae9113d5a90010bb27f435535731b1  h06cwd03a-evidence/h06cwd03a-witness-original.json
a3ae645de473c27df70e9200a66220f182883a1457810d2c6ff293044da630f2  h06dir04a-evidence/h06dir04a-pre-original.json
573379051b6534c34481fb164f4a2993811fda024bc87cb588c48702c50b9b52  h06dir04a-evidence/h06dir04a-ready-original.json
93b1bda7e5cf6c34c9a53176bc95d744b38c8e8fa7877291930631cfd3e88a9e  h06dir04a-evidence/h06dir04a-held-original.json
95f42b17ea0ee93383cbda2fa160dc568cceefe210a77e76d8ebe4829742e5cf  h06dir04a-evidence/h06dir04a-runner-original.json
88772187e2f64bb7532e54a273c084ef479aa9f46d6e9cbf094970deded64afc  h06dir04a-evidence/h06dir04a-witness-original.json
d1564e8b3eb1a6bfdcc4f678b55f5cddf8d572d8a5b9ad19e31ce26817374e7f  h06map05a-evidence/h06map05a-pre-original.json
12d0ec9ecf434a7cdf5bb795e2acfa74d02109259cd5b36ffc242c9368cd7fe3  h06map05a-evidence/h06map05a-ready-original.json
5f6a8f014e364617237f18779bdd25dfe7b3a024353a9b6a248db1a2798317cc  h06map05a-evidence/h06map05a-held-original.json
b7d732667bf89aa6e342e55f66788f3cbe07a429b3bcc76e387fe3d7860671bf  h06map05a-evidence/h06map05a-runner-original.json
dca61451db3031359ea6371226d05ab64f3fe939f88fcf27cd78f0fbc2346eef  h06map05a-evidence/h06map05a-witness-original.json
```

**Important provenance exception:** For `h06r01ab`, stage `pre/ready/held` original Guest fixture-path hashes were not independently printed before that fixture was cleaned; their Guest export copies and Mac files matched. For runs 02–05, four Guest fixture originals were directly SHA-256 checked before copying, and export/Mac copies matched. Digest agreement is not independent hypervisor/Guest authenticity.

## 4. Cleanup and independent final readback

The operator reported successful precisely scoped cleanup and immediate Guest lab/PID/systemd readback for Run 01 and Run 03 (`cleanup exit=0` supplied). For Runs 02/04/05, the operator stated cleanup had completed, **but no original per-run cleanup exit-code or immediate independent readback transcript was supplied**. Do not invent or retroactively upgrade these missing historical logs. Runner `cleanupFailures=[]` is not proof of the later lab-directory cleanup.

At **2026-10-16T15:43:56Z**, the operator separately executed a delayed Guest read-only inventory. It returned `LAB_ABSENT` for **all five exact run IDs** (`h06r01ab`, `h06fd02a`, `h06cwd03a`, `h06dir04a`, `h06map05a`), plus `NO_H06_PROCESSES_FOUND`, `NO_LAB_UNITS_FOUND`, and `NO_LAB_UNIT_FILES_FOUND`. This documents **absence of matched objects at that moment**, not proof of exact historical cleanup operations, exhaustive host process/namespace coverage, or future admission prevention.

## 5. Negative-only barrier and remaining independent gates

Every relevant raw Runner/Witness receipt maintains `rootLevelWholeHostExclusionVerified=false`, `mountNamespaceCoverageVerified=false`, `newConsumerAdmissionPrevented=false`, `crossProcessQuiescenceVerified=false`, `readyToInstall=false` and `authorizedToMutateProduction=false`. No positive Runtime install/handoff token exists. No production host adapter call occurred.

This isolated ext4 fixture does **not** verify unlink-only stale mappings, bind-mount aliases, mount namespaces, cross-filesystem moves, overlayfs, unreadable/unscannable PIDs, all-host enumeration, or noncooperating new entrants. Namespace/mount coverage belongs to **B2B9-N**, admission prevention to **B2B9-A**; **H-07/H-08** and remaining S3–S10/S12 limits remain separately gated. Prior VirtualBox freezes and inconclusive H-05 attempts remain recorded; the H-06 results do not erase them. Independent Recovery Kit (G2-B3), clean reinstall (G2-C), recovery matrix (G2-D), and production approval (G2-E) are still pending.

**Subsequent H-07 update (2026-10-16; does not change H-06's historical result):** one isolated uncontrolled-new-consumer negative case, original uploaded five-JSON ZIP byte review and bounded Guest cleanup are documented as **BOUNDED NEGATIVE VERIFIED / EVIDENCE REVIEW PASSED / CLEANUP VERIFIED** in the [H-07 closure record](./c5-g2b2b9-h07-disposable-negative-evidence-closure-2026-10-16.md). This confirms a noncooperating fixture reader can enter despite advisory `flock`; **it does not mean admission prevention exists**. H-08 and the independent B2B9-A/N, Recovery Kit and production gates remain deferred.

**Change boundary:** this feature branch is documentation-only: this closure record plus a narrow status clarification in H-05. No raw ZIP/JSON is committed in this change, and no guest source, CI/test/runtime code, deps, Prisma, migrations, schema, Backup, Deploy, MCP, Docker, systemd, production data, Runtime Archive, release state or production command is modified. GitHub Actions is authoritative after user review and remote delivery. **C5-G2 NO-GO / S2 Daily Backup PAUSED remains unchanged.**
