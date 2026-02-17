"use client";

import { useQuery } from "@tanstack/react-query";
import { getQuote } from "@/lib/relay";
import type { RelayQuoteRequest, RelayQuoteResponse } from "@/lib/types";

/**
 * Fetches a quote from the Relay API.
 * Pass `null` to disable the query (e.g. when inputs are incomplete).
 * The quote auto-refreshes every 30 seconds while the params stay stable.
 */
export function useRelayQuote(params: RelayQuoteRequest | null) {
  return useQuery<RelayQuoteResponse>({
    queryKey: ["relay-quote", params],
    queryFn: () => getQuote(params!),
    enabled: !!params,
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: false,
  });
}
