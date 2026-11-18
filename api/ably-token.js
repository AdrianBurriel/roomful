// Vercel function: hands each visitor a short-lived Ably token request.
// The secret ABLY_API_KEY never reaches the browser; tokens can only use the
// "roomful:*" channels and are bound to the visitor's connection id.
//
// Environment variables (Vercel → Project → Settings → Environment Variables):
//   ABLY_API_KEY     Ably API key ("appId.keyId:secret")                 required
//   ALLOWED_ORIGINS  Sites allowed to ask for tokens, comma-separated     optional
//                    e.g. https://roomful.vercel.app,https://roomful.com
//                    Unset: only pages served from this same site get tokens.
import * as AblyModule from "ably";

const Ably = AblyModule.default || AblyModule;

const CLIENT_ID_RE = /^[a-z0-9]{8,40}$/;
const CHANNELS = "roomful:*";

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

function allowedSite(req) {
  const from = originOf(req.headers.origin || req.headers.referer || "");
  const allowed = (process.env.ALLOWED_ORIGINS || "")
    .split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean);
  if (allowed.length) return allowed.includes(from);
  // Default: same site only. Browsers mark their own requests with
  // Sec-Fetch-Site; older ones still send a Referer from this host.
  if (req.headers["sec-fetch-site"] === "same-origin") return true;
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  return !!from && !!host && new URL(from).host === host;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const key = process.env.ABLY_API_KEY;
  if (!key) return res.status(500).json({ error: "ABLY_API_KEY is not set" });
  if (!allowedSite(req)) return res.status(403).json({ error: "Origin not allowed" });

  const clientId = String(req.query.clientId || "");
  if (!CLIENT_ID_RE.test(clientId)) return res.status(400).json({ error: "Invalid clientId" });

  try {
    const rest = new Ably.Rest({ key });
    const tokenRequest = await rest.auth.createTokenRequest({
      clientId,
      capability: { [CHANNELS]: ["subscribe", "publish", "presence"] },
      ttl: 60 * 60 * 1000,
    });
    return res.status(200).json(tokenRequest);
  } catch (err) {
    return res.status(500).json({ error: "Could not create the token" });
  }
}
