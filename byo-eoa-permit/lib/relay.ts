import { RELAY_API_URL } from "./constants";
import type {
  RelayQuoteRequest,
  RelayQuoteResponse,
  RelayStatusResponse,
} from "./types";

const API_KEY = process.env.NEXT_PUBLIC_RELAY_API_KEY;

function authHeaders(): Record<string, string> {
  return API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
}

// ── Get a quote ──

export async function getQuote(
  params: RelayQuoteRequest
): Promise<RelayQuoteResponse> {
  const res = await fetch(`${RELAY_API_URL}/quote/v2`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg =
      err.message || err.error || JSON.stringify(err) || res.statusText;
    throw new Error(`Quote failed (${res.status}): ${msg}`);
  }

  return res.json();
}

// ── Post a signed permit/signature to Relay ──

export async function postSignature(
  endpoint: string,
  signature: string,
  body: Record<string, unknown>
): Promise<unknown> {
  const url = endpoint.startsWith("http")
    ? endpoint
    : `${RELAY_API_URL}${endpoint}`;

  const separator = url.includes("?") ? "&" : "?";
  const fullUrl = `${url}${separator}signature=${signature}`;

  const res = await fetch(fullUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg =
      err.message || err.error || JSON.stringify(err) || res.statusText;
    throw new Error(`Signature submission failed (${res.status}): ${msg}`);
  }

  return res.json();
}

// ── Check fill status ──

export async function getStatus(
  requestId: string
): Promise<RelayStatusResponse> {
  const res = await fetch(
    `${RELAY_API_URL}/intents/status/v3?requestId=${encodeURIComponent(requestId)}`,
    {
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Status check failed (${res.status}): ${JSON.stringify(err)}`);
  }

  return res.json();
}

// ── Poll until terminal state ──

const TERMINAL_STATES = new Set(["success", "failure", "refunded"]);

export async function pollStatus(
  requestId: string,
  onUpdate?: (status: RelayStatusResponse) => void,
  maxAttempts = 100,
  intervalMs = 3000
): Promise<RelayStatusResponse> {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await getStatus(requestId);
    onUpdate?.(status);

    if (TERMINAL_STATES.has(status.status)) return status;
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(`Polling timed out after ${maxAttempts} attempts`);
}
