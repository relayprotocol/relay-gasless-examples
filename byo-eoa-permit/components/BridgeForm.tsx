"use client";

import { useState, useEffect, useMemo } from "react";
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useReadContract,
} from "wagmi";
import { parseUnits, formatUnits, erc20Abi } from "viem";
import { ChainSelector } from "./ChainSelector";
import { CurrencySelector } from "./CurrencySelector";
import { QuoteDisplay } from "./QuoteDisplay";
import { ExecuteButton } from "./ExecuteButton";
import { ProgressTracker } from "./ProgressTracker";
import { useRelayQuote } from "@/hooks/useRelayQuote";
import { useRelayExecute } from "@/hooks/useRelayExecute";
import { useRelayChains } from "@/hooks/useRelayChains";
import {
  useOriginCurrencies,
  useDestCurrencies,
} from "@/hooks/useRelayCurrencies";
import { SUPPORTED_CHAINS } from "@/lib/constants";
import type { RelayQuoteRequest } from "@/lib/types";

// ── Debounce helper ──

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

// ── Main component ──

export function BridgeForm() {
  const { address, isConnected } = useAccount();
  const walletChainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { chains } = useRelayChains();

  // Form state
  const [originChainId, setOriginChainId] = useState(8453); // Base
  const [destChainId, setDestChainId] = useState(42161); // Arbitrum
  const [originCurrency, setOriginCurrency] = useState("");
  const [destCurrency, setDestCurrency] = useState("");
  const [amount, setAmount] = useState("");

  // Currencies — origin is permit-only, dest allows native + stables
  const { currencies: originCurrencies } = useOriginCurrencies(originChainId);
  const { currencies: destCurrencies } = useDestCurrencies(destChainId);

  // Auto-select first currency when chain changes
  useEffect(() => {
    if (originCurrencies.length > 0) {
      setOriginCurrency(originCurrencies[0].address);
    }
  }, [originChainId, originCurrencies]);

  useEffect(() => {
    if (destCurrencies.length > 0) {
      const usdc = destCurrencies.find((c) => c.supportsPermit);
      setDestCurrency(usdc?.address ?? destCurrencies[0].address);
    }
  }, [destChainId, destCurrencies]);

  // Find selected currency config (for decimals)
  const selectedOriginCurrency = originCurrencies.find(
    (c) => c.address === originCurrency
  );

  // ── Chain check ──
  const needsChainSwitch = walletChainId !== originChainId;
  const originChainName =
    SUPPORTED_CHAINS.find((c) => c.id === originChainId)?.name ?? "chain";

  // ── Balance check (ERC-20 only since origin is always permit tokens) ──
  const { data: tokenBalance } = useReadContract({
    address: originCurrency as `0x${string}`,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: originChainId,
    query: {
      enabled: !!address && !!originCurrency,
      refetchInterval: 15_000,
    },
  });

  // Parse the user's input amount for comparison
  const parsedAmount = useMemo(() => {
    if (!amount || !selectedOriginCurrency) return 0n;
    try {
      return parseUnits(amount, selectedOriginCurrency.decimals);
    } catch {
      return 0n;
    }
  }, [amount, selectedOriginCurrency]);

  const formattedBalance =
    tokenBalance !== undefined && selectedOriginCurrency
      ? formatUnits(tokenBalance, selectedOriginCurrency.decimals)
      : null;

  const insufficientBalance =
    parsedAmount > 0n &&
    tokenBalance !== undefined &&
    parsedAmount > tokenBalance;

  // Debounce amount to avoid excessive API calls
  const debouncedAmount = useDebouncedValue(amount, 500);

  // Build quote params
  const quoteParams: RelayQuoteRequest | null = useMemo(() => {
    if (
      !address ||
      !originCurrency ||
      !destCurrency ||
      !debouncedAmount ||
      !selectedOriginCurrency
    )
      return null;

    try {
      const parsed = parseUnits(
        debouncedAmount,
        selectedOriginCurrency.decimals
      );
      if (parsed <= 0n) return null;

      return {
        user: address,
        originChainId,
        destinationChainId: destChainId,
        originCurrency,
        destinationCurrency: destCurrency,
        amount: parsed.toString(),
        tradeType: "EXACT_INPUT",
        usePermit: true,
      };
    } catch {
      return null;
    }
  }, [
    address,
    originChainId,
    destChainId,
    originCurrency,
    destCurrency,
    debouncedAmount,
    selectedOriginCurrency,
  ]);

  // Quote
  const {
    data: quote,
    isLoading: quoteLoading,
    error: quoteError,
  } = useRelayQuote(quoteParams);

  // Execution
  const { executionState, execute, reset } = useRelayExecute();

  const handleExecute = async () => {
    if (!quote) return;
    await execute(quote);
  };

  const handleReset = () => {
    reset();
    setAmount("");
  };

  if (!isConnected) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center text-gray-500 text-sm">
        Connect your wallet to get started
      </div>
    );
  }

  // ── Determine button state ──
  const isFinished =
    executionState.status === "complete" || executionState.status === "error";
  const isExecuting = executionState.status === "executing";

  let buttonLabel = "Sign & Bridge (Gasless)";
  let buttonDisabled = !quote || isExecuting;
  let buttonAction: () => void = handleExecute;

  if (needsChainSwitch && !isFinished && !isExecuting) {
    buttonLabel = `Switch to ${originChainName}`;
    buttonDisabled = isSwitching;
    buttonAction = () => {
      switchChain({ chainId: originChainId });
    };
  } else if (insufficientBalance) {
    buttonLabel = `Insufficient ${selectedOriginCurrency?.symbol ?? ""} balance`;
    buttonDisabled = true;
  }

  return (
    <div className="space-y-3">
      {/* From */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 space-y-2">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          From
        </span>
        <div className="flex gap-2">
          <ChainSelector
            label="Chain"
            value={originChainId}
            onChange={setOriginChainId}
            chains={chains}
          />
          <CurrencySelector
            label="Token"
            value={originCurrency}
            onChange={setOriginCurrency}
            currencies={originCurrencies}
          />
        </div>
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <label className="text-xs text-gray-500">Amount</label>
            {formattedBalance !== null && (
              <button
                type="button"
                onClick={() => setAmount(formattedBalance)}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
              >
                Bal: {Number(formattedBalance).toLocaleString(undefined, { maximumFractionDigits: 2 })}{" "}
                {selectedOriginCurrency?.symbol}
              </button>
            )}
          </div>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.0"
            value={amount}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "" || /^\d*\.?\d*$/.test(v)) setAmount(v);
            }}
            disabled={isExecuting}
            className={`w-full bg-gray-950 border rounded-lg px-3 py-2 text-lg font-mono text-white placeholder-gray-700 focus:outline-none transition-colors disabled:opacity-50 ${
              insufficientBalance
                ? "border-red-800 focus:border-red-700"
                : "border-gray-800 focus:border-gray-600"
            }`}
          />
        </div>
      </div>

      {/* Arrow */}
      <div className="flex justify-center -my-0.5">
        <div className="w-7 h-7 rounded-full bg-gray-900 border border-gray-800 flex items-center justify-center text-gray-500">
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
        </div>
      </div>

      {/* To */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 space-y-2">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          To
        </span>
        <div className="flex gap-2">
          <ChainSelector
            label="Chain"
            value={destChainId}
            onChange={setDestChainId}
            chains={chains}
          />
          <CurrencySelector
            label="Token"
            value={destCurrency}
            onChange={setDestCurrency}
            currencies={destCurrencies}
          />
        </div>
      </div>

      {/* Quote */}
      <QuoteDisplay
        quote={quote}
        isLoading={quoteLoading}
        error={quoteError as Error | null}
      />

      {/* Execute / Reset */}
      {isFinished ? (
        <button
          onClick={handleReset}
          className="w-full py-2.5 px-4 rounded-lg font-medium text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors cursor-pointer"
        >
          {executionState.status === "complete" ? "Bridge Again" : "Try Again"}
        </button>
      ) : (
        <ExecuteButton
          onClick={buttonAction}
          disabled={buttonDisabled}
          loading={isExecuting || isSwitching}
          label={buttonLabel}
        />
      )}

      {/* Progress */}
      <ProgressTracker state={executionState} />
    </div>
  );
}
