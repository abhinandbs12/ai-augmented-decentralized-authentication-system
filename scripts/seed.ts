/**
 * seed.ts — Demo Data Seeder
 * ============================
 * Seeds sample data via the orchestrator's API:
 *   - 5 normal registered wallets with login history
 *   - 1 fraud ring of 3 wallets sharing the same device fingerprint and IP
 *
 * Usage:
 *   npx ts-node scripts/seed.ts
 *
 * Prerequisites:
 *   - Orchestrator running at ORCHESTRATOR_URL (default: http://localhost:3001)
 *   - Risk engine running at RISK_ENGINE_URL (default: http://localhost:8001)
 *   - MongoDB running and accessible
 *
 * Owner: Abhinand Baiju Smitha
 * Ref: docs/Abhinand_Task_Plan.md — scripts/seed.ts section
 */

import { FRAUD_RING, NORMAL_WALLETS } from "./demoData";
import { internalHeaders } from "./internalToken";

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:3001";
const RISK_ENGINE_URL = process.env.RISK_ENGINE_URL || "http://localhost:8001";

async function postJSON(
  url: string,
  body: object,
  headers: Record<string, string> = { "Content-Type": "application/json" }
): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function seedNormalCustomers() {
  console.log("\n=== Seeding Normal Customers ===\n");

  for (const cust of NORMAL_WALLETS) {
    // Register via orchestrator
    try {
      const reg = await postJSON(`${ORCHESTRATOR_URL}/api/auth/register`, {
        wallet_address: cust.wallet,
        display_name: cust.display_name,
        phone_number: cust.phone,
      });
      console.log(`  [OK] Registered ${cust.display_name}: ${reg.status}`);
    } catch (e: any) {
      console.log(`  [WARN] Register ${cust.display_name}: ${e.message}`);
    }

    // Seed login history via POST /event (orchestrator reports completed events)
    for (let i = 0; i < 3; i++) {
      try {
        const ts = new Date(Date.now() - (i + 1) * 86400000).toISOString();
        await postJSON(`${RISK_ENGINE_URL}/event`, {
          wallet_address: cust.wallet,
          ip_address: cust.ip,
          device_fingerprint: cust.device,
          trust_score: 100,
          decision: "allow",
          timestamp: ts,
          // A completed login: this is what makes the device and IP familiar.
          verified: true,
        }, internalHeaders());
      } catch (e: any) {
        // Silently continue — risk engine may not be up
      }
    }
    console.log(`  [DATA] Seeded 3 login events for ${cust.display_name}`);
  }
}

async function seedFraudRing() {
  console.log("\n=== Seeding Fraud Ring (3 wallets, shared device + IP) ===\n");

  for (const mule of FRAUD_RING.wallets) {
    // Register via orchestrator
    try {
      const reg = await postJSON(`${ORCHESTRATOR_URL}/api/auth/register`, {
        wallet_address: mule.wallet,
        display_name: mule.display_name,
        phone_number: mule.phone,
      });
      console.log(`  [OK] Registered ${mule.display_name}: ${reg.status}`);
    } catch (e: any) {
      console.log(`  [WARN] Register ${mule.display_name}: ${e.message}`);
    }

    // Seed login events with shared device and IP
    for (let i = 0; i < 2; i++) {
      try {
        const ts = new Date(Date.now() - (i + 1) * 3600000).toISOString();
        await postJSON(`${RISK_ENGINE_URL}/event`, {
          wallet_address: mule.wallet,
          ip_address: FRAUD_RING.shared_ip,
          device_fingerprint: FRAUD_RING.shared_device,
          trust_score: 35,
          decision: "blocked",
          timestamp: ts,
        }, internalHeaders());
      } catch (e: any) {
        // Silently continue
      }
    }
    console.log(
      `  [DATA] Seeded 2 login events for ${mule.display_name} ` +
        `(IP: ${FRAUD_RING.shared_ip}, Device: ${FRAUD_RING.shared_device.slice(0, 16)}...)`
    );
  }

  console.log("\n  [LINK] All 3 mule wallets share the same device + IP.");
  console.log("         The threat graph should connect them as a cluster.\n");
}

async function main() {
  console.log("========================================");
  console.log("  Banking Auth System - Data Seeder     ");
  console.log("========================================");

  await seedNormalCustomers();
  await seedFraudRing();

  console.log("\n[DONE] Seeding complete.");
  console.log("  Normal wallets: 5");
  console.log("  Fraud ring wallets: 3 (shared device + IP)");
  console.log("  Total login events seeded: ~21\n");
}

main().catch((err) => {
  console.error("[ERROR] Seeding failed:", err.message);
  process.exit(1);
});
