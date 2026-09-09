# Task Plan — Abhinand Baiju Smitha

## Your branch: `abhinand-dev`
## Your module: AI Risk Engine, Fraud Detection Graph, Data Layer (Mongo), Testing Coordination

Tell your AI coding agent at the start of every session: *"I'm working on the `abhinand-dev` branch. Only touch files inside `services/risk-engine/`, `apps/web/src/pages/admin/Attempts.tsx`, and `scripts/`. Don't modify anything in `services/gateway`, `services/orchestrator`, `contracts`, or `apps/mobile`."*

---

## Folders and files you own

```
services/risk-engine/
├── app/main.py
├── app/features.py
├── app/scorers/rules.py
├── app/graph/threat_graph.py      [DSA]
├── app/graph/bfs.py               [DSA]
├── app/geo.py
├── data/demo_geo_overrides.json
├── requirements.txt
└── tests/

apps/web/src/pages/admin/
└── Attempts.tsx                   # simple table of flagged clusters + top-risk attempts

scripts/
├── seed.ts                        # seed demo customers + a fraud ring
└── scenarios/{s1..s6}.ts          # scripted demo runs
```

*(Note: for this 50% phase, the full 2D/3D visual threat graph is cut. `Attempts.tsx` is a plain table — it shows risk scores and flags a cluster with a colored badge, nothing more visual than that. This keeps your frontend footprint small so you can focus on the actual scoring/graph logic, which is the real substance.)*

---

## File-by-file breakdown

### `app/main.py` — FastAPI entry point

**What it does:** Exposes one endpoint, `POST /score`. Takes a login's context, returns a Trust Score (0–100) and the list of penalties that were applied.

**Requirements:**
- Request body: `wallet`, `ip_address`, `device_fingerprint`, `timestamp`, and any recent behavioral history needed for velocity checks
- Response body: `trust_score` (int 0–100), `reasons` (array of strings, e.g. `["unrecognized_device", "graph_proximity_to_flagged"]`)
- Use Pydantic models for both — this gives you free validation and auto-generated docs

**Agent prompt to use:**
> "Create a FastAPI app in `services/risk-engine/app/main.py` with a single POST endpoint `/score`. Define Pydantic request model `LoginContext` with fields `wallet: str`, `ip_address: str`, `device_fingerprint: str`, `timestamp: datetime`. Define response model `ScoreResult` with `trust_score: int` and `reasons: list[str]`. The endpoint should call a `calculate_score(context)` function (to be implemented in `scorers/rules.py`) and return its result. Add a `/health` endpoint returning `{"status": "ok"}` for Docker healthchecks."

---

### `app/features.py` — feature extraction

**What it does:** Turns raw login context into the four signals the scorer needs.

**Requirements:**
- `is_unrecognized_device(wallet, device_fingerprint)` — check against known devices for this wallet in MongoDB
- `is_unrecognized_region(wallet, ip_address)` — check against known IP/region history
- `is_off_hours(wallet, timestamp)` — compare against this user's typical login hours
- `login_velocity(wallet, ip_address)` — count recent attempts in a short window

**Agent prompt to use:**
> "In `services/risk-engine/app/features.py`, write four pure functions: `is_unrecognized_device`, `is_unrecognized_region`, `is_off_hours`, `login_velocity`. Each takes the login context plus a MongoDB collection handle for `login_events`, queries recent history for that wallet, and returns a boolean (or int for velocity). Keep them independently testable — no global state, pass all dependencies as arguments."

---

### `app/scorers/rules.py` — the rule-based scorer (your core deliverable)

**What it does:** Starts at 100, subtracts weighted penalties, clamps to [0, 100].

**Exact weights (do not change these — they match the PRD):**
| Signal | Penalty |
|---|---|
| Unrecognized device | −30 |
| Unrecognized IP/region | −20 |
| Off-hours login | −10 |
| High login velocity | −25 |
| Close graph-distance to known bad actor | −35 |

Penalties are **additive**, and the final score is **clamped to [0, 100]** (never below 0, never above 100).

**Agent prompt to use:**
> "In `services/risk-engine/app/scorers/rules.py`, write `calculate_score(context, graph_distance) -> ScoreResult`. Start at 100. Apply these penalties if the corresponding feature function from `features.py` returns True: unrecognized device −30, unrecognized region −20, off-hours −10, high velocity −25. If `graph_distance` (passed in from the threat graph module) is within 3 hops of a flagged node, apply −35. Clamp the result to the range [0, 100]. Return a `ScoreResult` listing which penalties actually applied. Write this as a pure function with no side effects so it's easy to unit test."

---

### `app/graph/threat_graph.py` — the fraud graph [DSA]

**What it does:** An adjacency-list graph where nodes are wallets, IPs, and device fingerprints. On every login, add/update edges connecting the wallet to the IP and device it used.

**Requirements:**
- Must be rebuildable from MongoDB on service startup (never the only copy of this data — if the service restarts, it reconstructs the graph from `login_events`)
- "Known bad actor" node = admin-flagged, or 3+ blocked attempts within 1 hour (this definition must match what gets written to `fraud_flags` — confirm the exact field names with Sunny, since his orchestrator is what writes block decisions)

**Agent prompt to use:**
> "In `services/risk-engine/app/graph/threat_graph.py`, implement an adjacency-list graph class `ThreatGraph` with methods `add_login(wallet, ip, device)` (adds nodes and edges between them), `mark_bad_actor(node_id)`, `rebuild_from_mongo(login_events_collection, fraud_flags_collection)` (reconstructs the whole graph from stored history on startup), and `nearest_bad_actor_distance(start_node, max_hops=3)`. Keep the graph in memory as a Python dict of adjacency lists."

---

### `app/graph/bfs.py` — bounded breadth-first search [DSA]

**What it does:** From a new login's wallet node, search up to 3 hops outward for the nearest flagged bad actor. Feeds the −35 penalty in the scorer.

**Agent prompt to use:**
> "In `services/risk-engine/app/graph/bfs.py`, implement `bounded_bfs(graph, start_node, max_hops=3) -> int | None` that performs a breadth-first search from `start_node` over the `ThreatGraph` adjacency structure, stopping at `max_hops`, and returns the distance in hops to the nearest node flagged as a bad actor, or `None` if none is found within the bound. Write unit tests covering: (1) a bad actor at distance 1, (2) a bad actor at distance 3 (edge of the bound), (3) a bad actor at distance 4 (should return None), (4) no bad actor anywhere in the graph."

---

### `app/geo.py` — offline geolocation

**What it does:** Looks up rough location from an IP without calling the internet (the whole demo must run offline).

**Agent prompt to use:**
> "In `services/risk-engine/app/geo.py`, write `lookup_region(ip_address) -> str`. First check `data/demo_geo_overrides.json` (a simple `{ip: region}` dict) for a hardcoded demo mapping. If not found, return `'unknown'`. Do not make any network calls. Treat `'unknown'` as a mild risk signal in the caller, not an error."

---

### `apps/web/src/pages/admin/Attempts.tsx` — simple risk table

**What it does:** Fetches recent login attempts from the orchestrator and shows them in a plain table, sorted by risk (highest first), with flagged-cluster rows highlighted.

**Agent prompt to use:**
> "Create a React component `Attempts.tsx` that calls `GET /api/admin/attempts/top` and renders a table with columns: wallet (truncated), trust score, decision (allow/otp/blocked), and a 'flagged cluster' badge if the wallet belongs to a fraud cluster. Sort by trust score ascending (riskiest first). Use Tailwind for styling, no charting library needed — this is a plain HTML table."

---

### `scripts/seed.ts` and `scripts/scenarios/s1..s6.ts` — demo data and scripted runs

**What it does:** Seeds a handful of realistic customers plus one deliberate fraud ring (3–4 wallets sharing a device/IP), and provides one script per demoable scenario (S1–S6 from the PRD) so anyone on the team can trigger a clean demo without manually clicking through the UI.

**Agent prompt to use:**
> "Write a TypeScript script `scripts/seed.ts` that inserts sample data via the orchestrator's API: 5 normal registered wallets with login history, and one fraud ring of 3 wallets that all share the same device fingerprint and IP. Then write `scripts/scenarios/s1.ts` through `s6.ts`, one script per scenario: S1 = genuine login usual device (expect allow), S2 = genuine login new device (expect OTP), S3 = stolen-credential pattern (expect block), S4 = trigger the fraud ring detection, S5 = fire 50+ rapid login attempts to trip the circuit breaker, S6 = fetch and verify a Merkle proof for a past event. Each script should print a clear pass/fail line."

---

## Testing responsibilities (yours, across the whole system)

You coordinate the seven test cases even where they touch other people's code, since you own the overall testing story:

| Test | What it proves | Mostly exercises |
|---|---|---|
| TC-01 | Valid signature, fresh nonce → session created | Sunny + Karthik |
| TC-02 | Replayed signature → rejected | Karthik |
| TC-03 | Token bucket exceeded → HTTP 429 | Sunny |
| TC-04 | New device, existing wallet → medium band, OTP requested | You + Sunny |
| TC-05 | 50+ anomalous logins in 10s → circuit breaker trips | You + Sunny + Karthik |
| TC-06 | Merkle proof for known event → verifies | Karthik |
| TC-07 | Tampered event → proof verification fails | Karthik |

**Agent prompt to use for the pytest suite:**
> "In `services/risk-engine/tests/`, write pytest tests: `test_rules.py` covering every penalty combination in the scorer (single penalty, multiple penalties, clamping at 0), `test_graph.py` covering the BFS distance function with the four cases listed above, and `test_features.py` mocking a MongoDB collection to test each feature-extraction function in isolation."

---

## Dependencies

**You need from Sunny (before you can finish):**
- The exact field names the orchestrator writes to `login_events` and `fraud_flags` in MongoDB, so your graph rebuild reads the same schema
- Confirmation that `POST /score` is the agreed contract shape before he wires his orchestrator to call it

**Sunny needs from you (before he can finish):**
- `POST /score` working and returning a valid `trust_score` — his login state machine's routing logic depends on this
- The graph-distance value included in your score response, so the fraud-ring scenario (S4) works end-to-end
