/**
 * Scenario S6 — Fetch and verify a Merkle proof for a past event
 * Expected: Proof verifies against on-chain root
 *
 * Walks the proof from the sealed leaf to a root, compares that root with the
 * one on the contract, and checks the stored record still hashes to the leaf.
 * The console's Audit trail does the same in the browser, and also rehashes the
 * record itself; here the orchestrator's current_leaf_hash is used for that.
 *
 * Ref: PRD §3.3, scenario S6; test cases TC-06 and TC-07
 */

import { internalHeaders } from "../internalToken";

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:3001";
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: internalHeaders() });
  if (!res.ok) {
    throw new Error(`GET ${url} returned ${res.status}`);
  }
  return res.json();
}

// Keccak-256 from the local chain node (web3_sha3), so the script needs no
// hashing library. Node's own sha3-256 is a different function.
async function keccak256(hex: string): Promise<string> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "web3_sha3", params: [hex] }),
  });
  const body = await res.json();
  if (typeof body.result !== "string") {
    throw new Error(`web3_sha3 failed: ${body.error?.message ?? res.status}`);
  }
  return body.result;
}

async function main() {
  console.log("━━━ S6: Merkle proof verification ━━━\n");

  // Step 1: Get a list of recent events
  console.log("  Step 1: Fetching recent audit events...");
  const events = await getJson(`${ORCHESTRATOR_URL}/api/audit/events`);

  // Only an anchored event has a proof: batches are flushed every 16 events
  // or every 60 seconds.
  const anchored = events.find((event: any) => event.batch_id !== null);
  if (!anchored) {
    throw new Error("no event has been anchored yet. Complete a sign-in and wait a minute.");
  }
  console.log(`    Found event: ${anchored.event_id} (batch ${anchored.batch_id})`);

  // Step 2: Fetch the Merkle proof
  console.log("\n  Step 2: Fetching Merkle proof...");
  const proof = await getJson(`${ORCHESTRATOR_URL}/api/audit/proof/${anchored.event_id}`);
  console.log(`    Leaf hash: ${proof.leaf_hash}`);
  console.log(`    Batch ID:  ${proof.batch_id}`);
  console.log(`    Siblings:  ${proof.siblings.length} hashes`);

  // Step 3: Fetch the on-chain root
  console.log("\n  Step 3: Fetching on-chain Merkle root...");
  const rootData = await getJson(`${ORCHESTRATOR_URL}/api/audit/root/${proof.batch_id}`);
  console.log(`    On-chain root: ${rootData.merkle_root}`);

  // Step 4: Fold the siblings in the order the proof gives, as the browser does.
  console.log("\n  Step 4: Verification...");
  let root: string = proof.leaf_hash;
  for (const step of proof.siblings as { hash: string; position: "left" | "right" }[]) {
    const [left, right] = step.position === "right" ? [root, step.hash] : [step.hash, root];
    root = await keccak256(`0x${left.slice(2)}${right.slice(2)}`);
  }
  console.log(`    Root from proof: ${root}`);

  if (root.toLowerCase() !== String(rootData.merkle_root).toLowerCase()) {
    throw new Error("the proof does not reach the root stored on the contract.");
  }
  if (proof.current_leaf_hash !== proof.leaf_hash) {
    throw new Error("the stored record no longer hashes to the sealed leaf: it was altered.");
  }

  console.log("\n  ✅ PASS — the proof reaches the on-chain root and the record is unaltered.");
}

main().catch((e) => {
  console.log(`\n  ❌ FAIL — ${e.message}`);
  // exitCode rather than exit(): exiting while fetch's sockets are closing
  // trips a libuv assertion on Windows, and the process aborts instead.
  process.exitCode = 1;
});
