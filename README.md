# ConfidentialToken (CTKN)

A privacy-preserving ERC-20 token built with **Zama's fhEVM** — where balances and transfer amounts are **fully encrypted** on-chain using Fully Homomorphic Encryption (FHE).

## The Problem

Standard ERC-20 tokens expose all balances and transfer amounts publicly on the blockchain. This lack of financial privacy creates risks:
- Front-running and MEV exploitation
- Targeted social engineering based on visible holdings
- Competitive intelligence leaks for institutional holders
- Inability to meet regulatory privacy requirements

## The Solution

ConfidentialToken uses Zama Protocol's FHE technology to keep all financial data encrypted while still allowing the smart contract to perform computations (balance checks, transfers, approvals) on encrypted values.

**Key Features:**
- **Encrypted Balances** — stored as `euint64` FHE ciphertexts, invisible to everyone
- **Private Transfers** — transfer amounts encrypted client-side before submission
- **Permissioned Decryption** — only the balance owner can decrypt their own balance via the Gateway
- **Full ERC-20 Interface** — transfer, approve, transferFrom with encrypted amounts
- **Owner Minting** — contract owner can mint new tokens

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│   Frontend   │────▶│  Smart Contract   │────▶│  Coprocessor  │
│  (fhevmjs)   │     │ (ConfidentialERC20)│     │  (FHE ops)    │
│              │     │                    │     │              │
│ - Encrypt    │     │ - euint64 balances │     │ - add/sub    │
│   amounts    │     │ - ACL permissions  │     │ - compare    │
│ - ZK proofs  │     │ - Gateway decrypt  │     │ - select     │
└─────────────┘     └──────────────────┘     └──────────────┘
                              │
                              ▼
                     ┌──────────────┐
                     │   Gateway     │
                     │ (Decryption)  │
                     │              │
                     │ - ACL verify  │
                     │ - KMS decrypt │
                     └──────────────┘
```

## How It Works

1. **Minting**: Owner mints tokens → amount is trivially encrypted into `euint64` on-chain
2. **Transfer**: User encrypts amount client-side with fhevmjs → submits encrypted input with ZK proof → contract performs FHE operations (balance check via `TFHE.le`, conditional transfer via `TFHE.select`, balance update via `TFHE.add/sub`)
3. **Balance Check**: User requests decryption via Gateway → Gateway verifies ACL → KMS threshold-decrypts → result returned to user only

## Tech Stack

- **Smart Contract**: Solidity 0.8.24 + fhEVM library (TFHE.sol)
- **Blockchain**: Ethereum Sepolia Testnet
- **Frontend**: React + Vite + ethers.js v6 + fhevmjs
- **FHE**: Zama Protocol (coprocessor model)
- **Build**: Hardhat 2

## Quick Start

### Prerequisites
- Node.js v20+
- MetaMask wallet with Sepolia ETH ([Sepolia Faucet](https://sepoliafaucet.com))

### 1. Install Dependencies

```bash
npm install
cd frontend && npm install
```

### 2. Deploy Contract

```bash
# Create .env with your deployer key
cp .env.example .env
# Edit .env with your DEPLOYER_PRIVATE_KEY

# Deploy to Sepolia
npx hardhat run scripts/deploy.js --network sepolia
```

### 3. Configure Frontend

```bash
# Copy the deployed contract address from step 2
cp frontend/.env.example frontend/.env
# Edit frontend/.env with VITE_CONTRACT_ADDRESS
```

### 4. Run Frontend

```bash
cd frontend
npm run dev
```

Open http://localhost:5173, connect MetaMask on Sepolia, and start using confidential tokens!

## Smart Contract Details

### ConfidentialERC20.sol

| Function | Description |
|----------|-------------|
| `mint(address, uint64)` | Owner mints tokens (trivially encrypted) |
| `transfer(address, einput, bytes)` | Transfer with client-encrypted amount |
| `approve(address, einput, bytes)` | Set encrypted allowance |
| `transferFrom(address, address, einput, bytes)` | Spend from allowance |
| `requestBalanceDecryption()` | Request Gateway to decrypt your balance |
| `latestDecryptedBalance(address)` | Read last decrypted balance |

### FHE Operations Used

- `TFHE.asEuint64()` — encrypt plaintext to ciphertext
- `TFHE.add()` / `TFHE.sub()` — encrypted arithmetic
- `TFHE.le()` — encrypted comparison (returns `ebool`)
- `TFHE.select()` — encrypted conditional (no branching leak)
- `TFHE.allow()` — grant ACL permission for ciphertext access
- `Gateway.requestDecryption()` — async decryption via KMS

## Security Model

- **No plaintext on-chain**: Balances never exist as plaintext in contract storage
- **Transfer privacy**: Failed transfers (insufficient balance) transfer 0 instead of reverting, preventing balance inference
- **ACL enforcement**: Only balance owners can request decryption
- **ZK proofs**: All encrypted inputs validated with Zero-Knowledge Proofs of Knowledge

## Deployment

- **Network**: Ethereum Sepolia (chainId: 11155111)
- **Zama ACL**: `0xFee8407e2f5e3Ee68ad77cAE98c434e637f516e5`
- **Zama TFHEExecutor**: `0x687408aB54661ba0b4aeF3a44156c616c6955E07`
- **Zama Gateway**: `0x33347831500F1e73f0ccCBb95c9f86B94d7b1123`
- **Zama KMSVerifier**: `0x9D6891A6240D6130c54ae243d8005063D05fE14b`

## License

MIT
