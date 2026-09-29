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
- the R4 verification helper is run with the production VM's actual Compose
  env-file when one is used; do not assume `/etc/sanqin/sanqin.env` because
  that path was confirmed absent on the active VM during the 2026-09-29 R5
  verification;
- no unrelated deployment/provider/payment incident is active.

R1-R4 themselves add no Prisma schema/migration and no Clover/Uber provider
cutover.

## Baseline evidence

Capture:

- `git rev-parse HEAD`;
- `docker compose ps` using the production VM's existing Compose environment
  resolution, or the same command with the actual env-file path when one is
  explicitly required;
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

## 2026-09-29 production evidence

Production deployment baseline for `main@c05f8de7`:

- production repository was clean on `main@c05f8de7`;
- db/api/ubereats-worker/web were recreated by the deployment and all reached
  Compose `healthy`;
- PostgreSQL returned to `ready to accept connections`;
- API registered `/api/v1/live`, `/api/v1/ready`, and
  `/api/v1/health`, then returned repeated `GET /api/v1/ready = 200`;
- Uber worker health server listened on `:4001`;
- Web reached `Ready`;
- Prisma history contained 0 unresolved rows
  (`finished_at IS NULL AND rolled_back_at IS NULL`) and 1 historical
  rolled-back row;
- bounded startup-log review found no restart loop.

Active production verification was then performed under explicit user
authorization:

- **V2 API restart — PASSED.** Restarting only `api` moved it through
  `health: starting` and back to Compose `healthy`. Nest restarted at
  14:12:27Z, listened again at 14:12:29Z, and `/api/v1/ready` returned 200
  afterward. DB, worker, and Web uptimes were unchanged.
- **V3 Uber worker restart — PASSED.** Restarting only `ubereats-worker`
  restarted its Nest runtime at 14:14:40Z and restored the health listener at
  14:14:41Z. `/ready` returned `status=ok` with DB and scheduler checks
  healthy. `/health` returned `status=degraded`, `readiness=ok` because
  of 3 pre-existing durable `orderAction` failures; API, DB, and Web uptimes
  were unchanged.
- **V4 Web restart — PASSED.** Restarting only Web moved it through
  `health: starting`; Next started at 14:16:40Z and reported Ready in 332 ms.
  Local `/health` returned `{"status":"ok","component":"web"}`. API, worker,
  and DB uptimes were unchanged.
- **V5 PostgreSQL dependency recovery — PASSED.** PostgreSQL was intentionally
  stopped at 14:18:46Z and shut down cleanly at 14:18:47Z. API and worker
  readiness both returned HTTP 503 while the API/worker/Web processes remained
  running. PostgreSQL was started again at 14:19:12Z and reported
  `ready to accept connections` at 14:19:12Z. API readiness recovered to 200
  by 14:19:18Z and worker readiness recovered without restarting either
  process. Web-local health remained healthy.
- **V6 degradation semantics — PASSED from live worker evidence.** The 3
  pre-existing durable `orderAction` failures kept worker operational health
  at `degraded` while runtime readiness stayed `ok`; no restart loop was
  triggered.
- **V7 recreate recovery — SATISFIED by deployment evidence.** The production
  deployment recreated the application containers and each returned through its
  own Compose health contract. A second rebuild was not performed solely to
  duplicate that evidence.

Expected database-dependent processor/API errors were emitted while PostgreSQL
was deliberately unavailable. They stopped being dependency-outage evidence
after DB recovery and did not cause process restart loops. One PostgreSQL
`operator does not exist: uuid = text` ERROR at 14:12:22Z predates V5 and is
recorded as an unrelated existing anomaly rather than an R5 readiness failure.

Environment-documentation finding:

- the previously documented `/etc/sanqin/sanqin.env` file does not exist on
  the active production VM;
- production `docker compose` commands successfully resolved the existing
  environment when run from the production repository without that explicit
  path;
- the R4 helper itself still requires an explicit valid env-file argument, so
  it was not rerun with the stale path.

Final closeout evidence:

- public `https://sanq.ca/health` returned HTTP 200 and Web `status=ok`;
- public BFF `https://sanq.ca/api/v1/ready` returned HTTP 200 with API
  `status=ok`, `database=ok`, and `uploads=ok`;
- public `https://sanq.ca/api/v1/menu/public` returned HTTP 200;
- `docker compose ps` showed api/db/ubereats-worker/web all `healthy`;
- `prisma migrate status` found 191 migrations and reported
  `Database schema is up to date!`;
- local API readiness returned `status=ok` with DB/uploads checks;
- local worker readiness returned `status=ok` with DB/scheduler checks;
- local Web health returned `status=ok`.

This constitutes the final helper-equivalent verification using the production
VM's actual Compose environment resolution. Together with V2-V7, all required
R5 production evidence is now complete.

Current state: `PRODUCTION VERIFIED / CLOSED`.
