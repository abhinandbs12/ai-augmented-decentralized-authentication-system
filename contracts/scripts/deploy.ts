// Deploys AuthRegistry and reports the address. The deploying account becomes
// the contract admin, so the orchestrator must sign admin calls with it.
//
//   npx hardhat run scripts/deploy.ts --network localhost
//
// Set CONTRACT_ADDRESS_FILE to also write the address to a file; the compose
// stack uses that file to hand the address to the orchestrator.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  const registry = await ethers.deployContract("AuthRegistry");
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log(`CONTRACT_ADDRESS=${address}`);
  console.log(`ADMIN_WALLET=${deployer.address}`);

  const addressFile = process.env.CONTRACT_ADDRESS_FILE;
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
