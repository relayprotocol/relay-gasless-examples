/**
 * Gasless Cross-Chain Bridge with ERC-4337 Smart Account + Relay
 * ==============================================================
 * Use case: App-owned embedded wallet (SimpleAccount) bridging
 * USDC from Base to Arbitrum with zero gas costs.
 *
 * The app owns the smart account's private key (embedded wallet pattern).
 * Relay covers all gas fees — we set 4337 gas fee values to 0 so that
 * Relay's fee values are used instead.
 *
 * Flow:
 *   0. Setup — derive smart account address, check deployment
 *   1. Get quote from Relay (/quote/v2)
 *   2. Build UserOperation (v0.7 packed format)
 *   3. Sign UserOperation with owner key
 *   4. Submit via Relay /execute (handleOps calldata)
 *   5. Poll for completion
 */

import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  encodeFunctionData,
  type Hex,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import {
  ENTRY_POINT,
  SIMPLE_ACCOUNT_FACTORY,
  ENTRY_POINT_ABI,
  SIMPLE_ACCOUNT_FACTORY_ABI,
  buildInitCode,
  encodeExecute,
  encodeExecuteBatch,
  packAccountGasLimits,
  packGasFees,
  getUserOpHash,
  encodeHandleOps,
  type PackedUserOperation,
} from "./smart-account.js";
import { relayFetch, pollStatus } from "./relay.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RELAY_API_KEY = process.env.RELAY_API_KEY || "";
const DRY_RUN = process.env.DRY_RUN === "true";

const OWNER_PRIVATE_KEY = process.env.OWNER_PRIVATE_KEY as Hex;
if (!OWNER_PRIVATE_KEY) throw new Error("OWNER_PRIVATE_KEY is required");

// Bridge: 1 USDC on Base → USDC on Arbitrum
const ORIGIN_CHAIN_ID = base.id; // 8453
const DESTINATION_CHAIN_ID = 42161; // Arbitrum
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;
const USDC_ARBITRUM = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as Address;
const BRIDGE_AMOUNT = parseUnits("1", 6); // 1 USDC
const SALT = 0n;

// Gas limits — generous since Relay pays anyway
const VERIFICATION_GAS_LIMIT = 500_000n;
const CALL_GAS_LIMIT = 500_000n;
const PRE_VERIFICATION_GAS = 100_000n;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("========================================================");
  console.log("  ERC-4337 Gasless Bridge: USDC Base -> USDC Arbitrum");
  console.log("  Smart Account (SimpleAccount) + Relay /execute");
  console.log("========================================================\n");

  if (DRY_RUN) console.log("[DRY RUN MODE]\n");

  // ── Step 0: Setup ───────────────────────────────────────────────────

  console.log("--- Step 0: Setup ---\n");

  const owner = privateKeyToAccount(OWNER_PRIVATE_KEY);
  console.log(`  Owner EOA:    ${owner.address}`);

  const publicClient = createPublicClient({
    chain: base,
    transport: http(),
  });

  // Compute smart account address via factory
  const smartAccountAddress = await publicClient.readContract({
    address: SIMPLE_ACCOUNT_FACTORY,
    abi: SIMPLE_ACCOUNT_FACTORY_ABI,
    functionName: "getAddress",
    args: [owner.address, SALT],
  });
  console.log(`  Smart Account: ${smartAccountAddress}`);

  // Check if already deployed
  const code = await publicClient.getCode({ address: smartAccountAddress });
  const isDeployed = !!code && code !== "0x";
  console.log(`  Deployed:      ${isDeployed}`);

  // ── Step 0b: Fund smart account if needed ───────────────────────────
  // The smart account needs USDC to bridge. If the owner EOA has USDC
  // but the smart account doesn't, transfer it automatically.

  const ERC20_ABI = [
    {
      name: "balanceOf",
      type: "function",
      stateMutability: "view",
      inputs: [{ name: "account", type: "address" }],
      outputs: [{ name: "", type: "uint256" }],
    },
    {
      name: "transfer",
      type: "function",
      stateMutability: "nonpayable",
      inputs: [
        { name: "to", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      outputs: [{ name: "", type: "bool" }],
    },
  ] as const;

  if (!RELAY_API_KEY && DRY_RUN) {
    console.log("  USDC balance: [skipped — no API key in dry run]");
  } else {
    const smartAccountBalance = await publicClient.readContract({
      address: USDC_BASE,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [smartAccountAddress],
    });

    console.log(
      `  USDC balance: ${smartAccountBalance} (need ${BRIDGE_AMOUNT})`,
    );

    if (smartAccountBalance < BRIDGE_AMOUNT) {
      console.log(
        "\n  Smart account needs USDC. Checking owner EOA balance...",
      );
      const ownerBalance = await publicClient.readContract({
        address: USDC_BASE,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [owner.address],
      });
      console.log(`  Owner EOA USDC: ${ownerBalance}`);

      const needed = BRIDGE_AMOUNT - smartAccountBalance;
      if (ownerBalance < needed) {
        throw new Error(
          `Not enough USDC. Need ${needed} more on owner EOA (${owner.address}) or smart account (${smartAccountAddress}).`,
        );
      }

      if (DRY_RUN) {
        console.log(
          `\n  [DRY RUN] Would transfer ${needed} USDC from owner EOA to smart account.`,
        );
      } else {
        console.log(`\n  Transferring ${needed} USDC to smart account...`);
        const walletClient = createWalletClient({
          account: owner,
          chain: base,
          transport: http(),
        });
        const txHash = await walletClient.sendTransaction({
          to: USDC_BASE,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [smartAccountAddress, needed],
          }),
        });
        console.log(`  Transfer tx: ${txHash}`);
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        console.log("  Confirmed.");
      }
    }
  }

  // ── Step 1: Get quote from Relay ────────────────────────────────────

  console.log("\n--- Step 1: Get quote from Relay ---\n");

  const quoteBody = {
    user: smartAccountAddress,
    originChainId: ORIGIN_CHAIN_ID,
    destinationChainId: DESTINATION_CHAIN_ID,
    originCurrency: USDC_BASE,
    destinationCurrency: USDC_ARBITRUM,
    amount: BRIDGE_AMOUNT.toString(),
    tradeType: "EXACT_INPUT",
    recipient: smartAccountAddress,
    originGasOverhead: "300000",
  };

  console.log(`  From: ${BRIDGE_AMOUNT.toString()} USDC (Base)`);
  console.log(`  To:   USDC (Arbitrum)`);
  console.log(`  User: ${smartAccountAddress}`);

  let quote: any;
  if (!RELAY_API_KEY && DRY_RUN) {
    console.log("\n  [DRY RUN] No RELAY_API_KEY — skipping quote fetch.");
    console.log("  Quote request body:");
    console.log(JSON.stringify(quoteBody, null, 2));

    // Build a mock deposit tx so dry-run can continue through Steps 2-3
    console.log(
      "\n  Using mock deposit data to demonstrate UserOp building...",
    );
    quote = {
      steps: [
        {
          kind: "transaction",
          requestId: "dry-run-request-id",
          items: [
            {
              data: {
                to: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address,
                value: "0",
                data: "0x095ea7b3" as Hex, // mock approve
                chainId: ORIGIN_CHAIN_ID,
              },
            },
            {
              data: {
                to: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
                value: "0",
                data: "0xe8017952" as Hex, // mock deposit
                chainId: ORIGIN_CHAIN_ID,
              },
            },
          ],
        },
      ],
      details: {
        currencyOut: {
          amountFormatted: "~1.00",
          currency: { symbol: "USDC", chainId: DESTINATION_CHAIN_ID },
        },
      },
    };
  } else {
    quote = await relayFetch("/quote/v2", quoteBody);
  }

  const outInfo = quote.details?.currencyOut;
  if (outInfo) {
    console.log(
      `\n  Quote: receive ~${outInfo.amountFormatted} ${outInfo.currency?.symbol} on chain ${outInfo.currency?.chainId}`,
    );
  }

  // Extract ALL calls and requestId from quote steps.
  // The quote typically returns approve + deposit as separate items —
  // we need to batch them all into a single UserOp via executeBatch.
  const calls: Array<{ to: Address; value: bigint; data: Hex }> = [];
  let requestId: string | undefined;

  for (const step of quote.steps) {
    if (step.kind !== "transaction") continue;
    if (step.requestId) requestId = step.requestId;
    for (const item of step.items) {
      calls.push({
        to: item.data.to,
        value: BigInt(item.data.value || "0"),
        data: item.data.data,
      });
    }
  }

  if (calls.length === 0) {
    throw new Error("No transaction steps found in quote");
  }

  console.log(`\n  Calls from quote: ${calls.length}`);
  for (let i = 0; i < calls.length; i++) {
    console.log(
      `    [${i + 1}] to=${calls[i].to} value=${calls[i].value} data=${calls[i].data.slice(0, 10)}...`,
    );
  }
  console.log(`  Request ID: ${requestId ?? "(none)"}`);

  // ── Step 2: Build UserOperation ─────────────────────────────────────

  console.log("\n--- Step 2: Build UserOperation ---\n");

  // Get nonce from EntryPoint
  let nonce = 0n;
  try {
    nonce = await publicClient.readContract({
      address: ENTRY_POINT,
      abi: ENTRY_POINT_ABI,
      functionName: "getNonce",
      args: [smartAccountAddress, 0n],
    });
  } catch {
    console.log(
      "  (getNonce failed — using 0, account may not be deployed yet)",
    );
  }
  console.log(`  Nonce: ${nonce}`);

  // initCode: include factory call if account not yet deployed
  const initCode: Hex = isDeployed ? "0x" : buildInitCode(owner.address, SALT);
  console.log(
    `  initCode: ${isDeployed ? "(empty — already deployed)" : `${initCode.slice(0, 50)}...`}`,
  );

  // callData: use executeBatch for multiple calls (e.g. approve + deposit),
  // or execute for a single call
  const callData =
    calls.length === 1
      ? encodeExecute(calls[0].to, calls[0].value, calls[0].data)
      : encodeExecuteBatch(calls);
  console.log(
    `  callData: ${calls.length > 1 ? "executeBatch" : "execute"} — ${callData.slice(0, 42)}...`,
  );

  // Pack gas values (v0.7 format)
  const accountGasLimits = packAccountGasLimits(
    VERIFICATION_GAS_LIMIT,
    CALL_GAS_LIMIT,
  );
  // Gas fees = 0: Relay covers gas
  const gasFees = packGasFees(0n, 0n);

  console.log(`  accountGasLimits: ${accountGasLimits}`);
  console.log(`  preVerificationGas: ${PRE_VERIFICATION_GAS}`);
  console.log(`  gasFees: ${gasFees} (0 — Relay pays)`);
  console.log(`  paymasterAndData: 0x (none — Relay handles gas)`);

  const userOp: PackedUserOperation = {
    sender: smartAccountAddress,
    nonce,
    initCode,
    callData,
    accountGasLimits,
    preVerificationGas: PRE_VERIFICATION_GAS,
    gasFees,
    paymasterAndData: "0x",
    signature: "0x", // placeholder, will be set after signing
  };

  // ── Step 3: Sign UserOperation ──────────────────────────────────────

  console.log("\n--- Step 3: Sign UserOperation ---\n");

  const userOpHash = getUserOpHash(userOp, ORIGIN_CHAIN_ID);
  console.log(`  UserOp hash: ${userOpHash}`);

  // SimpleAccount uses toEthSignedMessageHash internally,
  // so we sign with signMessage({ message: { raw: hash } })
  const signature = await owner.signMessage({
    message: { raw: userOpHash as `0x${string}` },
  });
  userOp.signature = signature;
  console.log(`  Signature:   ${signature.slice(0, 42)}...`);

  // ── Step 4: Submit to Relay /execute ────────────────────────────────

  console.log("\n--- Step 4: Submit to Relay /execute ---\n");

  // Encode EntryPoint.handleOps([signedUserOp], beneficiary)
  const beneficiary = owner.address; // refund any excess gas to owner
  const handleOpsData = encodeHandleOps(userOp, beneficiary);

  const executeBody = {
    executionKind: "rawCalls",
    data: {
      chainId: ORIGIN_CHAIN_ID,
      to: ENTRY_POINT,
      data: handleOpsData,
      value: "0",
    },
    executionOptions: {
      subsidizeFees: true,
      referrer: "relay-example-4337-gasless",
    },
    ...(requestId ? { requestId } : {}),
  };

  console.log(`  EntryPoint:   ${ENTRY_POINT}`);
  console.log(`  handleOps calldata: ${handleOpsData.slice(0, 42)}...`);
  console.log(`  subsidizeFees: true`);
  console.log(`  requestId:     ${requestId ?? "(none)"}`);

  if (DRY_RUN) {
    console.log("\n  [DRY RUN] Skipping /execute call.");
    console.log("  Request body:");
    console.log(JSON.stringify(executeBody, null, 2));
    console.log("\n--- Done (dry run) ---");
    return;
  }

  if (!RELAY_API_KEY) {
    throw new Error("RELAY_API_KEY is required for live execution");
  }

  const executeResult = await relayFetch("/execute", executeBody);
  console.log(`\n  Submitted: ${executeResult.requestId}`);

  // ── Step 5: Poll status ─────────────────────────────────────────────

  console.log("\n--- Step 5: Poll status ---");
  await pollStatus(executeResult.requestId);
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
