/**
 * trustDevice.ts — mark a demo device as one the customer has used before
 *
 * The first login from a new browser always needs an SMS code, because the
 * device and the address are unfamiliar. Without Twilio credentials that code
 * cannot be delivered, so for a local demo this script records the most recent
 * attempt's device and address as an earlier completed login (one day ago).
 * The next sign-in from that browser then scores in the high-trust band.
 *
 * This is demo seeding, like seed.ts. It needs the development overlay and the
 * internal token, neither of which exists outside a developer's machine.
 *
 *   npm run trust-device -- 0xYourWalletAddress
 */

import { internalHeaders } from "./internalToken";

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:3001";
const RISK_ENGINE_URL = process.env.RISK_ENGINE_URL || "http://localhost:8001";
const DAY_MS = 86_400_000;

interface RecordedEvent {
  wallet_address: string;
  ip_address: string;
  device_fingerprint: string;
  timestamp: string;
}

async function main() {
  const wallet = process.argv[2]?.trim().toLowerCase();
  if (!wallet || !/^0x[0-9a-f]{40}$/.test(wallet)) {
    console.error("Usage: npm run trust-device -- 0xYourWalletAddress");
    process.exit(1);
  }

  const res = await fetch(`${ORCHESTRATOR_URL}/api/audit/events`, { headers: internalHeaders() });
  if (!res.ok) {
    throw new Error(`GET /api/audit/events returned ${res.status}`);
  }

  const events: RecordedEvent[] = await res.json();
  const latest = events.find((event) => event.wallet_address === wallet);
  if (!latest) {
    console.error(`No sign-in attempt found for ${wallet}. Try signing in from the browser first.`);
    process.exit(1);
  }

  const recorded = await fetch(`${RISK_ENGINE_URL}/event`, {
    method: "POST",
    headers: internalHeaders(),
    body: JSON.stringify({
      wallet_address: latest.wallet_address,
      ip_address: latest.ip_address,
      device_fingerprint: latest.device_fingerprint,
      trust_score: 100,
      decision: "allow",
      timestamp: new Date(Date.now() - DAY_MS).toISOString(),
      verified: true,
    }),
  });
  if (!recorded.ok) {
    throw new Error(`POST /event returned ${recorded.status}`);
  }

  console.log(`Recorded an earlier completed login for ${wallet}`);
  console.log(`  device ${latest.device_fingerprint.slice(0, 16)}…  address ${latest.ip_address}`);
  console.log("Sign in again from the same browser: it should now go straight to the wallet signature.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
