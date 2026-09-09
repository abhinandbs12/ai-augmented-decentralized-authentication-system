# Task Plan — Karthik R Nair

## Your branch: `karthik-dev`
## Your module: Smart Contract, Merkle Audit Trail, Blockchain Client

Tell your AI coding agent at the start of every session: *"I'm working on the `karthik-dev` branch. Only touch files inside `contracts/`, `services/orchestrator/src/audit/`, `services/orchestrator/src/chain/`, and `apps/web/src/pages/admin/Audit.tsx`. Don't modify anything in `services/gateway`, `services/risk-engine`, or the orchestrator's routes/core files."*

---

## Folders and files you own

```
contracts/
├── contracts/AuthRegistry.sol
├── scripts/deploy.ts
├── test/authRegistry.test.ts
├── hardhat.config.ts
└── package.json

services/orchestrator/
├── src/audit/merkleTree.ts        [DSA]
├── src/audit/batcher.ts
└── src/chain/authRegistryClient.ts

apps/web/src/pages/admin/
└── Audit.tsx                      # minimal proof-verification page
```

*(Note: for this 50% phase, `Audit.tsx` is kept minimal — a dropdown to pick a past event, a "Verify" button, and a plain text result. No animation, no styling polish. The important part is that the verification logic is correct, not that the page looks good.)*

---

## File-by-file breakdown

### `contracts/contracts/AuthRegistry.sol` — the smart contract (build this first, it's Milestone M1 and blocks everyone)

**Requirements — exact function list:**

| Function | Access | Behavior |
|---|---|---|
| `registerUser()` | any address, once | Records caller as registered; reverts on second attempt |
| `verifySignature(wallet, nonce, sig)` | any address | Recovers signer via OpenZeppelin's `ECDSA` library; requires signer == wallet; rejects a nonce already used by that wallet; reverts while paused |
| `submitMerkleRoot(root)` | admin only | Appends to an append-only roots array; emits batch ID |
| `getMerkleRoot(batchId)` | any (view) | Returns the anchored root for a batch |
| `pauseAuth()` / `resumeAuth()` | admin only | Sets/clears the circuit-breaker flag checked before verification |
| `transferAdmin(newAdmin)` | admin only | Rejects the zero address |

Emit: `UserRegistered`, `LoginVerified`, `MerkleRootSubmitted`, `AuthPaused`, `AuthResumed`. Gate every admin function with one `onlyAdmin` modifier.

**Agent prompt to use:**
> "Write a Solidity 0.8.24 contract `AuthRegistry.sol` using OpenZeppelin Contracts 5's `ECDSA` library for signature recovery. Include: `registerUser()` (reverts if `msg.sender` already registered), `verifySignature(address wallet, uint256 nonce, bytes calldata sig)` (recovers signer from the Ethereum signed-message hash of `nonce`, requires it equals `wallet`, tracks used nonces per wallet in a mapping to reject replays, reverts if `paused`), `submitMerkleRoot(bytes32 root)` (onlyAdmin, appends to a `bytes32[] public merkleRoots` array, emits `MerkleRootSubmitted(uint256 batchId, bytes32 root)`), `getMerkleRoot(uint256 batchId)` (public view), `pauseAuth()`/`resumeAuth()` (onlyAdmin, toggle a `bool public paused`), `transferAdmin(address newAdmin)` (onlyAdmin, reverts on zero address). Add an `onlyAdmin` modifier and emit all five named events."

---

### `contracts/hardhat.config.ts` + `contracts/scripts/deploy.ts`

**Agent prompt to use:**
> "Set up a Hardhat 2.x project in `contracts/` with TypeScript, targeting Solidity 0.8.24, configured for a local network. Write `scripts/deploy.ts` that deploys `AuthRegistry.sol`, sets the deployer as admin, and prints the deployed contract address to the console in a clearly labeled line (`CONTRACT_ADDRESS=0x...`) so it can be copied into `.env` files."

---

### `contracts/test/authRegistry.test.ts` — contract tests (keep this focused, not exhaustive, for the 50% scope)

**Required cases only (don't over-build this):**
1. Registration succeeds once, reverts on second attempt
2. Valid signature verifies successfully
3. Replayed nonce is rejected
4. `pauseAuth()` blocks verification; `resumeAuth()` restores it
5. A non-admin calling an admin function reverts

**Agent prompt to use:**
> "Write Hardhat + Chai tests in `contracts/test/authRegistry.test.ts` for `AuthRegistry.sol` covering exactly these five cases: (1) registerUser succeeds once and reverts on a second call from the same address, (2) verifySignature succeeds for a correctly signed nonce, (3) verifySignature reverts when the same signature/nonce is submitted twice, (4) verifySignature reverts while paused and succeeds again after resumeAuth, (5) a non-admin address calling submitMerkleRoot or pauseAuth reverts. Use Hardhat's signer helpers to sign messages in the tests."

**Definition of done:** `npx hardhat test` passes; `npx hardhat run scripts/deploy.ts --network localhost` prints an address. **Do this first and push it — the whole team is blocked until this exists.**

---

### `services/orchestrator/src/audit/merkleTree.ts` — Merkle tree [DSA, your core contribution]

**Requirements:**
- Leaf hash: `keccak256(canonicalJson({eventId, wallet, ip, deviceFingerprint, trustScore, decision, timestamp}))` — field order fixed and documented, since the frontend will recompute this exact hash
- Build tree bottom-up, combine pairwise
- **Odd-node rule:** if a level has an odd count, promote the last node unchanged (never duplicate it)
- Proof generation for any leaf must run in O(log n)

**Agent prompt to use:**
> "In `services/orchestrator/src/audit/merkleTree.ts` (TypeScript), implement a `MerkleTree` class. Constructor takes an array of event objects. `leafHash(event)` computes `keccak256` (using ethers.js v6's `keccak256` and `toUtf8Bytes`) over a canonical JSON string with keys in this exact fixed order: `eventId, wallet, ip, deviceFingerprint, trustScore, decision, timestamp`. `buildTree()` combines leaf hashes pairwise up to a single root; if a level has an odd number of nodes, promote the last node unchanged to the next level instead of duplicating it. `getProof(leafIndex)` returns the sibling hash array needed to recompute the root for that leaf. `getRoot()` returns the current root. Write unit tests for: even leaf count, odd leaf count (verify promotion, not duplication), and that a generated proof correctly recomputes the root when combined with the leaf hash in order."

---

### `services/orchestrator/src/audit/batcher.ts`

**Requirements:**
- Flush when 16 events are queued OR 60 seconds have passed, whichever first
- On flush: build tree → call `submitMerkleRoot(root)` via the chain client → store `{batch_id, root, tx_hash}` → write `batch_id`, `leaf_hash`, `leaf_index` back onto each event in MongoDB

**Agent prompt to use:**
> "In `services/orchestrator/src/audit/batcher.ts`, implement a `MerkleBatcher` class that holds an in-memory queue of events. `enqueue(event)` adds an event and triggers a flush if the queue reaches 16 items. Also run a timer that flushes every 60 seconds regardless of queue size. `flush()` builds a `MerkleTree` from the queued events (using `merkleTree.ts`), calls `authRegistryClient.submitMerkleRoot(root)`, stores the resulting `{batchId, root, txHash}` via a passed-in Postgres client, and updates each event's MongoDB document with its `batchId`, `leafHash`, and `leafIndex`. Clear the queue after a successful flush."

---

### `services/orchestrator/src/chain/authRegistryClient.ts`

**Agent prompt to use:**
> "In `services/orchestrator/src/chain/authRegistryClient.ts`, create an `ethers.js v6` client wrapping `AuthRegistry.sol`. Use a `JsonRpcProvider` pointed at the local Hardhat RPC URL (from env var `RPC_URL`) and a `Wallet` signer from `ADMIN_PRIVATE_KEY` (env var). Load the contract ABI from the Hardhat artifacts. Export async functions: `registerUser(wallet)`, `verifySignature(wallet, nonce, signature)`, `submitMerkleRoot(root)`, `getMerkleRoot(batchId)`, `pauseAuth()`, `resumeAuth()`. Each should submit the transaction, wait for it to be mined, and return the transaction receipt or relevant return value."

---

### `apps/web/src/pages/admin/Audit.tsx` — minimal proof verification page

**Requirements (kept deliberately minimal for this phase):**
- A dropdown/list of recent login events
- A "Verify" button
- On click: call `GET /api/audit/proof/:eventId`, recompute the root client-side using the same hash logic as `merkleTree.ts`, call `GET /api/audit/root/:batchId`, compare, show plain text: "Record authentic and unaltered" or "Record has been altered"
- A basic admin-only button to tamper with one field of a stored event (for demonstrating TC-07 live) — this can be a plain button with no confirmation dialog or polish

**Agent prompt to use:**
> "Create a minimal React page `Audit.tsx`. Fetch a list of recent event IDs from `GET /api/audit/events` (a simple listing endpoint). Show them in a plain `<select>`. A 'Verify' button calls `GET /api/audit/proof/:eventId`, recomputes the Merkle root in the browser using the identical leaf-hash and odd-node-promotion logic as the backend `merkleTree.ts` (write this as a small shared TypeScript function, duplicated client-side since the frontend can't import backend code directly), fetches `GET /api/audit/root/:batchId`, compares the two roots, and displays plain text 'Record authentic and unaltered' (match) or 'Record has been altered' (mismatch). Add a second button 'Tamper with this event (demo)' that calls a `POST /api/admin/tamper/:eventId` endpoint to flip one field, so re-running Verify demonstrates detection. No styling required beyond basic readability."

---

## Dependencies

**You need from Sunny (before you can finish):**
- Confirmation of how events are handed to your batcher (`enqueue()` — is it called directly, or does Sunny publish to a queue you consume?) — agree the interface before building `batcher.ts`
- Routes `GET /api/audit/proof/:eventId`, `GET /api/audit/root/:batchId`, `GET /api/audit/events`, `POST /api/admin/tamper/:eventId` scaffolded in the orchestrator (empty handlers are fine — you fill in the logic that calls your modules)

**Sunny needs from you (before he can finish):**
- Deployed contract address — this unblocks his whole login-verification flow, so push this first
- `verifySignature()`, `pauseAuth()`, `resumeAuth()` working correctly — his state machine and admin routes call these directly

**Abhinand needs from you:**
- The exact field names/shape you write to MongoDB when a batch flushes (`batchId`, `leafHash`, `leafIndex`), since his graph-rebuild logic reads the same `login_events` collection
