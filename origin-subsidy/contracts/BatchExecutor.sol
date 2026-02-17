// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title BatchExecutor
/// @notice EIP-7702 batch executor with signed authorization.
///         After an EOA delegates to this contract via EIP-7702, anyone can
///         submit signed batches on the EOA's behalf — enabling gasless execution.
///
///         Key design:
///         - `address(this)` after delegation IS the user's EOA
///         - Signature must recover to `address(this)` (the EOA's key)
///         - Anyone can call `executeBatch` (e.g., Relay's relayer)
///         - Nonces prevent replay, deadline prevents stale execution
contract BatchExecutor {
    struct Call {
        address target;
        uint256 value;
        bytes data;
    }

    /// @notice Nonce per delegated account. After EIP-7702 delegation,
    ///         `address(this)` is the user's EOA, so each EOA gets its own nonce.
    mapping(address => uint256) public nonces;

    bytes32 public constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(uint256 chainId,address verifyingContract)");

    bytes32 public constant CALL_TYPEHASH =
        keccak256("Call(address target,uint256 value,bytes data)");

    bytes32 public constant EXECUTE_BATCH_TYPEHASH =
        keccak256(
            "ExecuteBatch(Call[] calls,uint256 nonce,uint256 deadline)Call(address target,uint256 value,bytes data)"
        );

    event BatchExecuted(address indexed account, uint256 nonce, uint256 numCalls);

    error Expired();
    error InvalidNonce();
    error InvalidSignature();
    error CallFailed(uint256 index);

    /// @notice Execute a batch of calls authorized by the delegated EOA's signature.
    ///         Anyone can call this — the signature proves the EOA authorized the batch.
    /// @param calls Array of calls to execute
    /// @param nonce Expected nonce (must match current nonce)
    /// @param deadline Unix timestamp after which the signature expires
    /// @param signature EIP-712 signature from the EOA
    function executeBatch(
        Call[] calldata calls,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external {
        if (block.timestamp > deadline) revert Expired();

        uint256 currentNonce = nonces[address(this)];
        if (nonce != currentNonce) revert InvalidNonce();
        nonces[address(this)] = currentNonce + 1;

        bytes32 digest = _computeDigest(calls, nonce, deadline);
        address signer = _recover(digest, signature);
        if (signer != address(this)) revert InvalidSignature();

        for (uint256 i = 0; i < calls.length; i++) {
            (bool success, ) = calls[i].target.call{value: calls[i].value}(
                calls[i].data
            );
            if (!success) revert CallFailed(i);
        }

        emit BatchExecuted(address(this), currentNonce, calls.length);
    }

    /// @notice Get the current nonce for this delegated account
    function getNonce() external view returns (uint256) {
        return nonces[address(this)];
    }

    // ── Internal ──

    function _computeDigest(
        Call[] calldata calls,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (bytes32) {
        bytes32 domainSeparator = keccak256(
            abi.encode(DOMAIN_TYPEHASH, block.chainid, address(this))
        );

        bytes32[] memory callHashes = new bytes32[](calls.length);
        for (uint256 i = 0; i < calls.length; i++) {
            callHashes[i] = keccak256(
                abi.encode(
                    CALL_TYPEHASH,
                    calls[i].target,
                    calls[i].value,
                    keccak256(calls[i].data)
                )
            );
        }

        bytes32 structHash = keccak256(
            abi.encode(
                EXECUTE_BATCH_TYPEHASH,
                keccak256(abi.encodePacked(callHashes)),
                nonce,
                deadline
            )
        );

        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    function _recover(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        require(sig.length == 65, "invalid sig length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        return ecrecover(digest, v, r, s);
    }

    receive() external payable {}
}
