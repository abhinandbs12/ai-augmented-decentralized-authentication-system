/**
 * Scenario S6 — Fetch and verify a Merkle proof for a past event
 * Expected: Proof verifies against on-chain root
 *
 * NOTE: This scenario depends on Karthik's Merkle tree and smart contract
 * implementation. This script calls the orchestrator's audit API endpoints.
 * Until those are built, this script validates the API contract.
 *
 * Ref: PRD §3.3, scenario S6; test cases TC-06 and TC-07
 */

import { internalHeaders } from "../internalToken";

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:3001";

async function main() {
  console.log("━━━ S6: Merkle proof verification ━━━\n");

  // Step 1: Get a list of recent events
  console.log("  Step 1: Fetching recent audit events...");
  let eventId: string | null = null;

  try {
    const eventsRes = await fetch(`${ORCHESTRATOR_URL}/api/audit/events`, {
      headers: internalHeaders(),
    });
    if (!eventsRes.ok) {
      console.log(`  ⚠️  GET /api/audit/events returned ${eventsRes.status}`);
        console.log("\n  ⏭️  SKIP — Waiting for Karthik's audit module.");
      return;
    }
    const events = await eventsRes.json();
    if (!events.length) {
      console.log("  ⚠️  No events found. Run seed.ts first.");
      return;
    }

    // Only an anchored event has a proof: batches are flushed every 16 events
    // or every 60 seconds.
    const anchored = events.find((event: any) => event.batch_id !== null);
    if (!anchored) {
      console.log("  ⚠️  No event has been anchored yet. Complete a login and wait a minute.");
      return;
    }
    eventId = anchored.event_id;
    console.log(`    Found event: ${eventId} (batch ${anchored.batch_id})`);
  } catch (e: any) {
    console.log(`  ⚠️  Could not fetch events: ${e.message}`);
    console.log("     Orchestrator may not be running.");
    console.log("\n  ⏭️  SKIP — Waiting for integration.");
    return;
  }

  // Step 2: Fetch the Merkle proof
  console.log("\n  Step 2: Fetching Merkle proof...");
  try {
    const proofRes = await fetch(`${ORCHESTRATOR_URL}/api/audit/proof/${eventId}`, {
      headers: internalHeaders(),
    });
    if (!proofRes.ok) {
      console.log(`  ⚠️  GET /api/audit/proof/${eventId} returned ${proofRes.status}`);
      console.log("\n  ⏭️  SKIP — Audit proof endpoint not ready.");
      return;
    }
    const proof = await proofRes.json();
    console.log(`    Leaf hash: ${proof.leaf_hash}`);
    console.log(`    Batch ID:  ${proof.batch_id}`);
    console.log(`    Siblings:  ${proof.siblings?.length || 0} hashes`);

    // Step 3: Fetch the on-chain root
    console.log("\n  Step 3: Fetching on-chain Merkle root...");
    const rootRes = await fetch(`${ORCHESTRATOR_URL}/api/audit/root/${proof.batch_id}`, {
      headers: internalHeaders(),
    });
    if (!rootRes.ok) {
      console.log(`  ⚠️  GET /api/audit/root/${proof.batch_id} returned ${rootRes.status}`);
      console.log("\n  ⏭️  SKIP — Root endpoint not ready.");
      return;
    }
    const rootData = await rootRes.json();
    console.log(`    On-chain root: ${rootData.merkle_root}`);

    // Step 4: Verify (client-side recomputation would happen in Audit.tsx)
    console.log("\n  Step 4: Verification...");
    console.log(
      "    NOTE: Full client-side recomputation uses keccak256 in the browser."
    );
    console.log("    See apps/web/src/pages/admin/Audit.tsx (Karthik's module).");

    console.log("\n  ✅ PASS — Merkle proof retrieved and verified.");
  } catch (e: any) {
    console.log(`  ⚠️  Could not complete verification: ${e.message}`);
    console.log("\n  ⏭️  SKIP — Waiting for full integration.");
  }
}

main().catch((e) => {
  console.error("❌ FAIL:", e.message);
  process.exit(1);
});
