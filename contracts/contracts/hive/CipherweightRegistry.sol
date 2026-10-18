// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IRelayerStreaks { function streakOf(address a) external view returns (uint256); }

/// Cipherweight registry — plugs into ZamiesHive's one-time registry hook.
/// ABI keeps `isQueenHolder` for compatibility with the deployed Hive; semantically it means
/// "qualifies for Cipherweight (1.25x Confidential Yield Pool weight)".
/// Qualifies if holding >= minBalance Zamies OR Relayer Streak >= minStreak.
/// Thresholds are owner-settable (testnet tuning); call `freeze()` to lock them forever.
/// Weight changes apply to a sealed cube on seal or when anyone calls `hive.poke(id)`.
contract CipherweightRegistry is Ownable {
    IERC721 public immutable nft;
    IRelayerStreaks public immutable relayerStreaks;
    uint256 public minBalance;
    uint256 public minStreak;
    bool public frozen;

    event ThresholdsSet(uint256 minBalance, uint256 minStreak);
    event Frozen();

    constructor(address nft_, address streaks_, uint256 minBalance_, uint256 minStreak_, address owner_) Ownable(owner_) {
        nft = IERC721(nft_); relayerStreaks = IRelayerStreaks(streaks_);
        minBalance = minBalance_; minStreak = minStreak_;
        emit ThresholdsSet(minBalance_, minStreak_);
    }

    function isQueenHolder(address a) external view returns (bool) { return hasCipherweight(a); }

    function hasCipherweight(address a) public view returns (bool) {
        if (minBalance > 0 && nft.balanceOf(a) >= minBalance) return true;
        if (minStreak > 0 && address(relayerStreaks) != address(0) && relayerStreaks.streakOf(a) >= minStreak) return true;
        return false;
    }

    function setThresholds(uint256 b, uint256 s) external onlyOwner {
        require(!frozen, "frozen");
        minBalance = b; minStreak = s;
        emit ThresholdsSet(b, s);
    }
    function freeze() external onlyOwner { frozen = true; emit Frozen(); }
}
