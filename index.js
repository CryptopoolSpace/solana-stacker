import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import fs from "fs";

// ─── WALLETS ──────────────────────────────────────────────────────────────────
const WALLETS = [
  { label: "Wallet-1", address: "HMwM5poqGaHKHU9MKinD2GEskXKoUQGe6XzKXRcExhbD" },
  { label: "Wallet-2", address: "BYUNJPHWuG2NpziEkrDGoHqGprJd8eq2rggRkHAcMCPn" },
  { label: "Wallet-3", address: "FiS6qMJDStCdmYFA1cAJLyJzyktkknDNLx62sAfNgLLT" },
  { label: "Wallet-4", address: "GLjBAeSvehAG2hiWGYfnMR86mqRodJrk73gsV6GQqZeU" },
  { label: "Wallet-5", address: "8ZHesVPxe92s2tVwqUBQLAshhM26JAWYzDa7BbPSrfGd" },
  { label: "Wallet-6", address: "8tWE3ki7N1cWRZatk4Xwi3ntjaSbKsKGue5WmUooustt" },
];

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const CONFIG = {
  // Jeda antara setiap wallet dalam satu round (ms) — elak 429
  DELAY_BETWEEN_WALLETS_MS: 8_000,   // 8 saat antara wallet

  // Jeda antara round
  ROUND_INTERVAL_MS: 60_000,          // 1 minit antara round

  AIRDROP_AMOUNT_SOL: 2,
  LOG_FILE: "./stacker.log",

  // RPC endpoints — satu per wallet, rotate
  RPC_ENDPOINTS: [
    "https://api.devnet.solana.com",
    "https://devnet.helius-rpc.com/?api-key=demo",
    "https://rpc.ankr.com/solana_devnet",
    "https://api.devnet.solana.com",
    "https://devnet.helius-rpc.com/?api-key=demo",
    "https://rpc.ankr.com/solana_devnet",
  ],
};

// ─── STATS ────────────────────────────────────────────────────────────────────
const stats = {
  totalSuccess: 0,
  totalFailed: 0,
  totalAirdropped: 0,
  startTime: Date.now(),
};

// ─── LOGGER ───────────────────────────────────────────────────────────────────
function log(msg, type = "INFO") {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${type.padEnd(7)}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(CONFIG.LOG_FILE, line + "\n"); } catch (_) {}
}

// ─── SLEEP ────────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ─── AIRDROP WITH RETRY ───────────────────────────────────────────────────────
async function airdropWallet(wallet, rpcUrl) {
  const connection = new Connection(rpcUrl, "confirmed");
  const pubkey = new PublicKey(wallet.address);
  const short = wallet.address.slice(0, 8);

  // Retry up to 3x with backoff
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const sig = await connection.requestAirdrop(
        pubkey,
        CONFIG.AIRDROP_AMOUNT_SOL * LAMPORTS_PER_SOL
      );

      await connection.confirmTransaction(sig, "confirmed");

      const balance = await connection.getBalance(pubkey);
      const balSOL = (balance / LAMPORTS_PER_SOL).toFixed(4);

      stats.totalSuccess++;
      stats.totalAirdropped += CONFIG.AIRDROP_AMOUNT_SOL;

      log(`✅ ${wallet.label} [${short}...] +${CONFIG.AIRDROP_AMOUNT_SOL} SOL | Balance: ${balSOL} SOL`, "SUCCESS");
      return { success: true, balance: parseFloat(balSOL) };

    } catch (err) {
      const is429 = err.message?.includes("429") || err.message?.includes("Too Many");
      const isLast = attempt === 3;

      if (is429 && !isLast) {
        const wait = attempt * 5000;
        log(`⏳ ${wallet.label} rate limited — wait ${wait/1000}s (attempt ${attempt}/3)`, "RETRY");
        await sleep(wait);
      } else {
        stats.totalFailed++;
        const reason = err.message?.slice(0, 80) ?? "unknown";
        log(`❌ ${wallet.label} [${short}...] FAILED — ${reason}`, "FAIL");
        return { success: false };
      }
    }
  }
}

// ─── BALANCE SUMMARY ──────────────────────────────────────────────────────────
async function showBalanceSummary() {
  log("─── BALANCE SUMMARY ────────────────────────────────", "SUMMARY");
  let grandTotal = 0;

  for (const wallet of WALLETS) {
    try {
      const conn = new Connection("https://api.devnet.solana.com", "confirmed");
      const bal = await conn.getBalance(new PublicKey(wallet.address));
      const balSOL = (bal / LAMPORTS_PER_SOL).toFixed(4);
      grandTotal += parseFloat(balSOL);
      log(`  ${wallet.label}: ${balSOL} SOL`, "SUMMARY");
      await sleep(500);
    } catch (_) {
      log(`  ${wallet.label}: error`, "SUMMARY");
    }
  }

  const uptime = ((Date.now() - stats.startTime) / 1000 / 60).toFixed(1);
  log(`  💰 GRAND TOTAL   : ${grandTotal.toFixed(4)} SOL`, "SUMMARY");
  log(`  ✅ Success        : ${stats.totalSuccess}`, "SUMMARY");
  log(`  ❌ Failed         : ${stats.totalFailed}`, "SUMMARY");
  log(`  📈 Total Airdropped: ~${stats.totalAirdropped} SOL`, "SUMMARY");
  log(`  ⏱  Uptime         : ${uptime} min`, "SUMMARY");
  log("────────────────────────────────────────────────────", "SUMMARY");
}

// ─── MAIN LOOP ────────────────────────────────────────────────────────────────
async function main() {
  log("🚀 Solana DevNet Stacker — STARTED", "BOOT");
  log(`👛 ${WALLETS.length} wallets | Delay: ${CONFIG.DELAY_BETWEEN_WALLETS_MS/1000}s between wallets`, "BOOT");
  log(`🔄 Round interval: ${CONFIG.ROUND_INTERVAL_MS/1000}s`, "BOOT");

  let round = 0;

  while (true) {
    round++;
    log(`\n═══ ROUND ${round} ${"═".repeat(40)}`, "ROUND");

    let success = 0;

    // Sequential — satu wallet at a time, tiap satu guna RPC berbeza
    for (let i = 0; i < WALLETS.length; i++) {
      const wallet = WALLETS[i];
      const rpcUrl = CONFIG.RPC_ENDPOINTS[i % CONFIG.RPC_ENDPOINTS.length];

      const result = await airdropWallet(wallet, rpcUrl);
      if (result?.success) success++;

      // Delay antara wallets kecuali last one
      if (i < WALLETS.length - 1) {
        log(`⏳ Wait ${CONFIG.DELAY_BETWEEN_WALLETS_MS/1000}s before next wallet...`, "WAIT");
        await sleep(CONFIG.DELAY_BETWEEN_WALLETS_MS);
      }
    }

    log(`Round ${round} done — ✅ ${success}/${WALLETS.length} | ❌ ${WALLETS.length - success} failed`, "ROUND");

    // Summary setiap 3 rounds
    if (round % 3 === 0) {
      await showBalanceSummary();
    }

    log(`⏳ Round cooldown ${CONFIG.ROUND_INTERVAL_MS/1000}s...\n`, "WAIT");
    await sleep(CONFIG.ROUND_INTERVAL_MS);
  }
}

main().catch(err => {
  log(`💀 FATAL: ${err.message}`, "ERROR");
  process.exit(1);
});
