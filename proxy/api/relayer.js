// Vercel Function (Node.js runtime, Web Request/Response signature).
// Routed by vercel.json: /api/relayer/:chain/:path* -> /api/relayer?__chain=:chain&__path=:path*
import { createHandler, loadConfig } from "../lib/proxy.js";

const handle = createHandler(loadConfig(process.env));
export const GET = handle;
export const POST = handle;
export const OPTIONS = handle;
