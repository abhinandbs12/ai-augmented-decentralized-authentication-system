# Reviewer Demo Guide

An 8–10 minute live demonstration of the Phase 1 system. Every number on screen
comes from the running services: the risk engine scores real attempts, the
contract on the local chain verifies real signatures, and the audit screen
recomputes real Merkle proofs in the browser.

## A. Demo objective

After the demo the panel should have seen, not been told, that:

1. There is no password anywhere. A customer signs in by approving a request in
   their wallet, and the contract verifies that signature.
2. Every attempt is scored 0–100 **before** any challenge exists, and the score
   alone decides the route: signature (90+), email code first (50–89), blocked (<50).
3. The score is explainable: each reason carries its penalty.
4. A fraud ring is detected through the graph, and a credential-stuffing burst
   trips the circuit breaker, which pauses every sign-in on the contract and
   ends every customer session.
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

Leave the SMTP values empty: every sign-in code then goes to Mailpit, a local
inbox at http://localhost:8025, and nothing leaves the machine. See
[What could go wrong](#g-what-could-go-wrong) for sending to real inboxes.

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

Open http://localhost:5173 for the bank, and http://localhost:8025 in a second
tab: that is the inbox where the sign-in codes arrive.

To reset to a clean state between rehearsals:

```bash
docker compose down -v
```

Then run the start commands again, including `npm run seed`. The local chain
lives in memory, so a reset also clears every on-chain registration.

After restarting Docker Desktop or the computer, no reset is needed: run the
`docker compose ... up -d --build` command again, without `npm run seed`. The
chain starts empty, and before accepting sign-ins the orchestrator gives it back
every registered customer and every anchored audit root from PostgreSQL. Its log
says "Rebuilt the chain state from PostgreSQL".

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
   and an email address (required), and choose **Connect wallet and open account**.
2. The "One more check" screen appears: the device is new. In the inbox tab
   (http://localhost:8025), open the newest email, "Your Demo Bank sign-in
   code", and read the six digits.
   Enter them, choose **Verify code** and approve in MetaMask. You land on
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
only port 3000 open to the network; the chain (8545) is bound to 127.0.0.1 for
MetaMask, and 3001 and 8001 exist only on 127.0.0.1 for the demo scripts.

### Step 2: A new device needs an email code (1.5 minutes)

1. **Open:** http://localhost:5173 in MetaMask **Account #1** (Asha).
2. **Click:** **Continue with wallet**.
3. **Happens:** the attempt is scored before anything is signed. It lands in the
   middle band, and the screen explains why in plain words: new device, new
   location.
4. **Input:** `000000`, then **Verify code**.
5. **Result:** "That code is not correct. You have 2 tries left."
6. **Read the real code.** Switch to the inbox tab: the email to
   asha.raghavan@example.com has just arrived. Show it, then enter its six
   digits and choose **Verify code**. The wallet is asked to approve, and the
   sign-in completes.
7. **Optional:** before entering the code, point at **Send a new code**: it
   counts down 30 seconds, and a new code makes the old one stop working.
8. **Proves:** score before challenge; the OTP step (6 digits, 5 minutes, three
   attempts, a new code at most every 30 seconds and three codes in all, stored
   only as a SHA-256 hash, destroyed after the third failure). The code is never
   returned by the API, never written to a log and never stored in plain text.

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
3. **Show:** Sign-in activity. Your own sign-in is at the top, and Asha's two
   sign-ins sit just below it: the email-code one (score 50) and the signature one
   (score 100), both **Signed in**. A step-up sign-in is a single row: the code
   and the signature belong to one attempt.
4. **Click:** Asha's wallet on the score-50 row. The panel shows the arithmetic
   (100 − 30 new device − 20 new IP = 50) and how far the attempt got: scored,
   email code then signature, verified on chain, sealed in a Merkle batch.
5. **Run:** `npm run s3` then `npm run s4`, and switch to **Riskiest first**.
6. **Result:** the lowest scores come first. Rahul's stolen-credential attempts
   (S3) and the mule wallets (S4) score below 50 and carry a cluster tag: the
   risk engine flags a wallet after three blocked attempts in an hour. The S4
   output shows the graph-proximity penalty on a mule's next attempt.
7. **Proves:** explainable scoring, the blocked band, and fraud-ring detection by
   bounded BFS over the wallet/IP/device graph.

### Step 5: The circuit breaker (1.5 minutes)

1. **Click:** **Controls**. The breaker meter reads 0.
2. **Run:** `npm run s5`. Eighty credential-stuffing attempts arrive in about two
   seconds.
3. **Result:** the meter jumps past 51 (it drains again as the 10-second window
   moves on), and the header badge turns violet: "Authentication paused". The
   contract transaction was sent by the orchestrator itself, which also ended
   every customer session; `docker compose logs orchestrator` shows how many.
4. **Show refusal:** open a new browser tab on http://localhost:5173, select
   **Account #1**, **Continue with wallet**, approve. The customer sees "Sign-ins
   are paused for a few minutes".
5. **Click:** back in the console, **Resume authentication**.
6. **Proves:** FR-19 and TC-05. The pause lives in the contract, so no sign-in
   route around it exists. Sessions already open end with it (TRD §11.3), while
   administrators stay signed in so that one of them can resume.

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

### Optional: a customer without a wallet (FR-01, 1 minute)

1. **Click:** **Sign out**, **Open an account**, then **No wallet? Create a key
   in this browser**.
2. **Input:** a name, an email address and a passphrase of at least 10
   characters, twice. Choose **Create key and open account**.
3. **Result:** "Your key is ready", with the new account's address and
   **Download backup file**. The key pair was made in this browser and is stored
   only encrypted with the passphrase; the backup is that encrypted file, which
   MetaMask can import.
4. **Click:** **Continue to sign in**. A new customer gets the email code step:
   read the code in the inbox tab and enter it. The browser key signs, and "You
   are signed in".
5. **Proves:** FR-01. The private key and the passphrase never leave the browser:
   the bank receives the address and a signature, exactly as with MetaMask.

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
| Fraud-ring detection (graph + bounded BFS) | Step 4: graph penalty in the S4 output; flagged wallets tagged in the console | 1 |
| Automatic circuit breaker, pause and resume | Step 5: `npm run s5`, customer refused, customer sessions ended, resume | 1 |
| Merkle audit trail and tamper detection | Step 6: verify, alter, verify | 1 |
| Key pair created in the browser (FR-01) | Optional step: create, back up, sign in | 1 |
| Replay rejection | Step 7: contract tests | 1 |

## F. Talking points

- "There is nothing to steal: the server stores a wallet address and hashes, never
  a password, a session token or a code."
- "We score before we challenge. A risky attempt is refused before the customer
  is ever asked to sign anything."
- "Every point lost has a reason you can read, and each reason has a fixed weight."
- "The pause lives in the smart contract, not in a server setting: every sign-in
  has to pass the contract's signature check, and that check refuses everything
  while the pause is on."
- "We only write one Merkle root per batch on chain, but any single record can
  still be proved, in logarithmic time, in the browser."
- "If the risk engine goes down, logins get harder, never easier: they fall back
  to the email-code band."

## G. What could go wrong

- **Velocity:** the rule counts attempts per source address, and in the lab the
  browser, the seeder and every script reach the gateway from the one Docker
  address. `docker-compose.dev.yml` therefore raises `VELOCITY_THRESHOLD` from
  the documented 5 to 20 for the demo stack, which leaves room for a team
  rehearsing while still catching S5. Past twenty attempts in five minutes every
  sign-in loses 25 points and can drop below the blocking line. For the same
  reason the lab gateway's token bucket is 60 requests, refilled one a second,
  instead of 10 refilled one every 3 seconds; `docker-compose.yml` keeps the
  documented values of both.
- **Email:** with the SMTP values empty, `docker-compose.dev.yml` sends every
  code to the local Mailpit inbox (http://localhost:8025); keep that tab open.
  To send codes to real inboxes instead, set `SMTP_HOST`, `SMTP_USER`,
  `SMTP_PASS` and `SMTP_FROM` in `.env` (Gmail needs an App Password, see
  `.env.example`) and set `DEMO_CUSTOMER_EMAIL` to your own address before
  `npm run seed`, so Asha's code reaches you. If the mail server does not answer
  within 3 seconds, the code screen says the email could not be sent and offers
  a new code. `docker-compose.yml` on its own, without SMTP settings, sends no
  code, and the screen says so. The sign-up form requires an email address.
- **Off-hours:** the seeded history is stamped at the hour you run `npm run seed`.
  A sign-in far outside that hour loses 10 points as "unusual time of day", which
  can move Step 2 from the email-code band to blocked. Seed on the day, during the
  preparation.
- **Sealing delay:** a record appears in the audit trail up to 60 seconds after
  the sign-in. Do Step 6 last, or wait.
- **Chain restart:** restarting Docker Desktop or the computer empties the
  chain while PostgreSQL keeps the profiles. Run the start command again: the
  contract is deployed again and the orchestrator re-registers every customer
  and re-anchors every audit root before accepting sign-ins. If only the chain
  container was restarted while the rest kept running, recreate the deployment
  and the orchestrator with the overlay:
  `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --force-recreate contract-deploy orchestrator`.
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
