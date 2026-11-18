# Roomful

🇬🇧 **English** · 🇪🇸 [Español](README.es.md)

**Turn any website into a room full of people.** Every page becomes a room: visitors see each other's cursors in real time, Figma multiplayer style, each one with a fun name ("Zen Capybara", "Ninja Axolotl"…). From a pill in the corner, their door to the room, they can see who's in, chat next to their cursor, react with emojis, follow someone and choose how they show up.

- **One script** (`multicursor.js`), no dependencies.
- **Minimal server** (`server.py`) using only the Python standard library, or Docker.
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

The demo is a landing page that explains every part of the pill, with demos that really work and 2 fake visitors so it's never empty. It's in English by default, with an **EN | ES** switch in the top bar.

## What's included

| | |
|---|---|
| 🖱️ **Live cursors** | Smoothed movement, name and photo on the label, one room per page |
| 👥 **People** | Who's here, their status (active, typing, away) and live stats |
| 🧭 **Follow** | Your page moves along with someone else's so you see what they see |
| 💬 **Chat** | Messages that appear next to your cursor, letter by letter (`/`) |
| 🎉 **Reactions** | Emojis that float up from your cursor (`E`) |
| ✨ **Clicks and selection** | Others see your clicks as ripples and the text you select |
| 🙂 **Profile** | Your own name, color and photo, remembered between visits |
| 👻 **Ghost mode** | Stop seeing cursors and stop sharing yours |
| 😴 **Idle** | Cursors that stop moving fade out with animated "zzz" |
| 🤖 **Optional bots** | Companion visitors that step out when real people arrive |
| 🌍 **Languages** | English (default) and Spanish; add your own with `strings` |
| ♿ **Accessible** | Keyboard friendly, ARIA labels, dark mode and reduced motion |

## The pill

```
 ┌──────────────────────────────────────────┐
 │ (◐◐◐) 4 here │  💬   😊  │  (You) ▾       │
 └──────────────────────────────────────────┘
    People        Chat React  Your profile
```

| Part | What it does | Shortcut |
|---|---|---|
| **People** | List of who's here, with their status, the numbers (on this page, on the whole site, today's peak) and a **Follow** button | — |
| **Chat** | Write next to your cursor; `Enter` keeps it for a few seconds, `Esc` clears it | `/` |
| **Reactions** | Emojis that float up from your cursor | `E` |
| **Your profile** | Name, color, photo, 🎲 random and the **ghost mode** switch | — |

Every button shows a tooltip with its shortcut, and the first visit brings a welcome hint.

## Adding it to another project

1. Copy `public/multicursor.js` into your site.
2. Deploy `server.py` (below).
3. Add before `</body>`:

```html
<script src="/multicursor.js"></script>
<script>
  const mc = MultiCursor.init({
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
| `room` | page path | Room; `"global"` to share one across the whole site |
| `lang` | `"en"` | Interface language: `"en"`, `"es"` or `"auto"` |
| `strings` | — | Custom texts or new languages |
| `bots` | `0` | Fake visitors (max. 12) |
| `chat`, `reactions`, `clicks`, `selection`, `follow` | enabled | Turn each feature on or off |
| `editable` | `true` | Let the visitor edit name, color and photo |
| `name`, `color`, `avatar` | random | Fixed or initial identity |
| `onStats` | — | Get `{ page, site, peak }` to use in your own UI |
| `onboarding` | `true` | Welcome hint on the first visit |

Every option (25 of them) is in the [documentation](docs/DOCUMENTATION.md#5-multicursorinit-options).

### API

```js
mc.open("people" | "profile" | "chat" | "reactions");  // open a part of the pill
mc.close();
mc.setLang("es");                                        // switch language on the fly
mc.react("🎉");
mc.setIdentity("Boss Capybara", "#A259FF");
mc.setGhost(true);
mc.setRoom("/another-room");
mc.follow(id); mc.unfollow();
mc.me; mc.peers; mc.room; mc.ghost; mc.stats; mc.lang;
mc.destroy();
```

## Deploying the server

It runs anywhere with Python or Docker (Render, Fly.io, Railway, a VPS…), **as a single instance**:

```bash
docker build -t roomful .
docker run -d -p 8080:8080 -e ALLOWED_ORIGINS=https://mydomain.com roomful
```

| Variable | Purpose | Default |
|---|---|---|
| `ALLOWED_ORIGINS` | Origins allowed to connect (**set it in production**) | any |
| `MAX_PER_ROOM` / `MAX_CLIENTS` | User limits per room / in total | 100 / 5000 |
| `STATIC_DIR` | Static files folder (`""` = WebSocket only) | `./public` |
| `PORT` / `HOST` | Port and interface | 8080 / 0.0.0.0 |

The server validates every field (photos included: never SVG), limits messages to 40 per second per client, closes dead connections and exposes `GET /health`. In production, use HTTPS and `wss://`. The full deployment guide, with an nginx config and a checklist, is in the [documentation](docs/DOCUMENTATION.md#10-production-deployment).

### Deploy on Vercel

Vercel serves the site, and [Ably](https://ably.com) carries the real-time traffic instead of `server.py` (Vercel can't keep WebSockets open). A small function, [`api/ably-token.js`](api/ably-token.js), hands out Ably tokens so your secret key never reaches the browser.

1. Create a free account at [Ably](https://ably.com), create an app and copy its **API key** (the one with *publish*, *subscribe* and *presence*).
2. In [Vercel](https://vercel.com), **Add New → Project** and import this GitHub repository. Leave the defaults: [`vercel.json`](vercel.json) already says what to publish.
3. Before deploying, add the environment variable `ABLY_API_KEY` with that key, then press **Deploy**.
4. That's it: by default the function only hands out tokens to pages of the same site. Set `ALLOWED_ORIGINS` only if other sites (or a custom domain on another host) should connect too.

Every push to `main` redeploys automatically. The landing uses Ably when published and `server.py` on `localhost`. Ably's free plan (6 million messages a month, 200 simultaneous connections) is plenty for a demo; a moving cursor sends up to 10 messages per second.

## Known limitations

- **No authentication:** anyone with the WebSocket URL can join a room. Not suitable for private rooms as is.
- **Single process, everything in memory:** it can't be spread across instances without adding a shared channel (e.g. Redis), and stats are lost on restart.
- **The profile is per browser:** another browser or device starts from scratch.
- **Bots are local:** each visitor sees their own.
- **Shared selection** requires everyone to have the same content on the page.
- **No automated tests:** checks have been done by hand and with test WebSocket clients.

## Structure

```
public/multicursor.js   The integration (client)
public/index.html       Demo landing page explaining the pill (EN/ES)
server.py               WebSocket relay + static files + /health
Dockerfile              Deployment image
api/ably-token.js       Vercel function that issues Ably tokens
vercel.json             Vercel settings (publishes public/)
package.json            Dependencies of the Vercel function
docs/DOCUMENTATION.md   Full documentation (English)
docs/DOCUMENTACION.md   Full documentation (Spanish)
```
