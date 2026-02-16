const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);

  const deployments = [
    {
      verifier: "contracts/verifiers/PrivateNftTransferVerifier.sol:Groth16Verifier",
      main: "PrivateNFT",
      key: "privateNFT",
    },
    {
      verifier: "contracts/verifiers/LootBoxOpenVerifier.sol:Groth16Verifier",
      main: "LootBoxOpen",
      key: "lootBoxOpen",
    },
    {
      verifier: "contracts/verifiers/GamingItemTradeVerifier.sol:Groth16Verifier",
      main: "GamingItemTrade",
      key: "gamingItemTrade",
    },
    {
      verifier: "contracts/verifiers/CardDrawVerifier.sol:Groth16Verifier",
      main: "CardDraw",
      key: "cardDraw",
    },
  ];

  const addresses = {};

  for (const { verifier, main, key } of deployments) {
    console.log(`\nDeploying ${key}...`);

    // Deploy verifier
    const VerifierFactory = await hre.ethers.getContractFactory(verifier);
    const verifierContract = await VerifierFactory.deploy();
    await verifierContract.waitForDeployment();
    const verifierAddr = await verifierContract.getAddress();
    console.log(`  Verifier: ${verifierAddr}`);

    // Deploy main contract with verifier address
    const MainFactory = await hre.ethers.getContractFactory(main);
    const mainContract = await MainFactory.deploy(verifierAddr);
    await mainContract.waitForDeployment();
    const mainAddr = await mainContract.getAddress();
    console.log(`  ${main}: ${mainAddr}`);

    addresses[key] = mainAddr;
  }

  // Write addresses to frontend config
  const configDir = path.join(__dirname, "..", "frontend", "src", "config");
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const outputPath = path.join(configDir, "deployedAddresses.json");
  fs.writeFileSync(outputPath, JSON.stringify(addresses, null, 2));
  console.log(`\nAddresses written to ${outputPath}`);
  console.log(JSON.stringify(addresses, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
