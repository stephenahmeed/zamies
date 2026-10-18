// Zamies site runtime config.
// relayerUrl: null = use the Zama SDK's built-in relayer for the network (Sepolia testnet relayer is open, no key).
// For mainnet, point it at the backend proxy so the Zama Relayer API key stays server-side, e.g.
//   relayerUrl: "https://<your-proxy>.vercel.app/api/relayer/1"        (Ethereum mainnet)
//   relayerUrl: "https://<your-proxy>.vercel.app/api/relayer/11155111" (Sepolia through the proxy, for testing)
window.ZAMIES_CONFIG = Object.freeze({
  relayerUrl: null,
});
