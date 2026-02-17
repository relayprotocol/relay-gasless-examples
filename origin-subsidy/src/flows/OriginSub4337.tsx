import React, { useState, useCallback, useEffect } from "react";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import {
  type Address,
  type Hex,
  encodeFunctionData,
  encodeAbiParameters,
  keccak256,
} from "viem";
import { StepLogger, type LogEntry } from "../components/StepLogger";
import { StatusDisplay } from "../components/StatusDisplay";
import { getQuote, execute, type RelayStatusResponse } from "../relay/api";
import {
  BASE_USDC,
  NATIVE_CURRENCY,
  CHAIN_IDS,
  CALIBUR_ADDRESS,
} from "../config/constants";
import { DESTINATION_CHAINS } from "../config/chains";
import { pollStatus } from "../relay/status-poller";

// ---------- Calibur ABI ----------

const caliburAbi = [
  {
    name: "execute",
    type: "function",
    inputs: [
      {
        name: "signedBatchedCall",
        type: "tuple",
        components: [
          {
            name: "batchedCall",
            type: "tuple",
            components: [
              {
                name: "calls",
                type: "tuple[]",
                components: [
                  { name: "to", type: "address" },
                  { name: "value", type: "uint256" },
                  { name: "data", type: "bytes" },
                ],
              },
              { name: "revertOnFailure", type: "bool" },
            ],
          },
          { name: "nonce", type: "uint256" },
          { name: "keyHash", type: "bytes32" },
          { name: "executor", type: "address" },
          { name: "deadline", type: "uint256" },
        ],
      },
      { name: "wrappedSignature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    name: "nonceSequenceNumber",
    type: "function",
    inputs: [{ name: "", type: "uint192" }],
    outputs: [{ type: "uint64" }],
    stateMutability: "view",
  },
] as const;

// EIP-712 types matching Calibur's SignedBatchedCall
const signedBatchedCallTypes = {
  Call: [
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "data", type: "bytes" },
  ],
  BatchedCall: [
    { name: "calls", type: "Call[]" },
    { name: "revertOnFailure", type: "bool" },
  ],
  SignedBatchedCall: [
    { name: "batchedCall", type: "BatchedCall" },
    { name: "nonce", type: "uint256" },
    { name: "keyHash", type: "bytes32" },
    { name: "executor", type: "address" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

// EIP-7702 delegation prefix: 0xef0100 + delegate address
const DELEGATION_PREFIX = "0xef0100";

// Calibur EIP-712 domain salt = bytes32(uint256(uint160(caliburAddress)))
const CALIBUR_SALT =
  "0x000000000000000000000000000000009b1d0af20d8c6d0a44e162d11f9b8f00" as Hex;

const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000" as Address;

// ---------- UI ----------

const CURRENCY_OPTIONS = [
  { value: NATIVE_CURRENCY, label: "ETH (native)" },
  { value: BASE_USDC, label: "USDC (Base)" },
];

type DelegationStatus =
  | "checking"
  | "not_delegated"
  | "delegated"
  | "wrong_delegation";

export function OriginSub4337() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const [delegation, setDelegation] = useState<DelegationStatus>("checking");
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

  // Check if EOA is already delegated to Calibur
  useEffect(() => {
    if (!address || !publicClient) {
      setDelegation("checking");
      return;
    }

    let cancelled = false;
    (async () => {
      const code = await publicClient.getCode({ address });
      if (cancelled) return;

      if (!code || code === "0x") {
        setDelegation("not_delegated");
        return;
      }

      // EIP-7702 delegation code = 0xef0100 + 20-byte address
      const expectedCode = `${DELEGATION_PREFIX}${CALIBUR_ADDRESS.slice(2).toLowerCase()}`;
      if (code.toLowerCase() === expectedCode.toLowerCase()) {
        setDelegation("delegated");
      } else {
        setDelegation("wrong_delegation");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, publicClient]);

  const runFlow = useCallback(async () => {
    if (!address || !walletClient || !publicClient) return;

    setRunning(true);
    setLogs([]);
    setFinalStatus(null);

    try {
      log(`EOA: ${address}`);

      // ── Step 1: Handle EIP-7702 delegation ──
      let authorizationList: unknown[] | undefined;

      if (delegation !== "delegated") {
        log("EOA not yet delegated — attempting EIP-7702 authorization...", "pending");

        try {
          // Try standalone signAuthorization (works with Porto and compatible wallets)
          const authorization = await (walletClient as any).signAuthorization({
            contractAddress: CALIBUR_ADDRESS,
          });

          log("EIP-7702 authorization signed (standalone)", "success");

          authorizationList = [
            {
              chainId: authorization.chainId,
              address: authorization.contractAddress,
              nonce: authorization.nonce,
              yParity: authorization.yParity,
              r: authorization.r,
              s: authorization.s,
            },
          ];
        } catch (signAuthErr: any) {
          // JSON-RPC wallets (MetaMask, etc.) don't support standalone
          // signAuthorization. EIP-7702 requires a wallet with native support
          // like Porto (Ithaca).
          throw new Error(
            "Your wallet doesn't support EIP-7702 signAuthorization. " +
            "Please connect with Porto (ithaca.xyz/porto) to use the gasless delegation flow."
          );
        }
      } else {
        log("EOA already delegated to Calibur", "success");
      }

      // ── Step 2: Get quote from Relay ──
      log("Requesting quote from Relay...");
      const quoteParams = {
        user: address,
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

      // ── Step 3: Build calls from quote ──
      const calls: { to: Address; value: bigint; data: Hex }[] = [];
      for (const step of quote.steps ?? []) {
        for (const item of step.items ?? []) {
          if (!item.data?.to) continue;
          calls.push({
            to: item.data.to as Address,
            value: BigInt(item.data.value || "0"),
            data: (item.data.data || "0x") as Hex,
          });
        }
      }
      if (calls.length === 0) {
        throw new Error("No calls found in quote response");
      }
      log(`Built ${calls.length} call(s) from quote`);

      // ── Step 4: Compute keyHash & read nonce ──
      // keyHash identifies the signer — for the root EOA key: keccak256(abi.encode(address))
      const keyHash = keccak256(
        encodeAbiParameters([{ type: "address" }], [address]),
      );
      log(`Key hash: ${keyHash}`);

      // Nonce: key-sequence scheme. Key 0 = root.
      // If authorizationList is set, EOA isn't delegated yet (delegation happens in same tx) → nonce is 0.
      // Otherwise, EOA is delegated — read from contract.
      let currentNonce = 0n;
      if (!authorizationList) {
        try {
          currentNonce = (await publicClient.readContract({
            address,
            abi: caliburAbi,
            functionName: "nonceSequenceNumber",
            args: [0n],
          })) as bigint;
        } catch {
          // If readContract fails (e.g., just delegated, node not synced), start at 0
          currentNonce = 0n;
        }
      }
      log(`Nonce: ${currentNonce}`);

      // ── Step 5: Build EIP-712 message ──
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 300); // 5 min
      log(`Deadline: ${deadline} (${new Date(Number(deadline) * 1000).toISOString()})`);

      // EIP-712 domain — after delegation the EOA IS the verifying contract
      const domain = {
        name: "Calibur",
        version: "1.0.0",
        chainId: BigInt(CHAIN_IDS.base),
        verifyingContract: address,
        salt: CALIBUR_SALT,
      };

      const message = {
        batchedCall: {
          calls: calls.map((c) => ({
            to: c.to,
            value: c.value,
            data: c.data,
          })),
          revertOnFailure: true,
        },
        nonce: currentNonce,
        keyHash,
        executor: ZERO_ADDRESS, // anyone can submit
        deadline,
      };

      log(
        "EIP-712 message",
        "info",
        JSON.stringify(
          message,
          (_, v) => (typeof v === "bigint" ? v.toString() : v),
          2,
        ),
      );

      // ── Step 6: Sign batch ──
      log("Requesting EIP-712 signature...", "pending");
      const signature = await walletClient.signTypedData({
        domain,
        types: signedBatchedCallTypes,
        primaryType: "SignedBatchedCall",
        message,
      });
      log("Batch signed", "success", signature);

      // ── Step 7: Wrap signature (no hooks) ──
      // Calibur wrappedSignature = abi.encode(signature, hookData)
      // "0x" for hookData = no hooks
      const wrappedSignature = encodeAbiParameters(
        [{ type: "bytes" }, { type: "bytes" }],
        [signature, "0x"],
      );
      log("Wrapped signature", "info", `${wrappedSignature.slice(0, 66)}...`);

      // ── Step 8: Encode Calibur execute calldata ──
      const executeCalldata = encodeFunctionData({
        abi: caliburAbi,
        functionName: "execute",
        args: [
          {
            batchedCall: {
              calls: calls.map((c) => ({
                to: c.to,
                value: c.value,
                data: c.data,
              })),
              revertOnFailure: true,
            },
            nonce: currentNonce,
            keyHash,
            executor: ZERO_ADDRESS,
            deadline,
          },
          wrappedSignature,
        ],
      });
      log(
        "Encoded execute calldata",
        "info",
        `${executeCalldata.slice(0, 66)}...`,
      );

      // ── Step 9: Simulate locally ──
      if (!authorizationList) {
        log("Simulating execute via eth_call...");
        try {
          await publicClient.call({
            to: address, // The EOA is the contract after delegation
            data: executeCalldata,
          });
          log("Simulation passed", "success");
        } catch (simErr: any) {
          const reason =
            simErr?.shortMessage || simErr?.message || String(simErr);
          log(`Simulation REVERTED: ${reason}`, "error");
        }
      } else {
        log(
          "Skipping simulation — EOA not yet delegated (delegation happens in same tx)",
          "info",
        );
      }

      // ── Step 10: Submit to Relay /execute ──
      log("Submitting to Relay /execute...");
      const requestId =
        quote.steps?.[0]?.requestId ?? (quote as any).requestId;

      const executeParams = {
        requestId,
        executionKind: "rawCalls" as const,
        data: {
          chainId: CHAIN_IDS.base,
          to: address, // Target the EOA (which runs Calibur's code after delegation)
          data: executeCalldata,
          value: "0",
          ...(authorizationList ? { authorizationList } : {}),
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

      // ── Step 11: Poll status ──
      log(`Polling status for requestId: ${finalRequestId}`, "pending");
      const finalResult = await pollStatus(finalRequestId, (s) => {
        log(`Status update: ${s.status}`, "pending");
        setFinalStatus(s);
      });

      if (finalResult.status === "success") {
        log("Transaction completed successfully!", "success");
        setDelegation("delegated");
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
    address,
    walletClient,
    publicClient,
    delegation,
    destChainId,
    originCurrency,
    destCurrency,
    amount,
    log,
  ]);

  if (!isConnected) {
    return (
      <div className="text-gray-500 text-sm">
        Connect your wallet to get started.
      </div>
    );
  }

  const canRun = walletClient && !running && delegation !== "checking";

  return (
    <div className="space-y-4">
      <div className="bg-gray-900 border border-gray-800 rounded p-4">
        <h2 className="text-lg font-bold text-white mb-1">
          Gasless Bridge (EIP-7702 + Calibur)
        </h2>
        <p className="text-gray-400 text-xs mb-2">
          Connect your wallet. On first use, approve a one-time delegation to{" "}
          <a
            href="https://github.com/ithacaxyz/calibur"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 underline"
          >
            Calibur
          </a>
          . Then just sign one message per bridge — Relay handles the tx + gas
          via <code>/execute</code>.
        </p>

        <div className="text-xs text-gray-500 space-y-1 mb-3">
          <div>
            EOA:{" "}
            <span className="text-gray-300 font-mono">{address}</span>
          </div>
          <div>
            Delegation:{" "}
            {delegation === "checking" && (
              <span className="text-yellow-400">Checking...</span>
            )}
            {delegation === "not_delegated" && (
              <span className="text-yellow-400">
                Not delegated — will prompt on first run
              </span>
            )}
            {delegation === "delegated" && (
              <span className="text-green-400">
                Delegated to Calibur
              </span>
            )}
            {delegation === "wrong_delegation" && (
              <span className="text-red-400">
                Delegated to a different contract — re-delegation needed
              </span>
            )}
          </div>
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
          {running
            ? "Running..."
            : delegation === "not_delegated" || delegation === "wrong_delegation"
              ? "Delegate + Bridge"
              : "Run Gasless Flow"}
        </button>
      </div>

      <StepLogger logs={logs} />
      <StatusDisplay status={finalStatus} />
    </div>
  );
}
