# Getting Started — Abhinand (You're initializing the repo)

Since you're starting first, you set up the shared skeleton everyone else builds on top of. Do these steps in order, on your own machine, before touching any actual risk-engine code.

---

## Step 1 — Create the GitHub repo

1. Create a new **empty** repository on GitHub (no README, no .gitignore, no license — you'll add these yourself so you control exactly what's in the first commit). Name suggestion: `banking-auth-system`.
2. Add Sunny and Karthik as collaborators (or set up a GitHub team) so they can push branches directly.
3. In repo settings, protect the `main` branch: require at least 1 approval before merging, no direct pushes.

## Step 2 — Clone it locally

```bash
git clone https://github.com/<your-org>/banking-auth-system.git
cd banking-auth-system
```

## Step 3 — Create the shared folder skeleton

You don't need to write real code yet — just the folder structure and placeholder files so `dev` has something for Sunny and Karthik to branch from. Use your AI agent for this scaffolding step.

**Agent prompt to use:**
> "Create the following folder structure with placeholder/empty files (just enough for each to be a valid stub — e.g. a minimal `package.json` for Node folders, a minimal `main.py` for the Python folder, empty `.sol` file with just a license header):
>
> ```
> banking-auth-system/
> ├── docker-compose.yml
> ├── .env.example
> ├── .gitignore
> ├── README.md
> ├── docs/
> │   ├── PRD.md
> │   ├── TRD.md
> │   ├── 00_Git_Branching_Strategy.md
> │   ├── Abhinand_Task_Plan.md
> │   ├── Karthik_Task_Plan.md
> │   ├── Sunny_Task_Plan.md
> │   └── Phase2_Remaining_Work.md
> ├── contracts/
> │   ├── contracts/AuthRegistry.sol
> │   ├── scripts/deploy.ts
> │   ├── test/authRegistry.test.ts
> │   ├── hardhat.config.ts
> │   └── package.json
> ├── services/
> │   ├── gateway/
> │   │   ├── src/index.ts
> │   │   ├── package.json
> │   │   └── Dockerfile
> │   ├── orchestrator/
> │   │   ├── src/index.ts
> │   │   ├── package.json
> │   │   └── Dockerfile
> │   └── risk-engine/
> │       ├── app/main.py
> │       ├── requirements.txt
> │       └── Dockerfile
> ├── apps/
> │   ├── web/
> │   │   ├── src/App.tsx
> │   │   └── package.json
> │   └── mobile/
> │       └── lib/main.dart
> ├── automation/n8n/workflows/
> └── scripts/
> ```
>
> Each `package.json` should have a name matching its folder, no real dependencies yet. Each `Dockerfile` can be a minimal placeholder (`FROM node:20-alpine` or `FROM python:3.11-slim`, no build steps yet). Don't implement any real logic — this is just the skeleton."

## Step 4 — Add the actual planning documents

Copy your `PRD.md`, `TRD.md`, and the five planning files (branching strategy + three task plans + Phase 2 doc) into the `docs/` folder you just scaffolded. **This matters:** once these are in the repo, everyone's AI agent can read them directly by file path instead of you pasting content into chat every session.

```bash
cp PRD.md TRD.md docs/
cp 00_Git_Branching_Strategy.md Abhinand_Task_Plan.md Karthik_Task_Plan.md Sunny_Task_Plan.md Phase2_Remaining_Work.md docs/
```

## Step 5 — Write `.gitignore` and `.env.example`

**Agent prompt to use:**
> "Write a `.gitignore` for a repo containing Node.js services, a Python FastAPI service, a Hardhat/Solidity project, a Flutter app, and a React web app. Cover `node_modules`, `__pycache__`, `.env`, build output folders (`dist`, `build`, `artifacts`, `cache` for Hardhat), and IDE folders. Also write a `.env.example` at the repo root listing every environment variable name referenced across the PRD and TRD (RPC_URL, ADMIN_PRIVATE_KEY, ADMIN_WALLETS, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, DATABASE_URL, MONGO_URL, ORCHESTRATOR_URL, CONTRACT_ADDRESS, etc.) with empty values — names only, never real values."

## Step 6 — First commit to `main`

```bash
git add -A
git commit -m "chore: initial repo skeleton and planning docs"
git push origin main
```

## Step 7 — Create and push the `dev` branch

```bash
git checkout -b dev
git push origin dev
```

## Step 8 — Create your own working branch

```bash
git checkout -b abhinand-dev
git push origin abhinand-dev
```

## Step 9 — Message the team

Tell Sunny and Karthik the repo exists, `main` and `dev` are set up, and they should each pull `dev` and create their own branch (`sunny-dev`, `karthik-dev`) — see the separate getting-started file for them.

---

## Step 10 — Now start your actual module

You're on `abhinand-dev`. Open `services/risk-engine/` in VS Code and start with Phase A of your task plan (`docs/Abhinand_Task_Plan.md`).

**First real prompt to give your agent** (point it at the doc directly instead of retyping requirements):

> "Read `docs/Abhinand_Task_Plan.md` in this repo. I'm working on the `abhinand-dev` branch and should only touch files inside `services/risk-engine/`, `apps/web/src/pages/admin/Attempts.tsx`, and `scripts/`. Start with the file `services/risk-engine/app/main.py` — implement it exactly as specified in the task plan's file-by-file breakdown for that file."

Then work through each file in your task plan in order: `main.py` → `features.py` → `scorers/rules.py` → `graph/threat_graph.py` → `graph/bfs.py` → `geo.py` → `Attempts.tsx` → `seed.ts`/`scenarios/`.

Commit after each file works and has passing tests:

```bash
git add -A
git commit -m "feat: implement risk-engine scoring endpoint and rule-based scorer"
git push origin abhinand-dev
```

When a chunk of work (e.g., all of Phase A) is done and tested, open a Pull Request from `abhinand-dev` into `dev`. Karthik reviews it (per the branching strategy's review pairing).
