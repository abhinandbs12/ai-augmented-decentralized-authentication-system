# Product Requirements Document (PRD)

## AI-Augmented Decentralized Authentication System for Fraud-Resistant Banking Login Security

*(Original / alternate title retained for continuity with earlier submissions: "AI-Augmented Decentralized Authentication System for Fraud-Resistant Identity Verification")*

| Field | Detail |
|---|---|
| Document | Product Requirements Document (PRD) |
| Version | 2.0 (Development Blueprint) |
| Status | Planning complete — **development not started** |
| Institution | Presidency University, Bengaluru, Karnataka |
| Department | Computer Science & Engineering |
| Academic Year | 2026–2027 |
| Faculty Coordinator | Fathima Shana, Assistant Professor, PSCS |
| Team | Karthik R Nair (20231CSE0041), Sunny Singh (20231CSE0095), Abhinand Baiju Smitha (20231CSE0146) |
| Source documents | `Review_1_Final_Year_Project_Document.pdf` (Review 1 submission) + Banking/Fintech domain specialization note |
| Companion document | `TRD.md` — Technical Requirements Document |

---

## 0. How to Read This Document

### 0.1 Feature status legend

Nothing in this project has been built yet. Every item below is therefore a **plan**, not a claim. Three labels are used consistently across the PRD and the TRD:

| Label | Meaning |
|---|---|
| **IMPLEMENTED** | Already built and working today. **Currently applies to zero features** — the project is at the end of its planning phase. |
| **REQUIRED** | Must be built during this project. Split into **Must** (project fails without it) and **Should** (important, built if the schedule allows). |
| **FUTURE** | Explicitly out of scope for this academic term. Documented so the roadmap is visible, but not a deliverable. |

### 0.2 Traceability

Every requirement carries an ID (`FR-xx`, `NFR-xx`, `SR-xx`). The TRD reuses these exact IDs, and the test cases (`TC-01` … `TC-07`) map back to them. If an ID appears in one document it appears in the other with the same meaning.

### 0.3 Where information came from

| Marker | Meaning |
|---|---|
| **[PDF]** | Stated directly in the Review 1 project document. |
| **[DOMAIN]** | Stated in the banking/fintech specialization note supplied alongside the PDF. |
| **[DECISION]** | Not specified in either source. A practical choice has been made here and the reason is given. These are the *only* places where new judgement has been added. |

---

## 1. Project Overview

### 1.1 One-paragraph summary

This project builds a **passwordless login system for a banking web portal**. Instead of a password, each customer is identified by a public/private cryptographic key pair. Logging in means signing a one-time challenge with a private key that never leaves the customer's own device; a smart contract on a blockchain verifies that signature. Before the signature is even requested, an **AI Risk Engine** scores the login attempt from 0 to 100 and decides how much friction the situation deserves — let it through, ask for an SMS OTP, or block it. A **graph-based fraud detector** looks at how wallets, IP addresses and devices are connected to each other, so coordinated attack rings can be spotted, not just single bad logins. Finally, every login event is hashed into a **Merkle tree** and only the tree's root is written on-chain, giving the bank a cheap, tamper-evident audit trail that a regulator can verify independently.

### 1.2 Why banking as the target domain **[DOMAIN]**

The same architecture could serve many domains. Banking login was chosen for three concrete reasons:

1. **Highest stakes for exactly these problems.** A stolen banking credential leads straight to money loss, not just data exposure. The argument for passwordless, risk-adaptive login is strongest here.
2. **Regulatory relevance.** Financial institutions are already expected to keep auditable, tamper-evident records of account access (e.g., RBI guidelines in India, PCI-DSS internationally). That is precisely what the Merkle-anchored audit trail provides.
3. **Well-documented fraud patterns to design against.** Account-takeover rings, credential stuffing against banking portals and mule-account networks are extensively studied in the fraud literature (Akoglu et al.; Pourhabibi et al.), giving a realistic basis for tuning the risk engine instead of designing against a hypothetical attacker.

Choosing banking changes the *framing, scenarios and stakeholders*. It does **not** change the architecture, the technology stack, the data structures or the smart contract design — all of those remain exactly as specified in the Review 1 document. **[PDF] [DOMAIN]**

### 1.3 What the project is *not*

**[PDF]** The project explicitly does not attempt to build:

- a production-grade cryptocurrency wallet,
- a general-purpose blockchain,
- a commercial identity provider,
- a real banking core system, or any handling of real payment / financial transaction data.

The banking framing describes the *login layer* of a bank, not the bank.

### 1.4 Academic context

**[PDF]** This is a final year B.Tech CSE project delivered by a three-member team over a **16-week** academic term, assessed at four departmental reviews plus an expo. The whole stack must run **locally via Docker Compose** so a self-contained live demonstration is possible without depending on external production infrastructure.

---

## 2. Problem Statement

### 2.1 Formal problem statement **[DOMAIN]**

> **Design and implement a decentralized authentication system for a banking login portal that eliminates centralized password storage, verifies customer identity through blockchain-anchored cryptographic signatures, adaptively adjusts verification friction using real-time AI-driven risk scoring calibrated to banking fraud patterns, and maintains a tamper-evident audit trail of all account access activity, while remaining efficient enough for practical deployment in a financial services context.**

*(The original, domain-neutral wording from the Review 1 document — "…eliminates centralized password storage, verifies user identity through blockchain-anchored cryptographic signatures, adaptively adjusts verification friction using real-time AI-driven risk scoring, and maintains a tamper-evident audit trail of all authentication activity, while remaining efficient enough for practical deployment" — remains valid and is the general form of the same statement.)* **[PDF]**

### 2.2 The five core problems

| ID | Problem (banking context) | Consequence |
|---|---|---|
| **P1** | Centralized credential storage at the bank | A single breach exposes every customer account at once. The credential database becomes the highest-value target for anyone attacking the bank. |
| **P2** | Uniform verification friction on banking logins | A login from a customer's usual phone at home gets exactly the same friction as a login from an unrecognised device in another country. This frustrates genuine customers while not actually stopping fraud. |
| **P3** | Non-verifiable account access history | A bank cannot cryptographically prove to a regulator or to a customer that a disputed login record was not altered after the fact. Anyone with admin access can silently change or delete it. |
| **P4** | No behavioural context on login | A stolen credential or session is enough to reach the account. The system can check *"is this signature valid?"* but not *"does this look like the real customer?"* |
| **P5** | Poor detection of coordinated banking fraud | Mule-account networks and account-takeover rings share devices, IPs and infrastructure across many "unrelated" customer accounts. Per-login checks look at each attempt alone and miss the pattern completely. |

**[PDF] [DOMAIN]**

### 2.3 Why existing solutions do not close these gaps

**[PDF]** Each existing approach solves one or two of the five problems and stops:

| Approach | Solves | Leaves open |
|---|---|---|
| Password + central store | — | P1, P2, P3, P4, P5 |
| FIDO2 / WebAuthn passkeys | P1 | P2, P3, P5 (and P4 only partly) |
| Plain wallet login | P1 | P2, P3, P4, P5 |
| Blockchain identity management | P1, P3 (partly) | P2, P4, P5 |
| Centralized MFA / 2FA | P4 (partly) | P1, P2, P3, P5 |
| Risk-based authentication (RBA) | P2, P4 | P1, P3, P5 |
| Unsupervised anomaly detection | P4 | P1, P2, P3, P5 |
| Graph-based fraud detection | P5 | P1, P2, P3 |
| Merkle-anchored audit logging | P3 | P1, P2, P4, P5 |

**The gap is integration, not invention.** None of the constituent mechanisms is claimed as novel. What this project builds is a **single live login path** in which a decentralized, tamper-evident identity layer and a relationship-aware, risk-adaptive verification layer operate together on the same request, inside a latency budget that allows practical deployment.

---

## 3. Proposed Solution

### 3.1 Solution in five moves

| # | Move | Which problem it closes |
|---|---|---|
| 1 | **Remove the password entirely.** Identity = a key pair. The private key stays inside the browser wallet extension or the phone's secure enclave and is never sent anywhere. The server stores only a public wallet address. | P1 |
| 2 | **Score before you challenge.** Every login attempt is scored 0–100 by the AI Risk Engine *before* the signature challenge is issued, so friction is decided by evidence, not by a fixed policy. | P2, P4 |
| 3 | **Make the score relationship-aware.** Graph distance from this login's wallet/IP/device to a known bad actor is one of the scored features, so the system reacts to *what a wallet is connected to*, not only what it has done. | P5 |
| 4 | **Anchor the record, don't just store it.** Login events are batched into a Merkle tree and only the root is written on-chain. Any single event can then be proved authentic in O(log n), and any tampering changes the root and becomes detectable. | P3 |
| 5 | **Give the bank an emergency brake.** A circuit breaker in the smart contract lets an administrator pause all authentication system-wide during a mass attack, and trips automatically when anomalous-login volume crosses a threshold. | P5 (containment) |

### 3.2 The three routing paths (the heart of the system)

**[PDF]** A single number — the **Trust Score** — decides everything:

| Trust Score | Decision | Customer experience |
|---|---|---|
| **90 – 100** | `allow` | Sign once with the wallet. No OTP. Login completes. |
| **50 – 89** | `otp_required` | SMS one-time passcode first, then sign. Mirrors the 2FA banks already use. |
| **0 – 49** | `blocked` | Attempt refused and logged to the audit trail anyway, so a blocked attempt still leaves a trace. |

### 3.3 Demonstrable banking scenarios **[DOMAIN]**

These are the concrete scenarios the finished system must be able to show live at viva:

| # | Scenario | Expected behaviour |
|---|---|---|
| S1 | Genuine customer, usual device, usual location | Trust Score 90+ → direct signature verification → dashboard shows a familiar-device customer login (allow path) |
| S2 | Genuine customer on a new phone, or travelling | Trust Score 50–89 → SMS OTP step-up, exactly the 2FA behaviour bank customers already expect |
| S3 | Stolen credentials used from an unfamiliar device/location at high velocity | Trust Score below 50 → blocked and logged — protection against account takeover |
| S4 | Mule-account ring: several "customer" wallets sharing one device or IP | Threat graph links the wallets → dashboard highlights the whole cluster as a fraud ring, not as isolated suspicious logins |
| S5 | Simulated credential-stuffing attack on the bank's login portal | Circuit breaker trips within 10 seconds → all authentication paused → administrator alerted (test case **TC-05**) |
| S6 | Regulator / auditor reviewing a disputed historical login | Auditor selects the event on the dashboard, requests its Merkle proof, verifies it against the on-chain root, and confirms the record is authentic and unaltered (test cases **TC-06** and **TC-07**) |

---

## 4. Objectives

### 4.1 Primary objectives — REQUIRED (Must) **[PDF]**

| # | Objective | Success looks like |
|---|---|---|
| O1 | Replace password-based login with blockchain-based cryptographic identity verification | A customer registers and logs in end-to-end with no password anywhere in the system |
| O2 | Score every login attempt in real time and route it through the appropriate verification path | Every attempt receives a numeric Trust Score before routing; all three paths demonstrable |
| O3 | Detect coordinated fraud rings using graph-based relationship analysis across wallets, IPs and devices | A seeded fraud ring is detected and shown as a connected cluster |
| O4 | Maintain an immutable, low-cost, cryptographically verifiable audit trail using blockchain anchoring and Merkle batching | Any past event is provable against its on-chain root; a tampered event fails verification |
| O5 | Apply classical data structures — LRU cache, token bucket, Merkle tree, graph traversal, min-heap — to **real engineering bottlenecks**, not as decoration | Each structure is tied to a stated bottleneck with stated complexity (see TRD §8) |

### 4.2 Secondary objectives — REQUIRED (Should) **[PDF] [DOMAIN]**

| # | Objective | Note |
|---|---|---|
| O6 | Provide a **Live Authentication Flow** screen that animates each step of a real login as it happens | Added from the domain note; turns the sequence diagram into something judges can watch |
| O7 | Provide an administrator dashboard with a live 3D threat graph and a risk-ranked attempt list | Makes risk legible spatially instead of by reading logs |
| O8 | Provide a Flutter companion app for biometric approval of a pending web login | Removes the need to sign manually on the laptop |

### 4.3 Stretch objectives — FUTURE / cut first if the schedule slips **[PDF]**

- Hardware-bound biometric login via **WebAuthn / passkeys** as an alternative signing method.
- A live **Attack Simulator** panel for demonstrating resilience during evaluation.
- **Audio and haptic alerting** on the administrator dashboard and mobile app.

> **Note on one inconsistency in the source.** The Review 1 document lists the smart-contract circuit breaker under secondary/stretch objectives (§2.3.2), but also specifies it as a Must-level functional requirement (FR-19), includes it in the contract interface, the threat model, the routing diagram, test case TC-05 and the success metrics. **Decision: the circuit breaker is treated as Must-priority throughout this PRD/TRD**, because five other parts of the source depend on it. Flagged in the Gap Analysis (TRD §21, item G-03).

### 4.4 Non-goals **[PDF]**

- No production mainnet deployment (local Hardhat chain, or optionally a public testnet showcase).
- No zero-knowledge-proof selective disclosure (documented as future work only).
- No multi-tenant or enterprise SSO federation (SAML, OIDC broker integration).
- No formal third-party security audit of the smart contract.
- No handling of payment or financial transaction data.

---

## 5. Target Users

### 5.1 Primary user personas

| Persona | Who they are | What they want | Pain today |
|---|---|---|---|
| **Bank customer** | An ordinary retail banking customer using the web portal (and optionally the mobile app) | Fast, secure login to check balances and make transactions, without managing a password | Passwords get forgotten, reused and stolen; 2FA is demanded even for completely ordinary logins |
| **Bank fraud / security analyst** | Staff monitoring suspicious login activity | To *see* suspicious login clusters, and to be able to halt authentication bank-wide during a suspected mass attack | Isolated alerts with no relationship context; no single emergency stop |
| **Bank compliance / audit officer** | Internal audit or an external regulator | A tamper-evident record of every account access event that can be verified independently, without trusting the bank's own operators | Audit logs are trusted on the operator's word |

### 5.2 Project stakeholders

| Stakeholder | Interest |
|---|---|
| Faculty coordinator (Fathima Shana) | Technical rigor, correct CS fundamentals, feasibility; reviews milestones |
| Development team (3 members) | Design, build, test and present the system |
| Evaluation panel | Technical depth and originality, judged at the live demonstration and viva |

**[PDF] [DOMAIN]**

### 5.3 Assumptions about users **[PDF]**

- Customers have a device capable of holding a private key — a browser wallet extension (desktop) or a mobile secure enclave.
- A local or test blockchain is sufficient for demonstration.
- Twilio trial credentials are sufficient for the SMS OTP flow.

---

## 6. Main Features

Grouped by module, with status. Detailed requirement IDs follow in §7.

| # | Feature | Status | Priority |
|---|---|---|---|
| F1 | Wallet-based customer registration (on-chain + off-chain profile) | REQUIRED | Must |
| F2 | Passwordless login by signing a single-use nonce, verified by smart contract | REQUIRED | Must |
| F3 | Replay protection — a used signature/nonce is rejected at contract level | REQUIRED | Must |
| F4 | AI Risk Engine producing a Trust Score 0–100 for every attempt | REQUIRED | Must |
| F5 | Three-band risk routing: allow / OTP step-up / block | REQUIRED | Must |
| F6 | Graph-based fraud-ring detection (wallet ↔ IP ↔ device, bounded BFS) | REQUIRED | Must |
| F7 | Merkle-batched, blockchain-anchored audit trail | REQUIRED | Must |
| F8 | Merkle proof generation and verification (auditor view) | REQUIRED | Must |
| F9 | Circuit breaker — system-wide authentication pause / resume | REQUIRED | Must |
| F10 | SMS OTP step-up via n8n workflow + Twilio | REQUIRED | Must |
| F11 | Rate limiting (token bucket + sliding window) at the gateway | REQUIRED | Must |
| F12 | LRU session cache for O(1) session validation | REQUIRED | Must |
| F13 | Administrator dashboard with live 3D force-directed threat graph | REQUIRED | Must |
| F14 | Live Authentication Flow screen (step-by-step animated login) | REQUIRED | Should |
| F15 | Top-N riskiest attempts via min-heap | REQUIRED | Should |
| F16 | Administrator mass-attack alert | REQUIRED | Should |
| F17 | Flutter mobile companion — biometric approval of a pending web login | REQUIRED | Should |
| F18 | Pluggable scoring backend (rule-based now, Isolation Forest later) | REQUIRED | Must (architectural) |
| F19 | Isolation Forest unsupervised ML scorer | REQUIRED | Should |
| F20 | WebAuthn / passkey signing as an alternative | FUTURE | Could |
| F21 | Attack Simulator panel | FUTURE | Could |
| F22 | Haptic / audio alerting | FUTURE | Could |

---

## 7. Functional Requirements

Priority uses MoSCoW: **Must** = the project fails its own success criteria without it; **Should** = important, built once all Musts are green; **Could** = stretch, cut first.

### 7.1 Identity and registration

| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-01 | A new customer can connect an existing wallet or generate a new key pair in the browser | Must | REQUIRED |
| FR-02 | The system registers that wallet address on-chain via `registerUser()` | Must | REQUIRED |
| FR-03 | The system creates the matching off-chain customer profile in the relational database | Must | REQUIRED |
| FR-04 | A second registration attempt for an already-registered wallet is rejected with a clear error message | Must | REQUIRED |

### 7.2 Login and signature verification

| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-05 | A fresh, single-use, expiring nonce is issued for every login attempt | Must | REQUIRED |
| FR-06 | The signed nonce is verified against the smart contract's `verifySignature()` | Must | REQUIRED |
| FR-07 | A previously used signature/nonce is rejected as a replay — enforced **at contract level**, not only by backend policy | Must | REQUIRED |
| FR-08 | WebAuthn / passkey signing is offered as an alternative signing method | Could | FUTURE |

### 7.3 AI risk scoring

| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-09 | A Trust Score in the range 0–100 is computed for **every** login attempt before routing | Must | REQUIRED |
| FR-10 | A Trust Score of **90 and above** routes straight to signature verification with no OTP | Must | REQUIRED |
| FR-11 | A Trust Score of **50 to 89** routes through SMS OTP step-up before verification | Must | REQUIRED |
| FR-12 | A Trust Score **below 50** blocks the attempt, and the blocked event is still written to the login event log | Must | REQUIRED |
| FR-13 | The scoring backend can be replaced (rules → trained model) without changing the orchestrator or the API contract | Must | REQUIRED |

### 7.4 Graph-based fraud detection

| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-14 | An adjacency-list graph links wallet, IP address and device-fingerprint nodes, updated on every login attempt | Must | REQUIRED |
| FR-15 | A breadth-first search **bounded to three hops** measures the distance from the new login to the nearest known bad actor, and that distance is available to the scorer | Must | REQUIRED |
| FR-16 | Connected suspicious nodes are highlighted as a distinctly coloured cluster on the dashboard | Should | REQUIRED |

### 7.5 Blockchain and audit trail

| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-17 | Login events are batched and **one Merkle root per batch** is anchored on-chain, rather than writing each event individually | Must | REQUIRED |
| FR-18 | A valid Merkle proof can be produced for any historical login event on request | Must | REQUIRED |
| FR-19 | While the contract is paused, all authentication is rejected regardless of Trust Score | Must | REQUIRED |

### 7.6 Automation and notification

| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-20 | An n8n workflow fires whenever a Trust Score falls in the medium band | Must | REQUIRED |
| FR-21 | A valid one-time passcode is delivered by SMS through Twilio, and verified before login continues | Must | REQUIRED |
| FR-22 | The administrator is notified when a mass-attack pattern is detected | Should | REQUIRED |

### 7.7 Dashboard and visualization

| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-23 | A live 3D force-directed graph of login activity renders and updates within a few seconds of a new event | Must | REQUIRED |
| FR-24 | The top-N riskiest current attempts are exposed in rank order using a min-heap | Should | REQUIRED |
| FR-25 | An Attack Simulator panel generates demonstration attack traffic on request | Could | FUTURE |

### 7.8 Mobile companion

| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-26 | A customer can approve a pending web login using device biometrics, completing the web session without further input on the laptop | Should | REQUIRED |
| FR-27 | Haptic feedback accompanies step-up challenges on mobile | Could | FUTURE |

### 7.9 Added from the banking domain note **[DOMAIN]**

| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-28 | A **Live Authentication Flow** screen animates each step of a single login in real time as it happens: wallet connect → nonce issued → signing on device → risk scoring (score counting up, with contributing factors appearing) → routing decision branching into allow / OTP / block → blockchain verification → session created with elapsed time → audit event added to the Merkle tree | Should | REQUIRED |
| FR-29 | An **Audit Proof Verification** view lets an auditor pick a historical login event, fetch its Merkle proof, recompute the root in the browser, compare it against the on-chain root, and see a clear pass/fail result | Must | REQUIRED |

*FR-29 is what makes test cases TC-06 and TC-07 demonstrable to an evaluator, and is the concrete form of the regulator scenario S6.*

---

## 8. User Stories

Written in the banking framing. Each story names the requirements it exercises.

### 8.1 Bank customer

| # | Story | Acceptance criteria | Requirements |
|---|---|---|---|
| US-01 | As a **new bank customer**, I want to register using my wallet so that I never have to create or remember a banking password. | Registration completes; wallet appears as registered on-chain; my profile exists off-chain; a second attempt with the same wallet gives a clear "already registered" message. | FR-01…FR-04 |
| US-02 | As a **returning customer on my usual device**, I want to log in with a single signature so that routine access is fast. | Score ≥ 90; no OTP is requested; session is created; total time under 2 seconds on the demo network. | FR-05, FR-06, FR-09, FR-10, NFR-01 |
| US-03 | As a **customer using a new phone**, I want the bank to ask for one extra check rather than lock me out. | Score lands in 50–89; an SMS OTP arrives; entering the correct 6-digit code completes the login. | FR-11, FR-20, FR-21 |
| US-04 | As a **customer whose credentials were stolen**, I want the bank to refuse a login that clearly is not me. | An attempt from an unfamiliar device + unfamiliar region + high velocity scores below 50, is blocked, and is still recorded in the event log. | FR-12 |
| US-05 | As a **customer**, I want to approve a login from my phone using my fingerprint or face, instead of signing on the laptop. | A pending approval appears on the mobile app with the attempt's context; biometric confirmation signs the nonce and the web session completes. | FR-26 |
| US-06 | As a **customer**, I never want to see technical jargon like "nonce" or "Merkle root". | No customer-facing screen contains those terms; they appear only in administrator/technical views. | NFR-07 |

### 8.2 Bank fraud / security analyst

| # | Story | Acceptance criteria | Requirements |
|---|---|---|---|
| US-07 | As a **fraud analyst**, I want to see login activity as a live map of connected wallets, IPs and devices, so I can spot a ring instead of reading a log. | The 3D force-directed graph renders live and updates within 3 seconds of a new event. | FR-23, NFR-04 |
| US-08 | As a **fraud analyst**, I want a coordinated ring to appear as one highlighted cluster. | Several wallets sharing a device/IP are drawn as one distinctly coloured cluster with a cluster ID. | FR-14, FR-15, FR-16 |
| US-09 | As a **fraud analyst**, I want to see the riskiest current attempts first, not in chronological order. | The dashboard lists the top-N riskiest recent attempts in rank order, served by the min-heap. | FR-24 |
| US-10 | As a **fraud analyst**, I want one control that halts all authentication during a suspected mass attack. | `pauseAuth()` is called; every subsequent login is rejected regardless of Trust Score; `resumeAuth()` restores service. | FR-19 |
| US-11 | As a **fraud analyst**, I want to be alerted automatically when a mass attack starts, rather than noticing it myself. | When anomalous attempts cross the threshold in the rolling window, the breaker trips within 10 seconds and an alert is dispatched. | FR-22, NFR-11 |

### 8.3 Compliance / audit officer

| # | Story | Acceptance criteria | Requirements |
|---|---|---|---|
| US-12 | As an **auditor**, I want to prove that a disputed historical login record has not been altered, without trusting the bank's operators. | Selecting an event returns its leaf hash and sibling path; the browser recomputes the root and it matches `getMerkleRoot(batchId)`. | FR-18, FR-29 |
| US-13 | As an **auditor**, I want tampering to be visibly detectable. | After a stored event is deliberately altered, re-verifying its proof fails and the UI says so clearly (TC-07). | FR-18, FR-29 |
| US-14 | As a **compliance officer**, I want confirmation that no customer personal data is written to the blockchain. | On-chain state contains only registration status, consumed nonces and Merkle roots — no names, phone numbers, IPs or device data. | SR-14 |

### 8.4 Evaluator / demonstration

| # | Story | Acceptance criteria | Requirements |
|---|---|---|---|
| US-15 | As an **evaluator**, I want to watch the Trust Score being calculated and the routing decision being made, rather than have it explained verbally. | The Live Authentication Flow screen animates each step of a real login, including the score counting up with its contributing factors. | FR-28 |
| US-16 | As an **evaluator**, I want the whole system to start with a single command so the demo does not depend on the internet. | `docker compose up` brings up every backend service plus the local chain. | NFR-09 |

---

## 9. User Workflows

### 9.1 W1 — Registration (new customer)

1. Customer opens the Identity Vault landing screen and selects **Connect Wallet**.
2. The browser wallet extension asks for permission; the customer approves.
3. The frontend sends the wallet address to `POST /api/auth/register`.
4. The backend calls `registerUser()` on the smart contract.
5. On success the backend creates the customer profile row in the relational store.
6. The UI confirms registration. A repeat attempt returns a clear "wallet already registered" error. **(FR-01–FR-04)**

### 9.2 W2 — High-trust login (allow path) — the happy path

1. Customer selects **Log in**. The request hits the API gateway.
2. **Token bucket check.** If the bucket for that IP is empty → HTTP 429, and nothing expensive has been done.
3. **LRU session cache lookup.** If a valid session already exists → access granted immediately without re-scoring.
4. Otherwise the threat graph is updated with this login's wallet, IP and device nodes and edges.
5. The AI Risk Engine extracts features, applies the scorer, runs the bounded BFS, and returns a **Trust Score ≥ 90**.
6. The orchestrator issues a single-use nonce; the wallet signs it on the customer's device.
7. The backend calls `verifySignature()`; the contract confirms the signer and that the nonce is unused.
8. A session is created and cached in the LRU store.
9. The event is queued for Merkle batching, and the dashboard event stream updates. **(FR-05–FR-10, FR-17)**

### 9.3 W3 — Medium-trust login (OTP step-up path)

Steps 1–5 as above, but the Trust Score lands in **50–89**.

6. The orchestrator fires the n8n webhook with the wallet, challenge ID and band.
7. n8n calls Twilio; an SMS one-time passcode reaches the customer's registered phone.
8. The customer enters the 6-digit code on the OTP screen → `POST /api/auth/otp/verify`.
9. Only after the code is accepted does the nonce signing and `verifySignature()` step proceed.
10. From there the flow rejoins W2 at step 8. **(FR-11, FR-20, FR-21)**

### 9.4 W4 — Low-trust login (blocked path)

Steps 1–5 as above, but the Trust Score is **below 50**.

6. The attempt is refused. No nonce is issued and no signature is requested.
7. The event — wallet, IP, device fingerprint, score, `decision = blocked`, timestamp — is written to the login event log so the blocked attempt still leaves an auditable trace.
8. The threat graph and dashboard update; if this login is close to a flagged node, its cluster is highlighted. **(FR-12, FR-14–FR-16)**

### 9.5 W5 — Mobile biometric approval

1. A web login reaches the point where a signature is needed.
2. The mobile app shows a pending approval with the attempt's context (device, location, time, Trust Score band).
3. The customer confirms with fingerprint/face; the secure-enclave key signs the pending nonce.
4. The signature returns to the backend and the web session completes without further laptop input. **(FR-26)**

### 9.6 W6 — Auditor proof verification

1. Auditor opens the Audit Proof Verification view and selects a historical login event.
2. The client calls `GET /api/audit/proof/:eventId` and receives the event's leaf hash plus the sibling hashes on its path to the root.
3. The client **recomputes the root in the browser**.
4. The client calls `GET /api/audit/root/:batchId`, which reads `getMerkleRoot(batchId)` from the chain.
5. Match → "Record authentic and unaltered." Mismatch → "Record has been altered."
6. Under **TC-07** a stored event is deliberately modified and step 5 is seen to fail. **(FR-18, FR-29)**

### 9.7 W7 — Circuit breaker (mass attack)

1. The risk engine / orchestrator counts anomalous attempts in a short rolling window.
2. The configured threshold is crossed (test: **more than 50 anomalous logins in 10 seconds**).
3. The orchestrator calls `pauseAuth()` on the contract — target: **within 10 seconds** of the threshold being crossed.
4. Every subsequent login is rejected at the verification step regardless of Trust Score.
5. An administrator alert is dispatched through the automation layer.
6. Authentication resumes only when an administrator explicitly calls `resumeAuth()`. **(FR-19, FR-22)**

### 9.8 W8 — Live Authentication Flow (demonstration view) **[DOMAIN]**

Runs alongside W2/W3/W4 as a second dashboard tab. As the login progresses, the backend emits a step event over WebSocket for each stage and the screen animates it:

`Wallet connected` → `Nonce issued` → `Signing on device…` → `Risk scoring` (score counts up; contributing factors appear, e.g. "Device: familiar ✓", "Location: unusual ⚠") → `Routing decision` (branches green / yellow / red) → `Blockchain verification` (transaction sent, confirmed) → `Session created in X.XX s` → `Audit event added to Merkle tree`. **(FR-28)**

---

## 10. Non-Functional Requirements

### 10.1 Performance **[PDF]**

| ID | Characteristic | Target |
|---|---|---|
| NFR-01 | Login latency on the high-trust path | Under **2 seconds** end to end on the local demonstration network |
| NFR-02 | Session validation through the LRU cache | **O(1)** average lookup |
| NFR-03 | Rate-limiter overhead per request | Under **5 ms** added latency |
| NFR-04 | Dashboard graph update latency | Under **3 seconds** from event to render |

### 10.2 Usability **[PDF]**

| ID | Requirement |
|---|---|
| NFR-05 | A legitimate low-risk login requires **no more than one interaction** — the wallet signature prompt. |
| NFR-06 | Step-up verification requires no more than entering a **six-digit code**, and should feel like a light speed bump, not a punishment. |
| NFR-07 | Technical vocabulary (nonce, Merkle root, BFS, adjacency list) never appears on customer-facing screens; it is confined to administrator and technical views. |
| NFR-08 | Risk is legible on the dashboard through **colour and clustering**, not by reading raw logs. |

### 10.3 Reliability and availability

| ID | Requirement | Source |
|---|---|---|
| NFR-09 | The entire backend stack starts with a **single `docker compose up` command**, with no dependency on external production infrastructure. | [PDF] |
| NFR-10 | **Fail-safe, not fail-open.** If the AI Risk Engine is unreachable, the orchestrator treats the attempt as **medium risk** and routes it through OTP step-up — it never silently allows it. | [PDF] |
| NFR-11 | The circuit breaker trips within **10 seconds** of the anomaly threshold being crossed. | [PDF] |
| NFR-12 | No horizontally scalable service holds in-memory state that cannot be rebuilt from the shared data stores. (The demo runs on one node; this keeps the design honest about scaling.) | [PDF] |

### 10.4 Maintainability and portability

| ID | Requirement | Source |
|---|---|---|
| NFR-13 | The scoring backend sits behind a service boundary so it can be swapped without touching the orchestrator or the API contract. | [PDF] |
| NFR-14 | Every service runs in its own container with its own configuration; no service reads another service's database directly except as specified in the TRD. | [DECISION] — keeps ownership boundaries clear for a three-person team |
| NFR-15 | All configuration (URLs, contract address, credentials) comes from environment variables. No secret is ever hard-coded or committed. | [DECISION] — required before any code reaches a repository |

### 10.5 Scalability (design intent, not a demo target)

| ID | Requirement |
|---|---|
| NFR-16 | Every operation on the hot path of every request — the rate-limit check and the session cache lookup — is **constant time**, so the security layers do not impose a meaningful latency penalty compared with a conventional password check. |
| NFR-17 | Merkle proof verification is **O(log n)** in batch size, so even large batches remain cheap to verify independently. |

---

## 11. Security Requirements

### 11.1 Threat model and mitigations **[PDF]**

| ID | Threat | Required mitigation |
|---|---|---|
| SR-01 | Credential database breach | **Eliminated by design** — no passwords or credential secrets are stored server-side |
| SR-02 | Replay of a captured signature | Single-use, expiring nonces; reuse rejected **at contract level** |
| SR-03 | Brute-force or bot login flood | Token-bucket rate limiting rejects excess requests **before** any scoring or database access |
| SR-04 | Coordinated fraud ring | Bounded BFS flags proximity to known bad actors and feeds that distance into the score |
| SR-05 | Tampering with historical login records | Merkle-anchored on-chain audit trail makes alteration cryptographically detectable |
| SR-06 | Session hijacking | Sessions are short-lived, cached with an expiry, and bound to signed authentication events |
| SR-07 | Mass automated attack in progress | Circuit breaker (`pauseAuth`) halts all authentication system-wide until an administrator resumes it |

### 11.2 Structural security properties **[PDF]**

| ID | Property |
|---|---|
| SR-08 | **Private keys never leave the user's device.** They are generated and held exclusively inside the browser wallet extension or the mobile secure enclave. No backend service ever requests, receives or stores private key material. Because this is a property of the architecture and not a configuration setting, it cannot be weakened by misconfiguration. |
| SR-09 | Rate limiting is applied **before** any expensive computation. |
| SR-10 | All inter-service communication inside Docker Compose uses internal network isolation. |
| SR-11 | Signature recovery in the contract uses OpenZeppelin's audited ECDSA library, not a custom implementation. |
| SR-12 | All state-changing administrative contract functions are gated by a single `onlyAdmin` modifier, keeping the privileged surface small enough to audit by inspection. |

### 11.3 Privacy and banking compliance note **[DOMAIN]**

| ID | Requirement |
|---|---|
| SR-13 | **Data collected:** wallet address, IP address, device fingerprint, timestamp, and derived behavioural patterns (time-of-day, login velocity). Collected for the sole purpose of risk scoring and fraud detection. |
| SR-14 | **No personally identifiable information is written on-chain.** On-chain state holds only registration status, consumed nonces, and Merkle roots. |
| SR-15 | Behavioural telemetry is restricted to backend services and is not exposed to end users beyond their own activity history. |
| SR-16 | The design aligns with the *intent* of banking data-protection expectations (e.g., RBI guidance in India, PCI-DSS internationally) on two specific points: **(a)** the tamper-evident, independently verifiable access-audit trail, and **(b)** minimisation — no credential secret and no customer PII is stored where a breach could expose it. **This is an alignment statement, not a certification**; no formal compliance assessment is performed within this project. |

### 11.4 Secret-handling rules (development discipline) **[DECISION]**

| ID | Rule |
|---|---|
| SR-17 | Twilio credentials, database URLs, the admin key and any API tokens live only in a local `.env` file that is git-ignored. A committed `.env.example` lists variable **names** with empty values. |
| SR-18 | No credential value is ever printed to logs, screenshots, the report, the presentation, or the demonstration video. |
| SR-19 | The Hardhat development accounts used locally are the well-known public test accounts and must never be reused on any public network. |

---

## 12. Limitations

Stated openly. Evaluators respect an honest limitations section far more than silence, and it pre-empts the "have you tested this at scale?" question. **[PDF] [DOMAIN]**

| # | Limitation | Consequence for the claims made |
|---|---|---|
| L1 | **Local deployment only.** Evaluation runs on a local Docker Compose stack with a local Hardhat chain. | No claim is made about behaviour at production scale or about real-network gas economics. |
| L2 | **No real fraud data.** The rule-based scorer ships as the reliable baseline; the Isolation Forest model is an upgrade path trained on synthetic/self-generated data. | No claim is made about learned-model accuracy on real banking fraud. |
| L3 | **No formal third-party security audit** of the smart contract. | No claim of production-grade contract security. |
| L4 | **Account recovery is unsolved.** If a customer loses the device holding the private key, there is no recovery mechanism in this project. This is the same open problem the FIDO2 usability literature identifies. | Recorded as an honest UX gap, not a solved problem. |
| L5 | **The combination is not individually novel.** Wallet login, RBA, unsupervised anomaly detection, graph fraud analysis and Merkle-anchored logging all exist independently. | The contribution claimed is the **integration** of these into one live login path with justified data-structure selection at each bottleneck — nothing more. |
| L6 | **Not a real banking system.** No payment or financial transaction data is handled; only the login layer is built. | The banking framing is the applied context, not a claim of a banking product. |
| L7 | **Small team, 16 weeks.** Three members, ~435 estimated hours total. | Stretch features are genuinely cuttable and are isolated in a late phase for exactly this reason. |

### 12.1 Demonstration risk and its mitigation **[DOMAIN]**

The live demo depends on a local blockchain and a Docker stack, both of which can fail on the day. **Mitigation (a required deliverable):** record a full **backup demonstration video** covering all three Trust Score paths, the fraud-ring cluster, the circuit breaker and the audit proof verification, before the final review. Rehearse on the fully local stack with no external dependency.

---

## 13. Future Enhancements

Not deliverables for this term. Listed so the roadmap beyond the project is visible.

| # | Enhancement | Why it is deferred |
|---|---|---|
| FE-01 | **WebAuthn / passkey signing** as an alternative to a wallet extension | Adds a second authenticator model and a second registration flow; not needed to prove the core thesis |
| FE-02 | **Zero-knowledge-proof selective disclosure** (prove an attribute without revealing it) | Implementation risk is high relative to a 16-week timeline |
| FE-03 | **Attack Simulator panel** | Demonstration aid; the same scenarios can be produced by a script |
| FE-04 | **Haptic and audio alerting** | Polish, not function |
| FE-05 | **Formal third-party smart-contract security audit** | Outside the budget and timeline of a college project; would be mandatory before any real deployment |
| FE-06 | **Public testnet showcase** | Optional; the local chain is sufficient for evaluation |
| FE-07 | **Push notifications for mobile approval** (instead of polling) | Requires a cloud messaging service; conflicts with the offline-demo constraint (see TRD §5.7) |
| FE-08 | **Multi-tenant / enterprise SSO federation** (SAML, OIDC broker) | Explicitly out of scope |
| FE-09 | **Account recovery / social recovery / guardian keys** | The open problem noted in L4; a genuine research direction in its own right |
| FE-10 | **Production deployment with horizontal scaling and a managed key service** | The design keeps services stateless to permit this, but it is not attempted here |

---

## 14. Success Criteria

The project is judged complete when all of the following hold. **[PDF]**

| Metric | Target |
|---|---|
| High-trust login completion time | Under **2 seconds** end to end in the local demonstration |
| False-block rate on legitimate test logins | Under **5%** during controlled testing |
| Circuit breaker trigger time under simulated attack | Within **10 seconds** of the threshold being breached |
| Merkle proof verification success rate | **100%** for untampered events; **0%** (i.e. correct failure) for tampered events |
| Functional requirement coverage at final submission | **100%** of Must-priority requirements implemented and mapped to a passing test case |
| Live demonstration completion | Full login-to-dashboard flow demonstrated without manual intervention |

---

## 15. Project Plan Summary

**[PDF]** Full detail lives in the Review 1 document; reproduced here so the PRD is self-contained.

### 15.1 Phases

| # | Phase | Weeks | Owner | Milestone |
|---|---|---|---|---|
| 1 | Research & Planning | W1–W2 | All | — |
| 2 | Blockchain Foundation | W2–W4 | Karthik | **M1** Smart Contract Deployed |
| 3 | Backend Core | W3–W6 | Sunny | — |
| 4 | AI Risk Engine | W5–W8 | Abhinand | **M2** AI Risk Scoring Functional |
| 5 | Automation & Alerts | W7–W9 | Sunny | — |
| 6 | Data & Audit Layer | W8–W10 | Karthik, Abhinand | **M3** End-to-End Auth Flow Working |
| 7 | Frontend | W6–W11 | Karthik, Sunny | — |
| 8 | Integration & DevOps | W11–W12 | All | — |
| 9 | Stretch Features | W12–W13 | All | — |
| 10 | Testing & Documentation | W13–W14 | All | **M4** Feature Complete |
| 11 | Final Preparation | W15–W16 | All | **M5** Final Submission |

Two sequencing decisions are deliberate: **Docker Compose integration starts early** (phase 8 consolidates rather than initiates it), and **stretch features sit in their own late phase** so nothing in phases 10–11 depends on them.

### 15.2 Ownership

| Member | Primary ownership |
|---|---|
| Karthik R Nair (20231CSE0041) | Blockchain layer, smart contract, Merkle batching, frontend 3D vault UI and threat graph |
| Sunny Singh (20231CSE0095) | Backend orchestrator, rate limiting, LRU cache, n8n + Twilio automation, mobile companion app |
| Abhinand Baiju Smitha (20231CSE0146) | AI risk engine, threat graph and BFS, MongoDB data layer, testing coordination |

Ownership is **primary, not exclusive** — each member keeps secondary familiarity with an adjacent area. That is the stated mitigation for availability conflicts.

### 15.3 Effort

| Module | Hours |
|---|---|
| Research and planning | 25 |
| Blockchain foundation | 45 |
| Backend core | 55 |
| AI risk engine | 60 |
| Automation and alerts | 25 |
| Data and audit layer | 35 |
| Frontend (web + mobile) | 70 |
| Integration and DevOps | 30 |
| Stretch features | 25 |
| Testing and documentation | 45 |
| Final preparation | 20 |
| **Total** | **435** (≈ 9 hours per member per week over 16 weeks) |

### 15.4 Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Smart contract bugs affecting signature verification | Medium | High | Extensive Hardhat unit tests; minimal single-purpose functions; audited ECDSA library |
| AI model overfits to insufficient training data | High | Medium | Rule-based scorer is the shipped baseline; the learned model is an upgrade, never a dependency |
| Timeline slippage on stretch features | Medium | Low | MoSCoW tiering; Could-tier items isolated in phase 9 and cut first |
| Integration complexity across many services | Medium | Medium | Docker Compose adopted early; services integrated incrementally |
| Team member availability conflicts | Low | Medium | Clear primary ownership with overlapping secondary familiarity |
| Live demonstration failure via network/blockchain dependency | Medium | High | Rehearse on a fully local Hardhat + Docker Compose setup; **recorded backup video** |

### 15.5 Departmental review schedule **[PDF]**

| Review | Date | Deliverables | Marks |
|---|---|---|---|
| Review 0 | 10–14 Aug 2026 | Finalize title; abstract presentation | 10 |
| Review 1 | 29 Aug 2026 | Literature review; architecture design; expected output; Gantt chart | 20 |
| Review 2 | 12 Sep 2026 | 30% completion; paper draft ready or status | 20 |
| Review 3 | 24 Oct 2026 | 80% completion; paper status; report progress | 50 |
| Expo | 14 Nov 2026 | Poster presentation (50 selected projects) | — |
| Review 4 | 28 Nov 2026 | Report submission; final paper status; final viva voce | 100 |

*The 16-week plan is expressed in relative weeks (W1–W16). Mapping W1 to a calendar date is an open item — see Gap Analysis item G-01 in the TRD.*

---

*End of PRD. See `TRD.md` for how each of these requirements is to be built, and the Gap Analysis at the end of that document for open questions.*
