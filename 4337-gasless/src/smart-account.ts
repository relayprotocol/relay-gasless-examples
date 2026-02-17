/**
 * ERC-4337 SimpleAccount helpers — ABIs, UserOp building, hashing.
 *
 * Uses eth-infinitism's SimpleAccount v0.7:
 *   EntryPoint:           0x0000000071727De22E5E9d8BAf0edAc6f37da032
 *   SimpleAccountFactory: 0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985
 */

import {
  encodeFunctionData,
  encodeAbiParameters,
  keccak256,
  concat,
  pad,
  toHex,
  type Hex,
  type Address,
} from "viem";

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

export const ENTRY_POINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032" as const;
export const SIMPLE_ACCOUNT_FACTORY = "0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985" as const;

// ---------------------------------------------------------------------------
// ABIs (minimal subsets)
// ---------------------------------------------------------------------------

export const ENTRY_POINT_ABI = [
  {
    name: "getNonce",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "sender", type: "address" },
      { name: "key", type: "uint192" },
    ],
    outputs: [{ name: "nonce", type: "uint256" }],
  },
  {
    name: "handleOps",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "ops",
        type: "tuple[]",
        components: [
          { name: "sender", type: "address" },
          { name: "nonce", type: "uint256" },
          { name: "initCode", type: "bytes" },
          { name: "callData", type: "bytes" },
          { name: "accountGasLimits", type: "bytes32" },
          { name: "preVerificationGas", type: "uint256" },
          { name: "gasFees", type: "bytes32" },
          { name: "paymasterAndData", type: "bytes" },
          { name: "signature", type: "bytes" },
        ],
      },
      { name: "beneficiary", type: "address" },
    ],
    outputs: [],
  },
] as const;

export const SIMPLE_ACCOUNT_ABI = [
  {
    name: "execute",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "dest", type: "address" },
      { name: "value", type: "uint256" },
      { name: "func", type: "bytes" },
    ],
    outputs: [],
  },
  {
    name: "executeBatch",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "dest", type: "address[]" },
      { name: "values", type: "uint256[]" },
      { name: "func", type: "bytes[]" },
    ],
    outputs: [],
  },
] as const;

export const SIMPLE_ACCOUNT_FACTORY_ABI = [
  {
    name: "createAccount",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "owner", type: "address" },
      { name: "salt", type: "uint256" },
    ],
    outputs: [{ name: "ret", type: "address" }],
  },
  {
    name: "getAddress",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "salt", type: "uint256" },
    ],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

// ---------------------------------------------------------------------------
// Packed UserOperation (v0.7)
// ---------------------------------------------------------------------------

export interface PackedUserOperation {
  sender: Address;
  nonce: bigint;
  initCode: Hex;
  callData: Hex;
  accountGasLimits: Hex; // bytes32: (verificationGasLimit << 128) | callGasLimit
  preVerificationGas: bigint;
  gasFees: Hex; // bytes32: (maxPriorityFeePerGas << 128) | maxFeePerGas
  paymasterAndData: Hex;
  signature: Hex;
}

// ---------------------------------------------------------------------------
// Gas packing helpers
// ---------------------------------------------------------------------------

/**
 * Pack two uint128 values into a single bytes32.
 * Format: (high << 128) | low
 */
export function packUint128(high: bigint, low: bigint): Hex {
  const packed = (high << 128n) | low;
  return pad(toHex(packed), { size: 32 });
}

/**
 * Build accountGasLimits: (verificationGasLimit << 128) | callGasLimit
 */
export function packAccountGasLimits(
  verificationGasLimit: bigint,
  callGasLimit: bigint
): Hex {
  return packUint128(verificationGasLimit, callGasLimit);
}

/**
 * Build gasFees: (maxPriorityFeePerGas << 128) | maxFeePerGas
 * For gasless (Relay pays), both are 0.
 */
export function packGasFees(
  maxPriorityFeePerGas: bigint,
  maxFeePerGas: bigint
): Hex {
  return packUint128(maxPriorityFeePerGas, maxFeePerGas);
}

// ---------------------------------------------------------------------------
// initCode
// ---------------------------------------------------------------------------

/**
 * Build initCode for deploying a SimpleAccount via the factory.
 * Format: concat(factoryAddress, createAccount(owner, salt) calldata)
 */
export function buildInitCode(owner: Address, salt: bigint): Hex {
  const createAccountData = encodeFunctionData({
    abi: SIMPLE_ACCOUNT_FACTORY_ABI,
    functionName: "createAccount",
    args: [owner, salt],
  });
  return concat([SIMPLE_ACCOUNT_FACTORY, createAccountData]);
}

// ---------------------------------------------------------------------------
// callData
// ---------------------------------------------------------------------------

/**
 * Encode SimpleAccount.execute(dest, value, func) calldata.
 */
export function encodeExecute(
  dest: Address,
  value: bigint,
  func: Hex
): Hex {
  return encodeFunctionData({
    abi: SIMPLE_ACCOUNT_ABI,
    functionName: "execute",
    args: [dest, value, func],
  });
}

/**
 * Encode SimpleAccount.executeBatch(dest[], values[], func[]) calldata.
 * Use this when the quote returns multiple items (e.g. approve + deposit).
 */
export function encodeExecuteBatch(
  calls: Array<{ to: Address; value: bigint; data: Hex }>
): Hex {
  return encodeFunctionData({
    abi: SIMPLE_ACCOUNT_ABI,
    functionName: "executeBatch",
    args: [
      calls.map((c) => c.to),
      calls.map((c) => c.value),
      calls.map((c) => c.data),
    ],
  });
}

// ---------------------------------------------------------------------------
// UserOp hashing (v0.7)
// ---------------------------------------------------------------------------

/**
 * Compute the v0.7 UserOperation hash.
 *
 * innerHash = keccak256(abi.encode(
 *   sender, nonce, keccak256(initCode), keccak256(callData),
 *   accountGasLimits, preVerificationGas, gasFees,
 *   keccak256(paymasterAndData)
 * ))
 * finalHash = keccak256(abi.encode(innerHash, entryPoint, chainId))
 */
export function getUserOpHash(
  userOp: PackedUserOperation,
  chainId: number
): Hex {
  const innerHash = keccak256(
    encodeAbiParameters(
      [
        { type: "address" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "bytes32" },
      ],
      [
        userOp.sender,
        userOp.nonce,
        keccak256(userOp.initCode),
        keccak256(userOp.callData),
        userOp.accountGasLimits,
        userOp.preVerificationGas,
        userOp.gasFees,
        keccak256(userOp.paymasterAndData),
      ]
    )
  );

  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
      [innerHash, ENTRY_POINT, BigInt(chainId)]
    )
  );
}

// ---------------------------------------------------------------------------
// handleOps encoding
// ---------------------------------------------------------------------------

/**
 * Encode EntryPoint.handleOps([userOp], beneficiary) calldata.
 */
export function encodeHandleOps(
  userOp: PackedUserOperation,
  beneficiary: Address
): Hex {
  return encodeFunctionData({
    abi: ENTRY_POINT_ABI,
    functionName: "handleOps",
    args: [
      [
        {
          sender: userOp.sender,
          nonce: userOp.nonce,
          initCode: userOp.initCode,
          callData: userOp.callData,
          accountGasLimits: userOp.accountGasLimits,
          preVerificationGas: userOp.preVerificationGas,
          gasFees: userOp.gasFees,
          paymasterAndData: userOp.paymasterAndData,
          signature: userOp.signature,
        },
      ],
      beneficiary,
    ],
  });
}
