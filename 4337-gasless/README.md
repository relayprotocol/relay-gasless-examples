# ERC-4337 Gasless Bridge

Gasless cross-chain bridging using an ERC-4337 smart account (SimpleAccount) with Relay. The app owns the smart account key (embedded wallet pattern) and Relay covers all gas fees.

**Bridge:** 1 USDC on Base -> USDC on Arbitrum

## How it works

ERC-4337 UserOperations normally require gas fees, either paid by the sender or a paymaster. With Relay, we set all gas fee fields to 0 and submit the `handleOps` call via Relay's `/execute` endpoint instead of directly to the EntryPoint. Relay's relayer submits the transaction and covers the gas.

### Flow

```
Step 0: Setup
  - Derive the smart account address from the owner's private key
  - Check if the account is already deployed on-chain
  - If the smart account doesn't have enough USDC, automatically
    transfer from the owner EOA

Step 1: Get quote from Relay
  - POST /quote/v2 to get deposit tx details and a requestId
  - Returns approve + deposit calls for the bridge

Step 2: Build UserOperation
  - Get the account nonce from the EntryPoint
  - Include initCode if the account isn't deployed yet (deploys it
    as part of the first UserOp)
  - Batch the approve + deposit calls via executeBatch
  - Set gas fees to 0 (Relay pays)
  - No paymaster needed

Step 3: Sign UserOperation
  - Hash the UserOp (v0.7 format)
  - Sign with the owner key (SimpleAccount validates via
    ecrecover + toEthSignedMessageHash)

Step 4: Submit to Relay /execute
  - Encode EntryPoint.handleOps([signedUserOp], beneficiary)
  - POST to /execute with subsidizeFees: true

Step 5: Poll for completion
  - GET /intents/status/v3 until the cross-chain bridge completes
```

## Requirements

- **Node.js** 18+
- A **Relay API key** with a funded sponsoring wallet ([relay.link](https://relay.link))
- An **owner private key** (EOA) — this key controls the smart account
- **USDC on Base** — either on the owner EOA (auto-transferred to the smart account) or already on the smart account

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file (copy from `.env.example`):

```bash
cp .env.example .env
```

3. Fill in your values:

```
RELAY_API_KEY=your-relay-api-key
OWNER_PRIVATE_KEY=0xyour-private-key
```

## Running

### Dry run (no API calls, no real transactions)

Tests the full UserOp building and signing flow locally:

```bash
npm run demo:dry-run
```

With an API key set, the dry run will fetch a real quote but skip the `/execute` submission.

### Full run

Executes the bridge end-to-end:

```bash
npm run demo
```

This will:
1. Auto-fund the smart account with USDC from the owner EOA if needed (requires a small amount of ETH on the owner EOA for the transfer gas)
2. Deploy the smart account if it doesn't exist yet (included in the UserOp)
3. Bridge 1 USDC from Base to Arbitrum via Relay

## Architecture

```
4337-gasless/
  src/
    gasless-4337.ts    # Main entry point — orchestrates the full flow
    smart-account.ts   # SimpleAccount ABIs, UserOp building & hashing
    relay.ts           # Relay API helpers (fetch wrapper, status polling)
    types.ts           # TypeScript types for Relay API responses
```

### Key technical details

- **Smart account:** [SimpleAccount](https://github.com/eth-infinitism/account-abstraction) (eth-infinitism v0.7)
- **EntryPoint v0.7:** `0x0000000071727De22E5E9d8BAf0edAc6f37da032`
- **SimpleAccountFactory:** `0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985`
- **Gas trick:** `maxFeePerGas = 0`, `maxPriorityFeePerGas = 0` — Relay covers gas instead of the user or a paymaster
- **UserOp format:** v0.7 packed — gas values are packed into `bytes32` fields (`accountGasLimits`, `gasFees`)
