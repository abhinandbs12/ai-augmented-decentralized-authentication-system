# BlockAuth

Blockchain-based wallet authentication and identity verification.

There are no passwords. A user proves control of an Ethereum wallet by signing a one-time message in
MetaMask. The backend verifies the signature, checks the wallet in the `WalletRegistry` smart contract,
and opens a server-side session. An administrator can revoke a wallet on the blockchain, which ends its
sessions and blocks further logins until it is reactivated.

| Part | Technology | Folder |
|---|---|---|
| Web app | React, JavaScript, CSS (Vite), MetaMask | `frontend/` |
| API | Java 21, Spring Boot, Spring Security, Web3j, Maven | `backend/` |
| Smart contract | Solidity, Hardhat (local chain, chain ID 31337) | `contracts/` |
| Database | Neon PostgreSQL, Flyway migrations | hosted |

How a login works:

1. The web app asks the API for a challenge for the connected wallet address.
2. The user signs the challenge text in MetaMask (`personal_sign`). No transaction is sent and no gas is paid.
3. The API checks that the challenge is its own, unexpired and unused, recovers the signer from the
   signature, and compares it with the claimed address.
4. The API reads the wallet's status from the smart contract. The blockchain is the authority; the
   database only mirrors it.
5. On success the API creates a session and sets an HttpOnly cookie. The browser never stores a token.

The system never sees or stores a private key, seed phrase or wallet password.

On top of that, BlockAuth limits what someone who obtains a wallet or a session can do; see
[Account security](#account-security).

## Prerequisites

| Tool | Version | Check |
|---|---|---|
| Git | any recent | `git --version` |
| JDK | 21 | `java -version` |
| Node.js and npm | 22 LTS | `node -v`, `npm -v` |
| MetaMask | latest, in desktop Chrome | browser toolbar |
| Neon account | free tier is enough | console.neon.tech |
| Docker Desktop | optional | `docker --version` |

Maven is not installed separately: use the wrapper in `backend/` (`mvnw.cmd` on Windows, `./mvnw` elsewhere).

## Quick start

Commands are shown for PowerShell on Windows; the macOS/Linux form follows `#` where it differs.

1. **Clone and create the local configuration**

   ```powershell
   git clone <repository-url> blockauth
   cd blockauth
   Copy-Item .env.example .env.local    # cp .env.example .env.local
   ```

2. **Database.** In the Neon console create a project for this application and add a second branch,
   `test`, for the integration tests. For each of the two branches open *Connection details*, choose
   the direct (non-pooled) host, and fill `DB_*` (the application's branch) and `TEST_DB_*` (`test`)
   in `.env.local`:

   ```text
   DB_URL=jdbc:postgresql://<host>/<database>?sslmode=require
   DB_USERNAME=<role>
   DB_PASSWORD=<password>
   ```

   The tables are created by Flyway when the backend starts.

3. **Contracts: install, compile, test**

   ```powershell
   cd contracts
   npm install
   npx hardhat compile
   npx hardhat test
   ```

4. **Start the local blockchain** (terminal A, keep it running)

   ```powershell
   npx hardhat node
   ```

   Copy the private key of **Account #0** from the output into `BLOCKCHAIN_OPERATOR_PRIVATE_KEY`.

5. **Deploy the contract** (terminal B, in `contracts/`)

   ```powershell
   npx hardhat run scripts/deploy.js --network localhost
   ```

   Copy the printed address into `CONTRACT_ADDRESS`.

6. **Choose the administrator wallet.** Copy the address of the MetaMask account you will use as
   administrator into `BLOCKAUTH_ADMIN_WALLETS`. Any account works; it needs no ETH and no network
   switch. Use a different MetaMask account to test as a normal user.

7. **Start the backend** (terminal C)

   ```powershell
   cd backend
   .\mvnw.cmd spring-boot:run           # ./mvnw spring-boot:run
   ```

   On the first run the log shows Flyway applying `V1__init_schema` and `V2__security_features`, then the
   blockchain check passing
   (chain 31337, contract code present, operator is the contract admin).

8. **Start the frontend** (terminal D)

   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

9. **Check that it works**

   - `curl.exe http://localhost:8080/actuator/health` returns `{"status":"UP"}`.
   - Open `http://localhost:5173`, register the administrator wallet, then log in: the Admin Dashboard appears.
   - Register and log in with the second wallet: the user Dashboard appears, and opening `/admin`
     shows a "no permission" page.
   - As administrator, revoke the second wallet (MetaMask asks you to sign a confirmation): its next
     request is signed out and its next login is refused. Reactivating it is a request that the server
     carries out after `ADMIN_ACTION_DELAY`; it is listed under Admin → Controls until then.

## Configuration

All settings live in one `.env.local` file in the repository root. It is git-ignored; `.env.example` lists
every variable with placeholders. Real environment variables override the file. The frontend and the
contracts project need no environment variables.

| Name | Purpose | Required |
|---|---|---|
| `DB_URL`, `DB_USERNAME`, `DB_PASSWORD` | The application's Neon branch (JDBC URL, role, password) | Yes |
| `TEST_DB_URL`, `TEST_DB_USERNAME`, `TEST_DB_PASSWORD` | Neon `test` branch | For integration tests |
| `BLOCKCHAIN_RPC_URL` | JSON-RPC endpoint, `http://127.0.0.1:8545` locally | Yes |
| `BLOCKCHAIN_CHAIN_ID` | Expected chain ID, `31337` locally | Yes |
| `CONTRACT_ADDRESS` | Deployed `WalletRegistry` address | Yes |
| `BLOCKCHAIN_OPERATOR_PRIVATE_KEY` | Key of the contract admin account; signs register, revoke and activate transactions | Yes |
| `BLOCKAUTH_ADMIN_WALLETS` | Comma-separated wallet addresses that become `ADMIN` when they register | Needed to have an administrator |
| `APP_ORIGIN` | Exact origin of the web app, `http://localhost:5173` locally | Yes |
| `CHALLENGE_TTL_SECONDS` | Lifetime of a challenge, default `120` | No |
| `SESSION_TIMEOUT` | Idle session timeout, default `30m` | No |
| `SESSION_COOKIE_SECURE` | `Secure` cookie flag: `false` on `http://localhost`, `true` when deployed (default `true`) | No |
| `SPRING_PROFILES_ACTIVE` | `dev`, `test` or `prod`; set it as a real environment variable | No |
| `SECOND_STEP_ENCRYPTION_KEY` | 32 random bytes, Base64: encrypts the authenticator secrets and keys the backup-code hashes in the database. Generate it as `.env.example` shows; keep it with the other secrets. Losing or changing it makes every enrolled second step unusable (administrators can reset them). | Yes |
| `TRUSTED_DEVICE_DAYS` | How long a device that passed the second step is trusted, default `30` | No |
| `ADMIN_ACTION_DELAY` | Waiting period before a reactivation, second-step reset or lifting of the emergency stop takes effect, default `10m` (between `1s` and `7d`) | No |

Secrets are `DB_PASSWORD`, `TEST_DB_PASSWORD`, `BLOCKCHAIN_OPERATOR_PRIVATE_KEY` and
`SECOND_STEP_ENCRYPTION_KEY`. Never commit them.
The private keys that `hardhat node` prints are public knowledge: use them only on the local chain.

## Tests

| What | Needs | Command |
|---|---|---|
| Contract tests | nothing running | `cd contracts; npx hardhat test` |
| Backend unit tests | nothing running | `cd backend; .\mvnw.cmd test` |
| Backend unit and integration tests | `TEST_DB_*` in `.env.local` | `cd backend; .\mvnw.cmd verify` |
| Same, plus tests against the real chain | also `hardhat node` running with the contract deployed | `cd backend; .\mvnw.cmd verify -Pblockchain-it` |
| Frontend production build | nothing running | `cd frontend; npm run build` |

The integration tests empty the application tables before every test. Point `TEST_DB_*` at a
branch used for nothing else, never at the branch `DB_URL` points at.

### API checks with Postman

Import `postman/BlockAuth.postman_collection.json` and run it against the running local stack. The
folders cover authentication without a signature, authorization, validation and injection, CSRF, rate
limiting and the administrator endpoints.

Postman cannot sign as MetaMask. For the requests marked USER or ADMIN, log in through the browser,
copy the value of the `BLOCKAUTH_SESSION` cookie from the developer tools into the `userSession` or
`adminSession` collection variable, and run again; those requests are skipped while the variable is
empty. Changes that need a fresh wallet signature (revoking, reactivating, the emergency stop, flags, API
keys, the second step) cannot be signed from Postman either; the collection checks that they are refused
without one. The collection sends failing requests on purpose, so wait a minute between runs.

### Security scan

`security-tests/zap/README.md` describes the OWASP ZAP baseline and active scans. Scan only your own
local stack.

## Docker (optional)

Docker packages the local stack: the Hardhat node, the backend, and the frontend behind nginx on port
3000. The database stays on Neon, so `.env.local` must already hold the `DB_*` values. Compose points the
backend at the containerized chain and sets the application origin to `http://localhost:3000` itself.
Stop any local `hardhat node` and backend first: the containers use ports 8545 and 8080. All three
ports are published on this machine only (`127.0.0.1`), because the chain node's accounts are public
test keys.

```powershell
docker compose up -d --build hardhat
docker compose logs hardhat
```

Copy the Account #0 private key into `BLOCKCHAIN_OPERATOR_PRIVATE_KEY`, then deploy:

```powershell
docker compose exec hardhat npx hardhat run scripts/deploy.js --network localhost
```

Set `CONTRACT_ADDRESS` to the printed address and start the rest:

```powershell
docker compose up -d --build backend frontend
```

Open `http://localhost:3000`. `docker compose down` discards the chain: deploy again, update
`CONTRACT_ADDRESS` and reset the development data (below).

## Resetting local state

The local chain is empty every time `hardhat node` restarts, while the database still remembers the
wallets. After a restart:

1. Deploy the contract again and put the printed address in `CONTRACT_ADDRESS`.
2. Empty the application tables in the Neon SQL editor, on the branch `DB_URL` points at. This
   deletes every user and event there:

   ```sql
   TRUNCATE users, authentication_challenges, authentication_events, security_events RESTART IDENTITY CASCADE;
   ```

3. Restart the backend and register the wallets again.

To rebuild the schema itself, run `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` on that same
branch and restart the backend; Flyway recreates everything. Never edit an applied migration: add a
new `V<n>__<description>.sql` file in `backend/src/main/resources/db/migration`.

## Account security

A wallet signature proves who is signing, but not that the signer is the rightful owner: anyone who has
the wallet can sign. These measures limit the damage and make it visible.

| Measure | What it does |
|---|---|
| Standard sign-in message | Every message follows the Sign-In with Ethereum (EIP-4361) message format: site, wallet, a plain statement, nonce, chain and expiry, so MetaMask and the user can see exactly what is signed and for which site. This covers the text only: the server checks each signature against its own stored copy of the message (one use, two minutes), not with a SIWE library, so this is not a claim of full SIWE compliance. |
| Sessions and devices | Account security lists every signed-in session and device. Ending one, "sign out everywhere else" or forgetting a device takes effect on that session's next request, because every request checks the server-side session record. |
| New sign-in alerts | A sign-in on a device the wallet has not used before is shown on its other sessions, with "This was me" and "This was not me" (which signs that device out). The alerts are shown in the app only; nothing is sent by e-mail or push. |
| Second step | Optional authenticator-app codes (TOTP, RFC 6238) plus ten one-time backup codes. Asked for only when a sign-in does not look like the wallet's usual one; the device it is passed on becomes trusted for `TRUSTED_DEVICE_DAYS`. |
| Trust score | Each sign-in whose signature checks out starts at 100 and loses points for a new device, a new network, a flagged wallet, repeated failures from the same address, or a device shared with a flagged wallet. High scores sign in; lower ones need the second step, or are refused when the wallet has none. Administrators see every score under Security → Sign-in risk. |
| Fresh signature for dangerous actions | Revoking or reactivating a wallet, the emergency stop, flags, second-step changes and API keys need a new MetaMask signature over a one-time message naming the action and its parameters, on top of the session. A stolen session cookie alone cannot do them. |
| Emergency stop | Switched on at once by an administrator; refuses registrations, reactivations, second-step resets, removing flags and new API keys, and optionally sign-ins by users. Administrators can always sign in. It controls this application only: the contract can still be called directly with the operator key. |
| Waiting period for administrator actions | Reactivating a wallet, resetting a second step and lifting the emergency stop take effect after `ADMIN_ACTION_DELAY`. Any administrator can cancel them meanwhile. If carrying one out fails, it goes back to the queue, is tried again a minute later and can still be cancelled. Revoking a wallet is never delayed. |
| Limited-purpose API keys | Read-only keys for scripts (`users:read`, `audit:read`, `wallet-status:read`), sent as the `X-API-Key` header, valid for at most 90 days, shown once and stored only as a hash. A key stops working when it is revoked, expires, or its owner is no longer an active administrator. |

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Backend stops at startup with a blockchain error | The node is on another chain ID, `CONTRACT_ADDRESS` has no contract code, or the operator key is not the contract admin. Usually the chain was restarted: deploy again and update `CONTRACT_ADDRESS`. If the node is simply not running, the backend starts and answers 503 on blockchain-backed requests until it is. |
| `Port 8080 was already in use` | Another program holds the port. Stop it; the port is fixed because the dev proxy and the Docker setup point at it. `Get-NetTCPConnection -LocalPort 8080` shows the owning process. The same applies to 5173 (frontend), 8545 (chain) and, with Docker, 3000. |
| Login says the wallet is not registered although it was | The chain was reset. Follow "Resetting local state". |
| `429` with "Too many failed attempts" | Ten failed sign-ins from one address block it for 15 minutes. Limits live in memory: restarting the backend clears them. |
| MetaMask shows nothing after clicking a button | A request is already waiting. Open the MetaMask extension and answer it. |
| "Registration is incomplete" at login | The wallet was written to the blockchain but the user record was not saved. Run registration again; it completes without a second transaction. |
| A wallet listed in `BLOCKAUTH_ADMIN_WALLETS` logs in as a normal user | The role is given once, when the wallet registers, and the backend reads the list only at startup. The wallet registered before it was listed, the backend was not restarted, or the listed address is a different account. Roles are never changed afterwards; to start over locally, follow "Resetting local state". |
| Backend stops at startup naming `BLOCKAUTH_ADMIN_WALLETS` | An entry is not a valid wallet address (0x and 40 hexadecimal characters, with a correct checksum if written in mixed case). List public addresses only, separated by commas; never a private key. |
| Every administrator wallet is revoked | Reactivate one from the Hardhat console with the operator account (below), or list a new wallet in `BLOCKAUTH_ADMIN_WALLETS` and register it. |
| Backend stops at startup naming `SECOND_STEP_ENCRYPTION_KEY` | The variable is missing or is not 32 bytes in Base64. Generate one as `.env.example` shows. The error never prints the value. |
| Login asks for a verification code | The wallet has the second step on and this sign-in scored below the "allow" threshold, usually because the device or network is new. Enter the code from the authenticator app or a backup code, in the same browser, within five minutes. |
| Login says the sign-in "does not look like your usual sign-ins" | The trust score was too low and the wallet has no second step. Sign in from a device used before, or turn on the second step. An administrator can see the reasons under Security → Sign-in risk. |
| A user lost their authenticator and all backup codes | An administrator requests a reset under Admin → Controls; it takes effect after the waiting period. Confirm who the user is outside BlockAuth first. |
| A reactivation did not happen | It waits for `ADMIN_ACTION_DELAY`, and while the emergency stop is on it waits until the stop is lifted. It fails if the administrator who asked is no longer an active administrator by then. Admin → Controls shows its status. |
| The first request after a break takes several seconds | Neon suspends an idle database. The first connection wakes it; later requests are fast again. |

Reactivating a wallet directly on the local chain (account #0 is the contract admin):

```powershell
cd contracts
npx hardhat console --network localhost
```

```js
const registry = await ethers.getContractAt('WalletRegistry', '<CONTRACT_ADDRESS>')
await registry.activateWallet('<wallet address>')
```

The database mirror corrects itself the next time that wallet logs in. This path skips the waiting
period, which is why the operator key must be kept as safe as the database password.

## Repository layout

```text
contracts/        Hardhat project: WalletRegistry.sol, deployment script, contract tests
backend/          Spring Boot API: auth, user, admin, blockchain, audit, security, session, secondstep,
                  risk, apikey, common, config
frontend/         React single-page app: pages, components, API client, MetaMask wrapper
postman/          API regression collection
security-tests/   OWASP ZAP notes
docker-compose.yml, .env.example
```
