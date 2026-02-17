import {
  ORIGIN_CURRENCIES_BY_CHAIN,
  DEST_CURRENCIES_BY_CHAIN,
} from "@/lib/constants";
import type { CurrencyConfig } from "@/lib/types";

export function useOriginCurrencies(chainId: number): {
  currencies: CurrencyConfig[];
} {
  return { currencies: ORIGIN_CURRENCIES_BY_CHAIN[chainId] ?? [] };
}

export function useDestCurrencies(chainId: number): {
  currencies: CurrencyConfig[];
} {
  return { currencies: DEST_CURRENCIES_BY_CHAIN[chainId] ?? [] };
}
