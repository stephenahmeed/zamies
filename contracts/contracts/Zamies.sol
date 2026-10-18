// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {FHE, euint64, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";

/// Zamies: 4,444 encrypted NFTs (team #1-#44, public #45-#4444). Each token holds an encrypted random seed that only its
/// current holder can decrypt. Mint is paid in cZAMA (ERC-7984), amounts stay encrypted.
contract Zamies is ERC721, ERC2981, Ownable, ZamaEthereumConfig {
    uint256 public constant MAX_SUPPLY = 4444;
    uint256 public constant TEAM_RESERVE = 44;
    uint256 public constant PUBLIC_SUPPLY = 4400;
    uint256 public constant MAX_PER_WALLET = 10;

    IERC7984 public immutable payToken;
    address public treasury;
    uint64 public immutable priceUnits; // price per mint in cZAMA base units (20 * 10**decimals)

    string private _uri;
    uint256 public publicMinted;
    uint256 public reserved;
    uint256 public teamMinted;
    uint256 public batchCount;
    mapping(address => uint256) public mintedBy;

    struct Batch { address buyer; uint32 qty; bool done; ebool paid; }
    mapping(uint256 => Batch) public batches;
    mapping(uint256 => euint64) private _seed;
    mapping(uint256 => bool) public published;

    event MintRequested(uint256 indexed batchId, address indexed buyer, uint32 qty, bytes32 paidHandle);
    event MintFinalized(uint256 indexed batchId, bool paid);
    event Published(uint256 indexed id, address indexed holder, bytes32 seedHandle);

    constructor(address payToken_, address treasury_, uint64 priceUnits_, string memory uri_)
        ERC721("Zamies", "ZAMIE") Ownable(msg.sender)
    {
        require(payToken_ != address(0) && treasury_ != address(0), "zero address");
        payToken = IERC7984(payToken_);
        treasury = treasury_;
        priceUnits = priceUnits_;
        _uri = uri_;
        _setDefaultRoyalty(treasury_, 400); // 4% creator royalty
    }

    /// Step 1. Buyer must first call payToken.setOperator(address(this), until).
    function requestMint(uint32 qty) external returns (uint256 id) {
        require(qty > 0 && mintedBy[msg.sender] + qty <= MAX_PER_WALLET, "wallet limit");
        require(publicMinted + reserved + qty <= PUBLIC_SUPPLY, "sold out");
        mintedBy[msg.sender] += qty;
        reserved += qty;

        euint64 amount = FHE.asEuint64(priceUnits * uint64(qty));
        FHE.allowTransient(amount, address(payToken));
        euint64 got = payToken.confidentialTransferFrom(msg.sender, treasury, amount);
        ebool paid = FHE.eq(got, amount);
        FHE.makePubliclyDecryptable(paid); // reveals only "paid or not", never the amount

        id = ++batchCount;
        batches[id] = Batch(msg.sender, qty, false, paid);
        emit MintRequested(id, msg.sender, qty, FHE.toBytes32(paid));
    }

    /// Step 2. Anyone can finalize with the KMS proof of the decrypted `paid` flag.
    function finalizeMint(uint256 batchId, bool paidClear, bytes calldata proof) external {
        Batch storage b = batches[batchId];
        require(b.buyer != address(0) && !b.done, "bad batch");
        b.done = true;
        bytes32[] memory h = new bytes32[](1);
        h[0] = FHE.toBytes32(b.paid);
        FHE.checkSignatures(h, abi.encode(paidClear), proof);
        reserved -= b.qty;
        if (!paidClear) {
            mintedBy[b.buyer] -= b.qty;
            emit MintFinalized(batchId, false);
            return;
        }
        for (uint32 i = 0; i < b.qty; i++) _mintWithSeed(b.buyer, TEAM_RESERVE + (++publicMinted));
        emit MintFinalized(batchId, true);
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
    function setRoyalty(address r, uint96 bps) external onlyOwner { require(r != address(0) && bps <= 1000, "bad royalty"); _setDefaultRoyalty(r, bps); emit RoyaltyUpdated(r, bps); }
    function _baseURI() internal view override returns (string memory) { return _uri; }

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
