// ── Chain & Currency configs ──

export interface ChainConfig {
  id: number;
  name: string;
}

export interface CurrencyConfig {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
  supportsPermit?: boolean;
}

// ── Quote request / response ──

export interface RelayQuoteRequest {
  user: string;
  originChainId: number;
  destinationChainId: number;
  originCurrency: string;
  destinationCurrency: string;
  amount: string;
  tradeType: "EXACT_INPUT" | "EXACT_OUTPUT";
  usePermit?: boolean;
}

export interface SignData {
  signatureKind: "eip191" | "eip712";
  message?: string;
  domain?: Record<string, unknown>;
  types?: Record<string, Array<{ name: string; type: string }>>;
  primaryType?: string;
  value?: Record<string, unknown>;
}

export interface PostData {
  endpoint: string;
  method: string;
  body: Record<string, unknown>;
}

export interface StepItemData {
  // Transaction fields
  from?: string;
  to?: string;
  data?: string;
  value?: string;
  chainId?: number;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  gas?: string;
  // Signature fields
  sign?: SignData;
  post?: PostData;
}

export interface StepItem {
  status: string;
  orderIndexes?: number[];
  data: StepItemData;
  check?: {
    endpoint: string;
    method: string;
  };
}

export interface Step {
  id: string;
  action: string;
  description: string;
  kind: "transaction" | "signature";
  requestId?: string;
  items: StepItem[];
}

export interface FeeCurrency {
  chainId: number;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

export interface FeeDetail {
  currency: FeeCurrency;
  amount: string;
  amountFormatted: string;
  amountUsd: string;
}

export interface Fees {
  gas?: FeeDetail;
  relayer?: FeeDetail;
  relayerGas?: FeeDetail;
  relayerService?: FeeDetail;
  app?: FeeDetail;
}

export interface QuoteDetails {
  operation: string;
  currencyIn: FeeCurrency & {
    amount: string;
    amountFormatted: string;
    amountUsd: string;
  };
  currencyOut: FeeCurrency & {
    amount: string;
    amountFormatted: string;
    amountUsd: string;
  };
  rate: string;
  timeEstimate: number;
  totalImpact?: { usd: string; percent: string };
  swapImpact?: { usd: string; percent: string };
}

export interface RelayQuoteResponse {
  steps: Step[];
  fees: Fees;
  details: QuoteDetails;
}

// ── Status polling ──

export type FillStatus =
  | "waiting"
  | "pending"
  | "submitted"
  | "success"
  | "delayed"
  | "refunded"
  | "failure";

export interface RelayStatusResponse {
  status: FillStatus;
  details?: string;
  inTxHashes?: string[];
  txHashes?: string[];
  outTxHashes?: string[];
  updatedAt?: number;
  originChainId?: number;
  destinationChainId?: number;
  requestId?: string;
}

// ── Execution progress ──

export type ProgressStepStatus = "pending" | "active" | "complete" | "error";

export interface ProgressStep {
  id: string;
  label: string;
  description?: string;
  status: ProgressStepStatus;
}

export type ExecutionStatus = "idle" | "executing" | "complete" | "error";

export interface ExecutionState {
  status: ExecutionStatus;
  steps: ProgressStep[];
  error: string | null;
  fillStatus: RelayStatusResponse | null;
}
