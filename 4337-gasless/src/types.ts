import type { Address, Hex } from "viem";

// ---------------------------------------------------------------------------
// Relay API types
// ---------------------------------------------------------------------------

/** Fee currency object from /quote response */
export interface CurrencyObject {
  currency: {
    chainId: number;
    address: string;
    symbol: string;
    name: string;
    decimals: number;
  };
  amount: string;
  amountFormatted: string;
  amountUsd: string;
}

/** POST /quote/v2 response (subset of fields we use) */
export interface QuoteResponse {
  requestId?: string;
  steps: Array<{
    id: string;
    action: string;
    description: string;
    kind: "transaction" | "signature";
    requestId?: string;
    items: Array<{
      status: string;
      data: {
        from: Address;
        to: Address;
        data: Hex;
        value: string;
        chainId: number;
      };
    }>;
  }>;
  fees: {
    gas: CurrencyObject;
    relayer: CurrencyObject;
    relayerGas: CurrencyObject;
    relayerService: CurrencyObject;
    app: CurrencyObject;
    subsidized: CurrencyObject;
  };
  details: {
    operation: string;
    timeEstimate: number;
    sender: string;
    recipient: string;
    currencyIn: CurrencyObject;
    currencyOut: CurrencyObject;
  };
}

/** GET /intents/status/v3 response */
export interface StatusResponse {
  status:
    | "waiting"
    | "pending"
    | "submitted"
    | "success"
    | "failure"
    | "refund";
  inTxHashes?: string[];
  txHashes?: string[];
}
