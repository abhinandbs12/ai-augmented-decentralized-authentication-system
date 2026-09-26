/**
 * Scenario S3 — Stolen credentials: unfamiliar device + location + high velocity
 * Expected: Trust Score < 50 → blocked
 *
 * Ref: PRD §3.3, scenario S3
 */

import { internalHeaders } from "../internalToken";

import { FOREIGN_IP, NORMAL_WALLETS, UNKNOWN_DEVICE } from "../demoData";

const CUSTOMER = NORMAL_WALLETS[1];

const RISK_ENGINE_URL = process.env.RISK_ENGINE_URL || "http://localhost:8001";

async function main() {
  console.log("━━━ S3: Stolen-credential pattern ━━━\n");

  // Fire several rapid requests first (to inflate velocity)
  for (let i = 0; i < 6; i++) {
    const payload = {
      wallet: CUSTOMER.wallet,
      ip_address: FOREIGN_IP,
      device_fingerprint: UNKNOWN_DEVICE,
      timestamp: new Date().toISOString(),
    };
    
    // 1. Get the score
    const res = await fetch(`${RISK_ENGINE_URL}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    
    // 2. Simulate Orchestrator reporting the completed event
    await fetch(`${RISK_ENGINE_URL}/event`, {
      method: "POST",
      headers: internalHeaders(),
      body: JSON.stringify({
        wallet_address: payload.wallet,
        ip_address: payload.ip_address,
        device_fingerprint: payload.device_fingerprint,
        trust_score: data.trust_score,
        decision: "blocked", // Simulate attacker failing the OTP challenge or being blocked
        timestamp: payload.timestamp,
      }),
    });
  }

  // Final request — should now have high velocity + unrecognized device + unrecognized IP
  const res = await fetch(`${RISK_ENGINE_URL}/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet: CUSTOMER.wallet,
      ip_address: FOREIGN_IP,
      device_fingerprint: UNKNOWN_DEVICE,
      timestamp: new Date().toISOString(),
    }),
  });

  const data = await res.json();
  console.log("  Trust Score:", data.trust_score);
  console.log("  Reasons:", data.reasons);

  if (data.trust_score < 50) {
    console.log("\n  ✅ PASS — Score < 50, attempt blocked as expected.");
  } else {
    console.log(`\n  ❌ FAIL — Expected score < 50, got ${data.trust_score}.`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("❌ FAIL:", e.message);
  process.exitCode = 1;
});
