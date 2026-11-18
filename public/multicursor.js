/*!
 * MultiCursor — cursores multijugador estilo Figma para cualquier web.
 *
 * Uso mínimo:
 *   <script src="/multicursor.js"></script>
 *   <script>MultiCursor.init();</script>
 *
 * Opciones (todas opcionales):
 *   url       URL del WebSocket            (por defecto ws(s)://<host>/ws)
 *   name      Nombre fijo del usuario      (por defecto aleatorio: "Capibara Zen")
 *   color     Color hex #RRGGBB            (por defecto aleatorio de la paleta)
 *   presence  Mostrar avatares conectados  (true)
 *   chat      Chat de cursor con la tecla "/" (true)
 *   anchor    'center' | 'left' — referencia horizontal para mapear posiciones
 *             entre pantallas de distinto ancho. 'center' encaja con layouts
 *             centrados con max-width (lo habitual).               ('center')
 *
 * Devuelve { me, peers, destroy() }.
 *
 * Protocolo (JSON por WebSocket):
 *   cliente → servidor  { t:"update", name?, color?, x?, y?, visible?, chat? }
 *   servidor → cliente  { t:"welcome", id, peers:[{id,...estado}] }
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

  var SEND_EVERY_MS = 40;   // ~25 envíos/seg como máximo
  var LERP = 0.28;          // suavizado de cursores remotos (0..1)
  var CHAT_LINGER_MS = 4000;

  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  function textOn(hex) {
    var n = parseInt(hex.slice(1), 16);
    var r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 170 ? "#1E1E1E" : "#FFFFFF";
  }

  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(sessionStorage.getItem(key));
      sessionStorage.setItem(key, JSON.stringify(val));
    } catch (e) { return null; }
  }

  function el(tag, cls, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }

  var CSS = [
    ".mc-layer{position:absolute;left:0;top:0;width:0;height:0;overflow:visible;pointer-events:none;z-index:2147483000}",
    ".mc-cursor{position:absolute;left:0;top:0;will-change:transform;transition:opacity .25s ease}",
    ".mc-cursor.mc-hidden{opacity:0}",
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
    "  background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:999px;padding:5px 6px 5px 12px;",
    "  box-shadow:0 4px 16px rgba(0,0,0,.10);font:500 12px/1 Inter,system-ui,-apple-system,sans-serif;color:#555}",
    ".mc-avatars{display:flex}",
    ".mc-avatar{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:600;",
    "  border:2px solid #fff;margin-left:-7px;cursor:default}",
    ".mc-avatar:first-child{margin-left:0}",
    ".mc-avatar.mc-me{outline:2px solid currentColor;outline-offset:-4px}",
    ".mc-hint{opacity:.7}",
    "@media (hover:none){.mc-hint{display:none}}",
    "@media (prefers-color-scheme:dark){.mc-presence{background:#1f1f1f;border-color:rgba(255,255,255,.1);color:#bbb}.mc-avatar{border-color:#1f1f1f}}"
  ].join("\n");

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
    var saved = store("mc:me") || {};
    var me = {
      name: opts.name || saved.name || pick(ANIMALS) + " " + pick(ADJECTIVES),
      color: opts.color || saved.color || pick(COLORS)
    };
    store("mc:me", me);

    var url = opts.url || ((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws");
    var peers = {};        // id -> peer
    var ws = null, myId = null, destroyed = false, retry = 0, retryTimer = null;
    var last = { cx: 0, cy: 0, has: false, sent: 0, pending: null };
    var chatTimer = null, raf = 0;

    // ---- DOM ----
    var style = el("style"); style.textContent = CSS; document.head.appendChild(style);
    var layer = el("div", "mc-layer", document.body);

    var local = el("div", "mc-local", document.body);
    var localTag = el("div", "mc-tag", local);
    localTag.style.background = me.color; localTag.style.color = textOn(me.color);
    var input = el("input", "", localTag);
    input.maxLength = 140; input.placeholder = "Di algo…";
    input.setAttribute("aria-label", "Mensaje de chat del cursor");

    var presence = null, avatars = null, countEl = null;
    if (opts.presence !== false) {
      presence = el("div", "mc-presence", document.body);
      countEl = el("span", "", presence);
      if (opts.chat !== false) {
        var hint = el("span", "mc-hint", presence);
        hint.innerHTML = "· pulsa <b>/</b> para hablar";
      }
      avatars = el("div", "mc-avatars", presence);
    }

    // ---- coordenadas ----
    function originX() { return anchorCenter ? document.documentElement.clientWidth / 2 : 0; }
    function toShared(cx, cy) {
      return { x: Math.round(cx + window.scrollX - originX()), y: Math.round(cy + window.scrollY) };
    }

    // ---- red ----
    function send(obj) {
      if (ws && ws.readyState === 1) { obj.t = "update"; ws.send(JSON.stringify(obj)); }
    }

    function sendPosition() {
      if (!last.has) return;
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
      if (destroyed) return;
      try { ws = new WebSocket(url); } catch (e) { return scheduleRetry(); }
      ws.onopen = function () {
        retry = 0;
        var msg = { name: me.name, color: me.color, visible: false };
        if (last.has) { var p = toShared(last.cx, last.cy); msg.x = p.x; msg.y = p.y; msg.visible = !document.hidden; }
        send(msg);
      };
      ws.onmessage = function (ev) {
        var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.t === "welcome") {
          myId = m.id;
          Object.keys(peers).forEach(removePeer);
          (m.peers || []).forEach(upsertPeer);
        } else if (m.t === "update") {
          upsertPeer(m);
        } else if (m.t === "leave") {
          removePeer(m.id);
        }
        renderPresence();
      };
      ws.onclose = function () {
        Object.keys(peers).forEach(removePeer);
        renderPresence();
        scheduleRetry();
      };
    }

    function scheduleRetry() {
      if (destroyed) return;
      clearTimeout(retryTimer);
      retryTimer = setTimeout(connect, Math.min(10000, 500 * Math.pow(2, retry++)));
    }

    // ---- peers ----
    function upsertPeer(m) {
      var p = peers[m.id];
      if (!p) {
        p = peers[m.id] = { id: m.id, name: "", color: "#888888", x: 0, y: 0, cx: null, cy: null, visible: false, chat: "" };
        p.el = el("div", "mc-cursor mc-hidden", layer);
        p.tag = el("div", "mc-tag");
        p.nameEl = el("div", "mc-name", p.tag);
        p.msgEl = el("div", "mc-msg", p.tag);
      }
      ["name", "color", "x", "y", "visible", "chat"].forEach(function (k) { if (k in m) p[k] = m[k]; });
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

    function removePeer(id) {
      var p = peers[id];
      if (p) { p.el.remove(); delete peers[id]; }
    }

    // ---- animación ----
    function kick() { if (!raf) raf = requestAnimationFrame(tick); }
    function tick() {
      raf = 0;
      var ox = originX(), moving = false;
      var maxX = document.documentElement.scrollWidth - 8;
      Object.keys(peers).forEach(function (id) {
        var p = peers[id];
        var dx = p.x - p.cx, dy = p.y - p.cy;
        if (Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3) {
          p.cx += dx * LERP; p.cy += dy * LERP; moving = true;
        } else { p.cx = p.x; p.cy = p.y; }
        var left = Math.max(0, Math.min(maxX, ox + p.cx));
        p.el.style.transform = "translate3d(" + left + "px," + p.cy + "px,0)";
      });
      if (moving) kick();
    }

    // ---- presencia ----
    function renderPresence() {
      if (!presence) return;
      var list = [{ name: me.name, color: me.color, me: true }];
      Object.keys(peers).forEach(function (id) { if (peers[id].name) list.push(peers[id]); });
      countEl.textContent = list.length === 1 ? "Solo tú" : list.length + " en la página";
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
      if (opts.chat === false) return;
      if (e.key === "/" && !isTyping(e.target)) { e.preventDefault(); openChat(); }
    }
    function onInputKey(e) {
      if (e.key === "Enter") { e.preventDefault(); closeChat(true); }
      else if (e.key === "Escape") { e.preventDefault(); closeChat(false); }
    }
    function onInput() { send({ chat: input.value }); }
    function onResize() { kick(); }

    document.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseout", onLeave);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    input.addEventListener("keydown", onInputKey);
    input.addEventListener("input", onInput);
    input.addEventListener("blur", function () { if (local.classList.contains("mc-open")) closeChat(true); });

    renderPresence();
    connect();

    return {
      me: me,
      peers: peers,
      destroy: function () {
        destroyed = true;
        clearTimeout(retryTimer); clearTimeout(chatTimer); clearTimeout(last.pending);
        cancelAnimationFrame(raf);
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseout", onLeave);
        document.removeEventListener("visibilitychange", onVisibility);
        document.removeEventListener("keydown", onKey);
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onResize);
        if (ws) { ws.onclose = null; ws.close(); }
        [style, layer, local, presence].forEach(function (n) { if (n) n.remove(); });
      }
    };
  }

  global.MultiCursor = { init: init };
})(window);
