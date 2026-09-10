/**
 * Scenario S5 — Circuit breaker: 50+ rapid login attempts
 * Expected: Triggers the circuit breaker within 10 seconds (TC-05)
 *
 * NOTE: The actual circuit breaker is in the smart contract (Karthik's module)
 * and the orchestrator (Sunny's module). This script fires the traffic
 * and verifies that the risk engine correctly scores them as blocked.
 *
 * Ref: PRD §3.3, scenario S5
 */

const RISK_ENGINE_URL = process.env.RISK_ENGINE_URL || "http://localhost:8001";

async function main() {
  console.log("━━━ S5: Credential-stuffing simulation (50+ rapid attempts) ━━━\n");

  const TOTAL_ATTEMPTS = 55;
  let blockedCount = 0;
  let totalTime = 0;

  const startTime = Date.now();

  console.log(`  Firing ${TOTAL_ATTEMPTS} rapid login attempts...\n`);

  for (let i = 0; i < TOTAL_ATTEMPTS; i++) {
    const wallet = `0xAttacker${String(i).padStart(4, "0")}aabb00112233445566`;
    try {
      const res = await fetch(`${RISK_ENGINE_URL}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet,
          ip_address: "203.0.113.50",
          device_fingerprint: "device_botnet_shared",
          timestamp: new Date().toISOString(),
        }),
      });

      const data = await res.json();
      if (data.trust_score < 50) blockedCount++;

      if ((i + 1) % 10 === 0) {
        console.log(`    ${i + 1}/${TOTAL_ATTEMPTS} — last score: ${data.trust_score}`);
      }
    } catch (e: any) {
      // Engine may be overwhelmed — that's part of the test
      console.log(`    Request ${i + 1} failed: ${e.message}`);
    }
  }

  totalTime = Date.now() - startTime;

  console.log(`\n  Results:`);
  console.log(`    Total attempts:   ${TOTAL_ATTEMPTS}`);
  console.log(`    Blocked:          ${blockedCount}`);
  console.log(`    Total time:       ${totalTime}ms`);
  console.log(`    Avg time/request: ${Math.round(totalTime / TOTAL_ATTEMPTS)}ms`);

  if (blockedCount >= TOTAL_ATTEMPTS * 0.5) {
    console.log("\n  ✅ PASS — Majority of rapid attempts were scored as blocked.");
  } else {
    console.log("\n  ❌ FAIL — Expected most attempts to be blocked.");
    process.exit(1);
  }

  console.log(
    "\n  NOTE: Full circuit-breaker tripping requires the orchestrator + contract."
  );
  console.log("        This script only tests the risk-engine scoring behaviour.");
}

main().catch((e) => {
  console.error("❌ FAIL:", e.message);
  process.exit(1);
});
