import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.25",
    settings: {
      evmVersion: "cancun",
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    localhost: {
      // RPC_URL lets the same command run against the Hardhat container.
      url: process.env.RPC_URL || "http://127.0.0.1:8545",
    },
  },
};

export default config;
