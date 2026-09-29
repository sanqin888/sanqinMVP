# Runtime readiness production verification

## Scope and gate

This runbook closes Post-A5 Runtime Readiness R5 after R1-R4 are promoted to
`main` and deployed to the production VM.

R5 is an operational verification gate. It does **not** authorize production
deployment, Prisma migration application, destructive database work, provider
cutover, or a production restart by itself. Those actions still require the
normal repository/user authorization.

Do not mark R5 `PRODUCTION VERIFIED / CLOSED` until the deployed production
commit contains R1-R4 and every required check below has recorded evidence.

## Preconditions

Record all of the following before changing production state:

- production repository is clean and on the intended `main` commit;
- the intended `main` commit contains R1-R4;
- required production migrations, if any, were separately authorized/applied;
- a recent database backup exists under the normal production backup policy;
- `bash ops/verify-runtime-readiness.sh /etc/sanqin/sanqin.env https://sanq.ca`
  passes before fault/restart tests;
- no unrelated deployment/provider/payment incident is active.

R1-R4 themselves add no Prisma schema/migration and no Clover/Uber provider
cutover.

## Baseline evidence

Capture:

- `git rev-parse HEAD`;
- `docker compose --env-file /etc/sanqin/sanqin.env ps`;
- health state for db/api/ubereats-worker/web;
- `prisma migrate status` through the R4 verification helper;
- API `/api/v1/ready`;
- worker `/ready` and `/health`;
- Web `/health`;
- public `/health`, `/api/v1/ready`, and `/api/v1/menu/public`;
- recent API/worker/Web logs for startup/schema/restart-loop errors.

## Verification matrix

### V1 — Clean deployment / cold Compose admission

After the authorized production deployment, confirm:

1. PostgreSQL becomes healthy first.
2. API and Uber worker do not become ready before PostgreSQL health.
3. API reaches healthy through `/api/v1/ready`.
4. Worker reaches healthy through `/ready`; provider degradation may appear
   only on `/health`.
5. Web reaches healthy through its local `/health`.
6. Public Web, BFF -> API readiness, and public menu smoke all pass.
7. No container is in a restart loop.

Required evidence: Compose `ps`, verification-helper output, and bounded
startup logs.

### V2 — API single-container restart

Restart only the API container under explicit production authorization.

Expected:

- db/worker/Web processes are not intentionally restarted;
- API transitions unavailable/not-ready, then returns ready;
- Web-local `/health` can remain healthy while BFF -> API smoke temporarily
  fails;
- public BFF -> API smoke recovers when API readiness recovers;
- no provider call is required by API readiness.

### V3 — Uber worker single-container restart

Restart only `ubereats-worker`.

Expected:

- API/Web remain available;
- worker `/live` returns after process start;
- `/ready` is not 200 until DB and scheduler readiness are satisfied;
- `/health` may show `starting` during admission;
- provider/durable-work degradation does not by itself make runtime readiness
  fail.

### V4 — Web single-container restart

Restart only Web.

Expected:

- API and worker remain ready;
- Web-local `/health` fails during restart and returns independently of API;
- public Web health and BFF smoke recover;
- API readiness does not act as the Web-local health signal.

### V5 — PostgreSQL restart / dependency recovery

This is the highest-risk restart check and requires explicit production
authorization.

Expected:

- DB health drops during restart;
- API/worker may remain live at process level but readiness must fail while DB
  is unavailable;
- no assumption is made that Docker `restart: always` restarts an
  `unhealthy` process solely because health failed;
- after PostgreSQL returns, API and worker readiness recover without requiring
  provider reachability;
- no migration or schema mutation occurs as a side effect of health recovery.

### V6 — Provider degradation semantics

Use existing observable provider/durable failure evidence or a controlled
non-mutating failure condition; do not create a provider cutover merely for this
test.

Expected:

- Clover/Uber/messaging/provider reachability does not participate in API
  readiness;
- Uber worker operational `/health` may be `degraded` while `/ready`
  remains `ok` when DB/scheduler runtime is healthy;
- no restart loop is triggered merely by provider degradation.

### V7 — Rebuild one container

For one authorized application container rebuild/recreate, verify that the
changed component returns through its own health contract and the R4 verification
helper passes afterward. A full-stack restart is not required merely to verify
one rebuilt component.

## Failure handling

If any expected result fails:

1. stop the verification sequence;
2. preserve logs and health snapshots;
3. do not weaken health thresholds or clear durable queues to make the check
   pass;
4. do not roll forward additional unrelated changes;
5. choose forward-fix or rollback using the normal production workflow;
6. rerun the failed item and the final verification helper.

## Closeout evidence template

Record:

- production commit:
- deployment time (America/Toronto):
- backup evidence:
- migration status:
- V1:
- V2:
- V3:
- V4:
- V5:
- V6:
- V7:
- final `ops/verify-runtime-readiness.sh` result:
- relevant log window:
- unresolved deviations:

Only after every required item is supported by production evidence may the
Post-A5 Runtime Readiness work be marked `PRODUCTION VERIFIED / CLOSED`.

## 2026-09-29 deployment evidence

Passive production verification after deploying `main@c05f8de7`:

- production repository: clean `main@c05f8de7`;
- db/api/ubereats-worker/web were recreated by the deployment and all reached
  Compose `healthy`;
- PostgreSQL returned to `ready to accept connections`;
- API registered `/api/v1/live`, `/api/v1/ready`, and
  `/api/v1/health`, then returned repeated `GET /api/v1/ready = 200`;
- Uber worker health server is listening on `:4001`;
- Web reached `Ready`;
- Prisma history contains 0 unresolved rows
  (`finished_at IS NULL AND rolled_back_at IS NULL`) and 1 historical
  rolled-back row;
- bounded startup-log review found no fatal/error/restart-loop evidence.

Evidence still open:

- independent public `/health`, public BFF -> API readiness, and public menu
  smoke were not independently observable from the available external fetch
  surface;
- no extra API/worker/Web/DB restart or fault injection was performed because
  explicit production restart authorization was not given.

This evidence is therefore `PRODUCTION DEPLOYED + PASSIVE VERIFIED`, not final
`PRODUCTION VERIFIED / CLOSED`.
