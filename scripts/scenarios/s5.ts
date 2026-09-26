/**
 * Scenario S5 — Credential stuffing trips the circuit breaker (TC-05)
 * Expected: more than 50 blocked attempts inside 10 seconds pause
 * authentication on the contract, so every later login is refused.
 *
 * The attempts go straight to the orchestrator (development overlay, port
 * 3001) and name one attacking address in X-Forwarded-For. Through the gateway
 * the token bucket would stop them after ten, which is the point of the
 * gateway, but not what this scenario is measuring.
 *
 * Resume afterwards from the operations console, or with the command printed
 * at the end.
 *
 * Ref: PRD §3.3, scenario S5; TRD §12.3
 */

import { deviceFingerprint } from "../demoData";
import { internalHeaders } from "../internalToken";

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:3001";
const ATTACKER_IP = "203.0.113.50";
const ATTACKER_DEVICE = deviceFingerprint("credential_stuffing_rig");
// The first few attempts from the attacking address score 50 (new device, new
// region) and are only routed to the code step; the velocity penalty applies
// once that address passes VELOCITY_THRESHOLD, and those attempts score 25 and
// are blocked. More than 50 blocked attempts inside the window trip the
// breaker, so the total is kept well clear of that boundary.
const TOTAL_ATTEMPTS = 80;

async function main() {
  console.log("━━━ S5: Credential-stuffing attack trips the circuit breaker ━━━\n");

  let blocked = 0;
  const startTime = Date.now();

  for (let i = 0; i < TOTAL_ATTEMPTS; i++) {
    const res = await fetch(`${ORCHESTRATOR_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": ATTACKER_IP },
      body: JSON.stringify({
        wallet_address: `0x${String(i + 1).padStart(40, "0")}`,
        device_fingerprint: ATTACKER_DEVICE,
      }),
    });
    if (res.status === 403) blocked++;
    if ((i + 1) % 10 === 0) {
      console.log(`    ${i + 1}/${TOTAL_ATTEMPTS} attempts — ${blocked} blocked`);
    }
  }

  const elapsed = Date.now() - startTime;
  // The pause is a transaction; give it a moment to be mined.
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const status = await fetch(`${ORCHESTRATOR_URL}/api/admin/status`, { headers: internalHeaders() });
  const { paused, breaker } = await status.json();

  console.log(`\n  Results:`);
  console.log(`    Attempts:           ${TOTAL_ATTEMPTS} in ${elapsed} ms`);
  console.log(`    Blocked (score<50): ${blocked}`);
  console.log(`    Breaker threshold:  more than ${breaker.threshold} in ${breaker.window_ms / 1000} s`);
  console.log(`    Authentication:     ${paused ? "PAUSED on the contract" : "still running"}`);

  if (!paused) {
    console.log("\n  ❌ FAIL — the circuit breaker did not trip.");
    process.exitCode = 1;
    return;
  }

  console.log("\n  ✅ PASS — the breaker tripped and every login is now refused.");
  console.log("     Resume from the operations console, or:");
  console.log(`     curl -X POST ${ORCHESTRATOR_URL}/api/admin/resume -H "X-Internal-Token: <INTERNAL_API_TOKEN>"`);
}

main().catch((e) => {
  console.error("❌ FAIL:", e.message);
  process.exitCode = 1;
});
