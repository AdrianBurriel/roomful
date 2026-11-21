/*!
 * roomful·js Board — a shared board where everyone in the room can draw and write.
 *
 *   <script src="/roomful.js"></script>
 *   <script src="/roomful-board.js"></script>
 *   <script>
 *     const mc = Roomful.init({ … });
 *     const board = RoomfulBoard.mount(document.querySelector("#board"), { mc });
 *   </script>
 *
 * Options: mc (the Roomful instance: your id, color, language and the "someone
 * drew" signal), api ("/api/board"), lang ("en" | "es"; defaults to mc.lang),
 * strings ({ en: {…}, es: {…} } overrides).
 * Returns { setLang(l), refresh(), destroy() }.
 *
 * Everyone draws in their profile color (there's no color picker) and has a
 * amount of ink that refills every 3 hours (a live countdown shows when), spent as you draw (thick pen: double) or write (per
 * letter). Hovering a drawing shows who made it. Drawings stay on the board; when it's full, the oldest
 * ones are erased first, so there's always something there. The server
 * (api/board.js on Vercel or server.py) checks the ink and keeps the board.
 */
(function (global) {
  "use strict";

  var W = 1600, H = 1000;                 // board coordinates (must match the server)
  var WIDTHS = [3, 9], TEXT_SIZE = 40, TEXT_COST = 40, MAX_POINTS = 600, MAX_TEXT = 60;

  var I18N = {
    en: {
      label: "Shared board", pen: "Pen", thick: "Marker", text: "Text",
      penTip: "Thin pen", thickTip: "Thick marker (uses double ink)", textTip: "Write text: click on the board",
      by: "✏️ {name}", someone: "✏️ Someone",
      ink: "Ink", inkLeft: "{p}% of your ink left", refill: "Refills in {t}", refillSoon: "Refills in a moment",
      refillTip: "Your ink refills completely every 3 hours",
      noInk: "You're out of ink for now. It refills in {t}.",
      outTitle: "You've used up your ink", outText: "You can draw again at {at}.", outOk: "OK",
      notEnough: "Not enough ink for that. You have {p}% left.",
      full: "Board {p}% full · the oldest drawings fade and get erased first",
      textPlaceholder: "Write and press Enter", textCost: "{c} ink",
      empty: "Nobody has drawn anything yet. Be the first!",
      offline: "The board isn't available right now.", saving: "Saving…", error: "Couldn't save it. Try again."
    },
    es: {
      label: "Pizarra compartida", pen: "Lápiz", thick: "Rotulador", text: "Texto",
      penTip: "Lápiz fino", thickTip: "Rotulador grueso (gasta el doble de tinta)", textTip: "Escribir texto: pulsa sobre la pizarra",
      by: "✏️ {name}", someone: "✏️ Alguien",
      ink: "Tinta", inkLeft: "Te queda un {p}% de tu tinta", refill: "Se recarga en {t}", refillSoon: "Se recarga enseguida",
      refillTip: "Tu tinta se recarga entera cada 3 horas",
      noInk: "Se te ha acabado la tinta por ahora. Se recarga en {t}.",
      outTitle: "Has gastado toda tu tinta", outText: "Podrás volver a dibujar a las {at}.", outOk: "Vale",
      notEnough: "No te llega la tinta para eso. Te queda un {p}%.",
      full: "Pizarra llena al {p}% · lo más antiguo se atenúa y se borra primero",
      textPlaceholder: "Escribe y pulsa Enter", textCost: "{c} de tinta",
      empty: "Aún no ha dibujado nadie. ¡Sé el primero!",
      offline: "La pizarra no está disponible ahora mismo.", saving: "Guardando…", error: "No se ha podido guardar. Inténtalo otra vez."
    }
  };

  var FONT = "Inter,system-ui,-apple-system,'Segoe UI',sans-serif";
  var CSS = [
    ".rb{position:relative;font:500 13px/1.3 " + FONT + ";color:inherit}",
    ".rb-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}",
    ".rb-tool{all:unset;box-sizing:border-box;cursor:pointer;height:36px;padding:0 12px;border-radius:10px;display:inline-flex;",
    "  align-items:center;gap:7px;font-weight:600;border:1px solid var(--rb-line);transition:background .15s}",
    ".rb-tool:hover{background:var(--rb-hover)}",
    ".rb-tool[aria-pressed=true]{background:var(--rb-ink);color:var(--rb-bg);border-color:var(--rb-ink)}",
    ".rb-tool:focus-visible{outline:2px solid #0D99FF;outline-offset:2px}",
    ".rb-ink{display:flex;align-items:center;gap:8px;margin-left:auto;min-width:200px}",
    ".rb-meter{flex:1;height:8px;border-radius:8px;background:var(--rb-hover);overflow:hidden;min-width:90px}",
    ".rb-meter i{display:block;height:100%;border-radius:8px;transition:width .3s,background .3s}",
    ".rb-ink small{font-size:12px;opacity:.7;white-space:nowrap}",
    ".rb-ink .rb-reset{font-variant-numeric:tabular-nums;padding-left:8px;border-left:1px solid var(--rb-line)}",
    ".rb-stage{position:relative;aspect-ratio:16/10;border-radius:14px;overflow:hidden;border:1px solid var(--rb-line);",
    "  background:var(--rb-paper);background-image:radial-gradient(var(--rb-dotc) 1px,transparent 1.2px);background-size:24px 24px}",
    ".rb-stage canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair}",
    ".rb-stage.rb-texting canvas{cursor:text}",
    ".rb-empty{position:absolute;inset:0;display:grid;place-items:center;text-align:center;padding:24px;opacity:.55;pointer-events:none;font-size:15px}",
    ".rb-empty[hidden]{display:none}",
    /* who drew it: a name tag like the ones on the cursors */
    ".rb-who{position:absolute;left:0;top:0;z-index:3;pointer-events:none;font:500 12px/1.2 " + FONT + ";padding:4px 8px;",
    "  border-radius:12px 12px 12px 3px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.18);max-width:220px;",
    "  overflow:hidden;text-overflow:ellipsis}",
    ".rb-who[hidden]{display:none}",
    /* out of ink: a card over the board with a live countdown */
    ".rb-out{position:absolute;inset:0;z-index:4;display:grid;place-items:center;padding:16px;background:rgba(0,0,0,.35);",
    "  animation:rb-in .2s ease-out}",
    ".rb-out[hidden]{display:none}",
    ".rb-out>div{background:var(--rb-bg);color:var(--rb-ink);border-radius:16px;padding:20px 22px;max-width:360px;text-align:center;",
    "  box-shadow:0 12px 36px rgba(0,0,0,.3);border:1px solid var(--rb-line)}",
    ".rb-out b{display:block;font-size:17px;margin-bottom:6px}",
    ".rb-out p{margin:0 0 14px;font-weight:400;opacity:.8;line-height:1.45}",
    ".rb-out .rb-big{display:block;font:700 30px/1 " + FONT + ";font-variant-numeric:tabular-nums;margin:4px 0 12px;letter-spacing:-.02em}",
    ".rb-out button{all:unset;cursor:pointer;padding:8px 16px;border-radius:999px;font-weight:600;background:var(--rb-ink);color:var(--rb-bg)}",
    ".rb-out button:focus-visible{outline:2px solid #0D99FF;outline-offset:2px}",
    "@keyframes rb-in{from{opacity:0}}",
    ".rb-input{position:absolute;transform:translateY(-50%);min-width:160px;max-width:70%;font:600 16px/1.2 " + FONT + ";",
    "  padding:6px 9px;border-radius:8px;border:2px solid;background:var(--rb-bg);outline:none;z-index:2}",
    ".rb-foot{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:10px;font-size:12px;opacity:.7}",
    ".rb-msg{min-height:1.3em;font-weight:600}",
    ".rb-msg.rb-bad{color:#E5484D;opacity:1}",
    ".rb{--rb-bg:#fff;--rb-ink:#1E1E1E;--rb-line:rgba(0,0,0,.14);--rb-hover:rgba(0,0,0,.06);--rb-paper:#FBFAF7;--rb-dotc:rgba(0,0,0,.09)}",
    "@media (prefers-color-scheme:dark){.rb{--rb-bg:#1f1f1f;--rb-ink:#EEE;--rb-line:rgba(255,255,255,.16);",
    "  --rb-hover:rgba(255,255,255,.08);--rb-paper:#181818;--rb-dotc:rgba(255,255,255,.08)}}"
  ].join("\n");

  function el(tag, cls, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }

  // Ink cost: exactly the server's formula
  function strokeCost(p, w) {
    var len = 0;
    for (var i = 2; i < p.length; i += 2) len += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
    return Math.max(20, Math.round(len * (w === WIDTHS[1] ? 2 : 1)));
  }
  function textCost(t) { return Array.from(t).length * TEXT_COST; }

  function mount(root, opts) {
    opts = opts || {};
    var mc = opts.mc, api = opts.api || "/api/board";
    var lang = opts.lang || (mc && mc.lang) || "en";
    var uid = mc && mc.uid;
    if (!uid) {
      try { uid = JSON.parse(localStorage.getItem("mc:uid")); } catch (e) {}
      if (!/^[a-z0-9]{8,32}$/.test(uid || "")) uid = Math.random().toString(36).slice(2, 14) + "aaaaaaaa";
    }
    function t(key, vars) {
      var custom = opts.strings && opts.strings[lang] && opts.strings[lang][key];
      var s = custom || (I18N[lang] || I18N.en)[key] || I18N.en[key] || key;
      if (vars) for (var k in vars) s = s.split("{" + k + "}").join(vars[k]);
      return s;
    }
    function myColor() { return (mc && mc.me && mc.me.color) || "#0D99FF"; }
    function myName() { return ((mc && mc.me && mc.me.name) || "").slice(0, 32); }
    function textOn(hex) {
      var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
      return (0.299 * r + 0.587 * g + 0.114 * b) > 170 ? "#1E1E1E" : "#FFFFFF";
    }

    if (!document.getElementById("rb-style")) {
      var st = el("style"); st.id = "rb-style"; st.textContent = CSS; document.head.appendChild(st);
    }
    var box = el("div", "rb", root);
    var bar = el("div", "rb-bar", box);
    function tool(id, icon) {
      var b = el("button", "rb-tool", bar);
      b.type = "button"; b.dataset.tool = id;
      b.innerHTML = icon + "<span></span>";
      b.addEventListener("click", function () { setTool(id); });
      return b;
    }
    var bPen = tool("pen", svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'));
    var bThick = tool("thick", svg('<path d="M9 11l-6 6v3h3l6-6"/><path d="M22 4l-8 8-4-4 8-8z" transform="translate(0 2)"/>'));
    var bText = tool("text", svg('<path d="M4 7V5h16v2"/><path d="M12 5v14"/><path d="M9 19h6"/>'));
    var inkBox = el("div", "rb-ink", bar);
    var inkLabel = el("small", "", inkBox);
    var meter = el("div", "rb-meter", inkBox);
    var meterFill = el("i", "", meter);
    var inkPct = el("small", "", inkBox);
    var resetTxt = el("small", "rb-reset", inkBox);   // live countdown to the next refill

    var stage = el("div", "rb-stage", box);
    var canvas = el("canvas", "", stage);
    canvas.setAttribute("role", "img");
    var ctx = canvas.getContext("2d");
    var emptyMsg = el("div", "rb-empty", stage);
    var who = el("div", "rb-who", stage);
    var out = el("div", "rb-out", stage);
    out.hidden = true;
    out.setAttribute("role", "alertdialog");
    var outCard = el("div", "", out);
    var outTitle = el("b", "", outCard), outBig = el("span", "rb-big", outCard), outText = el("p", "", outCard);
    var outOk = el("button", "", outCard);
    outOk.type = "button";
    outOk.addEventListener("click", function () { hideOut(); });
    out.addEventListener("pointerdown", function (e) { if (e.target === out) hideOut(); });
    var outTimer = null;
    who.hidden = true;
    var foot = el("div", "rb-foot", box);
    var msg = el("span", "rb-msg", foot);
    msg.setAttribute("aria-live", "polite");
    var fullTxt = el("span", "", foot);

    var state = { rev: null, items: [], total: 0, cap: 60000, ink: null, offline: false };
    var mode = "pen", drawing = null, pending = [], input = null, msgTimer = null, destroyed = false;
    var pollTimer = null, visible = true, inkPreview = 0;

    function svg(paths) {
      return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"' +
        ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + "</svg>";
    }

    function applyTexts() {
      canvas.setAttribute("aria-label", t("label"));
      [[bPen, "pen", "penTip"], [bThick, "thick", "thickTip"], [bText, "text", "textTip"]].forEach(function (x) {
        x[0].querySelector("span").textContent = t(x[1]); x[0].title = t(x[2]);
      });
      inkLabel.textContent = t("ink");
      resetTxt.title = t("refillTip");
      emptyMsg.textContent = t(state.offline ? "offline" : "empty");
      if (input) input.placeholder = t("textPlaceholder");
      paintInk(); paintFull();
    }

    function setTool(id) {
      mode = id;
      [bPen, bThick, bText].forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.tool === id)); });
      stage.classList.toggle("rb-texting", id === "text");
      if (id !== "text") closeInput();
    }

    // "You've used up your ink · 1:10:04 · you can draw again at 16:00"
    function hms() {
      var s = state.ink ? Math.max(0, Math.ceil((state.ink.resetAt - Date.now()) / 1000)) : 0;
      return Math.floor(s / 3600) + ":" + ("0" + Math.floor(s % 3600 / 60)).slice(-2) + ":" + ("0" + s % 60).slice(-2);
    }
    function showOut() {
      if (!state.ink) return;
      hideWho(); closeInput(); drawing = null; inkPreview = 0; render();
      var at = new Date(state.ink.resetAt);
      var atTxt; try { atTxt = at.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" }); } catch (e) { atTxt = at.getHours() + ":" + ("0" + at.getMinutes()).slice(-2); }
      outTitle.textContent = "🖋️ " + t("outTitle");
      outBig.textContent = hms();
      outText.textContent = t("outText", { at: atTxt });
      outOk.textContent = t("outOk");
      out.setAttribute("aria-label", t("outTitle"));
      out.hidden = false;
      say("");
      clearTimeout(outTimer);
      outTimer = setTimeout(hideOut, 8000);
      outOk.focus({ preventScroll: true });
    }
    function hideOut() { clearTimeout(outTimer); out.hidden = true; }
    function outOfInk() { return !state.ink || state.ink.left < 20; }

    function say(text, bad) {
      clearTimeout(msgTimer);
      msg.textContent = text || "";
      msg.classList.toggle("rb-bad", !!bad);
      if (text) msgTimer = setTimeout(function () { msg.textContent = ""; }, bad ? 6000 : 2500);
    }

    // "Refills in 2:14:05", ticking every second
    function paintClock() {
      if (!state.ink) { resetTxt.textContent = ""; return; }
      var s = Math.max(0, Math.ceil((state.ink.resetAt - Date.now()) / 1000));
      var hms = Math.floor(s / 3600) + ":" + ("0" + Math.floor(s % 3600 / 60)).slice(-2) + ":" + ("0" + s % 60).slice(-2);
      resetTxt.textContent = "↻ " + t("refill", { t: hms });
    }
    function untilReset() {
      if (!state.ink) return "";
      var ms = state.ink.resetAt - Date.now();
      if (ms < 60000) return t("refillSoon");
      var h = Math.floor(ms / 3600000), m = Math.ceil((ms % 3600000) / 60000);
      if (m === 60) { h++; m = 0; }
      return h ? h + " h" + (m ? " " + m + " min" : "") : m + " min";
    }
    function leftNow() { return state.ink ? Math.max(0, state.ink.left - inkPreview) : 0; }
    function paintInk() {
      if (!state.ink) { inkPct.textContent = ""; resetTxt.textContent = ""; meterFill.style.width = "0"; return; }
      var p = Math.round(leftNow() / state.ink.max * 100);
      meterFill.style.width = p + "%";
      meterFill.style.background = p > 25 ? myColor() : "#E5484D";
      inkPct.textContent = p + "%";
      meter.title = t("inkLeft", { p: p }) + " · " + t("refill", { t: untilReset() });
      paintClock();
    }
    function paintFull() {
      var p = Math.min(100, Math.round(state.total / state.cap * 100));
      fullTxt.textContent = state.items.length ? t("full", { p: p }) : "";
    }

    // ---- drawing ----
    var dpr = 1;
    function resize() {
      var r = stage.getBoundingClientRect();
      dpr = Math.min(2, global.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      render();
    }
    function scale() { return canvas.width / W; }

    function drawStroke(it, alpha) {
      var p = it.p, s = scale();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = it.c;
      ctx.lineWidth = it.w * s;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(p[0] * s, p[1] * s);
      if (p.length === 4) ctx.lineTo(p[2] * s, p[3] * s);
      for (var i = 2; i < p.length - 2; i += 2) {      // smooth: curves through the midpoints
        var mx = (p[i] + p[i + 2]) / 2, my = (p[i + 1] + p[i + 3]) / 2;
        ctx.quadraticCurveTo(p[i] * s, p[i + 1] * s, mx * s, my * s);
      }
      if (p.length > 4) ctx.lineTo(p[p.length - 2] * s, p[p.length - 1] * s);
      if (p.length === 2 || (p.length === 4 && p[0] === p[2] && p[1] === p[3])) {   // a dot
        ctx.lineTo(p[0] * s + 0.01, p[1] * s);
      }
      ctx.stroke();
    }
    function drawText(it, alpha) {
      var s = scale();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = it.c;
      ctx.font = "600 " + (TEXT_SIZE * s) + "px " + FONT;
      ctx.textBaseline = "middle";
      ctx.fillText(it.t, it.x * s, it.y * s);
    }

    // The oldest drawings (the next to be erased) fade when the board is getting full
    function alphas(list) {
      var out = [], over = state.total - state.cap * 0.75, acc = 0;
      for (var i = 0; i < list.length; i++) {
        acc += list[i]._cost || 0;
        out.push(over > 0 && acc <= over + state.cap * 0.1 && i < list.length - 1 ? 0.4 : 1);
      }
      return out;
    }

    function render() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var list = state.items.concat(pending), a = alphas(state.items);
      list.forEach(function (it, i) {
        var al = i < a.length ? a[i] : 0.85;
        if (it.k === "s") drawStroke(it, al); else if (it.k === "t") drawText(it, al);
      });
      if (drawing) drawStroke(drawing, 1);
      ctx.globalAlpha = 1;
      emptyMsg.hidden = !!list.length || !!drawing;
    }

    function toBoard(e) {
      var r = canvas.getBoundingClientRect();
      return [Math.round(Math.max(0, Math.min(W, (e.clientX - r.left) / r.width * W))),
              Math.round(Math.max(0, Math.min(H, (e.clientY - r.top) / r.height * H)))];
    }

    function onDown(e) {
      if (destroyed || state.offline || (e.button !== undefined && e.button !== 0)) return;
      if (mode === "text") { e.preventDefault(); openInput(toBoard(e)); return; }
      if (!state.ink) return;
      if (state.ink.left < 20) { showOut(); return; }
      e.preventDefault();
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
      var pt = toBoard(e);
      drawing = { k: "s", c: myColor(), n: myName(), w: mode === "thick" ? WIDTHS[1] : WIDTHS[0], p: [pt[0], pt[1]] };
      hideWho();
      inkPreview = 20;
      paintInk(); render();
    }
    function onMove(e) {
      if (!drawing) return;
      var pts = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      if (!pts.length) pts = [e];
      for (var i = 0; i < pts.length; i++) {
        var pt = toBoard(pts[i]), p = drawing.p;
        var lx = p[p.length - 2], ly = p[p.length - 1];
        if (Math.hypot(pt[0] - lx, pt[1] - ly) < 3) continue;
        p.push(pt[0], pt[1]);
        var cost = strokeCost(p, drawing.w);
        if (cost > state.ink.left || p.length >= MAX_POINTS * 2) {   // out of ink (or too long): the stroke ends here
          if (cost > state.ink.left) { p.length -= 2; finish(); return showOut(); }
          return finish();
        }
        inkPreview = cost;
      }
      paintInk(); render();
    }
    function finish() {
      if (!drawing) return;
      var item = drawing;
      drawing = null;
      if (item.p.length === 2) item.p.push(item.p[0], item.p[1]);   // a single tap: a dot
      inkPreview = 0;
      save(item, strokeCost(item.p, item.w));
    }

    // ---- who drew it: hovering a drawing shows its author ----
    function boxOf(it) {
      if (it.k === "t") {
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.font = "600 " + TEXT_SIZE + "px " + FONT;
        var w = ctx.measureText(it.t).width;
        ctx.restore();
        return [it.x, it.y - TEXT_SIZE * 0.6, it.x + w, it.y + TEXT_SIZE * 0.6];
      }
      var b = [Infinity, Infinity, -Infinity, -Infinity], p = it.p;
      for (var i = 0; i < p.length; i += 2) {
        b[0] = Math.min(b[0], p[i]); b[1] = Math.min(b[1], p[i + 1]);
        b[2] = Math.max(b[2], p[i]); b[3] = Math.max(b[3], p[i + 1]);
      }
      return b;
    }
    function segDist(px, py, ax, ay, bx, by) {
      var dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
      var k = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
      return Math.hypot(px - ax - k * dx, py - ay - k * dy);
    }
    // The newest drawing under the pointer (with some slack: lines are thin)
    function itemAt(x, y) {
      var slack = 10 * W / Math.max(200, canvas.getBoundingClientRect().width);   // ~10 px on screen
      for (var i = state.items.length - 1; i >= 0; i--) {
        var it = state.items[i], b = it._box, pad = slack + (it.w || 0) / 2;
        if (!b || x < b[0] - pad || x > b[2] + pad || y < b[1] - pad || y > b[3] + pad) continue;
        if (it.k === "t") return it;
        var p = it.p;
        for (var j = 2; j < p.length; j += 2) if (segDist(x, y, p[j - 2], p[j - 1], p[j], p[j + 1]) <= pad) return it;
        if (p.length === 2 && Math.hypot(x - p[0], y - p[1]) <= pad) return it;
      }
      return null;
    }
    var hovered = null;
    function hover(e) {
      if (drawing || input || e.pointerType === "touch") return hideWho();
      var pt = toBoard(e), it = itemAt(pt[0], pt[1]);
      if (!it) return hideWho();
      if (it !== hovered) {
        hovered = it;
        who.textContent = it.n ? t("by", { name: it.n }) : t("someone");
        who.style.background = it.c; who.style.color = textOn(it.c);
      }
      // Above the pointer: below it sits your own cursor's name tag
      var r = stage.getBoundingClientRect();
      who.hidden = false;
      var x = e.clientX - r.left + 8, y = e.clientY - r.top - who.offsetHeight - 10;
      if (y < 4) y = e.clientY - r.top + 34;                     // no room above: well below your tag
      who.style.transform = "translate(" + Math.max(4, Math.min(x, r.width - who.offsetWidth - 6)) + "px," + y + "px)";
    }
    function hideWho() { hovered = null; who.hidden = true; }

    // ---- text ----
    function openInput(pt) {
      closeInput();
      if (!state.ink || state.ink.left < TEXT_COST) { showOut(); return; }
      input = el("input", "rb-input", stage);
      input.maxLength = MAX_TEXT;
      input.placeholder = t("textPlaceholder");
      input.style.left = (pt[0] / W * 100) + "%";
      input.style.top = (pt[1] / H * 100) + "%";
      input.style.color = myColor(); input.style.borderColor = myColor();
      input._pt = pt;
      input.addEventListener("keydown", function (e) {
        e.stopPropagation();                              // Roomful's / and E shortcuts stay quiet
        if (e.key === "Enter") { e.preventDefault(); placeText(); }
        else if (e.key === "Escape") { e.preventDefault(); closeInput(); }
      });
      input.addEventListener("input", function () {
        inkPreview = textCost(input.value.trim());
        if (inkPreview > state.ink.left) say(t("notEnough", { p: Math.round(state.ink.left / state.ink.max * 100) }), true);
        else say(input.value.trim() ? t("textCost", { c: inkPreview }) : "");
        paintInk();
      });
      input.addEventListener("blur", function () { setTimeout(function () { if (input && document.activeElement !== input) placeText(); }, 0); });
      setTimeout(function () { if (input) input.focus(); }, 0);
    }
    function closeInput() {
      if (!input) return;
      var i = input; input = null; i.remove();
      inkPreview = 0; paintInk();
    }
    function placeText() {
      if (!input) return;
      var text = input.value.replace(/[\u0000-\u001f\u007f]/g, "").trim(), pt = input._pt;
      closeInput();
      if (!text) return;
      var cost = textCost(text);
      if (cost > state.ink.left) { say(t("notEnough", { p: Math.round(state.ink.left / state.ink.max * 100) }), true); return; }
      var x = Math.min(pt[0], W - 10);
      save({ k: "t", c: myColor(), n: myName(), x: x, y: pt[1], t: text }, cost);
    }

    // ---- server ----
    function save(item, cost) {
      pending.push(item);
      state.ink.left = Math.max(0, state.ink.left - cost);   // optimistic
      paintInk(); render();
      say(t("saving"));
      fetch(api, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: uid, item: item }) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); })
        .then(function (res) {
          pending.splice(pending.indexOf(item), 1);
          if (res.j && res.j.ink) state.ink = res.j.ink;
          if (res.ok) { say(""); if (mc && mc.signal) mc.signal("board"); return refresh(); }
          if (res.status === 429) showOut();
          else say(t("error"), true);
          paintInk(); render();
          return refresh();
        })
        .catch(function () {
          pending.splice(pending.indexOf(item), 1);
          state.ink.left += cost;
          say(t("error"), true);
          paintInk(); render();
        });
    }

    var loading = null;
    function refresh() {
      if (destroyed) return Promise.resolve();
      if (loading) return loading;
      loading = fetch(api + "?uid=" + encodeURIComponent(uid) + "&rev=" + (state.rev == null ? "" : state.rev), { cache: "no-store" })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (j) {
          state.offline = false;
          state.ink = j.ink; state.total = j.total; state.cap = j.cap || state.cap;
          if (j.items) {
            state.items = j.items.map(function (it) {
              it._cost = it.k === "s" ? strokeCost(it.p, it.w) : textCost(it.t || "");
              it._box = boxOf(it);
              return it;
            });
          }
          state.rev = j.rev;
          applyTexts(); render();
        })
        .catch(function () {
          state.offline = true; state.ink = null;
          applyTexts(); render();
        })
        .then(function () { loading = null; });
      return loading;
    }

    // Fetch when someone draws (realtime signal), when the board comes into view
    // or the tab comes back, and every minute while it's visible.
    var offSignal = mc && mc.on ? mc.on("board", function () { refresh(); }) : function () {};
    var io = global.IntersectionObserver ? new IntersectionObserver(function (en) {
      visible = en[0].isIntersecting;
      if (visible) refresh();
    }) : null;
    if (io) io.observe(stage);
    pollTimer = setInterval(function () { if (visible && !document.hidden && !drawing) refresh(); }, 60000);
    function onVis() { if (!document.hidden && visible) refresh(); }
    document.addEventListener("visibilitychange", onVis);
    var ro = global.ResizeObserver ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(stage); else global.addEventListener("resize", resize);
    var lastColor = myColor();
    var colorTimer = setInterval(function () { if (lastColor !== myColor()) { lastColor = myColor(); paintInk(); } }, 1000);
    var clockTimer = setInterval(function () {               // the countdown, and the refill when it hits zero
      if (state.ink && Date.now() >= state.ink.resetAt) { state.ink.resetAt += 60000; refresh(); }
      paintClock();
      if (!out.hidden) { outBig.textContent = hms(); if (!outOfInk()) hideOut(); }
    }, 1000);

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", function (e) { if (drawing) onMove(e); else hover(e); });
    canvas.addEventListener("pointerleave", hideWho);
    canvas.addEventListener("pointerup", finish);
    canvas.addEventListener("pointercancel", finish);

    setTool("pen");
    applyTexts();
    resize();
    refresh();

    return {
      setLang: function (l) { lang = I18N[l] ? l : "en"; applyTexts(); },
      refresh: refresh,
      destroy: function () {
        destroyed = true;
        offSignal();
        if (io) io.disconnect();
        if (ro) ro.disconnect(); else global.removeEventListener("resize", resize);
        clearInterval(pollTimer); clearInterval(colorTimer); clearInterval(clockTimer);
        document.removeEventListener("visibilitychange", onVis);
        box.remove();
      }
    };
  }

  global.RoomfulBoard = { mount: mount, languages: Object.keys(I18N) };
})(window);
