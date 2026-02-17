import React, { useState, useCallback, useEffect } from "react";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import {
  type Address,
  type Hex,
  encodeFunctionData,
  encodePacked,
  hashTypedData,
  recoverAddress,
  isAddress,
} from "viem";
import { StepLogger, type LogEntry } from "../components/StepLogger";
import { StatusDisplay } from "../components/StatusDisplay";
import { getQuote, execute, type RelayStatusResponse } from "../relay/api";
import { BASE_USDC, NATIVE_CURRENCY, CHAIN_IDS } from "../config/constants";
import { DESTINATION_CHAINS } from "../config/chains";
import { pollStatus } from "../relay/status-poller";

// ---------- Safe constants ----------

// MultiSendCallOnly v1.3.0 on Base
const MULTI_SEND = "0xA1dabEF33b3B82c7814B6D82A79e50F4AC44102B" as const;

const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;

// Safe ABI fragments
const safeAbi = [
  {
    name: "nonce",
    type: "function",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "getThreshold",
    type: "function",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "getOwners",
    type: "function",
    inputs: [],
    outputs: [{ type: "address[]" }],
    stateMutability: "view",
  },
  {
    name: "execTransaction",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
      { name: "operation", type: "uint8" },
      { name: "safeTxGas", type: "uint256" },
      { name: "baseGas", type: "uint256" },
      { name: "gasPrice", type: "uint256" },
      { name: "gasToken", type: "address" },
      { name: "refundReceiver", type: "address" },
      { name: "signatures", type: "bytes" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
] as const;

const multiSendAbi = [
  {
    name: "multiSend",
    type: "function",
    inputs: [{ name: "transactions", type: "bytes" }],
    outputs: [],
    stateMutability: "payable",
  },
] as const;

// EIP-712 types for Safe transaction signing
const safeTxTypes = {
  SafeTx: [
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "data", type: "bytes" },
    { name: "operation", type: "uint8" },
    { name: "safeTxGas", type: "uint256" },
    { name: "baseGas", type: "uint256" },
    { name: "gasPrice", type: "uint256" },
    { name: "gasToken", type: "address" },
    { name: "refundReceiver", type: "address" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

// ---------- Helpers ----------

interface MetaTransaction {
  to: Address;
  value: bigint;
  data: Hex;
  operation: 0 | 1;
}

/** Encode transactions into MultiSend packed bytes */
function encodeMultiSendData(txs: MetaTransaction[]): Hex {
  const parts: Hex[] = [];
  for (const tx of txs) {
    const dataBytes = tx.data === "0x" ? "0x" : tx.data;
    const dataLength = BigInt(
      dataBytes === "0x" ? 0 : (dataBytes.length - 2) / 2,
    );
    parts.push(
      encodePacked(
        ["uint8", "address", "uint256", "uint256", "bytes"],
        [tx.operation, tx.to, tx.value, dataLength, dataBytes],
      ),
    );
  }
  return parts.reduce((acc, part, i) =>
    i === 0 ? part : (`${acc}${part.slice(2)}` as Hex),
  );
}

// ---------- UI ----------

const CURRENCY_OPTIONS = [
  { value: NATIVE_CURRENCY, label: "ETH (native)" },
  { value: BASE_USDC, label: "USDC (Base)" },
];

export function OriginSub4337() {
  // Connected wallet = the Safe OWNER (EOA like MetaMask)
  const { address: ownerAddress, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  // Safe address entered by user
  const [safeAddress, setSafeAddress] = useState("");
  const [safeValid, setSafeValid] = useState<boolean | null>(null);
  const [safeInfo, setSafeInfo] = useState<{
    threshold: bigint;
    owners: Address[];
    isOwner: boolean;
  } | null>(null);

  const [destChainId, setDestChainId] = useState<number>(CHAIN_IDS.arbitrum);
  const [originCurrency, setOriginCurrency] = useState(NATIVE_CURRENCY);
  const [destCurrency, setDestCurrency] = useState(NATIVE_CURRENCY);
  const [amount, setAmount] = useState("1000000000000000");
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [finalStatus, setFinalStatus] = useState<RelayStatusResponse | null>(
    null,
  );

  const log = useCallback(
    (label: string, type: LogEntry["type"] = "info", detail?: string) => {
      setLogs((prev) => [
        ...prev,
        { timestamp: Date.now(), label, type, detail },
      ]);
    },
    [],
  );

  // Validate Safe address when it changes
  useEffect(() => {
    if (!safeAddress || !isAddress(safeAddress) || !publicClient || !ownerAddress) {
      setSafeValid(null);
      setSafeInfo(null);
      return;
    }

    let cancelled = false;
    const addr = safeAddress as Address;

    (async () => {
      try {
        const [threshold, owners] = await Promise.all([
          publicClient.readContract({
            address: addr,
            abi: safeAbi,
            functionName: "getThreshold",
          }),
          publicClient.readContract({
            address: addr,
            abi: safeAbi,
            functionName: "getOwners",
          }),
        ]);
        if (cancelled) return;

        const isOwner = (owners as Address[]).some(
          (o) => o.toLowerCase() === ownerAddress.toLowerCase(),
        );
        setSafeValid(true);
        setSafeInfo({
          threshold: threshold as bigint,
          owners: owners as Address[],
          isOwner,
        });
      } catch {
        if (!cancelled) {
          setSafeValid(false);
          setSafeInfo(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [safeAddress, publicClient, ownerAddress]);

  const runFlow = useCallback(async () => {
    if (!ownerAddress || !walletClient || !publicClient || !safeInfo?.isOwner)
      return;

    const safe = safeAddress as Address;

    setRunning(true);
    setLogs([]);
    setFinalStatus(null);

    try {
      log(`Safe: ${safe}`, "success");
      log(
        `Owner (signer): ${ownerAddress} — threshold: ${safeInfo.threshold}`,
        "success",
      );

      // ── Step 1: Get quote from Relay (user = Safe address) ──
      log("Requesting quote from Relay...");
      const quoteParams = {
        user: safe,
        originChainId: CHAIN_IDS.base,
        destinationChainId: destChainId,
        originCurrency,
        destinationCurrency: destCurrency,
        amount,
        tradeType: "EXACT_INPUT" as const,
      };
      log("Quote request", "info", JSON.stringify(quoteParams, null, 2));

      const quote = await getQuote(quoteParams);
      log("Quote received", "success", JSON.stringify(quote, null, 2));

      // ── Step 2: Build inner calls from quote ──
      const innerCalls: MetaTransaction[] = [];
      for (const step of quote.steps ?? []) {
        for (const item of step.items ?? []) {
          if (!item.data?.to) continue;
          innerCalls.push({
            to: item.data.to as Address,
            value: BigInt(item.data.value || "0"),
            data: (item.data.data || "0x") as Hex,
            operation: 0,
          });
        }
      }
      if (innerCalls.length === 0) {
        throw new Error("No calls found in quote response");
      }
      log(`Built ${innerCalls.length} inner call(s) from quote`);

      // ── Step 3: Wrap in MultiSend if needed ──
      let safeTxTo: Address;
      let safeTxData: Hex;
      let safeTxValue: bigint;
      let safeTxOperation: 0 | 1;

      if (innerCalls.length === 1) {
        safeTxTo = innerCalls[0].to;
        safeTxData = innerCalls[0].data;
        safeTxValue = innerCalls[0].value;
        safeTxOperation = 0;
        log("Single call — no MultiSend needed");
      } else {
        const multiSendBytes = encodeMultiSendData(innerCalls);
        safeTxData = encodeFunctionData({
          abi: multiSendAbi,
          functionName: "multiSend",
          args: [multiSendBytes],
        });
        safeTxTo = MULTI_SEND;
        safeTxValue = 0n;
        safeTxOperation = 1;
        log(`Encoded ${innerCalls.length} calls into MultiSend`);
      }

      // ── Step 4: Read Safe nonce ──
      const nonce = await publicClient.readContract({
        address: safe,
        abi: safeAbi,
        functionName: "nonce",
      });
      log(`Safe nonce: ${nonce}`);

      // ── Step 5: Build EIP-712 message ──
      const safeTxMessage = {
        to: safeTxTo,
        value: safeTxValue,
        data: safeTxData,
        operation: safeTxOperation,
        safeTxGas: 0n,
        baseGas: 0n,
        gasPrice: 0n,
        gasToken: ZERO_ADDR,
        refundReceiver: ZERO_ADDR,
        nonce,
      };

      // Safe EIP-712 domain — no name/version
      const domain = {
        chainId: BigInt(CHAIN_IDS.base),
        verifyingContract: safe,
      };

      log(
        "EIP-712 message",
        "info",
        JSON.stringify(
          safeTxMessage,
          (_, v) => (typeof v === "bigint" ? v.toString() : v),
          2,
        ),
      );

      // ── Step 6: Owner signs directly via signTypedData ──
      log("Requesting EIP-712 signature from owner wallet...", "pending");
      const signature = await walletClient.signTypedData({
        domain,
        types: safeTxTypes,
        primaryType: "SafeTx",
        message: safeTxMessage,
      });
      log("Signature received", "success", signature);

      // Verify signature recovers to the owner
      const typedDataHash = hashTypedData({
        domain,
        types: safeTxTypes,
        primaryType: "SafeTx",
        message: safeTxMessage,
      });
      const recoveredSigner = await recoverAddress({
        hash: typedDataHash,
        signature,
      });
      log(`Recovered signer: ${recoveredSigner}`);
      if (recoveredSigner.toLowerCase() !== ownerAddress.toLowerCase()) {
        throw new Error(
          `Signature mismatch! Expected ${ownerAddress}, got ${recoveredSigner}`,
        );
      }
      log("Signer verified as Safe owner", "success");

      // ── Step 7: Encode execTransaction calldata ──
      const execTxData = encodeFunctionData({
        abi: safeAbi,
        functionName: "execTransaction",
        args: [
          safeTxMessage.to,
          safeTxMessage.value,
          safeTxMessage.data,
          safeTxMessage.operation,
          safeTxMessage.safeTxGas,
          safeTxMessage.baseGas,
          safeTxMessage.gasPrice,
          safeTxMessage.gasToken,
          safeTxMessage.refundReceiver,
          signature,
        ],
      });
      log("Encoded execTransaction", "info", `${execTxData.slice(0, 66)}...`);

      // ── Step 8: Simulate locally ──
      log("Simulating execTransaction via eth_call...");
      try {
        await publicClient.call({
          to: safe,
          data: execTxData,
        });
        log("Simulation passed", "success");
      } catch (simErr: any) {
        const reason =
          simErr?.shortMessage || simErr?.message || String(simErr);
        log(
          `Simulation REVERTED: ${reason}`,
          "error",
          JSON.stringify(simErr, null, 2),
        );
        throw new Error(`execTransaction simulation failed: ${reason}`);
      }

      // ── Step 9: Submit to Relay /execute ──
      log("Submitting to Relay /execute...");
      const requestId =
        quote.steps?.[0]?.requestId ?? (quote as any).requestId;

      const executeParams = {
        requestId,
        executionKind: "rawCalls" as const,
        data: {
          chainId: CHAIN_IDS.base,
          to: safe, // Target the Safe
          data: execTxData,
          value: "0",
        },
        executionOptions: {
          referrer: "relay.link",
          subsidizeFees: true,
        },
      };
      log("Execute request", "info", JSON.stringify(executeParams, null, 2));

      const execResult = await execute(executeParams);
      log(
        "Execute submitted",
        "success",
        JSON.stringify(execResult, null, 2),
      );

      const finalRequestId = execResult.requestId || requestId;

      // ── Step 10: Poll status ──
      log(`Polling status for requestId: ${finalRequestId}`, "pending");
      const finalResult = await pollStatus(finalRequestId, (s) => {
        log(`Status update: ${s.status}`, "pending");
        setFinalStatus(s);
      });

      if (finalResult.status === "success") {
        log("Transaction completed successfully!", "success");
      } else {
        log(
          `Transaction ended with status: ${finalResult.status}`,
          "error",
        );
      }
      setFinalStatus(finalResult);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`Error: ${msg}`, "error");
    } finally {
      setRunning(false);
    }
  }, [
    ownerAddress,
    walletClient,
    publicClient,
    safeAddress,
    safeInfo,
    destChainId,
    originCurrency,
    destCurrency,
    amount,
    log,
  ]);

  if (!isConnected) {
    return (
      <div className="text-gray-500 text-sm">
        Connect your owner wallet (MetaMask, etc.) to get started.
      </div>
    );
  }

  const canRun =
    safeValid && safeInfo?.isOwner && walletClient && !running;

  return (
    <div className="space-y-4">
      <div className="bg-gray-900 border border-gray-800 rounded p-4">
        <h2 className="text-lg font-bold text-white mb-1">
          Safe Gasless Bridge
        </h2>
        <p className="text-gray-400 text-xs mb-2">
          Connect your owner wallet, enter your Safe address. You sign one
          EIP-712 message and Relay handles the tx + origin gas via{" "}
          <code>/execute</code>.
        </p>

        <div className="text-xs text-gray-500 space-y-1 mb-3">
          <div>
            Owner (signer):{" "}
            <span className="text-gray-300 font-mono">{ownerAddress}</span>
          </div>
        </div>

        {/* Safe address input */}
        <div className="mb-3">
          <label className="block text-xs text-gray-500 mb-1">
            Safe Address (on Base)
          </label>
          <input
            type="text"
            value={safeAddress}
            onChange={(e) => setSafeAddress(e.target.value)}
            className="w-full bg-gray-800 rounded px-3 py-2 text-sm text-gray-300 border border-gray-700 font-mono"
            placeholder="0x..."
          />
          {safeValid === false && (
            <div className="text-[10px] text-red-400 mt-1">
              Not a valid Safe on Base
            </div>
          )}
          {safeValid && safeInfo && !safeInfo.isOwner && (
            <div className="text-[10px] text-red-400 mt-1">
              Your connected wallet is not an owner of this Safe
            </div>
          )}
          {safeValid && safeInfo?.isOwner && (
            <div className="text-[10px] text-green-400 mt-1">
              Safe verified — threshold: {safeInfo.threshold.toString()},
              you are an owner
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Origin Chain
            </label>
            <div className="bg-gray-800 rounded px-3 py-2 text-sm text-gray-300">
              Base (8453)
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Destination Chain
            </label>
            <select
              value={destChainId}
              onChange={(e) => setDestChainId(Number(e.target.value))}
              className="w-full bg-gray-800 rounded px-3 py-2 text-sm text-gray-300 border border-gray-700"
            >
              {DESTINATION_CHAINS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.id})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Origin Currency
            </label>
            <select
              value={originCurrency}
              onChange={(e) => setOriginCurrency(e.target.value)}
              className="w-full bg-gray-800 rounded px-3 py-2 text-sm text-gray-300 border border-gray-700"
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Destination Currency
            </label>
            <select
              value={destCurrency}
              onChange={(e) => setDestCurrency(e.target.value)}
              className="w-full bg-gray-800 rounded px-3 py-2 text-sm text-gray-300 border border-gray-700"
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs text-gray-500 mb-1">
            Amount (raw wei or smallest unit)
          </label>
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-gray-800 rounded px-3 py-2 text-sm text-gray-300 border border-gray-700 font-mono"
            placeholder="1000000000000000"
          />
          <div className="text-[10px] text-gray-600 mt-1">
            ETH: 1000000000000000 = 0.001 ETH | USDC: 1000000 = 1 USDC
          </div>
        </div>

        <button
          onClick={runFlow}
          disabled={!canRun}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-4 py-2 rounded text-sm font-mono transition-colors"
        >
          {running ? "Running..." : "Run Gasless Flow"}
        </button>
      </div>

      <StepLogger logs={logs} />
      <StatusDisplay status={finalStatus} />
    </div>
  );
}
