/**
 * Scenario S3 — Stolen credentials: unfamiliar device + location + high velocity
 * Expected: Trust Score < 50 → blocked
 *
 * Ref: PRD §3.3, scenario S3
 */

const RISK_ENGINE_URL = process.env.RISK_ENGINE_URL || "http://localhost:8001";

async function main() {
  console.log("━━━ S3: Stolen-credential pattern ━━━\n");

  // Fire several rapid requests first (to inflate velocity)
  for (let i = 0; i < 6; i++) {
    await fetch(`${RISK_ENGINE_URL}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wallet: "0xCust02aabbccdd11223344556677889900aabbcc",
        ip_address: "203.0.113.50",  // Unknown foreign IP (Nigeria per geo overrides)
        device_fingerprint: "device_STOLEN_attacker_machine",
        timestamp: new Date().toISOString(),
      }),
    });
  }

  // Final request — should now have high velocity + unrecognized device + unrecognized IP
  const res = await fetch(`${RISK_ENGINE_URL}/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet: "0xCust02aabbccdd11223344556677889900aabbcc",
      ip_address: "203.0.113.50",
      device_fingerprint: "device_STOLEN_attacker_machine",
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
