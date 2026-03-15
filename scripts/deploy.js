const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const ConfidentialERC20 = await hre.ethers.getContractFactory("ConfidentialERC20");
  const token = await ConfidentialERC20.deploy("Confidential Token", "CTKN");
  await token.waitForDeployment();

  const address = await token.getAddress();
  console.log("ConfidentialERC20 deployed to:", address);

  // Mint initial supply to deployer
  const mintTx = await token.mint(deployer.address, 1_000_000n);
  await mintTx.wait();
  console.log("Minted 1,000,000 CTKN to deployer");

  const fs = require("fs");
  const deployment = {
    address,
    deployer: deployer.address,
    network: hre.network.name,
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync("deployment.json", JSON.stringify(deployment, null, 2));
  console.log("Deployment info saved to deployment.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
