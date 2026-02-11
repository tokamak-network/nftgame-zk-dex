// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../verifiers/IGroth16Verifier.sol";

/**
 * @dev Mock verifier that always returns true. For unit testing only.
 */
contract MockGamingItemTradeVerifier is IGamingItemTradeVerifier {
    function verifyProof(
        uint256[2] memory,
        uint256[2][2] memory,
        uint256[2] memory,
        uint256[5] memory
    ) external pure override returns (bool) {
        return true;
    }
}
