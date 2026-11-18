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
 *   presence    Píldora: personas · chat · reacciones · tu perfil (true)
 *   onboarding  Aviso de bienvenida la primera vez que alguien entra (true)
 *   toggle      Interruptor de "modo fantasma" en tu perfil       (true)
 *   chat        Chat de cursor con la tecla "/"   (true)
 *   reactions   Array de emojis para reaccionar con la tecla "E", o false
 *   clicks      Mostrar los clics de los demás como ondas          (true)
 *   selection   Mostrar el texto que seleccionan los demás         (true)
 *   follow      Botón "Seguir" en el panel de personas             (true)
 *   editable    Editar nombre, color y foto en tu perfil           (true)
 *   onStats     fn({ page, site, peak }) — cada vez que cambian las cifras
 *   anchor      'center' | 'left' — referencia horizontal para mapear
 *               posiciones entre pantallas de distinto ancho     ('center')
 *   maxCursors  Máximo de cursores visibles (prioriza reales y activos) (12)
 *   idleMs      Tras este tiempo sin moverse, el cursor se atenúa con "zzz" (30000)
 *   bots        Usuarios ficticios para que la página no se vea vacía.
 *               Son locales (cada visitante ve los suyos). Se desactivan
 *               con prefers-reduced-motion.                      (0)
 *   botsRetireAt  Los bots se retiran con este nº de personas reales (= bots)
 *   botChat     Los bots escriben mensajes de vez en cuando      (true)
 *   botTargets  Selector CSS de elementos hacia los que van los bots
 *   botPhrases  Array de frases para el chat de los bots
 *
 * Devuelve { me, peers, room, ghost, stats, setRoom(), setGhost(), setIdentity(),
 *            open("people"|"profile"|"chat"|"reactions"), close(),
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
  var UI = ".mc-presence,.mc-local,.mc-layer,.mc-pop,.mc-picker,.mc-coach,.mc-follow";

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
    /* reposo: el cursor se atenúa y le salen "z" animadas */
    ".mc-cursor svg,.mc-cursor .mc-tag{transition:opacity .3s ease}",
    ".mc-cursor.mc-idle svg,.mc-cursor.mc-idle .mc-tag{opacity:.4}",
    ".mc-zzz{position:absolute;left:22px;top:-16px;display:none;font:800 16px/1 " + FONT + ";pointer-events:none;",
    "  text-shadow:0 1px 2px rgba(0,0,0,.25)}",
    ".mc-cursor.mc-idle .mc-zzz{display:block}",
    ".mc-zzz span{position:absolute;left:0;top:0;opacity:0;animation:mc-z 2.4s ease-in-out infinite}",
    ".mc-zzz span:nth-child(2){animation-delay:.8s;font-size:13px}",
    ".mc-zzz span:nth-child(3){animation-delay:1.6s;font-size:11px}",
    "@keyframes mc-z{0%{transform:translate(0,6px) scale(.6);opacity:0}20%{opacity:1}100%{transform:translate(16px,-20px) scale(1.2);opacity:0}}",
    "@media (prefers-reduced-motion:reduce){.mc-zzz span{animation:none}.mc-zzz span:first-child{opacity:1}}",
    ".mc-cursor.mc-hidden,.mc-cursor.mc-capped{opacity:0}",
    ".mc-cursor.mc-self{display:none}",
    ".mc-cursor svg{display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,.25))}",
    ".mc-tag{position:absolute;left:14px;top:16px;font:500 12px/1.2 " + FONT + ";",
    "  padding:4px 8px;border-radius:3px 12px 12px 12px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.18);",
    "  max-width:240px;overflow:hidden;text-overflow:ellipsis}",
    ".mc-tag .mc-msg{display:none;font-size:14px;font-weight:400;margin-top:3px;white-space:normal;word-break:break-word;",
    "  width:max-content;max-width:216px}",
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
    /* ---------- píldora, paneles, tooltip y aviso inicial ---------- */
    ".mc-presence,.mc-pop,.mc-picker,.mc-coach{background:#fff;color:#1E1E1E;border:1px solid rgba(0,0,0,.08);",
    "  box-shadow:0 8px 28px rgba(0,0,0,.14);font:500 13px/1.3 " + FONT + "}",
    ".mc-presence{position:fixed;right:16px;bottom:16px;display:flex;align-items:center;gap:2px;z-index:2147483002;",
    "  border-radius:999px;padding:4px;max-width:calc(100vw - 32px)}",
    ".mc-btn{all:unset;box-sizing:border-box;cursor:pointer;border-radius:999px;display:inline-flex;align-items:center;",
    "  justify-content:center;gap:8px;transition:background .15s}",
    ".mc-btn:hover,.mc-btn[aria-expanded=true]{background:rgba(0,0,0,.06)}",
    ".mc-btn:focus-visible{outline:2px solid #0D99FF;outline-offset:1px}",
    ".mc-people{height:36px;padding:0 12px 0 4px;font-weight:600;white-space:nowrap}",
    ".mc-people.mc-alone{padding-left:10px;font-weight:500;opacity:.8}",
    ".mc-stack{display:flex}",
    ".mc-avatar{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:700;",
    "  border:2px solid #fff;margin-left:-8px;box-sizing:border-box;overflow:hidden;flex:none}",
    ".mc-stack>:first-child{margin-left:0}",
    ".mc-avatar.mc-more{background:#EDEDED;color:#333}",
    ".mc-icon{width:36px;height:36px}",
    ".mc-sep{width:1px;height:20px;background:rgba(0,0,0,.1);margin:0 4px;flex:none}",
    ".mc-me-btn{height:36px;padding:0 6px 0 4px;gap:3px}",
    ".mc-me-btn .mc-avatar{margin:0;border:0;box-shadow:inset 0 0 0 2px rgba(255,255,255,.55)}",
    ".mc-chev{opacity:.45;transition:transform .15s}",
    ".mc-me-btn[aria-expanded=true] .mc-chev{transform:rotate(180deg)}",
    ".mc-ghost-bar{display:none;align-items:center;gap:8px;padding:0 0 0 10px;white-space:nowrap}",
    ".mc-presence.mc-ghost>*{display:none}",
    ".mc-presence.mc-ghost>.mc-ghost-bar{display:flex}",
    ".mc-pill-btn{height:30px;padding:0 14px;font-weight:600;background:#1E1E1E;color:#fff}",
    ".mc-pill-btn:hover{background:#000}",
    "@media (hover:none){.mc-chat-btn{display:none}}",
    /* tooltip con atajo de teclado */
    ".mc-tooltip{position:fixed;left:0;top:0;z-index:2147483004;pointer-events:none;background:#1E1E1E;color:#fff;",
    "  font:500 12px/1 " + FONT + ";padding:7px 9px;border-radius:7px;white-space:nowrap;opacity:0;transform:translateY(4px);",
    "  transition:opacity .12s,transform .12s}",
    ".mc-tooltip.mc-on{opacity:1;transform:none}",
    ".mc-tooltip kbd{font:600 11px/1 ui-monospace,Menlo,monospace;background:rgba(255,255,255,.18);border-radius:4px;padding:2px 5px;margin-left:8px}",
    "@media (hover:none){.mc-tooltip{display:none}}",
    ".mc-pop kbd,.mc-coach kbd{font:600 11px/1 ui-monospace,Menlo,monospace;border:1px solid rgba(0,0,0,.18);border-bottom-width:2px;",
    "  border-radius:5px;padding:1px 5px;margin:0 1px}",
    /* paneles */
    ".mc-pop{position:fixed;right:16px;bottom:68px;z-index:2147483003;border-radius:16px;width:300px;max-width:calc(100vw - 32px);",
    "  overflow:hidden;animation:mc-in .16s ease-out}",
    "@keyframes mc-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}",
    ".mc-pop-body{padding:16px}",
    ".mc-pop h4{margin:0 0 14px;font-size:14px;font-weight:700}",
    ".mc-head{display:flex;align-items:center;gap:12px;padding:16px;border-bottom:1px solid rgba(0,0,0,.07)}",
    ".mc-big{font-size:34px;font-weight:700;letter-spacing:-.03em;line-height:1}",
    ".mc-sub{font-size:12px;font-weight:400;opacity:.6;margin-top:3px}",
    ".mc-list{list-style:none;margin:0;padding:6px;max-height:300px;overflow:auto}",
    ".mc-person{display:flex;align-items:center;gap:10px;padding:8px;border-radius:10px}",
    ".mc-person:hover{background:rgba(0,0,0,.035)}",
    ".mc-person .mc-avatar{margin:0;border:0;width:34px;height:34px;font-size:12px}",
    ".mc-who{flex:1;min-width:0}",
    ".mc-who b{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".mc-status{font-size:12px;font-weight:400;opacity:.65;display:flex;align-items:center;gap:6px;margin-top:1px}",
    ".mc-status i{width:7px;height:7px;border-radius:50%;background:#14AE5C;display:inline-block}",
    ".mc-status.mc-away i{background:#B3B3B3}",
    ".mc-status.mc-typing i{background:#0D99FF}",
    ".mc-act{height:30px;padding:0 12px;font-size:12px;font-weight:600;border:1px solid rgba(0,0,0,.14);flex:none}",
    ".mc-act.mc-on{background:#1E1E1E;color:#fff;border-color:#1E1E1E}",
    ".mc-act.mc-on:hover{background:#000}",
    ".mc-foot{margin:0;padding:11px 16px 13px;font-size:12px;font-weight:400;opacity:.65;border-top:1px solid rgba(0,0,0,.07);line-height:1.45}",
    ".mc-divider{height:1px;background:rgba(0,0,0,.07);margin:16px -16px}",
    ".mc-switch-row{display:flex;align-items:center;gap:12px}",
    ".mc-switch-row b{display:block;font-weight:600}",
    ".mc-switch-row small{display:block;font-size:12px;font-weight:400;opacity:.6;margin-top:2px;line-height:1.35}",
    ".mc-switch{all:unset;flex:none;width:38px;height:22px;border-radius:999px;background:rgba(0,0,0,.18);position:relative;cursor:pointer;transition:background .15s}",
    ".mc-switch::after{content:'';position:absolute;left:3px;top:3px;width:16px;height:16px;border-radius:50%;background:#fff;",
    "  box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s}",
    ".mc-switch[aria-checked=true]{background:#0D99FF}",
    ".mc-switch[aria-checked=true]::after{transform:translateX(16px)}",
    ".mc-switch:focus-visible{outline:2px solid #0D99FF;outline-offset:2px}",
    ".mc-pop input{box-sizing:border-box;width:100%;font:400 14px " + FONT + ";padding:9px 11px;border-radius:9px;",
    "  border:1px solid rgba(0,0,0,.15);background:transparent;color:inherit;margin-bottom:12px}",
    ".mc-pop input:focus{outline:2px solid #0D99FF;outline-offset:-1px;border-color:transparent}",
    ".mc-label{display:block;font-size:12px;font-weight:600;opacity:.6;margin:0 0 6px}",
    ".mc-swatches{display:grid;grid-template-columns:repeat(6,1fr);gap:7px;margin-bottom:16px}",
    ".mc-face{width:100%;height:100%;border-radius:50%;object-fit:cover;display:block}",
    /* nombre del cursor: foto + texto alineados en una fila, sin salirse de la etiqueta */
    ".mc-name{display:flex;align-items:center;gap:6px;min-width:0}",
    ".mc-name>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".mc-tag-av{width:18px;height:18px;flex:none;border-radius:50%;object-fit:cover;display:block;",
    "  box-shadow:0 0 0 1.5px rgba(255,255,255,.75)}",
    ".mc-tag-av[hidden]{display:none}",
    ".mc-tag.mc-has-av:not(.mc-talking){padding:3px 10px 3px 3px;border-radius:4px 14px 14px 14px}",
    ".mc-tag.mc-talking .mc-tag-av{width:14px;height:14px}",
    ".mc-photo{display:flex;align-items:center;gap:12px;margin-bottom:16px}",
    ".mc-photo .mc-avatar{width:56px;height:56px;margin:0;border:0;font-size:18px}",
    ".mc-photo small{display:block;font-size:11px;font-weight:400;opacity:.6;margin-top:6px;line-height:1.3}",
    ".mc-outline{border:1px solid rgba(0,0,0,.15);padding:7px 11px;font-size:12px;font-weight:600}",
    ".mc-link{all:unset;cursor:pointer;font-size:12px;margin-left:8px;opacity:.7;text-decoration:underline}",
    ".mc-link:hover{opacity:1}",
    ".mc-swatch{all:unset;cursor:pointer;aspect-ratio:1;border-radius:50%;box-sizing:border-box}",
    ".mc-swatch[aria-pressed=true]{box-shadow:0 0 0 2px #fff,0 0 0 4px currentColor}",
    ".mc-swatch:focus-visible{outline:2px solid #0D99FF;outline-offset:2px}",
    ".mc-row{display:flex;gap:8px;justify-content:space-between}",
    ".mc-row .mc-btn{padding:9px 14px;font-weight:600;font-size:13px}",
    ".mc-primary{background:#1E1E1E;color:#fff}.mc-primary:hover{background:#000}",
    ".mc-picker{position:fixed;z-index:2147483003;display:flex;gap:2px;border-radius:999px;padding:4px;animation:mc-in .16s ease-out}",
    ".mc-picker .mc-btn{width:38px;height:38px;font-size:21px}",
    ".mc-picker .mc-btn:hover{transform:scale(1.15)}",
    /* aviso de primera visita */
    ".mc-coach{position:fixed;right:16px;bottom:72px;z-index:2147483003;border-radius:14px;padding:16px;width:290px;",
    "  max-width:calc(100vw - 32px);box-sizing:border-box;animation:mc-in .25s ease-out}",
    ".mc-coach b{display:block;font-size:14px;margin-bottom:6px}",
    ".mc-coach p{margin:0 0 14px;font-weight:400;opacity:.75;line-height:1.5}",
    ".mc-coach::after{content:'';position:absolute;right:34px;bottom:-7px;width:12px;height:12px;background:inherit;",
    "  border-right:1px solid rgba(0,0,0,.08);border-bottom:1px solid rgba(0,0,0,.08);transform:rotate(45deg)}",
    /* modo seguir */
    ".mc-follow{position:fixed;inset:0;border:3px solid;pointer-events:none;z-index:2147482999;display:none}",
    ".mc-follow.mc-on{display:block}",
    ".mc-follow button{all:unset;pointer-events:auto;cursor:pointer;position:absolute;top:0;left:50%;transform:translateX(-50%);",
    "  font:600 12px/1 " + FONT + ";padding:7px 12px 8px;border-radius:0 0 9px 9px;white-space:nowrap}",
    ".mc-follow button span{font-weight:500;opacity:.8;margin-left:8px}",
    ".mc-follow button:hover span{opacity:1;text-decoration:underline}",
    ".mc-follow button:focus-visible{outline:2px solid #0D99FF}",
    /* modo oscuro */
    "@media (prefers-color-scheme:dark){",
    "  .mc-presence,.mc-pop,.mc-picker,.mc-coach{background:#1f1f1f;border-color:rgba(255,255,255,.1);color:#EEE}",
    "  .mc-avatar{border-color:#1f1f1f}.mc-btn:hover,.mc-btn[aria-expanded=true]{background:rgba(255,255,255,.08)}",
    "  .mc-sep{background:rgba(255,255,255,.12)}.mc-avatar.mc-more{background:#333;color:#ddd}",
    "  .mc-pill-btn,.mc-primary,.mc-act.mc-on{background:#fff;color:#1E1E1E;border-color:#fff}",
    "  .mc-pill-btn:hover,.mc-primary:hover,.mc-act.mc-on:hover{background:#e6e6e6}",
    "  .mc-act,.mc-outline,.mc-pop input{border-color:rgba(255,255,255,.2)}",
    "  .mc-head,.mc-foot{border-color:rgba(255,255,255,.08)}.mc-divider{background:rgba(255,255,255,.08)}",
    "  .mc-person:hover{background:rgba(255,255,255,.05)}.mc-switch{background:rgba(255,255,255,.2)}",
    "  .mc-swatch[aria-pressed=true]{box-shadow:0 0 0 2px #1f1f1f,0 0 0 4px currentColor}",
    "  .mc-pop kbd,.mc-coach kbd{border-color:rgba(255,255,255,.25)}",
    "  .mc-coach::after{border-color:rgba(255,255,255,.1)}}"
  ].join("\n");

  function icon(paths, size) {
    return '<svg width="' + (size || 18) + '" height="' + (size || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
      ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  }
  var ICON_CHAT = icon('<path d="M21 12a8.5 8.5 0 0 1-12.3 7.6L3 21l1.5-5.2A8.5 8.5 0 1 1 21 12z"/>');
  var ICON_SMILE = icon('<circle cx="12" cy="12" r="9.5"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9.5h.01M15 9.5h.01"/>');
  var ICON_PEOPLE = icon('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>', 16);
  var ICON_CHEV = '<svg class="mc-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 15l-6-6-6 6"/></svg>';
  var ICON_EYE_OFF = icon('<path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.6 3.5M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7c1.8 0 3.4-.5 4.8-1.3"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M2 2l20 20"/>', 16);

  function cursorSVG(color) {
    return '<svg width="20" height="22" viewBox="0 0 20 22" fill="none">' +
      '<path d="M2 2 L2 17.5 L6.3 13.4 L9.3 20 L12.2 18.7 L9.3 12.3 L15.4 12.3 Z" fill="' + color +
      '" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  }

  function initials(name) {
    return name.split(/\s+/).map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase();
  }

  // ---- fotos de perfil: data URL pequeña (≤14 KB) validada en cliente y servidor ----
  var AVATAR_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/;
  var AVATAR_MAX = 14000;
  function validAvatar(v) { return typeof v === "string" && v.length <= AVATAR_MAX && AVATAR_RE.test(v) ? v : ""; }

  // Pinta la foto (o las iniciales si no hay) dentro de un avatar
  function avatarFace(node, name, avatar) {
    node.textContent = "";
    if (avatar) {
      var img = document.createElement("img");
      img.className = "mc-face"; img.alt = ""; img.src = avatar;
      node.appendChild(img);
    } else {
      node.textContent = initials(name);
    }
  }

  // Recorta al centro en cuadrado y reduce hasta que pese menos de AVATAR_MAX
  function imageToAvatar(file, cb) {
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      var w = img.naturalWidth, h = img.naturalHeight, s = Math.min(w, h);
      if (!s) return cb(null);
      var sizes = [96, 72, 56], types = ["image/webp", "image/jpeg"], qs = [0.85, 0.7, 0.55, 0.4];
      for (var i = 0; i < sizes.length; i++) {
        var c = document.createElement("canvas"), ctx = c.getContext("2d");
        c.width = c.height = sizes[i];
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, sizes[i], sizes[i]);   // fondo para PNG transparentes
        ctx.drawImage(img, (w - s) / 2, (h - s) / 2, s, s, 0, 0, sizes[i], sizes[i]);
        for (var t = 0; t < types.length; t++) {
          for (var q = 0; q < qs.length; q++) {
            var d = c.toDataURL(types[t], qs[q]);
            if (d.indexOf("data:" + types[t]) === 0 && d.length <= AVATAR_MAX) return cb(d);
          }
        }
      }
      cb(null);
    };
    img.onerror = function () { URL.revokeObjectURL(url); cb(null); };
    img.src = url;
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
      color: opts.color || saved.color || pick(COLORS),
      avatar: validAvatar(opts.avatar) || validAvatar(saved.avatar)
    };
    if (!custom) store("sessionStorage", "mc:me", me);

    // Id anónimo del navegador, compartido por todas sus pestañas: así tus otras
    // pestañas se reconocen como "tú" (ni aparecen en la píldora ni se pueden seguir).
    var uid = store("localStorage", "mc:uid");
    if (!/^[a-z0-9]{8,32}$/.test(uid || "")) {
      uid = (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).replace(/[^a-z0-9]/g, "").slice(0, 20);
      store("localStorage", "mc:uid", uid);
    }

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
    var followLabel = el("button", "", followBox);
    followLabel.type = "button";
    followLabel.addEventListener("click", function () { unfollow(); });

    // Píldora: [Personas] | [Chat] [Reaccionar] | [Tu perfil]
    // Cada botón dice lo que hace (tooltip + atajo) y abre un panel explicativo.
    var presence = null, peopleBtn = null, chatBtn = null, reactBtn = null, meBtn = null;
    var tooltip = null, coach = null, coachTimer = null;
    if (opts.presence !== false) {
      presence = el("div", "mc-presence", document.body);
      presence.setAttribute("role", "toolbar");
      presence.setAttribute("aria-label", "Personas en esta página");
      peopleBtn = pillButton("mc-btn mc-people", "Ver quién está aquí", "", function () { togglePop("people"); });
      if (opts.chat !== false || reactions) el("span", "mc-sep", presence);
      if (opts.chat !== false) {
        chatBtn = pillButton("mc-btn mc-icon mc-chat-btn", "Escribir junto a tu cursor", "/", function () {
          closePop(); closePicker(); openChat();
        }, ICON_CHAT);
      }
      if (reactions) {
        reactBtn = pillButton("mc-btn mc-icon mc-react-btn", "Reaccionar", "E", function () {
          if (picker) return closePicker();
          var r = presence.getBoundingClientRect();
          openPicker(r.right, r.top - 8, true);
        }, ICON_SMILE);
      }
      el("span", "mc-sep", presence);
      meBtn = pillButton("mc-btn mc-me-btn", "Tu perfil", "", function () { togglePop("profile"); });
      var ghostBar = el("div", "mc-ghost-bar", presence);
      ghostBar.innerHTML = ICON_EYE_OFF;
      el("span", "", ghostBar).textContent = "Cursores ocultos";
      var showBtn = el("button", "mc-btn mc-pill-btn", ghostBar);
      showBtn.type = "button"; showBtn.textContent = "Mostrar";
      showBtn.addEventListener("click", function () { setGhost(false); });
      tooltip = el("div", "mc-tooltip", document.body);
      tooltip.setAttribute("aria-hidden", "true");
    }

    function pillButton(cls, label, kbd, onClick, iconHTML) {
      var b = el("button", cls, presence);
      b.type = "button";
      b.dataset.tip = label;
      if (kbd) { b.dataset.kbd = kbd; b.setAttribute("aria-keyshortcuts", kbd); }
      b.setAttribute("aria-label", label);
      if (iconHTML) b.innerHTML = iconHTML;
      b.addEventListener("click", function () { hideTip(); onClick(); });
      b.addEventListener("mouseenter", function () { showTip(b); });
      b.addEventListener("mouseleave", hideTip);
      b.addEventListener("focus", function () { try { if (b.matches(":focus-visible")) showTip(b); } catch (e) {} });
      b.addEventListener("blur", hideTip);
      return b;
    }
    function showTip(b) {
      if (!tooltip || b.getAttribute("aria-expanded") === "true") return;
      tooltip.textContent = b.dataset.tip;
      if (b.dataset.kbd) el("kbd", "", tooltip).textContent = b.dataset.kbd;
      tooltip.classList.add("mc-on");
      var r = b.getBoundingClientRect(), w = tooltip.offsetWidth, h = tooltip.offsetHeight;
      tooltip.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + "px";
      tooltip.style.top = (r.top - h - 8) + "px";
    }
    function hideTip() { if (tooltip) tooltip.classList.remove("mc-on"); }
    function setExpanded() {
      if (peopleBtn) peopleBtn.setAttribute("aria-expanded", String(!!openPop && openPop.kind === "people"));
      if (meBtn) meBtn.setAttribute("aria-expanded", String(!!openPop && openPop.kind === "profile"));
      if (reactBtn) reactBtn.setAttribute("aria-expanded", String(!!picker));
    }

    // Aviso de primera visita: qué es esto y cómo se usa (una sola vez)
    function showCoach() {
      if (!presence || ghost || coach || opts.onboarding === false || store("localStorage", "mc:onboarded")) return;
      coach = el("div", "mc-coach", document.body);
      coach.setAttribute("role", "dialog");
      coach.setAttribute("aria-label", "Cómo funciona");
      el("b", "", coach).textContent = "👋 No estás solo en esta página";
      var tips = [];
      if (opts.chat !== false) tips.push("<kbd>/</kbd> para escribir junto a tu cursor");
      if (reactions) tips.push("<kbd>E</kbd> para reaccionar");
      el("p", "", coach).innerHTML = "Abajo ves quién más está mirando. Pulsa sobre las caras para ver quiénes son y seguirles." +
        (tips.length ? " Atajos: " + tips.join(" y ") + "." : "");
      var ok = el("button", "mc-btn mc-pill-btn", coach);
      ok.type = "button"; ok.textContent = "Entendido";
      ok.addEventListener("click", dismissCoach);
    }
    function dismissCoach() {
      clearTimeout(coachTimer);
      store("localStorage", "mc:onboarded", true);
      if (coach) { coach.remove(); coach = null; }
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
        if (me.avatar) msg.avatar = me.avatar;
        msg.uid = uid;
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
    // avatar: data URL de imagen, "" para quitar la foto, undefined para no tocarla
    function setIdentity(name, color, avatar) {
      name = String(name || "").replace(/\s+/g, " ").trim().slice(0, 32) || me.name;
      color = /^#[0-9a-fA-F]{6}$/.test(color || "") ? color.toUpperCase() : me.color;
      me.name = name; me.color = color;
      if (avatar !== undefined) me.avatar = validAvatar(avatar);
      store("localStorage", "mc:me", me);       // elegido por el visitante: se recuerda
      paintLocalTag();
      for (var id in peers) markSelf(peers[id]);  // tu nombre/color cambió: revisa quién eres "tú"
      send({ name: name, color: color, avatar: me.avatar });
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
        p.avEl = el("img", "mc-tag-av", p.nameEl);
        p.avEl.alt = ""; p.avEl.hidden = true;
        p.nameTxt = el("span", "", p.nameEl);
        p.msgEl = el("div", "mc-msg", p.tag);
        p.zzz = el("div", "mc-zzz");
        p.zzz.innerHTML = "<span>z</span><span>z</span><span>z</span>";
        p.zzz.setAttribute("aria-hidden", "true");
      }
      ["name", "color", "x", "y", "visible", "chat"].forEach(function (k) { if (k in m) p[k] = m[k]; });
      if ("uid" in m) p.uid = m.uid;
      markSelf(p);
      if ("avatar" in m) {
        p.avatar = validAvatar(m.avatar);
        if (p.avatar) p.avEl.src = p.avatar;
        p.avEl.hidden = !p.avatar;
        p.tag.classList.toggle("mc-has-av", !!p.avatar);
      }
      if ("x" in m || "y" in m || m.chat) setActive(p, performance.now());
      if ("color" in m || !p.el.firstChild) {
        p.el.innerHTML = cursorSVG(p.color);
        p.el.appendChild(p.tag);
        p.el.appendChild(p.zzz);
        p.zzz.style.color = p.color;
        p.tag.style.background = p.color;
        p.tag.style.color = textOn(p.color);
      }
      p.nameTxt.textContent = p.name;
      p.msgEl.textContent = p.chat;
      p.tag.classList.toggle("mc-talking", !!p.chat);
      p.el.classList.toggle("mc-hidden", !p.visible);
      if (p.cx === null || !p.visible) { p.cx = p.x; p.cy = p.y; }
      if ("sel" in m || "color" in m) { if ("sel" in m) p.sel = m.sel; renderSel(p); }
      if (following === p.id && ("color" in m || "name" in m)) paintFollow(p);
      kick();
    }

    // ¿Es otra pestaña tuya? Manda el id del navegador; si la pestaña no lo envía
    // (p. ej. sigue con una versión antigua del script), se compara nombre + color.
    function isSelf(p) {
      if (p.bot) return false;
      if (p.uid) return p.uid === uid;
      return p.name === me.name && p.color === me.color;
    }
    function markSelf(p) {
      var self = isSelf(p);
      if (self === !!p.self) return;
      p.self = self;
      p.el.classList.toggle("mc-self", self);
      if (self) {
        if (following === p.id) unfollow();
        p.selEls.forEach(function (e) { e.remove(); });
        p.selEls = [];
      } else if (p.sel) {
        renderSel(p);
      }
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
      for (var id in peers) if (!peers[id].bot && !peers[id].self && peers[id].name) n++;
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
      if (!showSel || !p.sel || p.retired || p.self) return;
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
      if (!p || ghost || p.self) return;
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
        b.textContent = emo;
        b.title = "Reaccionar " + emo;
        b.addEventListener("click", function () { closePicker(); react(emo); });
      });
      var w = picker.offsetWidth, h = picker.offsetHeight;
      var left = fromButton ? x - w : x - w / 2, top = fromButton ? y - h : y - h - 18;
      picker.style.left = Math.max(8, Math.min(innerWidth - w - 8, left)) + "px";
      picker.style.top = Math.max(8, Math.min(innerHeight - h - 8, top)) + "px";
      if (fromButton) picker.querySelector("button").focus();
      dismissCoach();
      setExpanded();
    }
    function closePicker() { if (picker) { picker.remove(); picker = null; } setExpanded(); }

    // ---- seguir a alguien ----
    function paintFollow(p) {
      followBox.style.borderColor = p.color;
      followLabel.style.background = p.color;
      followLabel.style.color = textOn(p.color);
      followLabel.textContent = "Siguiendo a " + p.name;
      el("span", "", followLabel).textContent = "Dejar de seguir ✕";
      followLabel.setAttribute("aria-label", "Dejar de seguir a " + p.name);
    }
    function follow(id) {
      var p = peers[id];
      if (!p || p.self || ghost || !canFollow) return;     // a ti mismo no te puedes seguir
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

    // ---- paneles: personas y perfil ----
    function closePop() { if (openPop) { openPop.el.remove(); openPop = null; } setExpanded(); }
    function togglePop(kind) {
      if (openPop && openPop.kind === kind) return closePop();
      closePop(); closePicker(); hideTip(); dismissCoach();
      if (kind === "people" && !ghost) openPeople();
      else if (kind === "profile") openProfile();
      setExpanded();
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

    // Tú primero; luego el resto (sin tus otras pestañas ni bots retirados)
    function peopleList() {
      var arr = [{ id: null, me: true, name: me.name, color: me.color, avatar: me.avatar }];
      for (var id in peers) {
        var p = peers[id];
        if (p.name && !p.retired && !p.self) arr.push(p);
      }
      return arr;
    }
    function statusOf(u) {
      if (u.me) return ["Tú", "mc-me"];
      if (u.chat) return ["Escribiendo…", "mc-typing"];
      if (!u.visible || u.idle) return ["Ausente", "mc-away"];
      return ["Activo", ""];
    }
    function face(cls, u, parent) {
      var a = el("span", "mc-avatar" + (cls ? " " + cls : ""), parent);
      a.style.background = u.color; a.style.color = textOn(u.color);
      avatarFace(a, u.name, u.avatar);
      return a;
    }

    function openPeople() {
      var pop = el("div", "mc-pop", document.body);
      pop.setAttribute("role", "dialog");
      pop.setAttribute("aria-label", "Personas en esta página");
      var head = el("div", "mc-head", pop);
      var big = el("div", "mc-big", head);
      var txt = el("div", "", head);
      var title = el("div", "", txt); title.style.fontWeight = "600";
      var sub = el("div", "mc-sub", txt);
      var list = el("ul", "mc-list", pop);
      if (canFollow) {
        el("p", "mc-foot", pop).innerHTML = "<b>Seguir</b> mueve tu página con la de esa persona para ver lo mismo que ella. " +
          "Para soltarla, pulsa arriba en el aviso, gira la rueda o pulsa <kbd>Esc</kbd>.";
      }
      openPop = { kind: "people", el: pop, update: function () {
        var s = currentStats();
        big.textContent = s.page;
        title.textContent = s.page === 1 ? "Solo estás tú, por ahora" : "personas en esta página";
        sub.textContent = s.site + " en toda la web · pico de hoy: " + s.peak;
        renderPeopleList(list);
      } };
      openPop.update();
    }

    function renderPeopleList(list) {
      var arr = peopleList();
      var key = following + "|" + arr.map(function (u) {
        return u.id + u.name + u.color + (u.avatar ? u.avatar.length : "") + statusOf(u)[0];
      }).join("|");
      if (list._key === key) return;               // no reconstruir sin cambios (no se pierden clics)
      list._key = key;
      list.innerHTML = "";
      arr.forEach(function (u) {
        var li = el("li", "mc-person", list);
        face("", u, li);
        var who = el("div", "mc-who", li);
        el("b", "", who).textContent = u.name;
        var st = statusOf(u), status = el("span", "mc-status " + st[1], who);
        if (!u.me) el("i", "", status);
        status.appendChild(document.createTextNode(st[0]));
        var b;
        if (u.me && editable) {
          b = el("button", "mc-btn mc-act", li);
          b.textContent = "Editar";
          b.setAttribute("aria-label", "Editar tu perfil");
          b.addEventListener("click", function () { togglePop("profile"); });
        } else if (!u.me && canFollow) {
          var on = following === u.id;
          b = el("button", "mc-btn mc-act" + (on ? " mc-on" : ""), li);
          b.textContent = on ? "Siguiendo" : "Seguir";
          b.setAttribute("aria-pressed", String(on));
          b.setAttribute("aria-label", (on ? "Dejar de seguir a " : "Seguir a ") + u.name);
          b.addEventListener("mouseenter", function () { if (following === u.id) b.textContent = "Dejar"; });
          b.addEventListener("mouseleave", function () { if (following === u.id) b.textContent = "Siguiendo"; });
          b.addEventListener("click", function () { if (following === u.id) unfollow(); else follow(u.id); });
        }
        if (b) b.type = "button";
      });
    }

    function openProfile() {
      var pop = el("div", "mc-pop", document.body);
      pop.setAttribute("role", "dialog");
      pop.setAttribute("aria-label", "Tu perfil");
      var body = el("div", "mc-pop-body", pop);
      el("h4", "", body).textContent = "Tu perfil";
      openPop = { kind: "profile", el: pop };
      var nameIn = null;

      if (editable) {
        var color = me.color, avatar = me.avatar || "";

        // Foto: se elige del ordenador, se recorta y se reduce en el navegador
        var photo = el("div", "mc-photo", body);
        var preview = el("div", "mc-avatar", photo);
        var info = el("div", "", photo);
        var file = el("input", "", info);
        file.type = "file"; file.accept = "image/*"; file.hidden = true;
        var upBtn = el("button", "mc-btn mc-outline", info); upBtn.type = "button";
        var rmBtn = el("button", "mc-link", info); rmBtn.type = "button"; rmBtn.textContent = "Quitar";
        var note = el("small", "", info);
        var NOTE = "La verán quienes estén en esta página.";
        note.textContent = NOTE;

        var nameLabel = el("label", "mc-label", body); nameLabel.textContent = "Nombre";
        nameIn = el("input", "", body);
        nameIn.value = me.name; nameIn.maxLength = 32;
        nameIn.id = "mc-name-" + uid; nameLabel.htmlFor = nameIn.id;

        el("span", "mc-label", body).textContent = "Color";
        var sw = el("div", "mc-swatches", body);
        sw.setAttribute("role", "group"); sw.setAttribute("aria-label", "Color");

        var paintPreview = function () {
          preview.style.background = color; preview.style.color = textOn(color);
          avatarFace(preview, nameIn.value.trim() || me.name, avatar);
          upBtn.textContent = avatar ? "Cambiar foto" : "Subir foto";
          rmBtn.hidden = !avatar;
        };
        var setColor = function (c) {
          color = c;
          sw.querySelectorAll(".mc-swatch").forEach(function (o) { o.setAttribute("aria-pressed", String(o.dataset.c === c)); });
          paintPreview();
        };
        COLORS.forEach(function (c) {
          var b = el("button", "mc-swatch", sw);
          b.type = "button"; b.style.background = c; b.style.color = c; b.dataset.c = c;
          b.setAttribute("aria-label", "Color " + c);
          b.addEventListener("click", function () { setColor(c); });
        });
        upBtn.addEventListener("click", function () { file.click(); });
        rmBtn.addEventListener("click", function () { avatar = ""; paintPreview(); });
        file.addEventListener("change", function () {
          var f = file.files && file.files[0];
          file.value = "";
          if (!f) return;
          if (!/^image\//.test(f.type)) { note.textContent = "Ese archivo no es una imagen."; return; }
          upBtn.textContent = "Procesando…";
          imageToAvatar(f, function (url) {
            if (url) { avatar = url; note.textContent = NOTE; }
            else note.textContent = "No se ha podido usar esa imagen. Prueba con otra.";
            paintPreview();
          });
        });
        nameIn.addEventListener("input", paintPreview);
        setColor(color);

        var row = el("div", "mc-row", body);
        var dice = el("button", "mc-btn", row); dice.type = "button"; dice.textContent = "🎲 Al azar";
        dice.title = "Nombre y color al azar";
        dice.addEventListener("click", function () {         // cambia nombre Y color (nunca repite)
          var n, c, tries = 0;
          do { n = randomName(); } while (n === nameIn.value && ++tries < 20);
          do { c = pick(COLORS); } while (c === color && ++tries < 40);
          nameIn.value = n;
          setColor(c);
        });
        var save = el("button", "mc-btn mc-primary", row); save.type = "button"; save.textContent = "Guardar";
        var commit = function () { setIdentity(nameIn.value, color, avatar); closePop(); };
        save.addEventListener("click", commit);
        nameIn.addEventListener("keydown", function (e) {
          e.stopPropagation();
          if (e.key === "Enter") commit();
          else if (e.key === "Escape") closePop();
        });
      } else {
        var fixed = el("div", "mc-photo", body);
        face("", { name: me.name, color: me.color, avatar: me.avatar }, fixed);
        el("b", "", fixed).textContent = me.name;
      }

      if (opts.toggle !== false) {
        if (editable) el("div", "mc-divider", body);
        var srow = el("div", "mc-switch-row", body);
        var stxt = el("div", "", srow); stxt.style.flex = "1";
        el("b", "", stxt).textContent = "Modo fantasma";
        el("small", "", stxt).textContent = "Oculta los cursores de los demás y deja de compartir el tuyo.";
        var swBtn = el("button", "mc-switch", srow);
        swBtn.type = "button"; swBtn.setAttribute("role", "switch");
        swBtn.setAttribute("aria-checked", String(ghost));
        swBtn.setAttribute("aria-label", "Modo fantasma");
        swBtn.addEventListener("click", function () { setGhost(!ghost); });
      }
      if (nameIn) { nameIn.focus(); nameIn.select(); }
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
        if (p.visible && !p.retired && !p.self) list.push(p);
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
      if (openPop && openPop.kind === "people") openPop.update();   // "Activo" → "Ausente", etc.
    }

    function emitStats() {
      var s = currentStats(), key = s.page + "|" + s.site + "|" + s.peak;
      if (key === statsKey) return;
      statsKey = key;
      if (openPop && openPop.update) openPop.update();
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

    // ---- presencia (la píldora) ----
    function renderPresence() {
      if (!presence) { emitStats(); return; }
      presence.classList.toggle("mc-ghost", ghost);
      if (ghost) { emitStats(); return; }
      var arr = peopleList(), others = arr.slice(1);

      // Botón "Personas": caras de los demás + cuántos sois
      var key = arr.length + "|" + following + "|" + others.slice(0, 3).map(function (u) {
        return u.id + u.name + u.color + (u.avatar ? u.avatar.length : "");
      }).join("|");
      if (peopleBtn._key !== key) {                // no reconstruir sin cambios (no se pierden clics)
        peopleBtn._key = key;
        peopleBtn.innerHTML = "";
        peopleBtn.classList.toggle("mc-alone", !others.length);
        if (others.length) {
          var stack = el("span", "mc-stack", peopleBtn);
          others.slice(0, 3).forEach(function (u) {
            var a = face("", u, stack);
            if (u.id === following) a.style.boxShadow = "0 0 0 2px " + u.color;
          });
          if (others.length > 3) el("span", "mc-avatar mc-more", stack).textContent = "+" + (others.length - 3);
          el("span", "", peopleBtn).textContent = arr.length + " aquí";
          peopleBtn.dataset.tip = "Ver quién está aquí";
          peopleBtn.setAttribute("aria-label", arr.length + " personas aquí. Ver quiénes son");
        } else {
          peopleBtn.innerHTML = ICON_PEOPLE;
          el("span", "", peopleBtn).textContent = "Solo tú";
          peopleBtn.dataset.tip = "Aún no hay nadie más";
          peopleBtn.setAttribute("aria-label", "Solo tú en esta página");
        }
      }

      // Botón "Tu perfil": tu cara + flecha
      var mk = me.name + me.color + (me.avatar ? me.avatar.length : "");
      if (meBtn._key !== mk) {
        meBtn._key = mk;
        meBtn.innerHTML = "";
        face("", me, meBtn);
        meBtn.insertAdjacentHTML("beforeend", ICON_CHEV);
        meBtn.dataset.tip = "Tu perfil · " + me.name;
        meBtn.setAttribute("aria-label", "Tu perfil: " + me.name);
      }
      setExpanded();
      emitStats();
      if (openPop && openPop.update) openPop.update();
    }

    // ---- chat local ----
    function isTyping(t) {
      return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    }
    function placeLocal() {
      var x = Math.max(0, Math.min(last.cx, innerWidth - 250)), y = Math.max(0, Math.min(last.cy, innerHeight - 80));
      local.style.transform = "translate3d(" + x + "px," + y + "px,0)";
    }
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
      if (openPop && !openPop.el.contains(t) && !(presence && presence.contains(t)) && !followBox.contains(t)) closePop();
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
    coachTimer = setTimeout(showCoach, 1500);
    connect();

    // Abre una parte de la píldora desde tu propia interfaz
    function open(what) {
      if (what === "chat") { if (ghost) setGhost(false); closePop(); openChat(); }
      else if (what === "reactions") {
        if (ghost) setGhost(false);
        var r = presence ? presence.getBoundingClientRect() : null;
        if (r) openPicker(r.right, r.top - 8, true); else openPicker(innerWidth / 2, innerHeight / 2, false);
      } else if (what === "people" || what === "profile") {
        if (what === "people" && ghost) setGhost(false);
        if (!(openPop && openPop.kind === what)) togglePop(what);
      }
    }

    return {
      me: me,
      peers: peers,
      get room() { return room; },
      get ghost() { return ghost; },
      get stats() { return currentStats(); },
      // Cambio manual de sala: a partir de aquí deja de seguir la ruta automáticamente
      setRoom: function (r) { autoRoom = false; setRoom(r); },
      setGhost: setGhost,
      setIdentity: setIdentity,
      open: open,
      close: function () { closePop(); closePicker(); },
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
        closePicker(); closePop(); clearTimeout(coachTimer);
        [style, layer, local, presence, followBox, tooltip, coach].forEach(function (n) { if (n) n.remove(); });
      }
    };
  }

  global.MultiCursor = { init: init };
})(window);
