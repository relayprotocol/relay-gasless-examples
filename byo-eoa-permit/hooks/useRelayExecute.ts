"use client";

import { useState, useCallback } from "react";
import { useWalletClient, usePublicClient, useSwitchChain } from "wagmi";
import type { Hex, WalletClient } from "viem";
import { postSignature, pollStatus } from "@/lib/relay";
import type {
  RelayQuoteResponse,
  RelayStatusResponse,
  StepItem,
  ProgressStep,
  ExecutionState,
} from "@/lib/types";

const INITIAL_STATE: ExecutionState = {
  status: "idle",
  steps: [],
  error: null,
  fillStatus: null,
};

// ── Signing helpers ──

async function signStepItem(
  walletClient: WalletClient,
  item: StepItem
): Promise<Hex> {
  const signData = item.data.sign;
  if (!signData) throw new Error("Step item has no sign data");

  if (signData.signatureKind === "eip191") {
    const message = signData.message!;
    // If message is a 32-byte hex hash, sign as raw bytes
    if (/^0x[0-9a-fA-F]{64}$/.test(message)) {
      return walletClient.signMessage({
        account: walletClient.account!,
        message: { raw: message as Hex },
      });
    }
    return walletClient.signMessage({
      account: walletClient.account!,
      message,
    });
  }

  // EIP-712 — strip EIP712Domain from types if present (viem constructs it from domain)
  const { EIP712Domain: _, ...types } = signData.types ?? {};

  return walletClient.signTypedData({
    account: walletClient.account!,
    domain: signData.domain as any,
    types,
    primaryType: signData.primaryType!,
    message: signData.value as any,
  });
}

// ── Extract requestId from various locations ──

function extractRequestId(
  item: StepItem,
  stepRequestId?: string
): string | undefined {
  return (
    (item.data.post?.body?.requestId as string) ??
    stepRequestId ??
    undefined
  );
}

// ── Main hook ──

export function useRelayExecute() {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { switchChainAsync } = useSwitchChain();

  const [state, setState] = useState<ExecutionState>(INITIAL_STATE);

  const updateStepStatus = useCallback(
    (idx: number, status: ProgressStep["status"]) => {
      setState((prev) => {
        const steps = prev.steps.map((s, i) =>
          i === idx ? { ...s, status } : s
        );
        return { ...prev, steps };
      });
    },
    []
  );

  const execute = useCallback(
    async (quote: RelayQuoteResponse) => {
      if (!walletClient) throw new Error("Wallet not connected");

      // Build progress steps from the quote
      const progressSteps: ProgressStep[] = quote.steps.map((step) => ({
        id: step.id,
        label: step.action,
        description: step.description,
        status: "pending" as const,
      }));
      progressSteps.push({
        id: "fill",
        label: "Waiting for Fill",
        description: "Relay is filling your order on the destination chain",
        status: "pending",
      });

      setState({
        status: "executing",
        steps: progressSteps,
        error: null,
        fillStatus: null,
      });

      let requestId: string | undefined;

      try {
        for (let si = 0; si < quote.steps.length; si++) {
          const step = quote.steps[si];

          // Mark step active
          setState((prev) => ({
            ...prev,
            steps: prev.steps.map((s, i) =>
              i === si ? { ...s, status: "active" } : s
            ),
          }));

          for (const item of step.items) {
            if (item.status === "complete") continue;

            if (step.kind === "signature") {
              // Sign the data
              const signature = await signStepItem(walletClient, item);

              // Post to Relay
              if (item.data.post) {
                await postSignature(
                  item.data.post.endpoint,
                  signature,
                  item.data.post.body
                );
              }

              requestId =
                extractRequestId(item, step.requestId) ?? requestId;
            } else if (step.kind === "transaction") {
              // Switch chain if needed
              const txChainId = item.data.chainId;
              if (txChainId) {
                await switchChainAsync({ chainId: txChainId });
              }

              const hash = await walletClient.sendTransaction({
                account: walletClient.account!,
                to: item.data.to as Hex,
                data: (item.data.data as Hex) ?? "0x",
                value: item.data.value ? BigInt(item.data.value) : 0n,
              });

              // Wait for receipt
              if (publicClient) {
                await publicClient.waitForTransactionReceipt({ hash });
              }

              requestId = step.requestId ?? requestId;
            }
          }

          // Mark step complete
          setState((prev) => ({
            ...prev,
            steps: prev.steps.map((s, i) =>
              i === si ? { ...s, status: "complete" } : s
            ),
          }));
        }

        // Poll for fill
        const fillIdx = progressSteps.length - 1;
        setState((prev) => ({
          ...prev,
          steps: prev.steps.map((s, i) =>
            i === fillIdx ? { ...s, status: "active" } : s
          ),
        }));

        if (requestId) {
          const finalStatus = await pollStatus(
            requestId,
            (status: RelayStatusResponse) => {
              setState((prev) => ({ ...prev, fillStatus: status }));
            }
          );

          if (finalStatus.status === "success") {
            setState((prev) => ({
              ...prev,
              status: "complete",
              steps: prev.steps.map((s, i) =>
                i === fillIdx ? { ...s, status: "complete" } : s
              ),
            }));
          } else {
            setState((prev) => ({
              ...prev,
              status: "error",
              error: `Fill ${finalStatus.status}${finalStatus.details ? `: ${finalStatus.details}` : ""}`,
              steps: prev.steps.map((s, i) =>
                i === fillIdx ? { ...s, status: "error" } : s
              ),
            }));
          }
        } else {
          // No requestId to poll — mark as complete optimistically
          setState((prev) => ({
            ...prev,
            status: "complete",
            steps: prev.steps.map((s, i) =>
              i === fillIdx ? { ...s, status: "complete" } : s
            ),
          }));
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error occurred";

        setState((prev) => {
          const activeIdx = prev.steps.findIndex(
            (s) => s.status === "active"
          );
          return {
            ...prev,
            status: "error",
            error: message,
            steps: prev.steps.map((s, i) =>
              i === activeIdx ? { ...s, status: "error" } : s
            ),
          };
        });
      }
    },
    [walletClient, publicClient, switchChainAsync]
  );

  const reset = useCallback(() => setState(INITIAL_STATE), []);

  return { executionState: state, execute, reset };
}
