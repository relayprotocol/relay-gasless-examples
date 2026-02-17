import React from "react";
import type { RelayStatusResponse } from "../relay/api";

function explorerUrl(chainId: number | undefined, hash: string): string {
  const explorers: Record<number, string> = {
    1: "https://etherscan.io",
    10: "https://optimistic.etherscan.io",
    8453: "https://basescan.org",
    42161: "https://arbiscan.io",
  };
  const base = chainId ? explorers[chainId] ?? "https://etherscan.io" : "https://etherscan.io";
  return `${base}/tx/${hash}`;
}

export function StatusDisplay({
  status,
}: {
  status: RelayStatusResponse | null;
}) {
  if (!status) return null;

  const isSuccess = status.status === "success";
  const isError = status.status === "failure" || status.status === "refund";

  return (
    <div
      className={`border rounded p-4 text-sm ${
        isSuccess
          ? "bg-green-950 border-green-800 text-green-300"
          : isError
            ? "bg-red-950 border-red-800 text-red-300"
            : "bg-yellow-950 border-yellow-800 text-yellow-300"
      }`}
    >
      <div className="font-bold mb-2">
        Status: {status.status.toUpperCase()}
      </div>
      <div className="text-xs space-y-1 font-mono">
        <div>Request ID: {status.requestId}</div>
        {status.inTxHashes?.map((h) => (
          <div key={h}>
            Origin TX:{" "}
            <a
              href={explorerUrl(status.originChainId, h)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              {h.slice(0, 10)}...{h.slice(-8)}
            </a>
          </div>
        ))}
        {status.outTxHashes?.map((h) => (
          <div key={h}>
            Dest TX:{" "}
            <a
              href={explorerUrl(status.destinationChainId, h)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              {h.slice(0, 10)}...{h.slice(-8)}
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
