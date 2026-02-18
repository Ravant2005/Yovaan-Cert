require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const normalizePrivateKey = (key) => {
  if (!key) return null;
  return key.startsWith("0x") ? key : `0x${key}`;
};

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },

  networks: {
    hardhat: {},
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    amoy: {
      url:
        process.env.ALCHEMY_AMOY_URL ||
        process.env.MUMBAI_RPC_URL ||
        process.env.AMOY_RPC_URL ||
        "https://rpc-amoy.polygon.technology",
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [normalizePrivateKey(process.env.DEPLOYER_PRIVATE_KEY)]
        : [],
      chainId: 80002,
    },
    polygon: {
      url: process.env.POLYGON_RPC_URL || "https://polygon-rpc.com",
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [normalizePrivateKey(process.env.DEPLOYER_PRIVATE_KEY)]
        : [],
      chainId: 137,
    },
  },

  etherscan: {
    apiKey: {
      polygonAmoy: process.env.POLYGONSCAN_API_KEY || "",
      polygon: process.env.POLYGONSCAN_API_KEY || "",
    },
  },

  paths: {
    sources: "./contracts",
    tests:   "./test",
    cache:   "./cache",
    artifacts: "./artifacts",
  },

  mocha: {
    timeout: 40000,
  },
};
