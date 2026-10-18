// Local dev server: node server.js  (PORT=8787). Same handler as the Vercel function.
import http from "node:http";
import { createHandler, loadConfig } from "./lib/proxy.js";

export function nodeAdapter(handle) {
  return async (req, res) => {
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (v != null) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
      if (!headers.has("x-forwarded-for")) headers.set("x-forwarded-for", req.socket.remoteAddress || "local");
      const r = await handle(new Request(`http://${req.headers.host || "localhost"}${req.url}`, {
        method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body,
      }));
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch (e) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "proxy error" }));
    }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 8787);
  http.createServer(nodeAdapter(createHandler(loadConfig(process.env)))).listen(port, () =>
    console.log(`zamies relayer proxy on http://localhost:${port}/api/relayer/<chainId>`));
}
