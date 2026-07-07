import https from "node:https";

const DEFAULT_RENDER_API_BASE = "https://tidal-fishing-d1sn.onrender.com";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const FIXED_ALLOWED_ORIGINS = new Set([
  "https://www.bullfishblitz.com",
  "https://bullfishblitz.com",
  "https://tidal-fishing.vercel.app",
]);

function isAllowedOrigin(origin) {
  if (!origin) return false;
  try {
    const { protocol, hostname } = new URL(origin);
    if (protocol !== "https:") return false;
    if (FIXED_ALLOWED_ORIGINS.has(origin)) return true;
    return hostname.endsWith(".ipfs.w3s.link") ||
      hostname.endsWith(".ipfs.dweb.link") ||
      hostname.endsWith(".ipfs.cf-ipfs.com") ||
      hostname === "ipfs.io" ||
      hostname === "cloudflare-ipfs.com";
  } catch {
    return false;
  }
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!isAllowedOrigin(origin)) return;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function backendPath(req) {
  const path = req.query?.path;
  if (typeof path !== "string" || !path.startsWith("/api/")) return null;
  return path;
}

function forwardHeaders(req) {
  const headers = {};
  for (const [key, value] of Object.entries(req.headers || {})) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower)) continue;
    if (lower === "x-bfb-internal-secret") continue;
    // Do not forward the public browser Origin/Referer from IPFS gateways to
    // Render. Render is private behind this proxy and authorizes the request via
    // x-bfb-internal-secret; forwarding arbitrary gateway origins trips Render's
    // browser-origin gate before the internal-secret path can complete.
    if (lower === "origin" || lower === "referer") continue;
    if (Array.isArray(value)) headers[key] = value.join(", ");
    else if (value !== undefined) headers[key] = String(value);
  }
  const secret = process.env.BFB_INTERNAL_API_SECRET;
  if (!secret) throw new Error("BFB_INTERNAL_API_SECRET is not configured");
  headers["x-bfb-internal-secret"] = secret;
  headers["x-forwarded-host"] = req.headers.host || "www.bullfishblitz.com";
  headers["x-forwarded-proto"] = "https";
  return headers;
}

function applyResponseHeaders(res, upstreamHeaders = {}) {
  for (const [key, value] of Object.entries(upstreamHeaders)) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower)) continue;
    if (lower === "access-control-allow-origin") continue;
    if (lower === "access-control-allow-credentials") continue;
    if (value !== undefined) res.setHeader(key, value);
  }
  if (!res.getHeader("cache-control")) res.setHeader("Cache-Control", "no-store");
}

export default function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") {
    return res.status(isAllowedOrigin(req.headers.origin) ? 204 : 403).end();
  }

  const path = backendPath(req);
  if (!path) return res.status(400).json({ error: "Backend API path required", code: "BAD_BACKEND_PATH" });

  const base = (process.env.RENDER_API_BASE || DEFAULT_RENDER_API_BASE).replace(/\/+$/, "");
  const query = { ...(req.query || {}) };
  delete query.path;
  const qs = new URLSearchParams(query).toString();
  const target = new URL(`${base}${path}${qs ? `?${qs}` : ""}`);

  let headers;
  try {
    headers = forwardHeaders(req);
  } catch (error) {
    console.error("[backend-proxy] config error:", error?.message || error);
    return res.status(502).json({ error: "Backend proxy not configured", code: "BACKEND_PROXY_CONFIG" });
  }

  const upstreamReq = https.request(
    target,
    {
      method: req.method || "GET",
      headers,
      timeout: 15000,
    },
    (upstreamRes) => {
      res.statusCode = upstreamRes.statusCode || 502;
      applyResponseHeaders(res, upstreamRes.headers);
      upstreamRes.pipe(res);
    }
  );

  upstreamReq.on("timeout", () => {
    upstreamReq.destroy(new Error("upstream timeout"));
  });
  upstreamReq.on("error", (error) => {
    console.error("[backend-proxy] request failed:", error?.message || error);
    if (!res.headersSent) res.status(502).json({ error: "Backend proxy failed", code: "BACKEND_PROXY_FAILED" });
    else res.end();
  });

  if (["GET", "HEAD"].includes(String(req.method || "GET").toUpperCase())) {
    upstreamReq.end();
  } else {
    req.pipe(upstreamReq);
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};
