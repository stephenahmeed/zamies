// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {FHE, euint8, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";

/// Royal Handle Boost hook (future Queen collection). Return true if `holder` qualifies for 1.25x weight.
interface IQueenRegistry { function isQueenHolder(address holder) external view returns (bool); }

/// Zamies Hive — the Coprocessor.
/// - Seal & Earn (`sealAndEarn(id)`): permanently seals a cube; ZamiesMarketV3 refuses to list/sell/accept offers for it.
/// - Confidential Yield Pool: receives 4% of every MarketV3 sale, split pro-rata by weight across sealed cubes.
/// - Encrypted Balance: per-token pending cZAMA (euint64) that follows the NFT; only the current
///   `nft.ownerOf(id)` is granted ACL to decrypt and can claim.
/// - Ciphertext Tracks: each sealed cube gets a hidden FHE-random track (0..3), stored for future mechanics.
/// - Royal Handle Boost: 1.25x weight via a one-time-settable registry hook (placeholder until Queens exist).
/// - Total Decrypted to Holders: public aggregate of cZAMA distributed to the pool (no per-wallet data).
contract ZamiesHive is Ownable, ZamaEthereumConfig {
    uint256 public constant BASE_WEIGHT = 100;
    uint256 public constant QUEEN_WEIGHT = 125; // 1.25x
    uint256 private constant ACC = 1e18;

    IERC721 public immutable nft;
    IERC7984 public immutable payToken;
    address public market;               // set once
    IQueenRegistry public queenRegistry; // zero = no boost yet

    uint256 public totalWeight;
    uint256 public accPerWeight;         // scaled by 1e18
    uint256 public undistributed;        // rewards received while no cube was sealed
    uint256 public totalDecryptedToHolders; // Total Decrypted to Holders (aggregate only)
    uint256 public sealedCount;

    mapping(uint256 => bool) public isSealed;
    mapping(uint256 => uint256) public weightOf;
    mapping(uint256 => uint256) private _debt;
    mapping(uint256 => euint64) private _pending;
    mapping(uint256 => euint8) private _track;

    event SealedAndEarning(uint256 indexed id, address indexed by, uint256 weight);
    event RewardNotified(uint256 amount, uint256 accPerWeight);
    event Claimed(uint256 indexed id);
    event WeightUpdated(uint256 indexed id, uint256 weight);
    event MarketSet(address market);
    event QueenRegistrySet(address registry);

    constructor(address nft_, address payToken_) Ownable(msg.sender) {
        require(nft_ != address(0) && payToken_ != address(0), "zero address");
        nft = IERC721(nft_);
        payToken = IERC7984(payToken_);
    }

    function setMarket(address m) external onlyOwner {
        require(market == address(0) && m != address(0), "market set");
        market = m;
        emit MarketSet(m);
    }

    /// Royal Handle Boost hook. Can be set once (then frozen) to avoid weight games.
    function setQueenRegistry(address r) external onlyOwner {
        require(address(queenRegistry) == address(0), "registry set");
        queenRegistry = IQueenRegistry(r);
        emit QueenRegistrySet(r);
    }

    // ---------- holder actions ----------
    function sealAndEarn(uint256 id) external {
        require(nft.ownerOf(id) == msg.sender, "not owner");
        require(!isSealed[id], "already sealed");
        isSealed[id] = true;
        sealedCount++;
        euint8 t = FHE.randEuint8(4); // upper bound must be a power of 2
        _track[id] = t;
        FHE.allowThis(t);
        FHE.allow(t, msg.sender);
        euint64 p = FHE.asEuint64(0);
        _pending[id] = p;
        FHE.allowThis(p);
        FHE.allow(p, msg.sender);
        uint256 w = _weightFor(msg.sender);
        weightOf[id] = w;
        totalWeight += w;
        _debt[id] = (w * accPerWeight) / ACC;
        if (undistributed > 0) { uint256 u = undistributed; undistributed = 0; _distribute(u); }
        emit SealedAndEarning(id, msg.sender, w);
    }

    /// Settle accrued rewards into the encrypted pending balance and grant the current owner ACL.
    function sync(uint256 id) public {
        require(isSealed[id], "not sealed");
        _settle(id);
    }

    /// Recompute the Queen boost for the current owner (anyone can poke).
    function poke(uint256 id) external {
        require(isSealed[id], "not sealed");
        _settle(id);
        uint256 w = _weightFor(nft.ownerOf(id));
        if (w != weightOf[id]) {
            totalWeight = totalWeight - weightOf[id] + w;
            weightOf[id] = w;
            _debt[id] = (w * accPerWeight) / ACC;
            emit WeightUpdated(id, w);
        }
    }

    /// Only the current NFT owner can claim. The encrypted pending balance is transferred and reset.
    function claim(uint256 id) external {
        require(isSealed[id], "not sealed");
        address o = nft.ownerOf(id);
        require(o == msg.sender, "not owner");
        _settle(id);
        euint64 p = _pending[id];
        FHE.allowTransient(p, address(payToken));
        payToken.confidentialTransfer(o, p);
        euint64 z = FHE.asEuint64(0);
        _pending[id] = z;
        FHE.allowThis(z);
        FHE.allow(z, o);
        emit Claimed(id);
    }

    // ---------- market hook ----------
    /// Called by the market after it transferred `amount` cZAMA to this contract.
    function notifyReward(uint256 amount) external {
        require(msg.sender == market, "only market");
        if (amount == 0) return;
        if (totalWeight == 0) { undistributed += amount; return; }
        _distribute(amount);
    }

    // ---------- views ----------
    function pendingOf(uint256 id) external view returns (euint64) { return _pending[id]; }
    function trackOf(uint256 id) external view returns (euint8) { return _track[id]; }

    // ---------- internals ----------
    function _distribute(uint256 amount) private {
        accPerWeight += (amount * ACC) / totalWeight;
        totalDecryptedToHolders += amount;
        emit RewardNotified(amount, accPerWeight);
    }

    function _settle(uint256 id) private {
        uint256 w = weightOf[id];
        uint256 owedTotal = (w * accPerWeight) / ACC;
        uint256 owed = owedTotal - _debt[id];
        _debt[id] = owedTotal;
        euint64 p = _pending[id];
        if (owed > 0) p = FHE.add(p, uint64(owed));
        else p = FHE.add(p, uint64(0)); // fresh handle so ACL follows the current owner only
        _pending[id] = p;
        FHE.allowThis(p);
        address o = nft.ownerOf(id);
        FHE.allow(p, o);
        FHE.allow(_track[id], o);
    }

    function _weightFor(address holder) private view returns (uint256) {
        if (address(queenRegistry) != address(0)) {
            try queenRegistry.isQueenHolder(holder) returns (bool q) { if (q) return QUEEN_WEIGHT; } catch {}
        }
        return BASE_WEIGHT;
    }
}
