// Deploys AuthRegistry and reports the address. The deploying account becomes
// the contract admin, so the orchestrator must sign admin calls with it.
//
//   npx hardhat run scripts/deploy.ts --network localhost
//
// Set CONTRACT_ADDRESS_FILE to also write the address to a file; the compose
// stack uses that file to hand the address to the orchestrator.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ethers } from "hardhat";

// The compose stack runs this on every `up`. Deploying again each time would
// point the orchestrator at an empty contract while PostgreSQL kept its users,
// so everyone registered before the restart would be told they are not
// registered. If the recorded address still holds code on this chain, that
// deployment is reused instead.
async function existingDeployment(addressFile: string | undefined): Promise<string | null> {
  if (!addressFile) {
    return null;
  }

  try {
    const address = readFileSync(addressFile, "utf8").trim();
    const code = await ethers.provider.getCode(address);
    return code === "0x" ? null : address;
  } catch {
    return null;
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const addressFile = process.env.CONTRACT_ADDRESS_FILE;

  const reused = await existingDeployment(addressFile);
  if (reused) {
    console.log(`CONTRACT_ADDRESS=${reused}`);
    console.log(`ADMIN_WALLET=${deployer.address}`);
    console.log("Reused the deployment already recorded for this chain");
    return;
  }

  const registry = await ethers.deployContract("AuthRegistry");
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log(`CONTRACT_ADDRESS=${address}`);
  console.log(`ADMIN_WALLET=${deployer.address}`);

  if (addressFile) {
    mkdirSync(dirname(addressFile), { recursive: true });
    writeFileSync(addressFile, address, "utf8");
    console.log(`Wrote the address to ${addressFile}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
