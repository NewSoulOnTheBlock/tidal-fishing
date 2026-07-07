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

function backendPath(req) {
  const path = req.query?.path;
  if (typeof path !== "string" || !path.startsWith("/api/")) {
    return null;
  }
  return path;
}

function forwardHeaders(req) {
  const headers = {};
  for (const [key, value] of Object.entries(req.headers || {})) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower)) continue;
    if (lower === "x-bfb-internal-secret") continue;
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

function responseHeaders(upstreamHeaders) {
  const headers = {};
  upstreamHeaders.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower)) return;
    if (lower === "access-control-allow-origin") return;
    if (lower === "access-control-allow-credentials") return;
    headers[key] = value;
  });
  headers["Cache-Control"] = headers["Cache-Control"] || "no-store";
  return headers;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  const path = backendPath(req);
  if (!path) return res.status(400).json({ error: "Backend API path required", code: "BAD_BACKEND_PATH" });

  const base = (process.env.RENDER_API_BASE || DEFAULT_RENDER_API_BASE).replace(/\/+$/, "");
  const query = { ...(req.query || {}) };
  delete query.path;
  const qs = new URLSearchParams(query).toString();
  const url = `${base}${path}${qs ? `?${qs}` : ""}`;

  try {
    const method = req.method || "GET";
    const hasBody = !["GET", "HEAD"].includes(method.toUpperCase());
    const upstream = await fetch(url, {
      method,
      headers: forwardHeaders(req),
      body: hasBody ? await readBody(req) : undefined,
      redirect: "manual",
    });

    const contentType = upstream.headers.get("content-type") || "";
    const headers = responseHeaders(upstream.headers);
    res.status(upstream.status);
    for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
    if (contentType.includes("application/json") || contentType.startsWith("text/")) {
      res.send(await upstream.text());
    } else {
      res.send(Buffer.from(await upstream.arrayBuffer()));
    }
  } catch (error) {
    console.error("[backend-proxy] request failed:", error?.message || error);
    res.status(502).json({ error: "Backend proxy failed", code: "BACKEND_PROXY_FAILED" });
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};
