"use client";

import type { RelayQuoteResponse } from "@/lib/types";

interface QuoteDisplayProps {
  quote: RelayQuoteResponse | undefined;
  isLoading: boolean;
  error: Error | null;
}

export function QuoteDisplay({ quote, isLoading, error }: QuoteDisplayProps) {
  if (isLoading) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 animate-pulse">
        <div className="h-4 bg-gray-800 rounded w-3/4 mb-2" />
        <div className="h-3 bg-gray-800 rounded w-1/2" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-950/50 border border-red-900 rounded-lg p-3 text-xs text-red-300">
        {error.message}
      </div>
    );
  }

  if (!quote) return null;

  const { details, fees } = quote;
  const hasSignatureSteps = quote.steps.some((s) => s.kind === "signature");

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-gray-500">You receive</span>
        <span className="text-base font-semibold">
          {details.currencyOut.amountFormatted} {details.currencyOut.symbol}
        </span>
      </div>

      <div className="border-t border-gray-800 pt-2 space-y-1 text-xs text-gray-400">
        {details.currencyOut.amountUsd && (
          <Row label="Value" value={`$${details.currencyOut.amountUsd}`} />
        )}
        {fees.relayer?.amountUsd && (
          <Row label="Relay fee" value={`$${fees.relayer.amountUsd}`} />
        )}
        {fees.gas?.amountUsd && (
          <Row label="Gas" value={`$${fees.gas.amountUsd}`} />
        )}
        {details.timeEstimate > 0 && (
          <Row label="Est. time" value={`~${details.timeEstimate}s`} />
        )}
        <Row
          label="Flow"
          value={hasSignatureSteps ? "Gasless (permit)" : "On-chain tx"}
          highlight={hasSignatureSteps}
        />
      </div>

      {details.totalImpact?.percent && (
        <div className="text-xs text-yellow-500">
          Price impact: {details.totalImpact.percent}%
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className={highlight ? "text-green-400" : "text-gray-300"}>
        {value}
      </span>
    </div>
  );
}
