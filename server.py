#!/usr/bin/env python3
"""
Servidor de cursores colaborativos — cero dependencias (solo stdlib, Python 3.8+).

- Relay WebSocket en /ws?room=<sala>: cada cliente publica su estado (nombre,
  color, posición, chat...) y el servidor lo reenvía al resto de su sala.
- Sirve los ficheros estáticos de ./public (opcional).
- /health devuelve el estado en JSON (para el hosting).

Variables de entorno:
  PORT             Puerto                                   (8080)
  HOST             Interfaz                                 (0.0.0.0)
  ALLOWED_ORIGINS  Dominios permitidos, separados por comas. Vacío = cualquiera.
                   Ej: https://miweb.com,https://www.miweb.com
  MAX_PER_ROOM     Máximo de usuarios por sala              (100)
  MAX_CLIENTS      Máximo de conexiones en total            (5000)
  STATIC_DIR       Carpeta de estáticos; "" para desactivar (./public)
"""
import asyncio
import base64
import hashlib
import itertools
import json
import mimetypes
import os
import re
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

WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
MAX_FRAME = 16 * 1024
RATE_PER_SEC = 40          # mensajes/seg sostenidos por cliente
RATE_BURST = 80            # ráfaga máxima
PING_EVERY = 20            # seg
DEAD_AFTER = 60            # seg sin recibir nada → conexión muerta

STATS_EVERY = 3           # seg entre envíos de estadísticas

rooms = {}                 # room -> {id: Client}
peaks = {}                 # room -> (fecha, pico de usuarios simultáneos ese día)
_ids = itertools.count(1)

COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
UID_RE = re.compile(r"^[a-z0-9]{8,32}$")
NOT_EMOJI_RE = re.compile(r"[A-Za-z0-9<>&\"'\s]")


def _is_num(v, limit):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and abs(v) < limit


def _is_path(v):
    return isinstance(v, list) and len(v) <= 64 and all(isinstance(i, int) and 0 <= i < 100000 for i in v)


def _is_selection(v):
    """Selección de texto: rutas de nodos DOM + offsets (o null si no hay)."""
    if v is None:
        return True
    return (isinstance(v, dict) and set(v) == {"a", "ao", "f", "fo"}
            and _is_path(v["a"]) and _is_path(v["f"])
            and isinstance(v["ao"], int) and 0 <= v["ao"] < 1e6
            and isinstance(v["fo"], int) and 0 <= v["fo"] < 1e6)


AVATAR_RE = re.compile(r"^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$")
AVATAR_MAX = 14000  # caracteres (~10 KB de imagen); el cliente la reduce antes de enviarla


def _is_avatar(v):
    """Foto de perfil: data URL de imagen pequeña, o "" para quitarla."""
    return isinstance(v, str) and (v == "" or (len(v) <= AVATAR_MAX and bool(AVATAR_RE.match(v))))


def _is_emoji(v):
    return isinstance(v, str) and 0 < len(v) <= 8 and not NOT_EMOJI_RE.search(v)


EVENT_KINDS = {"click", "reaction"}
FIELDS = {
    "name": lambda v: isinstance(v, str) and 0 < len(v) <= 32,
    "color": lambda v: isinstance(v, str) and bool(COLOR_RE.match(v)),
    "x": lambda v: _is_num(v, 1e6),
    "y": lambda v: _is_num(v, 1e7),
    "visible": lambda v: isinstance(v, bool),
    "chat": lambda v: isinstance(v, str) and len(v) <= 140,
    "sel": _is_selection,
    "avatar": _is_avatar,
    "uid": lambda v: isinstance(v, str) and bool(UID_RE.match(v)),  # id anónimo del navegador
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
    """Devuelve (opcode, payload) de un mensaje completo (une fragmentos)."""
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
            if msg.get("t") == "event":  # efímero: se reenvía pero no se guarda
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
                continue  # aún no se ha presentado
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
    """Envía pings y cierra conexiones que ya no responden (wifi caída, móvil dormido...)."""
    ping = ws_frame(b"", 0x9)
    while True:
        await asyncio.sleep(PING_EVERY)
        now = time.monotonic()
        for members in list(rooms.values()):
            for c in list(members.values()):
                if now - c.last_seen > DEAD_AFTER:
                    c.writer.close()  # el bucle de lectura falla y limpia la sala
                else:
                    c.send_raw(ping)


async def stats_loop():
    """Envía a cada sala sus estadísticas (solo cuando cambian)."""
    last = {}
    while True:
        await asyncio.sleep(STATS_EVERY)
        d = today()
        for r in [r for r, (day, _) in peaks.items() if day != d and r not in rooms]:
            peaks.pop(r, None)  # limpia picos de días anteriores de salas vacías
        for room in list(rooms):
            s = room_stats(room)
            key = (s["room"], s["site"], s["peak"])
            if last.get(room) != key:
                last[room] = key
                broadcast(room, s)
        for r in [r for r in last if r not in rooms]:
            last.pop(r)


# --------------------------------------------------------------------- HTTP --
def serve_static(writer, path, head_only=False):
    if ROOT is None:
        return http_error(writer, 404, "Not Found")
    rel = path.lstrip("/") or "index.html"
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
    server = await asyncio.start_server(handle, HOST, PORT)
    asyncio.ensure_future(heartbeat())
    asyncio.ensure_future(stats_loop())
    print(f"→ http://localhost:{PORT}  (WebSocket en /ws)  · Ctrl+C para parar")
    if ALLOWED_ORIGINS:
        print("  Orígenes permitidos:", ", ".join(sorted(ALLOWED_ORIGINS)))
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
