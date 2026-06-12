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
  ROUND_INTERVAL_MS: 35_000,   // 35 saat antara rounds
  AIRDROP_AMOUNT_SOL: 2,       // 2 SOL per request
  LOG_FILE: "./stacker.log",

  RPC_ENDPOINTS: [
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
  fs.appendFileSync(CONFIG.LOG_FILE, line + "\n");
}

// ─── RPC ROTATOR ──────────────────────────────────────────────────────────────
let rpcIndex = 0;
function getConnection() {
  const endpoint = CONFIG.RPC_ENDPOINTS[rpcIndex % CONFIG.RPC_ENDPOINTS.length];
  rpcIndex++;
  return new Connection(endpoint, "confirmed");
}

// ─── AIRDROP SINGLE WALLET ────────────────────────────────────────────────────
async function airdropWallet(wallet) {
  const connection = getConnection();
  const pubkey = new PublicKey(wallet.address);
  const short = wallet.address.slice(0, 8);

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
    stats.totalFailed++;
    const reason = err.message?.slice(0, 60) ?? "unknown";
    log(`❌ ${wallet.label} [${short}...] FAILED — ${reason}`, "FAIL");
    return { success: false, balance: 0 };
  }
}

// ─── BALANCE SUMMARY ──────────────────────────────────────────────────────────
async function showBalanceSummary() {
  log("─── BALANCE SUMMARY ────────────────────────────────", "SUMMARY");
  let grandTotal = 0;

  for (const wallet of WALLETS) {
    try {
      const conn = getConnection();
      const bal = await conn.getBalance(new PublicKey(wallet.address));
      const balSOL = (bal / LAMPORTS_PER_SOL).toFixed(4);
      grandTotal += parseFloat(balSOL);
      log(`  ${wallet.label}: ${balSOL} SOL`, "SUMMARY");
    } catch (_) {
      log(`  ${wallet.label}: ERROR reading balance`, "SUMMARY");
    }
  }

  const uptime = ((Date.now() - stats.startTime) / 1000 / 60).toFixed(1);
  log(`  💰 GRAND TOTAL : ${grandTotal.toFixed(4)} SOL`, "SUMMARY");
  log(`  ✅ Total Success: ${stats.totalSuccess} | ❌ Failed: ${stats.totalFailed}`, "SUMMARY");
  log(`  📈 Total Airdropped: ~${stats.totalAirdropped} SOL`, "SUMMARY");
  log(`  ⏱  Uptime: ${uptime} minutes`, "SUMMARY");
  log("────────────────────────────────────────────────────", "SUMMARY");
}

// ─── MAIN LOOP ────────────────────────────────────────────────────────────────
async function main() {
  log("🚀 Solana DevNet Stacker — STARTED", "BOOT");
  log(`👛 ${WALLETS.length} wallets loaded`, "BOOT");
  WALLETS.forEach(w => log(`  ${w.label}: ${w.address}`, "BOOT"));
  log(`🔄 Interval: ${CONFIG.ROUND_INTERVAL_MS / 1000}s | Amount: ${CONFIG.AIRDROP_AMOUNT_SOL} SOL/wallet`, "BOOT");

  let round = 0;

  while (true) {
    round++;
    log(`\n═══ ROUND ${round} ${"═".repeat(40)}`, "ROUND");

    // Parallel airdrop semua wallets serentak
    const results = await Promise.allSettled(
      WALLETS.map(w => airdropWallet(w))
    );

    const success = results.filter(r => r.value?.success).length;
    const failed = WALLETS.length - success;

    log(`Round ${round} — ✅ ${success}/${WALLETS.length} success | ❌ ${failed} failed`, "ROUND");

    // Summary setiap 5 rounds
    if (round % 5 === 0) {
      await showBalanceSummary();
    }

    log(`⏳ Next round dalam ${CONFIG.ROUND_INTERVAL_MS / 1000}s...`, "WAIT");
    await new Promise(r => setTimeout(r, CONFIG.ROUND_INTERVAL_MS));
  }
}

main().catch(err => {
  log(`💀 FATAL: ${err.message}`, "ERROR");
  process.exit(1);
});
