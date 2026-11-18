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
 *               en tu misma URL (y se sigue la ruta en SPAs). Un valor fijo
 *               (ej. "global") comparte sala en toda la web.
 *   name        Nombre fijo del usuario           (aleatorio: "Capibara Zen")
 *   color       Color hex #RRGGBB                 (aleatorio de la paleta)
 *   presence    Píldora con avatares conectados   (true)
 *   toggle      Botón para ocultar cursores / dejar de compartir el tuyo (true)
 *   chat        Chat de cursor con la tecla "/"   (true)
 *   reactions   Array de emojis para reaccionar con la tecla "E", o false
 *   clicks      Mostrar los clics de los demás como ondas          (true)
 *   selection   Mostrar el texto que seleccionan los demás         (true)
 *   follow      Seguir a alguien al pulsar su avatar               (true)
 *   editable    Editar tu nombre y color al pulsar tu avatar       (true)
 *   onStats     fn({ page, site, peak }) — cada vez que cambian las cifras
 *   anchor      'center' | 'left' — referencia horizontal para mapear
 *               posiciones entre pantallas de distinto ancho     ('center')
 *   maxCursors  Máximo de cursores visibles (prioriza reales y activos) (12)
 *   idleMs      Tras este tiempo sin moverse, el cursor se atenúa y 💤 (30000)
 *   bots        Usuarios ficticios para que la página no se vea vacía.
 *               Son locales (cada visitante ve los suyos). Se desactivan
 *               con prefers-reduced-motion.                      (0)
 *   botsRetireAt  Los bots se retiran con este nº de personas reales (= bots)
 *   botChat     Los bots escriben mensajes de vez en cuando      (true)
 *   botTargets  Selector CSS de elementos hacia los que van los bots
 *   botPhrases  Array de frases para el chat de los bots
 *
 * Devuelve { me, peers, room, ghost, stats, setRoom(), setGhost(), setIdentity(),
 *            react(emoji), follow(id), unfollow(), destroy() }.
 *
 * Protocolo (JSON por WebSocket, conexión a <url>?room=<sala>):
 *   cliente → servidor  { t:"update", name?, color?, x?, y?, visible?, chat?, sel? }
 *                       { t:"event", kind:"click"|"reaction", x, y, emoji? }
 *   servidor → cliente  { t:"welcome", id, room, peers:[{id,...estado}] }
 *                       { t:"update", id, ...campos }   { t:"leave", id }
 *                       { t:"event", id, kind, x, y, emoji? }
 *                       { t:"stats", room, site, peak }
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
  var REACTIONS = ["❤️", "👍", "🔥", "😂", "🎉", "👏", "😮", "👀"];

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
  var UI = ".mc-presence,.mc-local,.mc-layer,.mc-pop,.mc-picker";

  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function randomName() { return pick(ANIMALS) + " " + pick(ADJECTIVES); }

  function textOn(hex) {
    var n = parseInt(hex.slice(1), 16);
    var r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 170 ? "#1E1E1E" : "#FFFFFF";
  }

  // sessionStorage: identidad aleatoria por pestaña · localStorage: lo que el visitante elige
  function store(area, key, val) {
    try {
      var s = global[area];
      if (val === undefined) return JSON.parse(s.getItem(key));
      if (val === null) return s.removeItem(key);
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

  // Rutas de nodos DOM (índices desde <body>) para compartir selecciones de texto
  function nodePath(node) {
    var path = [];
    while (node && node !== document.body) {
      var parent = node.parentNode;
      if (!parent) return null;
      path.unshift(Array.prototype.indexOf.call(parent.childNodes, node));
      node = parent;
    }
    return node === document.body && path.length <= 64 ? path : null;
  }
  function nodeFromPath(path) {
    var n = document.body;
    for (var i = 0; i < path.length && n; i++) n = n.childNodes[path[i]];
    return n || null;
  }
  function nodeLen(n) { return n.nodeType === 3 ? n.length : n.childNodes.length; }

  var FONT = "Inter,system-ui,-apple-system,'Segoe UI',sans-serif";
  var CSS = [
    /* ancho 100% + overflow-x:clip → los cursores nunca generan scroll horizontal en la web anfitriona */
    ".mc-layer{position:absolute;left:0;top:0;width:100%;height:0;overflow-x:clip;overflow-y:visible;pointer-events:none;z-index:2147483000}",
    ".mc-layer.mc-off{display:none}",
    ".mc-cursor{position:absolute;left:0;top:0;will-change:transform;transition:opacity .3s ease}",
    ".mc-cursor.mc-idle{opacity:.4}",
    ".mc-cursor.mc-idle .mc-name::after{content:' 💤'}",
    ".mc-cursor.mc-hidden,.mc-cursor.mc-capped{opacity:0}",
    ".mc-cursor svg{display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,.25))}",
    ".mc-tag{position:absolute;left:14px;top:16px;font:500 12px/1.2 " + FONT + ";",
    "  padding:4px 8px;border-radius:3px 12px 12px 12px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.18);",
    "  max-width:240px;overflow:hidden;text-overflow:ellipsis}",
    ".mc-tag .mc-msg{display:none;font-size:14px;font-weight:400;margin-top:3px;white-space:normal;word-break:break-word}",
    ".mc-tag.mc-talking{padding:7px 12px 9px;border-radius:3px 16px 16px 16px}",
    ".mc-tag.mc-talking .mc-msg{display:block}",
    ".mc-tag.mc-talking .mc-name{font-size:10px;opacity:.8}",
    /* selecciones, clics y reacciones */
    ".mc-sel{position:absolute;border-radius:2px;opacity:.28;mix-blend-mode:multiply}",
    "@media (prefers-color-scheme:dark){.mc-sel{mix-blend-mode:screen;opacity:.35}}",
    ".mc-ripple{position:absolute;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;border:2.5px solid;",
    "  animation:mc-ripple .65s ease-out forwards}",
    "@keyframes mc-ripple{from{transform:scale(.15);opacity:1}to{transform:scale(1.35);opacity:0}}",
    ".mc-float{position:absolute;font-size:30px;line-height:1;margin:-15px 0 0 -15px;animation:mc-float 1.9s cubic-bezier(.2,.7,.3,1) forwards}",
    "@keyframes mc-float{0%{transform:translate(0,0) scale(.4);opacity:0}12%{transform:translate(0,-10px) scale(1.15);opacity:1}",
    "  100%{transform:translate(var(--dx),-110px) scale(.9) rotate(var(--rot));opacity:0}}",
    "@media (prefers-reduced-motion:reduce){.mc-float{animation-duration:1.2s}.mc-ripple{animation:none;opacity:0}}",
    /* chat local */
    ".mc-local{position:fixed;left:0;top:0;pointer-events:none;z-index:2147483001;display:none}",
    ".mc-local.mc-open{display:block}",
    ".mc-local .mc-tag{pointer-events:auto;padding:7px 12px 9px;border-radius:3px 16px 16px 16px}",
    ".mc-local input{all:unset;font:400 14px/1.2 " + FONT + ";width:200px;color:inherit;caret-color:currentColor}",
    ".mc-local input::placeholder{color:inherit;opacity:.65}",
    /* superficies flotantes (píldora, popovers, selector de emojis) */
    ".mc-presence,.mc-pop,.mc-picker{background:#fff;color:#444;border:1px solid rgba(0,0,0,.08);box-shadow:0 6px 20px rgba(0,0,0,.12);font:500 12px/1 " + FONT + "}",
    ".mc-presence{position:fixed;right:16px;bottom:16px;display:flex;align-items:center;gap:6px;z-index:2147483002;",
    "  border-radius:999px;padding:4px 4px 4px 6px;max-width:calc(100vw - 32px)}",
    ".mc-btn{all:unset;box-sizing:border-box;cursor:pointer;border-radius:999px;display:inline-grid;place-items:center}",
    ".mc-btn:hover{background:rgba(0,0,0,.06)}",
    ".mc-btn:focus-visible{outline:2px solid #0D99FF;outline-offset:1px}",
    ".mc-count{padding:7px 8px;white-space:nowrap}",
    ".mc-icon{width:28px;height:28px;font-size:15px}",
    ".mc-avatars{display:flex;padding:0 2px}",
    ".mc-avatar{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:600;",
    "  border:2px solid #fff;margin-left:-7px;box-sizing:border-box}",
    ".mc-avatars>:first-child{margin-left:0}",
    "button.mc-avatar{all:unset;box-sizing:border-box;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;",
    "  font-size:11px;font-weight:600;border:2px solid #fff;margin-left:-7px;cursor:pointer;transition:transform .15s}",
    "button.mc-avatar:hover{transform:translateY(-2px);position:relative;z-index:1}",
    "button.mc-avatar:focus-visible{outline:2px solid #0D99FF}",
    ".mc-avatar.mc-me{box-shadow:inset 0 0 0 2px rgba(255,255,255,.7)}",
    ".mc-avatar.mc-following{outline:2px solid currentColor;outline-offset:1px}",
    ".mc-hint{opacity:.6;white-space:nowrap;padding-right:2px}",
    ".mc-ghost .mc-avatars,.mc-ghost .mc-hint,.mc-ghost .mc-react-btn{display:none}",
    "@media (hover:none),(max-width:640px){.mc-hint{display:none}}",
    ".mc-pop{position:fixed;right:16px;bottom:64px;z-index:2147483003;border-radius:14px;padding:14px;width:240px;line-height:1.3}",
    ".mc-pop h4{margin:0 0 10px;font-size:12px;font-weight:600;opacity:.7}",
    ".mc-stat{display:flex;justify-content:space-between;padding:6px 0;font-weight:400;font-size:13px}",
    ".mc-stat b{font-weight:600}",
    ".mc-pop input{box-sizing:border-box;width:100%;font:400 14px " + FONT + ";padding:8px 10px;border-radius:8px;",
    "  border:1px solid rgba(0,0,0,.15);background:transparent;color:inherit;margin-bottom:12px}",
    ".mc-swatches{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-bottom:14px}",
    ".mc-swatch{all:unset;cursor:pointer;aspect-ratio:1;border-radius:50%;box-sizing:border-box}",
    ".mc-swatch[aria-pressed=true]{box-shadow:0 0 0 2px #fff,0 0 0 4px currentColor}",
    ".mc-swatch:focus-visible{outline:2px solid #0D99FF;outline-offset:2px}",
    ".mc-row{display:flex;gap:8px;justify-content:space-between}",
    ".mc-row .mc-btn{padding:8px 12px;font-weight:600;font-size:13px}",
    ".mc-primary{background:#1E1E1E;color:#fff}.mc-primary:hover{background:#000}",
    ".mc-picker{position:fixed;z-index:2147483003;display:flex;gap:2px;border-radius:999px;padding:4px}",
    ".mc-picker .mc-btn{width:36px;height:36px;font-size:20px;position:relative}",
    ".mc-picker .mc-btn small{position:absolute;right:3px;bottom:2px;font-size:8px;opacity:.45}",
    /* modo seguir */
    ".mc-follow{position:fixed;inset:0;border:3px solid;pointer-events:none;z-index:2147482999;display:none}",
    ".mc-follow.mc-on{display:block}",
    ".mc-follow span{position:absolute;top:0;left:50%;transform:translateX(-50%);font:600 12px/1 " + FONT + ";",
    "  padding:6px 12px 7px;border-radius:0 0 8px 8px;white-space:nowrap}",
    "@media (prefers-color-scheme:dark){.mc-presence,.mc-pop,.mc-picker{background:#1f1f1f;border-color:rgba(255,255,255,.1);color:#ccc}",
    "  .mc-avatar,button.mc-avatar{border-color:#1f1f1f}.mc-btn:hover{background:rgba(255,255,255,.08)}",
    "  .mc-pop input{border-color:rgba(255,255,255,.2)}.mc-swatch[aria-pressed=true]{box-shadow:0 0 0 2px #1f1f1f,0 0 0 4px currentColor}",
    "  .mc-primary{background:#fff;color:#1E1E1E}.mc-primary:hover{background:#eee}}"
  ].join("\n");

  var EYE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.6 3.5M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7c1.8 0 3.4-.5 4.8-1.3"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M2 2l20 20"/></svg>';
  var SMILE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01M15 9h.01"/></svg>';

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
    var reactions = opts.reactions === false ? null : (opts.reactions || REACTIONS).slice(0, 9);
    var showClicks = opts.clicks !== false, showSel = opts.selection !== false;
    var canFollow = opts.follow !== false, editable = opts.editable !== false && !opts.name;

    var custom = store("localStorage", "mc:me");
    var saved = custom || store("sessionStorage", "mc:me") || {};
    var me = {
      name: opts.name || saved.name || randomName(),
      color: opts.color || saved.color || pick(COLORS)
    };
    if (!custom) store("sessionStorage", "mc:me", me);

    var baseUrl = opts.url || ((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws");
    var autoRoom = opts.room == null;
    var room = autoRoom ? roomFromPath(location.pathname) : String(opts.room).slice(0, 128);
    var ghost = store("localStorage", "mc:ghost") === true;

    var peers = {};        // id -> peer
    var ws = null, destroyed = false, retry = 0, retryTimer = null;
    var last = { cx: 0, cy: 0, has: false, sent: 0, pending: null };
    var chatTimer = null, raf = 0, houseTimer = null, selTimer = null, resizeTimer = null;
    var lastSelJSON = "null", lastClick = 0, lastReact = 0;
    var following = null, openPop = null;
    var serverStats = { room: 0, site: 0, peak: 0 }, statsKey = "";
    var bots = [];

    // ---- DOM ----
    var style = el("style"); style.textContent = CSS; document.head.appendChild(style);
    var layer = el("div", "mc-layer", document.body);
    var selLayer = el("div", "", layer);           // selecciones debajo de los cursores
    var fxLayer = el("div", "", layer);            // ondas y emojis

    var local = el("div", "mc-local", document.body);
    var localTag = el("div", "mc-tag", local);
    var input = el("input", "", localTag);
    input.maxLength = 140; input.placeholder = "Di algo…";
    input.setAttribute("aria-label", "Mensaje de chat del cursor");

    var followBox = el("div", "mc-follow", document.body);
    var followLabel = el("span", "", followBox);

    var presence = null, avatars = null, countBtn = null, toggleBtn = null, reactBtn = null;
    if (opts.presence !== false) {
      presence = el("div", "mc-presence", document.body);
      countBtn = el("button", "mc-btn mc-count", presence);
      countBtn.type = "button";
      countBtn.title = "Ver estadísticas";
      countBtn.addEventListener("click", function () { togglePop("stats"); });
      var hints = [];
      if (opts.chat !== false) hints.push("<b>/</b> chat");
      if (reactions) hints.push("<b>E</b> reacciones");
      if (hints.length) el("span", "mc-hint", presence).innerHTML = hints.join(" · ");
      avatars = el("div", "mc-avatars", presence);
      if (reactions) {
        reactBtn = el("button", "mc-btn mc-icon mc-react-btn", presence);
        reactBtn.type = "button"; reactBtn.innerHTML = SMILE;
        reactBtn.title = "Reaccionar (E)"; reactBtn.setAttribute("aria-label", "Reaccionar");
        reactBtn.addEventListener("click", function () {
          var r = reactBtn.getBoundingClientRect();
          openPicker(r.right, r.top - 8, true);
        });
      }
      if (opts.toggle !== false) {
        toggleBtn = el("button", "mc-btn mc-icon", presence);
        toggleBtn.type = "button";
        toggleBtn.addEventListener("click", function () { setGhost(!ghost); });
      }
    }

    function paintLocalTag() { localTag.style.background = me.color; localTag.style.color = textOn(me.color); }
    paintLocalTag();

    // ---- coordenadas ----
    function originX() { return anchorCenter ? document.documentElement.clientWidth / 2 : 0; }
    function toShared(cx, cy) {
      return { x: Math.round(cx + global.scrollX - originX()), y: Math.round(cy + global.scrollY) };
    }
    function myPoint() {
      return last.has ? toShared(last.cx, last.cy) : toShared(innerWidth / 2, innerHeight / 2);
    }

    // ---- red ----
    function send(obj) {
      if (ws && ws.readyState === 1) { obj.t = obj.t || "update"; ws.send(JSON.stringify(obj)); }
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
        var sel = JSON.parse(lastSelJSON);
        if (sel) msg.sel = sel;
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
        } else if (m.t === "event") {
          onPeerEvent(m);
          return;
        } else if (m.t === "stats") {
          serverStats = { room: m.room | 0, site: m.site | 0, peak: m.peak | 0 };
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
      lastSelJSON = "null";
      serverStats = { room: 0, site: 0, peak: 0 };
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
        unfollow(); closePicker(); closePop();
        disconnect();
      } else {
        retry = 0;
        connect();
        kick();
      }
      renderPresence();
    }

    // ---- identidad editable ----
    function setIdentity(name, color) {
      name = String(name || "").replace(/\s+/g, " ").trim().slice(0, 32) || me.name;
      color = /^#[0-9a-fA-F]{6}$/.test(color || "") ? color.toUpperCase() : me.color;
      me.name = name; me.color = color;
      store("localStorage", "mc:me", me);       // elegido por el visitante: se recuerda
      paintLocalTag();
      send({ name: name, color: color });
      renderPresence();
    }

    // ---- peers ----
    function upsertPeer(m) {
      var p = peers[m.id];
      if (!p) {
        p = peers[m.id] = { id: m.id, name: "", color: "#888888", x: 0, y: 0, cx: null, cy: null,
          visible: false, chat: "", sel: null, selEls: [], lastActive: performance.now() };
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
      if ("sel" in m || "color" in m) { if ("sel" in m) p.sel = m.sel; renderSel(p); }
      if (following === p.id && ("color" in m || "name" in m)) paintFollow(p);
      kick();
    }

    function setActive(p, now) {
      p.lastActive = now;
      if (p.idle) { p.idle = false; p.el.classList.remove("mc-idle"); }
    }

    function removePeer(id) {
      var p = peers[id];
      if (!p) return;
      p.el.remove();
      p.selEls.forEach(function (e) { e.remove(); });
      delete peers[id];
      if (following === id) unfollow();
    }

    function clearRealPeers() {
      Object.keys(peers).forEach(function (id) { if (!peers[id].bot) removePeer(id); });
    }

    function realCount() {
      var n = 0;
      for (var id in peers) if (!peers[id].bot && peers[id].name) n++;
      return n;
    }

    // ---- selección de texto ----
    function textRects(range) {
      var out = [], root = range.commonAncestorContainer;
      function add(r) {
        var rs = r.getClientRects();
        for (var i = 0; i < rs.length && out.length < 120; i++) if (rs[i].width > 1) out.push(rs[i]);
      }
      if (root.nodeType === 3) { add(range); return out; }
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), n;
      while ((n = walker.nextNode()) && out.length < 120) {
        if (!range.intersectsNode(n) || !n.nodeValue.trim()) continue;
        var sub = document.createRange();
        sub.selectNodeContents(n);
        if (n === range.startContainer) sub.setStart(n, range.startOffset);
        if (n === range.endContainer) sub.setEnd(n, range.endOffset);
        add(sub);
      }
      return out;
    }

    function renderSel(p) {
      p.selEls.forEach(function (e) { e.remove(); });
      p.selEls = [];
      if (!showSel || !p.sel || p.retired) return;
      try {
        var a = nodeFromPath(p.sel.a), f = nodeFromPath(p.sel.f);
        if (!a || !f) return;
        var r = document.createRange();
        r.setStart(a, Math.min(p.sel.ao, nodeLen(a)));
        r.setEnd(f, Math.min(p.sel.fo, nodeLen(f)));
        var sx = global.scrollX, sy = global.scrollY;
        textRects(r).forEach(function (rc) {
          var d = el("div", "mc-sel", selLayer);
          d.style.cssText = "left:" + (rc.left + sx) + "px;top:" + (rc.top + sy) + "px;width:" +
            rc.width + "px;height:" + rc.height + "px;background:" + p.color;
          p.selEls.push(d);
        });
      } catch (e) { /* el DOM no coincide: no se dibuja */ }
    }

    function readSelection() {
      var s = global.getSelection && getSelection();
      if (!s || !s.rangeCount || s.isCollapsed) return null;
      var r = s.getRangeAt(0), c = r.commonAncestorContainer;
      var host = c.nodeType === 3 ? c.parentNode : c;
      if (!host || !host.closest || host.closest(UI + ",input,textarea,[contenteditable]")) return null;
      var a = nodePath(r.startContainer), f = nodePath(r.endContainer);
      return a && f ? { a: a, ao: r.startOffset, f: f, fo: r.endOffset } : null;
    }

    function onSelectionChange() {
      clearTimeout(selTimer);
      selTimer = setTimeout(function () {
        var json = JSON.stringify(readSelection());
        if (json === lastSelJSON) return;
        lastSelJSON = json;
        send({ sel: JSON.parse(json) });
      }, 150);
    }

    // ---- clics y reacciones ----
    function fxAt(shared, node) {
      node.style.left = (originX() + shared.x) + "px";
      node.style.top = shared.y + "px";
      fxLayer.appendChild(node);
      node.addEventListener("animationend", function () { node.remove(); });
      setTimeout(function () { node.remove(); }, 2500);
    }
    function spawnRipple(shared, color) {
      if (!showClicks) return;
      var r = el("div", "mc-ripple");
      r.style.borderColor = color;
      fxAt(shared, r);
    }
    function spawnReaction(shared, emoji) {
      for (var i = 0; i < 3; i++) {
        (function (i) {
          setTimeout(function () {
            var f = el("div", "mc-float");
            f.textContent = emoji;
            f.style.setProperty("--dx", rand(-40, 40) + "px");
            f.style.setProperty("--rot", rand(-25, 25) + "deg");
            fxAt({ x: shared.x + rand(-10, 10), y: shared.y + rand(-6, 6) }, f);
          }, i * 110);
        })(i);
      }
    }

    function react(emoji) {
      if (ghost || !emoji) return;
      var now = performance.now();
      if (now - lastReact < 250) return;
      lastReact = now;
      var pt = myPoint();
      spawnReaction(pt, emoji);
      send({ t: "event", kind: "reaction", emoji: emoji, x: pt.x, y: pt.y });
    }

    function onPeerEvent(m) {
      var p = peers[m.id];
      if (!p || ghost) return;
      setActive(p, performance.now());
      if (m.kind === "click") spawnRipple(m, p.color);
      else if (m.kind === "reaction" && m.emoji) spawnReaction(m, m.emoji);
    }

    // selector de emojis
    var picker = null;
    function openPicker(x, y, fromButton) {
      if (!reactions || ghost) return;
      closePicker(); closePop();
      picker = el("div", "mc-picker", document.body);
      picker.setAttribute("role", "menu");
      reactions.forEach(function (emo, i) {
        var b = el("button", "mc-btn", picker);
        b.type = "button"; b.setAttribute("role", "menuitem");
        b.innerHTML = emo + "<small>" + (i + 1) + "</small>";
        b.title = "Reaccionar " + emo + " (" + (i + 1) + ")";
        b.addEventListener("click", function () { closePicker(); react(emo); });
      });
      var w = picker.offsetWidth, h = picker.offsetHeight;
      var left = fromButton ? x - w : x - w / 2, top = fromButton ? y - h : y - h - 18;
      picker.style.left = Math.max(8, Math.min(innerWidth - w - 8, left)) + "px";
      picker.style.top = Math.max(8, Math.min(innerHeight - h - 8, top)) + "px";
      if (fromButton) picker.querySelector("button").focus();
    }
    function closePicker() { if (picker) { picker.remove(); picker = null; } }

    // ---- seguir a alguien ----
    function paintFollow(p) {
      followBox.style.borderColor = p.color;
      followLabel.style.background = p.color;
      followLabel.style.color = textOn(p.color);
      followLabel.textContent = "Siguiendo a " + p.name + " · Esc para salir";
    }
    function follow(id) {
      var p = peers[id];
      if (!p || ghost || !canFollow) return;
      following = id;
      paintFollow(p);
      followBox.classList.add("mc-on");
      renderPresence();
      kick();
    }
    function unfollow() {
      if (following === null) return;
      following = null;
      followBox.classList.remove("mc-on");
      renderPresence();
    }

    // ---- popovers: estadísticas y edición de identidad ----
    function closePop() { if (openPop) { openPop.el.remove(); openPop = null; } }
    function togglePop(kind) {
      if (openPop && openPop.kind === kind) return closePop();
      closePop(); closePicker();
      if (kind === "stats") return openStats();
      if (kind === "edit") return openEdit();
    }

    function currentStats() {
      if (ghost) return { page: 0, site: 0, peak: 0 };
      var nb = activeBots();
      var page = 1 + realCount() + nb;             // tú + personas + bots
      return { page: page, site: Math.max(page, serverStats.site + nb), peak: Math.max(page, serverStats.peak + nb) };
    }
    function activeBots() {
      var n = 0;
      for (var id in peers) if (peers[id].bot && !peers[id].retired) n++;
      return n;
    }

    function openStats() {
      var pop = el("div", "mc-pop", document.body);
      pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", "Estadísticas");
      el("h4", "", pop).textContent = "Ahora mismo";
      var rows = [["page", "En esta página"], ["site", "En toda la web"], ["peak", "Pico de hoy en esta página"]];
      var vals = {};
      rows.forEach(function (r) {
        var row = el("div", "mc-stat", pop);
        el("span", "", row).textContent = r[1];
        vals[r[0]] = el("b", "", row);
      });
      openPop = { kind: "stats", el: pop, update: function (s) {
        rows.forEach(function (r) { vals[r[0]].textContent = s[r[0]]; });
      } };
      openPop.update(currentStats());
    }

    function openEdit() {
      var pop = el("div", "mc-pop", document.body), color = me.color;
      pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", "Tu cursor");
      el("h4", "", pop).textContent = "Tu cursor";
      var nameIn = el("input", "", pop);
      nameIn.value = me.name; nameIn.maxLength = 32; nameIn.setAttribute("aria-label", "Tu nombre");
      var sw = el("div", "mc-swatches", pop);
      COLORS.forEach(function (c) {
        var b = el("button", "mc-swatch", sw);
        b.type = "button"; b.style.background = c; b.style.color = c;
        b.setAttribute("aria-label", "Color " + c);
        b.setAttribute("aria-pressed", String(c === color));
        b.addEventListener("click", function () {
          color = c;
          sw.querySelectorAll(".mc-swatch").forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); });
        });
      });
      var row = el("div", "mc-row", pop);
      var dice = el("button", "mc-btn", row); dice.type = "button"; dice.textContent = "🎲 Aleatorio";
      dice.addEventListener("click", function () { nameIn.value = randomName(); nameIn.focus(); });
      var save = el("button", "mc-btn mc-primary", row); save.type = "button"; save.textContent = "Guardar";
      function commit() { setIdentity(nameIn.value, color); closePop(); }
      save.addEventListener("click", commit);
      nameIn.addEventListener("keydown", function (e) {
        e.stopPropagation();
        if (e.key === "Enter") commit();
        else if (e.key === "Escape") closePop();
      });
      openPop = { kind: "edit", el: pop };
      nameIn.focus(); nameIn.select();
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
        var capped = i >= maxCursors && p.id !== following;
        if (capped !== !!p.capped) { p.capped = capped; p.el.classList.toggle("mc-capped", capped); }
      });
      emitStats();
    }

    function emitStats() {
      var s = currentStats(), key = s.page + "|" + s.site + "|" + s.peak;
      if (key === statsKey) return;
      statsKey = key;
      if (openPop && openPop.update) openPop.update(s);
      if (typeof opts.onStats === "function") { try { opts.onStats(s); } catch (e) { /* no rompas la web */ } }
    }

    // ---- bots: usuarios ficticios ----
    // Elige un punto "interesante" (un botón, un titular...) en coordenadas compartidas.
    // here=true → dentro de lo que el visitante ve; here=false → fuera de su vista
    // (devuelve null si la página es tan corta que no hay "fuera").
    function pickBotTarget(here) {
      var vis = [], out = [], vh = innerHeight, vw = document.documentElement.clientWidth;
      var els = document.querySelectorAll(opts.botTargets || BOT_TARGETS);
      for (var i = 0; i < els.length; i++) {
        if (els[i].closest(UI)) continue;
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
        do { name = randomName(); } while (names[name] && ++tries < 50);
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
      if (now < b.modeUntil || b.chat || following === b.id) return;
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
          if (b.chat) b.chat = null;
          if (following === b.id) unfollow();
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
          if (t >= 1) {
            b.seg = null;
            b.waitUntil = now + (Math.random() < 0.2 ? rand(2500, 5000) : rand(300, 1800));
            if (b.here) {                              // al llegar: a veces hace clic o reacciona
              var roll = Math.random();
              if (roll < 0.22) spawnRipple(p, p.color);
              else if (roll < 0.27 && reactions) spawnReaction(p, pick(reactions));
            }
          }
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
      var ox = originX(), moving = bots.length > 0 || following !== null;
      // clientWidth (no scrollWidth): así un cursor lejano nunca provoca scroll horizontal
      var maxX = document.documentElement.clientWidth - 24;
      for (var id in peers) {
        var p = peers[id];
        var dx = p.x - p.cx, dy = p.y - p.cy;
        if (Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3) {
          p.cx += dx * LERP; p.cy += dy * LERP; moving = true;
        } else { p.cx = p.x; p.cy = p.y; }
        var left = Math.max(0, Math.min(maxX, ox + p.cx));
        p.el.style.transform = "translate3d(" + left + "px," + p.cy + "px,0)";
      }
      if (following !== null && peers[following]) {   // la vista sigue al cursor elegido
        var f = peers[following];
        var target = Math.max(0, f.cy - innerHeight * 0.4);
        var d = target - global.scrollY;
        if (Math.abs(d) > 1) global.scrollTo({ left: global.scrollX, top: global.scrollY + d * 0.12, behavior: "instant" });
      }
      if (moving) kick();
    }

    // ---- presencia ----
    function renderPresence() {
      if (!presence) { emitStats(); return; }
      presence.classList.toggle("mc-ghost", ghost);
      if (toggleBtn) {
        toggleBtn.innerHTML = ghost ? EYE_OFF : EYE;
        var label = ghost ? "Mostrar cursores" : "Ocultar cursores y dejar de compartir el mío";
        toggleBtn.title = label;
        toggleBtn.setAttribute("aria-label", label);
        toggleBtn.setAttribute("aria-pressed", String(ghost));
      }
      if (ghost) { countBtn.textContent = "Cursores ocultos"; countBtn.disabled = true; emitStats(); return; }
      countBtn.disabled = false;
      var list = [{ id: null, name: me.name, color: me.color, me: true }];
      for (var id in peers) if (peers[id].name && !peers[id].retired) list.push(peers[id]);
      countBtn.textContent = list.length === 1 ? "Solo tú" : list.length + " en esta página";
      emitStats();
      // solo se reconstruye si cambia algo visible (si no, un clic en un avatar podría perderse)
      var key = following + "|" + list.map(function (u) { return u.id + u.name + u.color; }).join("|");
      if (key === avatars._key) return;
      avatars._key = key;
      avatars.innerHTML = "";
      list.slice(0, 6).forEach(function (u) {
        var clickable = u.me ? editable : canFollow;
        var a = el(clickable ? "button" : "div", "mc-avatar" + (u.me ? " mc-me" : "") +
          (u.id !== null && u.id === following ? " mc-following" : ""), avatars);
        a.style.background = u.color; a.style.color = textOn(u.color);
        a.textContent = initials(u.name);
        var label = u.me ? u.name + " (tú)" + (editable ? " · cambiar nombre y color" : "")
          : u.name + (canFollow ? (u.id === following ? " · dejar de seguir" : " · seguir") : "");
        a.title = label;
        if (clickable) {
          a.type = "button";
          a.setAttribute("aria-label", label);
          a.addEventListener("click", function () {
            if (u.me) togglePop("edit");
            else if (following === u.id) unfollow();
            else follow(u.id);
          });
        }
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
      closePicker();
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
    function onDown(e) {
      var t = e.target;
      if (openPop && !openPop.el.contains(t) && !(presence && presence.contains(t))) closePop();
      if (picker && !picker.contains(t) && t !== reactBtn && !(reactBtn && reactBtn.contains(t))) closePicker();
      if (e.button !== 0 || ghost || (t.closest && t.closest(UI))) return;
      var now = performance.now();
      if (now - lastClick < 120) return;
      lastClick = now;
      var pt = toShared(e.clientX, e.clientY);
      send({ t: "event", kind: "click", x: pt.x, y: pt.y });
    }
    function onKey(e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") { closePicker(); closePop(); unfollow(); return; }
      if (picker && /^[1-9]$/.test(e.key) && reactions[+e.key - 1]) {
        e.preventDefault(); var emo = reactions[+e.key - 1]; closePicker(); react(emo); return;
      }
      if (ghost || isTyping(e.target)) return;
      if (e.key === "/" && opts.chat !== false) { e.preventDefault(); openChat(); }
      else if ((e.key === "e" || e.key === "E") && reactions) {
        e.preventDefault();
        if (picker) closePicker();
        else openPicker(last.has ? last.cx : innerWidth / 2, last.has ? last.cy : innerHeight / 2, false);
      } else if (following !== null && /^(Arrow(Up|Down)|Page(Up|Down)|Home|End| )$/.test(e.key)) {
        unfollow();                                  // el usuario retoma el control del scroll
      }
    }
    function onUserScrollIntent() { unfollow(); }
    function onInputKey(e) {
      if (e.key === "Enter") { e.preventDefault(); closeChat(true); }
      else if (e.key === "Escape") { e.preventDefault(); closeChat(false); }
    }
    function onInput() { send({ chat: input.value }); }
    function onInputBlur() { if (local.classList.contains("mc-open")) closeChat(true); }
    function onResize() {
      kick();
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { for (var id in peers) if (peers[id].sel) renderSel(peers[id]); }, 150);
    }

    document.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseout", onLeave);
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("keydown", onKey);
    document.addEventListener("selectionchange", onSelectionChange);
    global.addEventListener("wheel", onUserScrollIntent, { passive: true });
    global.addEventListener("touchstart", onUserScrollIntent, { passive: true });
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
      get stats() { return currentStats(); },
      setRoom: setRoom,
      setGhost: setGhost,
      setIdentity: setIdentity,
      react: react,
      follow: follow,
      unfollow: unfollow,
      destroy: function () {
        destroyed = true;
        clearTimeout(chatTimer); clearTimeout(last.pending); clearTimeout(selTimer); clearTimeout(resizeTimer);
        clearInterval(houseTimer);
        cancelAnimationFrame(raf);
        disconnect();
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseout", onLeave);
        document.removeEventListener("mousedown", onDown, true);
        document.removeEventListener("visibilitychange", onVisibility);
        document.removeEventListener("keydown", onKey);
        document.removeEventListener("selectionchange", onSelectionChange);
        global.removeEventListener("wheel", onUserScrollIntent);
        global.removeEventListener("touchstart", onUserScrollIntent);
        global.removeEventListener("scroll", onScroll);
        global.removeEventListener("resize", onResize);
        closePicker(); closePop();
        [style, layer, local, presence, followBox].forEach(function (n) { if (n) n.remove(); });
      }
    };
  }

  global.MultiCursor = { init: init };
})(window);
