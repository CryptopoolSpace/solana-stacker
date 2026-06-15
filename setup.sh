#!/bin/bash

# Install via npm (no curl needed)
npm install -g @solana/cli

# Set devnet
solana config set --url devnet

# Check
solana --version

echo "✅ Done"
