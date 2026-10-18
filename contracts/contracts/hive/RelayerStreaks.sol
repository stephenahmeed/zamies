// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// Relayer Streaks — daily-ish holder check-ins.
/// A holder (balance > 0) calls `checkIn()` once per window:
///  - MIN_GAP (20h): earliest next check-in (blocks double check-ins on the same day)
///  - MAX_GAP (48h): latest next check-in before the streak resets to 1
/// Feeds CipherweightRegistry (streak >= minStreak qualifies for Cipherweight).
contract RelayerStreaks is Ownable {
    uint256 public constant MIN_GAP = 20 hours;
    uint256 public constant MAX_GAP = 48 hours;

    IERC721 public immutable nft;
    mapping(address => uint256) public lastCheckIn;
    mapping(address => uint256) public streak;
    mapping(address => uint256) public bestStreak;

    event CheckedIn(address indexed user, uint256 streak, uint256 timestamp);

    constructor(address nft_, address owner_) Ownable(owner_) { nft = IERC721(nft_); }

    function checkIn() external {
        require(nft.balanceOf(msg.sender) > 0, "no zamies");
        uint256 last = lastCheckIn[msg.sender];
        uint256 s;
        if (last == 0 || block.timestamp > last + MAX_GAP) s = 1;
        else if (block.timestamp >= last + MIN_GAP) s = streak[msg.sender] + 1;
        else revert("too soon");
        lastCheckIn[msg.sender] = block.timestamp;
        streak[msg.sender] = s;
        if (s > bestStreak[msg.sender]) bestStreak[msg.sender] = s;
        emit CheckedIn(msg.sender, s, block.timestamp);
    }

    /// Live streak: 0 if the 48h window has lapsed (stored value kept until next check-in).
    function streakOf(address a) public view returns (uint256) {
        uint256 last = lastCheckIn[a];
        if (last == 0 || block.timestamp > last + MAX_GAP) return 0;
        return streak[a];
    }
    function lastCheckInOf(address a) external view returns (uint256) { return lastCheckIn[a]; }
    function bestStreakOf(address a) external view returns (uint256) { return bestStreak[a]; }
}
