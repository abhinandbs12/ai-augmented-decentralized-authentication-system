# Task Plan — Sunny Singh

## Your branch: `sunny-dev`
## Your module: API Gateway, Backend Orchestrator, Login State Machine, OTP, Customer Frontend

Tell your AI coding agent at the start of every session: *"I'm working on the `sunny-dev` branch. Only touch files inside `services/gateway/`, `services/orchestrator/src/routes/`, `services/orchestrator/src/core/`, `services/orchestrator/src/ds/`, `services/orchestrator/src/otp/`, `services/orchestrator/src/realtime/`, `services/orchestrator/src/db/`, `services/orchestrator/migrations/`, and `apps/web/src/pages/{Vault,Login,Otp}.tsx`. Don't touch `services/orchestrator/src/audit/`, `services/orchestrator/src/chain/`, `services/risk-engine/`, or `contracts/`."*

---

## Folders and files you own

```
services/gateway/
├── src/index.ts
├── src/middleware/tokenBucket.ts       [DSA]
├── src/middleware/validate.ts
└── test/

services/orchestrator/
├── src/index.ts
├── src/routes/{auth.ts,admin.ts}
├── src/core/loginStateMachine.ts
├── src/ds/lruCache.ts                  [DSA]
├── src/otp/{generate.ts,verify.ts}
├── src/realtime/socket.ts
├── src/db/postgres.ts
├── migrations/00X_*.sql
└── test/

apps/web/src/pages/
├── Vault.tsx
├── Login.tsx
└── Otp.tsx
```

*(Note: for this 50% phase, the sliding-window middleware and the min-heap top-N ranking are cut — token bucket alone handles rate limiting, and the top-attempts endpoint just returns the N highest scores sorted directly from the database instead of maintaining a live heap. The admin pause/resume button UI is also cut — you build the backend route, but it's tested via API calls / Postman for this phase, not a polished frontend control.)*

---

## File-by-file breakdown

### `services/gateway/src/middleware/tokenBucket.ts` — rate limiting [DSA] (build this first, it's quick)

**Requirements:** capacity 10, refill 1 token/3s per source IP, applied to `/api/auth/*`, returns HTTP 429 when empty, O(1) per check.

**Agent prompt to use:**
> "In `services/gateway/src/middleware/tokenBucket.ts`, implement an Express middleware for token-bucket rate limiting. Keep an in-memory `Map<string, {tokens: number, lastRefill: number}>` keyed by source IP. Capacity 10, refill 1 token every 3 seconds (calculate elapsed time on each request rather than using a timer). If tokens available, decrement and call `next()`. If not, respond `429` with a JSON error body. Apply this only to routes matching `/api/auth/*`. Write a test that fires 15 rapid requests from the same IP and asserts the first 10 succeed and the rest get 429."

---

### `services/gateway/src/middleware/validate.ts` and `src/index.ts`

**Agent prompt to use:**
> "In `services/gateway/src/index.ts`, set up an Express app that mounts the token-bucket middleware (must run first, before validation — this is a stated security requirement), a basic JSON body validator middleware in `validate.ts` for the auth routes, and a proxy that forwards validated requests to the orchestrator service at `ORCHESTRATOR_URL` (env var). Add a `/health` endpoint."

---

### `services/orchestrator/src/core/loginStateMachine.ts` — the heart of your work

**Exact state machine to implement:**
```
IDLE → POST /api/auth/login (wallet, deviceFingerprint)
   ├─ session in LRU cache, not expired → SESSION_ACTIVE (return existing session)
   └─ no session → call risk engine (POST http://risk-engine/score)
        ├─ score >= 90 → CHALLENGE_ISSUED (issue nonce, return it)
        ├─ 50-89       → OTP_PENDING (return otp_challenge_id)
        └─ score < 50  → BLOCKED (log event, return blocked decision)

OTP_PENDING → POST /api/auth/otp/verify (otp_challenge_id, code)
   ├─ correct, not expired → CHALLENGE_ISSUED (issue nonce, return it)
   └─ wrong/expired/3 attempts used → BLOCKED

CHALLENGE_ISSUED → POST /api/auth/verify (wallet, nonce, signature)
   ├─ verifySignature() succeeds (Karthik's chain client) → SESSION_ACTIVE (issue token, queue event for audit)
   └─ invalid/replayed/paused → BLOCKED
```

**Critical rule:** login is **two separate calls** (`/login` then `/verify`), never one — the score must be computed *before* the signature challenge exists.

**Graceful degradation:** if the call to the risk engine times out at **800ms**, treat as medium risk (route to OTP). Never fail open.

**Agent prompt to use:**
> "In `services/orchestrator/src/core/loginStateMachine.ts`, implement the login state machine described [paste the diagram above]. Use an async function `handleLogin(wallet, deviceFingerprint)` that: checks the LRU cache for an existing session, and if absent, POSTs to the risk-engine's `/score` endpoint with an 800ms timeout (using `AbortController`). If the call times out or errors, treat the result as if score were 70 (medium band) rather than throwing. Branch on the score into the three paths described. Return a discriminated union type so callers can handle `{type: 'session', token}`, `{type: 'otp_required', challengeId}`, or `{type: 'blocked'}`. Write unit tests mocking the risk-engine call for all three score bands plus the timeout case."

---

### `services/orchestrator/src/ds/lruCache.ts` — session cache [DSA]

**Requirements:** hash map + doubly linked list, O(1) get/put, O(1) eviction of least-recently-used entry.

**Agent prompt to use:**
> "In `services/orchestrator/src/ds/lruCache.ts`, implement a generic `LRUCache<K, V>` class from scratch (do not use a library) using a `Map` combined with a manually maintained doubly linked list for O(1) least-recently-used eviction. Constructor takes a capacity. Methods: `get(key)` (returns value and marks as recently used, or undefined), `put(key, value)` (inserts/updates, evicts LRU entry if over capacity). Write unit tests: get/put basic correctness, eviction order when capacity is exceeded, and that `get` on an existing key updates its recency."

---

### `services/orchestrator/src/routes/auth.ts` — the API surface

**Endpoints to implement:**
- `POST /api/auth/register` — registers wallet on-chain (calls Karthik's `authRegistryClient.registerUser`) + creates off-chain profile row in Postgres
- `POST /api/auth/nonce` — issues a fresh single-use nonce, 5-minute TTL
- `POST /api/auth/login` — calls `loginStateMachine.handleLogin`
- `POST /api/auth/verify` — submits signed nonce, calls Karthik's `verifySignature`, creates session, queues event for Karthik's batcher
- `POST /api/auth/otp/verify` — verifies OTP via `otp/verify.ts`
- `POST /api/auth/logout` — removes session from LRU cache + Postgres

**Agent prompt to use:**
> "In `services/orchestrator/src/routes/auth.ts`, implement six Express route handlers for `/register`, `/nonce`, `/login`, `/verify`, `/otp/verify`, `/logout` as described [paste the endpoint list above]. `/register` calls `authRegistryClient.registerUser(wallet)` (imported from `../chain/authRegistryClient`, owned by a teammate — assume it exists with that signature) then inserts a row into the Postgres `users` table. `/verify` calls `authRegistryClient.verifySignature(wallet, nonce, signature)`, and on success creates a session token, stores it in both the LRU cache and Postgres `sessions` table, and calls `merkleBatcher.enqueue(event)` (imported from `../audit/batcher`, also a teammate's module) to queue the event for audit. Use proper HTTP status codes and the shared error envelope format for failures."

---

### `services/orchestrator/src/otp/generate.ts` and `verify.ts`

**Requirements:** 6-digit code, 5-minute TTL, 3 attempts max then challenge destroyed and attempt becomes blocked. **Store only a hash of the code, never the plaintext.** Call Twilio directly from here (no n8n workflow builder this phase).

**Agent prompt to use:**
> "In `services/orchestrator/src/otp/generate.ts`, write `generateOtp(wallet, phone) -> otpChallengeId` that creates a random 6-digit code, stores its SHA-256 hash plus a 5-minute expiry and attempt counter (starting at 0) in the Postgres `otp_challenges` table, and sends the plaintext code via Twilio's SMS API directly (using the `twilio` npm package, credentials from env vars `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`) — never log or store the plaintext code anywhere. In `verify.ts`, write `verifyOtp(otpChallengeId, code) -> boolean` that hashes the submitted code, compares to the stored hash, checks expiry, increments the attempt counter, and marks the challenge as used/blocked after 3 failed attempts. Write unit tests covering: correct code within TTL, expired code, wrong code under 3 attempts, wrong code on the 3rd attempt (should block)."

---

### `services/orchestrator/src/routes/admin.ts`

**Endpoints:** `POST /api/admin/pause`, `POST /api/admin/resume` (both call Karthik's chain client), `GET /api/admin/attempts/top` (for this phase: query Postgres/Mongo directly for the N highest trust scores among recent attempts, sorted — no min-heap needed).

Admin auth = wallet signature + an allow-list of admin wallet addresses in an env var — no separate password system.

**Agent prompt to use:**
> "In `services/orchestrator/src/routes/admin.ts`, implement an `requireAdmin` middleware that checks the session's associated wallet address against a comma-separated `ADMIN_WALLETS` env var allow-list, rejecting with 403 if not present. Then implement `POST /pause` and `POST /resume` calling `authRegistryClient.pauseAuth()` / `resumeAuth()`, and `GET /attempts/top?n=10` that queries the MongoDB `login_events` collection for the N most recent events sorted by trust score ascending (riskiest first) using a simple `.sort().limit()` query."

---

### `services/orchestrator/migrations/00X_*.sql`

**Tables needed:** `users`, `sessions`, `nonces`, `otp_challenges`.

**Agent prompt to use:**
> "Write plain SQL migration files (no ORM) in `services/orchestrator/migrations/` for four PostgreSQL tables: `users (id uuid PK, wallet_address text unique, display_name text, created_at timestamp, last_login_at timestamp)`, `sessions (id uuid PK, user_id uuid FK, session_token_hash text, trust_score int, issued_at timestamp, expires_at timestamp)`, `nonces (id uuid PK, wallet_address text, nonce_value text, used boolean default false, expires_at timestamp)`, `otp_challenges (id uuid PK, wallet_address text, code_hash text, attempts int default 0, expires_at timestamp, used boolean default false)`. One file per table, numbered in creation order."

---

### `services/orchestrator/src/realtime/socket.ts`

**Agent prompt to use:**
> "In `services/orchestrator/src/realtime/socket.ts`, set up a Socket.IO server attached to the Express HTTP server. Export an `emitLoginEvent(event)` function that other modules can call to push a login event to all connected admin dashboard clients on a `login:event` channel. Keep this simple — no rooms or auth needed for this phase, just a broadcast."

---

### `apps/web/src/pages/{Vault,Login,Otp}.tsx` — customer-facing screens

**Agent prompt to use:**
> "Create three React pages. `Vault.tsx`: a landing screen with a 'Connect Wallet' button that requests access to the browser's injected Ethereum wallet (window.ethereum), gets the address, and calls `POST /api/auth/register`. `Login.tsx`: after calling `POST /api/auth/login`, if the response is `challenge_issued`, prompt the wallet to sign the nonce (via ethers.js `signer.signMessage`) and call `POST /api/auth/verify`; if `otp_required`, redirect to the OTP screen; if `blocked`, show a plain error message. `Otp.tsx`: a six-digit code input that calls `POST /api/auth/otp/verify` and on success proceeds to the signature step. Keep styling minimal — functional over polished for this phase."

---

## Dependencies

**You need from Karthik (before you can finish):**
- Deployed contract address + `authRegistryClient` module with `registerUser`, `verifySignature`, `pauseAuth`, `resumeAuth` exported — you call these directly from your routes
- `merkleBatcher.enqueue(event)` available to call from `/verify`

**You need from Abhinand:**
- `POST /score` (his risk-engine endpoint) — agree on the exact request/response shape early, since your state machine calls it directly

**Karthik needs from you:**
- Routes scaffolded (`GET /api/audit/proof/:eventId`, `GET /api/audit/root/:batchId`, `GET /api/audit/events`, `POST /api/admin/tamper/:eventId`) so he can fill in the handler logic

**Abhinand needs from you:**
- `POST /api/auth/login` actually calling his scoring endpoint, so he can test his service against real traffic
- `GET /api/graph/threat` and `GET /api/admin/attempts/top` routes scaffolded for his dashboard page
