import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import fs from "fs";

const WALLETS = [
  { label: "Wallet-1", address: "HMwM5poqGaHKHU9MKinD2GEskXKoUQGe6XzKXRcExhbD" },
  { label: "Wallet-2", address: "BYUNJPHWuG2NpziEkrDGoHqGprJd8eq2rggRkHAcMCPn" },
  { label: "Wallet-3", address: "FiS6qMJDStCdmYFA1cAJLyJzyktkknDNLx62sAfNgLLT" },
  { label: "Wallet-4", address: "GLjBAeSvehAG2hiWGYfnMR86mqRodJrk73gsV6GQqZeU" },
  { label: "Wallet-5", address: "8ZHesVPxe92s2tVwqUBQLAshhM26JAWYzDa7BbPSrfGd" },
  { label: "Wallet-6", address: "8tWE3ki7N1cWRZatk4Xwi3ntjaSbKsKGue5WmUooustt" },
];

const CONFIG = {
  // 5 minit antara setiap wallet — respect rate limit
  DELAY_BETWEEN_WALLETS_MS: 15 * 60 * 1000,
  // 10 minit cooldown lepas satu round habis
  ROUND_COOLDOWN_MS: 10 * 60 * 1000,
  AIRDROP_AMOUNT_SOL: 2,
  RPC: "https://api.devnet.solana.com",
  LOG_FILE: "./stacker.log",
};

const stats = {
  totalSuccess: 0,
  totalFailed: 0,
  totalSOL: 0,
  startTime: Date.now(),
};

function log(msg, type = "INFO") {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${type.padEnd(7)}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(CONFIG.LOG_FILE, line + "\n"); } catch (_) {}
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function airdropWallet(wallet) {
  const conn = new Connection(CONFIG.RPC, "confirmed");
  const pubkey = new PublicKey(wallet.address);
  const short = wallet.address.slice(0, 8);

  try {
    log(`⏺  Requesting airdrop → ${wallet.label} [${short}...]`, "TRY");

    const sig = await conn.requestAirdrop(
      pubkey,
      CONFIG.AIRDROP_AMOUNT_SOL * LAMPORTS_PER_SOL
    );

    log(`⏳ Confirming transaction...`, "TRY");
    await conn.confirmTransaction(sig, "confirmed");

    const balance = await conn.getBalance(pubkey);
    const balSOL = (balance / LAMPORTS_PER_SOL).toFixed(4);

    stats.totalSuccess++;
    stats.totalSOL += CONFIG.AIRDROP_AMOUNT_SOL;

    log(`✅ ${wallet.label} +${CONFIG.AIRDROP_AMOUNT_SOL} SOL | Balance: ${balSOL} SOL`, "SUCCESS");
    return true;

  } catch (err) {
    stats.totalFailed++;
    log(`❌ ${wallet.label} FAILED — ${err.message?.slice(0, 100)}`, "FAIL");
    return false;
  }
}

async function showSummary() {
  log("──────────── SUMMARY ────────────", "SUMMARY");
  let total = 0;
  for (const w of WALLETS) {
    try {
      const conn = new Connection(CONFIG.RPC, "confirmed");
      const bal = await conn.getBalance(new PublicKey(w.address));
      const sol = (bal / LAMPORTS_PER_SOL).toFixed(4);
      total += parseFloat(sol);
      log(`  ${w.label}: ${sol} SOL`, "SUMMARY");
      await sleep(2000);
    } catch (_) {}
  }
  const uptime = ((Date.now() - stats.startTime) / 60000).toFixed(1);
  log(`  💰 TOTAL: ${total.toFixed(4)} SOL`, "SUMMARY");
  log(`  ✅ Success: ${stats.totalSuccess} | ❌ Failed: ${stats.totalFailed}`, "SUMMARY");
  log(`  ⏱  Uptime: ${uptime} min`, "SUMMARY");
  log("─────────────────────────────────", "SUMMARY");
}

async function main() {
  log("🚀 SOL Stacker started — slow & steady mode", "BOOT");
  log(`⏱  Wallet gap: ${CONFIG.DELAY_BETWEEN_WALLETS_MS/60000} min | Round cooldown: ${CONFIG.ROUND_COOLDOWN_MS/60000} min`, "BOOT");

  let round = 0;

  while (true) {
    round++;
    log(`\n═══ ROUND ${round} ═══════════════════════════════`, "ROUND");

    let success = 0;
    for (let i = 0; i < WALLETS.length; i++) {
      const ok = await airdropWallet(WALLETS[i]);
      if (ok) success++;

      if (i < WALLETS.length - 1) {
        const mins = CONFIG.DELAY_BETWEEN_WALLETS_MS / 60000;
        log(`⏳ Waiting ${mins} min before next wallet...`, "WAIT");
        await sleep(CONFIG.DELAY_BETWEEN_WALLETS_MS);
      }
    }

    log(`Round ${round} done — ✅ ${success}/${WALLETS.length}`, "ROUND");
    await showSummary();

    log(`💤 Cooldown ${CONFIG.ROUND_COOLDOWN_MS/60000} min...\n`, "WAIT");
    await sleep(CONFIG.ROUND_COOLDOWN_MS);
  }
}

main().catch(err => {
  log(`💀 FATAL: ${err.message}`, "ERROR");
  process.exit(1);
});
