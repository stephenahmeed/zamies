// Zamies relayer proxy core. Framework-agnostic: takes a Web `Request`, returns a Web `Response`.
// Browser -> https://<proxy>/api/relayer/<chainId>/<route>  ->  <upstream relayer>/v2/<route>  (+ x-api-key)
// The SDK's relayerUrl is set to https://<proxy>/api/relayer/<chainId>; the SDK appends /keyurl, /input-proof,
// /public-decrypt, /user-decrypt, /delegated-user-decrypt and polls /<route>/<jobId>.

export const UPSTREAMS = {
  1: "https://relayer.mainnet.zama.org/v2",        // Ethereum mainnet (API key required)
  11155111: "https://relayer.testnet.zama.org/v2", // Sepolia (open, no key needed)
};

const ROUTE_RE = /^(keyurl|input-proof|public-decrypt|user-decrypt|delegated-user-decrypt)(?:\/([A-Za-z0-9_-]{1,128}))?$/;
const POST_ROUTES = new Set(["input-proof", "public-decrypt", "user-decrypt", "delegated-user-decrypt"]);
const ALLOW_HEADERS = "content-type, zama-sdk-version, zama-sdk-name";
const PASS_REQ_HEADERS = ["content-type", "zama-sdk-version", "zama-sdk-name"];
const PASS_RES_HEADERS = ["content-type", "retry-after", "x-request-id"];

export function loadConfig(env = process.env) {
  const list = (v, d) => (v ?? d).split(",").map(s => s.trim()).filter(Boolean);
  const chains = list(env.ENABLED_CHAINS, "11155111,1").map(Number).filter(c => UPSTREAMS[c] || env[`RELAYER_UPSTREAM_${c}`]);
  const upstreams = {};
  for (const c of chains) upstreams[c] = (env[`RELAYER_UPSTREAM_${c}`] || UPSTREAMS[c]).replace(/\/+$/, "");
  return {
    origins: list(env.ALLOWED_ORIGINS, "https://zamies-x.vercel.app"),
    requireOrigin: env.REQUIRE_ORIGIN !== "false",
    apiKey: env.ZAMA_RELAYER_API_KEY || "",
    // Chains whose upstream needs the key. Sepolia's relayer is open, so the key is only sent to mainnet by default.
    keyedChains: new Set(list(env.KEYED_CHAINS, "1").map(Number)),
    upstreams,
    ratePerMin: Number(env.RATE_LIMIT_PER_MIN || 300),
    maxBody: Number(env.MAX_BODY_BYTES || 2 * 1024 * 1024),
    timeoutMs: Number(env.UPSTREAM_TIMEOUT_MS || 25000),
    upstash: env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
      ? { url: env.UPSTASH_REDIS_REST_URL.replace(/\/+$/, ""), token: env.UPSTASH_REDIS_REST_TOKEN } : null,
  };
}

// ---------- rate limiting (fixed 60s window per client IP) ----------
// In-memory is per serverless instance (best effort). Set UPSTASH_REDIS_REST_URL/TOKEN for a shared limit,
// and/or add a Vercel Firewall rate-limit rule on /api/relayer for edge enforcement.
export function memoryLimiter(now = () => Date.now()) {
  const hits = new Map();
  return async (key, limit) => {
    const win = Math.floor(now() / 60000);
    if (hits.size > 50000) hits.clear();
    const k = `${key}:${win}`;
    const n = (hits.get(k) || 0) + 1;
    hits.set(k, n);
    for (const old of hits.keys()) { if (!old.endsWith(`:${win}`)) hits.delete(old); else break; }
    return { ok: n <= limit, remaining: Math.max(0, limit - n), reset: (win + 1) * 60 - Math.floor(now() / 1000) };
  };
}

export function upstashLimiter({ url, token }, fetchImpl = fetch, now = () => Date.now()) {
  return async (key, limit) => {
    const win = Math.floor(now() / 60000);
    const k = `zrp:${key}:${win}`;
    try {
      const r = await fetchImpl(`${url}/pipeline`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify([["INCR", k], ["EXPIRE", k, "120"]]),
      });
      const j = await r.json();
      const n = Number(j?.[0]?.result ?? 0);
      return { ok: n <= limit, remaining: Math.max(0, limit - n), reset: (win + 1) * 60 - Math.floor(now() / 1000) };
    } catch {
      return { ok: true, remaining: limit, reset: 60 }; // fail open on limiter outage; upstream still has its own limits
    }
  };
}

function clientIp(req) {
  // Vercel sets x-forwarded-for to the real client IP (it overwrites any client-supplied value).
  const xff = req.headers.get("x-forwarded-for");
  return (xff ? xff.split(",")[0] : req.headers.get("x-real-ip") || "unknown").trim();
}

function corsHeaders(origin) {
  const h = new Headers({ vary: "Origin" });
  if (origin) {
    h.set("access-control-allow-origin", origin);
    h.set("access-control-allow-methods", "GET, POST, OPTIONS");
    h.set("access-control-allow-headers", ALLOW_HEADERS);
    h.set("access-control-expose-headers", "Retry-After, X-Request-Id, X-RateLimit-Remaining");
    h.set("access-control-max-age", "600");
  }
  return h;
}

function json(status, obj, headers) {
  const h = new Headers(headers);
  h.set("content-type", "application/json");
  h.set("cache-control", "no-store");
  return new Response(JSON.stringify(obj), { status, headers: h });
}

/** Parse /api/relayer/<chain>/<route...> (also accepts the rewritten form ?__chain=&__path=). */
export function parseTarget(urlStr) {
  const u = new URL(urlStr);
  let chain = u.searchParams.get("__chain");
  let path = u.searchParams.get("__path");
  if (chain == null) {
    const m = u.pathname.match(/^\/api\/relayer\/(\d+)\/(.+)$/);
    if (!m) return null;
    chain = m[1]; path = m[2];
  }
  u.searchParams.delete("__chain"); u.searchParams.delete("__path");
  return { chain: Number(chain), path: decodeURIComponent(path || "").replace(/^\/+|\/+$/g, ""), search: u.search };
}

export function createHandler(cfg = loadConfig(), deps = {}) {
  const fetchImpl = deps.fetch || fetch;
  const limiter = deps.limiter || (cfg.upstash ? upstashLimiter(cfg.upstash, fetchImpl) : memoryLimiter());

  return async function handle(req) {
    const origin = req.headers.get("origin");
    const allowed = origin && cfg.origins.includes(origin);
    if (origin && !allowed) return json(403, { error: "origin not allowed" }, new Headers({ vary: "Origin" }));
    if (!origin && cfg.requireOrigin) return json(403, { error: "origin required" });
    const cors = corsHeaders(allowed ? origin : null);

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "GET" && req.method !== "POST") return json(405, { error: "method not allowed" }, cors);

    const t = parseTarget(req.url);
    const upstream = t && cfg.upstreams[t.chain];
    if (!upstream) return json(404, { error: "unsupported chain" }, cors);
    const m = t.path.match(ROUTE_RE);
    if (!m) return json(404, { error: "unknown relayer route" }, cors);
    const [, route, jobId] = m;
    const okMethod = req.method === "GET" ? (route === "keyurl" ? !jobId : !!jobId) : (POST_ROUTES.has(route) && !jobId);
    if (!okMethod) return json(405, { error: "method not allowed for route" }, cors);

    const needsKey = cfg.keyedChains.has(t.chain);
    if (needsKey && !cfg.apiKey) return json(503, { error: "relayer API key not configured" }, cors);

    const rl = await limiter(clientIp(req), cfg.ratePerMin);
    cors.set("x-ratelimit-remaining", String(rl.remaining));
    if (!rl.ok) { cors.set("retry-after", String(Math.max(1, rl.reset))); return json(429, { error: "rate limited" }, cors); }

    let body;
    if (req.method === "POST") {
      const len = Number(req.headers.get("content-length") || 0);
      if (len > cfg.maxBody) return json(413, { error: "body too large" }, cors);
      const buf = new Uint8Array(await req.arrayBuffer());
      if (buf.byteLength > cfg.maxBody) return json(413, { error: "body too large" }, cors);
      body = buf;
    }

    const headers = new Headers();
    for (const k of PASS_REQ_HEADERS) { const v = req.headers.get(k); if (v) headers.set(k, v); }
    if (req.method === "POST" && !headers.has("content-type")) headers.set("content-type", "application/json");
    if (needsKey) headers.set("x-api-key", cfg.apiKey); // server-side only, never returned to the client

    const target = `${upstream}/${route}${jobId ? "/" + jobId : ""}${t.search}`;
    let up;
    try {
      up = await fetchImpl(target, { method: req.method, headers, body, signal: AbortSignal.timeout(cfg.timeoutMs), redirect: "error" });
    } catch (e) {
      return json(502, { error: "upstream unavailable" }, cors);
    }
    const out = new Headers(cors);
    for (const k of PASS_RES_HEADERS) { const v = up.headers.get(k); if (v) out.set(k, v); }
    out.set("cache-control", "no-store");
    return new Response(await up.arrayBuffer(), { status: up.status, headers: out });
  };
}
