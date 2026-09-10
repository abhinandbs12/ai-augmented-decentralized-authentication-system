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

// ---- Normal customers ----
const NORMAL_WALLETS = [
  {
    wallet: "0xCust01aabbccdd11223344556677889900aabbcc",
    display_name: "Asha Raghavan",
    phone: "+919876543210",
    device: "device_asha_main_phone",
    ip: "192.168.1.100",
  },
  {
    wallet: "0xCust02aabbccdd11223344556677889900aabbcc",
    display_name: "Rahul Menon",
    phone: "+919876543211",
    device: "device_rahul_laptop",
    ip: "192.168.1.101",
  },
  {
    wallet: "0xCust03aabbccdd11223344556677889900aabbcc",
    display_name: "Priya Sharma",
    phone: "+919876543212",
    device: "device_priya_ipad",
    ip: "10.0.0.10",
  },
  {
    wallet: "0xCust04aabbccdd11223344556677889900aabbcc",
    display_name: "Vikram Patel",
    phone: "+919876543213",
    device: "device_vikram_desktop",
    ip: "10.0.0.2",
  },
  {
    wallet: "0xCust05aabbccdd11223344556677889900aabbcc",
    display_name: "Meera Iyer",
    phone: "+919876543214",
    device: "device_meera_phone",
    ip: "192.168.1.200",
  },
];

// ---- Fraud ring: 3 wallets sharing device + IP ----
const FRAUD_RING = {
  shared_device: "device_FRAUD_shared_fingerprint",
  shared_ip: "203.0.113.99",
  wallets: [
    {
      wallet: "0xMule01aabbccdd11223344556677889900aabbcc",
      display_name: "Mule Account A",
      phone: "+919000000001",
    },
    {
      wallet: "0xMule02aabbccdd11223344556677889900aabbcc",
      display_name: "Mule Account B",
      phone: "+919000000002",
    },
    {
      wallet: "0xMule03aabbccdd11223344556677889900aabbcc",
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
    // Register
    try {
      const reg = await postJSON(`${ORCHESTRATOR_URL}/api/auth/register`, {
        wallet_address: cust.wallet,
        display_name: cust.display_name,
        phone_number: cust.phone,
      });
      console.log(`  ✅ Registered ${cust.display_name}: ${reg.status}`);
    } catch (e: any) {
      console.log(`  ⚠️  Register ${cust.display_name}: ${e.message}`);
    }

    // Seed a few normal login events via the risk engine directly
    for (let i = 0; i < 3; i++) {
      try {
        const ts = new Date(Date.now() - (i + 1) * 86400000).toISOString();
        await postJSON(`${RISK_ENGINE_URL}/score`, {
          wallet: cust.wallet,
          ip_address: cust.ip,
          device_fingerprint: cust.device,
          timestamp: ts,
        });
      } catch (e: any) {
        // Silently continue — risk engine may not be up
      }
    }
    console.log(`  📊 Seeded 3 login events for ${cust.display_name}`);
  }
}

async function seedFraudRing() {
  console.log("\n=== Seeding Fraud Ring (3 wallets, shared device + IP) ===\n");

  for (const mule of FRAUD_RING.wallets) {
    // Register
    try {
      const reg = await postJSON(`${ORCHESTRATOR_URL}/api/auth/register`, {
        wallet_address: mule.wallet,
        display_name: mule.display_name,
        phone_number: mule.phone,
      });
      console.log(`  ✅ Registered ${mule.display_name}: ${reg.status}`);
    } catch (e: any) {
      console.log(`  ⚠️  Register ${mule.display_name}: ${e.message}`);
    }

    // Seed login events with shared device and IP
    for (let i = 0; i < 2; i++) {
      try {
        const ts = new Date(Date.now() - (i + 1) * 3600000).toISOString();
        await postJSON(`${RISK_ENGINE_URL}/score`, {
          wallet: mule.wallet,
          ip_address: FRAUD_RING.shared_ip,
          device_fingerprint: FRAUD_RING.shared_device,
          timestamp: ts,
        });
      } catch (e: any) {
        // Silently continue
      }
    }
    console.log(
      `  📊 Seeded 2 login events for ${mule.display_name} ` +
        `(IP: ${FRAUD_RING.shared_ip}, Device: ${FRAUD_RING.shared_device.slice(0, 20)}…)`
    );
  }

  console.log("\n  🔗 All 3 mule wallets share the same device + IP.");
  console.log("     The threat graph should connect them as a cluster.\n");
}

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   Banking Auth System — Data Seeder      ║");
  console.log("╚══════════════════════════════════════════╝");

  await seedNormalCustomers();
  await seedFraudRing();

  console.log("\n✅ Seeding complete.");
  console.log("   Normal wallets: 5");
  console.log("   Fraud ring wallets: 3 (shared device + IP)");
  console.log("   Total login events seeded: ~21\n");
}

main().catch((err) => {
  console.error("❌ Seeding failed:", err.message);
  process.exit(1);
});
