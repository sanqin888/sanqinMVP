# sanqinMVP

Monorepo (pnpm workspace) for **Sanqin Roujiamo** web + API, deployed with Docker Compose.

## Stack
- Node.js 20 (Alpine)
- pnpm workspace
- Next.js (web) built as **standalone**
- API (Node) built to `apps/api/dist`
- Postgres 15

---

## Repository Structure

- `apps/api` — Backend API (build output: `apps/api/dist`)
- `apps/web` — Next.js web (standalone output: `apps/web/.next/standalone`)
- `libs/*` — Shared libraries
- `tools/printer-server` — **Windows local ESC/POS printer server** (NOT deployed on VM)

> **Important:** `tools/printer-server` is designed to run on a Windows POS machine (uses `cmd /C copy /B` and printer shares). Do **not** run it on the Linux VM.

---

## Local Development

### 1) Install dependencies
```bash
pnpm install
2) Run DB (optional)
If you prefer Docker for Postgres:

bash
复制代码
docker compose up -d db
3) Run API/Web locally
Example (adjust to your scripts):

bash
复制代码
pnpm --filter api dev
pnpm --filter web dev
Production Deployment (VM)
1) Prepare env file
On VM you likely use something like:

/etc/sanqin/sanqin.env

2) Build and run
bash
复制代码
docker compose --env-file /etc/sanqin/sanqin.env up -d --build
Services:

web : port 3000

api : port 4000

db : port 5432 (bound to 127.0.0.1 in compose)

Docker Build Notes
API Dockerfile (multi-stage)
Builder:

installs deps

runs npx prisma generate

builds API via pnpm --filter api build

Runner:

copies node_modules, libs, and apps/api/dist (plus prisma)

starts node apps/api/dist/main.js

Web Dockerfile (Next.js standalone)
Builder:

installs deps

pnpm --filter web build to produce .next/standalone

Runner:

copies .next/standalone as runtime

copies public + .next/static

starts node apps/web/server.js

Because you COPY . . in Dockerfiles, .dockerignore is critical for smaller, faster builds.

POS Local Printing (Windows)
The printer server runs on the POS Windows machine:

HTTP server listening on http://127.0.0.1:19191

endpoints:

GET /ping

POST /print-pos

POST /print-summary

Location in repo:

tools/printer-server/printer-server.js

Run (Windows)
bash
复制代码
cd tools/printer-server
npm i
node printer-server.js
Environment (optional):

POS_FRONT_PRINTER (default: POS80)

POS_KITCHEN_PRINTER (default: KC80)

POS_PRINTER_PORT (default: 19191)

Security note:

This service is intended for local / LAN usage only.

Do not expose port 19191 to the public Internet.
