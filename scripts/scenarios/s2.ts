/**
 * Scenario S2 — Genuine customer on a new phone (or travelling)
 * Expected: Trust Score 50–89 → OTP step-up
 *
 * Ref: PRD §3.3, scenario S2
 */

const RISK_ENGINE_URL = process.env.RISK_ENGINE_URL || "http://localhost:8001";

async function main() {
  console.log("━━━ S2: Genuine login — new device ━━━\n");

  // Same wallet but a DIFFERENT device fingerprint → triggers unrecognized_device (-30)
  const res = await fetch(`${RISK_ENGINE_URL}/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet: "0xCust01aabbccdd11223344556677889900aabbcc",
      ip_address: "192.168.1.100",
      device_fingerprint: "device_NEW_phone_never_seen_before",
      timestamp: new Date().toISOString(),
    }),
  });

  const data = await res.json();
  console.log("  Trust Score:", data.trust_score);
  console.log("  Reasons:", data.reasons);

  if (data.trust_score >= 50 && data.trust_score <= 89) {
    console.log("\n  ✅ PASS — Score in OTP band (50–89), step-up expected.");
  } else {
    console.log(`\n  ❌ FAIL — Expected score 50-89, got ${data.trust_score}.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("❌ FAIL:", e.message);
  process.exit(1);
});
