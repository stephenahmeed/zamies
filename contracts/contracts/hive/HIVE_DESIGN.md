> **Historical design notes.** Addresses below are from an earlier Sepolia deployment. Current v4 addresses are in the root README and `contracts/deploy-v4.json`.

# Coprocessor (Zamies Hive) — design notes (build/test only, not deployed)

Contracts: `ZamiesHive.sol` (Seal & Earn + Confidential Yield Pool), `ZamiesMarketV3.sol` (market). Tests: `test/hive.js` (+ `test/Mocks.sol`). Works on the existing NFT 0xb334… without redeploying it.

- Seal & Earn is a flag in the Hive; MarketV3 rejects list / makeOffer / acceptOffer for sealed ids. The NFT stays in the holder's wallet so the Encrypted Balance can follow it (requirement 2). P2P ERC-721 transfers and other marketplaces cannot be blocked without an NFT redeploy (an `_update` hook); a strict lock would contradict "rewards move with the NFT".
- Split is constants in MarketV3 (ROYALTY 250, HOLDERS 400 bps (2.5% treasury, 4% Confidential Yield Pool = 6.5%; seller 93.5%). Burn Gateway removed), treasury immutable, no fee setter. Royalty is fixed in the market (does not read ERC-2981), so NFT `setRoyalty` does not change market payouts.
- Pool accounting: plaintext accumulator (`accPerWeight`, 1e18) because sale prices are public anyway; per-token pending is an encrypted euint64 updated with `FHE.add`, ACL only to current `ownerOf`. Rewards arriving with zero sealed weight are held in `undistributed` and credited on the next seal.
- Ciphertext Tracks: `FHE.randEuint8(4)` per sealed cube, owner-decryptable. Per-track pools are NOT implemented: they need per-track total weight, which would be encrypted, and FHE cannot divide by an encrypted value. Options: public tracks, or encrypted per-track counters + periodic public decryption.
- Royal Handle Boost: `IQueenRegistry` hook, settable once; weight 125 vs 100; `poke(id)` re-evaluates.
- Approvals: OZ 5 ERC-721 clears per-token approval on every transfer (tested). Operator approvals (`setApprovalForAll`) belong to the holder and cannot be cleared by third parties; sealed tokens are protected because MarketV3 refuses them, but other operators remain the holder's responsibility.
- Relayer Streaks (Hunger Streaks): next phase.

Gas (hardhat mock; Sepolia real coprocessor costs differ): deploy Hive 1.33M, MarketV3 2.45M, sealAndEarn 435k, sync 211k, claim 749k, buy 1.02M, finalizePurchase with split 2.47M. Bytecode: Hive 5.4KB, MarketV3 10.6KB.

## Cipherweight (1.25× pool weight)
- Contract: `CipherweightRegistry.sol` — Sepolia `0x4D92826473A19500c1E04aCc97E5Fa70C387Aaeb`, owner = treasury.
- Implements the Hive hook `isQueenHolder(address)` (ABI name kept for compatibility; means "has Cipherweight").
- Qualifies if `nft.balanceOf(a) >= minBalance` (3) OR `relayerStreaks.streakOf(a) >= minStreak` (3).
- Owner can `setThresholds(b, s)` (testnet tuning) and `freeze()` to lock them forever.
- Weight is computed at `sealAndEarn`, and recomputed by anyone via `hive.poke(id)` (up or down).
- **Not linked yet.** Goes live only after the owner calls `hive.setQueenRegistry(0x4D92…Aaeb)` — one shot, irreversible.

## Relayer Streaks
- Contract: `RelayerStreaks.sol` — Sepolia `0xA5D51730838B8c9635cAf5ae806DAdEcF1237155`, owner = treasury.
- `checkIn()` requires holding ≥1 Zamies. Next check-in allowed after 20h (MIN_GAP); after 48h (MAX_GAP) the streak resets to 1.
- `streakOf` returns the live streak (0 once the 48h window lapses); `bestStreakOf`, `lastCheckInOf` views. Emits `CheckedIn(user, streak, ts)`.
