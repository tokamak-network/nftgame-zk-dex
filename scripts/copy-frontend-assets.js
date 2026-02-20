const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const FRONTEND = path.join(ROOT, "frontend");

// Circuit artifacts to copy
const circuits = [
  {
    name: "private_nft_transfer",
    wasmPath: "circuits/build/private_nft_transfer/private_nft_transfer_js/private_nft_transfer.wasm",
    zkeyPath: "circuits/build/private_nft_transfer/private_nft_transfer.zkey",
  },
  {
    name: "loot_box_open",
    wasmPath: "circuits/build/loot_box_open/loot_box_open_js/loot_box_open.wasm",
    zkeyPath: "circuits/build/loot_box_open/loot_box_open.zkey",
  },
  {
    name: "gaming_item_trade",
    wasmPath: "circuits/build/gaming_item_trade/gaming_item_trade_js/gaming_item_trade.wasm",
    zkeyPath: "circuits/build/gaming_item_trade/gaming_item_trade.zkey",
  },
  {
    name: "card_draw",
    wasmPath: "circuits/build/card_draw/card_draw_js/card_draw.wasm",
    zkeyPath: "circuits/build/card_draw/card_draw.zkey",
  },
];

// ABI extractions
const abis = [
  { artifact: "artifacts/contracts/PrivateNFT.sol/PrivateNFT.json", output: "PrivateNFT.json" },
  { artifact: "artifacts/contracts/LootBoxOpen.sol/LootBoxOpen.json", output: "LootBoxOpen.json" },
  { artifact: "artifacts/contracts/GamingItemTrade.sol/GamingItemTrade.json", output: "GamingItemTrade.json" },
  { artifact: "artifacts/contracts/CardDraw.sol/CardDraw.json", output: "CardDraw.json" },
  { artifact: "artifacts/contracts/test/MockERC20.sol/MockERC20.json", output: "MockERC20.json" },
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Copy circuit artifacts
console.log("Copying circuit artifacts...");
const circuitsDir = path.join(FRONTEND, "public", "circuits");
ensureDir(circuitsDir);

for (const circuit of circuits) {
  const destDir = path.join(circuitsDir, circuit.name);
  ensureDir(destDir);

  const wasmSrc = path.join(ROOT, circuit.wasmPath);
  const zkeySrc = path.join(ROOT, circuit.zkeyPath);

  if (!fs.existsSync(wasmSrc)) {
    console.warn(`  WARN: ${circuit.wasmPath} not found, skipping`);
    continue;
  }
  if (!fs.existsSync(zkeySrc)) {
    console.warn(`  WARN: ${circuit.zkeyPath} not found, skipping`);
    continue;
  }

  fs.copyFileSync(wasmSrc, path.join(destDir, `${circuit.name}.wasm`));
  fs.copyFileSync(zkeySrc, path.join(destDir, `${circuit.name}.zkey`));
  console.log(`  ${circuit.name}: wasm + zkey copied`);
}

// Extract ABIs
console.log("\nExtracting ABIs...");
const abiDir = path.join(FRONTEND, "src", "abi");
ensureDir(abiDir);

for (const { artifact, output } of abis) {
  const artifactPath = path.join(ROOT, artifact);
  if (!fs.existsSync(artifactPath)) {
    console.warn(`  WARN: ${artifact} not found, skipping`);
    continue;
  }

  const full = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  fs.writeFileSync(path.join(abiDir, output), JSON.stringify(full.abi, null, 2));
  console.log(`  ${output}: ${full.abi.length} entries`);
}

console.log("\nDone!");
