// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../verifiers/IGroth16Verifier.sol";

/**
 * @title MockCardDrawVerifier
 * @dev Mock verifier for unit testing. Always returns true.
 */
contract MockCardDrawVerifier is ICardDrawVerifier {
    function verifyProof(
        uint256[2] memory,
        uint256[2][2] memory,
        uint256[2] memory,
        uint256[5] memory
    ) external pure override returns (bool) {
        return true;
    }
}
