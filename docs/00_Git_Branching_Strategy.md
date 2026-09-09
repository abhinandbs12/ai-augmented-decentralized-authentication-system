# Git Branching Strategy — Banking Auth System (Phase 1 / 50% scope)

Read this before creating any branch or running any AI coding agent against the repo.

## Branch structure

```
main                    ← protected. Only updated at a milestone, by merging dev.
 └── dev                ← shared integration branch. Working code lands here.
      ├── karthik-dev   ← Karthik's personal branch — push here anytime, no approval needed
      ├── sunny-dev     ← Sunny's personal branch — push here anytime, no approval needed
      └── abhinand-dev  ← Abhinand's personal branch — push here anytime, no approval needed
```

**Why personal branches exist:** you're each running an AI coding agent (Claude Code / Cursor / Copilot) directly in VS Code, which can generate a lot of changes fast. Pushing straight to `dev` or `main` risks someone else's in-progress work getting overwritten or broken by an agent mid-task. Your personal branch is your **safe zone** — push to it as often as you want, even broken/half-finished code, with zero risk to anyone else.

## Daily workflow

1. **Start of session:** `git checkout yourname-dev && git pull origin dev` (pull latest integration work into your branch first, so you're not working on something stale)
2. Work with your AI agent, commit often (`git add -A && git commit -m "wip: ..."` is fine on your personal branch — messy commits here are okay)
3. Push to your own branch as often as you like: `git push origin yourname-dev`
4. **When a feature is actually working and tested:** open a Pull Request from `yourname-dev` into `dev`
5. One other teammate reviews it (see pairing below), then it gets merged into `dev`
6. Delete nothing — personal branches stay alive for the whole phase, they're your continuous working branch, not one-off feature branches

## Review pairing (keeps everyone reading someone else's code at least once)

- **Karthik's PRs into `dev`** → reviewed by Sunny
- **Sunny's PRs into `dev`** → reviewed by Abhinand
- **Abhinand's PRs into `dev`** → reviewed by Karthik

## Commit message convention

```
feat: <what was added>
fix: <what was fixed>
test: <what was tested>
wip: <work in progress — only ever on your personal branch, never in a PR to dev>
```

## Merge order for Phase 1 (avoids blocking each other)

1. **Karthik** merges the smart contract into `dev` first — nothing else can call it until it's deployed locally and the address is known.
2. **Sunny** merges the gateway + orchestrator skeleton next — this is what every other service plugs into.
3. **Abhinand** merges the risk-scoring endpoint once the orchestrator has somewhere to call it from.
4. After that, everyone works in parallel, merging into `dev` continuously as pieces become ready.

## Rule for AI coding agents specifically

- Before pointing your agent at a task, tell it **which branch it's on** and **which files it's allowed to touch** (your module's folder only — see your individual task file). Agents will happily "helpfully" edit files outside your module if you don't constrain them.
- Never let an agent run `git push --force`, rewrite history, or touch `main`/`dev` directly.
- Review every diff the agent produces before committing — even on your personal branch, since you'll eventually PR this into `dev` and Sunny/Karthik/Abhinand will read it.

## Environment & secrets

- Each service (`gateway`, `orchestrator`, `risk-engine`, `contracts`) has its own `.env`, never committed.
- Commit a `.env.example` with variable names only, no values.
- Share actual secret values (Twilio trial keys, admin wallet private key for the local Hardhat account) over your group chat or a password manager — never through git, never through an agent's context if you can avoid it.

## Before the Phase 1 review

- `dev` merged into `main`
- `docker compose up` works from a clean clone with only `.env` filled in
- Run through the demo scenarios together once, live, before the actual review
