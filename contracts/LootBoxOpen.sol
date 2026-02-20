// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./NFTNoteBase.sol";
import "./verifiers/IGroth16Verifier.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title LootBoxOpen
 * @dev F4: Loot Box Open - Verifiable random loot box opening with provably
 *      fair outcome generation using Poseidon-based VRF.
 *
 *      Box Note structure: Poseidon(pkX, pkY, boxId, boxType, boxSalt)
 *      Outcome Note structure: Poseidon(pkX, pkY, itemId, itemRarity, itemSalt)
 */
contract LootBoxOpen is NFTNoteBase {
    ILootBoxVerifier public boxVerifier;
    IERC20 public paymentToken;
    address public admin;
    uint256 public boxPrice;
    uint256 public nextBoxId = 1;

    // boxId => registered
    mapping(uint256 => bool) public registeredBoxes;
    mapping(uint256 => address) public boxOwner;
    mapping(uint256 => uint256) public boxTypes;
    mapping(address => uint256[]) private userBoxIds;

    event BoxRegistered(uint256 indexed boxId, bytes32 noteHash);
    event BoxOpened(bytes32 indexed boxCommitment, bytes32 indexed outcomeCommitment, bytes32 nullifier, uint256 vrfOutput);
    event BoxMinted(address indexed buyer, uint256 indexed boxId, uint256 boxType);
    event PriceUpdated(uint256 newPrice);

    constructor(address _boxVerifier, address _paymentToken, uint256 _boxPrice) {
        boxVerifier = ILootBoxVerifier(_boxVerifier);
        paymentToken = IERC20(_paymentToken);
        boxPrice = _boxPrice;
        admin = msg.sender;
    }

    /**
     * @dev Purchase a loot box with ERC20 tokens.
     */
    function mintBox(uint256 boxType) external returns (uint256) {
        require(
            paymentToken.transferFrom(msg.sender, address(this), boxPrice),
            "Payment failed"
        );

        uint256 boxId = nextBoxId++;
        boxOwner[boxId] = msg.sender;
        boxTypes[boxId] = boxType;
        userBoxIds[msg.sender].push(boxId);

        emit BoxMinted(msg.sender, boxId, boxType);
        return boxId;
    }

    /**
     * @dev Register a sealed loot box into the private system.
     *      Only the box owner can register.
     */
    function registerBox(
        bytes32 noteHash,
        uint256 boxId,
        bytes memory encryptedNote
    ) external {
        require(boxOwner[boxId] == msg.sender, "Not box owner");
        require(!registeredBoxes[boxId], "Box already registered");
        registeredBoxes[boxId] = true;
        _createNote(noteHash, encryptedNote);
        emit BoxRegistered(boxId, noteHash);
    }

    /**
     * @dev Open a loot box using a ZK proof with Poseidon VRF randomness.
     *      Spends the box note and creates an outcome note.
     */
    function openBox(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        bytes32 boxCommitment,
        bytes32 outcomeCommitment,
        uint256 vrfOutput,
        uint256 boxId,
        bytes32 nullifier,
        bytes memory encryptedNote
    ) external noteExists(boxCommitment) nullifierNotUsed(nullifier) {
        // Verify ZK proof
        uint256[5] memory publicInputs = [
            uint256(boxCommitment),
            uint256(outcomeCommitment),
            vrfOutput,
            boxId,
            uint256(nullifier)
        ];

        require(
            boxVerifier.verifyProof(a, b, c, publicInputs),
            "Invalid box opening proof"
        );

        // Spend box note, create outcome note
        _spendNote(boxCommitment, nullifier);
        _createNote(outcomeCommitment, encryptedNote);

        emit BoxOpened(boxCommitment, outcomeCommitment, nullifier, vrfOutput);
    }

    /**
     * @dev Get all box IDs owned by a user.
     */
    function getMyBoxes(address user) external view returns (uint256[] memory) {
        return userBoxIds[user];
    }

    /**
     * @dev Get box info by ID.
     */
    function getBoxInfo(uint256 boxId) external view returns (address owner, uint256 boxType, bool registered) {
        return (boxOwner[boxId], boxTypes[boxId], registeredBoxes[boxId]);
    }

    /**
     * @dev Update box price (admin only).
     */
    function setBoxPrice(uint256 _price) external {
        require(msg.sender == admin, "Only admin");
        boxPrice = _price;
        emit PriceUpdated(_price);
    }

    /**
     * @dev Withdraw accumulated tokens (admin only).
     */
    function withdrawTokens(address to) external {
        require(msg.sender == admin, "Only admin");
        uint256 balance = paymentToken.balanceOf(address(this));
        require(balance > 0, "No tokens to withdraw");
        paymentToken.transfer(to, balance);
    }
}
