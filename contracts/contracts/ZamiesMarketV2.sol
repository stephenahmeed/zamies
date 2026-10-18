// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC2981} from "@openzeppelin/contracts/interfaces/IERC2981.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {FHE, euint64, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";

interface IZamiesSupply {
    function publicMinted() external view returns (uint256);
    function teamMinted() external view returns (uint256);
    function MAX_SUPPLY() external view returns (uint256);
}

/// Zamies Confidential Market v2: listings, sweeps and escrowed offers in cZAMA.
/// Listing and offers are open anytime; settlement (buy / acceptOffer) opens when trading is open.
contract ZamiesMarketV2 is Ownable, ZamaEthereumConfig {
    IERC721 public immutable nft;
    IERC7984 public immutable payToken;
    address public feeTo;
    uint256 public feeBps; // 0 by default: total seller cost = NFT royalty (4%)
    bool public tradingForced;

    struct Listing { address seller; uint64 price; bool locked; }
    struct Purchase { address buyer; uint256[] ids; ebool paid; bool done; }
    // status: 1 pending (payment unverified), 2 active, 3 closed
    struct Offer { address bidder; uint256 id; uint64 amount; uint8 status; ebool paid; euint64 escrow; }

    mapping(uint256 => Listing) public listings;
    mapping(uint256 => Purchase) private _purchases;
    mapping(uint256 => Offer) private _offers;
    uint256 public purchaseCount;
    uint256 public offerCount;

    event Listed(uint256 indexed id, address indexed seller, uint64 price);
    event Cancelled(uint256 indexed id);
    event PriceUpdated(uint256 indexed id, uint64 price);
    event PurchaseRequested(uint256 indexed purchaseId, address indexed buyer, uint256[] ids, bytes32 paidHandle);
    event PurchaseFinalized(uint256 indexed purchaseId, bool paid);
    event OfferRequested(uint256 indexed offerId, uint256 indexed id, address indexed bidder, uint64 amount, bytes32 paidHandle);
    event OfferActivated(uint256 indexed offerId, bool paid);
    event OfferCancelled(uint256 indexed offerId);
    event OfferAccepted(uint256 indexed offerId, uint256 indexed id, address seller);
    event TradingForced(bool open);

    constructor(address nft_, address payToken_, address feeTo_) Ownable(msg.sender) {
        require(nft_ != address(0) && payToken_ != address(0) && feeTo_ != address(0), "zero address");
        nft = IERC721(nft_);
        payToken = IERC7984(payToken_);
        feeTo = feeTo_;
    }

    function tradingOpen() public view returns (bool) {
        if (tradingForced) return true;
        IZamiesSupply z = IZamiesSupply(address(nft));
        return z.publicMinted() + z.teamMinted() >= z.MAX_SUPPLY();
    }
    modifier whenOpen() { require(tradingOpen(), "not available yet"); _; }

    // ---------- listings ----------
    function list(uint256 id, uint64 price) external {
        require(price > 0, "price");
        require(nft.ownerOf(id) == msg.sender, "not owner");
        nft.transferFrom(msg.sender, address(this), id);
        listings[id] = Listing(msg.sender, price, false);
        emit Listed(id, msg.sender, price);
    }

    function cancel(uint256 id) external {
        Listing memory l = listings[id];
        require(l.seller == msg.sender && !l.locked, "cannot cancel");
        delete listings[id];
        nft.transferFrom(address(this), msg.sender, id);
        emit Cancelled(id);
    }

    function updatePrice(uint256 id, uint64 price) external {
        Listing storage l = listings[id];
        require(l.seller == msg.sender && !l.locked, "cannot update");
        require(price > 0, "price");
        l.price = price;
        emit PriceUpdated(id, price);
    }

    /// Buyer must first call payToken.setOperator(address(this), until).
    function buy(uint256[] calldata ids) external whenOpen returns (uint256 pid) {
        require(ids.length > 0 && ids.length <= 10, "1 to 10");
        uint64 total;
        for (uint256 i = 0; i < ids.length; i++) {
            Listing storage l = listings[ids[i]];
            require(l.seller != address(0) && !l.locked && l.seller != msg.sender, "unavailable");
            l.locked = true;
            total += l.price;
        }
        euint64 got = _pull(msg.sender, total);
        ebool paid = FHE.eq(got, FHE.asEuint64(total));
        FHE.makePubliclyDecryptable(paid);
        pid = ++purchaseCount;
        _purchases[pid] = Purchase(msg.sender, ids, paid, false);
        emit PurchaseRequested(pid, msg.sender, ids, FHE.toBytes32(paid));
    }

    function finalizePurchase(uint256 pid, bool paidClear, bytes calldata proof) external {
        Purchase storage p = _purchases[pid];
        require(p.buyer != address(0) && !p.done, "bad purchase");
        p.done = true;
        _check(p.paid, paidClear, proof);
        for (uint256 i = 0; i < p.ids.length; i++) {
            uint256 id = p.ids[i];
            Listing memory l = listings[id];
            if (!paidClear) { listings[id].locked = false; continue; }
            delete listings[id];
            _settle(id, l.price, l.seller);
            nft.transferFrom(address(this), p.buyer, id);
        }
        emit PurchaseFinalized(pid, paidClear);
    }

    // ---------- offers ----------
    /// Bidder must first call payToken.setOperator(address(this), until). Amount is escrowed (encrypted).
    function makeOffer(uint256 id, uint64 amount) external returns (uint256 oid) {
        require(amount > 0, "amount");
        address o = nft.ownerOf(id);
        require(o != msg.sender && listings[id].seller != msg.sender, "own item");
        euint64 got = _pull(msg.sender, amount);
        ebool paid = FHE.eq(got, FHE.asEuint64(amount));
        FHE.makePubliclyDecryptable(paid);
        oid = ++offerCount;
        _offers[oid] = Offer(msg.sender, id, amount, 1, paid, got);
        emit OfferRequested(oid, id, msg.sender, amount, FHE.toBytes32(paid));
    }

    /// Anyone can finalize with the KMS proof. Underfunded offers are closed and whatever arrived is returned.
    function finalizeOffer(uint256 oid, bool paidClear, bytes calldata proof) external {
        Offer storage f = _offers[oid];
        require(f.status == 1, "bad offer");
        _check(f.paid, paidClear, proof);
        if (paidClear) { f.status = 2; }
        else { f.status = 3; _refund(f); }
        emit OfferActivated(oid, paidClear);
    }

    function cancelOffer(uint256 oid) external {
        Offer storage f = _offers[oid];
        require(f.bidder == msg.sender && (f.status == 1 || f.status == 2), "cannot cancel");
        f.status = 3;
        _refund(f);
        emit OfferCancelled(oid);
    }

    /// Holder (or seller of a listed item) accepts an active offer.
    function acceptOffer(uint256 oid) external whenOpen {
        Offer storage f = _offers[oid];
        require(f.status == 2, "offer not active");
        uint256 id = f.id;
        Listing memory l = listings[id];
        address seller;
        if (l.seller != address(0)) {
            require(l.seller == msg.sender && !l.locked, "not seller");
            seller = l.seller;
            delete listings[id];
        } else {
            require(nft.ownerOf(id) == msg.sender, "not owner");
            seller = msg.sender;
            nft.transferFrom(msg.sender, address(this), id);
        }
        f.status = 3;
        _settle(id, f.amount, seller);
        nft.transferFrom(address(this), f.bidder, id);
        emit OfferAccepted(oid, id, seller);
    }

    function getOffer(uint256 oid) external view returns (address bidder, uint256 id, uint64 amount, uint8 status) {
        Offer storage f = _offers[oid];
        return (f.bidder, f.id, f.amount, f.status);
    }

    // ---------- admin ----------
    function setFee(address to, uint256 bps) external onlyOwner { require(bps <= 500, "max 5%"); require(to != address(0), "zero address"); feeTo = to; feeBps = bps; }
    function setTradingOpen(bool open) external onlyOwner { tradingForced = open; emit TradingForced(open); }

    // ---------- internals ----------
    function _pull(address from, uint64 amount) private returns (euint64 got) {
        euint64 a = FHE.asEuint64(amount);
        FHE.allowTransient(a, address(payToken));
        got = payToken.confidentialTransferFrom(from, address(this), a);
        FHE.allowThis(got);
    }

    function _check(ebool h, bool clear, bytes calldata proof) private {
        bytes32[] memory hs = new bytes32[](1);
        hs[0] = FHE.toBytes32(h);
        FHE.checkSignatures(hs, abi.encode(clear), proof);
    }

    function _refund(Offer storage f) private {
        FHE.allowTransient(f.escrow, address(payToken));
        payToken.confidentialTransfer(f.bidder, f.escrow);
    }

    function _settle(uint256 id, uint64 price, address seller) private {
        (address r, uint256 roy) = IERC2981(address(nft)).royaltyInfo(id, price);
        uint64 fee = uint64((uint256(price) * feeBps) / 10000);
        if (r == address(0) || roy > price - fee) roy = 0;
        uint64 royalty = uint64(roy);
        _pay(feeTo, fee);
        _pay(r, royalty);
        _pay(seller, price - fee - royalty);
    }

    function _pay(address to, uint64 amount) private {
        if (amount == 0) return;
        euint64 a = FHE.asEuint64(amount);
        FHE.allowTransient(a, address(payToken));
        payToken.confidentialTransfer(to, a);
    }
}
