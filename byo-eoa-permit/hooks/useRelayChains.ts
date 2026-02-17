import { SUPPORTED_CHAINS } from "@/lib/constants";
import type { ChainConfig } from "@/lib/types";

export function useRelayChains(): { chains: ChainConfig[] } {
  return { chains: SUPPORTED_CHAINS };
}
