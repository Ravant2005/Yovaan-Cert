const hre = require("hardhat");
const { ethers } = hre;
require("dotenv").config();

function normalizePrivateKey(key) {
  if (!key) return null;
  return key.startsWith("0x") ? key : `0x${key}`;
}

async function main() {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  if (!contractAddress) {
    throw new Error("CONTRACT_ADDRESS is missing in .env");
  }

  let issuerAddress = process.env.ISSUER_ADDRESS;
  if (!issuerAddress) {
    const pk = normalizePrivateKey(process.env.ISSUER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY);
    if (!pk) throw new Error("Set ISSUER_ADDRESS or ISSUER_PRIVATE_KEY/DEPLOYER_PRIVATE_KEY in .env");
    issuerAddress = new ethers.Wallet(pk).address;
  }

  const registry = await ethers.getContractAt("CertificateRegistry", contractAddress);
  const alreadyAuthorized = await registry.authorizedIssuers(issuerAddress);
  if (alreadyAuthorized) {
    console.log(`Issuer already authorized: ${issuerAddress}`);
    return;
  }

  const tx = await registry.addIssuer(issuerAddress);
  const receipt = await tx.wait();

  console.log(`Authorized issuer: ${issuerAddress}`);
  console.log(`Tx hash: ${receipt.hash}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
