/**
 * Scenario S3 — Stolen credentials: unfamiliar device + location + high velocity
 * Expected: Trust Score < 50 → blocked
 *
 * Ref: PRD §3.3, scenario S3
 */

import { internalHeaders } from "../internalToken";

const RISK_ENGINE_URL = process.env.RISK_ENGINE_URL || "http://localhost:8001";

async function main() {
  console.log("━━━ S3: Stolen-credential pattern ━━━\n");

  // Fire several rapid requests first (to inflate velocity)
  for (let i = 0; i < 6; i++) {
    const payload = {
      wallet: "0xB2c3D4e5F6a7b8C9d0E1f2A3b4C5d6E7f8A9b0C1",
      ip_address: "203.0.113.50",  // Unknown foreign IP (Nigeria per geo overrides)
      device_fingerprint: "dd00ee11ff22aa33bb44cc55dd66ee77ff88aa99bb00cc11dd22ee33ff44aa55",
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
      wallet: "0xB2c3D4e5F6a7b8C9d0E1f2A3b4C5d6E7f8A9b0C1",
      ip_address: "203.0.113.50",
      device_fingerprint: "dd00ee11ff22aa33bb44cc55dd66ee77ff88aa99bb00cc11dd22ee33ff44aa55",
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
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("❌ FAIL:", e.message);
  process.exit(1);
});
