import type { ChainConfig, CurrencyConfig } from "./types";

export const RELAY_API_URL = "https://api.relay.link";

export const NATIVE_CURRENCY = "0x0000000000000000000000000000000000000000";

// ── Supported chains ──

export const SUPPORTED_CHAINS: ChainConfig[] = [
  { id: 1, name: "Ethereum" },
  { id: 10, name: "Optimism" },
  { id: 137, name: "Polygon" },
  { id: 8453, name: "Base" },
  { id: 42161, name: "Arbitrum" },
];

// ── Origin currencies (permit-enabled only: USDC / USDT) ──
// These are the tokens shown in the "From" selector.
// Only tokens supporting EIP-3009 / EIP-2612 permits are included
// so the flow stays fully gasless.

const ETH_ORIGIN: CurrencyConfig[] = [
  {
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    chainId: 1,
    supportsPermit: true,
  },
  {
    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    symbol: "USDT",
    name: "Tether",
    decimals: 6,
    chainId: 1,
    supportsPermit: true,
  },
];

const OP_ORIGIN: CurrencyConfig[] = [
  {
    address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    chainId: 10,
    supportsPermit: true,
  },
  {
    address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
    symbol: "USDT",
    name: "Tether",
    decimals: 6,
    chainId: 10,
    supportsPermit: true,
  },
];

const POLYGON_ORIGIN: CurrencyConfig[] = [
  {
    address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    chainId: 137,
    supportsPermit: true,
  },
  {
    address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    symbol: "USDT",
    name: "Tether",
    decimals: 6,
    chainId: 137,
    supportsPermit: true,
  },
];

const BASE_ORIGIN: CurrencyConfig[] = [
  {
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    chainId: 8453,
    supportsPermit: true,
  },
];

const ARB_ORIGIN: CurrencyConfig[] = [
  {
    address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    chainId: 42161,
    supportsPermit: true,
  },
  {
    address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    symbol: "USDT",
    name: "Tether",
    decimals: 6,
    chainId: 42161,
    supportsPermit: true,
  },
];

export const ORIGIN_CURRENCIES_BY_CHAIN: Record<number, CurrencyConfig[]> = {
  1: ETH_ORIGIN,
  10: OP_ORIGIN,
  137: POLYGON_ORIGIN,
  8453: BASE_ORIGIN,
  42161: ARB_ORIGIN,
};

// ── Destination currencies (all tokens including native) ──

const ETH_DEST: CurrencyConfig[] = [
  { address: NATIVE_CURRENCY, symbol: "ETH", name: "Ether", decimals: 18, chainId: 1 },
  ...ETH_ORIGIN,
];

const OP_DEST: CurrencyConfig[] = [
  { address: NATIVE_CURRENCY, symbol: "ETH", name: "Ether", decimals: 18, chainId: 10 },
  ...OP_ORIGIN,
];

const POLYGON_DEST: CurrencyConfig[] = [
  { address: NATIVE_CURRENCY, symbol: "POL", name: "POL", decimals: 18, chainId: 137 },
  ...POLYGON_ORIGIN,
];

const BASE_DEST: CurrencyConfig[] = [
  { address: NATIVE_CURRENCY, symbol: "ETH", name: "Ether", decimals: 18, chainId: 8453 },
  ...BASE_ORIGIN,
];

const ARB_DEST: CurrencyConfig[] = [
  { address: NATIVE_CURRENCY, symbol: "ETH", name: "Ether", decimals: 18, chainId: 42161 },
  ...ARB_ORIGIN,
];

export const DEST_CURRENCIES_BY_CHAIN: Record<number, CurrencyConfig[]> = {
  1: ETH_DEST,
  10: OP_DEST,
  137: POLYGON_DEST,
  8453: BASE_DEST,
  42161: ARB_DEST,
};

// ── Block explorers ──

export const EXPLORERS: Record<number, string> = {
  1: "https://etherscan.io",
  10: "https://optimistic.etherscan.io",
  137: "https://polygonscan.com",
  8453: "https://basescan.org",
  42161: "https://arbiscan.io",
};
