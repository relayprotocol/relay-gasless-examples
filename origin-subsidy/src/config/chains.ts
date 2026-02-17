import { CHAIN_IDS } from "./constants";

export interface ChainOption {
  id: number;
  name: string;
}

export const ORIGIN_CHAINS: ChainOption[] = [
  { id: CHAIN_IDS.base, name: "Base" },
  { id: CHAIN_IDS.arbitrum, name: "Arbitrum" },
  { id: CHAIN_IDS.optimism, name: "Optimism" },
  { id: CHAIN_IDS.ethereum, name: "Ethereum" },
];

export const DESTINATION_CHAINS: ChainOption[] = [
  { id: CHAIN_IDS.ethereum, name: "Ethereum" },
  { id: CHAIN_IDS.base, name: "Base" },
  { id: CHAIN_IDS.optimism, name: "Optimism" },
  { id: CHAIN_IDS.arbitrum, name: "Arbitrum" },
];
