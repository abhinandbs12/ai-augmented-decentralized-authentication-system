# OWASP ZAP scans

Scan only your own local stack. Reports go in `security-tests/zap/reports/` (git-ignored).

Start the Docker stack first, as described in the "Docker" section of the main README, so that the nginx
security headers and Content-Security-Policy are present. The commands below assume the frontend on
port 3000.

## Baseline (passive) scan

```bash
docker run --rm -t -v "$(pwd)/security-tests/zap/reports:/zap/wrk" ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t http://host.docker.internal:3000 -r baseline.html
```

## Active scan

Unauthenticated, from the command line (spider, AJAX spider, then active scan):

```bash
docker run --rm -t -v "$(pwd)/security-tests/zap/reports:/zap/wrk" ghcr.io/zaproxy/zaproxy:stable zap-full-scan.py -t http://host.docker.internal:3000 -j -r full.html
```

With a session, from ZAP Desktop: scan `http://localhost:3000/api/...` with a USER session (sign in
through the browser, then add the `BLOCKAUTH_SESSION` cookie and the `X-XSRF-TOKEN` header in ZAP).
Expect 429 responses once the rate limits trigger; that is the intended behavior, so scan endpoints in
small groups. Restart the backend afterwards to clear the limits.

## API scan with an administrator session

`blockauth-get-api.json` describes the read endpoints (GET only, so the scan cannot sign the session
out). The API allows 120 requests a minute per address; slow ZAP down below that, otherwise most
requests are answered 429 and never reach the endpoints. Sign in as an administrator and pass the
session cookie through ZAP's replacer (PowerShell):

```powershell
$cookie = 'BLOCKAUTH_SESSION=<value from the browser>'
docker run --rm -t --memory 4g -v "${PWD}\security-tests\zap:/zap/wrk" ghcr.io/zaproxy/zaproxy:stable `
  zap-api-scan.py -t /zap/wrk/blockauth-get-api.json -f openapi -r reports/api-admin.html `
  -z "-config scanner.delayInMs=550 -config scanner.threadPerHost=1 -config replacer.full_list(0).description=session -config replacer.full_list(0).enabled=true -config replacer.full_list(0).matchtype=REQ_HEADER -config replacer.full_list(0).matchstr=Cookie -config replacer.full_list(0).regex=false -config replacer.full_list(0).replacement=$cookie"
```

Give the container a memory limit: an uncapped full scan with the AJAX spider made Docker Desktop
stop responding on 2026-10-18.

## Pass criteria

- No **High** alerts.
- Every **Medium** alert is either fixed or listed below with the reason it is accepted.

## Results

| Date | Scan | High | Medium | Low | Informational |
|---|---|---:|---:|---:|---:|
| 2026-10-07 | Baseline (passive), 7 URLs | 0 | 0 | 4 | 3 |
| 2026-10-07 | Full scan, unauthenticated, 14 URLs | 0 | 0 | 5 | 6 |
| 2026-10-11 | Baseline (passive) | 0 | 0 | 4 | 3 |
| 2026-10-11 | Full scan with a USER session (cookie and CSRF header added to every request) | 0 | 0 | 7 | 6 |
| 2026-10-18 | Baseline (passive) | 0 | 0 | 4 | 3 |
| 2026-10-19 | API scan, 18 read endpoints, ADMIN session, throttled below the rate limit | 0 | 0 | 3 | 2 |

The 2026-10-19 API scan found one real defect: a query parameter without a name (`?=&page=0`) made
every paged endpoint answer 500 instead of 400. Fixed the same day (the error handler maps it to
`VALIDATION_FAILED`; regression test in `ErrorFormatIT`). No request was rate-limited, and the backend
logged no other internal error.

The session scan reached the profile, history, wallet-status and logout endpoints. The backend answered
with validation, authorization and rate-limit errors only; it logged no internal error. An ADMIN session
has not been scanned.

## Accepted findings

No High or Medium alert was reported. The Low alerts below are accepted for now (the 500 found on 2026-10-19 was fixed, not accepted):

| Alert | Where | Why it is accepted |
|---|---|---|
| Cookie No HttpOnly Flag | `XSRF-TOKEN` | By design. The web app must read this cookie to send the token back in the `X-XSRF-TOKEN` header. It carries no session data; the session cookie `BLOCKAUTH_SESSION` is HttpOnly. |
| Private IP Disclosure | `/api/users/authentication-history` | The signed-in user's own history shows the address each attempt came from. In Docker that is the nginx container's private address. |
| Cookie Slack Detector | `/api/auth/csrf` | Informational in nature: responses differ with and without cookies, as expected for a session-based API. |
| Permissions Policy Header Not Set | static files | The app uses no camera, microphone, location or similar browser features. The header is not in the specified header set; adding it in `nginx.conf` would be a hardening step. |
| Unexpected Content-Type | `/`, `/api`, unknown paths | The web server answers every path outside `/api/` with the app's page (HTML), as the single-page app needs; `/api` without the slash is such a path. API responses are JSON. |
| Cross-Origin-Embedder-Policy, Cross-Origin-Opener-Policy and Cross-Origin-Resource-Policy missing | static files | The app loads nothing from other origins and cannot be framed (`frame-ancestors 'none'`, `X-Frame-Options: DENY`). Adding the three headers in `nginx.conf` would be a hardening step. |
