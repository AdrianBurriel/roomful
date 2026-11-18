/*!
 * MultiCursor — cursores multijugador estilo Figma para cualquier web.
 *
 * Uso mínimo:
 *   <script src="/multicursor.js"></script>
 *   <script>MultiCursor.init({ url: "wss://mi-servidor.com/ws" });</script>
 *
 * Opciones (todas opcionales):
 *   url         URL del WebSocket                 (ws(s)://<host actual>/ws)
 *   room        Sala. Por defecto, la ruta de la página: solo ves a quien está
 *               en tu misma URL. Pon un valor fijo (ej. "global") para
 *               compartir sala en toda la web.
 *               Si no se indica, se sigue la ruta automáticamente (SPA).
 *   name        Nombre fijo del usuario           (aleatorio: "Capibara Zen")
 *   color       Color hex #RRGGBB                 (aleatorio de la paleta)
 *   presence    Píldora con avatares conectados   (true)
 *   toggle      Botón para ocultar cursores / dejar de compartir el tuyo (true)
 *   chat        Chat de cursor con la tecla "/"   (true)
 *   anchor      'center' | 'left' — referencia horizontal para mapear
 *               posiciones entre pantallas de distinto ancho     ('center')
 *   maxCursors  Máximo de cursores visibles; se priorizan personas reales
 *               y los más activos                                (12)
 *   idleMs      Tras este tiempo sin moverse, el cursor se atenúa (30000)
 *   bots        Usuarios ficticios para que la página no se vea vacía.
 *               Son locales (cada visitante ve los suyos). Se desactivan
 *               con prefers-reduced-motion.                      (0)
 *   botsRetireAt  Los bots se retiran cuando hay al menos este nº de
 *               personas reales en la sala                (= nº de bots)
 *   botChat     Los bots escriben mensajes de vez en cuando      (true)
 *   botTargets  Selector CSS de elementos hacia los que van los bots
 *   botPhrases  Array de frases para el chat de los bots
 *
 * Devuelve { me, peers, setRoom(room), setGhost(bool), destroy() }.
 *
 * Protocolo (JSON por WebSocket, conexión a <url>?room=<sala>):
 *   cliente → servidor  { t:"update", name?, color?, x?, y?, visible?, chat? }
 *   servidor → cliente  { t:"welcome", id, room, peers:[{id,...estado}] }
 *                       { t:"update", id, ...campos }   { t:"leave", id }
 */
(function (global) {
  "use strict";

  var ANIMALS = ["Capibara", "Ajolote", "Nutria", "Quokka", "Panda Rojo", "Perezoso",
    "Pingüino", "Mapache", "Alpaca", "Erizo", "Koala", "Tucán", "Narval", "Manatí",
    "Suricata", "Ornitorrinco", "Lémur", "Flamenco", "Fénec", "Wombat", "Llama", "Tapir"];
  var ADJECTIVES = ["Zen", "Ninja", "Turbo", "Feliz", "Veloz", "Audaz", "Elegante",
    "Valiente", "Brillante", "Rebelde", "Salvaje", "Sonriente", "Cool", "Pixel", "Lunar"];
  var COLORS = ["#F24E1E", "#FF7262", "#A259FF", "#1ABCFE", "#0ACF83", "#FFC700",
    "#FF4FA3", "#7B61FF", "#14AE5C", "#0D99FF", "#F5A524", "#E5484D"];

  var BOT_PHRASES = ["Hola 👋", "¿Habéis visto este botón?", "Lorem ipsum, mi idioma favorito",
    "Me quedo con el plan Pro 👀", "Esto queda genial", "¿Quién ha movido el hero?",
    "Capibaras al poder 🦫", "Ese hover está muy fino", "¿Alguien más por aquí?", "Mola el wireframe",
    "Voy a por un café ☕", "Sígueme 🏃"];
  var BOT_TARGETS = "a, button, .btn, h1, h2, h3, p, img, svg, .card, .ph, summary, li, [data-mc-target]";

  var BOT_HERE_MS = [7000, 16000];   // tiempo que un bot pasa en tu pantalla
  var BOT_AWAY_MS = [12000, 30000];  // tiempo que pasa en otras zonas de la página

  var SEND_EVERY_MS = 40;   // ~25 envíos/seg como máximo
  var LERP = 0.28;          // suavizado de cursores remotos (0..1)
  var CHAT_LINGER_MS = 4000;

  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  function textOn(hex) {
    var n = parseInt(hex.slice(1), 16);
    var r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 170 ? "#1E1E1E" : "#FFFFFF";
  }

  // sessionStorage: identidad por pestaña · localStorage: preferencias del visitante
  function store(area, key, val) {
    try {
      var s = global[area];
      if (val === undefined) return JSON.parse(s.getItem(key));
      s.setItem(key, JSON.stringify(val));
    } catch (e) { return null; }
  }

  function el(tag, cls, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }

  function roomFromPath(path) {
    path = (path || "/").replace(/\/+$/, "") || "/";
    return path.slice(0, 128);
  }

  var CSS = [
    ".mc-layer{position:absolute;left:0;top:0;width:0;height:0;overflow:visible;pointer-events:none;z-index:2147483000}",
    ".mc-layer.mc-off{display:none}",
    ".mc-cursor{position:absolute;left:0;top:0;will-change:transform;transition:opacity .3s ease}",
    ".mc-cursor.mc-idle{opacity:.35}",
    ".mc-cursor.mc-hidden,.mc-cursor.mc-capped{opacity:0}",
    ".mc-cursor svg{display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,.25))}",
    ".mc-tag{position:absolute;left:14px;top:16px;font:500 12px/1.2 Inter,system-ui,-apple-system,'Segoe UI',sans-serif;",
    "  padding:4px 8px;border-radius:3px 12px 12px 12px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.18);",
    "  max-width:240px;overflow:hidden;text-overflow:ellipsis}",
    ".mc-tag .mc-msg{display:none;font-size:14px;font-weight:400;margin-top:3px;white-space:normal;word-break:break-word}",
    ".mc-tag.mc-talking{padding:7px 12px 9px;border-radius:3px 16px 16px 16px}",
    ".mc-tag.mc-talking .mc-msg{display:block}",
    ".mc-tag.mc-talking .mc-name{font-size:10px;opacity:.8}",
    /* chat local */
    ".mc-local{position:fixed;left:0;top:0;pointer-events:none;z-index:2147483001;display:none}",
    ".mc-local.mc-open{display:block}",
    ".mc-local .mc-tag{pointer-events:auto;padding:7px 12px 9px;border-radius:3px 16px 16px 16px}",
    ".mc-local input{all:unset;font:400 14px/1.2 Inter,system-ui,-apple-system,sans-serif;width:200px;color:inherit;caret-color:currentColor}",
    ".mc-local input::placeholder{color:inherit;opacity:.65}",
    /* presencia */
    ".mc-presence{position:fixed;right:16px;bottom:16px;display:flex;align-items:center;gap:8px;z-index:2147483002;",
    "  background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:999px;padding:5px 5px 5px 12px;",
    "  box-shadow:0 4px 16px rgba(0,0,0,.10);font:500 12px/1 Inter,system-ui,-apple-system,sans-serif;color:#555}",
    ".mc-avatars{display:flex}",
    ".mc-avatar{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:600;",
    "  border:2px solid #fff;margin-left:-7px;cursor:default}",
    ".mc-avatar:first-child{margin-left:0}",
    ".mc-avatar.mc-me{outline:2px solid currentColor;outline-offset:-4px}",
    ".mc-hint{opacity:.7}",
    ".mc-toggle{all:unset;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;cursor:pointer;color:inherit}",
    ".mc-toggle:hover{background:rgba(0,0,0,.06)}",
    ".mc-toggle:focus-visible{outline:2px solid #0D99FF;outline-offset:1px}",
    ".mc-ghost .mc-avatars,.mc-ghost .mc-hint{display:none}",
    "@media (hover:none){.mc-hint{display:none}}",
    "@media (prefers-color-scheme:dark){.mc-presence{background:#1f1f1f;border-color:rgba(255,255,255,.1);color:#bbb}",
    "  .mc-avatar{border-color:#1f1f1f}.mc-toggle:hover{background:rgba(255,255,255,.08)}}"
  ].join("\n");

  var EYE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.6 3.5M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7c1.8 0 3.4-.5 4.8-1.3"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M2 2l20 20"/></svg>';

  function cursorSVG(color) {
    return '<svg width="20" height="22" viewBox="0 0 20 22" fill="none">' +
      '<path d="M2 2 L2 17.5 L6.3 13.4 L9.3 20 L12.2 18.7 L9.3 12.3 L15.4 12.3 Z" fill="' + color +
      '" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  }

  function initials(name) {
    return name.split(/\s+/).map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase();
  }

  function init(opts) {
    opts = opts || {};
    var anchorCenter = (opts.anchor || "center") === "center";
    var maxCursors = opts.maxCursors > 0 ? opts.maxCursors : 12;
    var idleMs = opts.idleMs > 0 ? opts.idleMs : 30000;
    var reducedMotion = global.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var botCount = reducedMotion ? 0 : Math.max(0, Math.min(12, opts.bots | 0));
    var botsRetireAt = opts.botsRetireAt > 0 ? opts.botsRetireAt : Math.max(1, botCount);

    var saved = store("sessionStorage", "mc:me") || {};
    var me = {
      name: opts.name || saved.name || pick(ANIMALS) + " " + pick(ADJECTIVES),
      color: opts.color || saved.color || pick(COLORS)
    };
    store("sessionStorage", "mc:me", me);

    var baseUrl = opts.url || ((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws");
    var autoRoom = opts.room == null;
    var room = autoRoom ? roomFromPath(location.pathname) : String(opts.room).slice(0, 128);
    var ghost = store("localStorage", "mc:ghost") === true;

    var peers = {};        // id -> peer
    var ws = null, destroyed = false, retry = 0, retryTimer = null;
    var last = { cx: 0, cy: 0, has: false, sent: 0, pending: null };
    var chatTimer = null, raf = 0, houseTimer = null;
    var bots = [];

    // ---- DOM ----
    var style = el("style"); style.textContent = CSS; document.head.appendChild(style);
    var layer = el("div", "mc-layer", document.body);

    var local = el("div", "mc-local", document.body);
    var localTag = el("div", "mc-tag", local);
    localTag.style.background = me.color; localTag.style.color = textOn(me.color);
    var input = el("input", "", localTag);
    input.maxLength = 140; input.placeholder = "Di algo…";
    input.setAttribute("aria-label", "Mensaje de chat del cursor");

    var presence = null, avatars = null, countEl = null, toggleBtn = null;
    if (opts.presence !== false) {
      presence = el("div", "mc-presence", document.body);
      presence.setAttribute("role", "status");
      countEl = el("span", "", presence);
      if (opts.chat !== false) {
        var hint = el("span", "mc-hint", presence);
        hint.innerHTML = "· pulsa <b>/</b> para hablar";
      }
      avatars = el("div", "mc-avatars", presence);
      if (opts.toggle !== false) {
        toggleBtn = el("button", "mc-toggle", presence);
        toggleBtn.type = "button";
        toggleBtn.addEventListener("click", function () { setGhost(!ghost); });
      }
    }

    // ---- coordenadas ----
    function originX() { return anchorCenter ? document.documentElement.clientWidth / 2 : 0; }
    function toShared(cx, cy) {
      return { x: Math.round(cx + global.scrollX - originX()), y: Math.round(cy + global.scrollY) };
    }

    // ---- red ----
    function send(obj) {
      if (ws && ws.readyState === 1) { obj.t = "update"; ws.send(JSON.stringify(obj)); }
    }

    function sendPosition() {
      if (!last.has || ghost) return;
      var now = performance.now();
      var wait = SEND_EVERY_MS - (now - last.sent);
      if (wait > 0) {
        if (!last.pending) last.pending = setTimeout(function () { last.pending = null; sendPosition(); }, wait);
        return;
      }
      last.sent = now;
      var p = toShared(last.cx, last.cy);
      send({ x: p.x, y: p.y, visible: true });
    }

    function connect() {
      if (destroyed || ghost) return;
      var sock;
      try {
        sock = ws = new WebSocket(baseUrl + (baseUrl.indexOf("?") < 0 ? "?" : "&") + "room=" + encodeURIComponent(room));
      } catch (e) { return scheduleRetry(); }
      sock.onopen = function () {
        retry = 0;
        var msg = { name: me.name, color: me.color, visible: false };
        if (last.has) { var p = toShared(last.cx, last.cy); msg.x = p.x; msg.y = p.y; msg.visible = !document.hidden; }
        send(msg);
      };
      sock.onmessage = function (ev) {
        var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.t === "welcome") {
          clearRealPeers();
          (m.peers || []).forEach(upsertPeer);
        } else if (m.t === "update") {
          upsertPeer(m);
        } else if (m.t === "leave") {
          removePeer(m.id);
        }
        renderPresence();
      };
      sock.onclose = function () {
        if (sock !== ws) return;
        clearRealPeers();
        renderPresence();
        scheduleRetry();
      };
    }

    function disconnect() {
      clearTimeout(retryTimer);
      if (ws) { var old = ws; ws = null; old.onclose = null; old.close(); }
      clearRealPeers();
    }

    function scheduleRetry() {
      if (destroyed || ghost) return;
      clearTimeout(retryTimer);
      retryTimer = setTimeout(connect, Math.min(15000, 500 * Math.pow(2, retry++)) * rand(0.8, 1.2));
    }

    function setRoom(r) {
      r = String(r).slice(0, 128);
      if (r === room) return;
      room = r;
      disconnect();
      retry = 0;
      connect();
      renderPresence();
    }

    // ---- modo fantasma: ni ves ni te ven ----
    function setGhost(on) {
      ghost = !!on;
      store("localStorage", "mc:ghost", ghost);
      layer.classList.toggle("mc-off", ghost);
      if (ghost) {
        if (local.classList.contains("mc-open")) closeChat(false);
        disconnect();
      } else {
        retry = 0;
        connect();
        kick();
      }
      renderPresence();
    }

    // ---- peers ----
    function upsertPeer(m) {
      var p = peers[m.id];
      if (!p) {
        p = peers[m.id] = { id: m.id, name: "", color: "#888888", x: 0, y: 0, cx: null, cy: null,
          visible: false, chat: "", lastActive: performance.now() };
        p.el = el("div", "mc-cursor mc-hidden", layer);
        p.tag = el("div", "mc-tag");
        p.nameEl = el("div", "mc-name", p.tag);
        p.msgEl = el("div", "mc-msg", p.tag);
      }
      ["name", "color", "x", "y", "visible", "chat"].forEach(function (k) { if (k in m) p[k] = m[k]; });
      if ("x" in m || "y" in m || m.chat) setActive(p, performance.now());
      if ("color" in m || !p.el.firstChild) {
        p.el.innerHTML = cursorSVG(p.color);
        p.el.appendChild(p.tag);
        p.tag.style.background = p.color;
        p.tag.style.color = textOn(p.color);
      }
      p.nameEl.textContent = p.name;
      p.msgEl.textContent = p.chat;
      p.tag.classList.toggle("mc-talking", !!p.chat);
      p.el.classList.toggle("mc-hidden", !p.visible);
      if (p.cx === null || !p.visible) { p.cx = p.x; p.cy = p.y; }
      kick();
    }

    function setActive(p, now) {
      p.lastActive = now;
      if (p.idle) { p.idle = false; p.el.classList.remove("mc-idle"); }
    }

    function removePeer(id) {
      var p = peers[id];
      if (p) { p.el.remove(); delete peers[id]; }
    }

    function clearRealPeers() {
      Object.keys(peers).forEach(function (id) { if (!peers[id].bot) removePeer(id); });
    }

    function realCount() {
      var n = 0;
      for (var id in peers) if (!peers[id].bot && peers[id].name) n++;
      return n;
    }

    // ---- límite de cursores + inactividad (cada segundo) ----
    function housekeeping() {
      var now = performance.now();
      if (autoRoom) {
        var r = roomFromPath(location.pathname);
        if (r !== room) setRoom(r);
      }
      var list = [];
      for (var id in peers) {
        var p = peers[id];
        var idle = now - p.lastActive > idleMs;
        if (idle !== !!p.idle) { p.idle = idle; p.el.classList.toggle("mc-idle", idle); }
        if (p.visible && !p.retired) list.push(p);
      }
      // prioridad: personas reales > bots; activos > inactivos; recientes > antiguos
      list.sort(function (a, b) {
        return (!!a.bot - !!b.bot) || (!!a.idle - !!b.idle) || (b.lastActive - a.lastActive);
      });
      list.forEach(function (p, i) {
        var capped = i >= maxCursors;
        if (capped !== !!p.capped) { p.capped = capped; p.el.classList.toggle("mc-capped", capped); }
      });
    }

    // ---- bots: usuarios ficticios ----
    // Elige un punto "interesante" (un botón, un titular...) en coordenadas compartidas.
    // here=true → dentro de lo que el visitante ve; here=false → fuera de su vista
    // (devuelve null si la página es tan corta que no hay "fuera").
    function pickBotTarget(here) {
      var vis = [], out = [], vh = innerHeight, vw = document.documentElement.clientWidth;
      var els = document.querySelectorAll(opts.botTargets || BOT_TARGETS);
      for (var i = 0; i < els.length; i++) {
        if (els[i].closest(".mc-presence,.mc-local,.mc-layer")) continue;
        var r = els[i].getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        if (r.bottom > 80 && r.top < vh - 60 && r.right > 0 && r.left < vw) vis.push(r);
        else if (r.bottom < -40 || r.top > vh + 40) out.push(r);
      }
      if (!here && !out.length) return null;
      var pool = here ? vis : out;
      var px, py;
      if (!pool.length) {
        px = rand(vw * 0.2, vw * 0.8); py = rand(vh * 0.2, vh * 0.8);
      } else {
        var r2 = pick(pool);
        px = r2.left + r2.width * rand(0.15, 0.85);
        py = r2.top + r2.height * rand(0.25, 0.75);
        if (here) py = Math.max(80, Math.min(vh - 60, py));
      }
      return { x: px + global.scrollX - originX(), y: py + global.scrollY };
    }

    function createBots(n) {
      var names = {}, colors = {};
      names[me.name] = 1; colors[me.color] = 1;
      for (var i = 0; i < n; i++) {
        var name, color, tries = 0;
        do { name = pick(ANIMALS) + " " + pick(ADJECTIVES); } while (names[name] && ++tries < 50);
        do { color = pick(COLORS); } while (colors[color] && ++tries < 100);
        names[name] = 1; colors[color] = 1;
        // El primero empieza de visita; el resto, por otras zonas de la página.
        var now = performance.now(), here = i === 0;
        var start = pickBotTarget(here) || pickBotTarget(true), id = "bot-" + i;
        upsertPeer({ id: id, name: name, color: color, x: start.x, y: start.y, visible: true });
        peers[id].bot = true;
        bots.push({ id: id, seg: null, waitUntil: now + rand(200, 2000), chat: null,
          here: here, modeUntil: now + (here ? rand(BOT_HERE_MS[0], BOT_HERE_MS[1]) : rand(4000, 12000)),
          nextChat: now + rand(4000, 8000) });
      }
      renderPresence();
    }

    // Alterna cada bot entre "de visita" (en tu pantalla) y "a lo suyo" (fuera de ella).
    // Normalmente solo hay uno de visita a la vez, y a ratos ninguno.
    function updateBotMode(b, now) {
      if (now < b.modeUntil || b.chat) return;
      var visiting = bots.filter(function (o) { return o.here && o !== b; }).length;
      if (b.here) {
        b.here = false;
        b.modeUntil = now + rand(BOT_AWAY_MS[0], BOT_AWAY_MS[1]);
      } else if (visiting === 0 || Math.random() < 0.15) {
        b.here = true;
        b.modeUntil = now + rand(BOT_HERE_MS[0], BOT_HERE_MS[1]);
        // en ~la mitad de las visitas dice algo; en el resto solo curiosea
        b.nextChat = Math.random() < 0.5 ? now + rand(2500, 6000) : Infinity;
      } else {
        b.modeUntil = now + rand(3000, 8000);       // ya hay alguien de visita: espera
        return;
      }
      if (!b.seg) b.waitUntil = now;                 // ponte en marcha ya
    }

    // Con suficiente gente real, los bots se retiran; vuelven si la página se vacía.
    function updateBotRetirement() {
      var retire = realCount() >= botsRetireAt, changed = false;
      bots.forEach(function (b) {
        var p = peers[b.id];
        if (!p || !!p.retired === retire) return;
        changed = true;
        p.retired = retire;
        if (retire) {
          if (b.chat) { b.chat = null; p.chat = ""; }
          upsertPeer({ id: b.id, visible: false, chat: "" });
        } else {
          b.here = false; b.seg = null;
          b.modeUntil = performance.now() + rand(3000, 9000);
          b.waitUntil = 0;
        }
      });
      if (changed) renderPresence();
    }

    function updateBots(now) {
      updateBotRetirement();
      bots.forEach(function (b) {
        var p = peers[b.id];
        if (!p || p.retired) return;
        updateBotMode(b, now);

        if (b.seg) {                                   // desplazándose (curva Bézier)
          var s = b.seg, t = Math.min(1, (now - s.t0) / s.dur), e = ease(t), u = 1 - e;
          p.x = u*u*u*s.x0 + 3*u*u*e*s.x1 + 3*u*e*e*s.x2 + e*e*e*s.x3;
          p.y = u*u*u*s.y0 + 3*u*u*e*s.y1 + 3*u*e*e*s.y2 + e*e*e*s.y3;
          setActive(p, now);
          if (t >= 1) { b.seg = null; b.waitUntil = now + (Math.random() < 0.2 ? rand(2500, 5000) : rand(300, 1800)); }
          return;
        }

        if (b.chat) {                                  // escribiendo / mostrando mensaje
          var c = b.chat;
          if (c.i < c.text.length && now >= c.nextAt) {
            c.i++; c.nextAt = now + rand(40, 110);
            upsertPeer({ id: b.id, chat: c.text.slice(0, c.i) });
            if (c.i === c.text.length) c.until = now + rand(2500, 4000);
          } else if (c.until && now >= c.until) {
            b.chat = null;
            upsertPeer({ id: b.id, chat: "" });
            b.nextChat = Infinity;                     // un mensaje por visita como mucho
            b.waitUntil = now + rand(300, 900);
          }
          return;
        }

        var inView = p.y > global.scrollY + 60 && p.y < global.scrollY + innerHeight - 80;
        var someoneTalking = bots.some(function (o) { return o.chat; });
        if (opts.botChat !== false && b.here && now >= b.nextChat && inView && !someoneTalking) {
          b.chat = { text: pick(opts.botPhrases || BOT_PHRASES), i: 0, nextAt: now + rand(300, 700), until: 0 };
          return;
        }

        if (now >= b.waitUntil) {                      // nuevo destino
          var to = pickBotTarget(b.here);
          if (!to) {                                   // página corta: "se va" ocultándose
            if (p.visible) upsertPeer({ id: b.id, visible: false });
            b.waitUntil = now + 1000;
            return;
          }
          if (!p.visible) upsertPeer({ id: b.id, visible: true });
          var dx = to.x - p.x, dy = to.y - p.y, dist = Math.sqrt(dx * dx + dy * dy) || 1;
          var nx = -dy / dist, ny = dx / dist, k1 = rand(-0.25, 0.25) * dist, k2 = rand(-0.2, 0.2) * dist;
          b.seg = { t0: now, dur: Math.max(450, Math.min(1900, 300 + dist * 1.1)),
            x0: p.x, y0: p.y, x3: to.x, y3: to.y,
            x1: p.x + dx * 0.3 + nx * k1, y1: p.y + dy * 0.3 + ny * k1,
            x2: p.x + dx * 0.7 + nx * k2, y2: p.y + dy * 0.7 + ny * k2 };
        } else if (Math.random() < 0.04) {             // micro-movimientos en reposo
          p.x += rand(-2, 2); p.y += rand(-2, 2);
          setActive(p, now);
        }
      });
    }

    // ---- animación ----
    function kick() { if (!raf && !ghost && !destroyed) raf = requestAnimationFrame(tick); }
    function tick(now) {
      raf = 0;
      if (ghost) return;
      if (bots.length) updateBots(now || performance.now());
      var ox = originX(), moving = bots.length > 0;
      var maxX = document.documentElement.scrollWidth - 8;
      for (var id in peers) {
        var p = peers[id];
        var dx = p.x - p.cx, dy = p.y - p.cy;
        if (Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3) {
          p.cx += dx * LERP; p.cy += dy * LERP; moving = true;
        } else { p.cx = p.x; p.cy = p.y; }
        var left = Math.max(0, Math.min(maxX, ox + p.cx));
        p.el.style.transform = "translate3d(" + left + "px," + p.cy + "px,0)";
      }
      if (moving) kick();
    }

    // ---- presencia ----
    function renderPresence() {
      if (!presence) return;
      presence.classList.toggle("mc-ghost", ghost);
      if (toggleBtn) {
        toggleBtn.innerHTML = ghost ? EYE_OFF : EYE;
        var label = ghost ? "Mostrar cursores" : "Ocultar cursores y dejar de compartir el mío";
        toggleBtn.title = label;
        toggleBtn.setAttribute("aria-label", label);
        toggleBtn.setAttribute("aria-pressed", String(ghost));
      }
      if (ghost) { countEl.textContent = "Cursores ocultos"; return; }
      var list = [{ name: me.name, color: me.color, me: true }];
      for (var id in peers) if (peers[id].name && !peers[id].retired) list.push(peers[id]);
      countEl.textContent = list.length === 1 ? "Solo tú" : list.length + " en esta página";
      avatars.innerHTML = "";
      list.slice(0, 6).forEach(function (u) {
        var a = el("div", "mc-avatar" + (u.me ? " mc-me" : ""), avatars);
        a.style.background = u.color; a.style.color = textOn(u.color);
        a.textContent = initials(u.name);
        a.title = u.me ? u.name + " (tú)" : u.name;
      });
      if (list.length > 6) {
        var more = el("div", "mc-avatar", avatars);
        more.style.background = "#E6E6E6"; more.style.color = "#333";
        more.textContent = "+" + (list.length - 6);
      }
    }

    // ---- chat local ----
    function isTyping(t) {
      return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    }
    function placeLocal() { local.style.transform = "translate3d(" + last.cx + "px," + last.cy + "px,0)"; }
    function openChat() {
      if (!last.has) { last.cx = innerWidth / 2; last.cy = innerHeight / 2; }
      clearTimeout(chatTimer);
      placeLocal();
      local.classList.add("mc-open");
      input.value = "";
      input.focus();
    }
    function closeChat(keep) {
      local.classList.remove("mc-open");
      input.blur();
      clearTimeout(chatTimer);
      if (keep && input.value.trim()) {
        chatTimer = setTimeout(function () { send({ chat: "" }); }, CHAT_LINGER_MS);
      } else {
        send({ chat: "" });
      }
    }

    // ---- eventos ----
    function onMove(e) {
      last.cx = e.clientX; last.cy = e.clientY; last.has = true;
      if (local.classList.contains("mc-open")) placeLocal();
      sendPosition();
    }
    function onScroll() { sendPosition(); }
    function onLeave(e) { if (!e.relatedTarget) send({ visible: false }); }
    function onVisibility() { send({ visible: !document.hidden && last.has }); }
    function onKey(e) {
      if (opts.chat === false || ghost) return;
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target)) {
        e.preventDefault(); openChat();
      }
    }
    function onInputKey(e) {
      if (e.key === "Enter") { e.preventDefault(); closeChat(true); }
      else if (e.key === "Escape") { e.preventDefault(); closeChat(false); }
    }
    function onInput() { send({ chat: input.value }); }
    function onInputBlur() { if (local.classList.contains("mc-open")) closeChat(true); }
    function onResize() { kick(); }

    document.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseout", onLeave);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("keydown", onKey);
    global.addEventListener("scroll", onScroll, { passive: true });
    global.addEventListener("resize", onResize);
    input.addEventListener("keydown", onInputKey);
    input.addEventListener("input", onInput);
    input.addEventListener("blur", onInputBlur);

    layer.classList.toggle("mc-off", ghost);
    if (botCount) createBots(botCount);
    renderPresence();
    houseTimer = setInterval(housekeeping, 1000);
    connect();

    return {
      me: me,
      peers: peers,
      get room() { return room; },
      get ghost() { return ghost; },
      setRoom: setRoom,
      setGhost: setGhost,
      destroy: function () {
        destroyed = true;
        clearTimeout(chatTimer); clearTimeout(last.pending); clearInterval(houseTimer);
        cancelAnimationFrame(raf);
        disconnect();
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseout", onLeave);
        document.removeEventListener("visibilitychange", onVisibility);
        document.removeEventListener("keydown", onKey);
        global.removeEventListener("scroll", onScroll);
        global.removeEventListener("resize", onResize);
        [style, layer, local, presence].forEach(function (n) { if (n) n.remove(); });
      }
    };
  }

  global.MultiCursor = { init: init };
})(window);
