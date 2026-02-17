export const RELAY_API_URL = "https://api.relay.link";

export const NATIVE_CURRENCY = "0x0000000000000000000000000000000000000000";
export const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// Calibur: EIP-7702 batch executor deployed on all chains.
// https://github.com/ithacaxyz/calibur
export const CALIBUR_ADDRESS =
  "0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00" as const;

export const CHAIN_IDS = {
  ethereum: 1,
  optimism: 10,
  base: 8453,
  arbitrum: 42161,
} as const;
