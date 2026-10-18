const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const registry = await hre.ethers.deployContract('WalletRegistry');
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  const { chainId } = await hre.ethers.provider.getNetwork();
  const record = {
    address,
    chainId: Number(chainId),
    admin: deployer.address,
    deployedAt: new Date().toISOString(),
  };

  const dir = path.join(__dirname, '..', 'deployments');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${hre.network.name}.json`), JSON.stringify(record, null, 2));
  console.log(`WalletRegistry deployed to ${address} (chainId ${record.chainId}, admin ${deployer.address})`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
