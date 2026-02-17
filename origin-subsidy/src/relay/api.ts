import { RELAY_API_URL } from "../config/constants";

const API_KEY = import.meta.env.VITE_RELAY_API_KEY;

export interface RelayQuoteRequest {
  user: string;
  originChainId: number;
  destinationChainId: number;
  originCurrency: string;
  destinationCurrency: string;
  amount: string;
  tradeType: "EXACT_INPUT" | "EXACT_OUTPUT";
  originGasOverhead?: number;
  userOperationGasOverhead?: number;
}

export interface RelayStepItemData {
  to: string;
  data: string;
  value: string;
  chainId: number;
}

export interface RelayStepItem {
  status: string;
  data: RelayStepItemData;
}

export interface RelayStep {
  id: string;
  action: string;
  description: string;
  kind: string;
  requestId?: string;
  items: RelayStepItem[];
}

export interface RelayQuoteResponse {
  requestId: string;
  steps: RelayStep[];
  fees: Record<string, unknown>;
  details: Record<string, unknown>;
}

export interface RelayExecuteRequest {
  requestId?: string;
  executionKind: "rawCalls";
  data: {
    chainId: number;
    to: string;
    data: string;
    value: string;
    authorizationList?: unknown[];
  };
  executionOptions?: {
    referrer?: string;
    subsidizeFees?: boolean;
  };
}

export interface RelayExecuteResponse {
  message: string;
  requestId: string;
}

export interface RelayStatusResponse {
  status: string;
  requestId: string;
  inTxHashes?: string[];
  outTxHashes?: string[];
  originChainId?: number;
  destinationChainId?: number;
  [key: string]: unknown;
}

export async function getQuote(
  params: RelayQuoteRequest
): Promise<RelayQuoteResponse> {
  const res = await fetch(`${RELAY_API_URL}/quote/v2`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(API_KEY ? { "Authorization": `Bearer ${API_KEY}` } : {}),
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Quote failed (${res.status}): ${JSON.stringify(err)}`
    );
  }
  return res.json();
}

export async function execute(
  params: RelayExecuteRequest
): Promise<RelayExecuteResponse> {
  const res = await fetch(`${RELAY_API_URL}/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Execute failed (${res.status}): ${JSON.stringify(err)}`
    );
  }
  return res.json();
}

export async function getStatus(
  requestId: string
): Promise<RelayStatusResponse> {
  const res = await fetch(
    `${RELAY_API_URL}/intents/status/v3?requestId=${encodeURIComponent(requestId)}`,
    { headers: { "Content-Type": "application/json" } }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Status check failed (${res.status}): ${JSON.stringify(err)}`
    );
  }
  return res.json();
}
