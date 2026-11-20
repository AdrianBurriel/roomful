# Roomful

🇬🇧 **English** · 🇪🇸 [Español](README.es.md)

**Turn any website into a room full of people.** Every page becomes a room: visitors see each other's cursors in real time, Figma multiplayer style, each one with a fun name ("Zen Capybara", "Ninja Axolotl"…). From a pill in the corner, their door to the room, they can see who's in, chat next to their cursor, react with emojis, wave, draw on a shared board, follow someone and choose how they show up. A grey guide can walk newcomers through it all.

🔴 **Live demo:** [roomful-sand.vercel.app](https://roomful-sand.vercel.app). Open it in two different browsers (or on your phone and your computer) and watch your cursors meet. Tabs of the same browser count as you, so they don't show each other.

- **One script** (`roomful.js`), no dependencies (with Ably, it loads Ably's SDK from their CDN).
- **Minimal server** (`server.py`) using only the Python standard library, or Docker. Or no server at all: **Vercel + Ably**.
- **Built to be reused** in future projects: one line to add it, options for everything and an API to wire it into your own UI.
- **English and Spanish** built in, with a language switch and the option to add more.

📖 **Full documentation:** [`docs/DOCUMENTATION.md`](docs/DOCUMENTATION.md)

---

## Quick start

Requirement: Python 3.8 or newer.

```bash
git clone https://github.com/AdrianBurriel/roomful.git
cd roomful
python3 server.py            # → http://localhost:8080
```

Open `http://localhost:8080` and, to see yourself from the outside, also open it **in another browser or on another device on your network** (`http://<your-local-ip>:8080`). Tabs of the same browser count as the same person.

The demo is a landing page that explains every part of the pill, with demos that really work and 2 fake visitors so it's never empty (labelled **BOT**; one always stays). It has a **shared board** to draw on, and a **guided tour** of 13 steps that's offered on the first visit and always available from the button at the top. It opens **in Spanish if your browser is in Spanish** (or Catalan, Galician or Basque) and in English otherwise, with an **EN | ES** switch in the top bar that's remembered.

## What's included

| | |
|---|---|
| 🖱️ **Live cursors** | Smoothed movement, name and photo on the label, one room per page. Yours looks the same: an arrow in your color with your name |
| 👥 **People** | Who's here, their status (active, typing, away) and live stats |
| 🧭 **Follow** | Your page moves along with someone else's so you see what they see |
| 💬 **Chat** | Messages that appear next to your cursor, letter by letter (`/`); the box grows with the text, up to 4 lines |
| 🎉 **Reactions** | Emojis that float up from your cursor (`E`) |
| 👋 **Wave** | Shake your cursor quickly from side to side and you wave at the room |
| ✨ **Clicks and selection** | Others see your clicks as ripples and the text you select |
| 🙂 **Profile** | Your own name, color and photo, saved as you change them and remembered between visits |
| 👻 **Ghost mode** | Stop seeing cursors and stop sharing yours |
| 😴 **Idle** | Cursors that stop moving fade out with animated "zzz" |
| 📱 **Phones and tablets** | Your finger is your cursor; chat and reactions from the pill's shortcuts panel |
| 🤖 **Optional bots** | Companion visitors, labelled **BOT**. When real people arrive they step out, but one always stays |
| ✏️ **Shared board** | Draw and write, in your color, on a board that stays for whoever comes next (hover a drawing to see who made it); ink per person that refills every 3 hours, and the oldest drawings are erased when it's full (`roomful-board.js`) |
| 🗺️ **Guided tour** | A grey guide flies to each part of the page and explains it, step by step, moving on by itself (`tour`) |
| 🌍 **Languages** | English (default) and Spanish; add your own with `strings` |
| ♿ **Accessible** | Keyboard friendly, ARIA labels, dark mode and reduced motion |

## The pill

```
 ┌──────────────────────────────────────────┐
 │ (◐◐◐) 4 here │  ⌨   👻  │  (You)          │
 └──────────────────────────────────────────┘
    People     Shortcuts Ghost  Your profile
```

| Part | What it does | Shortcut |
|---|---|---|
| **People** | List of who's here, with their status, the numbers (on this page, on the whole site, today's peak) and a **Follow** button | — |
| **Shortcuts** | Every key Roomful listens to: `/` chat next to your cursor (up to 4 lines; `Enter` keeps it for a few seconds, `Esc` clears it), `E` reactions that float up from your cursor (`1`–`9` to pick), `Esc` and `?`. Each row is also a button, so touch screens can chat and react from here | `?` |
| **Ghost mode** | One click to stop seeing cursors and stop sharing yours; the pill shrinks to "Cursors hidden · Show" | — |
| **Your profile** | Name, color, photo and 🎲 random, saved on their own as you change them (no Save button), plus the **ghost mode** switch | — |

On a computer every button shows a tooltip with its shortcut; on phones and tablets you tap ⌨ and pick "Write" or "React". The first visit brings a welcome hint that also offers the guided tour (if the site has one).

Without touching the pill: shake your cursor quickly from side to side to wave 👋 at the room.

## Adding it to another project

1. Copy `public/roomful.js` into your site.
2. Deploy `server.py`, or use Vercel + Ably and pass `ably: { authUrl: "/api/ably-token" }` instead of `url` (see [Deploying](#deploying)).
3. Add before `</body>`:

```html
<script src="/roomful.js"></script>
<script>
  const mc = Roomful.init({
    url: "wss://cursors.mydomain.com/ws",   // your server
    lang: "en",                              // "en" | "es" | "auto"
    bots: 2,                                 // optional: company when the page is empty
    onStats: s => console.log(s.page + " people here")
  });
</script>
```

In **React / Next.js**, call it inside a `useEffect` in the root layout and return `() => mc.destroy()`.

### Main options

| Option | Default | Purpose |
|---|---|---|
| `url` | `ws(s)://<host>/ws` | Server address |
| `ably` | — | Use Ably instead of `server.py`, for serverless hosts like Vercel: `{ authUrl: "/api/ably-token" }` |
| `room` | page path | Room; `"global"` to share one across the whole site |
| `lang` | `"en"` | Interface language: `"en"`, `"es"` or `"auto"` |
| `strings` | — | Custom texts or new languages |
| `bots` | `0` | Fake visitors (max. 12), labelled **BOT** |
| `botsMin` | `1` | Bots that stay however many people there are |
| `chat`, `reactions`, `clicks`, `selection`, `follow` | enabled | Turn each feature on or off |
| `editable` | `true` | Let the visitor edit name, color and photo (saved automatically) |
| `selfCursor` | `true` | Your own pointer in your color, with your name next to it |
| `wave` | `true` | Shake the cursor to wave 👋 (`false`, or another emoji) |
| `name`, `color`, `avatar` | random | Fixed or initial identity |
| `onStats` | — | Get `{ page, site, peak }` to use in your own UI |
| `onboarding` | `true` | Welcome hint on the first visit |
| `tour` | — | Guided tour: `{ steps: [...] }`, offered on the first visit |

Every option (30 of them) is in the [documentation](docs/DOCUMENTATION.md#5-roomfulinit-options).

### API

```js
mc.open("people" | "profile" | "keys" | "chat" | "reactions");  // open a part of the pill
mc.close();
mc.setLang("es");                                        // switch language on the fly
mc.react("🎉");
mc.setIdentity("Boss Capybara", "#A259FF");
mc.setGhost(true);
mc.setRoom("/another-room");
mc.follow(id); mc.unfollow();
mc.startTour(); mc.stopTour();                           // guided tour (continues where it was left)
mc.me; mc.peers; mc.room; mc.ghost; mc.stats; mc.lang; mc.tour;
mc.destroy();
```

### Shared board

`roomful-board.js` adds a board where everyone can draw (pen or thick marker) and write. Everyone draws in their profile color (there's no color picker). Drawings are stored on the server and stay for whoever comes next, and hovering one shows who made it.

```html
<div id="board"></div>
<script src="/roomful-board.js"></script>
<script>
  const board = RoomfulBoard.mount(document.querySelector("#board"), { mc });   // mc = Roomful.init(…)
</script>
```

- **Ink:** each person gets 5,000 units (about 3 long strokes or 10 short ones; the marker uses double, text 40 per letter), and it **refills completely every 3 hours** (at 00:00, 03:00, 06:00… UTC). A live countdown next to the ink bar shows when (`↻ Refills in 2:14:05`), and if you try to draw with no ink left, a card tells you you've used it up and when you can draw again. The server checks it per browser, with a looser cap per network.
- **Always something there:** when the ink on the board goes over 60,000, the oldest drawings are erased first (they fade a little beforehand). The newest one always stays.
- **Who drew it:** each drawing keeps its author's Roomful name; hover over it to see it. Drawings made before names were saved show "Someone".
- **Live:** when someone finishes a drawing, everyone else's board updates straight away.
- **Storage:** with `server.py`, in a file (`BOARD_FILE`); on Vercel, in Upstash Redis (see [Deploy on Vercel](#deploy-on-vercel)).

## Deploying

Two ways: on your own server with `server.py`, or on Vercel with Ably and no server at all.

### On your own server

`server.py` runs anywhere with Python or Docker (Render, Fly.io, Railway, a VPS…), **as a single instance**:

```bash
docker build -t roomful .
docker run -d -p 8080:8080 -e ALLOWED_ORIGINS=https://mydomain.com roomful
```

| Variable | Purpose | Default |
|---|---|---|
| `ALLOWED_ORIGINS` | Origins allowed to connect (**set it in production**) | any |
| `MAX_PER_ROOM` / `MAX_CLIENTS` | User limits per room / in total | 100 / 5000 |
| `STATIC_DIR` | Static files folder (`""` = WebSocket only) | `./public` |
| `BOARD_FILE` | Where the shared board is saved (`""` = no board). In Docker, put it on a volume | `./board.json` |
| `PORT` / `HOST` | Port and interface | 8080 / 0.0.0.0 |

The server validates every field (photos included: never SVG), limits messages to 40 per second per client, closes dead connections and exposes `GET /health`. In production, use HTTPS and `wss://`. The full deployment guide, with an nginx config and a checklist, is in the [documentation](docs/DOCUMENTATION.md#10-production-deployment).

### Deploy on Vercel

Vercel serves the site, and [Ably](https://ably.com) carries the real-time traffic instead of `server.py` (Vercel can't keep WebSockets open). A small function, [`api/ably-token.js`](api/ably-token.js), hands out Ably tokens so your secret key never reaches the browser.

1. Create a free account at [Ably](https://ably.com), create an app and copy its **API key** (the one with *publish*, *subscribe* and *presence*).
2. In [Vercel](https://vercel.com), **Add New → Project** and import this GitHub repository. Leave the defaults: [`vercel.json`](vercel.json) already says what to publish.
3. Before deploying, add the environment variable `ABLY_API_KEY` with that key, then press **Deploy**.
4. **For the shared board:** in the project, open **Storage → Upstash (Redis) → Connect** and create a free database. Vercel adds its keys (`KV_REST_API_URL`, `KV_REST_API_TOKEN`) by itself; redeploy once. [`api/board.js`](api/board.js) keeps the board there. Without it, the board shows "not available" and everything else works.
5. That's it: by default the functions only serve pages of the same site. Set `ALLOWED_ORIGINS` only if other sites (or a custom domain on another host) should connect too.

Every push to `main` redeploys automatically. The landing uses Ably when published and `server.py` on `localhost`. Ably's free plan is plenty for a demo (check its current limits in your Ably dashboard); a moving cursor sends up to 10 messages per second.

## Known limitations

- **No authentication:** anyone who can open the page can join its room (with `server.py`, anyone with the WebSocket URL). Not suitable for private rooms as is.
- **`server.py` is a single process with everything in memory:** it can't be spread across instances without adding a shared channel (e.g. Redis), and stats are lost on restart.
- **The profile is per browser:** another browser or device starts from scratch.
- **Bots are local:** each visitor sees their own (and at least one always stays, unless `botsMin: 0`). The tour guide is local too.
- **Your own colored pointer** and the **wave** need a mouse; on touch screens your finger is the cursor and you wave with the reactions.
- **With Ably,** "today's peak" is the highest number each visitor has seen, not a server-wide record, and every message counts towards your Ably plan.
- **Shared selection** requires everyone to have the same content on the page.
- **The board's ink is per browser:** clearing the browser's data gives fresh ink (the per-network cap limits abuse). There's no moderation: anyone can draw anything, and it stays until the board erases it.
- **No automated tests:** checks have been done by hand and with test WebSocket clients.

## Structure

```
public/roomful.js       The integration (client)
public/roomful-board.js The shared board (draw and write, ink that refills every 3 hours)
public/index.html       Demo landing page explaining the pill, with a shared board and a 13-step guided tour (EN/ES)
server.py               WebSocket relay + shared board + static files + /health
Dockerfile              Deployment image
api/ably-token.js       Vercel function that issues Ably tokens
api/board.js            Vercel function that keeps the shared board in Upstash Redis
vercel.json             Vercel settings (publishes public/)
package.json            Dependencies of the Vercel function
docs/DOCUMENTATION.md   Full documentation (English)
docs/DOCUMENTACION.md   Full documentation (Spanish)
```
