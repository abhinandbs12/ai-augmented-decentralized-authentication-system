# Phase 2 — Remaining Work

Everything below is **not** part of the Phase 1 build. It's what's left once Phase 1 (registration, all three login paths, rule-based risk scoring, fraud graph + bounded BFS, Merkle audit trail, smart contract, basic dashboard table, gateway rate limiting) is working end-to-end.

This is organized by area, not by person — assign it out once Phase 1 is stable and you know who has bandwidth for what.

---

## 1. AI / Risk Scoring upgrades

- **Isolation Forest scorer** — train an unsupervised model (scikit-learn) on synthetic/self-generated login data as an upgrade path alongside the rule-based scorer. The rule-based scorer stays the default; this is opt-in, swappable behind the same `/score` interface (already designed to be pluggable — no interface changes needed).
- **Score explainability polish** — richer "contributing factors" output (currently just a list of penalty names; could show weighted contribution per factor for the dashboard).

## 2. Fraud graph & visualization upgrades

- **Full 2D or 3D force-directed graph** (`react-force-graph-3d` / Three.js) replacing the plain risk table from Phase 1 — visually renders wallet/IP/device nodes with flagged clusters color-coded and animated.
- **Cluster detail view** (`GET /api/graph/cluster/:id`) — clicking a flagged cluster shows its member wallets, shared device/IP, and detection reason.

## 3. Rate limiting completion

- **Sliding window middleware** — add alongside the Phase 1 token bucket for smoother burst-boundary handling (30 requests / 60s window).

## 4. Dashboard completion

- **Min-heap for top-N riskiest attempts** — replace Phase 1's simple sorted-query approach with an actual min-heap maintained live as events stream in (this is one of the project's stated DSA showcases — currently deferred to keep Phase 1 scope down).
- **Admin pause/resume UI polish** — a proper `Control.tsx` panel (Phase 1 only has the backend route, tested via API calls).
- **Mass-attack alert UI** — a visible banner/notification when the circuit breaker trips, instead of just a backend event.

## 5. Live Authentication Flow screen (FR-28)

A dedicated dashboard tab that animates a single login in real time as it happens: wallet connect → nonce issued → signing on device → risk scoring (score counting up with contributing factors appearing) → routing decision branching green/yellow/red → blockchain verification → session created with elapsed time → audit event added to the Merkle tree. Built on the same WebSocket event stream already set up in Phase 1 (`realtime/socket.ts`) — needs additional step-by-step event emission from the orchestrator plus a new animated frontend component (Framer Motion).

## 6. Audit Proof Verification polish (FR-29)

Phase 1 ships a minimal working version (dropdown + verify button + plain text result, plus a basic tamper button). Phase 2 polish:
- Proper UI showing the leaf hash and sibling path visually
- A clear pass/fail visual state (not just plain text)
- History of past verifications performed

## 7. Automation layer (n8n)

Phase 1 calls Twilio directly from backend code for simplicity. Phase 2 replaces this with the originally specified **n8n workflow engine**:
- Workflow 1 — OTP step-up: webhook → Twilio HTTP request → response
- Workflow 2 — Admin mass-attack alert: webhook → notification channel
- Rationale for doing this in Phase 2: makes the step-up/alerting policy editable without redeploying the orchestrator, as originally specified — not required to prove the core thesis in Phase 1.

## 8. Mobile companion app (Flutter) — entirely deferred from Phase 1

- `apps/mobile/lib/main.dart` — app shell
- `pending.dart` — polls `GET /api/mobile/pending/:wallet` every 3 seconds for a pending web login
- `biometric.dart` — device fingerprint/face confirmation
- `signer.dart` — signs the pending nonce with the secure-enclave key, submits via `POST /api/mobile/approve`
- Backend routes for this (`/api/mobile/pending/:wallet`, `/api/mobile/approve`) also need to be built — not present in Phase 1's route list

## 9. Stretch / Could-priority features (cut entirely from Phase 1, only attempt if Phase 2 has spare time)

- WebAuthn / passkey signing as an alternative to wallet-extension signing
- Attack Simulator panel in the UI (Phase 1's `scripts/attack-sim.ts` load-generator script already exists from testing — this would just wrap it in a UI button)
- Haptic / audio alerting on the admin dashboard and mobile app

## 10. Testing completion

Phase 1 covers unit tests for the core logic modules (scorer, BFS, LRU cache, Merkle tree, OTP, token bucket) and the seven defined test case scripts (TC-01–TC-07) run manually via the scenario scripts.

Phase 2 adds:
- **Integration tests** — full request chains across services (login → orchestrator → risk engine → blockchain client), not just unit-level
- **Security testing** — scripted replay-attack attempts, rate-limit bypass attempts, simulated credential-stuffing bursts against the running system
- **Usability testing** — an informal walkthrough with non-technical users validating that login and OTP flows feel fast and understandable
- **Requirements traceability matrix closure** — confirming all Must-priority FRs map to a passing test case, not just the ones exercised in Phase 1
- **One automated E2E test path** (Playwright) — a scripted browser test of the full happy-path login

## 11. Integration & DevOps completion

- Full `docker-compose.yml` bringing up every service (including n8n and the mobile-facing endpoints) with a single command
- Environment configuration finalized across all `.env.example` files
- Smoke-test script confirming a clean `docker compose up` works from a fresh clone
- CI pipeline (optional, Should-priority) — run unit tests automatically on PRs into `dev`

## 12. Documentation & final submission deliverables

- Final report write-up incorporating what was actually built vs. planned
- Paper draft/status (per departmental review schedule)
- Presentation deck update reflecting final implementation
- **Backup demonstration video** — a full recorded run of all three Trust Score paths, the fraud-ring cluster, the circuit breaker, and the audit proof verification, rehearsed on the fully local stack, in case the live demo fails on the day
- Requirements traceability matrix, finalized and included in the report
- Gap Analysis items G-01 (calendar alignment) and G-05 (missing PRD appendices) resolved with the faculty coordinator

## 13. Known limitations to carry forward honestly (not "fix", just documented)

These stay as stated limitations even after Phase 2 — do not attempt to solve them within this academic term:
- No production mainnet deployment (local Hardhat chain only, optional public testnet showcase is stretch)
- No zero-knowledge-proof selective disclosure
- No formal third-party smart contract security audit
- No account recovery mechanism if a customer loses their private key
- Isolation Forest (if built in Phase 2) trained on synthetic data only, no claim of real-fraud accuracy

---

## Suggested Phase 2 sequencing

1. Start with **testing completion (§10)** and **integration/DevOps (§11)** — these validate that Phase 1's actual output is solid before building more on top of it
2. Then **dashboard completion (§4)** and **Live Authentication Flow (§5)** — highest visual impact for the next review/demo
3. Then **automation layer (§7)** and **fraud graph visualization (§2)**
4. **Mobile app (§8)** and **stretch features (§9)** only if time remains — these are the first things to cut again if the schedule is tight, exactly as the original risk register recommends
5. **Documentation (§12)** runs continuously alongside all of the above, not as a final crunch step
