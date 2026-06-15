#!/bin/bash

# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Add to PATH
export PATH="/home/codespace/.local/share/solana/install/active_release/bin:$PATH"

# Set devnet
solana config set --url devnet

# Check version
solana --version

echo "✅ Solana CLI ready. Run: solana airdrop 5"
