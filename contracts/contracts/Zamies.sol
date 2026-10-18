// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {FHE, euint64, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";

/// Zamies: 4,444 encrypted NFTs (team #1-#44, public #45-#4444). Each token holds an encrypted random seed that only its
/// current holder can decrypt. Mint is paid in cZAMA (ERC-7984), amounts stay encrypted.
/// Mint payment is escrowed in this contract until the KMS-verified `paid` flag is finalized: paid -> forwarded to
/// the treasury and minted; not paid -> refunded. A batch that is never finalized can be cancelled by anyone after
/// its deadline, which releases the reserved supply / wallet allowance and refunds the escrowed cZAMA to the buyer.
/// Royalty (ERC-2981) defaults to 2% to the treasury, matching the treasury share of the Zamies market fee.
contract Zamies is ERC721, ERC2981, Ownable, ReentrancyGuard, ZamaEthereumConfig {
    uint256 public constant MAX_SUPPLY = 4444;
    uint256 public constant TEAM_RESERVE = 44;
    uint256 public constant PUBLIC_SUPPLY = 4400;
    uint256 public constant MAX_PER_WALLET = 10;
    uint96 public constant DEFAULT_ROYALTY_BPS = 200;  // 2% = treasury share of the 6.5% Zamies market fee
    uint96 public constant MAX_ROYALTY_BPS = 1000;     // hard cap 10%
    uint256 public constant MIN_PENDING_TIMEOUT = 15 minutes;
    uint256 public constant MAX_PENDING_TIMEOUT = 7 days;

    IERC7984 public immutable payToken;
    address public treasury;
    uint64 public immutable priceUnits; // price per mint in cZAMA base units (20 * 10**decimals)

    string private _uri;
    uint256 public publicMinted;
    uint256 public reserved;
    uint256 public teamMinted;
    uint256 public batchCount;
    mapping(address => uint256) public mintedBy;
    /// Time after which an unfinalized mint batch can be cancelled by anyone. Fixed per batch at request time.
    uint256 public pendingTimeout = 1 hours;

    struct Batch { address buyer; uint32 qty; bool done; ebool paid; uint64 deadline; euint64 escrow; }
    mapping(uint256 => Batch) public batches;
    mapping(uint256 => euint64) private _seed;
    mapping(uint256 => bool) public published;

    event MintRequested(uint256 indexed batchId, address indexed buyer, uint32 qty, bytes32 paidHandle);
    event MintFinalized(uint256 indexed batchId, bool paid);
    event Published(uint256 indexed id, address indexed holder, bytes32 seedHandle);
    event MintCancelled(uint256 indexed batchId, address indexed caller);
    event PendingTimeoutUpdated(uint256 timeout);

    constructor(address payToken_, address treasury_, uint64 priceUnits_, string memory uri_)
        ERC721("Zamies", "ZAMIE") Ownable(msg.sender)
    {
        require(payToken_ != address(0) && treasury_ != address(0), "zero address");
        payToken = IERC7984(payToken_);
        treasury = treasury_;
        priceUnits = priceUnits_;
        _uri = uri_;
        _setDefaultRoyalty(treasury_, DEFAULT_ROYALTY_BPS); // 2% to treasury, same as the market treasury share
    }

    /// Step 1. Buyer must first call payToken.setOperator(address(this), until).
    /// The payment is pulled into escrow here (not straight to the treasury) so a stale batch can be refunded.
    function requestMint(uint32 qty) external nonReentrant returns (uint256 id) {
        require(qty > 0 && mintedBy[msg.sender] + qty <= MAX_PER_WALLET, "wallet limit");
        require(publicMinted + reserved + qty <= PUBLIC_SUPPLY, "sold out");
        mintedBy[msg.sender] += qty;
        reserved += qty;

        euint64 amount = FHE.asEuint64(priceUnits * uint64(qty));
        FHE.allowTransient(amount, address(payToken));
        euint64 got = payToken.confidentialTransferFrom(msg.sender, address(this), amount);
        FHE.allowThis(got);
        ebool paid = FHE.eq(got, amount);
        FHE.makePubliclyDecryptable(paid); // reveals only "paid or not", never the amount

        id = ++batchCount;
        batches[id] = Batch(msg.sender, qty, false, paid, uint64(block.timestamp + pendingTimeout), got);
        emit MintRequested(id, msg.sender, qty, FHE.toBytes32(paid));
    }

    /// Step 2. Anyone can finalize with the KMS proof of the decrypted `paid` flag.
    function finalizeMint(uint256 batchId, bool paidClear, bytes calldata proof) external nonReentrant {
        Batch storage b = batches[batchId];
        require(b.buyer != address(0) && !b.done, "bad batch");
        b.done = true;
        bytes32[] memory h = new bytes32[](1);
        h[0] = FHE.toBytes32(b.paid);
        FHE.checkSignatures(h, abi.encode(paidClear), proof);
        reserved -= b.qty;
        if (!paidClear) {
            mintedBy[b.buyer] -= b.qty;
            _sendEscrow(b.buyer, b.escrow); // whatever arrived (0 with ERC-7984 all-or-nothing) goes back
            emit MintFinalized(batchId, false);
            return;
        }
        for (uint32 i = 0; i < b.qty; i++) _mintWithSeed(b.buyer, TEAM_RESERVE + (++publicMinted));
        _sendEscrow(treasury, b.escrow);
        emit MintFinalized(batchId, true);
    }

    /// Anyone can cancel a batch that was not finalized before its deadline (e.g. KMS/relayer outage or a buyer who
    /// never finalizes). Releases the reserved supply and the wallet allowance and refunds the escrow to the buyer.
    function cancelStaleMint(uint256 batchId) external nonReentrant {
        Batch storage b = batches[batchId];
        require(b.buyer != address(0) && !b.done, "bad batch");
        require(block.timestamp >= b.deadline, "not stale yet");
        b.done = true;
        reserved -= b.qty;
        mintedBy[b.buyer] -= b.qty;
        _sendEscrow(b.buyer, b.escrow);
        emit MintCancelled(batchId, msg.sender);
    }

    function setPendingTimeout(uint256 t) external onlyOwner {
        require(t >= MIN_PENDING_TIMEOUT && t <= MAX_PENDING_TIMEOUT, "bad timeout");
        pendingTimeout = t;
        emit PendingTimeoutUpdated(t);
    }

    function teamMint(address to, uint256 qty) external onlyOwner {
        require(teamMinted + qty <= TEAM_RESERVE, "reserve used");
        for (uint256 i = 0; i < qty; i++) _mintWithSeed(to, ++teamMinted);
    }

    /// Returns the encrypted seed handle. Only the current holder can decrypt it.
    function seedOf(uint256 id) external view returns (euint64) {
        _requireOwned(id);
        return _seed[id];
    }

    /// Publish art: permanent and public. The holder makes the cube's encrypted seed publicly decryptable,
    /// so anyone can decrypt it through the relayer/KMS and render its art and traits. Cannot be undone.
    function publish(uint256 id) external {
        require(ownerOf(id) == msg.sender, "not owner");
        require(!published[id], "already published");
        published[id] = true;
        euint64 s = _seed[id];
        FHE.makePubliclyDecryptable(s);
        emit Published(id, msg.sender, FHE.toBytes32(s));
    }

    /// Public seed handle for a published cube (anyone may publicly decrypt it).
    function publicSeedOf(uint256 id) external view returns (bytes32) {
        require(published[id], "not published");
        return FHE.toBytes32(_seed[id]);
    }

    function setBaseURI(string calldata uri_) external onlyOwner { _uri = uri_; }
    event TreasuryUpdated(address treasury);
    event RoyaltyUpdated(address receiver, uint96 bps);
    function setTreasury(address t) external onlyOwner { require(t != address(0), "zero address"); treasury = t; emit TreasuryUpdated(t); }
    /// Owner-configurable ERC-2981 royalty, capped at MAX_ROYALTY_BPS. Note: setTreasury does not move the royalty receiver.
    function setRoyalty(address r, uint96 bps) external onlyOwner { require(r != address(0) && bps <= MAX_ROYALTY_BPS, "bad royalty"); _setDefaultRoyalty(r, bps); emit RoyaltyUpdated(r, bps); }
    function _baseURI() internal view override returns (string memory) { return _uri; }

    function _sendEscrow(address to, euint64 amount) private {
        FHE.allowTransient(amount, address(payToken));
        payToken.confidentialTransfer(to, amount);
    }

    function _mintWithSeed(address to, uint256 id) private {
        euint64 s = FHE.randEuint64(); // on-chain FHE randomness, nobody picks it
        _seed[id] = s;
        FHE.allowThis(s);
        _mint(to, id);
    }

    /// On every transfer the seed gets a fresh ciphertext handle, so the new holder gets access
    /// and the previous holder's access to the live handle ends.
    function _update(address to, uint256 id, address auth) internal override returns (address from) {
        from = super._update(to, id, auth);
        if (to != address(0)) {
            euint64 s = _seed[id];
            if (from != address(0) && !published[id]) {
                s = FHE.add(s, uint64(0));
                _seed[id] = s;
                FHE.allowThis(s);
            }
            FHE.allow(s, to);
        }
    }

    function supportsInterface(bytes4 i) public view override(ERC721, ERC2981) returns (bool) {
        return super.supportsInterface(i);
    }
}
