# Zamies Relayer Proxy

Small backend proxy for the [Zama Relayer](https://docs.zama.org/protocol/sdk/guides/relayer-api-keys).
The browser SDK talks to this proxy; the proxy forwards to the Zama-hosted relayer and adds the
`x-api-key` header **server-side**, so the API key never reaches the frontend.

```
browser SDK ──> https://<proxy>/api/relayer/<chainId>/<route>  ──>  <relayer>/v2/<route>   (+ x-api-key on mainnet)
```

| chainId | upstream | key sent |
|---|---|---|
| `1` (Ethereum mainnet) | `https://relayer.mainnet.zama.org/v2` | yes (`ZAMA_RELAYER_API_KEY`) |
| `11155111` (Sepolia) | `https://relayer.testnet.zama.org/v2` | no (testnet relayer is open) |

Proxied routes only: `GET keyurl`, `POST input-proof | public-decrypt | user-decrypt | delegated-user-decrypt`,
and `GET <route>/<jobId>` (v2 async job polling). Everything else is 404/405.

## Protection
- **API key** only from env `ZAMA_RELAYER_API_KEY`; any client-supplied `x-api-key` is dropped. Mainnet requests
  return 503 if no key is configured.
- **CORS** restricted to `ALLOWED_ORIGINS` (default `https://zamies-x.vercel.app`); other origins get 403.
  Requests without an `Origin` header are rejected by default (`REQUIRE_ORIGIN=true`). Note: Origin can be spoofed
  by non-browser clients, so CORS is not authentication; the rate limit and route allowlist still apply.
- **Rate limit** per client IP, fixed 60 s window (`RATE_LIMIT_PER_MIN`, default 300). In-memory per serverless
  instance by default; set `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` for a shared limit. For
  production also add a Vercel Firewall rate-limit rule on `/api/relayer`.
- Body size cap (`MAX_BODY_BYTES`, 2 MB), upstream timeout, only `content-type`, `retry-after`, `x-request-id`
  response headers passed through (`Retry-After` is exposed to the browser; the SDK needs it for job polling).

## Site wiring
In the site's `config.js` set:
```js
window.ZAMIES_CONFIG = Object.freeze({ relayerUrl: "https://<proxy>/api/relayer/1" });
```
`relayerUrl: null` keeps the SDK default (Sepolia's open relayer), which is what the Sepolia site uses today.

## Run / test
```bash
npm test                      # node --test, no dependencies
REQUIRE_ORIGIN=false node server.js   # local: http://localhost:8787/api/relayer/<chainId>
```
Verified locally against the live Sepolia relayer with `@zama-fhe/relayer-sdk` 0.4.5 (Node and Chrome):
public decrypt of Zamies #44 through the proxy returns the same value as the direct relayer.

## Deploy (Vercel)
```bash
vercel                       # preview
vercel env add ZAMA_RELAYER_API_KEY production   # only once Zama issues the key
vercel env add ALLOWED_ORIGINS production
vercel --prod
```
`vercel.json` rewrites `/api/relayer/:chain/:path*` to the single function `api/relayer.js`.
Never commit `.env` or the key. If the key leaks: rotate via Zama (support@zama.org) and replace the env var.
