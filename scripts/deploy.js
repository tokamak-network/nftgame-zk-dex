const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);

  // ─── Deploy MockERC20 (TON) ───
  console.log("\nDeploying MockERC20 (TON)...");
  const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
  const ton = await MockERC20.deploy();
  await ton.waitForDeployment();
  const tonAddr = await ton.getAddress();
  console.log(`  MockERC20 (TON): ${tonAddr}`);

  // Mint tokens to deployer
  const mintAmount = hre.ethers.parseEther("10000");
  await ton.mint(deployer.address, mintAmount);
  console.log(`  Minted 10,000 TON to deployer: ${deployer.address}`);

  // Mint tokens to test accounts
  const testAccounts = [
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  ];
  for (const account of testAccounts) {
    await ton.mint(account, mintAmount);
    console.log(`  Minted 10,000 TON to ${account}`);
  }

  // ─── Deploy feature contracts ───
  const BOX_PRICE = hre.ethers.parseEther("10"); // 10 TON per box

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
      args: (verifierAddr) => [verifierAddr, tonAddr, BOX_PRICE],
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

  const addresses = { mockERC20: tonAddr };

  for (const { verifier, main, key, args } of deployments) {
    console.log(`\nDeploying ${key}...`);

    // Deploy verifier
    const VerifierFactory = await hre.ethers.getContractFactory(verifier);
    const verifierContract = await VerifierFactory.deploy();
    await verifierContract.waitForDeployment();
    const verifierAddr = await verifierContract.getAddress();
    console.log(`  Verifier: ${verifierAddr}`);

    // Deploy main contract
    const MainFactory = await hre.ethers.getContractFactory(main);
    const constructorArgs = args ? args(verifierAddr) : [verifierAddr];
    const mainContract = await MainFactory.deploy(...constructorArgs);
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
