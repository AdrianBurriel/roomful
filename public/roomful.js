/*!
 * Roomful — turn any website into a room full of people: Figma-style
 * multiplayer cursors, presence, chat and reactions.
 *
 * Minimal usage:
 *   <script src="/roomful.js"></script>
 *   <script>Roomful.init({ url: "wss://my-server.com/ws" });</script>
 *
 * Options (all optional):
 *   url         WebSocket URL                      (ws(s)://<current host>/ws)
 *   ably        { authUrl, prefix, sdk } — use Ably instead of server.py, for
 *               serverless hosts such as Vercel. authUrl returns an Ably token
 *               request ("/api/ably-token"); prefix names the channels ("roomful")
 *   room        Room. Defaults to the page path: you only see people on the same
 *               URL (and it follows route changes in SPAs). A fixed value
 *               (e.g. "global") shares one room across the whole site.
 *   lang        "en" | "es" | "auto" (browser language)            ("en")
 *   strings     Text overrides / extra languages: { en: { key: "…" }, fr: {…} }
 *   name        Fixed user name; disables profile editing  (random: "Zen Capybara")
 *   color       Hex color #RRGGBB                   (random from the palette)
 *   avatar      Initial photo (PNG/JPEG/WebP data URL, ≤ 14,000 chars)
 *   presence    The pill: people · shortcuts · ghost · your profile  (true)
 *   onboarding  Welcome hint the first time someone visits           (true)
 *   toggle      "Ghost mode" switch in your profile                  (true)
 *   chat        Cursor chat (button and "/" key)                     (true)
 *   reactions   Array of emojis (button and "E" key), or false
 *   clicks      Show other people's clicks as ripples                (true)
 *   selection   Show the text other people select                    (true)
 *   follow      "Follow" button in the people panel                  (true)
 *   editable    Edit name, color and photo in your profile. Changes save
 *               on their own as you make them (no Save button)       (true)
 *   selfCursor  Your own pointer looks like everyone else's: an arrow in
 *               your color with your name next to it                 (true)
 *   wave        Shake the cursor quickly from side to side to wave 👋
 *               at the room. true | false | another emoji            (true)
 *   onStats     fn({ page, site, peak }) — called whenever the numbers change
 *   anchor      "center" | "left" — horizontal reference used to map positions
 *               between screens of different widths                 ("center")
 *   maxCursors  Max visible cursors (real people and active ones first) (12)
 *   idleMs      Inactivity before a cursor fades and shows "zzz"    (30000)
 *   bots        Fake visitors so the page never looks empty. They are local
 *               (each visitor sees their own) and disabled with
 *               prefers-reduced-motion.                              (0)
 *   botsRetireAt  Bots leave once this many real people are here   (= bots)
 *   botsMin     Bots that stay however many people there are        (1)
 *               Bots are always labelled "BOT" (cursor and people list).
 *   botChat     Bots type a message now and then                     (true)
 *   botTargets  CSS selector of elements the bots move towards
 *   botPhrases  Bot chat phrases: an array, or { en: [...], es: [...] }
 *   tour        Guided tour: { steps: [...], name?, offer? }. A grey "guide" bot
 *               flies to each step's element, says something and a card explains
 *               it; it moves on by itself (back / pause / next / close, ← → Esc).
 *               Step: { target: CSS selector, title, text (HTML), say, wave? },
 *               each text a string or { en: "…", es: "…" }. Inside text,
 *               <span class="mc-kb"> shows only with a mouse/keyboard and
 *               <span class="mc-tch"> only on touch screens. offer (true): the
 *               first-visit hint offers the tour. Progress is remembered.
 *
 * Returns { me, peers, room, ghost, stats, lang, setRoom(), setGhost(), setIdentity(),
 *           setLang(), open("people"|"profile"|"keys"|"chat"|"reactions"), close(),
 *           react(emoji), follow(id), unfollow(), startTour(step?), stopTour(),
 *           uid, on("board", fn) → off(), signal("board"),
 *           tour → { active, step, total, saved }, destroy() }.
 *
 * Protocol (JSON over WebSocket, connecting to <url>?room=<room>):
 *   client → server  { t:"update", name?, color?, avatar?, uid?, x?, y?, visible?, chat?, sel? }
 *                    { t:"event", kind:"click"|"reaction"|"board", x, y, emoji? }
 *   server → client  { t:"welcome", id, room, peers:[{id,...state}] }
 *                    { t:"update", id, ...fields }   { t:"leave", id }
 *                    { t:"event", id, kind, x, y, emoji? }
 *                    { t:"stats", room, site, peak }
 */
(function (global) {
  "use strict";

  // ---- i18n -------------------------------------------------------------------
  // Random names are stored as [animal index, adjective index], so a random
  // identity can be shown in any language ("Zen Capybara" ↔ "Capibara Zen").
  var I18N = {
    en: {
      animals: ["Capybara", "Axolotl", "Otter", "Quokka", "Red Panda", "Sloth", "Penguin",
        "Raccoon", "Alpaca", "Hedgehog", "Koala", "Toucan", "Narwhal", "Manatee", "Meerkat",
        "Platypus", "Lemur", "Flamingo", "Fennec", "Wombat", "Llama", "Tapir"],
      adjectives: ["Zen", "Ninja", "Turbo", "Happy", "Swift", "Bold", "Fancy", "Brave",
        "Shiny", "Rebel", "Wild", "Smiley", "Cool", "Pixel", "Lunar"],
      adjectiveFirst: true,
      botPhrases: ["Hi 👋", "Anyone else here?", "Try pressing E 👀", "Love this typography",
        "Follow me 🏃", "This feels so Figma", "Testing the chat…", "Capybaras rule 🦫",
        "How many of us are there?", "Grabbing a coffee ☕"],
      ui: {
        chatPlaceholder: "Say something…", chatLabel: "Cursor chat message",
        toolbar: "People on this page", seeWho: "See who's here",
        chatTip: "Write next to your cursor", react: "React", reactWith: "React with {e}",
        profile: "Your profile", profileOf: "Your profile · {name}", profileLabel: "Your profile: {name}",
        hidden: "Cursors hidden", show: "Show",
        coachLabel: "How it works", coachTitle: "👋 You're not alone on this page",
        coachBody: "Down here you can see who else is looking. Click the faces to see who they are and follow them.",
        coachShortcuts: "Shortcuts:", coachChat: "<kbd>/</kbd> to write next to your cursor",
        coachReact: "<kbd>E</kbd> to react", and: "and", gotIt: "Got it",
        coachKeys: "Press <kbd>?</kbd> to see them all.", coachKeysTouch: "Tap ⌨ in the pill to write or react.",
        keys: "Shortcuts", keysTitle: "Keyboard shortcuts", keysPick: "then 1–{n} to pick",
        keysEsc: "Close panels or stop following", keysHelp: "Show these shortcuts",
        keysFoot: "You can also click any of them.", keysFootTouch: "Tap one to use it.",
        following: "Following {name}", stopFollowing: "Stop following ✕",
        stopFollowingName: "Stop following {name}", followName: "Follow {name}",
        you: "You", typing: "Typing…", away: "Away", active: "Active",
        peopleHere: "people on this page", onlyYouNow: "Just you, for now",
        siteAndPeak: "{site} on the whole site · today's peak: {peak}",
        followHelp: "<b>Follow</b> moves your page along with that person's, so you see what they see. " +
          "To let go, click the banner at the top, scroll, or press <kbd>Esc</kbd>.",
        followHelpTouch: "<b>Follow</b> moves your page along with that person's, so you see what they see. " +
          "To let go, tap the banner at the top or swipe to scroll.",
        edit: "Edit", editProfile: "Edit your profile",
        follow: "Follow", followingBtn: "Following", stop: "Stop",
        uploadPhoto: "Upload photo", changePhoto: "Change photo", remove: "Remove",
        photoNote: "People on this page will see it.", notImage: "That file isn't an image.",
        processing: "Processing…", badImage: "Couldn't use that image. Try another one.",
        name: "Name", color: "Color", colorN: "Color {c}",
        random: "🎲 Random", randomTip: "Random name and color", save: "Save",
        autoSave: "Saves automatically", saved: "✓ Saved", bot: "Bot", botTip: "Bot: not a real person",
        guide: "Guide", guideTip: "Your tour guide", tourLabel: "Guided tour", tourStep: "{n} of {total}",
        tourBack: "Back", tourNext: "Next", tourDone: "Finish", tourPause: "Pause", tourPlay: "Resume",
        tourClose: "Close the tour", tourOffer: "Take the tour",
        ghost: "Ghost mode", ghostHelp: "Hides other people's cursors and stops sharing yours.",
        nHere: "{n} here", nHereLabel: "{n} people here. See who they are",
        onlyYou: "Just you", nobodyYet: "Nobody else yet", onlyYouLabel: "Just you on this page"
      }
    },
    es: {
      animals: ["Capibara", "Ajolote", "Nutria", "Quokka", "Panda Rojo", "Perezoso", "Pingüino",
        "Mapache", "Alpaca", "Erizo", "Koala", "Tucán", "Narval", "Manatí", "Suricata",
        "Ornitorrinco", "Lémur", "Flamenco", "Fénec", "Wombat", "Llama", "Tapir"],
      adjectives: ["Zen", "Ninja", "Turbo", "Feliz", "Veloz", "Audaz", "Elegante", "Valiente",
        "Brillante", "Rebelde", "Salvaje", "Sonriente", "Cool", "Pixel", "Lunar"],
      adjectiveFirst: false,
      botPhrases: ["Hola 👋", "¿Alguien más por aquí?", "Pulsa la E, ya verás 👀", "Me encanta esta tipografía",
        "¿Me sigues? 🏃", "Esto es muy Figma", "Probando el chat…", "Capibaras al poder 🦫",
        "¿Cuántos somos?", "Voy a por un café ☕"],
      ui: {
        chatPlaceholder: "Di algo…", chatLabel: "Mensaje de chat del cursor",
        toolbar: "Personas en esta página", seeWho: "Ver quién está aquí",
        chatTip: "Escribir junto a tu cursor", react: "Reaccionar", reactWith: "Reaccionar {e}",
        profile: "Tu perfil", profileOf: "Tu perfil · {name}", profileLabel: "Tu perfil: {name}",
        hidden: "Cursores ocultos", show: "Mostrar",
        coachLabel: "Cómo funciona", coachTitle: "👋 No estás solo en esta página",
        coachBody: "Abajo ves quién más está mirando. Pulsa sobre las caras para ver quiénes son y seguirles.",
        coachShortcuts: "Atajos:", coachChat: "<kbd>/</kbd> para escribir junto a tu cursor",
        coachReact: "<kbd>E</kbd> para reaccionar", and: "y", gotIt: "Entendido",
        coachKeys: "Pulsa <kbd>?</kbd> para verlos todos.", coachKeysTouch: "Toca ⌨ en la píldora para escribir o reaccionar.",
        keys: "Atajos", keysTitle: "Atajos de teclado", keysPick: "y luego 1–{n} para elegir",
        keysEsc: "Cerrar paneles o dejar de seguir", keysHelp: "Ver estos atajos",
        keysFoot: "También puedes pulsarlos aquí.", keysFootTouch: "Toca uno para usarlo.",
        following: "Siguiendo a {name}", stopFollowing: "Dejar de seguir ✕",
        stopFollowingName: "Dejar de seguir a {name}", followName: "Seguir a {name}",
        you: "Tú", typing: "Escribiendo…", away: "Ausente", active: "Activo",
        peopleHere: "personas en esta página", onlyYouNow: "Solo estás tú, por ahora",
        siteAndPeak: "{site} en toda la web · pico de hoy: {peak}",
        followHelp: "<b>Seguir</b> mueve tu página con la de esa persona para ver lo mismo que ella. " +
          "Para soltarla, pulsa arriba en el aviso, gira la rueda o pulsa <kbd>Esc</kbd>.",
        followHelpTouch: "<b>Seguir</b> mueve tu página con la de esa persona para ver lo mismo que ella. " +
          "Para soltarla, toca el aviso de arriba o desliza para hacer scroll.",
        edit: "Editar", editProfile: "Editar tu perfil",
        follow: "Seguir", followingBtn: "Siguiendo", stop: "Dejar",
        uploadPhoto: "Subir foto", changePhoto: "Cambiar foto", remove: "Quitar",
        photoNote: "La verán quienes estén en esta página.", notImage: "Ese archivo no es una imagen.",
        processing: "Procesando…", badImage: "No se ha podido usar esa imagen. Prueba con otra.",
        name: "Nombre", color: "Color", colorN: "Color {c}",
        random: "🎲 Al azar", randomTip: "Nombre y color al azar", save: "Guardar",
        autoSave: "Se guarda solo", saved: "✓ Guardado", bot: "Bot", botTip: "Bot: no es una persona real",
        guide: "Guía", guideTip: "Tu guía del tour", tourLabel: "Tour guiado", tourStep: "{n} de {total}",
        tourBack: "Atrás", tourNext: "Siguiente", tourDone: "Terminar", tourPause: "Pausar", tourPlay: "Seguir",
        tourClose: "Cerrar el tour", tourOffer: "Haz el tour",
        ghost: "Modo fantasma", ghostHelp: "Oculta los cursores de los demás y deja de compartir el tuyo.",
        nHere: "{n} aquí", nHereLabel: "{n} personas aquí. Ver quiénes son",
        onlyYou: "Solo tú", nobodyYet: "Aún no hay nadie más", onlyYouLabel: "Solo tú en esta página"
      }
    }
  };

  var COLORS = ["#F24E1E", "#FF7262", "#A259FF", "#1ABCFE", "#0ACF83", "#FFC700",
    "#FF4FA3", "#7B61FF", "#14AE5C", "#0D99FF", "#F5A524", "#E5484D"];
  var REACTIONS = ["❤️", "👍", "🔥", "😂", "🎉", "👏", "😮", "👀"];
  var BOT_TARGETS = "a, button, .btn, h1, h2, h3, p, img, svg, .card, summary, li, [data-mc-target]";

  var BOT_HERE_MS = [7000, 16000];   // time a bot spends on your screen
  var BOT_AWAY_MS = [12000, 30000];  // time it spends elsewhere on the page

  var SEND_EVERY_MS = 40;   // ~25 position updates per second at most
  var LERP = 0.28;          // smoothing of remote cursors (0..1; 1 = none)
  var CHAT_LINGER_MS = 4000;
  var CHAT_MAX_W = 216;     // the chat box grows in width up to this (px), then wraps and grows in height…
  var CHAT_MAX_LINES = 4;   // …up to this many lines; then it stops accepting more
  var CHAT_LINE_H = 17;
  var UI = ".mc-presence,.mc-local,.mc-layer,.mc-pop,.mc-picker,.mc-coach,.mc-follow,.mc-tour";
  var GUIDE_COLOR = "#5F5F66";   // the tour guide is grey: no visitor color looks like it
  var TOUR_KEY = "mc:tour";

  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  function randomGen() {
    return [Math.floor(Math.random() * I18N.en.animals.length), Math.floor(Math.random() * I18N.en.adjectives.length)];
  }
  function nameFor(gen, lang) {
    var d = I18N[lang] || I18N.en;
    var animal = d.animals[gen[0]] || I18N.en.animals[gen[0]], adj = d.adjectives[gen[1]] || I18N.en.adjectives[gen[1]];
    return d.adjectiveFirst ? adj + " " + animal : animal + " " + adj;
  }
  function isGen(g) {
    return g && g.length === 2 && g[0] >= 0 && g[0] < I18N.en.animals.length && g[1] >= 0 && g[1] < I18N.en.adjectives.length;
  }

  function textOn(hex) {
    var n = parseInt(hex.slice(1), 16);
    var r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 170 ? "#1E1E1E" : "#FFFFFF";
  }

  // sessionStorage: random identity per tab · localStorage: what the visitor chooses
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

  // DOM node paths (child indexes from <body>) used to share text selections
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
    /* 100% width + overflow-x:clip → remote cursors never cause horizontal scroll on the host page */
    ".mc-layer{position:absolute;left:0;top:0;width:100%;height:0;overflow-x:clip;overflow-y:visible;pointer-events:none;z-index:2147483000}",
    ".mc-layer.mc-off{display:none}",
    ".mc-cursor{position:absolute;left:0;top:0;will-change:transform;transition:opacity .3s ease}",
    /* idle: the cursor fades and animated "z"s float up */
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
    /* selections, clicks and reactions */
    ".mc-sel{position:absolute;border-radius:2px;opacity:.28;mix-blend-mode:multiply}",
    "@media (prefers-color-scheme:dark){.mc-sel{mix-blend-mode:screen;opacity:.35}}",
    ".mc-ripple{position:absolute;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;border:2.5px solid;",
    "  animation:mc-ripple .65s ease-out forwards}",
    "@keyframes mc-ripple{from{transform:scale(.15);opacity:1}to{transform:scale(1.35);opacity:0}}",
    ".mc-float{position:absolute;font-size:30px;line-height:1;margin:-15px 0 0 -15px;animation:mc-float 1.9s cubic-bezier(.2,.7,.3,1) forwards}",
    "@keyframes mc-float{0%{transform:translate(0,0) scale(.4);opacity:0}12%{transform:translate(0,-10px) scale(1.15);opacity:1}",
    "  100%{transform:translate(var(--dx),-110px) scale(.9) rotate(var(--rot));opacity:0}}",
    "@media (prefers-reduced-motion:reduce){.mc-float{animation-duration:1.2s}.mc-ripple{animation:none;opacity:0}}",
    /* local chat */
    /* your own cursor: the arrow is the real pointer (CSS cursor, no lag); the name tag follows it */
    ".mc-local{position:fixed;left:0;top:0;pointer-events:none;z-index:2147483001;display:none}",
    ".mc-local.mc-show,.mc-local.mc-open{display:block}",
    ".mc-local textarea{display:none}",
    ".mc-local.mc-open .mc-tag{pointer-events:auto;padding:7px 12px 9px;border-radius:3px 16px 16px 16px}",
    ".mc-local.mc-open .mc-name{font-size:10px;opacity:.8}",
    ".mc-local.mc-open .mc-tag-av{width:14px;height:14px}",
    ".mc-local.mc-open.mc-docked .mc-name{display:none}",
    ".mc-local.mc-open textarea{all:unset;display:block;box-sizing:content-box;font:400 14px/" + CHAT_LINE_H + "px " + FONT + ";",
    "  max-width:" + CHAT_MAX_W + "px;height:" + CHAT_LINE_H + "px;resize:none;overflow:hidden;white-space:pre-wrap;",
    "  overflow-wrap:break-word;word-break:break-word;color:inherit;caret-color:currentColor;margin-top:3px}",
    ".mc-local.mc-open.mc-docked textarea{margin-top:0}",
    ".mc-local textarea::placeholder{color:inherit;opacity:.65}",
    ".mc-measure{position:absolute;left:0;top:0;visibility:hidden;white-space:pre;pointer-events:none;font:400 14px/1.2 " + FONT + "}",
    /* ---------- pill, panels, tooltip and first-visit hint ---------- */
    ".mc-presence,.mc-pop,.mc-picker,.mc-coach,.mc-tour{background:#fff;color:#1E1E1E;border:1px solid rgba(0,0,0,.08);",
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
    ".mc-keys{list-style:none;margin:0;padding:6px}",
    ".mc-key{all:unset;box-sizing:border-box;width:100%;display:flex;align-items:center;gap:12px;padding:9px 10px;border-radius:10px}",
    "button.mc-key{cursor:pointer}button.mc-key:hover{background:rgba(0,0,0,.05)}",
    "button.mc-key:focus-visible{outline:2px solid #0D99FF;outline-offset:-2px}",
    ".mc-key kbd{min-width:30px;text-align:center;box-sizing:border-box;flex:none}",
    ".mc-key span{font-weight:500}.mc-key small{display:block;font-size:12px;font-weight:400;opacity:.6;margin-top:1px}",
    ".mc-sep{width:1px;height:20px;background:rgba(0,0,0,.1);margin:0 4px;flex:none}",
    ".mc-me-btn{width:36px;height:36px}",
    ".mc-me-btn .mc-avatar{margin:0;border:0;box-shadow:inset 0 0 0 2px rgba(255,255,255,.55)}",
    ".mc-ghost-bar{display:none;align-items:center;gap:8px;padding:0 0 0 10px;white-space:nowrap}",
    ".mc-presence.mc-ghost>*{display:none}",
    ".mc-presence.mc-ghost>.mc-ghost-bar{display:flex}",
    ".mc-pill-btn{height:30px;padding:0 14px;font-weight:600;background:#1E1E1E;color:#fff}",
    ".mc-pill-btn:hover{background:#000}",
    /* tooltip with keyboard shortcut */
    ".mc-tooltip{position:fixed;left:0;top:0;z-index:2147483004;pointer-events:none;background:#1E1E1E;color:#fff;",
    "  font:500 12px/1 " + FONT + ";padding:7px 9px;border-radius:7px;white-space:nowrap;opacity:0;transform:translateY(4px);",
    "  transition:opacity .12s,transform .12s}",
    ".mc-tooltip.mc-on{opacity:1;transform:none}",
    ".mc-tooltip kbd{font:600 11px/1 ui-monospace,Menlo,monospace;background:rgba(255,255,255,.18);border-radius:4px;padding:2px 5px;margin-left:8px}",
    "@media (hover:none){.mc-tooltip{display:none}}",
    ".mc-pop kbd,.mc-coach kbd,.mc-tour kbd{font:600 11px/1.4 ui-monospace,Menlo,monospace;border:1px solid rgba(0,0,0,.18);border-bottom-width:2px;",
    "  border-radius:5px;padding:1px 5px;margin:0 1px}",
    /* panels */
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
    ".mc-who b{font-weight:600}",
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
    /* cursor name: photo + text aligned in one row, never overflowing the label */
    ".mc-name{display:flex;align-items:center;gap:6px;min-width:0}",
    ".mc-name>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".mc-tag-av{width:18px;height:18px;flex:none;border-radius:50%;object-fit:cover;display:block;",
    "  box-shadow:0 0 0 1.5px rgba(255,255,255,.75)}",
    ".mc-tag-av[hidden]{display:none}",
    ".mc-tag.mc-has-av:not(.mc-talking){padding:3px 10px 3px 3px;border-radius:4px 14px 14px 14px}",
    ".mc-local:not(.mc-open) .mc-tag.mc-has-av{padding:3px 10px 3px 3px;border-radius:4px 14px 14px 14px}",
    /* bots are labelled: a small outlined "BOT" chip */
    ".mc-badge{flex:none;font:700 9px/1 " + FONT + ";letter-spacing:.06em;text-transform:uppercase;padding:3px 4px 2px;",
    "  border-radius:4px;box-shadow:inset 0 0 0 1px currentColor;opacity:.85}",
    ".mc-tag.mc-talking .mc-badge{font-size:8px;padding:2px 3px 1px}",
    ".mc-who b{display:flex;align-items:center;gap:6px}",
    ".mc-who b>span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".mc-who .mc-badge{opacity:.6}",
    ".mc-saved{align-self:center;font-size:12px;font-weight:500;opacity:.5;transition:opacity .2s}",
    ".mc-saved.mc-on{opacity:1;color:#14AE5C}",
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
    /* first-visit hint */
    ".mc-coach{position:fixed;right:16px;bottom:72px;z-index:2147483003;border-radius:14px;padding:16px;width:290px;",
    "  max-width:calc(100vw - 32px);box-sizing:border-box;animation:mc-in .25s ease-out}",
    ".mc-coach b{display:block;font-size:14px;margin-bottom:6px}",
    ".mc-coach p{margin:0 0 14px;font-weight:400;opacity:.75;line-height:1.5}",
    ".mc-coach::after{content:'';position:absolute;right:34px;bottom:-7px;width:12px;height:12px;background:inherit;",
    "  border-right:1px solid rgba(0,0,0,.08);border-bottom:1px solid rgba(0,0,0,.08);transform:rotate(45deg)}",
    /* guided tour: spotlight on the element + explanation card */
    /* the rest of the page goes dark; the element gets a glowing, pulsing frame */
    ".mc-spot{position:fixed;left:0;top:0;z-index:2147482998;pointer-events:none;border-radius:16px;display:none;",
    "  box-shadow:0 0 0 200vmax rgba(10,10,14,.6);animation:mc-spot-in .35s ease-out}",
    ".mc-spot.mc-on{display:block}",
    ".mc-spot::before{content:'';position:absolute;inset:0;border-radius:inherit;",
    "  box-shadow:0 0 0 2.5px #fff,0 0 22px 6px rgba(255,255,255,.5);animation:mc-spot-glow 1.4s ease-in-out infinite}",
    ".mc-spot::after{content:'';position:absolute;inset:0;border-radius:inherit;outline:2px solid #fff;outline-offset:0;",
    "  animation:mc-spot-ring 1.4s ease-out infinite}",
    "@keyframes mc-spot-in{from{box-shadow:0 0 0 200vmax rgba(10,10,14,0)}}",
    "@keyframes mc-spot-glow{0%,100%{opacity:.45}50%{opacity:1}}",
    "@keyframes mc-spot-ring{0%{outline-offset:0;opacity:.9}100%{outline-offset:14px;opacity:0}}",
    "@media (prefers-reduced-motion:reduce){.mc-spot,.mc-spot::before,.mc-spot::after{animation:none}.mc-spot::after{display:none}}",
    ".mc-tour{position:fixed;left:16px;bottom:16px;z-index:2147483003;width:370px;max-width:calc(100vw - 32px);box-sizing:border-box;",
    "  border-radius:16px;padding:14px 16px 14px;animation:mc-in .2s ease-out}",
    ".mc-tour-head{display:flex;align-items:center;gap:8px;margin-bottom:12px}",
    ".mc-guide-chip{display:inline-flex;align-items:center;gap:6px;background:" + GUIDE_COLOR + ";color:#fff;font-size:12px;",
    "  font-weight:600;padding:4px 8px;border-radius:3px 12px 12px 12px}",
    ".mc-tour-count{margin-left:auto;font-size:12px;font-weight:500;opacity:.55;font-variant-numeric:tabular-nums}",
    ".mc-tour-x{width:28px;height:28px;font-size:13px;opacity:.6}.mc-tour-x:hover{opacity:1}",
    ".mc-tour h4{margin:0 0 6px;font-size:16px;font-weight:700;letter-spacing:-.01em}",
    ".mc-tour-text{font-size:13.5px;font-weight:400;line-height:1.55;opacity:.85}",
    ".mc-tour code{font:500 12px ui-monospace,Menlo,monospace}",
    ".mc-tour .mc-tch{display:none}.mc-tour.mc-touch .mc-tch{display:inline}.mc-tour.mc-touch .mc-kb{display:none}",
    ".mc-tour-bar{height:3px;border-radius:3px;background:rgba(0,0,0,.08);margin:14px 0 12px;overflow:hidden}",
    ".mc-tour-bar i{display:block;height:100%;width:0;background:" + GUIDE_COLOR + "}",
    ".mc-tour-row{display:flex;gap:8px;align-items:center}",
    ".mc-tour-row .mc-btn{height:32px;padding:0 12px;font-size:12.5px;font-weight:600}",
    ".mc-tour-row .mc-btn:disabled{opacity:.35;cursor:default}",
    ".mc-tour-row .mc-primary{margin-left:auto}",
    "@media (max-width:820px){.mc-tour{left:8px;right:8px;bottom:68px;width:auto;max-width:none}}",
    ".mc-coach .mc-row{justify-content:flex-start}",
    /* follow mode */
    ".mc-follow{position:fixed;inset:0;border:3px solid;pointer-events:none;z-index:2147482999;display:none}",
    ".mc-follow.mc-on{display:block}",
    ".mc-follow button{all:unset;pointer-events:auto;cursor:pointer;position:absolute;top:0;left:50%;transform:translateX(-50%);",
    "  font:600 12px/1 " + FONT + ";padding:7px 12px 8px;border-radius:0 0 9px 9px;white-space:nowrap}",
    ".mc-follow button span{font-weight:500;opacity:.8;margin-left:8px}",
    ".mc-follow button:hover span{opacity:1;text-decoration:underline}",
    ".mc-follow button:focus-visible{outline:2px solid #0D99FF}",
    /* dark mode */
    "@media (prefers-color-scheme:dark){",
    "  .mc-presence,.mc-pop,.mc-picker,.mc-coach,.mc-tour{background:#1f1f1f;border-color:rgba(255,255,255,.1);color:#EEE}",
    "  .mc-avatar{border-color:#1f1f1f}.mc-btn:hover,.mc-btn[aria-expanded=true]{background:rgba(255,255,255,.08)}",
    "  .mc-sep{background:rgba(255,255,255,.12)}.mc-avatar.mc-more{background:#333;color:#ddd}",
    "  .mc-pill-btn,.mc-primary,.mc-act.mc-on{background:#fff;color:#1E1E1E;border-color:#fff}",
    "  .mc-pill-btn:hover,.mc-primary:hover,.mc-act.mc-on:hover{background:#e6e6e6}",
    "  .mc-act,.mc-outline,.mc-pop input{border-color:rgba(255,255,255,.2)}",
    "  .mc-head,.mc-foot{border-color:rgba(255,255,255,.08)}.mc-divider{background:rgba(255,255,255,.08)}",
    "  .mc-person:hover,button.mc-key:hover{background:rgba(255,255,255,.05)}.mc-switch{background:rgba(255,255,255,.2)}",
    "  .mc-swatch[aria-pressed=true]{box-shadow:0 0 0 2px #1f1f1f,0 0 0 4px currentColor}",
    "  .mc-pop kbd,.mc-coach kbd,.mc-tour kbd{border-color:rgba(255,255,255,.25)}",
    "  .mc-tour-bar{background:rgba(255,255,255,.12)}.mc-tour-bar i{background:#A1A1AA}",
    "  .mc-coach::after{border-color:rgba(255,255,255,.1)}}"
  ].join("\n");

  function icon(paths, size) {
    return '<svg width="' + (size || 18) + '" height="' + (size || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
      ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  }
  var ICON_KEYS = icon('<rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 12.5h.01M18 12.5h.01M10 12.5h4M8 16h8"/>');
  var ICON_GHOST = icon('<path d="M12 2.5a7.5 7.5 0 0 0-7.5 7.5v11.5l2.8-2.4 2.4 2.4L12 19.1l2.3 2.4 2.4-2.4 2.8 2.4V10A7.5 7.5 0 0 0 12 2.5z"/><path d="M9.5 10h.01M14.5 10h.01"/>');
  var ICON_PEOPLE = icon('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>', 16);
  var ICON_EYE_OFF = icon('<path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.6 3.5M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7c1.8 0 3.4-.5 4.8-1.3"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M2 2l20 20"/>', 16);

  function cursorSVG(color) {
    return '<svg width="20" height="22" viewBox="0 0 20 22" fill="none">' +
      '<path d="M2 2 L2 17.5 L6.3 13.4 L9.3 20 L12.2 18.7 L9.3 12.3 L15.4 12.3 Z" fill="' + color +
      '" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  }

  function initials(name) {
    return name.split(/\s+/).map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase();
  }

  // ---- profile photos: small data URL (≤ 14 KB), validated on client and server ----
  var AVATAR_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/;
  var AVATAR_MAX = 14000;
  function validAvatar(v) { return typeof v === "string" && v.length <= AVATAR_MAX && AVATAR_RE.test(v) ? v : ""; }

  // Draws the photo (or the initials when there is none) inside an avatar
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

  // Crops to a centered square and shrinks it until it weighs less than AVATAR_MAX
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
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, sizes[i], sizes[i]);   // background for transparent PNGs
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

  function resolveLang(l) {
    if (l === "auto") l = ((global.navigator && navigator.language) || "en").slice(0, 2).toLowerCase();
    return typeof l === "string" && /^[a-z]{2}$/.test(l) ? l : "en";
  }

  // ---- Ably transport (serverless hosts such as Vercel) -----------------------
  // Speaks the same protocol as server.py, but on top of Ably channels: presence
  // says who is in each room and messages carry state and events. Since there is
  // no server in between, everything a peer sends is validated here, with the
  // same rules server.py applies.
  // Ably Pub/Sub v3 for devices (exposes window.AblyPubSub). Accounts billed by
  // monthly active users reject the older "ably" v2 SDK (error 40168).
  var ABLY_SDK = "https://cdn.ably.com/lib/ably.min-3.js";
  function ablyLib() { return global.AblyPubSub || global.Ably; }
  var ablyLoading = null;

  function loadAbly(src) {
    if (ablyLib()) return Promise.resolve(ablyLib());
    if (!ablyLoading) ablyLoading = new Promise(function (ok, ko) {
      var s = document.createElement("script");
      s.src = src; s.async = true;
      s.onload = function () { ablyLib() ? ok(ablyLib()) : ko(new Error("Ably SDK missing")); };
      s.onerror = function () { ablyLoading = null; s.remove(); ko(new Error("Ably SDK failed to load")); };
      document.head.appendChild(s);
    });
    return ablyLoading;
  }

  function abNum(v, lim) { return typeof v === "number" && isFinite(v) && Math.abs(v) < lim; }
  function abInt(v, max) { return typeof v === "number" && v === Math.floor(v) && v >= 0 && v < max; }
  function abPath(v) { return Array.isArray(v) && v.length <= 64 && v.every(function (i) { return abInt(i, 100000); }); }
  var AB_FIELDS = {
    name: function (v) { return typeof v === "string" && v.length > 0 && v.length <= 32; },
    color: function (v) { return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v); },
    x: function (v) { return abNum(v, 1e6); },
    y: function (v) { return abNum(v, 1e7); },
    visible: function (v) { return typeof v === "boolean"; },
    chat: function (v) { return typeof v === "string" && v.length <= 140; },
    sel: function (v) {
      return v === null || (!!v && typeof v === "object" && Object.keys(v).sort().join() === "a,ao,f,fo" &&
        abPath(v.a) && abPath(v.f) && abInt(v.ao, 1e6) && abInt(v.fo, 1e6));
    },
    avatar: function (v) { return typeof v === "string" && (v === "" || (v.length <= AVATAR_MAX && AVATAR_RE.test(v))); },
    uid: function (v) { return typeof v === "string" && /^[a-z0-9]{8,32}$/.test(v); }
  };
  function abPatch(m) {
    if (!m || typeof m !== "object") return null;
    var out = {}, n = 0;
    for (var k in AB_FIELDS) if (Object.prototype.hasOwnProperty.call(m, k) && AB_FIELDS[k](m[k])) { out[k] = m[k]; n++; }
    return n ? out : null;
  }
  function abEvent(m) {
    if (!m || (m.kind !== "click" && m.kind !== "reaction" && m.kind !== "board") || !abNum(m.x, 1e6) || !abNum(m.y, 1e7)) return null;
    var out = { kind: m.kind, x: m.x, y: m.y };
    if (m.kind === "reaction") {
      var e = m.emoji;
      if (!(typeof e === "string" && e.length > 0 && e.length <= 8 && !/[A-Za-z0-9<>&"'\s]/.test(e))) return null;
      out.emoji = e;
    }
    return out;
  }
  function abCopy(o) { var c = {}; for (var k in o) c[k] = o[k]; return c; }

  // Returns an object that behaves like the WebSocket to server.py:
  // readyState, send(json), close(), onopen, onmessage({ data }), onclose.
  function ablySocket(cfg, room) {
    var sock = { readyState: 0, onopen: null, onmessage: null, onclose: null };
    var id = "";
    while (id.length < 16) id += Math.random().toString(36).slice(2);
    id = "a" + id.slice(0, 16);
    var prefix = cfg.prefix || "roomful";
    var client = null, chan = null, site = null, closed = false;
    var state = {}, peak = 0, statsTimer = null, helloTimer = null;
    // Peers we know by name, state received from peers we don't know yet, and
    // when we last asked each of them to introduce themselves.
    var known = {}, pending = {}, asked = {}, lastIntro = 0;
    function noop() {}

    function emit(obj) { if (!closed && sock.onmessage) sock.onmessage({ data: JSON.stringify(obj) }); }
    function die() {
      if (closed) return;
      closed = true; sock.readyState = 3;
      clearInterval(statsTimer); clearTimeout(helloTimer);
      try { if (client) client.close(); } catch (e) {}
      if (sock.onclose) sock.onclose();
    }
    function stats() {
      if (closed || sock.readyState !== 1) return;
      Promise.all([chan.presence.get(), site.presence.get()]).then(function (r) {
        var n = r[0].length;
        if (n > peak) peak = n;
        // Anyone in the room we still can't draw (e.g. idle since we arrived)?
        r[0].forEach(function (m) { if (m.clientId !== id && !known[m.clientId]) ask(m.clientId); });
        emit({ t: "stats", room: n, site: Math.max(n, r[1].length), peak: peak });
      }).catch(noop);
    }
    // Our full state, right now (no timer: it must work in background tabs too,
    // where browsers slow timers down).
    function introduce() {
      var now = Date.now();
      if (closed || !state.name || now - lastIntro < 500) return;
      lastIntro = now;
      chan.publish("u", abCopy(state)).catch(noop);
    }
    // Ask a peer we can't draw yet (no name) to introduce themselves.
    function ask(cid) {
      var now = Date.now();
      if (closed || (asked[cid] && now - asked[cid] < 3000)) return;
      asked[cid] = now;
      chan.publish("w", { id: cid }).catch(noop);
    }
    // Someone came in: send them our full state so they can draw us right away.
    function hello() {
      clearTimeout(helloTimer);
      helloTimer = setTimeout(function () {
        if (!closed && state.name) chan.publish("u", abCopy(state)).catch(noop);
      }, 100 + Math.random() * 600);
    }
    function onUpdate(msg) {
      var cid = msg.clientId;
      if (cid === id) return;
      var p = abPatch(msg.data);
      if (!p) return;
      if (!known[cid]) {
        // We missed their introduction: keep what arrives and ask for the rest,
        // instead of drawing a nameless grey cursor.
        var q = pending[cid] || (pending[cid] = {});
        for (var k in p) q[k] = p[k];
        if (!q.name) { ask(cid); return; }
        p = q; delete pending[cid]; known[cid] = true;
      }
      p.t = "update"; p.id = cid;
      emit(p);
    }
    function onWho(msg) {
      if (msg.clientId !== id && msg.data && msg.data.id === id) introduce();
    }
    function onEvent(msg) {
      if (msg.clientId === id) return;
      var ev = abEvent(msg.data);
      if (!ev) return;
      ev.t = "event"; ev.id = msg.clientId;
      emit(ev);
    }
    function onPresence(pm) {
      if (pm.clientId !== id) {
        if (pm.action === "enter") hello();
        else if (pm.action === "leave") {
          delete known[pm.clientId]; delete pending[pm.clientId]; delete asked[pm.clientId];
          emit({ t: "leave", id: pm.clientId });
        }
      }
      stats();
    }

    sock.send = function (raw) {
      if (sock.readyState !== 1) return;
      var m;
      try { m = JSON.parse(raw); } catch (e) { return; }
      if (m.t === "event") {
        var ev = state.name && abEvent(m);
        if (ev) chan.publish("e", ev).catch(noop);
        return;
      }
      var patch = abPatch(m);
      if (!patch) return;
      var isNew = !state.name && !!patch.name;
      for (var k in patch) state[k] = patch[k];
      if (!state.name) return;                     // hasn't introduced itself yet
      chan.publish("u", isNew ? abCopy(state) : patch).catch(noop);
    };
    sock.close = function () { sock.onclose = null; die(); };

    loadAbly(cfg.sdk || ABLY_SDK).then(function (Ably) {
      if (closed) return;
      var options = {
        authUrl: cfg.authUrl || "/api/ably-token", authParams: { clientId: id },
        clientId: id, echoMessages: false, closeOnUnload: true
      };
      // v3: createClient(); v2 (or a custom sdk): new Ably.Realtime()
      client = Ably.createClient ? Ably.createClient(options) : new Ably.Realtime(options);
      client.connection.on(function (ch) {
        if (ch.current === "failed" || ch.current === "suspended" || ch.current === "closed") die();
      });
      chan = client.channels.get(prefix + ":room:" + encodeURIComponent(room));
      site = client.channels.get(prefix + ":site");
      return Promise.all([chan.subscribe("u", onUpdate), chan.subscribe("e", onEvent), chan.subscribe("w", onWho),
        chan.presence.subscribe(onPresence)])
        .then(function () { return Promise.all([chan.presence.enter(), site.presence.enter()]); })
        .then(function () {
          if (closed) return;
          sock.readyState = 1;
          if (sock.onopen) sock.onopen();
          emit({ t: "welcome", id: id, room: room, peers: [] });
          stats();
          statsTimer = setInterval(stats, 5000);
        });
    }).catch(die);

    return sock;
  }

  function init(opts) {
    opts = opts || {};
    var lang = resolveLang(opts.lang || "en");
    var anchorCenter = (opts.anchor || "center") === "center";
    var maxCursors = opts.maxCursors > 0 ? opts.maxCursors : 12;
    var idleMs = opts.idleMs > 0 ? opts.idleMs : 30000;
    var reducedMotion = global.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var botCount = reducedMotion ? 0 : Math.max(0, Math.min(12, opts.bots | 0));
    var botsRetireAt = opts.botsRetireAt > 0 ? opts.botsRetireAt : Math.max(1, botCount);
    var botsMin = Math.min(botCount, opts.botsMin == null ? 1 : Math.max(0, opts.botsMin | 0));
    var waveEmoji = opts.wave === false ? null : (typeof opts.wave === "string" && opts.wave ? opts.wave : "👋");
    var hoverDevice = !global.matchMedia || matchMedia("(hover: hover)").matches;
    var selfCursor = opts.selfCursor !== false && hoverDevice;
    var reactions = opts.reactions === false ? null : (opts.reactions || REACTIONS).slice(0, 9);
    var showClicks = opts.clicks !== false, showSel = opts.selection !== false;
    var canFollow = opts.follow !== false, editable = opts.editable !== false && !opts.name;

    // Translated text: opts.strings → built-in language → English → the key itself
    function t(key, vars) {
      var custom = opts.strings && opts.strings[lang] && opts.strings[lang][key];
      var s = custom || (I18N[lang] && I18N[lang].ui[key]) || I18N.en.ui[key] || key;
      if (vars) for (var k in vars) s = s.split("{" + k + "}").join(vars[k]);
      return s;
    }
    function botPhrases() {
      var p = opts.botPhrases;
      if (p && p.length) return p;                                    // a plain array
      if (p && (p[lang] || p.en)) return p[lang] || p.en;            // { en: [...], es: [...] }
      return (I18N[lang] || I18N.en).botPhrases;
    }

    // Identity: chosen and saved by the visitor (localStorage) or random per tab (sessionStorage)
    var custom = store("localStorage", "mc:me");
    var saved = custom || store("sessionStorage", "mc:me") || {};
    var gen = !opts.name && !custom && isGen(saved.gen) ? saved.gen : (!opts.name && !custom ? randomGen() : null);
    var me = {
      name: opts.name || (gen ? nameFor(gen, lang) : saved.name) || nameFor(randomGen(), lang),
      color: opts.color || saved.color || pick(COLORS),
      avatar: validAvatar(opts.avatar) || validAvatar(saved.avatar)
    };
    function saveRandomIdentity() {
      if (gen) store("sessionStorage", "mc:me", { name: me.name, color: me.color, avatar: me.avatar, gen: gen });
    }
    saveRandomIdentity();

    // Anonymous browser id, shared by all its tabs: your other tabs are recognised
    // as "you" (they don't show up in the pill and can't be followed).
    var uid = store("localStorage", "mc:uid");
    if (!/^[a-z0-9]{8,32}$/.test(uid || "")) {
      uid = (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).replace(/[^a-z0-9]/g, "").slice(0, 20);
      store("localStorage", "mc:uid", uid);
    }

    var baseUrl = opts.url || ((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws");
    // With Ably every message counts towards the plan: send positions a bit less often.
    var sendEvery = opts.ably ? Math.max(SEND_EVERY_MS, 100) : SEND_EVERY_MS;
    var autoRoom = opts.room == null;
    var room = autoRoom ? roomFromPath(location.pathname) : String(opts.room).slice(0, 128);
    var ghost = store("localStorage", "mc:ghost") === true;

    var peers = {};        // id -> peer
    var ws = null, destroyed = false, retry = 0, retryTimer = null;
    var last = { cx: 0, cy: 0, has: false, sent: 0, pending: null };
    var chatTimer = null, raf = 0, houseTimer = null, selTimer = null, resizeTimer = null;
    var lastSelJSON = "null", lastClick = -1e9, lastReact = -1e9;
    var following = null, openPop = null, picker = null, pickerReach = 0;
    var serverStats = { room: 0, site: 0, peak: 0 }, statsKey = "";
    var bots = [];
    var wave = { x: null, dir: 0, run: 0, flips: [], at: -1e9 };
    var tourSteps = opts.tour && opts.tour.steps && opts.tour.steps.length ? opts.tour.steps : null;
    var tour = null, spot = null, card = null, tourEls = {};
    var listeners = { board: [] };   // "board": someone changed the shared board (see roomful-board.js)

    // ---- DOM ----
    var style = el("style"); style.textContent = CSS; document.head.appendChild(style);
    var layer = el("div", "mc-layer", document.body);
    var selLayer = el("div", "", layer);           // selections, below the cursors
    var fxLayer = el("div", "", layer);            // ripples and emojis

    var local = el("div", "mc-local", document.body);
    var localTag = el("div", "mc-tag", local);
    var localName = el("div", "mc-name", localTag);
    var localAv = el("img", "mc-tag-av", localName);
    localAv.alt = ""; localAv.hidden = true;
    var localTxt = el("span", "", localName);
    var input = el("textarea", "", localTag);
    input.rows = 1;
    var measure = el("span", "mc-measure", localTag);   // mirrors the text to size the box
    var ownStyle = el("style"); document.head.appendChild(ownStyle);
    input.maxLength = 140;

    var followBox = el("div", "mc-follow", document.body);
    var followLabel = el("button", "", followBox);
    followLabel.type = "button";
    followLabel.addEventListener("click", function () { unfollow(); });

    // The pill: [People] | [Shortcuts] [Ghost mode] | [Your profile]
    // Every button says what it does (tooltip + shortcut) and opens a self-explanatory panel.
    // Chat and reactions live in the shortcuts panel: a key away, or a tap on touch screens.
    var presence = null, peopleBtn = null, keysBtn = null, ghostBtn = null, meBtn = null;
    var ghostText = null, showBtn = null, tooltip = null, coach = null, coachTimer = null;
    var lastInput = "mouse", lastTouchAt = -1e9, touchStart = null, chatDocked = false;
    if (opts.presence !== false) {
      presence = el("div", "mc-presence", document.body);
      presence.setAttribute("role", "toolbar");
      peopleBtn = pillButton("mc-btn mc-people", "", function () { togglePop("people"); });
      if (opts.chat !== false || reactions) {
        el("span", "mc-sep", presence);
        keysBtn = pillButton("mc-btn mc-icon mc-keys-btn", "?", function () { togglePop("keys"); }, ICON_KEYS);
      } else el("span", "mc-sep", presence);
      // One click to vanish; the pill then shrinks to "Cursors hidden · Show"
      ghostBtn = pillButton("mc-btn mc-icon mc-ghost-btn", "", function () { closePop(); closePicker(); setGhost(true); }, ICON_GHOST);
      el("span", "mc-sep", presence);
      meBtn = pillButton("mc-btn mc-me-btn", "", function () { togglePop("profile"); });
      var ghostBar = el("div", "mc-ghost-bar", presence);
      ghostBar.innerHTML = ICON_EYE_OFF;
      ghostText = el("span", "", ghostBar);
      showBtn = el("button", "mc-btn mc-pill-btn", ghostBar);
      showBtn.type = "button";
      showBtn.addEventListener("click", function () { setGhost(false); });
      tooltip = el("div", "mc-tooltip", document.body);
      tooltip.setAttribute("aria-hidden", "true");
    }

    // Static texts (re-applied when the language changes)
    function applyStaticTexts() {
      input.placeholder = t("chatPlaceholder");
      input.setAttribute("aria-label", t("chatLabel"));
      if (!presence) return;
      presence.setAttribute("aria-label", t("toolbar"));
      if (keysBtn) setTip(keysBtn, t("keys"));
      setTip(ghostBtn, t("ghost"), t("ghost") + ". " + t("ghostHelp"));
      ghostText.textContent = t("hidden");
      showBtn.textContent = t("show");
    }

    function pillButton(cls, kbd, onClick, iconHTML) {
      var b = el("button", cls, presence);
      b.type = "button";
      if (kbd) { b.dataset.kbd = kbd; b.setAttribute("aria-keyshortcuts", kbd); }
      if (iconHTML) b.innerHTML = iconHTML;
      b.addEventListener("click", function () { hideTip(); onClick(); });
      b.addEventListener("mouseenter", function () { showTip(b); });
      b.addEventListener("mouseleave", hideTip);
      b.addEventListener("focus", function () { try { if (b.matches(":focus-visible")) showTip(b); } catch (e) {} });
      b.addEventListener("blur", hideTip);
      return b;
    }
    function setTip(b, label, ariaLabel) {
      b.dataset.tip = label;
      b.setAttribute("aria-label", ariaLabel || label);
    }
    function showTip(b) {
      if (!tooltip || !b.dataset.tip || b.getAttribute("aria-expanded") === "true") return;
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
      if (keysBtn) keysBtn.setAttribute("aria-expanded", String(!!openPop && openPop.kind === "keys"));
    }

    // First-visit hint: what this is and how to use it (shown once)
    function showCoach() {
      if (!presence || ghost || coach || tour || opts.onboarding === false || store("localStorage", "mc:onboarded")) return;
      coach = el("div", "mc-coach", document.body);
      coach.setAttribute("role", "dialog");
      coach.setAttribute("aria-label", t("coachLabel"));
      el("b", "", coach).textContent = t("coachTitle");
      var tips = [];
      var touchUI = isTouchUI();
      if (!touchUI && opts.chat !== false) tips.push(t("coachChat"));
      if (!touchUI && reactions) tips.push(t("coachReact"));
      el("p", "", coach).innerHTML = t("coachBody") + (!keysBtn ? "" : touchUI ? " " + t("coachKeysTouch") :
        " " + t("coachShortcuts") + " " + tips.join(" " + t("and") + " ") + ". " + t("coachKeys"));
      var row = el("div", "mc-row", coach);
      if (tourSteps && opts.tour.offer !== false) {
        var go = el("button", "mc-btn mc-pill-btn", row);
        go.type = "button"; go.textContent = "▶ " + t("tourOffer");
        go.addEventListener("click", function () { dismissCoach(); startTour(0); });
      }
      var ok = el("button", tourSteps ? "mc-btn mc-outline" : "mc-btn mc-pill-btn", row);
      ok.type = "button"; ok.textContent = t("gotIt");
      ok.addEventListener("click", dismissCoach);
    }
    function dismissCoach() {
      clearTimeout(coachTimer);
      store("localStorage", "mc:onboarded", true);
      if (coach) { coach.remove(); coach = null; }
    }

    // Your own cursor and name tag, painted in your color
    function paintLocalTag() {
      localTag.style.background = me.color; localTag.style.color = textOn(me.color);
      localTxt.textContent = me.name;
      if (me.avatar) localAv.src = me.avatar;
      localAv.hidden = !me.avatar;
      localTag.classList.toggle("mc-has-av", !!me.avatar);
      if (selfCursor) {
        var svg = cursorSVG(me.color).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
        ownStyle.textContent = "html.mc-own{cursor:url(\"data:image/svg+xml," + encodeURIComponent(svg) + "\") 2 2,auto}" +
          ":where(html.mc-own) :where(input,textarea,select,[contenteditable]){cursor:auto}";
      }
      showSelf();
    }
    // Shown with a mouse, while the pointer is on the page and you're not a ghost
    var pointerIn = false;
    function showSelf() {
      var on = selfCursor && !ghost && !destroyed;
      document.documentElement.classList.toggle("mc-own", on);
      local.classList.toggle("mc-show", on && pointerIn && last.has && lastInput === "mouse");
    }
    paintLocalTag();

    // ---- coordinates ----
    function originX() { return anchorCenter ? document.documentElement.clientWidth / 2 : 0; }
    function toShared(cx, cy) {
      return { x: Math.round(cx + global.scrollX - originX()), y: Math.round(cy + global.scrollY) };
    }
    function myPoint() {
      return last.has ? toShared(last.cx, last.cy) : toShared(innerWidth / 2, innerHeight / 2);
    }

    // ---- network ----
    function send(obj) {
      if (ws && ws.readyState === 1) { obj.t = obj.t || "update"; ws.send(JSON.stringify(obj)); }
    }

    function sendPosition() {
      if (!last.has || ghost) return;
      var now = performance.now();
      var wait = sendEvery - (now - last.sent);
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
        sock = ws = opts.ably
          ? ablySocket(opts.ably, room)
          : new WebSocket(baseUrl + (baseUrl.indexOf("?") < 0 ? "?" : "&") + "room=" + encodeURIComponent(room));
      } catch (e) { return scheduleRetry(); }
      sock.onopen = function () {
        retry = 0;
        var msg = { name: me.name, color: me.color, visible: false, uid: uid };
        if (me.avatar) msg.avatar = me.avatar;
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

    // Exponential backoff with jitter: 0.5 s, 1 s, 2 s… up to 15 s
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

    // ---- ghost mode: you don't see anyone and nobody sees you ----
    function setGhost(on) {
      ghost = !!on;
      store("localStorage", "mc:ghost", ghost);
      layer.classList.toggle("mc-off", ghost);
      if (ghost) {
        stopTour(false);
        if (local.classList.contains("mc-open")) closeChat(false);
        unfollow(); closePicker(); closePop();
        disconnect();
      } else {
        retry = 0;
        connect();
        kick();
      }
      showSelf();
      renderPresence();
    }

    // ---- editable identity ----
    // avatar: image data URL, "" to remove the photo, undefined to leave it as is
    function setIdentity(name, color, avatar) {
      name = String(name || "").replace(/\s+/g, " ").trim().slice(0, 32) || me.name;
      color = /^#[0-9a-fA-F]{6}$/.test(color || "") ? color.toUpperCase() : me.color;
      if (name === me.name && color === me.color && (avatar === undefined || validAvatar(avatar) === me.avatar)) return false;
      me.name = name; me.color = color;
      if (avatar !== undefined) me.avatar = validAvatar(avatar);
      gen = null;                                 // chosen by the visitor: no longer random
      store("localStorage", "mc:me", { name: me.name, color: me.color, avatar: me.avatar });
      paintLocalTag();
      for (var id in peers) markSelf(peers[id]);  // your name/color changed: re-check which tabs are "you"
      send({ name: name, color: color, avatar: me.avatar });
      renderPresence();
      return true;
    }

    // ---- language ----
    function setLang(l) {
      l = resolveLang(l);
      if (l === lang) return;
      lang = l;
      if (gen) {                                  // random names follow the language
        me.name = nameFor(gen, lang);
        saveRandomIdentity();
        paintLocalTag();
        send({ name: me.name });
      }
      bots.forEach(function (b) {
        var p = peers[b.id];
        if (p) upsertPeer({ id: b.id, name: nameFor(b.gen, lang) });
        if (p && p.badge) { p.badge.textContent = t("bot"); p.badge.title = t("botTip"); }
      });
      if (peers.guide) {
        upsertPeer({ id: "guide", name: guideName() });
        peers.guide.badge.textContent = t("guide"); peers.guide.badge.title = t("guideTip");
      }
      if (tour) {
        renderCard();
        if (tour.arrived) { tour.typing = null; upsertPeer({ id: "guide", chat: tx(tourSteps[tour.i].say) }); }
      }
      applyStaticTexts();
      if (peopleBtn) peopleBtn._key = null;
      if (meBtn) meBtn._key = null;
      if (following !== null && peers[following]) paintFollow(peers[following]);
      var reopen = openPop && openPop.kind;
      closePop(); closePicker(); hideTip();
      if (coach) { coach.remove(); coach = null; showCoach(); }
      renderPresence();
      if (reopen) togglePop(reopen);
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

    // Is this another tab of yours? The browser id decides; if the tab doesn't send one
    // (e.g. it still runs an older version of the script), name + color are compared.
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

    // ---- text selection ----
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
      } catch (e) { /* the DOM doesn't match: nothing is drawn */ }
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

    // ---- clicks and reactions ----
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
      if (m.kind === "board") {                      // no drawing here: just "go and fetch the board"
        listeners.board.forEach(function (fn) { try { fn(); } catch (e) {} });
        return;
      }
      var p = peers[m.id];
      if (!p || ghost || p.self) return;
      setActive(p, performance.now());
      if (m.kind === "click") spawnRipple(m, p.color);
      else if (m.kind === "reaction" && m.emoji) spawnReaction(m, m.emoji);
    }

    // emoji picker
    function openPicker(x, y, fromButton) {
      if (!reactions || ghost) return;
      closePicker(); closePop();
      picker = el("div", "mc-picker", document.body);
      picker.setAttribute("role", "menu");
      reactions.forEach(function (emo) {
        var b = el("button", "mc-btn", picker);
        b.type = "button"; b.setAttribute("role", "menuitem");
        b.textContent = emo;
        b.title = t("reactWith", { e: emo });
        b.addEventListener("click", function () { closePicker(); react(emo); });
      });
      var w = picker.offsetWidth, h = picker.offsetHeight;
      var left = fromButton ? x - w : x - w / 2, top = fromButton ? y - h : y - h - 18;
      picker.style.left = Math.max(8, Math.min(innerWidth - w - 8, left)) + "px";
      picker.style.top = Math.max(8, Math.min(innerHeight - h - 8, top)) + "px";
      if (fromButton) picker.querySelector("button").focus();
      // Moving away from it without picking closes it (measured from where the pointer was,
      // so a picker opened far from the cursor doesn't vanish while you head towards it)
      pickerReach = last.has ? pickerDistance(last.cx, last.cy) : 0;
      dismissCoach();
      setExpanded();
    }
    function closePicker() { if (picker) { picker.remove(); picker = null; } setExpanded(); }
    function pickerDistance(x, y) {
      var r = picker.getBoundingClientRect();
      return Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
    }

    // ---- following someone ----
    function paintFollow(p) {
      followBox.style.borderColor = p.color;
      followLabel.style.background = p.color;
      followLabel.style.color = textOn(p.color);
      followLabel.textContent = t("following", { name: p.name });
      el("span", "", followLabel).textContent = t("stopFollowing");
      followLabel.setAttribute("aria-label", t("stopFollowingName", { name: p.name }));
    }
    function follow(id) {
      var p = peers[id];
      if (!p || p.self || ghost || !canFollow) return;     // you can't follow yourself
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

    // ---- panels: people and profile ----
    function closePop() {
      if (openPop) { var o = openPop; openPop = null; if (o.flush) o.flush(); o.el.remove(); }
      setExpanded();
    }
    function togglePop(kind) {
      if (openPop && openPop.kind === kind) return closePop();
      closePop(); closePicker(); hideTip(); dismissCoach();
      if (kind === "people" && !ghost) openPeople();
      else if (kind === "profile") openProfile();
      else if (kind === "keys") openKeys();
      setExpanded();
    }

    // The shortcuts panel: every key Roomful listens to. Each action row also works
    // as a button, so touch screens (no keyboard) can still write and react.
    function openKeys() {
      var pop = el("div", "mc-pop", document.body);
      pop.setAttribute("role", "dialog");
      pop.setAttribute("aria-label", t("keysTitle"));
      el("h4", "", el("div", "mc-head", pop)).textContent = t("keysTitle");
      pop.querySelector("h4").style.margin = "0";
      var list = el("div", "mc-keys", pop);
      function row(key, label, sub, action) {
        var r = el(action ? "button" : "div", "mc-key", list);
        if (action) { r.type = "button"; r.addEventListener("click", function () { closePop(); action(); }); }
        el("kbd", "", r).textContent = key;
        var tx = el("span", "", r); tx.textContent = label;
        if (sub) el("small", "", tx).textContent = sub;
        return r;
      }
      if (opts.chat !== false) row("/", t("chatTip"), "", function () { open("chat"); });
      if (reactions) row("E", t("react"), t("keysPick", { n: Math.min(9, reactions.length) }), function () { open("reactions"); });
      row("Esc", t("keysEsc"));
      row("?", t("keysHelp"));
      el("p", "mc-foot", pop).textContent = t(isTouchUI() ? "keysFootTouch" : "keysFoot");
      openPop = { kind: "keys", el: pop };
    }

    function currentStats() {
      if (ghost) return { page: 0, site: 0, peak: 0 };
      var nb = activeBots();
      var page = 1 + realCount() + nb;             // you + real people + bots
      return { page: page, site: Math.max(page, serverStats.site + nb), peak: Math.max(page, serverStats.peak + nb) };
    }
    function activeBots() {
      var n = 0;
      for (var id in peers) if (peers[id].bot && !peers[id].retired && !peers[id].guide) n++;
      return n;
    }

    // You first, then everyone else (without your other tabs or retired bots)
    function peopleList() {
      var arr = [{ id: null, me: true, name: me.name, color: me.color, avatar: me.avatar }];
      for (var id in peers) {
        var p = peers[id];
        if (p.name && !p.retired && !p.self && !p.guide) arr.push(p);
      }
      return arr;
    }
    function statusOf(u) {
      if (u.me) return [t("you"), "mc-me"];
      if (u.chat) return [t("typing"), "mc-typing"];
      if (!u.visible || u.idle) return [t("away"), "mc-away"];
      return [t("active"), ""];
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
      pop.setAttribute("aria-label", t("toolbar"));
      var head = el("div", "mc-head", pop);
      var big = el("div", "mc-big", head);
      var txt = el("div", "", head);
      var title = el("div", "", txt); title.style.fontWeight = "600";
      var sub = el("div", "mc-sub", txt);
      var list = el("ul", "mc-list", pop);
      if (canFollow) el("p", "mc-foot", pop).innerHTML = t(isTouchUI() ? "followHelpTouch" : "followHelp");
      openPop = { kind: "people", el: pop, update: function () {
        var s = currentStats();
        big.textContent = s.page;
        title.textContent = s.page === 1 ? t("onlyYouNow") : t("peopleHere");
        sub.textContent = t("siteAndPeak", { site: s.site, peak: s.peak });
        renderPeopleList(list);
      } };
      openPop.update();
    }

    function renderPeopleList(list) {
      var arr = peopleList();
      var key = lang + "|" + following + "|" + arr.map(function (u) {
        return u.id + u.name + u.color + (u.avatar ? u.avatar.length : "") + statusOf(u)[0];
      }).join("|");
      if (list._key === key) return;               // don't rebuild without changes (no lost clicks)
      list._key = key;
      list.innerHTML = "";
      arr.forEach(function (u) {
        var li = el("li", "mc-person", list);
        face("", u, li);
        var who = el("div", "mc-who", li);
        var nm = el("b", "", who);
        el("span", "", nm).textContent = u.name;
        if (u.bot) { var bg = el("span", "mc-badge", nm); bg.textContent = t("bot"); bg.title = t("botTip"); }
        var st = statusOf(u), status = el("span", "mc-status " + st[1], who);
        if (!u.me) el("i", "", status);
        status.appendChild(document.createTextNode(st[0]));
        var b;
        if (u.me && editable) {
          b = el("button", "mc-btn mc-act", li);
          b.textContent = t("edit");
          b.setAttribute("aria-label", t("editProfile"));
          b.addEventListener("click", function () { togglePop("profile"); });
        } else if (!u.me && canFollow) {
          var on = following === u.id;
          b = el("button", "mc-btn mc-act" + (on ? " mc-on" : ""), li);
          b.textContent = on ? t("followingBtn") : t("follow");
          b.setAttribute("aria-pressed", String(on));
          b.setAttribute("aria-label", t(on ? "stopFollowingName" : "followName", { name: u.name }));
          b.addEventListener("mouseenter", function () { if (following === u.id) b.textContent = t("stop"); });
          b.addEventListener("mouseleave", function () { if (following === u.id) b.textContent = t("followingBtn"); });
          b.addEventListener("click", function () {
            if (following === u.id) { unfollow(); return; }
            follow(u.id);
            if (following === u.id) closePop();       // now following: get the panel out of the way
          });
        }
        if (b) b.type = "button";
      });
    }

    function openProfile() {
      var pop = el("div", "mc-pop", document.body);
      pop.setAttribute("role", "dialog");
      pop.setAttribute("aria-label", t("profile"));
      var body = el("div", "mc-pop-body", pop);
      el("h4", "", body).textContent = t("profile");
      openPop = { kind: "profile", el: pop };
      var nameIn = null;

      if (editable) {
        var color = me.color, avatar = me.avatar || "";

        // Photo: picked from the computer, cropped and shrunk in the browser
        var photo = el("div", "mc-photo", body);
        var preview = el("div", "mc-avatar", photo);
        var info = el("div", "", photo);
        var file = el("input", "", info);
        file.type = "file"; file.accept = "image/*"; file.hidden = true;
        var upBtn = el("button", "mc-btn mc-outline", info); upBtn.type = "button";
        var rmBtn = el("button", "mc-link", info); rmBtn.type = "button"; rmBtn.textContent = t("remove");
        var note = el("small", "", info);
        note.textContent = t("photoNote");

        var nameLabel = el("label", "mc-label", body); nameLabel.textContent = t("name");
        nameIn = el("input", "", body);
        nameIn.value = me.name; nameIn.maxLength = 32;
        nameIn.id = "mc-name-" + uid; nameLabel.htmlFor = nameIn.id;

        el("span", "mc-label", body).textContent = t("color");
        var sw = el("div", "mc-swatches", body);
        sw.setAttribute("role", "group"); sw.setAttribute("aria-label", t("color"));

        var paintPreview = function () {
          preview.style.background = color; preview.style.color = textOn(color);
          avatarFace(preview, nameIn.value.trim() || me.name, avatar);
          upBtn.textContent = avatar ? t("changePhoto") : t("uploadPhoto");
          rmBtn.hidden = !avatar;
        };
        // No Save button: every change is applied and remembered right away
        // (the name after a short pause in typing, on Enter or when leaving the field).
        var savedEl = null, savedTimer = null, nameTimer = null;
        var commit = function () {
          clearTimeout(nameTimer); nameTimer = null;
          if (!setIdentity(nameIn.value, color, avatar) || !savedEl) return;
          savedEl.textContent = t("saved"); savedEl.classList.add("mc-on");
          clearTimeout(savedTimer);
          savedTimer = setTimeout(function () { savedEl.textContent = t("autoSave"); savedEl.classList.remove("mc-on"); }, 1600);
        };
        openPop.flush = function () { clearTimeout(savedTimer); if (nameTimer) commit(); };
        var setColor = function (c, save) {
          color = c;
          sw.querySelectorAll(".mc-swatch").forEach(function (o) { o.setAttribute("aria-pressed", String(o.dataset.c === c)); });
          paintPreview();
          if (save) commit();
        };
        COLORS.forEach(function (c) {
          var b = el("button", "mc-swatch", sw);
          b.type = "button"; b.style.background = c; b.style.color = c; b.dataset.c = c;
          b.setAttribute("aria-label", t("colorN", { c: c }));
          b.addEventListener("click", function () { setColor(c, true); });
        });
        upBtn.addEventListener("click", function () { file.click(); });
        rmBtn.addEventListener("click", function () { avatar = ""; paintPreview(); commit(); });
        file.addEventListener("change", function () {
          var f = file.files && file.files[0];
          file.value = "";
          if (!f) return;
          if (!/^image\//.test(f.type)) { note.textContent = t("notImage"); return; }
          upBtn.textContent = t("processing");
          imageToAvatar(f, function (url) {
            if (url) { avatar = url; note.textContent = t("photoNote"); }
            else note.textContent = t("badImage");
            paintPreview();
            if (url) commit();
          });
        });
        nameIn.addEventListener("input", function () {
          paintPreview();
          clearTimeout(nameTimer);
          if (nameIn.value.trim()) nameTimer = setTimeout(commit, 600);
        });
        nameIn.addEventListener("blur", function () {
          if (!nameIn.value.trim()) { nameIn.value = me.name; paintPreview(); } else commit();
        });
        setColor(color);

        var row = el("div", "mc-row", body);
        var dice = el("button", "mc-btn", row); dice.type = "button"; dice.textContent = t("random");
        dice.title = t("randomTip");
        dice.addEventListener("click", function () {         // random name AND color (never the same)
          var n, c, tries = 0;
          do { n = nameFor(randomGen(), lang); } while (n === nameIn.value && ++tries < 20);
          do { c = pick(COLORS); } while (c === color && ++tries < 40);
          nameIn.value = n;
          setColor(c, true);
        });
        savedEl = el("span", "mc-saved", row);
        savedEl.setAttribute("role", "status");
        savedEl.textContent = t("autoSave");
        nameIn.addEventListener("keydown", function (e) {
          e.stopPropagation();
          if (e.key === "Enter" || e.key === "Escape") { if (nameIn.value.trim()) commit(); closePop(); }
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
        el("b", "", stxt).textContent = t("ghost");
        el("small", "", stxt).textContent = t("ghostHelp");
        var swBtn = el("button", "mc-switch", srow);
        swBtn.type = "button"; swBtn.setAttribute("role", "switch");
        swBtn.setAttribute("aria-checked", String(ghost));
        swBtn.setAttribute("aria-label", t("ghost"));
        swBtn.addEventListener("click", function () { setGhost(!ghost); });
      }
      if (nameIn) { nameIn.focus(); nameIn.select(); }
    }

    // ---- cursor cap + idle state (every second) ----
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
      // priority: real people > bots; active > idle; most recent first
      list.sort(function (a, b) {
        return (!!a.bot - !!b.bot) || (!!a.idle - !!b.idle) || (b.lastActive - a.lastActive);
      });
      list.forEach(function (p, i) {
        var capped = i >= maxCursors && p.id !== following && !p.guide;
        if (capped !== !!p.capped) { p.capped = capped; p.el.classList.toggle("mc-capped", capped); }
      });
      emitStats();
      if (openPop && openPop.kind === "people") openPop.update();   // "Active" → "Away", etc.
    }

    function emitStats() {
      var s = currentStats(), key = s.page + "|" + s.site + "|" + s.peak;
      if (key === statsKey) return;
      statsKey = key;
      if (openPop && openPop.update) openPop.update();
      if (typeof opts.onStats === "function") { try { opts.onStats(s); } catch (e) { /* never break the host page */ } }
    }

    // ---- bots: fake visitors ----
    // Picks an "interesting" point (a button, a heading…) in shared coordinates.
    // here=true → inside what the visitor sees; here=false → outside their view
    // (returns null when the page is so short there is no "outside").
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
        var g, name, color, tries = 0;
        do { g = randomGen(); name = nameFor(g, lang); } while (names[name] && ++tries < 50);
        do { color = pick(COLORS); } while (colors[color] && ++tries < 100);
        names[name] = 1; colors[color] = 1;
        // The first one starts on screen; the rest elsewhere on the page.
        var now = performance.now(), here = i === 0;
        var start = pickBotTarget(here) || pickBotTarget(true), id = "bot-" + i;
        upsertPeer({ id: id, name: name, color: color, x: start.x, y: start.y, visible: true });
        markBot(peers[id]);
        bots.push({ id: id, gen: g, seg: null, waitUntil: now + rand(200, 2000), chat: null, greet: here,
          here: here, modeUntil: now + (here ? rand(BOT_HERE_MS[0], BOT_HERE_MS[1]) : rand(4000, 12000)),
          nextChat: now + rand(4000, 8000) });
      }
      renderPresence();
    }

    // Bots are labelled so nobody mistakes them for real people
    function markBot(p) {
      p.bot = true;
      p.el.classList.add("mc-is-bot");
      var b = el("span", "mc-badge", p.nameEl);
      b.textContent = t("bot"); b.title = t("botTip");
      p.badge = b;
    }

    // Each bot alternates between "visiting" (on your screen) and "away" (off screen).
    // Usually only one is visiting at a time, and sometimes none.
    function updateBotMode(b, now) {
      if (now < b.modeUntil || b.chat || following === b.id) return;
      var visiting = bots.filter(function (o) { return o.here && o !== b; }).length;
      if (b.here) {
        b.here = false;
        b.modeUntil = now + rand(BOT_AWAY_MS[0], BOT_AWAY_MS[1]);
      } else if (visiting === 0 || Math.random() < 0.15) {
        b.here = true;
        b.greet = Math.random() < 0.4;              // sometimes waves when it arrives
        b.modeUntil = now + rand(BOT_HERE_MS[0], BOT_HERE_MS[1]);
        // says something in about half of its visits; otherwise it just looks around
        b.nextChat = Math.random() < 0.5 ? now + rand(2500, 6000) : Infinity;
      } else {
        b.modeUntil = now + rand(3000, 8000);       // someone is already visiting: wait
        return;
      }
      if (!b.seg) b.waitUntil = now;                 // get moving right away
    }

    // With enough real people, the bots retire (except botsMin of them, which
    // always stay); they come back if the page empties.
    function updateBotRetirement() {
      var crowded = realCount() >= botsRetireAt, changed = false;
      bots.forEach(function (b, i) {
        var p = peers[b.id], retire = crowded && i >= botsMin;
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
      if (tour) {                                      // during the tour they step aside and keep quiet
        bots.forEach(function (b) {
          var p = peers[b.id];
          if (p && p.visible && !p.retired) upsertPeer({ id: b.id, visible: false, chat: "" });
          b.chat = null; b.seg = null; b.wave = null; b.here = false; b.waitUntil = now + 1500;
          b.modeUntil = now + rand(3000, 9000);
        });
        return;
      }
      bots.forEach(function (b) {
        var p = peers[b.id];
        if (!p || p.retired) return;
        updateBotMode(b, now);

        if (b.wave) {                                  // waving: a quick side-to-side shake
          var wt = now - b.wave.t0;
          p.x = b.wave.x + Math.sin(wt / 55) * 16;
          setActive(p, now);
          if (wt > 700) {
            p.x = b.wave.x; b.wave = null;
            if (waveEmoji) spawnReaction(p, waveEmoji);
            b.waitUntil = now + rand(800, 1600);
          }
          return;
        }

        if (b.seg) {                                   // moving (cubic Bézier curve)
          var s = b.seg, tt = Math.min(1, (now - s.t0) / s.dur), e = ease(tt), u = 1 - e;
          p.x = u*u*u*s.x0 + 3*u*u*e*s.x1 + 3*u*e*e*s.x2 + e*e*e*s.x3;
          p.y = u*u*u*s.y0 + 3*u*u*e*s.y1 + 3*u*e*e*s.y2 + e*e*e*s.y3;
          setActive(p, now);
          if (tt >= 1) {
            b.seg = null;
            b.waitUntil = now + (Math.random() < 0.2 ? rand(2500, 5000) : rand(300, 1800));
            if (b.here && b.greet && waveEmoji) {      // first stop of a visit: waves 👋
              b.greet = false;
              b.wave = { t0: now, x: p.x };
            } else if (b.here) {                       // on arrival: sometimes clicks or reacts
              var roll = Math.random();
              if (roll < 0.22) spawnRipple(p, p.color);
              else if (roll < 0.27 && reactions) spawnReaction(p, pick(reactions));
            }
          }
          return;
        }

        if (b.chat) {                                  // typing / showing a message
          var c = b.chat;
          if (c.i < c.text.length && now >= c.nextAt) {
            c.i++; c.nextAt = now + rand(40, 110);
            upsertPeer({ id: b.id, chat: c.text.slice(0, c.i) });
            if (c.i === c.text.length) c.until = now + rand(2500, 4000);
          } else if (c.until && now >= c.until) {
            b.chat = null;
            upsertPeer({ id: b.id, chat: "" });
            b.nextChat = Infinity;                     // at most one message per visit
            b.waitUntil = now + rand(300, 900);
          }
          return;
        }

        var inView = p.y > global.scrollY + 60 && p.y < global.scrollY + innerHeight - 80;
        var someoneTalking = bots.some(function (o) { return o.chat; });
        if (opts.botChat !== false && b.here && now >= b.nextChat && inView && !someoneTalking) {
          b.chat = { text: pick(botPhrases()), i: 0, nextAt: now + rand(300, 700), until: 0 };
          return;
        }

        if (now >= b.waitUntil) {                      // new destination
          var to = pickBotTarget(b.here);
          if (!to) {                                   // short page: "leaves" by fading out
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
        } else if (Math.random() < 0.04) {             // tiny moves while resting
          p.x += rand(-2, 2); p.y += rand(-2, 2);
          setActive(p, now);
        }
      });
    }

    // ---- guided tour ----
    // A grey guide bot flies to each step's element (the page scrolls there),
    // types a short line in its bubble and a card explains the step in detail.
    // It moves on by itself after enough time to read; you can go back, pause,
    // skip or close. Other bots step aside meanwhile. Only you see the guide.
    function tx(v) { return v == null ? "" : typeof v === "string" ? v : (v[lang] || v.en || ""); }
    function guideName() { return tx((opts.tour && opts.tour.name) || { en: "Capybara", es: "Capibara" }); }
    function plain(html) { var d = document.createElement("div"); d.innerHTML = html; return d.textContent || ""; }
    function readMs(step) {                          // ~220 words per minute + a moment to look
      var words = (tx(step.title) + " " + plain(tx(step.text))).split(/\s+/).filter(Boolean).length;
      return Math.max(8000, words * 270 + 3000);
    }
    function isFixed(node) {
      for (; node && node.nodeType === 1; node = node.parentElement) {
        if (getComputedStyle(node).position === "fixed") return true;
      }
      return false;
    }

    function ensureGuide() {
      var p = peers.guide;
      if (!p) {
        var at = myPoint();
        upsertPeer({ id: "guide", name: guideName(), color: GUIDE_COLOR, x: at.x - 80, y: at.y - 60, visible: true });
        p = peers.guide;
        p.bot = true; p.guide = true;
        p.el.classList.add("mc-is-guide");
        p.badge = el("span", "mc-badge", p.nameEl);
      }
      p.badge.textContent = t("guide"); p.badge.title = t("guideTip");
      if (!p.visible) upsertPeer({ id: "guide", visible: true });
      return p;
    }

    function buildTourUI() {
      spot = el("div", "mc-spot", document.body);
      card = el("div", "mc-tour", document.body);
      card.setAttribute("role", "dialog");
      var head = el("div", "mc-tour-head", card);
      tourEls.chip = el("span", "mc-guide-chip", head);
      tourEls.count = el("span", "mc-tour-count", head);
      tourEls.x = el("button", "mc-btn mc-tour-x", head);
      tourEls.x.type = "button"; tourEls.x.textContent = "✕";
      tourEls.x.addEventListener("click", function () { stopTour(false); });
      tourEls.title = el("h4", "", card);
      tourEls.text = el("div", "mc-tour-text", card);
      tourEls.text.setAttribute("aria-live", "polite");
      tourEls.bar = el("i", "", el("div", "mc-tour-bar", card));
      var row = el("div", "mc-tour-row", card);
      tourEls.back = el("button", "mc-btn mc-outline", row);
      tourEls.pause = el("button", "mc-btn mc-outline", row);
      tourEls.next = el("button", "mc-btn mc-primary", row);
      [tourEls.back, tourEls.pause, tourEls.next].forEach(function (b) { b.type = "button"; });
      tourEls.back.addEventListener("click", tourBack);
      tourEls.next.addEventListener("click", tourNext);
      tourEls.pause.addEventListener("click", function () { if (tour) { tour.paused = !tour.paused; renderCard(); } });
    }

    function renderCard() {
      if (!card || !tour) return;
      var step = tourSteps[tour.i], n = tourSteps.length, last = tour.i === n - 1;
      card.classList.toggle("mc-touch", isTouchUI());
      card.setAttribute("aria-label", t("tourLabel"));
      tourEls.chip.innerHTML = "";
      el("span", "", tourEls.chip).textContent = guideName();
      el("span", "mc-badge", tourEls.chip).textContent = t("guide");
      tourEls.count.textContent = t("tourStep", { n: tour.i + 1, total: n });
      tourEls.x.setAttribute("aria-label", t("tourClose")); tourEls.x.title = t("tourClose");
      tourEls.title.textContent = tx(step.title);
      tourEls.text.innerHTML = tx(step.text);
      tourEls.back.textContent = "← " + t("tourBack");
      tourEls.back.disabled = tour.i === 0;
      tourEls.pause.textContent = tour.paused ? "▶ " + t("tourPlay") : "❚❚ " + t("tourPause");
      tourEls.pause.setAttribute("aria-pressed", String(tour.paused));
      tourEls.next.textContent = last ? t("tourDone") + " ✓" : t("tourNext") + " →";
    }

    // Where the guide points: near the top-left of the element, once scrolled to `sy`
    function guidePoint(target, sy, fixed) {
      var vx, vy;
      if (!target) { vx = innerWidth * 0.45; vy = innerHeight * 0.3; }
      else {
        var r = target.getBoundingClientRect();
        vx = r.left + Math.min(r.width * 0.3, 140);
        vy = fixed ? r.top - 70 : r.top + global.scrollY - sy + Math.min(r.height * 0.35, 70);
      }
      return { x: vx + global.scrollX - originX(), y: vy + sy };
    }

    function goStep(i) {
      var step = tourSteps[i], now = performance.now(), p = ensureGuide();
      tour.i = i; tour.arrived = false; tour.elapsed = 0; tour.dur = readMs(step);
      tour.typing = null; tour.waveAnim = null; tour.last = now;
      store("localStorage", TOUR_KEY, i);
      upsertPeer({ id: "guide", chat: "" });
      var target = null;
      try { target = step.target ? document.querySelector(step.target) : null; } catch (e) {}
      tour.target = target;
      var fixed = !!target && isFixed(target), sy = global.scrollY;
      if (target && !fixed) {                        // bring it into the upper part of the screen
        var r = target.getBoundingClientRect(), top = r.top + global.scrollY;
        var want = r.height > innerHeight * 0.55 ? top - 90 : top - Math.max(90, (innerHeight - r.height) * 0.3);
        sy = Math.max(0, Math.min(want, document.documentElement.scrollHeight - innerHeight));
        global.scrollTo({ top: sy, behavior: reducedMotion ? "instant" : "smooth" });
      }
      var to = guidePoint(target, sy, fixed);
      var dx = to.x - p.x, dy = to.y - p.y, dist = Math.sqrt(dx * dx + dy * dy) || 1;
      if (reducedMotion || dist < 4) {
        p.x = p.cx = to.x; p.y = p.cy = to.y; tour.seg = null;
        tourArrive(now);
      } else {
        var nx = -dy / dist, ny = dx / dist, k1 = rand(-0.2, 0.2) * dist, k2 = rand(-0.15, 0.15) * dist;
        tour.seg = { t0: now, dur: Math.max(600, Math.min(1500, 400 + dist * 0.7)),
          x0: p.x, y0: p.y, x3: to.x, y3: to.y,
          x1: p.x + dx * 0.3 + nx * k1, y1: p.y + dy * 0.3 + ny * k1,
          x2: p.x + dx * 0.7 + nx * k2, y2: p.y + dy * 0.7 + ny * k2 };
      }
      renderCard();
      kick();
    }

    function tourArrive(now) {
      var step = tourSteps[tour.i], p = peers.guide;
      tour.arrived = true;
      tour.typing = { text: tx(step.say), i: 0, nextAt: now + 150 };
      if (step.wave && waveEmoji) {
        if (reducedMotion) spawnReaction(p, waveEmoji);
        else tour.waveAnim = { t0: now, x: p.x };
      }
    }

    function updateTour(now) {
      var p = peers.guide;
      if (!p) return;
      var dt = Math.max(0, Math.min(100, now - tour.last));
      tour.last = now;
      if (tour.seg) {                                // flying (cubic Bézier curve)
        var s = tour.seg, tt = Math.min(1, (now - s.t0) / s.dur), e = ease(tt), u = 1 - e;
        p.x = u*u*u*s.x0 + 3*u*u*e*s.x1 + 3*u*e*e*s.x2 + e*e*e*s.x3;
        p.y = u*u*u*s.y0 + 3*u*u*e*s.y1 + 3*u*e*e*s.y2 + e*e*e*s.y3;
        setActive(p, now);
        if (tt >= 1) { tour.seg = null; tourArrive(now); }
      } else if (tour.waveAnim) {                    // waving: quick side-to-side shake
        var wt = now - tour.waveAnim.t0;
        p.x = tour.waveAnim.x + Math.sin(wt / 55) * 16;
        setActive(p, now);
        if (wt > 700) { p.x = tour.waveAnim.x; tour.waveAnim = null; spawnReaction(p, waveEmoji); }
      }
      var c = tour.typing;                           // types its line letter by letter
      if (c && now >= c.nextAt) {
        c.i++; c.nextAt = now + rand(30, 70);
        upsertPeer({ id: "guide", chat: c.text.slice(0, c.i) });
        if (c.i >= c.text.length) tour.typing = null;
      }
      if (tour.arrived && !tour.paused && !document.hidden) tour.elapsed += dt;
      tourEls.bar.style.width = Math.min(100, tour.elapsed / tour.dur * 100) + "%";
      var tg = tour.target;                          // spotlight on the element
      if (tg && tg.isConnected) {
        var r = tg.getBoundingClientRect(), pad = 8;
        spot.style.left = (r.left - pad) + "px"; spot.style.top = (r.top - pad) + "px";
        spot.style.width = (r.width + pad * 2) + "px"; spot.style.height = (r.height + pad * 2) + "px";
        spot.classList.add("mc-on");
      } else spot.classList.remove("mc-on");
      if (tour.elapsed >= tour.dur) tourNext();
    }

    function tourNext() {
      if (!tour) return;
      if (tour.i < tourSteps.length - 1) goStep(tour.i + 1);
      else stopTour(true);
    }
    function tourBack() { if (tour && tour.i > 0) goStep(tour.i - 1); }

    function startTour(i) {
      if (!tourSteps || destroyed) return;
      if (ghost) setGhost(false);
      closePop(); closePicker(); dismissCoach(); unfollow(); hideTip();
      if (local.classList.contains("mc-open")) closeChat(false);
      if (i == null) { var saved = store("localStorage", TOUR_KEY); i = typeof saved === "number" ? saved : 0; }
      i = Math.max(0, Math.min(tourSteps.length - 1, i | 0));
      if (!tour) { tour = { i: 0, paused: false }; buildTourUI(); }
      tour.paused = false;
      goStep(i);
    }

    // done=true: finished (forgets the progress and the guide waves goodbye)
    function stopTour(done) {
      if (!tour) return;
      tour = null;
      if (done) store("localStorage", TOUR_KEY, null);
      if (spot) { spot.remove(); spot = null; }
      if (card) { card.remove(); card = null; }
      var p = peers.guide;
      if (!p) return;
      upsertPeer({ id: "guide", chat: "" });
      if (done && waveEmoji) spawnReaction(p, waveEmoji);
      setTimeout(function () { if (peers.guide === p && !tour) removePeer("guide"); }, done ? 900 : 0);
    }

    // ---- animation ----
    function kick() { if (!raf && !ghost && !destroyed) raf = requestAnimationFrame(tick); }
    function tick(now) {
      raf = 0;
      if (ghost) return;
      if (bots.length) updateBots(now || performance.now());
      if (tour) updateTour(now || performance.now());
      var ox = originX(), moving = bots.length > 0 || following !== null || !!tour;
      // clientWidth (not scrollWidth): a far-away cursor never causes horizontal scroll
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
      if (following !== null && peers[following]) {   // the view follows the chosen cursor
        var f = peers[following];
        var target = Math.max(0, f.cy - innerHeight * 0.4);
        var d = target - global.scrollY;
        if (Math.abs(d) > 1) global.scrollTo({ left: global.scrollX, top: global.scrollY + d * 0.12, behavior: "instant" });
      }
      if (moving) kick();
    }

    // ---- presence (the pill) ----
    function renderPresence() {
      if (!presence) { emitStats(); return; }
      presence.classList.toggle("mc-ghost", ghost);
      if (ghost) { emitStats(); return; }
      var arr = peopleList(), others = arr.slice(1);

      // "People" button: other people's faces + how many of you there are
      var key = lang + "|" + arr.length + "|" + following + "|" + others.slice(0, 3).map(function (u) {
        return u.id + u.name + u.color + (u.avatar ? u.avatar.length : "");
      }).join("|");
      if (peopleBtn._key !== key) {                // don't rebuild without changes (no lost clicks)
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
          el("span", "", peopleBtn).textContent = t("nHere", { n: arr.length });
          setTip(peopleBtn, t("seeWho"), t("nHereLabel", { n: arr.length }));
        } else {
          peopleBtn.innerHTML = ICON_PEOPLE;
          el("span", "", peopleBtn).textContent = t("onlyYou");
          setTip(peopleBtn, t("nobodyYet"), t("onlyYouLabel"));
        }
      }

      // "Your profile" button: just your face
      var mk = lang + me.name + me.color + (me.avatar ? me.avatar.length : "");
      if (meBtn._key !== mk) {
        meBtn._key = mk;
        meBtn.innerHTML = "";
        face("", me, meBtn);
        setTip(meBtn, t("profileOf", { name: me.name }), t("profileLabel", { name: me.name }));
      }
      setExpanded();
      emitStats();
      if (openPop && openPop.update) openPop.update();
    }

    // ---- local chat ----
    function isTyping(node) {
      return node && (node.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName));
    }
    function placeLocal() {
      var x, y;
      if (chatDocked) {
        // Touch: no pointer to stick to, so dock it bottom-left, above the
        // on-screen keyboard (visualViewport) or above the pill when it's closed.
        var vv = global.visualViewport, bottom = vv ? vv.offsetTop + vv.height : innerHeight;
        var keyboard = vv && vv.height < innerHeight * 0.8;
        var lift = !keyboard && presence ? innerHeight - presence.getBoundingClientRect().top + 8 : 12;
        x = (vv ? vv.offsetLeft : 0) + 12;
        y = bottom - lift - (localTag.offsetHeight || 40) - 8;   // grows upwards
      } else {
        x = last.cx - 2; y = last.cy - 2;
        if (local.classList.contains("mc-open")) {
          x = Math.max(0, Math.min(x, innerWidth - 250)); y = Math.max(0, Math.min(y, innerHeight - 140));
        }
      }
      local.classList.toggle("mc-docked", chatDocked);
      local.style.transform = "translate3d(" + x + "px," + y + "px,0)";
    }
    function onViewport() { if (local.classList.contains("mc-open")) placeLocal(); }
    function localVisible() { return local.classList.contains("mc-open") || local.classList.contains("mc-show"); }
    function openChat() {
      chatDocked = lastInput === "touch";
      if (coach) dismissCoach();                   // you found the chat: no need for the hint
      if (!last.has) { last.cx = innerWidth / 2; last.cy = innerHeight / 2; last.has = chatDocked; }
      if (chatDocked) sendPosition();             // so others see your message somewhere
      clearTimeout(chatTimer);
      closePicker();
      placeLocal();
      local.classList.add("mc-open");
      input.value = "";
      fitInput();
      input.focus();
    }
    // The box is as wide as what you type (or the placeholder), up to CHAT_MAX_W.
    // Text that would go beyond that is cut off: you can't type more than fits.
    function textWidth(s) { measure.textContent = s; return measure.offsetWidth; }
    // Wider first (up to CHAT_MAX_W), then taller (up to CHAT_MAX_LINES lines).
    function fitInput() {
      var v = input.value.replace(/[\r\n]+/g, " ");           // one paragraph: Enter sends
      if (v !== input.value) input.value = v;
      var w = Math.max(textWidth(v), v ? 0 : textWidth(input.placeholder));
      input.style.width = Math.min(CHAT_MAX_W, w + 2) + "px";
      var maxH = CHAT_LINE_H * CHAT_MAX_LINES;
      input.style.height = CHAT_LINE_H + "px";
      if (input.scrollHeight > maxH + 2) {                      // too long: cut what doesn't fit
        while (v && input.scrollHeight > maxH + 2) { v = v.slice(0, -1); input.value = v; }
      }
      input.style.height = Math.min(maxH, input.scrollHeight) + "px";
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

    // ---- events ----
    // Touch screens have no hover pointer: the finger plays the cursor. Touching
    // the page puts your cursor there, and it travels with the content as you
    // scroll, so others see where you are reading. Touches on Roomful's own UI
    // (the pill, panels…) don't move it.
    function isTouchUI() { return lastInput === "touch" || (!!global.matchMedia && matchMedia("(hover: none)").matches); }
    function onTouchStart(e) {
      var p = e.touches && e.touches[0];
      if (!p) return;
      lastInput = "touch"; lastTouchAt = performance.now();
      touchStart = { x: p.clientX, y: p.clientY };
      showSelf();
      if (e.target && e.target.closest && e.target.closest(UI)) return;
      last.cx = p.clientX; last.cy = p.clientY; last.has = true;
      sendPosition();
    }
    function onTouchMove(e) {
      var p = e.touches && e.touches[0];
      if (!p) return;
      lastTouchAt = performance.now();
      // A real swipe (not a tap) means you're taking back control of scrolling.
      if (following !== null && touchStart && Math.abs(p.clientX - touchStart.x) + Math.abs(p.clientY - touchStart.y) > 12) unfollow();
      if (e.target && e.target.closest && e.target.closest(UI)) return;
      last.cx = p.clientX; last.cy = p.clientY; last.has = true;
      sendPosition();
    }
    function onMove(e) {
      if (performance.now() - lastTouchAt > 800) lastInput = "mouse";   // not the mouse event a tap emulates
      last.cx = e.clientX; last.cy = e.clientY; last.has = true;
      pointerIn = true; showSelf();
      if (picker) {
        var d = pickerDistance(e.clientX, e.clientY);
        if (d > pickerReach + 90) closePicker(); else if (d < pickerReach) pickerReach = d;
      }
      if (localVisible()) placeLocal();
      detectWave(e.clientX);
      sendPosition();
    }

    // Shaking the cursor quickly from side to side = waving at the room.
    // 4 changes of direction (each stroke ≥ 40 px) in under 0.9 s.
    function detectWave(x) {
      if (!waveEmoji || ghost) return;
      var now = performance.now();
      if (wave.x === null) { wave.x = x; return; }
      var dx = x - wave.x;
      wave.x = x;
      if (Math.abs(dx) < 2) return;
      var dir = dx > 0 ? 1 : -1;
      if (dir === wave.dir) { wave.run += Math.abs(dx); return; }
      if (wave.run >= 40) wave.flips.push(now);
      wave.dir = dir; wave.run = Math.abs(dx);
      wave.flips = wave.flips.filter(function (t) { return now - t < 900; });
      if (wave.flips.length >= 4 && now - wave.at > 2500) {
        wave.at = now; wave.flips = [];
        react(waveEmoji);
      }
    }
    function onScroll() { if (picker) closePicker(); sendPosition(); }   // scrolling on without picking closes the emojis
    function onLeave(e) {
      if (e.relatedTarget) return;
      pointerIn = false; wave.x = null; showSelf();
      send({ visible: false });
    }
    function onVisibility() { send({ visible: !document.hidden && last.has }); }
    function onDown(e) {
      var target = e.target;
      if (openPop && !openPop.el.contains(target) && !(presence && presence.contains(target)) && !followBox.contains(target)) closePop();
      if (picker && !picker.contains(target) && !(keysBtn && keysBtn.contains(target))) closePicker();
      if (e.button !== 0 || ghost || (target.closest && target.closest(UI))) return;
      var now = performance.now();
      if (now - lastClick < 120) return;
      lastClick = now;
      var pt = toShared(e.clientX, e.clientY);
      send({ t: "event", kind: "click", x: pt.x, y: pt.y });
    }
    function onKey(e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (tour && !isTyping(e.target)) {
        if (e.key === "ArrowRight") { e.preventDefault(); tourNext(); return; }
        if (e.key === "ArrowLeft") { e.preventDefault(); tourBack(); return; }
        if (e.key === "Escape" && !openPop && !picker) { stopTour(false); return; }
      }
      if (e.key === "Escape") { closePicker(); closePop(); unfollow(); return; }
      if (picker && /^[1-9]$/.test(e.key) && reactions[+e.key - 1]) {
        e.preventDefault(); var emo = reactions[+e.key - 1]; closePicker(); react(emo); return;
      }
      if (ghost || isTyping(e.target)) return;
      if (e.key === "?" && keysBtn) {
        e.preventDefault(); togglePop("keys");
        if (openPop && openPop.kind === "keys") { var k = openPop.el.querySelector("button"); if (k) k.focus(); }
      }
      else if (e.key === "/" && opts.chat !== false) { e.preventDefault(); openChat(); }
      else if ((e.key === "e" || e.key === "E") && reactions) {
        e.preventDefault();
        if (picker) closePicker();
        else openPicker(last.has ? last.cx : innerWidth / 2, last.has ? last.cy : innerHeight / 2, false);
      } else if (following !== null && /^(Arrow(Up|Down)|Page(Up|Down)|Home|End| )$/.test(e.key)) {
        unfollow();                                  // the user takes back control of scrolling
      }
    }
    function onUserScrollIntent() { unfollow(); }
    function onInputKey(e) {
      if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); closeChat(true); }
      else if (e.key === "Escape") { e.preventDefault(); closeChat(false); }
    }
    function onInput() { fitInput(); if (chatDocked) placeLocal(); send({ chat: input.value }); }
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
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    if (global.visualViewport) {
      visualViewport.addEventListener("resize", onViewport);
      visualViewport.addEventListener("scroll", onViewport);
    }
    global.addEventListener("scroll", onScroll, { passive: true });
    global.addEventListener("resize", onResize);
    input.addEventListener("keydown", onInputKey);
    input.addEventListener("input", onInput);
    input.addEventListener("blur", onInputBlur);

    applyStaticTexts();
    layer.classList.toggle("mc-off", ghost);
    if (botCount) createBots(botCount);
    renderPresence();
    houseTimer = setInterval(housekeeping, 1000);
    coachTimer = setTimeout(showCoach, 1500);
    connect();

    // Opens a part of the pill from your own UI
    function open(what) {
      if (what === "chat") { if (ghost) setGhost(false); closePop(); openChat(); }
      else if (what === "reactions") {
        if (ghost) setGhost(false);
        var r = presence ? presence.getBoundingClientRect() : null;
        if (r) openPicker(r.right, r.top - 8, true); else openPicker(innerWidth / 2, innerHeight / 2, false);
      } else if (what === "people" || what === "profile" || what === "keys") {
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
      get lang() { return lang; },
      // Manual room change: from now on it stops following the page path automatically
      setRoom: function (r) { autoRoom = false; setRoom(r); },
      setGhost: setGhost,
      setIdentity: setIdentity,
      setLang: setLang,
      open: open,
      close: function () { closePop(); closePicker(); },
      react: react,
      follow: follow,
      unfollow: unfollow,
      startTour: startTour,
      get uid() { return uid; },
      // Tiny hooks for add-ons such as the shared board: tell the room that
      // something changed, and hear when somebody else says so.
      on: function (kind, fn) {
        var l = listeners[kind];
        if (!l || typeof fn !== "function") return function () {};
        l.push(fn);
        return function () { var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); };
      },
      signal: function (kind) {
        if (!listeners[kind]) return;
        var pt = myPoint();
        send({ t: "event", kind: kind, x: pt.x, y: pt.y });
      },
      stopTour: function () { stopTour(false); },
      get tour() {
        var saved = store("localStorage", TOUR_KEY);
        return { active: !!tour, step: tour ? tour.i : -1, total: tourSteps ? tourSteps.length : 0,
          saved: typeof saved === "number" ? saved : null };
      },
      destroy: function () {
        stopTour(false);
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
        document.removeEventListener("touchstart", onTouchStart);
        document.removeEventListener("touchmove", onTouchMove);
        if (global.visualViewport) {
          visualViewport.removeEventListener("resize", onViewport);
          visualViewport.removeEventListener("scroll", onViewport);
        }
        global.removeEventListener("scroll", onScroll);
        global.removeEventListener("resize", onResize);
        closePicker(); closePop(); clearTimeout(coachTimer);
        document.documentElement.classList.remove("mc-own");
        [style, ownStyle, layer, local, presence, followBox, tooltip, coach].forEach(function (n) { if (n) n.remove(); });
      }
    };
  }

  global.Roomful = { init: init, languages: Object.keys(I18N) };
  global.MultiCursor = global.Roomful;   // former name, kept so existing integrations keep working
})(window);
