// Vercel function: the shared board, stored in Upstash Redis.
//
//   GET  /api/board?uid=<browser id>&rev=<n>
//        → { rev, total, cap, ink: { left, max, resetAt }, items? }
//          (items only when the board changed since `rev`)
//   POST /api/board  { uid, item }
//        → 200 { rev, ink, ... }   429 { error: "no-ink", ink }   400 / 403 / 503
//
// Every visitor has an amount of ink that refills every 3 hours (per browser id,
// and a looser cap per IP). When the ink on the board goes over its capacity, the oldest drawings are
// erased until it fits again; the newest one always stays. The same rules live
// in server.py, for running without Vercel. Keep both in sync.
//
// Environment variables (added by Vercel when you connect Upstash under
// Project → Storage): KV_REST_API_URL + KV_REST_API_TOKEN, or
// UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN. Optional: ALLOWED_ORIGINS,
// as in ably-token.js.
import crypto from "node:crypto";

export const BOARD = {
  W: 1600, H: 1000,          // board coordinates (the canvas scales them)
  INK_PERIOD_H: 3,           // the ink refills every 3 hours (at 00, 03, 06… UTC)
  INK_PER_PERIOD: 5000,      // per browser: ~3 long strokes or ~10 short ones
  INK_PER_IP: 25000,         // per IP and period (people sharing a network)
  CAPACITY: 60000,           // ink on the board before the oldest gets erased
  MAX_ITEMS: 300,
  MAX_POINTS: 600,
  MAX_TEXT: 60,
  WIDTHS: [3, 9],            // thin and thick pen (thick costs double)
  TEXT_SIZE: 40,
  TEXT_COST: 40,             // ink per character
};

const UID_RE = /^[a-z0-9]{8,32}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const K = { items: "board:items", costs: "board:costs", total: "board:total", rev: "board:rev" };

// Validates a drawing and returns { item, cost }, or null.
export function cleanItem(raw) {
  if (!raw || typeof raw !== "object" || !COLOR_RE.test(raw.c || "")) return null;
  const c = raw.c.toUpperCase();
  // Who drew it (shown on hover): the visitor's Roomful name, optional
  const n = typeof raw.n === "string" ? raw.n.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 32) : "";
  if (raw.k === "s") {
    const p = raw.p, w = raw.w;
    if (!BOARD.WIDTHS.includes(w) || !Array.isArray(p) || p.length < 4 || p.length > BOARD.MAX_POINTS * 2 || p.length % 2) return null;
    let len = 0;
    for (let i = 0; i < p.length; i++) {
      const v = p[i], max = i % 2 ? BOARD.H : BOARD.W;
      if (!Number.isInteger(v) || v < 0 || v > max) return null;
      if (i >= 2 && i % 2) len += Math.hypot(p[i - 1] - p[i - 3], v - p[i - 2]);
    }
    const cost = Math.max(20, Math.round(len * (w === BOARD.WIDTHS[1] ? 2 : 1)));
    return { item: { k: "s", c, ...(n ? { n } : {}), w, p }, cost };
  }
  if (raw.k === "t") {
    const t = typeof raw.t === "string" ? raw.t.replace(/[\u0000-\u001f\u007f]/g, "").trim() : "";
    const { x, y } = raw;
    if (!t || t.length > BOARD.MAX_TEXT || !Number.isInteger(x) || !Number.isInteger(y) ||
        x < 0 || x > BOARD.W || y < 0 || y > BOARD.H) return null;
    return { item: { k: "t", c, ...(n ? { n } : {}), x, y, t }, cost: [...t].length * BOARD.TEXT_COST };
  }
  return null;
}

const PERIOD_MS = BOARD.INK_PERIOD_H * 3600 * 1000;
function period() { return Math.floor(Date.now() / PERIOD_MS); }       // the current ink period
function resetAt() { return (period() + 1) * PERIOD_MS; }
function ink(used) {
  return { left: Math.max(0, BOARD.INK_PER_PERIOD - used), max: BOARD.INK_PER_PERIOD, resetAt: resetAt() };
}

function redisEnv() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}
async function pipeline(env, cmds) {
  const r = await fetch(env.url + "/pipeline", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.token, "Content-Type": "application/json" },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error("redis " + r.status);
  const out = await r.json();
  return out.map((x) => { if (x.error) throw new Error(x.error); return x.result; });
}

// Atomic: checks the ink, adds the drawing and erases the oldest ones if needed.
const ADD = `
local cost = tonumber(ARGV[2])
local u = tonumber(redis.call('GET', KEYS[5]) or '0')
local i = tonumber(redis.call('GET', KEYS[6]) or '0')
if u + cost > tonumber(ARGV[5]) or i + cost > tonumber(ARGV[6]) then return {-1, u} end
redis.call('INCRBY', KEYS[5], cost); redis.call('EXPIRE', KEYS[5], ARGV[7])
redis.call('INCRBY', KEYS[6], cost); redis.call('EXPIRE', KEYS[6], ARGV[7])
local rev = redis.call('INCR', KEYS[4])
redis.call('RPUSH', KEYS[1], '{"id":' .. rev .. ',' .. string.sub(ARGV[1], 2))
redis.call('RPUSH', KEYS[2], cost)
local total = redis.call('INCRBY', KEYS[3], cost)
local n = redis.call('LLEN', KEYS[1])
while (total > tonumber(ARGV[3]) or n > tonumber(ARGV[4])) and n > 1 do
  redis.call('LPOP', KEYS[1])
  total = redis.call('INCRBY', KEYS[3], -tonumber(redis.call('LPOP', KEYS[2]) or '0'))
  n = n - 1
end
return {rev, u + cost}`;

function originOf(url) { try { return new URL(url).origin; } catch { return ""; } }
function allowedSite(req) {
  const from = originOf(req.headers.origin || req.headers.referer || "");
  const allowed = (process.env.ALLOWED_ORIGINS || "")
    .split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean);
  if (allowed.length) return allowed.includes(from);
  if (req.headers["sec-fetch-site"] === "same-origin") return true;
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  return !!from && !!host && new URL(from).host === host;
}
function ipKey(req) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
  return crypto.createHash("sha256").update("roomful:" + ip).digest("hex").slice(0, 16);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const env = redisEnv();
  if (!env) return res.status(503).json({ error: "storage", detail: "Connect Upstash Redis to this project" });
  const d = period();

  try {
    if (req.method === "GET") {
      const uid = String(req.query.uid || "");
      const [rev, total, used] = await pipeline(env, [
        ["GET", K.rev], ["GET", K.total], ["GET", UID_RE.test(uid) ? `board:ink:${d}:${uid}` : "board:none"],
      ]);
      const out = { rev: +rev || 0, total: +total || 0, cap: BOARD.CAPACITY, ink: ink(+used || 0) };
      if (String(out.rev) !== String(req.query.rev)) {
        const [items] = await pipeline(env, [["LRANGE", K.items, 0, -1]]);
        out.items = (items || []).map((s) => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
      }
      return res.status(200).json(out);
    }

    if (req.method === "POST") {
      if (!allowedSite(req)) return res.status(403).json({ error: "origin" });
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const uid = String(body.uid || "");
      const clean = UID_RE.test(uid) && cleanItem(body.item);
      if (!clean) return res.status(400).json({ error: "invalid" });
      const keyU = `board:ink:${d}:${uid}`, keyI = `board:inkip:${d}:${ipKey(req)}`;
      const [result] = await pipeline(env, [[
        "EVAL", ADD, "6", K.items, K.costs, K.total, K.rev, keyU, keyI,
        JSON.stringify(clean.item), String(clean.cost), String(BOARD.CAPACITY), String(BOARD.MAX_ITEMS),
        String(BOARD.INK_PER_PERIOD), String(BOARD.INK_PER_IP), String(2 * PERIOD_MS / 1000),
      ]]);
      if (result[0] === -1) return res.status(429).json({ error: "no-ink", ink: ink(+result[1] || 0) });
      return res.status(200).json({ rev: result[0], cost: clean.cost, ink: ink(+result[1]) });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method" });
  } catch (err) {
    return res.status(502).json({ error: "storage" });
  }
}
