/**
 * Scenario S1 — Genuine login, usual device, usual location
 * Expected: Trust Score 90+ → allow path
 *
 * Ref: PRD §3.3, scenario S1
 */

const RISK_ENGINE_URL = process.env.RISK_ENGINE_URL || "http://localhost:8001";

async function main() {
  console.log("━━━ S1: Genuine login — usual device, usual location ━━━\n");

  // Use a wallet that was seeded with history from the same device/IP
  const res = await fetch(`${RISK_ENGINE_URL}/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet: "0xCust01aabbccdd11223344556677889900aabbcc",
      ip_address: "192.168.1.100",
      device_fingerprint: "device_asha_main_phone",
      timestamp: new Date().toISOString(),
    }),
  });

  const data = await res.json();
  console.log("  Trust Score:", data.trust_score);
  console.log("  Reasons:", data.reasons);

  const decision =
    data.trust_score >= 90 ? "allow" : data.trust_score >= 50 ? "otp_required" : "blocked";
  console.log("  Decision:", decision);

  if (data.trust_score >= 90) {
    console.log("\n  ✅ PASS — Score >= 90, allow path taken as expected.");
  } else {
    console.log(`\n  ❌ FAIL — Expected score >= 90, got ${data.trust_score}.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("❌ FAIL:", e.message);
  process.exit(1);
});
