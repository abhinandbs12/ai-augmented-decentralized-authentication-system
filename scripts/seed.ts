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

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:3001";
const RISK_ENGINE_URL = process.env.RISK_ENGINE_URL || "http://localhost:8001";

// ---- Normal customers (valid Ethereum addresses: 0x + 40 hex chars) ----
const NORMAL_WALLETS = [
  {
    wallet: "0xA1b2C3d4E5f6a7B8c9D0e1F2a3B4c5D6e7F8a9B0",
    display_name: "Asha Raghavan",
    phone: "+919876543210",
    device: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
    ip: "192.168.1.100",
  },
  {
    wallet: "0xB2c3D4e5F6a7b8C9d0E1f2A3b4C5d6E7f8A9b0C1",
    display_name: "Rahul Menon",
    phone: "+919876543211",
    device: "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b3",
    ip: "192.168.1.101",
  },
  {
    wallet: "0xC3d4E5f6A7b8c9D0e1F2a3B4c5D6e7F8a9B0c1D2",
    display_name: "Priya Sharma",
    phone: "+919876543212",
    device: "c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b4c5",
    ip: "10.0.0.10",
  },
  {
    wallet: "0xD4e5F6a7B8c9d0E1f2A3b4C5d6E7f8A9b0C1d2E3",
    display_name: "Vikram Patel",
    phone: "+919876543213",
    device: "d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b5d6e7",
    ip: "10.0.0.2",
  },
  {
    wallet: "0xE5f6A7b8C9d0e1F2a3B4c5D6e7F8a9B0c1D2e3F4",
    display_name: "Meera Iyer",
    phone: "+919876543214",
    device: "e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b6e7f8a9",
    ip: "192.168.1.200",
  },
];

// ---- Fraud ring: 3 wallets sharing device + IP ----
const FRAUD_RING = {
  shared_device: "ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00",
  shared_ip: "203.0.113.99",
  wallets: [
    {
      wallet: "0xF6a7B8c9D0e1f2A3b4C5d6E7f8A9b0C1d2E3f4A5",
      display_name: "Mule Account A",
      phone: "+919000000001",
    },
    {
      wallet: "0xa7B8c9D0e1F2a3B4c5D6e7F8a9B0c1D2e3F4a5B6",
      display_name: "Mule Account B",
      phone: "+919000000002",
    },
    {
      wallet: "0xB8c9D0e1f2A3b4C5d6E7f8A9b0C1d2E3f4A5b6C7",
      display_name: "Mule Account C",
      phone: "+919000000003",
    },
  ],
};

async function postJSON(url: string, body: object): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
        });
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
        });
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
