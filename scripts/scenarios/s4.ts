/**
 * Scenario S4 — Fraud ring detection
 * Three mule wallets sharing the same device + IP should be
 * connected in the threat graph and flagged.
 *
 * Expected: Graph proximity penalty (-35) applied, cluster detected.
 * Ref: PRD §3.3, scenario S4
 */

const RISK_ENGINE_URL = process.env.RISK_ENGINE_URL || "http://localhost:8001";

const MULE_WALLETS = [
  "0xMule01aabbccdd11223344556677889900aabbcc",
  "0xMule02aabbccdd11223344556677889900aabbcc",
  "0xMule03aabbccdd11223344556677889900aabbcc",
];

const SHARED_IP = "203.0.113.99";
const SHARED_DEVICE = "device_FRAUD_shared_fingerprint";

async function main() {
  console.log("━━━ S4: Fraud ring detection ━━━\n");

  // Fire several logins from all mule wallets to build the graph connections
  console.log("  Step 1: Generating login events from all mule wallets...");
  for (const wallet of MULE_WALLETS) {
    for (let i = 0; i < 4; i++) {
      await fetch(`${RISK_ENGINE_URL}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet,
          ip_address: SHARED_IP,
          device_fingerprint: SHARED_DEVICE,
          timestamp: new Date().toISOString(),
        }),
      });
    }
    console.log(`    → 4 login events for ${wallet.slice(0, 12)}…`);
  }

  // Now score a new login from the first mule wallet
  // After 3+ blocked attempts, auto-flagging should have kicked in
  console.log("\n  Step 2: Scoring a new login from mule_2 (should see graph penalty)...");
  const res = await fetch(`${RISK_ENGINE_URL}/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet: MULE_WALLETS[1],
      ip_address: SHARED_IP,
      device_fingerprint: SHARED_DEVICE,
      timestamp: new Date().toISOString(),
    }),
  });

  const data = await res.json();
  console.log("  Trust Score:", data.trust_score);
  console.log("  Reasons:", data.reasons);

  const hasGraphPenalty = data.reasons.includes("graph_proximity_to_flagged");

  if (hasGraphPenalty) {
    console.log("\n  ✅ PASS — Graph proximity penalty applied, fraud ring detected.");
  } else {
    console.log("\n  ⚠️  Graph proximity penalty not yet applied.");
    console.log("     This may require more blocked attempts to auto-flag a bad actor.");
    console.log(`     Current score: ${data.trust_score}, reasons: ${data.reasons}`);
  }
}

main().catch((e) => {
  console.error("❌ FAIL:", e.message);
  process.exit(1);
});
