# Zamies — First Confidential NFT Yield Pool on @zama

This project is unaudited and independently built by a community developer. It is not audited, endorsed or operated by Zama. Use at your own risk.

Zamies is a 4,444-piece confidential NFT collection built on [Zama](https://zama.ai) FHEVM.
Every cube's art and traits come from an **FHE-encrypted on-chain seed** that only its current
holder can decrypt. Trading, rewards and payments settle in **cZAMA**, Zama's confidential
ERC-7984 token.

- **Live site:** https://zamies-x.vercel.app
- **X:** https://x.com/ZamiesFHE
- **Network:** Ethereum Sepolia testnet (chainId 11155111). Test tokens only, no real value.

> ⚠️ Testnet software. The contracts have **not been audited**. Do not use with real funds.

## Features

- **Encrypted cubes** — 4,444 ERC-721 cubes (ERC-2981 royalties). #1–#44 are the team reserve,
  #45–#4,444 are the public mint at 20 cZAMA, max 10 per wallet. Payment is an encrypted cZAMA
  transfer; only a paid / not-paid flag is publicly decrypted by the Zama KMS before minting.
- **Decrypt** — the holder privately decrypts their cube's seed in the browser with an EIP-712
  signature (free, nothing on-chain). On transfer, access moves to the new holder.
- **Reveal** — the holder can call `publish(id)` at any time to make the seed publicly decryptable.
  Permanent: art and full traits become public and the cube is tagged **REVEALED**. Gas only.
- **Confidential Market** (`ZamiesMarketV3`) — list, update price, cancel, buy and offers, settled
  in cZAMA. Seller fee 6.5%: 2% treasury, 4% Confidential Yield Pool, 0.5% Burn Pool.
  Listing prices and offer amounts are public on-chain.
- **Seal & Earn / Confidential Yield Pool** (`ZamiesHive`) — seal a cube to earn a weighted share of
  the 4% market fee. Each sealed cube holds an encrypted reward balance (FHE `euint64`) that follows
  the NFT; only the current holder can decrypt and `claim` it. Sealing is irreversible and sealed
  cubes cannot be listed on the Zamies market.
- **Burn Pool** — 0.5% of every sale accumulates to buy the cheapest listed cube and burn it for good.
- **Cipherweight** (`CipherweightRegistry`) — holders with ≥3 cubes or a Relayer Streak ≥3 get a
  1.25× pool weight for their sealed cubes.
- **Relayer Streaks** (`RelayerStreaks`) — daily on-chain check-in for holders (next check-in after
  20h, streak resets after 48h).

## Sepolia deployment (v4)

| Contract | Address |
|---|---|
| Zamies NFT | [`0xb061a6337f1E6113F428539b832Fd1Db7347c9b0`](https://sepolia.etherscan.io/address/0xb061a6337f1E6113F428539b832Fd1Db7347c9b0) |
| ZamiesMarketV3 (Confidential Market) | [`0x50Ad91dA587952674549c00cB76D287CaD93641E`](https://sepolia.etherscan.io/address/0x50Ad91dA587952674549c00cB76D287CaD93641E) |
| ZamiesHive (Seal & Earn / Yield Pool) | [`0x30cFcdfd5dd8f398E37C390d21fd7B01038dF57f`](https://sepolia.etherscan.io/address/0x30cFcdfd5dd8f398E37C390d21fd7B01038dF57f) |
| CipherweightRegistry | [`0x63fB659856c96fc240c8649114e26a634b09c62a`](https://sepolia.etherscan.io/address/0x63fB659856c96fc240c8649114e26a634b09c62a) |
| RelayerStreaks | [`0x10313c712855aec43814dC89313e1Dc22FC72958`](https://sepolia.etherscan.io/address/0x10313c712855aec43814dC89313e1Dc22FC72958) |
| cZAMA (payment token, 6 decimals) | [`0xf2D628d2598aF4eAF94CB76a437Ff86CA78FfbFB`](https://sepolia.etherscan.io/address/0xf2D628d2598aF4eAF94CB76a437Ff86CA78FfbFB) |

Deployment transaction hashes are recorded in [`contracts/deploy-v4.json`](contracts/deploy-v4.json).

## Repository layout

```
contracts/   Hardhat project (Solidity 0.8.27, @fhevm/solidity, OpenZeppelin confidential contracts)
  contracts/   Zamies.sol, ZamiesMarketV2.sol, hive/ (ZamiesHive, ZamiesMarketV3, CipherweightRegistry, RelayerStreaks), Mocks.sol
  test/        Hardhat tests using the FHEVM mock (@fhevm/hardhat-plugin)
  scripts/     deploy-v4.cjs (Sepolia deploy), e2e.cjs (Reveal end-to-end check)
site/        Static site deployed on Vercel (index.html, app.js, chain.js, Zama relayer SDK in sdk/)
```

## Setup

Requirements: Node.js 20+.

```bash
cd contracts
npm ci --legacy-peer-deps
npx hardhat test
```

`--legacy-peer-deps` is needed because `@openzeppelin/confidential-contracts` declares an older
`@fhevm/solidity` peer (a `.npmrc` with this setting is included).

### Deploying to Sepolia

Keys are read from environment variables only — never commit them.

```bash
cp ../.env.example .env        # fill in a FRESH Sepolia-only test wallet
export $(grep -v '^#' .env | xargs)
npx hardhat compile
npm run deploy:sepolia         # writes addresses + tx hashes to deploy-v4.json
```

### Site

`site/` is plain static HTML/JS with no build step. Serve it locally with any static server
(e.g. `npx serve site`) or deploy the folder to Vercel. Contract addresses live in `site/chain.js`.

## License

[MIT](LICENSE) © 2026 Ox Stephen
