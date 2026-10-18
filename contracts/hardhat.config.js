require("@nomicfoundation/hardhat-ethers");
require("@fhevm/hardhat-plugin");

// Keys and RPC URLs are read from environment variables only. Never commit them.
// See .env.example. Load them with e.g. `export $(grep -v '^#' .env | xargs)` or your shell.
const { ZAMIES_DEPLOYER_KEY, SEPOLIA_RPC_URL } = process.env;

const networks = { hardhat: {} };
if (ZAMIES_DEPLOYER_KEY) {
  networks.sepolia = {
    url: SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
    chainId: 11155111,
    accounts: [ZAMIES_DEPLOYER_KEY],
  };
}

module.exports = {
  solidity: {
    version: "0.8.27",
    settings: { evmVersion: "cancun", optimizer: { enabled: true, runs: 200 } },
  },
  networks,
};
