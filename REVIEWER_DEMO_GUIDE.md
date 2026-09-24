# Reviewer Demo Guide

A 8–10 minute live demonstration of the Phase 1 system. Every number on screen
comes from the running services: the risk engine scores real attempts, the
contract on the local chain verifies real signatures, and the audit screen
recomputes real Merkle proofs in the browser.

## A. Demo objective

After the demo the panel should have seen, not been told, that:

1. There is no password anywhere. A customer signs in by approving a request in
   their wallet, and the contract verifies that signature.
2. Every attempt is scored 0–100 **before** any challenge exists, and the score
   alone decides the route: signature (90+), SMS code first (50–89), blocked (<50).
3. The score is explainable: each reason carries its penalty.
4. A fraud ring is detected through the graph, and a credential-stuffing burst
   trips the circuit breaker, which pauses every sign-in on the contract.
5. A completed sign-in is sealed in a Merkle batch anchored on chain; the browser
   proves the record authentic, then detects it after it is altered.

## B. Starting the system

One-time setup, from the repository root:

```bash
cp .env.example .env
```

In `.env`, set:

- `ADMIN_WALLETS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` (Hardhat account #0)
- `INTERNAL_API_TOKEN=` any long random value

Leave the Twilio values empty; see [Remaining risks](#g-what-could-go-wrong).

Start everything. The development overlay also publishes the orchestrator and
risk engine on 127.0.0.1, which the demo scripts need:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
npm install
npm run seed
```

Start the web app in a second terminal:

```bash
cd apps/web
npm install
npm run dev
```

Open http://localhost:5173.

To reset to a clean state between rehearsals:

```bash
docker compose down -v
```

Then run the start commands again. The local chain lives in memory, so a reset
also clears every on-chain registration.

## C. Demo accounts

The demo uses Hardhat's public development accounts. They exist only on the
local chain and must never be used on a real network.

1. In MetaMask, add a network: RPC URL `http://127.0.0.1:8545`, chain ID
   `31337`, currency `ETH`.
2. Print the accounts and their keys with `docker compose logs hardhat`, then
   import two of them into MetaMask:
   - **Account #0** `0xf39F…2266`: the administrator (it deployed the contract
     and is in `ADMIN_WALLETS`).
   - **Account #1** `0x7099…79C8`: the demo customer "Asha Raghavan", created by
     `npm run seed`.

No key is stored in this repository or in the demo guide.

### Preparation: at least 5 minutes before the panel arrives

The risk engine penalises five or more attempts from one address inside five
minutes (the velocity rule). The browser always reaches the gateway from the
same address, so finish this preparation five minutes early.

1. In MetaMask, select **Account #0**. Choose **Open an account**, enter a name
   and a mobile number, and choose **Connect wallet and open account**.
2. The "One more check" screen appears: the device is new. Read the code:
   ```bash
   docker compose logs orchestrator | grep "DEMO DELIVERY" | tail -1
   ```
   Enter it, choose **Verify code** and approve in MetaMask. You land on
   "You are signed in" with **Open operations console** below.
3. Sign out. That completed sign-in is now trusted history, so the next one
   from this browser goes straight to the signature.

## D. Step-by-step demo (about 8 minutes)

### Step 1: The architecture (1 minute)

**Open:** this guide's [architecture diagram](#architecture).
**Say:** the browser only reaches the gateway, which rate-limits and validates.
The orchestrator runs the login state machine, asks the risk engine for a score,
and verifies signatures on the contract.
**Proves:** the gateway is the single public entry. `docker compose ps` shows
only ports 3000 and 8545 published; 3001 and 8001 exist only on 127.0.0.1 for
the demo scripts.

### Step 2: A new device needs an SMS code (1.5 minutes)

1. **Open:** http://localhost:5173 in MetaMask **Account #1** (Asha).
2. **Click:** **Continue with wallet**.
3. **Happens:** the attempt is scored before anything is signed. It lands in the
   middle band, and the screen explains why in plain words: new device, new
   location.
4. **Input:** `000000`, then **Verify code**.
5. **Result:** "That code is not correct. You have 2 tries left."
6. **Read the real code.** The screen says plainly that no SMS provider is
   configured and that the code went to the service log. In a terminal:
   ```bash
   docker compose logs orchestrator | grep "DEMO DELIVERY" | tail -1
   ```
   Enter those six digits and choose **Verify code**. The wallet is asked to
   approve, and the sign-in completes.
7. **Proves:** score before challenge; the OTP step (6 digits, 5 minutes, three
   attempts, stored only as a SHA-256 hash, destroyed after the third failure).
   The code is never returned by the API and never stored in plain text: demo
   delivery only writes it to the log, and `OTP_DEMO_DELIVERY` turns that off.

### Step 3: A familiar device goes straight to the signature (1 minute)

1. **Click:** **Sign out**, then **Continue with wallet** again as Asha, and
   approve in MetaMask.
2. **Result:** no code this time. "You are signed in", Score 100 / 100, all
   five checks green, and "The bank's security ledger confirmed your approval".
3. **Say:** the sign-in completed in Step 2 is now trusted history. The same
   device and network are recognised, so the score reaches the top band.
4. **Proves:** the high-trust path, that verified sign-ins build trust (only
   verified ones count, so retrying cannot fake familiarity), signature
   verification by the smart contract, and a 30-minute revocable session.

### Step 4: The operations console (2 minutes)

1. **Click:** **Sign out**. In MetaMask select **Account #0**, then **Continue
   with wallet** and approve.
2. **Click:** **Open operations console**.
3. **Show:** Sign-in activity. Asha's two attempts sit at the top: the SMS-code
   attempt (score 50, not completed) and the completed signature (score 100,
   signed in).
4. **Click:** Asha's wallet on the score-50 row. The panel shows the arithmetic
   (100 − 30 new device − 20 new IP = 50) and how far the attempt got.
5. **Run:** `npm run s3` then `npm run s4`, and switch to **Riskiest first**.
6. **Result:** the stolen-credential attempt scores below 50, and the mule
   wallets carry a fraud-cluster tag.
7. **Proves:** explainable scoring, the blocked band, and fraud-ring detection by
   bounded BFS over the wallet/IP/device graph.

### Step 5: The circuit breaker (1.5 minutes)

1. **Click:** **Controls**. The breaker meter reads 0.
2. **Run:** `npm run s5`. Sixty credential-stuffing attempts arrive in about two
   seconds.
3. **Result:** the meter fills, and the header badge turns violet: "Authentication
   paused". The contract transaction was sent by the orchestrator itself.
4. **Show refusal:** open a new browser tab on http://localhost:5173, select
   **Account #1**, **Continue with wallet**, approve. The customer sees "Sign-ins
   are paused for a few minutes".
5. **Click:** back in the console, **Resume authentication**.
6. **Proves:** FR-19 and TC-05. The pause lives in the contract, so no route
   around it exists.

### Step 6: The audit trail (1 minute)

1. **Click:** **Audit trail**. Asha's completed sign-in is sealed. Batches close
   every 16 records or 60 seconds.
2. **Click:** **Verify**.
3. **Result:** "Authentic and unaltered", with three checks: the record hashed in
   the browser, the proof walked to a root, and the root read from the contract.
4. **Click:** **Simulate tampering**, then **Alter the record**.
5. **Result:** "This record has been altered". The stored record no longer
   reaches the anchored root, and the on-chain root has not changed.
6. **Proves:** FR-17, FR-18, FR-29, TC-06 and TC-07.

### Step 7: Evidence and roadmap (1 minute)

```bash
cd contracts
npx hardhat test
```

21 passing, including "rejects an old nonce after a newer login" (replay,
TC-02). Close with the Phase 2 list in the completion report.

## E. What the demo proves

| Demonstrated functionality | Working evidence | Phase |
|---|---|---|
| Passwordless registration, on chain and off chain | Step 2: account created, `registerUser` transaction | 1 |
| Score before challenge, three routes | Steps 2, 3, 4: live scores 50, 100, below 50 | 1 |
| Explainable risk factors | Step 4: penalty arithmetic per attempt | 1 |
| OTP step-up limits | Step 2: attempts counted down | 1 |
| On-chain signature verification and session | Step 3: signed in, session expiry | 1 |
| Fraud-ring detection (graph + bounded BFS) | Step 4: cluster tag after `npm run s4` | 1 |
| Automatic circuit breaker, pause and resume | Step 5: `npm run s5`, customer refused, resume | 1 |
| Merkle audit trail and tamper detection | Step 6: verify, alter, verify | 1 |
| Replay rejection | Step 7: contract tests | 1 |

## F. Talking points

- "There is nothing to steal: the server stores a wallet address and hashes, never
  a password, a session token or a code."
- "We score before we challenge. A risky attempt is refused before the customer
  is ever asked to sign anything."
- "Every point lost has a reason you can read, and each reason has a fixed weight."
- "The pause switch lives in the smart contract, so even a compromised server
  cannot let a login through while it is on."
- "We only write one Merkle root per batch on chain, but any single record can
  still be proved, in logarithmic time, in the browser."
- "If the risk engine goes down, logins get harder, never easier: they fall back
  to the SMS-code band."

## G. What could go wrong

- **Velocity:** the rule counts attempts per source address, and in the lab the
  browser, the seeder and every script reach the gateway from the one Docker
  address. `docker-compose.dev.yml` therefore raises `VELOCITY_THRESHOLD` from
  the documented 5 to 10 for the demo stack, which leaves room for a
  demonstration while still catching S5. Even so, keep live sign-ins to the ones
  in this guide: past ten attempts in five minutes, every sign-in loses 25
  points and can drop below the blocking line.
- **No SMS:** no Twilio credentials are configured, so nothing is sent by text
  message. `docker-compose.dev.yml` sets `OTP_DEMO_DELIVERY=true`, which writes
  the code to the orchestrator's log for the demonstration; the code screen says
  so on screen. `docker-compose.yml` on its own writes no code anywhere, and the
  step-up route then cannot be completed by hand.
- **Off-hours:** the seeded history is stamped at the hour you run `npm run seed`.
  A sign-in far outside that hour loses 10 points as "unusual time of day", which
  can move Step 2 from the SMS-code band to blocked. Seed on the day, during the
  preparation.
- **Sealing delay:** a record appears in the audit trail up to 60 seconds after
  the sign-in. Do Step 6 last, or wait.
- **Chain reset:** restarting the `hardhat` container clears on-chain
  registrations while PostgreSQL keeps the profiles. Reset the whole stack with
  `docker compose down -v`, never the chain alone. If the chain is restarted on
  its own, the orchestrator prints a warning that no contract is deployed at the
  address it holds; recreate it with
  `docker compose up -d --force-recreate orchestrator`.
- **MetaMask network:** if MetaMask is on another network, the signature still
  works (it is a plain message signature), but select "Hardhat local" to avoid
  confusion.

## Architecture

```text
                 Browser (React, MetaMask)
                          │  HTTPS /api, WebSocket /socket.io
                          ▼
                 ┌──────────────────┐   token bucket, zod validation,
                 │  Gateway :3000   │   request ids, strips internal headers
                 └────────┬─────────┘
                          ▼
                 ┌──────────────────┐   login state machine, sessions (LRU),
                 │  Orchestrator    │   nonces, OTP, circuit breaker,
                 │  (internal)      │   Merkle batcher, Socket.IO
                 └──┬─────┬──────┬──┘
        score/event │     │      │ ethers.js
                    ▼     │      ▼
       ┌─────────────────┐│ ┌─────────────────────┐
       │  Risk engine    ││ │ AuthRegistry.sol on │
       │  FastAPI rules, ││ │ Hardhat :8545       │
       │  graph + BFS    ││ │ register, verify,   │
       └────────┬────────┘│ │ pause, Merkle roots │
                ▼         ▼ └─────────────────────┘
          MongoDB      PostgreSQL
       login_events,   users, sessions, nonces,
       fraud_flags     otp_challenges, audit batches
```
