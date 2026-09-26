# Phase 1 Completion Report

AI-Augmented Decentralized Authentication System — banking login security.
Branch `sunny-dev`, prepared for review into `dev`. Team: Karthik R Nair, Sunny
Singh, Abhinand Baiju Smitha.

## 1. Executive summary

Phase 1 now runs end to end from one `docker compose up`: a customer registers a
wallet on chain, every sign-in is scored before any challenge exists, the score
routes it to a wallet signature, an email-code step or a block, the contract
verifies the signature and refuses replays, completed sign-ins are sealed into
Merkle batches anchored on chain, a fraud ring is detected through the graph, and
a credential-stuffing burst trips an automatic circuit breaker that pauses the
contract. A web app shows all of it on live data: a plain-language customer
sign-in and an operations console for administrators.

Measured against the PRD's 29 functional requirements, 17 are fully implemented
and verified, 5 partly, and 7 not (4 of those are Phase 2 work, 3 are
"Could"-priority stretch items). That is about **67% of all functional
requirements**, **75% of the in-scope ones**, and **86% of the Must
requirements** (section 21). Since 2026-09-26 the step-up code is emailed
instead of sent by SMS: the demo delivers it to a local inbox (Mailpit), real
inboxes need SMTP credentials, and the change of channel from the PRD's
"SMS through Twilio" (FR-11, FR-21) still needs sign-off.

## 2. Repository overview

| Path | What it is | Tests |
|---|---|---|
| `contracts/` | `AuthRegistry.sol`, Hardhat config, deploy script | 21 Hardhat tests |
| `services/gateway/` | Express gateway: token bucket, zod validation, request ids, proxy | 66 Vitest tests |
| `services/orchestrator/` | Express orchestrator: login state machine, sessions, nonces, OTP, chain client, Merkle batcher, circuit breaker, Socket.IO, SQL migrations | 201 Vitest tests |
| `services/risk-engine/` | FastAPI: rule scorer, feature extraction, threat graph and bounded BFS | 63 pytest tests |
| `apps/web/` | React 19 + Vite + Tailwind 4: customer screens and operations console | type-checked, built |
| `scripts/` | Seeder, scenarios S1–S6, `trust-device` demo helper | type-checked, run live |
| `docker-compose.yml` | Hardhat, contract deploy, Postgres, MongoDB, risk engine, orchestrator, gateway | started from clean |

**351 automated tests, all passing** (309 at first writing; 42 added with the
fixes of 2026-09-25/26).

Since the first writing (2026-09-25/26): the step-up code is emailed, with a new
code available after 30 seconds; a customer without a wallet extension can
create a key pair in the browser (FR-01); the orchestrator rebuilds the local
chain's registrations and audit roots from PostgreSQL after a restart; expired
code challenges and nonces are deleted automatically; and the lab overlay gives
the gateway and the velocity rule room for a team rehearsing.

## 3. Architecture

```text
Browser (React, MetaMask) ──► Gateway :3000 ──► Orchestrator (internal)
                                                 ├─► Risk engine (internal) ─► MongoDB
                                                 ├─► PostgreSQL
                                                 └─► AuthRegistry.sol on Hardhat :8545
```

Only the gateway (3000) is published to the network. The chain RPC (8545) is
bound to 127.0.0.1, because its development accounts, the contract admin among
them, are unlocked. The development overlay `docker-compose.dev.yml` adds 3001
and 8001 on 127.0.0.1 for the demo scripts. The full diagram is in `REVIEWER_DEMO_GUIDE.md`.

## 4. Documentation audit

Read in full: `README.md`, `PRD.md`, `TRD.md`, `Phase2_Remaining_Work.md`,
`00_Git_Branching_Strategy.md`, `Sunny_Complete_Agent_Guide.md`,
`Phase1_Audit_Problems.pdf`, `Team_Action_Plan.pdf`, every `package.json`,
`requirements.txt`, the compose files and `.env.example`. The planning documents
are local only (git-ignored) and were not changed.

## 5. Documentation versus implementation

| Requirement | Documents say | Implementation | Status | Action |
|---|---|---|---|---|
| Login is two calls | TRD §6.3: `/login` then `/verify` | Built that way | IMPLEMENTED | — |
| `POST /api/auth/nonce` | TRD §6.2 lists it | Removed: it issued a signable challenge with no score | DOCUMENTATION MISMATCH | Documented in README |
| Who writes `login_events` | TRD §12.1: orchestrator | Risk engine writes, orchestrator reports each decision through an authenticated `/event` | DOCUMENTATION MISMATCH | Decision recorded (§7) |
| Merkle leaf and batch | TRD §5.4 | keccak256 over fixed-order JSON, odd node promoted, 16 events or 60 s | IMPLEMENTED | — |
| Batch id storage | TRD §7.4: on the event document | Stored in Postgres `audit_leaves`, keyed by the contract's batch id | DOCUMENTATION MISMATCH | Keeps one writer per store |
| Stack versions | TRD §2.2: React 18, Vite 5, Tailwind 3 | React 19, Vite 8, Tailwind 4 (already installed) | DOCUMENTATION MISMATCH | Code kept as is |
| Top-N riskiest | TRD: min-heap | Sorted query (Phase 2 lists the heap) | PARTIALLY IMPLEMENTED | As agreed |
| Supabase | PRD tech stack | Plain `postgres:16-alpine` (TRD §7.2 decision) | IMPLEMENTED | — |
| Admin login | TRD §11.4: same wallet flow + allow-list | Built that way | IMPLEMENTED | — |
| README | "50 tests", open `registerUser()`, replay-prone contract listing | Rewritten to match the code | Was BROKEN | Fixed |

## 6. Phase 1 requirements

| Phase 1 requirement | Implementation | Functional? | Evidence |
|---|---|---|---|
| Registration on chain + profile | `/api/auth/register`, `registerUser(address)` | Yes | E2E, browser |
| Three login routes | `handleLogin`, `/login`, `/otp/verify`, `/verify` | Yes | E2E 21/21, browser |
| Rule-based risk scoring | `scorers/rules.py`, `features.py` | Yes | S1–S3, pytest |
| Fraud graph + bounded BFS | `graph/threat_graph.py`, `bfs.py` | Yes | S4, pytest |
| Merkle audit trail | `audit/merkleTree.ts`, `batcher.ts`, audit routes | Yes | S6, browser verify + tamper |
| Smart contract | `AuthRegistry.sol` | Yes | 21 Hardhat tests, live |
| Basic dashboard table | Operations console | Yes | Browser |
| Gateway rate limiting | `tokenBucket.ts` | Yes | Live 429 on the 11th request |
| OTP step-up (email) | `otpService.ts`, `emailSender.ts` | Yes: emailed over SMTP, to Mailpit in the demo; real inboxes need SMTP credentials | Live browser run, 15/15 and 9/9 email checks |
| Circuit breaker | Contract pause + `circuitBreaker.ts` | Yes | S5 live: 60 blocked in 1.5 s → paused |
| Sessions + logout | `SessionStore` (LRU + Postgres) | Yes | E2E |
| Socket.IO stream | `realtime/socket.ts` | Yes | Console live pill, row updates |

## 7. Phase 1 implementation completed

- **Contract:** every consumed nonce remembered per wallet; admin-only
  `registerUser(address)` rejecting the zero address; 21 tests; deploy script
  and a `contract-deploy` compose service that hands the address to the
  orchestrator.
- **Orchestrator:** migrations 001–006; opaque sessions (hash stored, LRU cache,
  Postgres fallback, logout revokes both); nonces single-use and five minutes;
  OTP (six digits, SHA-256 only, five minutes, three attempts, then destroyed);
  `/register`, `/login`, `/verify`, `/otp/verify`, `/logout`; admin routes
  behind the `ADMIN_WALLETS` allow-list; pause, resume, status; audit events,
  proof and root routes; Merkle batcher; automatic circuit breaker; Socket.IO
  stream for administrators only.
- **Risk engine:** `/event` authenticated with a shared token; history counts
  only verified sign-ins; configurable velocity window; indexes; stores the
  scoring factors.
- **Event ownership decision (#13):** the risk engine is the only writer of
  `login_events`. The orchestrator reports each attempt once with its decision and
  again, under the same event id, once the signature is verified. The challenge
  carries the score, device, reasons and route, so the completed record says why
  it was routed the way it was.
- **Web:** customer registration and sign-in, email-code step, signed-in summary;
  operations console with live activity, attempt detail, riskiest-first view,
  audit verification in the browser with a tamper simulation, and controls with
  the breaker meter.
- **Demo tooling:** root `package.json` (`npm run seed`, `s1`–`s6`,
  `trust-device`), shared demo identities, S5 rewritten to trip the real breaker.

## 8. Bugs fixed

| Bug | Severity | Fix |
|---|---|---|
| One wallet spelled in two letter cases was two identities: completed sign-ins never made a device familiar, and blocked attempts could be split across spellings to dodge the auto-flag rule | HIGH | Addresses lower-cased where the risk engine receives them |
| Step-up route impossible to finish without Twilio: the code reached nobody | HIGH | Opt-in demo delivery writes it to the service log; off by default. Superseded 2026-09-26: codes are emailed, to a local inbox in the demo, and never logged |
| Every `docker compose up` redeployed the contract, stranding registered users | HIGH | Deployment reuses the recorded address when it still holds code |
| A chain restart left the orchestrator on a dead address, failing silently | MEDIUM | Start-up warning naming the address and the fix |
| The code screen claimed an SMS had been sent when none had | MEDIUM | The route reports the delivery channel and the screen says which |
| Old signature valid again after a newer login | CRITICAL | Nonce mapping per wallet and nonce |
| `registerUser()` registered the admin, not the customer | CRITICAL | Wallet parameter, admin-only |
| Anyone could forge login history through `/event` | CRITICAL | Shared token, constant-time compare |
| Retrying from a new device skipped the OTP | CRITICAL | Only verified sign-ins count as history |
| `/api/auth/nonce` bypassed scoring | CRITICAL | Endpoint removed |
| Orchestrator and risk engine reachable from the host | HIGH | Ports moved to the dev overlay |
| `/verify`, `/otp/verify` returned 501; `/register` saved nothing | HIGH | Implemented |
| Admin endpoints open to anyone | HIGH | Session + allow-list |
| Completed login recorded with an empty device | HIGH | Device carried with the challenge |
| Mis-checksummed wallet addresses gave 502 | HIGH | Addresses normalised before chain calls |
| Dashboard stylesheet 57 bytes (Tailwind 3 directives on Tailwind 4) | MEDIUM | Vite plugin wired |
| Raw request bodies (with OTP codes) logged | MEDIUM | Only the error type logged |
| `SESSION_TTL_MINUTES` empty → NaN | MEDIUM | Validated with defaults |
| Chunked bodies rejected by the proxy | MEDIUM | Transfer-Encoding removed when re-sending |
| `?n=0` returned every event | MEDIUM | Validated 1–100 |
| Demo scripts used invalid addresses | MEDIUM | Hardhat accounts, shared data |
| `VELOCITY_WINDOW_SECONDS` ignored | LOW | Read from the environment |
| Obsolete compose `version`, unused helpers | LOW | Removed |

## 9. Frontend improvements

The old app was one unstyled table. It is now two separated surfaces built to
the category standard, which the team chose in the Impeccable direction round
over two themed alternatives: a bank web-banking sign-in and a Stripe-grade
operations console. Details are in sections 16 and 17.

## 10. Backend improvements

Covered in sections 7 and 8. Errors follow the TRD envelope
`{ error: { code, message, request_id } }` everywhere, with the TRD catalogue of
codes and status numbers.

## 11. Database improvements

Eight migrations, applied at start-up and recorded, so a restart is a no-op.
Migration 007 moves the code step from a phone number to an email address and
008 indexes challenge expiry for the cleanup job.
Migration 006 is additive (`ADD COLUMN IF NOT EXISTS`), so it upgrades an
existing database in place, which was verified. Tokens and codes are stored only
as SHA-256 hashes. MongoDB indexes cover the scoring queries.

## 12. AI / risk engine improvements

Scoring rules and weights are unchanged (TRD §9.3). The fixes are to the evidence
the rules read: history now means completed sign-ins only, the velocity window is
configurable, and writes need the internal token. The auto-flag rule (three
blocked attempts in an hour) is unchanged and still drives the fraud ring.

## 13. Smart contract improvements

Replay protection and registration fixed, as in section 8. Tests cover
deployment, registration (valid, duplicate, zero address, non-admin, paused),
signatures (valid, reused, old-after-new, per-wallet, wrong signer, wrong nonce,
unregistered, paused then resumed), the breaker, Merkle roots and admin transfer.
The two original bugs were re-introduced one at a time to prove the tests catch
them.

## 14. Testing performed

| Check | Result |
|---|---|
| Gateway (Vitest) | PASS, 60 |
| Orchestrator (Vitest) | PASS, 165 |
| Risk engine (pytest) | PASS, 63 |
| Contracts (Hardhat) | PASS, 21 |
| Type-checks: gateway, orchestrator, web, scripts | PASS |
| Web production build | PASS |
| Docker build and start from `down -v` | PASS, all services healthy in about 20 s |
| Live login-flow script | PASS, 21 of 21 checks |
| Live breaker, audit and degradation script | PASS, 16 of 16 checks |
| Scenarios S1–S6 | PASS |
| Browser: registration, email-code step, signature, console, audit verify and tamper | PASS (MetaMask stood in for by a script that forwards to the Hardhat node's accounts) |
| Rate limiting | PASS, 429 on the 11th request |
| Step-up route end to end through the gateway | PASS, 9 of 9 checks |
| Email delivery to a local inbox (Mailpit) | PASS, including resend, expiry and a mail server outage |
| Email delivery to a real inbox | MANUAL, needs SMTP credentials |
| Real MetaMask extension | NOT RUN in this environment |

Mutation checks: re-introducing the replay bug, the registration bug, a disabled
nonce check, a removed admin guard and a removed header strip each makes the
relevant tests fail.

## 15. Design methods and tools used

| Method or tool | Used for |
|---|---|
| Impeccable design method | Product context, choosing a visual direction, the craft floor checklist, a mechanical design check, and an independent finish review |
| Emil Kowalski's design-engineering principles | Motion and interaction rules (section 17) |
| Playwright | Exact-size desktop (1440 px) and phone (390 px) captures, and the scripted browser walkthrough |
| Docker Compose, Hardhat, Vitest, Supertest, pytest | Builds, the running stack, and the test suites |

## 16. Impeccable application

- The team chose a direction on the decision page: the first roll, a bolder
  re-roll, then the category standard. The quality bar is Stripe Dashboard for
  the console and a bank's own web banking for the customer screens.
- Operate mode: a restrained palette of neutrals plus one bank indigo. The three
  score bands map to fixed state colours, and violet is reserved for
  "authentication paused" alone.
- The craft floor removed the icon-card grids, hero-metric tiles and eyebrow
  labels, and replaced emoji and glyph icons with an authored 16 px stroke set.
  It also sets tabular numerals for all data, and themes the selection colour,
  focus rings, caret and scrollbars.
- States: loading skeletons, empty states that say how to fill them, error
  notices that name the recovery, and disabled and busy buttons.
- Plain words on the customer side (NFR-07); technical terms only in the console.
- The detector found nothing. The independent finish review asked for fresh
  captures on one consistent dataset. That exposed a hidden table label pushing
  the phone layout sideways, which is now fixed.

## 17. Emil Kowalski skill application

- Buttons scale to 0.97 on press over 150 ms with a strong ease-out
  (`cubic-bezier(0.23, 1, 0.32, 1)`), and never for reduced-motion users.
- Only transform, opacity and colour are animated. There are no page-load
  sequences, because the console is used many times a day.
- New activity rows enter through `@starting-style` transitions rather than
  keyframes, so a burst of events (S5) retargets smoothly instead of restarting.
- Hover effects are gated to fine pointers (Tailwind 4 default), and every
  spinner and pulse stops under `prefers-reduced-motion`.
- Confirmations are inline, where the user is looking, not modals.

## 18. Security findings

- Fixed: the items marked CRITICAL and HIGH in section 8.
- No secret in the repository. `.env` is git-ignored; `.env.example` holds names
  only; the Postgres credentials in compose are environment variables with local
  demo defaults.
- The internal token is accepted as a service credential for admin routes only
  because the gateway strips that header from every client request (tested).
- Remaining: the demo database password (`authpass`) exists in earlier commits
  of this repository's history. It is a local-only default, and history was not
  rewritten.

## 19. Remaining issues

- Email to real inboxes needs SMTP credentials in `.env` (see `.env.example`).
  Without them the demo stack sends every code to Mailpit, a local inbox at
  http://localhost:8025. The code is random, stored only as a SHA-256 hash,
  expires in five minutes, allows three attempts, can be replaced at most every
  30 seconds and three times in all, and is never logged or returned by the API.
- Emailing the code changes the channel the PRD names for FR-11 and FR-21
  ("SMS through Twilio"). The change needs the supervisor's sign-off and an
  update to the PRD and TRD.
- The real MetaMask extension was not exercised here; the same message-signing
  call was, through the Hardhat node.
- Velocity counts every attempt from one address, and in the lab the browser,
  the seeder and the scripts all arrive from the one Docker address. The demo
  overlay raises `VELOCITY_THRESHOLD` from 5 to 20 and the gateway bucket from
  10 to 60 so a team rehearsing is not penalised; `docker-compose.yml` keeps the
  documented values. Past twenty attempts in five minutes the penalty still
  applies, which is correct behaviour but must be planned around.
- A blocked attempt flags its wallet, and because every local client shares one
  address the fraud graph can then link the demo wallet to that flag. Running
  scenario S3 or S4 before the customer steps can therefore block a sign-in that
  should have been routed to the code step. The demo order in the guide avoids
  this; reset with `docker compose down -v` between rehearsals.
- TRD endpoints `GET /api/risk/score/:wallet` and `GET /api/graph/threat` do
  not exist. The threat graph view is Phase 2.

## 20. Phase 2 roadmap

From `Phase2_Remaining_Work.md`, untouched by this work: Isolation Forest scorer;
score-explainability polish; 3D force-directed graph and cluster detail view;
sliding-window rate limiter; live min-heap for top-N; polished control room and
mass-attack alert UI; the animated Live Authentication Flow screen; audit-proof
UI polish; n8n workflows for the code email and admin alerts; the Flutter app and
`/api/mobile/*`; WebAuthn; attack simulator UI; haptics; integration and
Playwright E2E suites; CI; final report, paper and backup video.

## 21. Functional completion estimate

Method: each of the PRD's 29 functional requirements counts 1 when implemented
and verified end to end, 0.5 when partly working, 0 otherwise. Boilerplate, files
and documentation count nothing.

| Group | Requirements | Implemented | Partly | Not |
|---|---|---|---|---|
| Identity and registration | FR-01–04 | 4 | 0 | 0 |
| Login and signatures | FR-05–08 | 3 | 0 | 1 (FR-08 WebAuthn, Could) |
| Risk scoring | FR-09–13 | 4 | 1 (FR-11 code delivery) | 0 |
| Fraud graph | FR-14–16 | 2 | 1 (FR-16 cluster tag, no graph view) | 0 |
| Chain and audit | FR-17–19 | 3 | 0 | 0 |
| Automation | FR-20–22 | 0 | 2 (FR-21 delivery; FR-22 in-console alert only) | 1 (FR-20 n8n, Phase 2) |
| Dashboard | FR-23–25 | 0 | 1 (FR-24 sorted query) | 2 (FR-23 3D graph, Phase 2; FR-25, Could) |
| Mobile | FR-26–27 | 0 | 0 | 2 (Phase 2; FR-27, Could) |
| Domain additions | FR-28–29 | 1 (FR-29) | 0 | 1 (FR-28 live flow screen, Phase 2) |
| **Total** | **29** | **17** | **5** | **7** |

- All requirements: (17 + 2.5) / 29 = **67%**
- Excluding the three Could-priority items: 19.5 / 26 = **75%**
- Must-priority requirements: 18 of 21 = **86%** (FR-11 and FR-21 half each for
  delivery; FR-20 and FR-23 are Phase 2)
- Update 2026-09-26: the code is now emailed and verified end to end with a
  local mail server. FR-11 and FR-21 still count as partly done: the PRD names
  SMS, and the change of channel is not yet signed off.

The 50% bar is met by working features the demo shows live, not by counting files.

## 22. Reviewer demo procedure

See `REVIEWER_DEMO_GUIDE.md`: setup commands, MetaMask accounts, the preparation
that must happen five minutes ahead, the seven-step script, and what each step
proves.

## 23. Evidence of functionality

```bash
cd services/gateway && npm test
cd services/orchestrator && npm test
cd services/risk-engine && python -m pytest tests/
cd contracts && npx hardhat test
npm run typecheck
docker compose ps
npm run seed && npm run s1 && npm run s2 && npm run s3 && npm run s4 && npm run s5
# S5 leaves authentication paused. Resume it in the console, complete one
# sign-in, wait up to 60 s for the batch to seal, then:
npm run s6
```

Endpoints on the gateway: `POST /api/auth/register`, `POST /api/auth/login`,
`POST /api/auth/otp/verify`, `POST /api/auth/verify`, `POST /api/auth/logout`,
`GET /api/admin/attempts/top?n=`, `GET /api/admin/status`,
`POST /api/admin/pause`, `POST /api/admin/resume`, `GET /api/audit/events`,
`GET /api/audit/proof/:eventId`, `GET /api/audit/root/:batchId`.

Screens: http://localhost:5173 (customer), then **Open operations console** for
an administrator wallet.
