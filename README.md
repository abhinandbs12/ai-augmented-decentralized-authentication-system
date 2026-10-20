# BlockAuth — Blockchain-Based Wallet Authentication System

> **Passwordless authentication powered by Ethereum wallet signatures, an on-chain identity registry, and a hardened Spring Boot backend.**

[![Java 21](https://img.shields.io/badge/Java-21-blue)](#tech-stack)
[![Spring Boot 4.1](https://img.shields.io/badge/Spring%20Boot-4.1.1-green)](#tech-stack)
[![React 19](https://img.shields.io/badge/React-19.3-61DAFB)](#tech-stack)
[![Solidity 0.8.24](https://img.shields.io/badge/Solidity-0.8.24-363636)](#tech-stack)
[![PRD](https://img.shields.io/badge/Document-PRD.md-purple)](PRD.md)

---

## Table of Contents

- [Product Requirements Document (PRD)](PRD.md)
- [Project Overview](#project-overview)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [System Architecture](#system-architecture)
- [Overall Data Flow](#overall-data-flow)
- [Core Modules — Backend](#core-modules--backend)
- [Core Modules — Frontend](#core-modules--frontend)
- [Smart Contract](#smart-contract)
- [Database Schema](#database-schema)
- [Complete System Workflows & Authentication Flows](#complete-system-workflows--authentication-flows)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Setup and Installation](#setup-and-installation)
- [Running with Docker](#running-with-docker)
- [Testing](#testing)
- [Security Architecture](#security-architecture)
- [Environment Variables](#environment-variables)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Known Limitations](#known-limitations)
- [Ablation Flow](#ablation-flow)
- [Team](#team)

---

## Project Overview

BlockAuth replaces passwords with **proof of wallet ownership**. A user signs a one-time message in MetaMask; the backend verifies the signature, checks the wallet's status in an on-chain identity registry (`WalletRegistry`), computes a trust score, and only then opens a server-side session. Administrators can revoke a wallet on the blockchain, which ends its sessions and blocks further sign-ins until it is reactivated.

### The Problem

| Traditional Auth Problem | How BlockAuth Solves It |
|---|---|
| Weak/reused passwords | No passwords exist — authentication is via cryptographic signatures |
| Password database leaks | The server stores no sign-in secret — only public wallet addresses |
| Credential stuffing | One-time challenges expire in 120s and are usable once |
| Silent account status changes | Status lives on-chain — every change is a blockchain transaction with an event |
| Session hijacking | Fresh wallet signature required for sensitive actions, even while logged in |

### How It Works (Simple)

```
User → "Sign this one-time message" → MetaMask signs with private key
Server → Recovers the signer address from the signature
Server → Asks the smart contract: "Is this wallet registered and active?"
Server → Both pass? → Compute trust score → Start session (or ask for 2FA)
```

---

## Key Features

### 🔐 Wallet Authentication

| Feature | Description |
|---|---|
| **Challenge-Response Login** | EIP-191 `personal_sign` with EIP-4361 (Sign-In with Ethereum) message format |
| **128-bit Random Nonces** | Each challenge is unique, bound to one wallet, one purpose, valid 120s, usable once |
| **On-Chain Verification** | Login succeeds only if `WalletRegistry` contract reports the wallet as registered AND active |
| **Role-Based Access** | `USER` and `ADMIN` roles; administrators bootstrapped from a configured wallet list |
| **Zero-Gas for Users** | Users never send blockchain transactions — MetaMask needs no ETH |

### 🛡️ Account Security

| Feature | Description |
|---|---|
| **Trust Score Engine** | Each sign-in scored from 100 down (new device −30, new network −20, flagged wallet −35, repeated failures −25, linked to flagged −35). Low scores require 2FA or are refused |
| **TOTP Second Step** | Optional authenticator-app codes (RFC 6238) and 10 one-time backup codes |
| **Device Recognition** | Browser fingerprinted via secure cookie; trusted devices skip 2FA for configurable days |
| **New Sign-In Alerts** | Sign-in on a new device triggers alert on other sessions with "This was me" / "This was not me" |
| **Fresh Signatures** | Sensitive actions (revoke, emergency stop, 2FA changes, API keys) require a new wallet signature |
| **Session Management** | View all active sessions, sign out any of them, or sign out everywhere else |

### ⚙️ Administration & Monitoring

| Feature | Description |
|---|---|
| **On-Chain Wallet Revocation** | Immediate revocation; sessions end on next request |
| **Delayed Reactivation** | Wallet reactivation waits a configurable period; any admin can cancel |
| **Emergency Stop** | Pause registrations, reactivations, 2FA resets, and optionally user sign-ins |
| **Wallet Flagging** | Flag suspicious wallets to lower their trust score and linked wallets' scores |
| **Audit Logging** | Every authentication outcome and detected attack recorded — 21 auth event types, 15 attack types |
| **Admin Dashboard** | Statistics, user/wallet list, on-chain lookup, security events, trust score logs |
| **Read-Only API Keys** | Scoped keys (`users:read`, `audit:read`, `wallet-status:read`) for scripts, valid up to 90 days |

---

## Tech Stack

### Backend

| Technology | Version | Purpose |
|---|---|---|
| **Java** | 21 (LTS) | Runtime |
| **Spring Boot** | 4.1.1 | Web framework, Security, Data JPA, Validation, Actuator, Flyway |
| **Web3j** | 5.0.0 | Blockchain client — contract calls, transaction signing, EIP-191 signature recovery |
| **Bouncy Castle** | 1.86 (`jdk18on`) | Cryptographic provider (patched from Web3j's older `jdk15on`) |
| **PostgreSQL** | Neon (cloud) | Persistent storage — 15 tables managed by Flyway |
| **HikariCP** | (managed) | Connection pooling (5 max connections, 30s socket timeout) |
| **Maven** | Wrapper included | Build tool |

### Frontend

| Technology | Version | Purpose |
|---|---|---|
| **React** | 19.3.0 | UI library |
| **React Router** | 7.18.4 | Client-side routing |
| **Vite** | 8.3.3 | Dev server (port 5173) and production bundler |
| **Plain CSS** | — | All styling via CSS custom properties (dark theme, 19 KB) |
| **MetaMask** | Latest | Wallet extension — `eth_requestAccounts` + `personal_sign` |

### Smart Contract

| Technology | Version | Purpose |
|---|---|---|
| **Solidity** | 0.8.24 | Smart contract language |
| **Hardhat** | 2.29.1 | Compilation, testing, local node (chain ID 31337) |
| **ethers.js** | 6.17.0 | Test framework integration |

### Infrastructure

| Technology | Purpose |
|---|---|
| **Docker Compose** | Optional local stack: Hardhat node + Backend (Temurin 21) + Frontend (nginx) |
| **nginx** | Production frontend serving with security headers |
| **OWASP ZAP** | Security scanning (baseline + API scans) |
| **Postman** | API regression collection (84 requests) |

### Cryptographic Algorithms

| Algorithm | Used For | Location |
|---|---|---|
| secp256k1 ECDSA + EIP-191 prefix | Wallet signature verification | `SignatureVerifier.java` |
| Keccak-256 | Address derivation, EIP-55 checksums | `WalletAddresses.java` |
| SHA-256 | Device token hashing, API key secret hashing | `Tokens.java` |
| HMAC-SHA256 | Backup code hashing, key derivation | `Tokens.java` |
| HMAC-SHA1 (RFC 6238) | TOTP authenticator codes | `Totp.java` |
| AES-256-GCM | Authenticator secret encryption at rest | `SecretBox.java` |
| `SecureRandom` | Nonces, tokens, secrets, backup codes | Multiple |

---

## System Architecture

### High-Level Architecture Diagram

```mermaid
flowchart TB
    subgraph "Client Layer"
        USER["👤 User<br/>Desktop Chrome"]
        MM["🦊 MetaMask<br/>Private Key Holder"]
        SCRIPT["📜 Script<br/>API Key Holder"]
    end

    subgraph "Frontend Layer"
        SPA["⚛️ React SPA<br/>Vite :5173 / nginx :3000<br/><i>11 pages · 17 components</i>"]
    end

    subgraph "Security Layer"
        RATE["🚦 Rate Limiter<br/>10 auth/min, 120 general/min"]
        ORIGIN["🌐 Origin Check<br/>POST must match APP_ORIGIN"]
        CSRF_F["🔒 CSRF Filter<br/>X-XSRF-TOKEN header only"]
        APIKEY_F["🔑 API Key Filter<br/>X-API-Key, scoped access"]
        ACTIVE["👁️ Active User Filter<br/>Re-checks session + role every request"]
        SIZE["📏 Size Limit<br/>16 KB max body"]
    end

    subgraph "Application Layer"
        AUTH["🔐 Auth Module<br/>Challenge · Signature · Login<br/>Registration · StepUp"]
        SESSION_M["📋 Session Module<br/>Sessions · Devices · Alerts"]
        TRUST["📊 Trust Engine<br/>Score · Flags · Device Graph"]
        SECOND["🔢 Second Step<br/>TOTP · Backup Codes"]
        ADMIN_M["⚙️ Admin Module<br/>Revoke · Emergency Stop<br/>Delayed Actions · Stats"]
        AUDIT_M["📝 Audit Module<br/>Auth Events · Security Events"]
        APIKEY_M["🔑 API Key Module<br/>Scoped Read-Only Keys"]
    end

    subgraph "Blockchain Layer"
        BC_CLIENT["🔗 Web3j Client<br/>Contract reads + operator txs"]
        CHAIN["⛓️ Hardhat Node :8545<br/>Chain ID 31337"]
        CONTRACT["📜 WalletRegistry.sol<br/>Status: None → Active ↔ Revoked"]
    end

    subgraph "Data Layer"
        DB[("🗄️ PostgreSQL<br/>Neon Cloud<br/><i>15 tables · Flyway</i>")]
    end

    USER -->|"Clicks"| SPA
    SPA <-->|"eth_requestAccounts<br/>personal_sign"| MM
    SCRIPT -->|"GET + X-API-Key"| RATE
    SPA -->|"/api (same origin)<br/>HttpOnly cookie"| RATE

    RATE --> ORIGIN --> CSRF_F --> APIKEY_F --> ACTIVE --> SIZE

    SIZE --> AUTH
    SIZE --> SESSION_M
    SIZE --> ADMIN_M
    SIZE --> APIKEY_M

    AUTH --> TRUST
    AUTH --> SECOND
    AUTH --> SESSION_M
    AUTH --> AUDIT_M
    AUTH --> BC_CLIENT

    ADMIN_M --> BC_CLIENT
    ADMIN_M --> AUDIT_M

    BC_CLIENT --> CHAIN
    CHAIN --- CONTRACT

    AUTH --> DB
    SESSION_M --> DB
    TRUST --> DB
    SECOND --> DB
    ADMIN_M --> DB
    AUDIT_M --> DB
    APIKEY_M --> DB
```

### Component Responsibility Matrix

```mermaid
flowchart LR
    subgraph Frontend["Frontend (React SPA)"]
        F1["Pages & Routes"]
        F2["Wallet Bridge"]
        F3["API Client"]
        F4["Auth Context"]
    end
    subgraph Backend["Backend (Spring Boot)"]
        B1["REST Controllers"]
        B2["Service Layer"]
        B3["Security Filters"]
        B4["Background Jobs"]
    end
    subgraph Chain["Blockchain"]
        C1["WalletRegistry"]
        C2["Hardhat Node"]
    end
    subgraph Data["Database"]
        D1["Users & Sessions"]
        D2["Challenges"]
        D3["Audit Events"]
        D4["Security Data"]
    end
```

### Physical & Network Infrastructure Topology

```mermaid
graph TB
    subgraph ClientDevice["Client Host (Desktop / Chrome)"]
        BROWSER["Web Browser Engine"]
        SPA_CLIENT["React 19 SPA (Client UI)<br/>Hosted via Vite (5173) or Nginx (3000)"]
        METAMASK_EXT["MetaMask Extension Vault<br/>secp256k1 Private Keys Stored Locally<br/>EIP-1193 Provider"]
        
        BROWSER --- SPA_CLIENT
        SPA_CLIENT <-->|"EIP-1193 RPC (in-memory)<br/>eth_requestAccounts<br/>personal_sign"| METAMASK_EXT
    end

    subgraph LocalHost["Local Docker / Host Environment (127.0.0.1)"]
        BACKEND_SRV["Spring Boot 4.1.1 API (JVM 21)<br/>Port: 8080<br/>• 6 Security Filters<br/>• Web3j Client<br/>• Trust Engine"]
        HARDHAT_NODE["Hardhat EVM Local Node<br/>Port: 8545 · Chain ID: 31337<br/>Holds WalletRegistry.sol"]
        OPERATOR_KEY["Operator Private Key (0xac09...)<br/>Signs on-chain mutations"]
        
        BACKEND_SRV <-->|"JSON-RPC 2.0 (HTTP :8545)<br/>• eth_call (free status reads)<br/>• eth_sendRawTransaction (operator txs)"| HARDHAT_NODE
        OPERATOR_KEY -.->|"Transaction Signing"| BACKEND_SRV
    end

    subgraph RemoteCloud["Cloud Infrastructure"]
        POSTGRES_NEON[("PostgreSQL 16 (Neon Serverless)<br/>Port: 5432 · SSL: Required<br/>15 Tables via Flyway<br/>HikariCP Pool (Max 5 Conns)")]
    end

    SPA_CLIENT <-->|"HTTP/1.1 REST + JSON (:8080)<br/>SameSite=Strict, HttpOnly Cookies<br/>Header: X-XSRF-TOKEN"| BACKEND_SRV
    BACKEND_SRV <-->|"Encrypted TLS JDBC (:5432)"| POSTGRES_NEON
```

### Layered Communication Protocols Matrix

```mermaid
flowchart LR
    subgraph L_APP["Application Layer"]
        REACT["React SPA"]
        SPRING["Spring Boot"]
        SOL["Solidity Contract"]
    end

    subgraph L_SEC["Security & Trust Layer"]
        SIG["EIP-191 Signatures"]
        COOKIES["HttpOnly Cookies"]
        CSRF_H["Double-Submit XSRF"]
        AES["AES-256-GCM / HMAC"]
    end

    subgraph L_TRANS["Transport & Wire Protocols"]
        HTTP["HTTP/1.1 / JSON-RPC 2.0"]
        JDBC["JDBC over TLS (HikariCP)"]
        EIP1193["EIP-1193 / window.ethereum"]
    end

    subgraph L_TARGETS["Infrastructure Targets"]
        HARDHAT_NODE["Hardhat EVM Node"]
        POSTGRES_NEON["PostgreSQL (Neon Cloud)"]
    end

    REACT -->|"EIP-1193"| SIG
    SIG -->|"EIP-191 Hex (132 chars)"| HTTP
    REACT -->|"X-XSRF-TOKEN + Cookie"| HTTP
    HTTP -->|"Filter Chain"| SPRING
    SPRING -->|"AES-256-GCM (TOTP)"| AES
    SPRING -->|"HikariCP Pool"| JDBC
    JDBC --> POSTGRES_NEON
    SPRING -->|"Web3j JSON-RPC"| HTTP
    HTTP --> HARDHAT_NODE
    HARDHAT_NODE --- SOL
```

---

## Overall Data Flow

### Complete Request Lifecycle

```mermaid
sequenceDiagram
    autonumber
    participant U as User Browser
    participant FE as React SPA
    participant F as Security Filters
    participant C as Controller
    participant S as Service
    participant DB as PostgreSQL
    participant BC as Blockchain

    U->>FE: User Action
    FE->>F: HTTP Request + Cookie + CSRF
    
    Note over F: 1. Rate Limit Check
    Note over F: 2. Origin Validation
    Note over F: 3. CSRF Token Match
    Note over F: 4. API Key (if present)
    Note over F: 5. Session Valid?
    Note over F: 6. Body Size ≤ 16KB

    alt Any check fails
        F-->>FE: 401/403/429 Error
    else All checks pass
        F->>C: Validated Request
        C->>S: Business Logic
        S->>DB: Read/Write
        S->>BC: Chain Read/Write (if needed)
        S-->>C: Result
        C-->>FE: JSON Response
        FE-->>U: UI Update
    end
```

### Data Flow by Feature

```mermaid
flowchart LR
    subgraph "Registration Flow"
        R1[Connect Wallet] --> R2[Get Challenge]
        R2 --> R3[Sign in MetaMask]
        R3 --> R4[Verify Signature]
        R4 --> R5[Check Chain]
        R5 --> R6[Register On-Chain]
        R6 --> R7[Create User Row]
    end

    subgraph "Login Flow"
        L1[Connect Wallet] --> L2[Get Challenge]
        L2 --> L3[Sign in MetaMask]
        L3 --> L4[Verify Signature]
        L4 --> L5[Check Chain Status]
        L5 --> L6[Compute Trust Score]
        L6 -->|"≥90"| L7[Create Session]
        L6 -->|"50-89 + 2FA"| L8[Ask Second Step]
        L6 -->|"<50 no 2FA"| L9[Refuse]
    end

    subgraph "Admin Action Flow"
        A1[Step-Up Challenge] --> A2[Sign in MetaMask]
        A2 --> A3[Verify Fresh Sig]
        A3 --> A4{Action Type}
        A4 -->|Revoke| A5[Immediate TX]
        A4 -->|Activate| A6[Schedule + Delay]
        A4 -->|Emergency| A7[Toggle Stop]
    end
```

---

## Core Modules — Backend

### Module Architecture

```mermaid
graph TB
    subgraph "com.blockauth"
        APP["BlockAuthApplication.java<br/><i>Entry point · @EnableScheduling · UTC Clock</i>"]
        
        subgraph auth["auth/ — 18 files"]
            AC[AuthController]
            CS[ChallengeService]
            SV[SignatureVerifier]
            LS[LoginService]
            RS[RegistrationService]
            SS[SessionService]
            SU[StepUpService]
            PS[PendingSecondStep]
            CMF[ChallengeMessageFactory]
            CCJ[ChallengeCleanupJob]
        end

        subgraph admin["admin/ — 10 files"]
            ADC[AdminController]
            CC[ControlsController]
            AWS[AdminWalletService]
            AAS[AdminActionService]
            ESS[EmergencyStopService]
            STATS[StatisticsService]
        end

        subgraph session["session/ — 16 files"]
            SC2[SessionController]
            SM[SessionManagement]
            SR[SessionRegistry]
            SL[SessionLifecycle]
            DC[DeviceCookie]
        end

        subgraph risk["risk/ — 8 files"]
            RC[RiskController]
            TS[TrustService]
            TP[TrustPolicy]
            WFS[WalletFlagService]
        end

        subgraph secondstep["secondstep/ — 8 files"]
            SSC[SecondStepController]
            SSS[SecondStepService]
            TOTP[Totp]
            SB[SecretBox]
        end

        subgraph blockchain["blockchain/ — 5 files"]
            BC2[BlockchainController]
            WRC[WalletRegistryClient]
            BSV[BlockchainStartupVerifier]
        end

        subgraph security["security/ — 9 files"]
            AUF[ActiveUserFilter]
            RLF[RateLimitFilter]
            OCF[OriginCheckFilter]
            RSL[RequestSizeLimitFilter]
            IRL[InMemoryRateLimiter]
        end

        subgraph audit["audit/ — 11 files"]
            AS[AuditService]
            AER[AuthenticationEventRepo]
            SER[SecurityEventRepo]
        end

        subgraph apikey["apikey/ — 9 files"]
            AKC[ApiKeyController]
            AKS[ApiKeyService]
            AKF[ApiKeyFilter]
        end

        subgraph common["common/ — 10 files"]
            EC[ErrorCode — 48 codes]
            GEH[GlobalExceptionHandler]
            WA[WalletAddresses]
            TK[Tokens]
        end

        subgraph config["config/ — 5 files"]
            SECFG[SecurityConfig]
            BAP[BlockAuthProperties]
            SECSETTINGS[SecuritySettings]
        end
    end
```

### Backend Module Details

| Module | Files | Key Classes | Responsibility |
|---|---|---|---|
| **`auth/`** | 18 | `AuthController`, `ChallengeService`, `SignatureVerifier`, `LoginService`, `RegistrationService`, `SessionService`, `StepUpService` | Challenge-response authentication, signature verification, session creation, fresh signatures for sensitive actions |
| **`admin/`** | 10 | `AdminController`, `ControlsController`, `AdminWalletService`, `AdminActionService`, `EmergencyStopService`, `StatisticsService` | Wallet revoke/activate, emergency stop toggle, delayed action scheduling, aggregate statistics |
| **`session/`** | 16 | `SessionManagement`, `SessionRegistry`, `SessionLifecycle`, `DeviceCookie`, `SignInAlert` | Server-side session tracking, device recognition via hashed tokens, new-device alerts, session end on various triggers |
| **`risk/`** | 8 | `TrustService`, `TrustPolicy`, `WalletFlagService`, `LoginAssessment` | Trust score computation (single SQL query with recursive CTE), policy decisions, wallet flagging |
| **`secondstep/`** | 8 | `SecondStepService`, `Totp`, `SecretBox`, `BackupCode` | TOTP setup/verify, AES-256-GCM encryption, backup code generation (keyed HMAC), rate-limited code attempts |
| **`blockchain/`** | 5 | `WalletRegistryClient`, `BlockchainStartupVerifier` | All contract interaction (reads via `eth_call`, writes via signed operator txs), startup chain/contract validation |
| **`security/`** | 9 | `ActiveUserFilter`, `RateLimitFilter`, `OriginCheckFilter`, `InMemoryRateLimiter` | 6-layer filter chain: rate limiting, origin checking, session re-validation, body size limits |
| **`audit/`** | 11 | `AuditService`, `AuthenticationEvent`, `SecurityEvent` | Records 21 auth event types + 15 attack types; writes never break the operation they record |
| **`apikey/`** | 9 | `ApiKeyService`, `ApiKeyFilter` | Read-only API keys with scoped access; SHA-256 hashed secrets, constant-time comparison |
| **`user/`** | 8 | `UserService`, `UserController`, `User` | User entity, profile, chain status mirror, role assignment at registration |
| **`common/`** | 10 | `ErrorCode` (48 codes), `GlobalExceptionHandler`, `WalletAddresses`, `Tokens` | Error catalog, exception handling, address validation (EIP-55), cryptographic utilities |
| **`config/`** | 5 | `SecurityConfig`, `BlockAuthProperties`, `SecuritySettings` | Spring Security filter chain, typed configuration binding with startup validation |

### Backend Key Functions

| Function | What It Does |
|---|---|
| `ChallengeService.consume()` | Atomic single-use challenge consumption in its own committed transaction |
| `SignatureVerifier.verify()` | EIP-191 signature recovery via Web3j; rejects high-s duplicates (EIP-2) |
| `LoginService.login()` | Full sign-in pipeline: challenge → signature → chain → trust → session or 2FA |
| `TrustPolicy.score()` | Pure function: 6 signals → score starting at 100 minus applicable penalties |
| `WalletRegistryClient.send()` | Synchronized operator transaction with gas estimation, receipt polling, 30s timeout |
| `AdminActionService.runDue()` | Scheduled every 15s; executes delayed actions, retries on temporary failure |
| `SecondStepService.verifyCode()` | Checks TOTP (current ±1 step, never reused) or backup code (keyed HMAC, one-time) |

---

## Core Modules — Frontend

### Frontend Architecture

```mermaid
graph TB
    subgraph "React SPA (frontend/src/)"
        MAIN["main.jsx<br/><i>BrowserRouter + AuthProvider</i>"]
        APP["App.jsx<br/><i>11 Routes + Layout</i>"]
        
        subgraph pages["pages/ — 11 pages"]
            HOME[Home]
            REG[Register]
            LOGIN[Login]
            DASH[Dashboard]
            HIST[History]
            WS[WalletStatus]
            ACCSEC[AccountSecurity]
            ADMINDASH[AdminDashboard]
            WALLETMGMT[WalletManagement]
            SECMON[SecurityMonitoring]
            ADMINCTRL[AdminControls]
        end

        subgraph components["components/ — 17 components"]
            LAYOUT[Layout]
            NAVBAR[NavBar]
            SCF[SignChallengeFlow]
            WCB[WalletConnectButton]
            DT[DataTable]
            PAG[Pagination]
            ALERT[Alert]
            CONFIRM[ConfirmDialog]
            REQAUTH[RequireAuth]
            REQADMIN[RequireAdmin]
        end

        subgraph api["api/ — 4 files"]
            CLIENT["client.js<br/><i>fetch wrapper + CSRF + errors</i>"]
            AUTHAPI["auth.js<br/><i>signAndSubmit flow</i>"]
            STEPUP["stepUp.js<br/><i>withProof flow</i>"]
            USEAPI["useApi.js<br/><i>GET hook with loading/error</i>"]
        end

        subgraph context["context/"]
            AUTHCTX["AuthContext.jsx<br/><i>Session state · login/logout<br/>Wallet tracking · 2FA</i>"]
        end

        subgraph wallet["wallet/"]
            METAMASK["metamask.js<br/><i>connectWallet · signMessage<br/>onAccountsChanged</i>"]
        end

        subgraph styles["styles/"]
            CSS["global.css<br/><i>19 KB · Dark theme<br/>CSS custom properties</i>"]
        end
    end
```

### Frontend Pages

| Page | Route | Role | Description |
|---|---|---|---|
| **Home** | `/` | Public | Landing page with wallet connection |
| **Register** | `/register` | Public | Challenge-response wallet registration |
| **Login** | `/login` | Public | Challenge-response sign-in with 2FA support |
| **Dashboard** | `/dashboard` | USER/ADMIN | Profile overview, session info, wallet status |
| **History** | `/history` | USER/ADMIN | Own authentication events (filterable, paginated) |
| **Wallet Status** | `/wallet-status` | USER/ADMIN | Live blockchain status of own wallet |
| **Account Security** | `/security` | USER/ADMIN | Sessions, devices, alerts, 2FA management |
| **Admin Dashboard** | `/admin` | ADMIN | Statistics, user list, quick actions |
| **Wallet Management** | `/admin/wallets` | ADMIN | Revoke/activate wallets, on-chain lookup |
| **Security Monitoring** | `/admin/security` | ADMIN | Security events, auth events, trust scores |
| **Admin Controls** | `/admin/controls` | ADMIN | Flags, emergency stop, delayed actions, API keys |

### Frontend Key Design Decisions

| Decision | Rationale |
|---|---|
| **No web storage** | Session state is HttpOnly cookie only; React context mirrors `/api/users/me` in memory |
| **No TypeScript** | Keeps the project accessible for study |
| **No CSS framework** | Plain CSS with custom properties — project specification forbids UI libraries |
| **No ethers.js/web3.js in frontend** | Only `window.ethereum.request` is used — minimal wallet surface |
| **Automatic session detection** | 401 responses trigger sign-out + redirect via API client hooks |
| **Wallet change auto-logout** | MetaMask `accountsChanged` event signs out stale sessions |
| **CSRF retry** | `CSRF_INVALID` error automatically fetches a new token and retries once |

---

## Smart Contract

### WalletRegistry State Machine

```mermaid
stateDiagram-v2
    [*] --> None: Deploy
    None --> Active: registerWallet()
    Active --> Revoked: revokeWallet()
    Revoked --> Active: activateWallet()
    
    note right of None
        Default state.
        Cannot return here
        once registered.
    end note
    
    note right of Active
        Wallet can sign in.
        Emits WalletRegistered
        or WalletActivated.
    end note
    
    note right of Revoked
        Wallet blocked.
        Sessions end.
        Emits WalletRevoked.
    end note
```

### Contract Interface

| Element | Description |
|---|---|
| `admin` | Immutable address set at deployment — the only account that can change state |
| `registerWallet(address)` | Admin only. Fails for zero address and any previously registered wallet |
| `revokeWallet(address)` | Admin only. Requires `Active` state |
| `activateWallet(address)` | Admin only. Requires `Revoked` state |
| `isRegistered(address)` | Free read — `true` if ever registered |
| `isActive(address)` | Free read — `true` only if currently `Active` |
| `getWalletStatus(address)` | Free read — returns `(registered, active, registeredAt)` |
| **Events** | `WalletRegistered`, `WalletRevoked`, `WalletActivated` — each with wallet + timestamp |
| **Errors** | `NotAdmin`, `ZeroAddress`, `AlreadyRegistered`, `NotRegistered`, `AlreadyRevoked`, `AlreadyActive` |
| **Safety** | No `payable` functions, no `receive()`/`fallback()`, no external calls, constant gas per operation |

---

## Database Schema

### Entity Relationship Diagram

```mermaid
erDiagram
    users {
        uuid id PK
        varchar wallet_address UK
        varchar role "USER | ADMIN"
        varchar status "ACTIVE | REVOKED"
        timestamptz created_at
        timestamptz updated_at
    }
    
    authentication_challenges {
        bigint id PK
        varchar wallet_address
        varchar purpose "REGISTRATION | LOGIN | ACTION"
        varchar nonce UK
        text challenge UK
        timestamptz expires_at
        boolean used
        varchar action "nullable"
        uuid session_id FK "nullable"
    }
    
    devices {
        uuid id PK
        varchar token_hash UK "SHA-256"
        varchar label
    }
    
    user_devices {
        uuid id PK
        uuid user_id FK
        uuid device_id FK
        timestamptz trusted_until "nullable"
        timestamptz removed_at "nullable"
    }
    
    user_sessions {
        uuid id PK
        uuid user_id FK
        uuid device_id FK
        varchar ip_address
        boolean second_step
        timestamptz ended_at "nullable"
        varchar end_reason "nullable"
    }
    
    sign_in_alerts {
        bigint id PK
        uuid user_id FK
        uuid session_id FK UK
        varchar resolution "nullable"
    }
    
    second_factors {
        uuid user_id PK
        varchar secret_ciphertext "AES-256-GCM"
        timestamptz enabled_at "nullable"
        bigint last_used_step
    }
    
    backup_codes {
        bigint id PK
        uuid user_id FK
        varchar code_hash "HMAC-SHA256"
        timestamptz used_at "nullable"
    }
    
    wallet_flags {
        varchar wallet_address PK
        varchar reason
        uuid flagged_by FK
    }
    
    login_assessments {
        bigint id PK
        varchar wallet_address
        uuid user_id FK
        integer score "0-100"
        varchar decision "ALLOW | SECOND_STEP | REFUSE"
    }
    
    emergency_stop {
        integer id PK "always 1"
        boolean active
        boolean block_logins
    }
    
    admin_actions {
        bigint id PK
        varchar action
        varchar target_wallet
        varchar status "PENDING → EXECUTED"
        timestamptz execute_after
    }
    
    api_keys {
        uuid id PK
        uuid owner_id FK
        varchar secret_hash UK "SHA-256"
        varchar scopes
        timestamptz expires_at
    }
    
    authentication_events {
        bigint id PK
        uuid user_id FK
        varchar event_type "21 types"
        varchar event_status
    }
    
    security_events {
        bigint id PK
        varchar attack_type "15 types"
        varchar result "BLOCKED | DETECTED"
    }
    
    users ||--o{ user_devices : has
    users ||--o{ user_sessions : has
    users ||--o{ authentication_events : logged
    users ||--o{ security_events : logged
    users ||--o| second_factors : may_have
    users ||--o{ backup_codes : may_have
    users ||--o{ api_keys : owns
    users ||--o{ admin_actions : requests
    devices ||--o{ user_devices : linked
    devices ||--o{ user_sessions : used_in
    user_sessions ||--o| sign_in_alerts : triggers
```

### Data Security

| Data Type | Storage Method |
|---|---|
| Device tokens | SHA-256 hash only |
| API key secrets | SHA-256 hash only |
| Backup codes | Keyed HMAC-SHA256 (low-entropy codes need a keyed hash) |
| TOTP secrets | AES-256-GCM encrypted |
| Wallet addresses | Lowercase, CHECK constraint enforced |
| Timestamps | `TIMESTAMPTZ` in UTC |
| Enum values | Database `CHECK` constraints (not just app-level) |

---

## Complete System Workflows & Authentication Flows

This section documents every operational and security workflow within BlockAuth with end-to-end architectural sequence diagrams, state machines, and decision logic trees.

---

### Workflow 1: Web3 Wallet Connection & Account Change Detection

Handles browser wallet discovery, EIP-1193 provider binding, account change detection, and automatic session revocation upon wallet switching.

```mermaid
sequenceDiagram
    autonumber
    actor User as User Browser
    participant MM as MetaMask (EIP-1193)
    participant FE as React SPA (AuthContext)
    participant API as Spring Boot API

    User->>FE: Click "Connect Wallet"
    FE->>MM: window.ethereum.request({ method: 'eth_requestAccounts' })
    MM->>User: Request account selection prompt
    User->>MM: Approves 0x1234...
    MM-->>FE: Return [0x1234...]
    FE->>FE: Set state: connectedWallet = 0x1234...
    FE->>API: GET /api/blockchain/wallet/0x1234...
    API-->>FE: Return { registered, active }
    FE-->>User: Display Wallet Connected Badge

    Note over User,API: Account Switching Detection (Security Defense)
    User->>MM: Switch active account to 0xABCD... in MetaMask
    MM->>FE: Emit 'accountsChanged' event ([0xABCD...])
    Note over FE: Stale session detected! Active session does not match new wallet.
    FE->>API: POST /api/auth/logout (clear session cookie)
    FE->>FE: Reset AuthContext: user = null, isAuthenticated = false
    FE-->>User: Redirect to /login with notification: "Wallet changed. Please sign in."
```

---

### Workflow 2: Challenge-Response User Registration

Registers a new wallet address cryptographically, submits an on-chain registration transaction via the backend operator key, and creates the user identity record.

```mermaid
sequenceDiagram
    autonumber
    actor User as User Browser
    participant FE as React SPA
    participant MM as MetaMask
    participant BE as Spring Boot API
    participant DB as PostgreSQL
    participant SC as WalletRegistry.sol

    User->>FE: Click "Connect Wallet"
    FE->>MM: eth_requestAccounts
    MM-->>FE: wallet address (e.g. 0xUser...)

    User->>FE: Click "Sign & Register"
    FE->>BE: POST /api/auth/register/challenge<br/>{ walletAddress: "0xUser..." }
    BE->>DB: Store challenge (nonce, REGISTRATION purpose, 120s expiry)
    BE-->>FE: 201 Created { challenge, nonce, expiresAt }

    FE->>FE: Display challenge message + 120s countdown
    FE->>MM: personal_sign(challenge)
    MM->>User: "Sign this message?"
    User->>MM: Approve
    MM-->>FE: signature (0x + 130 hex characters = 132 chars)

    FE->>BE: POST /api/auth/register<br/>{ walletAddress, challenge, signature }
    BE->>DB: Atomically consume challenge (used = true, REQUIRES_NEW)
    BE->>BE: Recover signer address from stored challenge text<br/>Compare recovered address == walletAddress
    BE->>SC: getWalletStatus(0xUser...) via eth_call

    alt Wallet not yet registered on-chain
        BE->>SC: registerWallet(0xUser...) [signed by Operator Key]
        SC-->>BE: Transaction receipt (Status 1 = Success)
        SC->>SC: emit WalletRegistered(0xUser, block.timestamp)
    end

    BE->>DB: INSERT INTO users (wallet_address, role, status)<br/>Role: ADMIN if in BLOCKAUTH_ADMIN_WALLETS, else USER
    BE->>DB: Record AUTHENTICATION_EVENT (REGISTRATION, SUCCESS)
    BE-->>FE: 201 Created { walletAddress, role, status, registeredAt, transactionHash }
    FE->>User: Display success banner: "Registration complete. Please sign in."
```

---

### Workflow 3: Authentication & Adaptive Risk Evaluation (Login)

The primary sign-in pipeline integrating EIP-191 signature recovery, low-$s$ canonical validation, on-chain status verification, single-query trust scoring, and session issuance.

```mermaid
sequenceDiagram
    autonumber
    actor User as User Browser
    participant FE as React SPA
    participant MM as MetaMask
    participant BE as Spring Boot API
    participant DB as PostgreSQL
    participant SC as WalletRegistry.sol

    User->>FE: Connect wallet + Click "Sign Challenge"
    FE->>BE: POST /api/auth/challenge { walletAddress }
    BE->>DB: Store challenge (LOGIN purpose, 120s expiry)
    BE-->>FE: 201 Created { challenge, nonce, expiresAt }

    FE->>MM: personal_sign(challenge)
    MM-->>FE: 0xSignature

    FE->>BE: POST /api/auth/verify<br/>{ walletAddress, challenge, signature }
    
    BE->>DB: Consume challenge atomically (atomic single-use)
    BE->>BE: Recover signer via secp256k1 (assert s <= secp256k1.n/2)<br/>Assert signer == walletAddress
    
    BE->>SC: getWalletStatus(walletAddress) via eth_call
    SC-->>BE: { registered: true, active: true }
    
    BE->>DB: Load user row & check emergency_stop state

    Note over BE,DB: Trust Score Computation (Single SQL query with recursive CTE)
    BE->>DB: SELECT signals (has_history, known_device, known_network,<br/>flagged_wallet, recent_failures, linked_to_flagged)

    alt Trust Score >= 90 (ALLOW)
        BE->>DB: INSERT user_sessions + link user_devices
        BE->>DB: Record AUTHENTICATION_EVENT (LOGIN, SUCCESS)
        BE-->>FE: 200 OK + Set-Cookie: BLOCKAUTH_SESSION (HttpOnly, SameSite=Strict)
        FE->>User: Redirect to /dashboard
    else Trust Score 50-89 & 2FA Enrolled (SECOND_STEP)
        BE-->>FE: 202 Accepted { status: "SECOND_STEP_REQUIRED", expiresAt: +5m }
        FE->>User: Render 2FA Code Input Modal
        User->>FE: Enter 6-digit TOTP code
        FE->>BE: POST /api/auth/second-step { code: "123456" }
        BE->>BE: Decrypt secret (AES-256-GCM) & verify TOTP code
        BE->>DB: INSERT user_sessions (second_step: true)
        BE-->>FE: 200 OK + Set-Cookie: BLOCKAUTH_SESSION
        FE->>User: Redirect to /dashboard
    else Trust Score < 50 without 2FA (REFUSE)
        BE->>DB: Record AUTH_EVENT (FAILURE) + SECURITY_EVENT (LOW_TRUST_LOGIN)
        BE-->>FE: 403 Forbidden { code: "LOGIN_RISK_TOO_HIGH" }
        FE->>User: Show Security Block Alert
    end
```

---

### Workflow 4: Adaptive Trust Score Decision Tree & Penalty Engine

Computes risk penalties starting from a baseline score of 100 using relational contextual signals and device-graph traversals.

```mermaid
flowchart TD
    START["Cryptographic Signature & Chain Status Passed<br/>Initial Score = 100"] --> S1{First-ever<br/>sign-in?}
    
    S1 -->|Yes| P1["−30 NEW_DEVICE"]
    S1 -->|No| S2{Known<br/>device?}
    
    S2 -->|No| P1
    S2 -->|Yes| S3{Known<br/>network?}
    
    P1 --> S3
    
    S3 -->|No| P2["−20 NEW_NETWORK"]
    S3 -->|Yes| S4{Wallet<br/>flagged?}
    
    P2 --> S4
    
    S4 -->|Yes| P3["−35 FLAGGED_WALLET"]
    S4 -->|No| S5{"≥3 recent<br/>failures<br/>from this IP?"}
    
    P3 --> S5
    
    S5 -->|Yes| P4["−25 REPEATED_FAILURES"]
    S5 -->|No| S6{"Linked to<br/>flagged wallet<br/>(≤3 hops in graph)?"}
    
    P4 --> S6
    
    S6 -->|Yes| P5["−35 LINKED_TO_FLAGGED"]
    S6 -->|No| DECIDE{Evaluate Final Score}
    
    P5 --> DECIDE
    
    DECIDE -->|"≥ 90"| ALLOW["✅ ALLOW<br/>Session created immediately"]
    DECIDE -->|"50–89 + 2FA enrolled"| STEP["🔢 SECOND_STEP_REQUIRED<br/>Require TOTP or Backup Code"]
    DECIDE -->|"50–89 + no 2FA"| ALLOW2["✅ ALLOW<br/>Medium risk accepted, alert issued"]
    DECIDE -->|"< 50 + no 2FA"| REFUSE["❌ REFUSE (HTTP 403)<br/>LOGIN_RISK_TOO_HIGH"]
    DECIDE -->|"< 50 + 2FA enrolled"| STEP

    style ALLOW fill:#22c55e,color:#fff
    style ALLOW2 fill:#86efac,color:#000
    style STEP fill:#f59e0b,color:#fff
    style REFUSE fill:#ef4444,color:#fff
```

---

### Workflow 5: Two-Factor Authentication (TOTP 2FA) Setup & Activation

Enables RFC 6238 time-based authenticator codes with encrypted secret seeds (AES-256-GCM), HMAC-SHA256 backup codes, and required fresh wallet signature verification.

```mermaid
sequenceDiagram
    autonumber
    actor User as User Browser
    participant FE as React SPA
    participant MM as MetaMask
    participant BE as Spring Boot API
    participant DB as PostgreSQL

    Note over User,DB: Step A: Initiation & Secret Generation
    User->>FE: Click "Enable 2FA" on Account Security
    FE->>BE: POST /api/users/second-step/setup
    BE->>BE: Generate 160-bit cryptographically secure seed<br/>Construct otpauth://totp/BlockAuth:... URI
    BE->>BE: Encrypt seed using AES-256-GCM (SecretBox)
    BE->>DB: INSERT / UPDATE second_factors (secret_ciphertext, enabled_at = NULL)
    BE-->>FE: 200 OK { secretUri, manualEntryKey }
    FE-->>User: Display QR Code & Secret Key

    Note over User,DB: Step B: Step-Up Signature & Code Confirmation
    User->>User: Scan QR code in Authenticator App (Google/Authy)
    User->>FE: Enter 6-digit TOTP code (e.g. 583921)
    FE->>BE: POST /api/auth/step-up { action: "ENABLE_2FA" }
    BE-->>FE: 201 Created { challenge, nonce }
    FE->>MM: personal_sign(challenge)
    MM-->>FE: 0xSignature
    
    FE->>BE: POST /api/users/second-step/enable<br/>{ code: "583921", challenge, signature }
    BE->>BE: Verify fresh Step-Up wallet signature
    BE->>BE: Decrypt seed & verify code against current ±1 time window
    BE->>BE: Generate 10 single-use backup codes (9 characters each)<br/>Compute HMAC-SHA256 for each code
    BE->>DB: UPDATE second_factors SET enabled_at = NOW()<br/>INSERT 10 rows into backup_codes (code_hash)
    BE-->>FE: 200 OK { backupCodes: ["a1b2-c3d4", "e5f6-g7h8", ...] }
    FE-->>User: Display Backup Codes modal (Download / Print)
```

---

### Workflow 6: Multi-Factor Authentication (2FA) Code Verification Flow

Processes second-step authentication attempts during login using TOTP anti-replay tracking or backup code burn.

```mermaid
sequenceDiagram
    autonumber
    actor User as User Browser
    participant FE as React SPA
    participant BE as Spring Boot API
    participant DB as PostgreSQL

    Note over User,DB: Triggered when Trust Score requires SECOND_STEP
    BE-->>FE: 202 Accepted { status: "SECOND_STEP_REQUIRED", tempToken }
    FE-->>User: Render 2FA Verification Modal

    alt Option A: User enters 6-digit Authenticator Code
        User->>FE: Enter "492018"
        FE->>BE: POST /api/auth/second-step { code: "492018" }
        BE->>DB: SELECT secret_ciphertext, last_used_step FROM second_factors
        BE->>BE: Decrypt secret with AES-256-GCM
        BE->>BE: Calculate time steps for t-1, t, t+1 (RFC 6238)
        BE->>BE: Assert matching_step > last_used_step (Anti-replay check)
        BE->>DB: UPDATE second_factors SET last_used_step = matching_step
    else Option B: User enters 9-character Backup Code
        User->>FE: Enter backup code "k9f2-8x2m"
        FE->>BE: POST /api/auth/second-step { code: "k9f2-8x2m" }
        BE->>BE: Compute HMAC-SHA256(backup_code)
        BE->>DB: SELECT id FROM backup_codes WHERE code_hash = ? AND used_at IS NULL
        BE->>DB: UPDATE backup_codes SET used_at = NOW() (Burn single-use code)
    end

    BE->>DB: INSERT user_sessions (second_step = true)
    BE->>DB: Record AUTHENTICATION_EVENT (LOGIN, SUCCESS)
    BE-->>FE: 200 OK + Set-Cookie: BLOCKAUTH_SESSION
    FE-->>User: Authenticated -> Redirect to Dashboard
```

---

### Workflow 7: Step-Up Authentication for Sensitive Operations

Enforces that high-impact actions (wallet revocation, emergency stop, 2FA modifications, API key issuance) require a fresh cryptographic signature, preventing session-hijacking escalation.

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Admin Browser
    participant FE as React SPA
    participant MM as MetaMask
    participant BE as Spring Boot API
    participant DB as PostgreSQL

    Admin->>FE: Clicks sensitive action (e.g., "Revoke Wallet 0xTarget")
    FE->>BE: POST /api/auth/step-up { action: "REVOKE_WALLET" }
    BE->>BE: Generate cryptographically random 128-bit nonce
    BE->>DB: INSERT authentication_challenges (purpose: "ACTION", action: "REVOKE_WALLET", 120s TTL)
    BE-->>FE: 201 Created { challenge, nonce, expiresAt }

    FE->>MM: personal_sign(challenge)
    Note over MM: Prompt explicitly shows:<br/>"BlockAuth Action Authorization: REVOKE_WALLET\nNonce: ..."
    Admin->>MM: Confirms & signs with Admin Private Key
    MM-->>FE: 0xSignature

    FE->>BE: POST /api/admin/wallet/0xTarget/revoke<br/>Headers: X-Step-Up-Challenge, X-Step-Up-Signature
    BE->>DB: Atomically consume action challenge (used = true)
    BE->>BE: Recover signer address from challenge text & signature
    BE->>BE: Assert recovered signer == authenticated session admin wallet
    BE->>BE: Execute authorized sensitive operation
    BE-->>FE: 200 OK { result: "EXECUTED" }
```

---

### Workflow 8: Session Governance & Device Fingerprinting

Manages device cookies, new device detection, and user resolution of unauthorized sign-in alerts.

```mermaid
sequenceDiagram
    autonumber
    actor User as User Browser
    participant FE as React SPA
    participant BE as Spring Boot API
    participant DB as PostgreSQL

    Note over User,DB: Sign-In from New Device Detected
    BE->>BE: BLOCKAUTH_DEVICE cookie absent or hash unrecognized
    BE->>BE: Generate 256-bit secure device token
    BE->>DB: INSERT INTO devices (token_hash = SHA-256(token))
    BE->>DB: INSERT INTO user_devices (trusted_until = NOW() + 30 days)
    BE->>DB: INSERT INTO sign_in_alerts (user_id, session_id, created_at)
    BE-->>FE: Set-Cookie: BLOCKAUTH_DEVICE + Set-Cookie: BLOCKAUTH_SESSION

    Note over User,DB: Alert Notification on Existing Trusted Session
    User->>FE: Opens Dashboard on established computer
    FE->>BE: GET /api/users/alerts
    BE-->>FE: 200 OK [{ alertId: 101, ip: "198.51.100.4", device: "Chrome / Windows", createdAt: "..." }]
    FE-->>User: Render Alert Banner: "New sign-in from 198.51.100.4"

    alt User clicks "This was me"
        User->>FE: Click "This was me"
        FE->>BE: POST /api/users/alerts/101/confirm
        BE->>DB: UPDATE sign_in_alerts SET resolution = 'CONFIRMED'
        BE-->>FE: 200 OK (Alert dismissed)
    else User alarms: "This was not me!"
        User->>FE: Click "This was not me"
        FE->>BE: POST /api/users/alerts/101/sign-out
        BE->>DB: UPDATE user_sessions SET ended_at = NOW(), end_reason = 'ALERT_DISAVOWED' WHERE id = ?
        BE->>DB: UPDATE user_devices SET removed_at = NOW()
        BE->>DB: Record SECURITY_EVENT (attack_type: 'ACCOUNT_TAKEOVER_ATTEMPT')
        BE-->>FE: 200 OK (Remote unauthorized session instantly killed)
    end
```

---

### Workflow 9: On-Chain Wallet Revocation & Instant Session Eviction

Demonstrates instantaneous account revocation: the admin signs a step-up challenge, the backend operator key executes an on-chain revocation transaction, and the target's sessions are terminated immediately.

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Admin Browser
    participant FE as React SPA
    participant BE as Spring Boot API
    participant SC as WalletRegistry.sol
    participant DB as PostgreSQL
    actor Victim as Compromised User Browser

    Admin->>FE: Click "Revoke Wallet" for 0xVictim...
    FE->>BE: Step-Up Signed POST /api/admin/wallet/0xVictim.../revoke
    BE->>BE: Verify Admin Step-Up signature
    BE->>SC: sendTransaction: revokeWallet(0xVictim...) [Signed by Operator Key]
    Note over SC: _statuses[0xVictim] = Status.Revoked<br/>emit WalletRevoked(0xVictim, block.timestamp)
    SC-->>BE: Transaction Receipt (Status: 1 / Success)
    BE->>DB: UPDATE users SET status = 'REVOKED' WHERE wallet_address = '0xVictim'
    BE->>DB: UPDATE user_sessions SET ended_at = NOW(), end_reason = 'WALLET_REVOKED' WHERE user_id = ?
    BE->>DB: Record SECURITY_EVENT (REVOKE_WALLET, BLOCKED)
    BE-->>FE: 200 OK { transactionHash: "0x..." }

    Note over Victim,BE: Victim's Immediate Next Request
    Victim->>BE: GET /api/users/me (Cookie: BLOCKAUTH_SESSION)
    BE->>BE: ActiveUserFilter checks DB user status
    Note over BE: User status is REVOKED / Session terminated!
    BE-->>Victim: 401 Unauthorized { code: "WALLET_REVOKED" }
    Victim->>Victim: Clear AuthContext & redirect to /login
```

---

### Workflow 10: Delayed Action & Reactivation Workflow

Provides multi-admin governance: wallet reactivation requests are held in a scheduled delay queue (default: 10 minutes), giving peer administrators a window to cancel suspect actions before on-chain execution.

```mermaid
sequenceDiagram
    autonumber
    actor Admin1 as Initiating Admin
    participant BE as Spring Boot API
    participant DB as PostgreSQL
    actor Admin2 as Peer Admin
    participant CRON as AdminActionService (Scheduled Job)
    participant SC as WalletRegistry.sol

    Admin1->>BE: Step-Up Signed POST /api/admin/wallet/0xUser/activate
    BE->>DB: INSERT INTO admin_actions (action: 'ACTIVATE_WALLET', target_wallet: '0xUser',<br/>status: 'PENDING', execute_after: NOW() + 10m)
    BE-->>Admin1: 202 Accepted { actionId: 42, executeAfter: "..." }

    Note over Admin1,CRON: 10-Minute Observation / Cancellation Window
    Admin2->>BE: GET /api/admin/actions
    BE-->>Admin2: 200 OK [{ actionId: 42, target: '0xUser', status: 'PENDING', executeAfter: "..." }]

    alt Peer Admin suspects unauthorized action
        Admin2->>BE: Step-Up Signed POST /api/admin/actions/42/cancel
        BE->>DB: UPDATE admin_actions SET status = 'CANCELLED' WHERE id = 42
        BE-->>Admin2: 200 OK (Action Cancelled - On-Chain Tx Prevented)
    else Window elapses peacefully (10m pass)
        CRON->>DB: SELECT * FROM admin_actions WHERE status = 'PENDING' AND execute_after <= NOW()
        CRON->>SC: sendTransaction: activateWallet(0xUser)
        SC-->>CRON: Transaction Receipt ✓
        CRON->>DB: UPDATE admin_actions SET status = 'EXECUTED'
        CRON->>DB: UPDATE users SET status = 'ACTIVE' WHERE wallet_address = '0xUser'
    end
```

---

### Workflow 11: Emergency Stop Master Control Workflow

System-wide circuit breaker: freezes registrations, delayed executions, and optionally user sign-ins during security incidents.

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Admin Browser
    participant BE as Spring Boot API
    participant DB as PostgreSQL
    actor Public as Incoming User

    Admin->>BE: Step-Up Signed POST /api/admin/emergency-stop/activate<br/>{ blockLogins: true }
    BE->>DB: UPDATE emergency_stop SET active = true, block_logins = true, activated_at = NOW()
    BE->>DB: Record SECURITY_EVENT (EMERGENCY_STOP_ACTIVATED)
    BE-->>Admin: 200 OK { active: true, blockLogins: true }

    Note over Public,BE: Inbound Traffic during Emergency Freeze
    Public->>BE: POST /api/auth/register/challenge
    BE->>DB: Check emergency_stop state
    Note over BE: Emergency stop is ACTIVE!
    BE-->>Public: 503 Service Unavailable { code: "EMERGENCY_STOP_ACTIVE" }

    Public->>BE: POST /api/auth/challenge (Sign-in)
    BE-->>Public: 503 Service Unavailable { code: "LOGINS_BLOCKED" }

    Note over Admin,BE: Lifting Emergency Stop (Requires Delay Window)
    Admin->>BE: Step-Up Signed POST /api/admin/emergency-stop/lift
    BE->>DB: INSERT INTO admin_actions (action: 'LIFT_EMERGENCY_STOP', execute_after: NOW() + 10m)
    BE-->>Admin: 202 Accepted { status: "SCHEDULED_DELAYED" }
```

---

### Workflow 12: Scoped API Key Authentication Workflow

Provisioning and invocation of time-bound, read-only API keys for automated monitoring scripts.

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Admin Browser
    participant BE as Spring Boot API
    participant DB as PostgreSQL
    actor Script as Monitoring Agent

    Admin->>BE: Step-Up Signed POST /api/admin/api-keys<br/>{ label: "Prometheus Collector", scopes: ["audit:read", "statistics:read"], ttlDays: 30 }
    BE->>BE: Generate 256-bit Secure Token: bk_live_9f82...<br/>Compute SHA-256(bk_live_9f82...)
    BE->>DB: INSERT INTO api_keys (secret_hash, scopes, expires_at)
    BE-->>Admin: 201 Created { id, keySecret: "bk_live_9f82..." }
    Note over Admin: Key secret shown ONCE; never stored in plaintext on server

    Note over Script,BE: Script Queries Metrics
    Script->>BE: GET /api/admin/statistics<br/>Headers: X-API-Key: bk_live_9f82...
    BE->>BE: ApiKeyFilter intercepts request
    BE->>BE: Compute SHA-256(header_key)
    BE->>DB: SELECT * FROM api_keys WHERE secret_hash = ? AND expires_at > NOW()
    BE->>BE: Assert scopes contain 'statistics:read'
    BE->>BE: Route to StatisticsService
    BE-->>Script: 200 OK { totalUsers: 48, activeSessions: 12, ... }
```

---

### Workflow 13: 6-Layer Security Filter Execution Pipeline

Detailed chronological filter evaluation demonstrating multi-layered defense on every inbound request.

```mermaid
sequenceDiagram
    autonumber
    actor Client as Inbound HTTP Request
    participant RL as 1. RateLimitFilter
    participant OC as 2. OriginCheckFilter
    participant CSRF as 3. CsrfFilter
    participant AK as 4. ApiKeyFilter
    participant AU as 5. ActiveUserFilter
    participant SZ as 6. RequestSizeLimitFilter
    participant CTRL as Controller & Service

    Client->>RL: HTTP Request (Method, Path, IP, Headers, Body)
    alt IP exceeded 10 auth/min or 120 gen/min
        RL-->>Client: 429 Too Many Requests { code: "RATE_LIMIT_EXCEEDED" }
    else Within quota
        RL->>OC: Forward request
    end

    alt POST/PUT/DELETE and Origin != APP_ORIGIN
        OC-->>Client: 403 Forbidden { code: "ORIGIN_MISMATCH" }
    else Origin valid or GET/HEAD
        OC->>CSRF: Forward request
    end

    alt POST/PUT/DELETE and Cookie(XSRF) != Header(X-XSRF-TOKEN)
        CSRF-->>Client: 403 Forbidden { code: "CSRF_TOKEN_INVALID" }
    else CSRF valid or GET/HEAD
        CSRF->>AK: Forward request
    end

    alt Has X-API-Key header
        AK->>AK: Validate hash & scope
        alt Invalid key or missing scope
            AK-->>Client: 401/403 { code: "INVALID_API_KEY" }
        else Valid key
            AK->>CTRL: Dispatched as API client
        end
    else Normal session traffic
        AK->>AU: Forward request
    end

    alt Active session cookie present
        AU->>AU: Validate user row in DB & status == ACTIVE
        alt Wallet revoked or session invalidated
            AU-->>Client: 401 Unauthorized { code: "SESSION_EXPIRED" }
        else Session active
            AU->>SZ: Forward request
        end
    else Unauthenticated request
        AU->>SZ: Forward request
    end

    alt Content-Length > 16,384 bytes (16 KB)
        SZ-->>Client: 413 Payload Too Large { code: "PAYLOAD_TOO_LARGE" }
    else Body within limit
        SZ->>CTRL: Execute Spring Controller Endpoint
        CTRL-->>Client: Standardized JSON Response
    end
```

---

### Workflow 14: Comprehensive Session Lifecycle State Machine

Illustrates all session state transitions and termination vectors across the application lifecycle.

```mermaid
stateDiagram-v2
    [*] --> Active: Login Success<br/>New session ID + HttpOnly cookie
    
    Active --> Active: User Request<br/>ActiveUserFilter validates status<br/>Update last_seen_at (max 1/min)
    
    Active --> Ended_LOGOUT: User clicks Logout
    Active --> Ended_REMOTE: Admin / User terminates via Session Management
    Active --> Ended_EXPIRED: 30-minute idle timeout elapses
    Active --> Ended_REVOKED: Wallet revoked on-chain
    Active --> Ended_RESTART: Server restart (in-memory state cleared)
    Active --> Ended_EMERGENCY: Emergency Stop triggered with blockLogins
    Active --> Ended_DEVICE: User removes device trust
    Active --> Ended_RELOGIN: Same wallet re-authenticates on same device
    Active --> Ended_DISAVOWED: User clicks "This was not me" on alert
    
    Ended_LOGOUT --> [*]
    Ended_REMOTE --> [*]
    Ended_EXPIRED --> [*]
    Ended_REVOKED --> [*]
    Ended_RESTART --> [*]
    Ended_EMERGENCY --> [*]
    Ended_DEVICE --> [*]
    Ended_RELOGIN --> [*]
    Ended_DISAVOWED --> [*]
```

---

## API Reference

All endpoints are under `/api` on the same origin. Requests and responses are JSON. Every `POST` needs `X-XSRF-TOKEN` header. Errors use one standard body: `{ status, code, message, timestamp, path, errorId, fieldErrors }`.

### Authentication (Public)

| Method | Endpoint | Description | Success |
|---|---|---|---|
| GET | `/api/auth/csrf` | Issue CSRF token | `200` |
| POST | `/api/auth/register/challenge` | Challenge for registration | `201` |
| POST | `/api/auth/register` | Verify signature + register on-chain | `201` |
| POST | `/api/auth/challenge` | Challenge for sign-in | `201` |
| POST | `/api/auth/verify` | Verify signature + sign in | `200` or `202` |
| POST | `/api/auth/second-step` | Complete 2FA | `200` |
| POST | `/api/auth/step-up` | Challenge for sensitive action (USER/ADMIN) | `201` |
| POST | `/api/auth/logout` | End session | `204` |

### Signed-In User (USER or ADMIN)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/users/me` | Own profile |
| GET | `/api/users/authentication-history` | Own auth events (paginated) |
| GET | `/api/users/wallet-status` | Own wallet blockchain status |
| GET | `/api/users/sessions` | Active sessions |
| POST | `/api/users/sessions/{id}/end` | End one session |
| POST | `/api/users/sessions/end-others` | End all other sessions |
| GET | `/api/users/devices` | Recognized devices |
| POST | `/api/users/devices/{id}/remove` | Forget a device |
| GET | `/api/users/alerts` | New sign-in alerts |
| POST | `/api/users/alerts/{id}/confirm` | "This was me" |
| POST | `/api/users/alerts/{id}/sign-out` | "This was not me" |
| GET | `/api/users/second-step` | 2FA status |
| POST | `/api/users/second-step/setup` | Begin 2FA setup |
| POST | `/api/users/second-step/enable` | Confirm with code + proof |
| POST | `/api/users/second-step/disable` | Disable with code + proof |
| POST | `/api/users/second-step/backup-codes` | Renew backup codes |

### Administration (ADMIN; * also accepts API key)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/admin/users` * | Users + wallets (filterable) |
| GET | `/api/admin/authentication-events` * | Auth audit logs |
| GET | `/api/admin/security-events` * | Security audit logs |
| GET | `/api/admin/statistics` * | Aggregate counts |
| GET | `/api/admin/login-assessments` * | Trust score history |
| GET | `/api/blockchain/wallet/{address}` * | On-chain wallet status |
| GET | `/api/blockchain/verify/{address}` * | Wallet validity check |
| POST | `/api/admin/wallet/{address}/revoke` | Revoke on-chain (immediate) |
| POST | `/api/admin/wallet/{address}/activate` | Request reactivation (delayed) |
| POST | `/api/admin/wallet/{address}/second-step/reset` | Request 2FA reset (delayed) |
| GET | `/api/admin/wallet-flags` | List flagged wallets |
| POST | `/api/admin/wallet-flags` | Flag a wallet |
| POST | `/api/admin/wallet-flags/{address}/remove` | Remove flag |
| GET | `/api/admin/emergency-stop` | Emergency stop state |
| POST | `/api/admin/emergency-stop/activate` | Switch on (immediate) |
| POST | `/api/admin/emergency-stop/lift` | Request lifting (delayed) |
| GET | `/api/admin/actions` | Delayed actions |
| POST | `/api/admin/actions/{id}/cancel` | Cancel pending action |
| GET | `/api/admin/api-keys` | List API keys |
| POST | `/api/admin/api-keys` | Create API key |
| POST | `/api/admin/api-keys/{id}/revoke` | Revoke API key |

---

## Project Structure

```text
.
├── README.md                          This document
├── .env.example                       Configuration template (placeholders only)
├── docker-compose.yml                 Optional local stack (3 services)
│
├── backend/                           Spring Boot API (Maven)
│   ├── pom.xml                        Dependencies + "blockchain-it" test profile
│   ├── mvnw, mvnw.cmd                Maven Wrapper (no separate install needed)
│   ├── Dockerfile                     Two-stage build, non-root user
│   └── src/
│       ├── main/java/com/blockauth/
│       │   ├── BlockAuthApplication.java     Entry point · @EnableScheduling · UTC Clock
│       │   ├── auth/                  18 files — challenges, signatures, registration,
│       │   │                          login, sessions, step-up, cleanup job
│       │   ├── admin/                 10 files — wallet management, statistics,
│       │   │                          emergency stop, delayed actions
│       │   ├── blockchain/             5 files — Web3j contract client, startup verifier
│       │   ├── session/               16 files — session records, devices, cookies, alerts
│       │   ├── secondstep/             8 files — TOTP, AES-GCM secret box, backup codes
│       │   ├── risk/                   8 files — trust score, device graph, wallet flags
│       │   ├── apikey/                 9 files — read-only API keys, X-API-Key filter
│       │   ├── audit/                 11 files — authentication + security events
│       │   ├── security/               9 files — rate limit, origin, active user, size filters
│       │   ├── user/                   8 files — entity, profile, repository
│       │   ├── common/                10 files — 48 error codes, exception handler, tokens
│       │   └── config/                 5 files — Spring Security, properties, Web3j config
│       ├── main/resources/
│       │   ├── application.yml                    Base configuration
│       │   ├── application-{dev,test,prod}.yml    Profile overrides
│       │   └── db/migration/
│       │       ├── V1__init_schema.sql            4 tables (users, challenges, events)
│       │       └── V2__security_features.sql      11 tables + ALTER (security features)
│       └── test/java/com/blockauth/               49 test files
│           ├── IntegrationTest.java               Base: real HTTP, real sigs, real DB
│           ├── TestWallet.java                    Generates real Ethereum wallets
│           ├── MutableClock.java                  Time control for expiry tests
│           ├── auth/                              9 tests (login, registration, challenge, sig)
│           ├── admin/                             5 tests (revocation, actions, emergency, stats)
│           ├── security/                          5 tests (auth matrix, CSRF, rate limit, fail-closed)
│           ├── secondstep/                        4 tests (TOTP, encryption, integration)
│           ├── risk/                              3 tests (trust policy, score, service)
│           ├── session/                           2 tests (management, alerts)
│           ├── blockchain/                        1 test (real chain, tagged "blockchain")
│           └── ...                                remaining package tests
│
├── frontend/                          React SPA (Vite)
│   ├── package.json                   React 19, React Router 7, Vite 8
│   ├── vite.config.js                 Dev server + /api proxy to :8080
│   ├── nginx.conf                     Production serving + security headers
│   ├── Dockerfile                     Node build → nginx serve
│   ├── index.html                     SPA entry point
│   └── src/
│       ├── main.jsx                   React root + BrowserRouter + AuthProvider
│       ├── App.jsx                    11 routes + Layout + guards
│       ├── api/                        4 files — HTTP client, auth, step-up, hooks
│       ├── context/AuthContext.jsx     Session state, wallet tracking, login/logout
│       ├── wallet/metamask.js         MetaMask bridge (only MetaMask code)
│       ├── components/                17 components — Layout, NavBar, tables, dialogs
│       ├── pages/                     11 pages — user + admin views
│       ├── utils/                      3 files — formatting, messages, event helpers
│       └── styles/global.css          19 KB — dark theme, CSS custom properties
│
├── contracts/                         Hardhat project
│   ├── contracts/WalletRegistry.sol   81 lines — the on-chain identity registry
│   ├── scripts/deploy.js             Deployment script (prints address)
│   ├── test/WalletRegistry.test.js   15 test cases
│   ├── hardhat.config.js             Solidity 0.8.24, localhost network
│   └── Dockerfile                    Image for the Hardhat node
│
├── postman/
│   └── BlockAuth.postman_collection.json   84 API requests in 6 folders
│
└── security-tests/zap/               OWASP ZAP scan notes and API description
```

---

## Setup and Installation

### Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Git | Any recent | |
| JDK | **21** | Required for Spring Boot 4.1 |
| Node.js + npm | **22 LTS** | For frontend and contracts |
| MetaMask | Latest | Desktop Chrome extension |
| Neon account | Free tier | PostgreSQL cloud database |
| Docker Desktop | Optional | For containerized local stack |

Maven is **not** needed separately — use the wrapper (`mvnw.cmd` on Windows, `./mvnw` elsewhere).

### Step 1 — Clone and Configure

```powershell
git clone https://github.com/abhinandbs12/ai-augmented-decentralized-authentication-system.git blockauth
cd blockauth
Copy-Item .env.example .env.local    # cp .env.example .env.local on macOS/Linux
```

### Step 2 — Database (Neon PostgreSQL)

1. Create a Neon project → get `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`
2. Create a `test` branch → get `TEST_DB_*` values (integration tests empty its tables)
3. Fill both sets of values in `.env.local`

```text
DB_URL=jdbc:postgresql://<host>/<database>?sslmode=require
DB_USERNAME=<role>
DB_PASSWORD=<password>
```

### Step 3 — Smart Contract

```powershell
cd contracts
npm install
npx hardhat test                      # Run 15 contract tests
npx hardhat node                      # Terminal A — keep running
```

In a second terminal:
```powershell
cd contracts
npx hardhat run scripts/deploy.js --network localhost
```

Copy **Account #0's private key** → `BLOCKCHAIN_OPERATOR_PRIVATE_KEY`
Copy **printed contract address** → `CONTRACT_ADDRESS`

### Step 4 — Admin Wallet + Encryption Key

```powershell
# Put your MetaMask admin wallet address in .env.local:
BLOCKAUTH_ADMIN_WALLETS=0x<your-admin-address>

# Generate the encryption key (PowerShell):
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
# or: openssl rand -base64 32

# Put the result in .env.local:
SECOND_STEP_ENCRYPTION_KEY=<base64-key>
```

### Step 5 — Backend

```powershell
cd backend
.\mvnw.cmd spring-boot:run           # ./mvnw spring-boot:run on macOS/Linux
```

At startup: Flyway applies migrations → startup verifier checks chain ID, contract code, and operator key.

### Step 6 — Frontend

```powershell
cd frontend
npm install
npm run dev
```

### Step 7 — Verify

Open `http://localhost:5173`

```powershell
# Health check:
curl.exe http://localhost:8080/actuator/health
# Should return: {"status":"UP"}
```

1. Register the admin wallet → admin dashboard appears
2. Register a second wallet → user dashboard, no admin access
3. As admin, revoke the second wallet → its next request signs out

---

## Running with Docker

Docker Compose runs Hardhat, backend, and frontend on ports 8545, 8080, and 3000 (bound to `127.0.0.1` only).

```powershell
docker compose up -d --build hardhat
docker compose logs hardhat                              # Copy Account #0's key
docker compose exec hardhat npx hardhat run scripts/deploy.js --network localhost
# Set CONTRACT_ADDRESS and BLOCKCHAIN_OPERATOR_PRIVATE_KEY in .env.local
docker compose up -d --build backend frontend
```

Open `http://localhost:3000`. `docker compose down` erases the chain — deploy again afterwards.

---

## Testing

### Test Summary

| What | Count | Command |
|---|---|---|
| Contract tests | **15 passing** | `cd contracts; npx hardhat test` |
| Backend unit tests | **184 passing** | `cd backend; .\mvnw.cmd test` |
| Backend integration tests | **172 passing** | `cd backend; .\mvnw.cmd verify` |
| Chain integration tests | Tagged `blockchain` | `cd backend; .\mvnw.cmd verify -Pblockchain-it` |
| Frontend build | Compiles (326 KB JS) | `cd frontend; npm run build` |
| Postman collection | 84 requests | Import + run against local stack |
| OWASP ZAP scans | 0 High/Medium alerts | See `security-tests/zap/README.md` |

### Test Coverage by Module

| Module | Unit Tests | Integration Tests |
|---|---|---|
| auth | `ChallengeServiceTest`, `ChallengeMessageFactoryTest`, `SignatureVerifierTest`, `LoginServiceTest`, `RegistrationServiceTest`, `Eip4361FormatTest` | `LoginFlowIT`, `RegistrationFlowIT`, `LogoutIT`, `StepUpIT`, `ChallengeCleanupIT`, `ChallengeConcurrencyIT` |
| admin | `AdminWalletServiceTest` | `RevocationFlowIT`, `AdminActionIT`, `EmergencyStopIT`, `StatisticsIT` |
| security | `InMemoryRateLimiterTest`, `FailClosedFiltersTest` | `AuthorizationMatrixIT`, `CsrfIT`, `RateLimitIT` |
| secondstep | `TotpTest`, `SecretBoxTest` | `SecondStepIT` |
| risk | `TrustPolicyTest`, `TrustServiceTest` | `TrustScoreIT` |
| session | — | `SessionManagementIT`, `SignInAlertIT` |
| blockchain | — | `WalletRegistryClientIT` (real chain) |
| config | `BlockAuthPropertiesTest`, `SecuritySettingsTest`, `AdminWalletsBindingTest` | `ConfiguredAdminWalletsIT` |
| common | `WalletAddressesTest`, `TokensTest`, `GlobalExceptionHandlerTest` | `ErrorFormatIT`, `SchemaIT` |
| user | `UserServiceTest` | `HistoryScopeIT` |
| apikey | — | `ApiKeyIT` |

---

## Security Architecture

### 6-Layer Filter Chain

```mermaid
flowchart LR
    REQ["Incoming<br/>Request"] --> RL["🚦 Rate Limit<br/>10 auth | 120 general<br/>per min per IP"]
    RL --> OC["🌐 Origin Check<br/>POST Origin ≡<br/>APP_ORIGIN"]
    OC --> CSRF["🔒 CSRF<br/>X-XSRF-TOKEN<br/>header only"]
    CSRF --> AK["🔑 API Key<br/>X-API-Key<br/>scoped access"]
    AK --> AU["👁️ Active User<br/>Re-check session<br/>+ role + status"]
    AU --> SZ["📏 Size Limit<br/>≤ 16 KB body"]
    SZ --> APP["✅ Application<br/>Controller"]
```

### Security Measures

| Layer | Mechanism | Details |
|---|---|---|
| **Session** | HttpOnly, SameSite=Strict cookie | Server-side, regenerated at login, 30min idle timeout, re-checked every request |
| **CSRF** | Cookie-to-header token | `XSRF-TOKEN` → `X-XSRF-TOKEN` (header only, no form parameter) |
| **Origin** | Custom filter | POST `Origin` header must match `APP_ORIGIN` |
| **Rate Limit** | In-memory sliding window | 10 auth/min/IP, 120 general/min/IP, 10 failures → 15min IP block |
| **Validation** | Bean Validation + CHECK | EIP-55 checksums, signature format, enums, unknown JSON rejected, 16KB limit |
| **Authorization** | Deny-by-default | User endpoints never take a user ID; roles from DB only |
| **Secrets** | Never logged, never in errors | Config validators use constructors (not annotations) to avoid printing values |
| **Crypto** | AES-256-GCM, HMAC-SHA256, SHA-256 | Authenticator secrets encrypted; backup codes keyed-hashed; tokens hashed |
| **Headers** | CSP, X-Frame-Options, nosniff | `default-src 'none'`, `DENY`, `no-referrer`; nginx adds its own CSP |
| **Contract** | Admin-only mutations | No payable functions, no external calls, immutable admin |
| **Fail-Closed** | Always | Chain/DB unavailable → sign-in fails; trust check fails → never silently allowed |

---

## Environment Variables

Defined in `.env.local` (from `.env.example`). Real environment variables override the file.

| Variable | Purpose | Required |
|---|---|---|
| `DB_URL`, `DB_USERNAME`, `DB_PASSWORD` | Application database (Neon) | Yes |
| `TEST_DB_URL`, `TEST_DB_USERNAME`, `TEST_DB_PASSWORD` | Test database branch | For tests |
| `BLOCKCHAIN_RPC_URL` | JSON-RPC endpoint (`http://127.0.0.1:8545`) | Yes |
| `BLOCKCHAIN_CHAIN_ID` | Expected chain ID (`31337`) | Yes |
| `CONTRACT_ADDRESS` | Deployed WalletRegistry address | Yes |
| `BLOCKCHAIN_OPERATOR_PRIVATE_KEY` | Contract admin key (signs register/revoke/activate) | Yes |
| `BLOCKAUTH_ADMIN_WALLETS` | Comma-separated admin wallet addresses | Recommended |
| `APP_ORIGIN` | Web app origin (`http://localhost:5173`) | Yes |
| `SECOND_STEP_ENCRYPTION_KEY` | 32 random bytes, Base64 (encrypts 2FA secrets) | Yes |
| `CHALLENGE_TTL_SECONDS` | Challenge lifetime (default `120`, range 60–600) | No |
| `SESSION_TIMEOUT` | Idle timeout (default `30m`) | No |
| `SESSION_COOKIE_SECURE` | Cookie Secure flag (default `true`) | No |
| `TRUSTED_DEVICE_DAYS` | Days device stays trusted after 2FA (default `30`) | No |
| `ADMIN_ACTION_DELAY` | Waiting period for delayed actions (default `10m`, range 1s–7d) | No |

> ⚠️ `DB_PASSWORD`, `TEST_DB_PASSWORD`, `BLOCKCHAIN_OPERATOR_PRIVATE_KEY`, and `SECOND_STEP_ENCRYPTION_KEY` are secrets — never commit them.

---

## Deployment

No hosted deployment is configured. The repository provides:

- **Docker Compose** for a complete local stack
- A **`prod` Spring profile** for HTTPS reverse proxy: honours `X-Forwarded-*` headers and forces `Secure` cookies

Any deployment outside `localhost` **must** use HTTPS.

---

## Troubleshooting

| Symptom | Cause and Fix |
|---|---|
| Backend stops with blockchain error | Wrong chain ID, no code at `CONTRACT_ADDRESS`, or wrong operator key. Redeploy after chain restart. |
| Backend names `SECOND_STEP_ENCRYPTION_KEY` | Missing or not 32 bytes in Base64. Generate as shown above. |
| Login says wallet not registered | Chain was reset. Redeploy, truncate dev data, restart, re-register. |
| `429` "Too many failed attempts" | 10 failures in 15 min block the IP for 15 min. Restart backend clears in-memory limits. |
| MetaMask shows nothing after click | A request is waiting in the extension. Open MetaMask and answer it. |
| "Registration is incomplete" | Wallet registered on-chain but user row not saved. Run registration again. |
| Admin address logs in as normal user | Role is set at registration. List the address in config and register after restart. |
| Reactivation didn't happen yet | Waits for `ADMIN_ACTION_DELAY`. Check Admin → Controls. |
| First request slow after break | Neon suspends idle databases; first connection wakes it. |

**To reset development data after a chain restart:**

```sql
TRUNCATE users, authentication_challenges, authentication_events, security_events RESTART IDENTITY CASCADE;
```

---

## Known Limitations

| # | Limitation | Impact |
|---|---|---|
| 1 | **Single backend instance** — sessions, rate limits, pending 2FA in memory | Cannot scale horizontally; restart signs everyone out |
| 2 | **Local Hardhat chain only** — chain ID 31337, no public network | Chain data lost on node restart |
| 3 | **One operator key** — immutable contract admin | Single point of compromise; no multi-sig or rotation |
| 4 | **No wallet key recovery** | Lost key = lost access, new wallet = new account |
| 5 | **Desktop Chrome + MetaMask only** | No mobile, no WalletConnect |
| 6 | **In-app alerts only** | No email/push notifications for suspicious sign-ins |
| 7 | **Untuned trust score** | Default penalties are starting values, not calibrated |
| 8 | **No data retention policy** | Events and IP addresses stored indefinitely |
| 9 | **No frontend tests** | UI regressions caught only by manual testing |
| 10 | **No CI/CD pipeline** | Tests run only when manually invoked |

---

## Ablation Flow

This section documents what happens when individual components are removed or disabled, demonstrating each module's contribution to the system.

### Component Ablation Matrix

```mermaid
flowchart TD
    subgraph "Full System"
        FULL["All Components Active<br/>✅ Maximum Security"]
    end

    subgraph "Remove Trust Score"
        NT["No TrustService<br/>⚠️ Every valid signature<br/>gets immediate access<br/>No risk-based 2FA prompts"]
    end

    subgraph "Remove Second Step"
        N2FA["No SecondStepService<br/>⚠️ Stolen session +<br/>signature = full access<br/>No backup recovery"]
    end

    subgraph "Remove Fresh Signatures"
        NSU["No StepUpService<br/>⚠️ Stolen session can<br/>revoke wallets, create keys<br/>toggle emergency stop"]
    end

    subgraph "Remove Rate Limiting"
        NRL["No RateLimitFilter<br/>⚠️ Unlimited brute force<br/>on challenges + signatures<br/>No IP blocking"]
    end

    subgraph "Remove Blockchain"
        NBC["No WalletRegistry<br/>⚠️ Status in DB only<br/>DB admin can change silently<br/>No on-chain audit trail"]
    end

    subgraph "Remove Emergency Stop"
        NES["No EmergencyStopService<br/>⚠️ Cannot pause system<br/>during active compromise"]
    end

    subgraph "Remove Delayed Actions"
        NDA["No AdminActionService<br/>⚠️ Reactivation is instant<br/>Stolen admin = immediate<br/>access restoration"]
    end

    FULL --> NT
    FULL --> N2FA
    FULL --> NSU
    FULL --> NRL
    FULL --> NBC
    FULL --> NES
    FULL --> NDA
```

### Detailed Ablation Analysis

| Component Removed | Security Impact | Functional Impact | What Breaks |
|---|---|---|---|
| **Trust Score Engine** | 🔴 Critical — no risk assessment | Every valid signature gets session immediately | Unknown devices, flagged wallets, repeated failures all bypass checks |
| **Second Step (TOTP)** | 🟡 Moderate — no 2FA layer | Trust score can only ALLOW or REFUSE (no SECOND_STEP option) | Users cannot add extra protection; no backup code recovery |
| **Fresh Signatures (Step-Up)** | 🔴 Critical — session = full admin power | Stolen session cookie can revoke wallets, toggle emergency stop | All sensitive actions become one-click with no re-authentication |
| **Rate Limiting** | 🔴 Critical — unlimited attempts | Brute-force challenge guessing, signature replay attempts | No IP blocking after failures; DoS vulnerability |
| **CSRF Protection** | 🔴 Critical — cross-site attacks | Other sites can trigger wallet revocations, session termination | Any logged-in admin's browser becomes an attack vector |
| **Device Recognition** | 🟡 Moderate — trust score degraded | Trust score loses NEW_DEVICE signal (30-point penalty) | No sign-in alerts; no device management; no device trust |
| **Blockchain (WalletRegistry)** | 🟡 Moderate — centralized status | Wallet status moves entirely to PostgreSQL | No on-chain audit trail; DB admin can change status silently |
| **Emergency Stop** | 🟡 Moderate — no panic button | Cannot freeze system during active attack | Ongoing compromise continues until manual intervention |
| **Delayed Actions** | 🟡 Moderate — instant access grant | Stolen admin session can reactivate wallets immediately | No cancellation window for other admins |
| **Audit Logging** | 🟡 Moderate — no traceability | Authentication events not recorded | Cannot investigate incidents or detect patterns |
| **API Keys** | 🟢 Low — scripts lose access | Monitoring scripts cannot query the API | Manual admin dashboard checks only |
| **Origin Check** | 🟡 Moderate — weakened CSRF | Cross-origin POSTs could bypass CSRF in some browsers | CSRF token + SameSite cookie still provide base protection |

### Defense-in-Depth Layers

```mermaid
flowchart TB
    subgraph Layer1["Layer 1: Network"]
        RL[Rate Limiting]
        IB[IP Blocking]
        OC[Origin Check]
        SZ[Size Limit]
    end

    subgraph Layer2["Layer 2: Authentication"]
        CR[Challenge-Response]
        SIG[Signature Verification]
        CHAIN[Chain Status Check]
    end

    subgraph Layer3["Layer 3: Risk Assessment"]
        TS2[Trust Score]
        FA[2FA / Second Step]
        DEV[Device Recognition]
    end

    subgraph Layer4["Layer 4: Session Security"]
        SESS[Server-Side Sessions]
        CSRF2[CSRF Protection]
        AUF2[Active User Filter]
    end

    subgraph Layer5["Layer 5: Action Security"]
        STEPUP[Fresh Signatures]
        DELAY[Delayed Actions]
        ESTOP[Emergency Stop]
    end

    subgraph Layer6["Layer 6: Monitoring"]
        AUDIT2[Audit Logging]
        SECEVT[Security Events]
        FLAGS[Wallet Flags]
    end

    Layer1 --> Layer2 --> Layer3 --> Layer4 --> Layer5 --> Layer6
```

> Removing any single layer degrades security but does not completely compromise the system (except rate limiting, which enables brute force). This defense-in-depth approach means an attacker must defeat multiple independent layers.

---

## Team

| Name |
|---|
| **Karthik R Nair** |
| **Sunny Singh** |
| **Abhinand Biju Smitha** |

---

*BlockAuth is a working reference implementation for local and Docker use. It is suitable for study, demonstration, and further development.*
