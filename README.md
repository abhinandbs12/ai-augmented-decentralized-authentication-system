<div align="center">

# AI-Augmented Decentralized Authentication System
### *for Fraud-Resistant Identity Verification*

**An AI-Enhanced, Fraud-Resistant Decentralized Authentication Ecosystem**

[![Status](https://img.shields.io/badge/status-academic%20project-blue)]()
[![License](https://img.shields.io/badge/license-MIT-green)]()
[![Solidity](https://img.shields.io/badge/Solidity-%5E0.8.20-363636?logo=solidity)]()
[![Node.js](https://img.shields.io/badge/Node.js-Express-339933?logo=node.js&logoColor=white)]()
[![Python](https://img.shields.io/badge/Python-FastAPI-3776AB?logo=python&logoColor=white)]()
[![React](https://img.shields.io/badge/React-Three.js-61DAFB?logo=react&logoColor=black)]()
[![Flutter](https://img.shields.io/badge/Flutter-Mobile-02569B?logo=flutter&logoColor=white)]()
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)]()

**Final Year Project -- Department of Computer Science & Engineering**

</div>

---

## Table of Contents

- [Overview](#overview)
- [Why This Project Matters](#why-this-project-matters)
- [The Problem](#the-problem)
- [Key Features](#key-features)
- [System Architecture](#system-architecture)
- [Tech Stack](#tech-stack)
- [Login Flow](#login-flow)
- [AI Risk Engine](#ai-risk-engine)
- [Data Structures and Algorithms](#data-structures-and-algorithms)
- [Smart Contract](#smart-contract)
- [API Reference](#api-reference)
- [Data Model](#data-model)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Testing](#testing)
- [Security Considerations](#security-considerations)
- [Success Metrics and KPIs](#success-metrics-and-kpis)
- [Roadmap and Future Enhancements](#roadmap-and-future-enhancements)
- [Competitive Analysis](#competitive-and-alternative-approaches)
- [Team](#team)
- [References](#references)
- [License](#license)

---

## Overview

Password-based authentication remains one of the most exploited attack surfaces on the web. Centralized credential stores are a single point of failure, every login receives identical scrutiny regardless of actual risk, and conventional audit logs can be silently altered after the fact.

This project replaces passwords entirely with **blockchain-anchored cryptographic identity**. Users authenticate by signing a one-time challenge with a private key that never leaves their device; a smart contract verifies that signature on-chain. Layered on top is an **AI Risk Engine** that scores every login attempt in real time and decides how much friction is warranted — none, an SMS one-time-passcode, or an outright block — plus a **graph-based fraud detection module** that traces relationships between wallets, IPs, and devices to catch coordinated fraud rings, not just individual bad actors.

Classic data structures and algorithms — a **Merkle tree** for tamper-evident audit batching, an **LRU cache** for O(1) session validation, a **token bucket** for rate limiting, and a **min-heap** for risk-ranked triage — keep the system efficient enough for real deployment rather than remaining a toy demo.

> **The result:** more secure than passwords (nothing secret is ever transmitted or stored server-side), more adaptive than static authentication (friction scales with measured risk), and more auditable than conventional logging (a blockchain-anchored Merkle root makes tampering with historical records cryptographically detectable).

---

## Why This Project Matters

- Aligns with the **Zero Trust** security model adopted across the industry
- Sits inside the **passwordless authentication** trend led by Google, Apple, and Microsoft (passkeys)
- Applies core CS theory — graphs, trees, hashing, caching, rate limiting — to a real engineering problem, not as an academic exercise in isolation
- Spans the full stack: frontend, backend, blockchain, applied AI, DevOps, and workflow automation

---

## The Problem

| # | Problem | Consequence |
|---|---------|--------------|
| **P1** | Centralized credential storage | A single breach exposes all user accounts; the database is the highest-value attack target |
| **P2** | Uniform verification friction | Low-risk and high-risk logins are treated identically, hurting either security or usability |
| **P3** | Non-verifiable audit history | Login records in a conventional DB can be silently altered or deleted by an admin/attacker |
| **P4** | No behavioral context | Systems check "is the password correct," not "does this login look like the real user" |
| **P5** | Poor fraud-ring detection | Coordinated attacks using many linked accounts/devices typically go unnoticed |

**Formal problem statement:** *Design and implement a decentralized authentication system that eliminates centralized password storage, verifies user identity through blockchain-anchored cryptographic signatures, adaptively adjusts verification friction using real-time AI-driven risk scoring, and maintains a tamper-evident audit trail of all authentication activity — while remaining efficient enough for practical deployment.*

---

## Key Features

- **Passwordless, wallet-based identity** — register and log in via a public/private key pair (MetaMask / WalletConnect), with optional WebAuthn/passkey support
- **Real-time AI Trust Scoring (0-100)** — every login is scored and routed: allow / OTP step-up / block
- **Graph-based fraud ring detection** — bounded BFS across a wallet/IP/device adjacency graph flags coordinated attacks
- **Blockchain-anchored audit trail** — Merkle-batched login events with on-chain roots and per-event proofs
- **Circuit breaker** — an emergency `pauseAuth()` halts all authentication system-wide during a detected mass attack
- **Live 3D threat graph** — React + Three.js force-directed visualization of login activity and flagged clusters
- **Mobile biometric approval** — Flutter companion app for FaceID/fingerprint login approval
- **Automated step-up verification** — n8n + Twilio workflow for SMS OTP and admin alerting
- **One-command local deployment** — full stack via Docker Compose

---

## System Architecture

The system follows a **layered, service-oriented architecture**. A client layer (web + mobile) talks to a backend orchestrator over HTTPS/WebSocket, which coordinates three peer services — the AI risk engine, the blockchain client, and the automation layer — while structured and unstructured data are split across two purpose-fit databases.

| Layer | Responsibility |
|-------|-----------------|
| **Client Layer** | React web app (3D vault UI, wallet connect) + Flutter mobile app (biometric approval) |
| **API Gateway** | Express.js gateway — token-bucket rate limiting and request validation |
| **Backend Orchestrator** | Node.js service coordinating cache, AI calls, blockchain calls, and event queueing |
| **AI Risk Engine** | Python/FastAPI service computing Trust Score and running graph-based fraud analysis |
| **Blockchain Layer** | Solidity smart contract — registration, signature verification, Merkle anchoring, pause |
| **Automation Layer** | n8n workflows triggering Twilio SMS OTP and admin alerts |
| **Data Layer** | Supabase (structured profiles) + MongoDB (unstructured behavioral telemetry) |
| **Visualization Layer** | React + Three.js live 3D threat graph and admin dashboard |

All backend services are containerized and orchestrated via **Docker Compose**, so the entire stack starts with a single command. Client apps run outside the container boundary since they execute on the user's own device.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Web Frontend | React, Three.js / WebGL |
| Mobile Frontend | Flutter |
| Backend Orchestrator | Node.js, Express.js |
| AI Risk Engine | Python, FastAPI, scikit-learn (Isolation Forest) |
| Blockchain | Solidity, Hardhat, ethers.js |
| Structured Database | Supabase (PostgreSQL) with Edge Functions |
| Unstructured Database | MongoDB |
| Automation | n8n |
| Messaging / OTP | Twilio |
| Containerization | Docker, Docker Compose |
| Version Control / PM | GitHub, GitHub Projects |

---

## Login Flow

```
Client                Gateway            Orchestrator          AI Engine        Smart Contract
  |  1. Login request     |                    |                    |                  |
  |---------------------->                     |                    |                  |
  |                       | 2. Token bucket    |                    |                  |
  |                       |    check           |                    |                  |
  |                       |------------------->                     |                  |
  |                       |                    | 3. LRU cache check |                  |
  |                       |                    | 4. Update threat   |                  |
  |                       |                    |    graph           |                  |
  |                       |                    |------------------->  5. Score + BFS   |
  |                       |                    <-------------------|  6. Trust Score   |
  |                       |                    |                    |                  |
  |                       |        7. Route: high / medium (OTP) / low (block)         |
  |  8. Sign nonce        |                    |                    |                  |
  <-----------------------+--------------------|                    |                  |
  |---------------------------------------------------------------------------->      |
  |                       |                    | 9. verifySignature()                  |
  |                       |                    | 10. Create + cache session            |
  |                       |                    | 11. Queue event for Merkle batching   |
  |                       |                    | 12. Push update -> 3D threat graph    |
```

**Circuit Breaker:** if anomalous logins within a rolling window exceed a configured threshold, the Orchestrator calls `pauseAuth()`, all further logins are rejected regardless of Trust Score, and an admin alert is dispatched — until an administrator explicitly resumes the system.

---

## AI Risk Engine

### Feature Extraction

| Feature | Description |
|---------|-------------|
| Device fingerprint delta | Does the current device match one previously seen for this wallet? |
| IP reputation / geolocation delta | Does the current IP/location differ meaningfully from recent history? |
| Time-of-day pattern | Is the login time consistent with the user's historical pattern? |
| Login velocity | Number of attempts for this wallet/IP within a recent window |
| Graph distance | BFS distance from this login's node to the nearest known bad-actor node |

### Baseline Scoring (Rule-Based)

| Signal | Score Impact |
|--------|--------------|
| New / unrecognized device | -30 |
| New / unrecognized IP or region | -20 |
| Off-hours login | -10 |
| High login velocity from same IP | -25 |
| Short graph distance to known bad actor | -35 |
| All signals normal | 0 (baseline 100) |

### Routing

| Trust Score | Route |
|-------------|-------|
| **>= 90** | Straight to signature verification |
| **50 - 89** | SMS OTP step-up, then signature verification |
| **< 50** | Blocked and logged |

**Upgrade path:** an **Isolation Forest** anomaly-detection model is the proposed successor to the rule-based baseline — it needs no labeled fraud data (scarce for a student project) and naturally isolates rare, anomalous feature combinations.

**Threat Graph:** adjacency list keyed by wallet/IP/device nodes; a login adds an edge between the wallet and the IP/device used. A bounded BFS (3 hops max) runs from each new node to measure proximity to any flagged bad actor — `O(V' + E')` for the bounded neighborhood explored.

---

## Data Structures and Algorithms

Every structure was chosen to solve a specific bottleneck — not for demonstration alone.

| Structure / Algorithm | Used For | Time | Space |
|---|---|---|---|
| **Token Bucket** | Rate limiting incoming requests | O(1) | O(1) per IP |
| **Sliding Window Counter** | Smoothing burst-traffic detection | O(1) amortized | O(w) |
| **LRU Cache** (HashMap + doubly linked list) | O(1) session validation and eviction | O(1) avg | O(k) |
| **Graph (adjacency list) + BFS** | Fraud-ring proximity detection | O(V'+E') bounded | O(V') |
| **Merkle Tree** | Tamper-evident audit batching | O(n) build | O(n) |
| **Merkle Proof Verification** | Verifying single-event authenticity | O(log n) | O(log n) |
| **Min-Heap** | Risk-ranked admin triage (top-N riskiest) | O(log k) | O(k) |

**Highlights:** Merkle proof verification is logarithmic in batch size, so even large batches stay cheap to verify independently. Every hot-path check on every request — rate limiting and session lookup — is **O(1)**, so the added security layers introduce no meaningful latency penalty over a conventional password check.

<details>
<summary><strong>Reference implementations (click to expand)</strong></summary>

**LRU Session Cache (Python)**
```python
class Node:
    def __init__(self, key, value):
        self.key, self.value = key, value
        self.prev = self.next = None

class LRUCache:
    def __init__(self, capacity: int):
        self.capacity = capacity
        self.map = {}
        self.head, self.tail = Node(0, 0), Node(0, 0)
        self.head.next, self.tail.prev = self.tail, self.head

    def _remove(self, node):
        node.prev.next, node.next.prev = node.next, node.prev

    def _add_front(self, node):
        node.next, node.prev = self.head.next, self.head
        self.head.next.prev, self.head.next = node, node

    def get(self, key):
        if key not in self.map:
            return None
        node = self.map[key]
        self._remove(node); self._add_front(node)
        return node.value

    def put(self, key, value):
        if key in self.map:
            self._remove(self.map[key])
        node = Node(key, value)
        self.map[key] = node
        self._add_front(node)
        if len(self.map) > self.capacity:
            lru = self.tail.prev
            self._remove(lru)
            del self.map[lru.key]
```

**Token Bucket Rate Limiter (Node.js / Express)**
```javascript
class TokenBucket {
  constructor(capacity, refillRatePerSec) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillRate = refillRatePerSec;
    this.lastRefill = Date.now();
  }
  _refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
  tryConsume(count = 1) {
    this._refill();
    if (this.tokens >= count) { this.tokens -= count; return true; }
    return false;
  }
}

function rateLimitMiddleware(req, res, next) {
  const ip = req.ip;
  if (!buckets.has(ip)) buckets.set(ip, new TokenBucket(5, 1));
  buckets.get(ip).tryConsume(1) ? next() : res.status(429).json({ error: 'Too many requests' });
}
```

**Merkle Tree Construction and Proof Verification (Python)**
```python
import hashlib

def sha256(data: bytes) -> bytes:
    return hashlib.sha256(data).digest()

def build_merkle_tree(leaves):
    layer = [sha256(leaf) for leaf in leaves]
    tree = [layer]
    while len(layer) > 1:
        if len(layer) % 2 == 1:
            layer.append(layer[-1])
        layer = [sha256(layer[i] + layer[i + 1]) for i in range(0, len(layer), 2)]
        tree.append(layer)
    return tree  # tree[-1][0] is the Merkle root

def get_merkle_proof(tree, index):
    proof = []
    for layer in tree[:-1]:
        pair_index = index ^ 1
        if pair_index < len(layer):
            proof.append(layer[pair_index])
        index //= 2
    return proof

def verify_merkle_proof(leaf, proof, root, index):
    computed = sha256(leaf)
    for sibling in proof:
        computed = sha256(computed + sibling) if index % 2 == 0 else sha256(sibling + computed)
        index //= 2
    return computed == root
```

**Threat Graph with Bounded BFS (Python)**
```python
from collections import defaultdict, deque

class ThreatGraph:
    def __init__(self):
        self.adj = defaultdict(set)
        self.bad_actors = set()

    def add_edge(self, a, b):
        self.adj[a].add(b); self.adj[b].add(a)

    def flag_bad_actor(self, node):
        self.bad_actors.add(node)

    def bfs_distance_to_bad_actor(self, start, max_hops=3):
        visited = {start}
        queue = deque([(start, 0)])
        while queue:
            node, dist = queue.popleft()
            if node in self.bad_actors and node != start:
                return dist
            if dist >= max_hops:
                continue
            for neighbor in self.adj[node]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append((neighbor, dist + 1))
        return None
```

**Min-Heap for Risk-Ranked Admin View (Python)**
```python
import heapq

class RiskRankedAttempts:
    def __init__(self):
        self._heap = []

    def add_attempt(self, attempt_id, trust_score, data):
        heapq.heappush(self._heap, (trust_score, attempt_id, data))

    def top_n_riskiest(self, n=10):
        return heapq.nsmallest(n, self._heap)
```

</details>

---

## Smart Contract

**Contract:** `AuthRegistry.sol` (Solidity `^0.8.20`, uses OpenZeppelin's audited ECDSA library)

| Function | Description |
|----------|-------------|
| `registerUser()` | Registers the calling wallet address (once per wallet) |
| `verifySignature(address, nonce, signature)` | Recovers the signer and validates against registration; rejects reused nonces |
| `submitMerkleRoot(bytes32 root)` | Admin-only — anchors a batched Merkle root on-chain |
| `pauseAuth()` / `resumeAuth()` | Admin-only — global circuit breaker |
| `getMerkleRoot(uint256 batchId)` | Returns the root for a historical batch |
| `transferAdmin(address)` | Admin-only — rotates the admin address |

**Events:** `UserRegistered`, `LoginVerified`, `MerkleRootSubmitted`, `AuthPaused`, `AuthResumed`

**Access control:** `registerUser()` is open (once per wallet); `submitMerkleRoot`, `pauseAuth`, `resumeAuth`, and `transferAdmin` are restricted via an `onlyAdmin` modifier.

**Deployment target:** local Hardhat network for development/demo, with an optional secondary deployment to a public testnet (e.g., Polygon testnet) to demonstrate real network/gas behavior.

<details>
<summary><strong>Full contract source (click to expand)</strong></summary>

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract AuthRegistry {
    using ECDSA for bytes32;

    address public admin;
    bool public paused;
    mapping(address => bool) public isRegistered;
    mapping(address => bytes32) public usedNonces;
    bytes32[] public merkleRoots;

    event UserRegistered(address indexed wallet);
    event LoginVerified(address indexed wallet, uint256 timestamp);
    event MerkleRootSubmitted(bytes32 root, uint256 batchId);
    event AuthPaused(address indexed by);
    event AuthResumed(address indexed by);

    modifier onlyAdmin() {
        require(msg.sender == admin, "AuthRegistry: caller is not admin");
        _;
    }

    modifier notPaused() {
        require(!paused, "AuthRegistry: authentication is paused");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function registerUser() external notPaused {
        require(!isRegistered[msg.sender], "AuthRegistry: already registered");
        isRegistered[msg.sender] = true;
        emit UserRegistered(msg.sender);
    }

    function verifySignature(
        address wallet,
        bytes32 nonce,
        bytes calldata signature
    ) external notPaused returns (bool) {
        require(isRegistered[wallet], "AuthRegistry: wallet not registered");
        require(usedNonces[wallet] != nonce, "AuthRegistry: nonce already used");

        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(nonce);
        address recovered = ethSignedHash.recover(signature);
        require(recovered == wallet, "AuthRegistry: invalid signature");

        usedNonces[wallet] = nonce;
        emit LoginVerified(wallet, block.timestamp);
        return true;
    }

    function submitMerkleRoot(bytes32 root) external onlyAdmin {
        merkleRoots.push(root);
        emit MerkleRootSubmitted(root, merkleRoots.length - 1);
    }

    function getMerkleRoot(uint256 batchId) external view returns (bytes32) {
        require(batchId < merkleRoots.length, "AuthRegistry: invalid batch id");
        return merkleRoots[batchId];
    }

    function pauseAuth() external onlyAdmin {
        paused = true;
        emit AuthPaused(msg.sender);
    }

    function resumeAuth() external onlyAdmin {
        paused = false;
        emit AuthResumed(msg.sender);
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "AuthRegistry: zero address");
        admin = newAdmin;
    }
}
```

**Design notes:** signature recovery uses OpenZeppelin's audited ECDSA library (not a custom implementation); nonce reuse is prevented per-wallet, directly enforcing replay rejection at the contract level; all state-changing admin functions are gated by `onlyAdmin`; no personally identifiable information is stored on-chain — only registration status, consumed nonces, and Merkle roots.

</details>

---

## API Reference

All endpoints are exposed by the Node.js Backend Orchestrator. Requests/responses are JSON; authenticated endpoints require a valid session token.

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Registers a new wallet address and creates an off-chain profile |
| `POST` | `/api/auth/nonce` | Issues a fresh single-use nonce for a given wallet address |
| `POST` | `/api/auth/login` | Submits a signed nonce; triggers risk scoring and routing |
| `POST` | `/api/auth/otp/verify` | Verifies a submitted OTP code for the medium-risk path |
| `POST` | `/api/auth/logout` | Invalidates the current session |

**`POST /api/auth/login`**

Request:
```json
{
  "wallet_address": "0x9F3a...c21B",
  "signed_nonce": "0x...",
  "device_fingerprint": "a1b2c3..."
}
```

Response:
```json
{
  "decision": "otp_required",
  "trust_score": 67,
  "otp_challenge_id": "a1e2d3c4-otp-4455-b667-889900aabbcc",
  "reason_hint": "new_device_detected"
}
```

### Risk and Graph

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/risk/score/:wallet` | Most recent Trust Score for a wallet |
| `GET` | `/api/graph/threat` | Current threat graph nodes/edges for visualization |
| `GET` | `/api/graph/cluster/:id` | Details of a specific flagged fraud cluster |

### Audit

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/audit/proof/:eventId` | Merkle proof for a specific login event |
| `GET` | `/api/audit/root/:batchId` | On-chain Merkle root for a given batch |

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/admin/pause` | Calls the smart contract's `pauseAuth()` |
| `POST` | `/api/admin/resume` | Resumes authentication after a pause |
| `GET` | `/api/admin/attempts/top` | Top-N riskiest recent attempts (min-heap) |

<details>
<summary><strong>More sample payloads</strong></summary>

**`GET /api/audit/proof/:eventId`**
```json
{
  "event_id": "evt_00931",
  "leaf_hash": "0x4a7e...9d21",
  "proof_path": ["0x88c1...a2", "0x0fd3...9e", "0x77bb...11"],
  "merkle_root": "0x1234...abcd",
  "verified": true
}
```

**`GET /api/graph/cluster/:id`**
```json
{
  "cluster_id": "cluster_014",
  "node_count": 12,
  "node_ids": ["wallet_x", "wallet_y", "ip_203.0.113.5", "device_hash_a1"],
  "reason": "shared_device_across_multiple_wallets",
  "risk_level": "high"
}
```

</details>

---

## Data Model

### Supabase (PostgreSQL)

**`users`** — `id (uuid, PK)`, `wallet_address (unique)`, `display_name`, `created_at`, `last_login_at`

**`sessions`** — `id (uuid, PK)`, `user_id (FK)`, `trust_score`, `issued_at`, `expires_at`

**`nonces`** — `id (uuid, PK)`, `wallet_address`, `nonce_value`, `used`, `expires_at`

### MongoDB

**`login_events`** — `wallet_address`, `ip_address`, `device_fingerprint`, `trust_score`, `decision`, `timestamp`

**`fraud_flags`** — `cluster_id`, `node_ids[]`, `reason`, `detected_at`

### On-Chain

| Storage Item | Description |
|---|---|
| `walletToPublicKey` mapping | Registered wallet to verified public key / DID |
| `merkleRoots` array | Append-only list of submitted audit-batch roots |
| `paused` (bool) | Global circuit-breaker flag |
| `admin` address | Address authorized to call `pauseAuth()` / `resumeAuth()` |

---

## Project Structure

```
.
├── contracts/                       # Solidity smart contracts (AuthRegistry.sol) + Hardhat config
│   ├── contracts/AuthRegistry.sol
│   ├── scripts/deploy.ts
│   ├── test/authRegistry.test.ts
│   ├── hardhat.config.ts
│   └── package.json
├── services/
│   ├── gateway/                     # Express.js API gateway (rate limiter, request validation)
│   │   ├── src/index.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   ├── orchestrator/                # Node.js backend (LRU cache, session mgmt, event queue)
│   │   ├── src/index.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   └── risk-engine/                 # Python / FastAPI risk scoring + threat graph (BFS)
│       ├── app/
│       │   ├── main.py              # FastAPI endpoints: POST /score, GET /health
│       │   ├── features.py          # Feature extraction (device, region, time, velocity)
│       │   ├── geo.py               # Offline IP geolocation lookup
│       │   ├── scorers/rules.py     # Rule-based Trust Score calculator
│       │   └── graph/
│       │       ├── threat_graph.py  # Adjacency-list graph (wallet/IP/device nodes)
│       │       └── bfs.py           # Bounded BFS (3-hop fraud proximity)
│       ├── data/demo_geo_overrides.json
│       ├── tests/                   # pytest suite (50 tests)
│       ├── requirements.txt
│       └── Dockerfile
├── apps/
│   ├── web/                         # React + Three.js dashboard and identity vault UI
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   └── pages/admin/Attempts.tsx
│   │   └── package.json
│   └── mobile/                      # Flutter companion app (biometric approval)
│       └── lib/main.dart
├── scripts/
│   ├── seed.ts                      # Demo data seeder (5 wallets + 1 fraud ring)
│   └── scenarios/s1.ts - s6.ts      # Scripted demo scenarios (PRD S1-S6)
├── automation/n8n/workflows/        # n8n workflows (OTP step-up, admin alerts)
├── docker-compose.yml               # Single-command full-stack orchestration
├── .env.example                     # Environment variable template
├── .gitignore
└── README.md
```

---

## Getting Started

### Prerequisites
- Docker and Docker Compose
- Node.js (LTS)
- Python 3.10+
- MetaMask (or compatible wallet extension) for local testing
- Twilio trial account credentials (for OTP demo)

### Local Deployment

```bash
# 1. Clone the repository
git clone https://github.com/abhinandbs12/ai-augmented-decentralized-authentication-system.git
cd ai-augmented-decentralized-authentication-system

# 2. Configure environment variables
cp .env.example .env
# Fill in: contract address, Supabase keys, MongoDB URI, Twilio credentials

# 3. Build and start all services
docker compose build
docker compose up

# 4. In a separate terminal, start the local Hardhat chain and deploy
cd contracts
npx hardhat node
npx hardhat run scripts/deploy.ts --network localhost

# 5. Seed demo data
npx ts-node scripts/seed.ts

# 6. Run the risk engine test suite
cd services/risk-engine
python -m pytest tests/ -v

# 7. Open the dashboard
# http://localhost:3000
```

### Running the Risk Engine Independently

```bash
cd services/risk-engine
pip install -r requirements.txt
python -m pytest tests/ -v          # 50 tests, all passing
uvicorn app.main:app --port 8001    # Requires MongoDB running
```

---

## Testing

| Level | Description |
|-------|-------------|
| **Unit** | Token bucket refill logic, LRU eviction order, Merkle tree construction/proofs, isolated contract functions, risk scorer penalties, BFS distance computation, feature extraction |
| **Integration** | Login flow across orchestrator to AI engine to blockchain client; OTP webhook to n8n to Twilio |
| **System / E2E** | Full login flow across all three Trust Score paths against the running Docker Compose stack |
| **Security** | Replay attack attempts, rate-limit bypass attempts, simulated credential-stuffing bursts |

### Sample Test Cases

| ID | Test Case | Expected Result |
|----|-----------|------------------|
| TC-01 | Submit valid signature for a fresh nonce | Login succeeds, session created |
| TC-02 | Re-submit a previously used signature | Login rejected (replay detected) |
| TC-03 | Exceed token bucket limit from a single IP | HTTP 429 once bucket is empty |
| TC-04 | Login from a brand-new device/IP for an existing wallet | Trust Score drops into medium band, OTP requested |
| TC-05 | Simulate 50+ anomalous logins within 10 seconds | Circuit breaker triggers, `pauseAuth()` called |
| TC-06 | Request a Merkle proof for a known past event | Proof returned and verifies against the on-chain root |
| TC-07 | Tamper with a stored event, then re-verify its proof | Verification fails, proving tamper detection works |

### Risk Engine Test Suite (50 Tests)

| Test File | Count | Coverage |
|-----------|-------|----------|
| `test_rules.py` | 19 | All penalty combinations, clamping at 0/100, score bands, result types |
| `test_graph.py` | 16 | BFS at distances 1-4, graph operations, fraud ring patterns |
| `test_features.py` | 15 | Device recognition, region matching, off-hours detection, login velocity |

---

## Security Considerations

| Threat | Mitigation |
|--------|-----------|
| Credential database breach | Eliminated by design — no passwords/secrets stored server-side |
| Replay attack | Single-use, expiring nonces; signature valid for one challenge only |
| Brute-force / bot login flood | Token bucket rejects excess requests before expensive processing |
| Coordinated fraud ring | Graph-based BFS flags proximity to known bad actors |
| Tampering with historical records | Merkle-anchored on-chain audit trail |
| Session hijacking | Short-lived, cached sessions tied to signed authentication events |
| Mass automated attack | Circuit breaker (`pauseAuth`) halts authentication system-wide |

**Key management:** private keys are generated and held exclusively on the user's own device (browser wallet extension or mobile secure enclave). No backend service ever requests, receives, or stores private key material — a structural property, not a configurable policy.

**Data privacy:** behavioral telemetry (device fingerprint, IP, timestamps) is used exclusively for risk scoring and fraud detection, restricted to backend services.

> A formal third-party smart contract security audit is recommended before any production deployment but is out of scope for this academic project.

---

## Success Metrics and KPIs

| Metric | Target |
|--------|--------|
| High-trust login completion time | Under 2 seconds end-to-end (local demo) |
| False-block rate on legitimate test logins | Under 5% during controlled testing |
| Circuit breaker trigger time under simulated attack | Within 10 seconds of threshold breach |
| Merkle proof verification success rate | 100% for untampered events; correct failure for tampered events |
| Functional requirement coverage at final submission | 100% of Must-priority requirements implemented |
| Live demo completion | Full login-to-dashboard flow without manual intervention |

---

## Roadmap and Future Enhancements

- **Zero-Knowledge Proof identity verification** (via Circom / snarkjs) — selective disclosure such as "I am over 18" without revealing underlying data
- Trained **Isolation Forest** / supervised model replacing the rule-based Trust Score baseline
- **Multi-chain support** for registration across more than one blockchain network
- **Enterprise SSO federation** (SAML / OIDC bridge)
- Formal third-party smart contract security audit
- Expanded behavioral biometrics (typing rhythm, mouse movement) as additional risk features

---

## Competitive and Alternative Approaches

| Approach | Limitation | How This System Differs |
|----------|-----------|--------------------------|
| Traditional password + central DB | Single breach exposes all credentials; static verification | No credentials stored anywhere; risk-adaptive verification |
| Plain wallet login ("Sign in with MetaMask") | Verifies only signature validity; no behavioral context | Adds AI Risk Engine + graph-based fraud detection |
| Centralized MFA / 2FA | Fixed friction for every login; central DB still exists | OTP applied conditionally, only when risk warrants it |
| Enterprise SSO (SAML/OIDC) | Still a central identity provider — single point of trust/failure | Identity anchored on a decentralized ledger |
| Rule-based fraud detection alone | Misses coordinated multi-account fraud rings | Graph + BFS explicitly traces cross-account relationships |

**The novel contribution** is combining a tamper-evident decentralized identity layer with a relationship-aware, risk-adaptive verification layer in one end-to-end system — backed by classical data structures chosen for specific, justified engineering reasons.

---

## Team

| Member | Roll Number |
|--------|--------------|
| **Karthik R Nair** | 20231CSE0041 |
| **Sunny Singh** | 20231CSE0095 |
| **Abhinand Baiju Smitha** | 20231CSE0146 |

---

## References

- Ethereum Foundation — Solidity Documentation
- OWASP — Authentication Cheat Sheet
- NIST Special Publication 800-63B — Digital Identity Guidelines
- Liu, F. T., Ting, K. M., & Zhou, Z. H. (2008) — *Isolation Forest*

---

## License

This project is an academic submission for the Final Year Project, Department of Computer Science and Engineering. See [`LICENSE`](LICENSE) for reuse terms (MIT recommended for code components).

---

<div align="center">

**Built with Blockchain, AI, and Classical Computer Science**

</div>
