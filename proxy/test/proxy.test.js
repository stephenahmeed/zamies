import test from "node:test";
import assert from "node:assert/strict";
import { createHandler, loadConfig, memoryLimiter, parseTarget } from "../lib/proxy.js";

const O = "https://zamies-x.vercel.app";
function setup(env = {}, limiter) {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ ok: true, url }), { status: 202, headers: { "content-type": "application/json", "retry-after": "3", "x-secret": "no" } });
  };
  const cfg = loadConfig({ ZAMA_RELAYER_API_KEY: "KEY123", ...env });
  return { calls, h: createHandler(cfg, { fetch: fakeFetch, limiter }) };
}
const req = (path, init = {}) => new Request(`https://proxy.example${path}`, { ...init, headers: { origin: O, "x-forwarded-for": "1.2.3.4", ...(init.headers || {}) } });

test("mainnet: injects x-api-key server-side and maps to /v2/<route>", async () => {
  const { h, calls } = setup();
  const r = await h(req("/api/relayer/1/public-decrypt", { method: "POST", body: '{"a":1}', headers: { "content-type": "application/json", "zama-sdk-version": "0.4.5", "x-api-key": "client-attempt" } }));
  assert.equal(r.status, 202);
  assert.equal(calls[0].url, "https://relayer.mainnet.zama.org/v2/public-decrypt");
  assert.equal(calls[0].init.headers.get("x-api-key"), "KEY123");
  assert.equal(calls[0].init.headers.get("zama-sdk-version"), "0.4.5");
  assert.equal(new TextDecoder().decode(calls[0].init.body), '{"a":1}');
  assert.equal(r.headers.get("retry-after"), "3");
  assert.equal(r.headers.get("x-secret"), null);
  assert.equal(r.headers.get("access-control-allow-origin"), O);
  assert.match(r.headers.get("access-control-expose-headers"), /Retry-After/);
  assert.ok(!(await r.text()).includes("KEY123"));
});

test("sepolia: forwarded to testnet relayer without the key; job polling GET works", async () => {
  const { h, calls } = setup();
  const r = await h(req("/api/relayer/11155111/public-decrypt/abc-123_x"));
  assert.equal(r.status, 202);
  assert.equal(calls[0].url, "https://relayer.testnet.zama.org/v2/public-decrypt/abc-123_x");
  assert.equal(calls[0].init.headers.get("x-api-key"), null);
  await h(req("/api/relayer/11155111/keyurl"));
  assert.equal(calls[1].url, "https://relayer.testnet.zama.org/v2/keyurl");
});

test("rewritten form (?__chain=&__path=) is parsed the same", async () => {
  const t = parseTarget("https://p/api/relayer?__chain=1&__path=user-decrypt%2Fjob1");
  assert.deepEqual(t, { chain: 1, path: "user-decrypt/job1", search: "" });
  const { h, calls } = setup();
  await h(req("/api/relayer?__chain=1&__path=user-decrypt/job1"));
  assert.equal(calls[0].url, "https://relayer.mainnet.zama.org/v2/user-decrypt/job1");
});

test("CORS: other origins and missing origin are rejected; preflight allowed", async () => {
  const { h, calls } = setup();
  let r = await h(new Request("https://p/api/relayer/1/keyurl", { headers: { origin: "https://evil.example" } }));
  assert.equal(r.status, 403); assert.equal(r.headers.get("access-control-allow-origin"), null);
  r = await h(new Request("https://p/api/relayer/1/keyurl"));
  assert.equal(r.status, 403);
  r = await h(req("/api/relayer/1/input-proof", { method: "OPTIONS" }));
  assert.equal(r.status, 204);
  assert.match(r.headers.get("access-control-allow-headers"), /zama-sdk-name/);
  assert.equal(calls.length, 0);
  const s2 = setup({ REQUIRE_ORIGIN: "false" });
  r = await s2.h(new Request("https://p/api/relayer/11155111/keyurl"));
  assert.equal(r.status, 202);
});

test("only relayer routes/methods/chains are proxied", async () => {
  const { h, calls } = setup();
  for (const [p, m, s] of [["/api/relayer/1/admin", "GET", 404], ["/api/relayer/1/../secret", "GET", 404], ["/api/relayer/5/keyurl", "GET", 404],
    ["/api/relayer/1/keyurl", "POST", 405], ["/api/relayer/1/public-decrypt", "GET", 405], ["/api/relayer/1/public-decrypt/j1", "POST", 405], ["/api/relayer/1/keyurl", "PUT", 405]]) {
    const r = await h(req(p, { method: m, body: m === "GET" ? undefined : "{}" }));
    assert.equal(r.status, s, `${m} ${p}`);
  }
  assert.equal(calls.length, 0);
});

test("mainnet without a key returns 503 instead of calling upstream", async () => {
  const { h, calls } = setup({ ZAMA_RELAYER_API_KEY: "" });
  const r = await h(req("/api/relayer/1/keyurl"));
  assert.equal(r.status, 503); assert.equal(calls.length, 0);
});

test("rate limit per IP per minute", async () => {
  let t = 0; const lim = memoryLimiter(() => t);
  const { h, calls } = setup({ RATE_LIMIT_PER_MIN: "3" }, lim);
  for (let i = 0; i < 3; i++) assert.equal((await h(req("/api/relayer/11155111/keyurl"))).status, 202);
  const r = await h(req("/api/relayer/11155111/keyurl"));
  assert.equal(r.status, 429); assert.ok(Number(r.headers.get("retry-after")) >= 1);
  assert.equal((await h(req("/api/relayer/11155111/keyurl", { headers: { "x-forwarded-for": "9.9.9.9" } }))).status, 202);
  t = 61000; assert.equal((await h(req("/api/relayer/11155111/keyurl"))).status, 202);
  assert.equal(calls.length, 5);
});

test("body size limit", async () => {
  const { h, calls } = setup({ MAX_BODY_BYTES: "10" });
  const r = await h(req("/api/relayer/1/input-proof", { method: "POST", body: "x".repeat(11) }));
  assert.equal(r.status, 413); assert.equal(calls.length, 0);
});

test("upstream failure -> 502 without leaking details", async () => {
  const cfg = loadConfig({ ZAMA_RELAYER_API_KEY: "KEY123" });
  const h = createHandler(cfg, { fetch: async () => { throw new Error("boom KEY123"); } });
  const r = await h(req("/api/relayer/1/keyurl"));
  assert.equal(r.status, 502); assert.ok(!(await r.text()).includes("KEY123"));
});
