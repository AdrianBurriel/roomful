#!/usr/bin/env python3
"""
Collaborative cursors server — zero dependencies (stdlib only, Python 3.8+).

- WebSocket relay at /ws?room=<room>: each client publishes its state (name,
  color, position, chat…) and the server forwards it to the rest of its room.
- Serves the static files in ./public (optional).
- /health returns the server status as JSON (for hosting health checks).

Environment variables:
  PORT             Port                                       (8080)
  HOST             Interface                                  (0.0.0.0)
  ALLOWED_ORIGINS  Allowed origins, comma-separated. Empty = any.
                   e.g. https://mysite.com,https://www.mysite.com
  MAX_PER_ROOM     Max users per room                         (100)
  MAX_CLIENTS      Max connections in total                   (5000)
  STATIC_DIR       Static files folder; "" to disable         (./public)
  BOARD_FILE       Where the shared board is saved; "" to disable (./board.json)

The shared board (GET/POST /api/board) follows the same rules as
api/board.js on Vercel: ink per browser and per IP that refills every 3 hours, and the oldest
drawings are erased when the board is full (the newest always stays).
"""
import asyncio
import base64
import hashlib
import itertools
import json
import mimetypes
import os
import re
import math
import struct
import time
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "8080"))
ALLOWED_ORIGINS = {o.strip().rstrip("/") for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()}
MAX_PER_ROOM = int(os.environ.get("MAX_PER_ROOM", "100"))
MAX_CLIENTS = int(os.environ.get("MAX_CLIENTS", "5000"))
_static = os.environ.get("STATIC_DIR", str(Path(__file__).parent / "public"))
ROOT = Path(_static).resolve() if _static else None

_board = os.environ.get("BOARD_FILE", str(Path(__file__).parent / "board.json"))
BOARD_FILE = Path(_board) if _board else None

WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
MAX_FRAME = 16 * 1024
RATE_PER_SEC = 40          # sustained messages/second per client
RATE_BURST = 80            # max burst
PING_EVERY = 20            # seconds
DEAD_AFTER = 60            # seconds without receiving anything → dead connection

STATS_EVERY = 3           # seconds between stats broadcasts

rooms = {}                 # room -> {id: Client}
peaks = {}                 # room -> (date, peak of simultaneous users that day)
_ids = itertools.count(1)

COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
UID_RE = re.compile(r"^[a-z0-9]{8,32}$")
NOT_EMOJI_RE = re.compile(r"[A-Za-z0-9<>&\"'\s]")


def _is_num(v, limit):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and abs(v) < limit


def _is_path(v):
    return isinstance(v, list) and len(v) <= 64 and all(isinstance(i, int) and 0 <= i < 100000 for i in v)


def _is_selection(v):
    """Text selection: DOM node paths + offsets (or null when there is none)."""
    if v is None:
        return True
    return (isinstance(v, dict) and set(v) == {"a", "ao", "f", "fo"}
            and _is_path(v["a"]) and _is_path(v["f"])
            and isinstance(v["ao"], int) and 0 <= v["ao"] < 1e6
            and isinstance(v["fo"], int) and 0 <= v["fo"] < 1e6)


AVATAR_RE = re.compile(r"^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$")
AVATAR_MAX = 14000  # characters (~10 KB image); the client shrinks it before sending


def _is_avatar(v):
    """Profile photo: small image data URL, or "" to remove it."""
    return isinstance(v, str) and (v == "" or (len(v) <= AVATAR_MAX and bool(AVATAR_RE.match(v))))


def _is_emoji(v):
    return isinstance(v, str) and 0 < len(v) <= 8 and not NOT_EMOJI_RE.search(v)


EVENT_KINDS = {"click", "reaction", "board"}
FIELDS = {
    "name": lambda v: isinstance(v, str) and 0 < len(v) <= 32,
    "color": lambda v: isinstance(v, str) and bool(COLOR_RE.match(v)),
    "x": lambda v: _is_num(v, 1e6),
    "y": lambda v: _is_num(v, 1e7),
    "visible": lambda v: isinstance(v, bool),
    "chat": lambda v: isinstance(v, str) and len(v) <= 140,
    "sel": _is_selection,
    "avatar": _is_avatar,
    "uid": lambda v: isinstance(v, str) and bool(UID_RE.match(v)),  # anonymous browser id
}


def total_clients():
    return sum(len(r) for r in rooms.values())


def today():
    return time.strftime("%Y-%m-%d")


def note_peak(room):
    n, d = len(rooms.get(room, {})), today()
    day, peak = peaks.get(room, (d, 0))
    peaks[room] = (d, max(n, peak if day == d else 0))


def room_stats(room):
    day, peak = peaks.get(room, (today(), 0))
    return {"t": "stats", "room": len(rooms.get(room, {})), "site": total_clients(),
            "peak": peak if day == today() else len(rooms.get(room, {}))}


# ------------------------------------------------------------ Shared board --
# Same rules and limits as api/board.js (keep both in sync).
BOARD_W, BOARD_H = 1600, 1000
INK_PERIOD = 3 * 3600      # the ink refills every 3 hours (at 00, 03, 06… UTC)
INK_PER_PERIOD, INK_PER_IP = 5000, 25000
BOARD_CAPACITY, BOARD_MAX_ITEMS = 60000, 300
MAX_POINTS, MAX_TEXT, WIDTHS, TEXT_COST = 600, 60, (3, 9), 40
CTRL_RE = re.compile(r"[\x00-\x1f\x7f]")

board = {"rev": 0, "items": [], "costs": []}
ink_used = {}              # (period, "u"|"i", key) -> ink spent in that period (in memory)


def board_load():
    if BOARD_FILE and BOARD_FILE.is_file():
        try:
            data = json.loads(BOARD_FILE.read_text())
            if isinstance(data.get("items"), list) and len(data.get("costs", [])) == len(data["items"]):
                board.update(rev=int(data.get("rev", 0)), items=data["items"], costs=data["costs"])
        except (ValueError, OSError):
            pass


def board_save():
    if not BOARD_FILE:
        return
    tmp = BOARD_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(board, separators=(",", ":")))
    tmp.replace(BOARD_FILE)


def _is_int(v, lo, hi):
    return isinstance(v, int) and not isinstance(v, bool) and lo <= v <= hi


def clean_item(raw):
    """Validates a drawing; returns (item, ink cost) or None."""
    if not isinstance(raw, dict) or not isinstance(raw.get("c"), str) or not COLOR_RE.match(raw["c"]):
        return None
    c = raw["c"].upper()
    n = CTRL_RE.sub("", raw["n"]).strip()[:32] if isinstance(raw.get("n"), str) else ""  # author, shown on hover
    who = {"n": n} if n else {}
    if raw.get("k") == "s":
        p, w = raw.get("p"), raw.get("w")
        if w not in WIDTHS or not isinstance(p, list) or not 4 <= len(p) <= MAX_POINTS * 2 or len(p) % 2:
            return None
        if not all(_is_int(v, 0, BOARD_H if i % 2 else BOARD_W) for i, v in enumerate(p)):
            return None
        length = sum(math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]) for i in range(2, len(p), 2))
        return {"k": "s", "c": c, **who, "w": w, "p": p}, max(20, round(length * (2 if w == WIDTHS[1] else 1)))
    if raw.get("k") == "t":
        t = CTRL_RE.sub("", raw.get("t") if isinstance(raw.get("t"), str) else "").strip()
        x, y = raw.get("x"), raw.get("y")
        if not t or len(t) > MAX_TEXT or not _is_int(x, 0, BOARD_W) or not _is_int(y, 0, BOARD_H):
            return None
        return {"k": "t", "c": c, **who, "x": x, "y": y, "t": t}, len(t) * TEXT_COST
    return None


def ink_period():
    return int(time.time() // INK_PERIOD)


def ink_info(used):
    now = time.time()
    return {"left": max(0, INK_PER_PERIOD - used), "max": INK_PER_PERIOD, "resetAt": int((now // INK_PERIOD + 1) * INK_PERIOD * 1000)}


def board_add(uid, ip, item, cost):
    d = ink_period()
    for k in [k for k in ink_used if k[0] != d]:
        del ink_used[k]
    used_u, used_i = ink_used.get((d, "u", uid), 0), ink_used.get((d, "i", ip), 0)
    if used_u + cost > INK_PER_PERIOD or used_i + cost > INK_PER_IP:
        return None, used_u
    ink_used[(d, "u", uid)], ink_used[(d, "i", ip)] = used_u + cost, used_i + cost
    board["rev"] += 1
    board["items"].append({"id": board["rev"], **item})
    board["costs"].append(cost)
    while (sum(board["costs"]) > BOARD_CAPACITY or len(board["items"]) > BOARD_MAX_ITEMS) and len(board["items"]) > 1:
        board["items"].pop(0)
        board["costs"].pop(0)
    board_save()
    return board["rev"], used_u + cost


def http_json(writer, code, obj):
    body = json.dumps(obj, separators=(",", ":")).encode()
    reason = {200: "OK", 400: "Bad Request", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed",
              413: "Payload Too Large", 429: "Too Many Requests"}.get(code, "OK")
    writer.write(f"HTTP/1.1 {code} {reason}\r\nContent-Type: application/json\r\nCache-Control: no-store\r\n"
                 f"Content-Length: {len(body)}\r\nConnection: close\r\n\r\n".encode() + body)


async def board_http(reader, writer, method, headers, query):
    if not BOARD_FILE:
        return http_json(writer, 404, {"error": "disabled"})
    d = ink_period()
    if method == "GET":
        q = parse_qs(query)
        uid = q.get("uid", [""])[0]
        used = ink_used.get((d, "u", uid), 0) if UID_RE.match(uid) else 0
        out = {"rev": board["rev"], "total": sum(board["costs"]), "cap": BOARD_CAPACITY, "ink": ink_info(used)}
        if q.get("rev", [""])[0] != str(board["rev"]):
            out["items"] = board["items"]
        return http_json(writer, 200, out)
    if method != "POST":
        return http_json(writer, 405, {"error": "method"})
    origin = headers.get("origin", "").rstrip("/")
    if ALLOWED_ORIGINS and origin not in ALLOWED_ORIGINS:
        return http_json(writer, 403, {"error": "origin"})
    n = int(headers.get("content-length") or 0)
    if n > 32 * 1024:
        return http_json(writer, 413, {"error": "too-big"})
    try:
        body = json.loads(await asyncio.wait_for(reader.readexactly(n), timeout=10))
    except (ValueError, asyncio.IncompleteReadError):
        return http_json(writer, 400, {"error": "invalid"})
    uid = body.get("uid") if isinstance(body, dict) else None
    clean = clean_item(body.get("item")) if isinstance(uid, str) and UID_RE.match(uid) else None
    if not clean:
        return http_json(writer, 400, {"error": "invalid"})
    peer = writer.get_extra_info("peername")
    ip = headers.get("x-forwarded-for", "").split(",")[0].strip() or (peer[0] if peer else "")
    rev, used = board_add(uid, ip, *clean)
    if rev is None:
        return http_json(writer, 429, {"error": "no-ink", "ink": ink_info(used)})
    return http_json(writer, 200, {"rev": rev, "cost": clean[1], "ink": ink_info(used)})


# ---------------------------------------------------------------- WebSocket --
def ws_frame(payload, opcode=0x1):
    n = len(payload)
    head = bytes([0x80 | opcode])
    if n < 126:
        head += bytes([n])
    elif n < 65536:
        head += bytes([126]) + struct.pack("!H", n)
    else:
        head += bytes([127]) + struct.pack("!Q", n)
    return head + payload


async def ws_read_message(reader):
    """Returns (opcode, payload) of a complete message (joins fragments)."""
    buf, first_opcode = b"", None
    while True:
        b1, b2 = await reader.readexactly(2)
        fin, opcode = b1 & 0x80, b1 & 0x0F
        n = b2 & 0x7F
        if n == 126:
            n = struct.unpack("!H", await reader.readexactly(2))[0]
        elif n == 127:
            n = struct.unpack("!Q", await reader.readexactly(8))[0]
        if n > MAX_FRAME:
            raise ConnectionError("frame demasiado grande")
        mask = await reader.readexactly(4) if b2 & 0x80 else None
        data = await reader.readexactly(n)
        if mask:
            data = bytes(b ^ mask[i & 3] for i, b in enumerate(data))
        if opcode >= 0x8:
            return opcode, data
        if first_opcode is None:
            first_opcode = opcode
        buf += data
        if len(buf) > MAX_FRAME:
            raise ConnectionError("mensaje demasiado grande")
        if fin:
            return first_opcode, buf


class Client:
    def __init__(self, cid, room, writer):
        self.id = cid
        self.room = room
        self.writer = writer
        self.state = {}
        self.last_seen = time.monotonic()
        self.tokens = float(RATE_BURST)
        self.tokens_at = time.monotonic()

    def send_raw(self, data):
        if not self.writer.is_closing():
            self.writer.write(data)

    def send(self, obj):
        self.send_raw(ws_frame(json.dumps(obj, separators=(",", ":")).encode()))

    def allow(self):
        now = time.monotonic()
        self.tokens = min(RATE_BURST, self.tokens + (now - self.tokens_at) * RATE_PER_SEC)
        self.tokens_at = now
        if self.tokens < 1:
            return False
        self.tokens -= 1
        return True


def broadcast(room, obj, exclude=None):
    data = ws_frame(json.dumps(obj, separators=(",", ":")).encode())
    for c in list(rooms.get(room, {}).values()):
        if c is not exclude:
            c.send_raw(data)


def http_error(writer, code, reason):
    body = reason.encode()
    writer.write(f"HTTP/1.1 {code} {reason}\r\nContent-Type: text/plain\r\n"
                 f"Content-Length: {len(body)}\r\nConnection: close\r\n\r\n".encode() + body)


def clean_room(raw):
    room = (raw or "/").strip()[:128]
    return room or "/"


async def ws_session(reader, writer, headers, query):
    key = headers.get("sec-websocket-key")
    if not key:
        return http_error(writer, 400, "Bad Request")
    origin = headers.get("origin", "").rstrip("/")
    if ALLOWED_ORIGINS and origin not in ALLOWED_ORIGINS:
        return http_error(writer, 403, "Forbidden")
    room = clean_room(parse_qs(query).get("room", ["/"])[0])
    if total_clients() >= MAX_CLIENTS or len(rooms.get(room, {})) >= MAX_PER_ROOM:
        return http_error(writer, 503, "Service Unavailable")

    accept = base64.b64encode(hashlib.sha1((key + WS_GUID).encode()).digest()).decode()
    writer.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                  f"Sec-WebSocket-Accept: {accept}\r\n\r\n").encode())

    me = Client(next(_ids), room, writer)
    members = rooms.setdefault(room, {})
    me.send({
        "t": "welcome", "id": me.id, "room": room,
        "peers": [{"id": c.id, **c.state} for c in members.values() if c.state.get("name")],
    })
    members[me.id] = me
    note_peak(room)
    me.send(room_stats(room))
    try:
        while True:
            opcode, data = await ws_read_message(reader)
            me.last_seen = time.monotonic()
            if opcode == 0x8:  # close
                me.send_raw(ws_frame(b"", 0x8))
                break
            if opcode == 0x9:  # ping
                me.send_raw(ws_frame(data, 0xA))
                continue
            if opcode != 0x1 or not me.allow():
                continue
            try:
                msg = json.loads(data)
            except ValueError:
                continue
            if not isinstance(msg, dict):
                continue
            if msg.get("t") == "event":  # ephemeral: forwarded but not stored
                kind, x, y = msg.get("kind"), msg.get("x"), msg.get("y")
                if kind not in EVENT_KINDS or not _is_num(x, 1e6) or not _is_num(y, 1e7) or not me.state.get("name"):
                    continue
                out = {"t": "event", "id": me.id, "kind": kind, "x": x, "y": y}
                if kind == "reaction":
                    if not _is_emoji(msg.get("emoji")):
                        continue
                    out["emoji"] = msg["emoji"]
                broadcast(room, out, exclude=me)
                await writer.drain()
                continue
            if msg.get("t") != "update":
                continue
            patch = {k: v for k, v in msg.items() if k in FIELDS and FIELDS[k](v)}
            if not patch:
                continue
            is_new = "name" not in me.state and "name" in patch
            me.state.update(patch)
            if not me.state.get("name"):
                continue  # hasn't introduced itself yet
            out = me.state if is_new else patch
            broadcast(room, {"t": "update", "id": me.id, **out}, exclude=me)
            await writer.drain()
    except (asyncio.IncompleteReadError, ConnectionError, OSError):
        pass
    finally:
        members = rooms.get(room, {})
        members.pop(me.id, None)
        if not members:
            rooms.pop(room, None)
        else:
            broadcast(room, {"t": "leave", "id": me.id})


async def heartbeat():
    """Sends pings and closes connections that stopped responding (Wi-Fi down, phone asleep…)."""
    ping = ws_frame(b"", 0x9)
    while True:
        await asyncio.sleep(PING_EVERY)
        now = time.monotonic()
        for members in list(rooms.values()):
            for c in list(members.values()):
                if now - c.last_seen > DEAD_AFTER:
                    c.writer.close()  # the read loop fails and cleans up the room
                else:
                    c.send_raw(ping)


async def stats_loop():
    """Sends each room its stats (only when they change)."""
    last = {}
    while True:
        await asyncio.sleep(STATS_EVERY)
        d = today()
        for r in [r for r, (day, _) in peaks.items() if day != d and r not in rooms]:
            peaks.pop(r, None)  # drop previous days' peaks of empty rooms
        for room in list(rooms):
            s = room_stats(room)
            key = (s["room"], s["site"], s["peak"])
            if last.get(room) != key:
                last[room] = key
                broadcast(room, s)
        for r in [r for r in last if r not in rooms]:
            last.pop(r)


# --------------------------------------------------------------------- HTTP --
# Former file names that still work, so older integrations keep loading.
ALIASES = {"multicursor.js": "roomful.js"}


def serve_static(writer, path, head_only=False):
    if ROOT is None:
        return http_error(writer, 404, "Not Found")
    rel = path.lstrip("/") or "index.html"
    rel = ALIASES.get(rel, rel)
    target = (ROOT / rel).resolve()
    if target.is_dir():
        target = target / "index.html"
    if (ROOT not in target.parents and target != ROOT) or not target.is_file():
        return http_error(writer, 404, "Not Found")
    body = target.read_bytes()
    ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
    if ctype.startswith("text/") or ctype.endswith("javascript"):
        ctype += "; charset=utf-8"
    writer.write(
        (f"HTTP/1.1 200 OK\r\nContent-Type: {ctype}\r\nContent-Length: {len(body)}\r\n"
         "Cache-Control: no-cache\r\nConnection: close\r\n\r\n").encode() + (b"" if head_only else body)
    )


async def handle(reader, writer):
    try:
        raw = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), timeout=10)
        lines = raw.decode("latin-1").split("\r\n")
        method, target, _ = lines[0].split(" ", 2)
        headers = {}
        for line in lines[1:]:
            if ":" in line:
                k, v = line.split(":", 1)
                headers[k.strip().lower()] = v.strip()
        url = urlsplit(target)
        if url.path == "/ws" and headers.get("upgrade", "").lower() == "websocket":
            await ws_session(reader, writer, headers, url.query)
        elif url.path == "/api/board":
            await board_http(reader, writer, method, headers, url.query)
        elif url.path == "/health":
            body = json.dumps({"ok": True, "clients": total_clients(), "rooms": len(rooms)}).encode()
            writer.write(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n"
                         b"Content-Length: " + str(len(body)).encode() + b"\r\nConnection: close\r\n\r\n" + body)
        elif method in ("GET", "HEAD"):
            serve_static(writer, url.path, head_only=method == "HEAD")
        else:
            http_error(writer, 405, "Method Not Allowed")
        await writer.drain()
    except (asyncio.IncompleteReadError, asyncio.TimeoutError, asyncio.LimitOverrunError,
            ConnectionError, ValueError, OSError):
        pass
    finally:
        writer.close()


async def main():
    board_load()
    server = await asyncio.start_server(handle, HOST, PORT)
    asyncio.ensure_future(heartbeat())
    asyncio.ensure_future(stats_loop())
    print(f"→ http://localhost:{PORT}  (WebSocket at /ws)  · Ctrl+C to stop")
    if ALLOWED_ORIGINS:
        print("  Allowed origins:", ", ".join(sorted(ALLOWED_ORIGINS)))
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
