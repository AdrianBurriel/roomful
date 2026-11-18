#!/usr/bin/env python3
"""
Servidor de cursores colaborativos — cero dependencias (solo stdlib, Python 3.8+).

- Sirve los ficheros estáticos de ./public
- Hace de relay WebSocket en /ws: cada cliente envía su estado (nombre, color,
  posición, chat...) y el servidor lo reenvía al resto.

Uso:   python3 server.py            -> http://localhost:8080
       PORT=3000 python3 server.py
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
from pathlib import Path

ROOT = (Path(__file__).parent / "public").resolve()
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "8080"))
WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
MAX_FRAME = 16 * 1024

clients = {}  # id -> Client
_ids = itertools.count(1)

# Campos que un cliente puede publicar, con su validador.
COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
FIELDS = {
    "name": lambda v: isinstance(v, str) and 0 < len(v) <= 32,
    "color": lambda v: isinstance(v, str) and bool(COLOR_RE.match(v)),
    "x": lambda v: isinstance(v, (int, float)) and abs(v) < 1e6,
    "y": lambda v: isinstance(v, (int, float)) and abs(v) < 1e7,
    "visible": lambda v: isinstance(v, bool),
    "chat": lambda v: isinstance(v, str) and len(v) <= 140,
}


# ---------------------------------------------------------------- WebSocket --
def ws_frame(payload: bytes, opcode: int = 0x1) -> bytes:
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
        if opcode >= 0x8:  # control frames: nunca fragmentados
            return opcode, data
        if first_opcode is None:
            first_opcode = opcode
        buf += data
        if len(buf) > MAX_FRAME:
            raise ConnectionError("mensaje demasiado grande")
        if fin:
            return first_opcode, buf


class Client:
    def __init__(self, cid, writer):
        self.id = cid
        self.writer = writer
        self.state = {}

    def send(self, obj):
        if self.writer.is_closing():
            return
        self.writer.write(ws_frame(json.dumps(obj, separators=(",", ":")).encode()))


def broadcast(obj, exclude=None):
    for c in list(clients.values()):
        if c is not exclude:
            c.send(obj)


async def ws_session(reader, writer, headers):
    key = headers.get("sec-websocket-key")
    if not key:
        writer.write(b"HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n")
        return
    accept = base64.b64encode(hashlib.sha1((key + WS_GUID).encode()).digest()).decode()
    writer.write(
        (
            "HTTP/1.1 101 Switching Protocols\r\n"
            "Upgrade: websocket\r\nConnection: Upgrade\r\n"
            f"Sec-WebSocket-Accept: {accept}\r\n\r\n"
        ).encode()
    )

    me = Client(next(_ids), writer)
    clients[me.id] = me
    me.send({
        "t": "welcome",
        "id": me.id,
        "peers": [{"id": c.id, **c.state} for c in clients.values() if c is not me and c.state.get("name")],
    })
    try:
        while True:
            opcode, data = await ws_read_message(reader)
            if opcode == 0x8:  # close
                writer.write(ws_frame(b"", 0x8))
                break
            if opcode == 0x9:  # ping
                writer.write(ws_frame(data, 0xA))
                continue
            if opcode != 0x1:
                continue
            try:
                msg = json.loads(data)
            except ValueError:
                continue
            if not isinstance(msg, dict) or msg.get("t") != "update":
                continue
            patch = {k: v for k, v in msg.items() if k in FIELDS and FIELDS[k](v)}
            if not patch:
                continue
            is_new = "name" not in me.state and "name" in patch
            me.state.update(patch)
            if not me.state.get("name"):
                continue  # aún no se ha presentado
            if is_new:
                broadcast({"t": "update", "id": me.id, **me.state}, exclude=me)
            else:
                broadcast({"t": "update", "id": me.id, **patch}, exclude=me)
            await writer.drain()
    except (asyncio.IncompleteReadError, ConnectionError, OSError):
        pass
    finally:
        clients.pop(me.id, None)
        broadcast({"t": "leave", "id": me.id})


# --------------------------------------------------------------------- HTTP --
def serve_static(writer, path):
    rel = path.lstrip("/") or "index.html"
    target = (ROOT / rel).resolve()
    if target.is_dir():
        target = target / "index.html"
    if (ROOT not in target.parents and target != ROOT) or not target.is_file():
        body = b"404"
        writer.write(b"HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\n"
                     b"Content-Length: 3\r\nConnection: close\r\n\r\n" + body)
        return
    body = target.read_bytes()
    ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
    if ctype.startswith("text/") or ctype.endswith("javascript"):
        ctype += "; charset=utf-8"
    writer.write(
        (f"HTTP/1.1 200 OK\r\nContent-Type: {ctype}\r\nContent-Length: {len(body)}\r\n"
         "Cache-Control: no-cache\r\nConnection: close\r\n\r\n").encode() + body
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
        path = target.split("?", 1)[0]
        if path == "/ws" and headers.get("upgrade", "").lower() == "websocket":
            await ws_session(reader, writer, headers)
        elif method in ("GET", "HEAD"):
            serve_static(writer, path)
        else:
            writer.write(b"HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
        await writer.drain()
    except (asyncio.IncompleteReadError, asyncio.TimeoutError, asyncio.LimitOverrunError,
            ConnectionError, ValueError, OSError):
        pass
    finally:
        writer.close()


async def main():
    server = await asyncio.start_server(handle, HOST, PORT)
    print(f"→ http://localhost:{PORT}  (WebSocket en /ws)  · Ctrl+C para parar")
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
