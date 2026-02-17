"use client";

import type { ExecutionState } from "@/lib/types";
import { EXPLORERS } from "@/lib/constants";

interface ProgressTrackerProps {
  state: ExecutionState;
}

export function ProgressTracker({ state }: ProgressTrackerProps) {
  if (state.status === "idle") return null;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 space-y-3">
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
        Progress
      </h3>

      <div className="space-y-0">
        {state.steps.map((step, i) => {
          const isLast = i === state.steps.length - 1;
          return (
            <div key={step.id} className="flex gap-3">
              {/* Vertical line + icon */}
              <div className="flex flex-col items-center">
                <StepIcon status={step.status} />
                {!isLast && (
                  <div
                    className={`w-px flex-1 min-h-[16px] ${
                      step.status === "complete"
                        ? "bg-green-800"
                        : "bg-gray-800"
                    }`}
                  />
                )}
              </div>

              {/* Label */}
              <div className="pb-3">
                <div
                  className={`text-sm font-medium leading-5 ${
                    step.status === "active"
                      ? "text-white"
                      : step.status === "complete"
                        ? "text-green-400"
                        : step.status === "error"
                          ? "text-red-400"
                          : "text-gray-600"
                  }`}
                >
                  {step.label}
                  {step.status === "active" && (
                    <span className="ml-1.5 text-gray-500 animate-pulse">
                      ...
                    </span>
                  )}
                </div>
                {step.description && step.status === "active" && (
                  <div className="text-xs text-gray-500 mt-0.5">
                    {step.description}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Fill status details */}
      {state.fillStatus && (
        <FillStatusBadge
          status={state.fillStatus.status}
          requestId={state.fillStatus.requestId}
          inTxHashes={state.fillStatus.inTxHashes}
          outTxHashes={
            state.fillStatus.outTxHashes ?? state.fillStatus.txHashes
          }
          originChainId={state.fillStatus.originChainId}
          destinationChainId={state.fillStatus.destinationChainId}
        />
      )}

      {/* Error message */}
      {state.error && (
        <div className="bg-red-950/50 border border-red-900 rounded p-2.5 text-xs text-red-300 break-all">
          {state.error}
        </div>
      )}
    </div>
  );
}

function StepIcon({ status }: { status: string }) {
  if (status === "complete") {
    return (
      <div className="w-5 h-5 rounded-full bg-green-900 border border-green-700 flex items-center justify-center flex-shrink-0">
        <svg
          className="w-3 h-3 text-green-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={3}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>
    );
  }

  if (status === "active") {
    return (
      <div className="w-5 h-5 rounded-full border-2 border-blue-500 flex items-center justify-center flex-shrink-0">
        <svg
          className="w-3 h-3 text-blue-400 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="w-5 h-5 rounded-full bg-red-900 border border-red-700 flex items-center justify-center flex-shrink-0">
        <svg
          className="w-3 h-3 text-red-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={3}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </div>
    );
  }

  // pending
  return (
    <div className="w-5 h-5 rounded-full border border-gray-700 flex-shrink-0" />
  );
}

function FillStatusBadge({
  status,
  requestId,
  inTxHashes,
  outTxHashes,
  originChainId,
  destinationChainId,
}: {
  status: string;
  requestId?: string;
  inTxHashes?: string[];
  outTxHashes?: string[];
  originChainId?: number;
  destinationChainId?: number;
}) {
  function explorerLink(hash: string, chainId?: number) {
    const base =
      chainId
        ? EXPLORERS[chainId] ?? "https://etherscan.io"
        : "https://etherscan.io";
    return `${base}/tx/${hash}`;
  }

  function relayLink(hash: string) {
    return `https://relay.link/transaction/${hash}`;
  }

  // Collect all tx hashes for the relay link
  const allHashes = [...(inTxHashes ?? []), ...(outTxHashes ?? [])];
  const primaryHash = allHashes[0];

  return (
    <div className="border-t border-gray-800 pt-2.5 text-xs text-gray-500 space-y-1 font-mono">
      <div>
        Status:{" "}
        <span
          className={
            status === "success"
              ? "text-green-400"
              : status === "failure" || status === "refunded"
                ? "text-red-400"
                : "text-yellow-400"
          }
        >
          {status}
        </span>
      </div>
      {inTxHashes?.map((h) => (
        <div key={h}>
          Origin:{" "}
          <a
            href={explorerLink(h, originChainId)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline"
          >
            {h.slice(0, 10)}...{h.slice(-6)}
          </a>
        </div>
      ))}
      {outTxHashes?.map((h) => (
        <div key={h}>
          Dest:{" "}
          <a
            href={explorerLink(h, destinationChainId)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline"
          >
            {h.slice(0, 10)}...{h.slice(-6)}
          </a>
        </div>
      ))}
      {primaryHash && (
        <div className="pt-1">
          <a
            href={relayLink(primaryHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline"
          >
            View on Relay
          </a>
        </div>
      )}
    </div>
  );
}
