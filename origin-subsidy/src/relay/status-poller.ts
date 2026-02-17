import { getStatus, type RelayStatusResponse } from "./api";

const TERMINAL = new Set(["success", "failure", "refund"]);

export async function pollStatus(
  requestId: string,
  onUpdate?: (status: RelayStatusResponse) => void,
  maxAttempts = 60,
  intervalMs = 5000
): Promise<RelayStatusResponse> {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await getStatus(requestId);
    onUpdate?.(status);
    if (TERMINAL.has(status.status)) return status;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out after ${maxAttempts} attempts`);
}
