// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./NFTNoteBase.sol";
import "./verifiers/IGroth16Verifier.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title GamingItemTrade
 * @dev F5: Gaming Item Trade - P2P marketplace for privately trading gaming items.
 *
 *      Item Note structure: Poseidon(pkX, pkY, itemId, itemType, itemAttributes, gameId, salt)
 *      Payment Note structure: Poseidon(sellerPkX, sellerPkY, price, paymentToken, paymentSalt)
 *
 *      Flow:
 *        1. Seller registers item (registerItem)
 *        2. Seller lists item for sale (listItem)
 *        3. Buyer pays escrow + submits ZK pubkey (purchaseItem)
 *        4. Seller generates ZK proof using buyer's pubkey, executes trade (executeTradeForBuyer)
 *        5. Payment released to seller; new item note created for buyer
 */
contract GamingItemTrade is NFTNoteBase {
    IGamingItemTradeVerifier public tradeVerifier;
    IERC20 public paymentToken;
    address public admin;
    uint256 public nextListingId = 1;

    struct Listing {
        address seller;
        bytes32 itemNoteHash;
        uint256 gameId;
        uint256 itemId;
        uint256 price;      // token amount (ERC20)
        bool active;
        address buyer;      // set after purchaseItem()
        uint256 buyerPkX;   // buyer ZK pubkey X
        uint256 buyerPkY;   // buyer ZK pubkey Y
    }

    mapping(uint256 => Listing) public listings;

    // gameId => itemId => registered
    mapping(uint256 => mapping(uint256 => bool)) public registeredItems;

    event ItemRegistered(uint256 indexed gameId, uint256 indexed itemId, bytes32 noteHash);
    event ItemListed(address indexed seller, uint256 indexed listingId, uint256 price);
    event ItemPurchased(address indexed buyer, uint256 indexed listingId, uint256 buyerPkX, uint256 buyerPkY);
    event ItemTradeCompleted(uint256 indexed listingId, bytes32 oldNote, bytes32 newNote);
    event ListingCancelled(uint256 indexed listingId);

    constructor(address _tradeVerifier, address _paymentToken) {
        tradeVerifier = IGamingItemTradeVerifier(_tradeVerifier);
        paymentToken = IERC20(_paymentToken);
        admin = msg.sender;
    }

    /**
     * @dev Register a gaming item into the private trading system.
     * @param noteHash The commitment to the item note
     * @param gameId The game ecosystem identifier
     * @param itemId The item token ID
     * @param encryptedNote ECDH-encrypted note data for the owner
     */
    function registerItem(
        bytes32 noteHash,
        uint256 gameId,
        uint256 itemId,
        bytes memory encryptedNote
    ) external {
        require(!registeredItems[gameId][itemId], "Item already registered");
        registeredItems[gameId][itemId] = true;
        _createNote(noteHash, encryptedNote);
        emit ItemRegistered(gameId, itemId, noteHash);
    }

    /**
     * @dev List a registered item for sale.
     * @param itemNoteHash The current valid note hash for the item
     * @param gameId The game ecosystem identifier
     * @param itemId The item token ID
     * @param price Sale price in payment token units
     */
    function listItem(
        bytes32 itemNoteHash,
        uint256 gameId,
        uint256 itemId,
        uint256 price
    ) external noteExists(itemNoteHash) {
        require(price > 0, "Price must be greater than zero");
        uint256 listingId = nextListingId++;
        listings[listingId] = Listing({
            seller: msg.sender,
            itemNoteHash: itemNoteHash,
            gameId: gameId,
            itemId: itemId,
            price: price,
            active: true,
            buyer: address(0),
            buyerPkX: 0,
            buyerPkY: 0
        });
        emit ItemListed(msg.sender, listingId, price);
    }

    /**
     * @dev Buyer pays escrow and submits their ZK public key.
     *      Tokens are held in this contract until the trade completes or is cancelled.
     * @param listingId The listing ID
     * @param buyerPkX Buyer's ZK public key X coordinate
     * @param buyerPkY Buyer's ZK public key Y coordinate
     */
    function purchaseItem(
        uint256 listingId,
        uint256 buyerPkX,
        uint256 buyerPkY
    ) external {
        Listing storage listing = listings[listingId];
        require(listing.active, "Listing not active");
        require(listing.buyer == address(0), "Already purchased");
        require(buyerPkX != 0 || buyerPkY != 0, "Invalid buyer pubkey");

        require(
            paymentToken.transferFrom(msg.sender, address(this), listing.price),
            "Payment transfer failed"
        );

        listing.buyer = msg.sender;
        listing.buyerPkX = buyerPkX;
        listing.buyerPkY = buyerPkY;

        emit ItemPurchased(msg.sender, listingId, buyerPkX, buyerPkY);
    }

    /**
     * @dev Seller submits ZK proof and completes the trade.
     *      Spends the old item note, creates a new one for the buyer, and releases payment.
     * @param listingId The listing ID
     * @param a Groth16 proof point a
     * @param b Groth16 proof point b
     * @param c Groth16 proof point c
     * @param newItemHash New item note hash committed to buyer's pubkey
     * @param paymentNoteHash Payment note hash
     * @param nullifier Nullifier to prevent double-spend
     * @param encryptedNote ECDH-encrypted note data for the buyer
     */
    function executeTradeForBuyer(
        uint256 listingId,
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        bytes32 newItemHash,
        bytes32 paymentNoteHash,
        bytes32 nullifier,
        bytes memory encryptedNote
    ) external nullifierNotUsed(nullifier) {
        Listing storage listing = listings[listingId];
        require(listing.active, "Listing not active");
        require(listing.seller == msg.sender, "Only seller can execute trade");
        require(listing.buyer != address(0), "No buyer yet");

        bytes32 oldItemHash = listing.itemNoteHash;
        require(notes[oldItemHash] == NoteState.Valid, "Note does not exist or already spent");

        uint256[5] memory publicInputs = [
            uint256(oldItemHash),
            uint256(newItemHash),
            uint256(paymentNoteHash),
            listing.gameId,
            uint256(nullifier)
        ];

        require(
            tradeVerifier.verifyProof(a, b, c, publicInputs),
            "Invalid trade proof"
        );

        _spendNote(oldItemHash, nullifier);
        _createNote(newItemHash, encryptedNote);

        listing.active = false;

        require(
            paymentToken.transfer(listing.seller, listing.price),
            "Payment release failed"
        );

        emit ItemTradeCompleted(listingId, oldItemHash, newItemHash);
    }

    /**
     * @dev Cancel an active listing. Refunds buyer if payment was made.
     * @param listingId The listing ID to cancel
     */
    function cancelListing(uint256 listingId) external {
        Listing storage listing = listings[listingId];
        require(listing.seller == msg.sender, "Only seller can cancel");
        require(listing.active, "Listing not active");

        listing.active = false;

        if (listing.buyer != address(0)) {
            require(
                paymentToken.transfer(listing.buyer, listing.price),
                "Refund failed"
            );
        }

        emit ListingCancelled(listingId);
    }

    /**
     * @dev Returns all listings (including inactive ones).
     */
    function getListings() external view returns (Listing[] memory) {
        uint256 total = nextListingId - 1;
        Listing[] memory result = new Listing[](total);
        for (uint256 i = 0; i < total; i++) {
            result[i] = listings[i + 1];
        }
        return result;
    }

    /**
     * @dev Returns a single listing by ID.
     */
    function getListing(uint256 listingId) external view returns (Listing memory) {
        return listings[listingId];
    }
}
