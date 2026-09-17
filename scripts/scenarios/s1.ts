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
      wallet: "0xA1b2C3d4E5f6a7B8c9D0e1F2a3B4c5D6e7F8a9B0",
      ip_address: "192.168.1.100",
      device_fingerprint: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
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
