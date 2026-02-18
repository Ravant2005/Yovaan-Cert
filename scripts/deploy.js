const hre = require("hardhat");
const { ethers } = hre;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "MATIC");

  // Deploy
  const CertificateRegistry = await ethers.getContractFactory("CertificateRegistry");
  const registry = await CertificateRegistry.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log("\n✅ CertificateRegistry deployed to:", address);
  console.log("📋 Save these to your .env:");
  console.log(`CONTRACT_ADDRESS=${address}`);
  console.log(`CHAIN_ID=${(await ethers.provider.getNetwork()).chainId}`);

  // Optionally authorize the deployer as first issuer
  // await registry.addIssuer(deployer.address);
  // console.log("✅ Deployer authorized as issuer");

  // Verify on Polygonscan (run separately or here if POLYGONSCAN_API_KEY is set)
  if (process.env.POLYGONSCAN_API_KEY) {
    console.log("\n⏳ Waiting 30s before verification...");
    await new Promise(r => setTimeout(r, 30000));
    try {
      await hre.run("verify:verify", { address });
      console.log("✅ Contract verified on Polygonscan");
    } catch (e) {
      console.log("⚠️  Verification failed:", e.message);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
