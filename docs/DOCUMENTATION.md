# Full documentation · Roomful

🇬🇧 **English** · 🇪🇸 [Español](DOCUMENTACION.md)

Technical reference for Roomful: the `roomful.js` integration that turns every page into a room, and the `server.py` server that keeps it full. For a quick introduction, see the [README](../README.md).

## Contents

1. [What it is and how it works](#1-what-it-is-and-how-it-works)
2. [Requirements](#2-requirements)
3. [Running it locally](#3-running-it-locally)
4. [Adding it to a project](#4-adding-it-to-a-project)
5. [`Roomful.init()` options](#5-roomfulinit-options)
6. [API of the returned object](#6-api-of-the-returned-object)
7. [The pill and keyboard shortcuts](#7-the-pill-and-keyboard-shortcuts)
8. [Behavior in detail](#8-behavior-in-detail)
9. [The server](#9-the-server)
10. [Production deployment](#10-production-deployment)
11. [WebSocket protocol](#11-websocket-protocol)
12. [Security and privacy](#12-security-and-privacy)
13. [Performance, limits and scaling](#13-performance-limits-and-scaling)
14. [Accessibility](#14-accessibility)
15. [Advanced customization](#15-advanced-customization)
16. [Troubleshooting](#16-troubleshooting)
17. [Repository structure](#17-repository-structure)

---

## 1. What it is and how it works

Roomful turns every page of a website into a **room**. Everyone on the same page is in the same room and sees, in real time, everybody else's cursor, Figma multiplayer style. Each cursor carries a random name ("Zen Capybara", "Ninja Axolotl"…). In the bottom-right corner, a **pill**, the door to the room, shows who's in and lets people chat, react, follow someone and edit their profile.

There are two pieces:

```
 Browser A                            Server (server.py)                      Browser B
┌──────────────────┐   WebSocket    ┌──────────────────────────┐  WebSocket ┌──────────────────┐
│ roomful.js   │ ─────────────▶ │ Relay by room            │ ─────────▶ │ roomful.js   │
│ · sends its state│ ◀───────────── │ · validates every field  │ ◀───────── │ · draws cursors  │
│ · draws cursors  │                │ · keeps the latest state │            │ · the pill       │
│ · the pill       │                │ · forwards to the rest   │            │                  │
└──────────────────┘                │ · stats, limits          │            └──────────────────┘
                                    └──────────────────────────┘
```

- **`public/roomful.js`** (client): a single script with no dependencies. It injects its own styles (every class starts with `mc-`), sends your position and state, and draws other people's cursors and the pill.
- **`server.py`** (server): a WebSocket relay written with the Python standard library only. It has no business logic: it groups clients by room, validates what it receives, keeps everyone's latest state for late joiners and forwards it to the rest. It can also serve static files.

- **`public/roomful-board.js`** (optional add-on): the shared board. It talks to `/api/board` on `server.py` or on Vercel ([§8.14](#814-shared-board)).

There is no database. Everything lives in the server's memory and in each visitor's browser, except the shared board, which is saved to a file (`server.py`) or to Upstash Redis (Vercel).

## 2. Requirements

| Piece | Requirement |
|---|---|
| Server | Python **3.8 or newer**, no external packages. Also runs with Docker (`python:3.12-slim`). |
| Browser | Modern desktop and mobile browsers. Uses WebSocket, `localStorage`, Canvas (for photos) and modern CSS (`overflow-x: clip`, `:focus-visible`, `aspect-ratio`). Tested in Chrome. |
| Production | HTTPS for the site and `wss://` for the WebSocket. Most hosts handle this for you. |

## 3. Running it locally

```bash
git clone https://github.com/AdrianBurriel/roomful.git
cd roomful
python3 server.py                 # → http://localhost:8080
```

- Open `http://localhost:8080` in **several tabs** or on **another device on your network** (`http://<your-local-ip>:8080`) to see the cursors. Your own tabs don't show each other (see [§8.3](#83-identity-and-your-other-tabs)), so to see your cursor "from outside" use another browser, a private window or another device.
- Another port: `PORT=3000 python3 server.py`.
- Stop it with `Ctrl+C`.
- Health check: `curl http://localhost:8080/health` → `{"ok": true, "clients": 0, "rooms": 0}`.
- The shared board is saved in `board.json` next to `server.py` (ignored by git). Delete it to start with an empty board.

The demo (`public/index.html`) is a landing page that explains the pill, with demos that really work, starts with 2 bots, has a shared board and a 13-step guided tour (offered on the first visit, always available from the button under the headline). The page itself is one dark room on a dot board: the headline types itself first, then everything else arrives; a few dots in the logo's colors liven up the board, dim once the page is in and step aside while you read. Sections, in order: the pill, people, chat, reactions, your profile and ghost mode, what the room notices on its own, the shared board and how to integrate it. The pill and every panel it opens wear the page's own glass style (see [§15](#15-advanced-customization)). It opens **in Spanish when the browser's main language is Spanish** (or Catalan, Galician or Basque) and **in English for everyone else**. The **EN | ES** switch in the top bar changes it and the choice is remembered; `?lang=es` / `?lang=en` in the URL wins over both.

## 4. Adding it to a project

### 4.1 Static site or your own server

1. Copy `public/roomful.js` into your project (or serve it from the cursors server, see [§10.3](#103-serving-the-script)).
2. Deploy `server.py` (see [§10](#10-production-deployment)).
3. Add before `</body>`:

```html
<script src="/roomful.js"></script>
<script>
  const mc = Roomful.init({
    url: "wss://cursors.mydomain.com/ws"
  });
</script>
```

If the cursors server also serves your site (as in the demo), you can omit `url`: by default it connects to `ws(s)://<same host>/ws`.

### 4.2 React / Next.js

```jsx
import { useEffect } from "react";

export function Cursors() {
  useEffect(() => {
    // roomful.js loaded with <Script src="/roomful.js" strategy="afterInteractive" />
    const mc = window.Roomful.init({ url: process.env.NEXT_PUBLIC_CURSORS_WS });
    return () => mc.destroy();   // essential: avoids duplicates on unmount and in StrictMode
  }, []);
  return null;
}
```

- Mount the component **only once**, in the root layout.
- With no `room`, rooms follow the route automatically as you navigate (the script checks `location.pathname` every second), so there's no need to call `setRoom()` on every page change.
- In Next.js the script touches `window` and `document`: load it on the client only.

### 4.3 Vue / other frameworks

Same idea: `init()` when the root component mounts and `destroy()` when it unmounts.

### 4.4 One room for the whole site

```js
Roomful.init({ url: "...", room: "global" });
```

Everyone sees each other even on different pages. Only use it when the pages share a layout: positions are drawn on each person's own page.

## 5. `Roomful.init()` options

All of them are optional. The former names still work: `MultiCursor.init()` is an alias of `Roomful.init()`, and `/multicursor.js` serves the same script as `/roomful.js`.

| Option | Type | Default | Description |
|---|---|---|---|
| `url` | string | `ws(s)://<host>/ws` | WebSocket URL. It may carry a query (`?token=…`); the script appends `&room=`. |
| `ably` | object | — | Use [Ably](https://ably.com) instead of `server.py`, for serverless hosts like Vercel: `{ authUrl, prefix, sdk }`. See [§10.6](#106-vercel--ably-no-server). |
| `room` | string | page path | Room (max. 128 characters). When omitted, one room per URL (without trailing slash) that follows route changes. |
| `lang` | `"en"` \| `"es"` \| `"auto"` | `"en"` | Interface language. `"auto"` uses the browser's. See [§8.12](#812-languages). |
| `strings` | object | — | Custom texts or new languages: `{ en: { key: "…" }, fr: { … } }`. |
| `name` | string | random | Fixed name. **Disables profile editing** (`editable` becomes `false`). |
| `color` | `#RRGGBB` | random | Initial color (the visitor can change it if `editable`). |
| `avatar` | data URL | — | Initial photo: base64 PNG, JPEG or WebP, 14,000 characters max. |
| `presence` | boolean | `true` | Shows the pill. With `false` there are only cursors (and `onStats`). |
| `onboarding` | boolean | `true` | Welcome hint on the first visit (shows after 1.5 s and never again). |
| `toggle` | boolean | `true` | "Ghost mode" switch in the profile panel. |
| `chat` | boolean | `true` | Chat next to the cursor (shortcuts panel row and `/` key). |
| `reactions` | array \| `false` | `["❤️","👍","🔥","😂","🎉","👏","😮","👀"]` | Available emojis (the first 9 are used). `false` disables them. |
| `clicks` | boolean | `true` | Shows other people's clicks as ripples in their color. |
| `selection` | boolean | `true` | Shows the text other people select. |
| `follow` | boolean | `true` | "Follow" button in the people panel. |
| `editable` | boolean | `true` | Lets the visitor edit name, color and photo. Every change is saved on its own (no Save button). `false` when `name` is given. |
| `selfCursor` | boolean | `true` | Your own pointer looks like everyone else's: an arrow in your color with your name tag. Only with a mouse; ghost mode restores the normal pointer. |
| `wave` | boolean \| emoji | `true` | Shaking the cursor quickly from side to side sends a 👋 reaction. `false` disables it; a string uses another emoji. |
| `onStats` | function | — | `({ page, site, peak }) => …` whenever the numbers change (see [§8.9](#89-stats)). |
| `anchor` | `"center"` \| `"left"` | `"center"` | Horizontal reference for coordinates (see [§8.10](#810-coordinates)). |
| `maxCursors` | number | `12` | Max cursors visible at the same time. |
| `idleMs` | number (ms) | `30000` | Inactivity before someone counts as away (faded cursor + "zzz"). |
| `bots` | number | `0` | Fake visitors (max. 12). See [§8.8](#88-bots). |
| `botsRetireAt` | number | `= bots` (min. 1) | Bots retire once at least this many real people are here. |
| `botsMin` | number | `1` | Bots that never retire, however many people there are. `0` lets them all leave. |
| `botChat` | boolean | `true` | Bots type a message now and then. |
| `botTargets` | CSS selector | links, buttons, headings, images… | Elements the bots move towards. Supports `[data-mc-target]`. |
| `botPhrases` | array \| object | phrases per language | Bot chat phrases: an array, or `{ en: [...], es: [...] }` so they follow the language. |
| `tour` | object | — | Guided tour: `{ steps, name?, offer? }`. A grey guide walks the visitor through the page. See [§8.13](#813-guided-tour). |

## 6. API of the returned object

```js
const mc = Roomful.init({ ... });
```

| Member | Type | Description |
|---|---|---|
| `mc.me` | object | The visitor's `{ name, color, avatar }` (updated when edited). |
| `mc.peers` | object | `id → peer` map of everyone else (bots included). Read-only. |
| `mc.room` | getter | Current room. |
| `mc.ghost` | getter | `true` while in ghost mode. |
| `mc.lang` | getter | Current interface language. |
| `mc.stats` | getter | `{ page, site, peak }` right now. |
| `mc.setRoom(room)` | function | Changes room manually (reconnects). From then on it stops following the page path automatically. |
| `mc.setGhost(bool)` | function | Turns ghost mode on or off (remembered). |
| `mc.setLang(lang)` | function | Switches the language of the pill, panels and random names instantly. |
| `mc.setIdentity(name, color, avatar?)` | function | Changes and saves the identity. `avatar`: data URL, `""` to remove it, `undefined` to leave it as is. Returns `false` if nothing changed. |
| `mc.open(part)` | function | Opens `"people"`, `"profile"`, `"chat"` or `"reactions"`. Turns ghost mode off if needed (except for `"profile"`). |
| `mc.close()` | function | Closes panels and the emoji picker. |
| `mc.react(emoji)` | function | Sends a reaction from your cursor (at most one every 250 ms). |
| `mc.follow(id)` / `mc.unfollow()` | function | Starts or stops following someone. You can't follow yourself. |
| `mc.startTour(step?)` / `mc.stopTour()` | function | Starts the guided tour (without `step`, where the visitor left it) or closes it. |
| `mc.tour` | object | `{ active, step, total, saved }`: whether the tour is running, the current step, how many there are and the remembered step. |
| `mc.uid` | string | Anonymous browser id (the same in every tab). |
| `mc.signal("board")` / `mc.on("board", fn)` | function | Tell the room the shared board changed / hear it (`on` returns a function to stop listening). Used by `roomful-board.js`. |
| `mc.destroy()` | function | Disconnects and removes every element and listener. Use it on unmount. |

`Roomful.languages` also lists the built-in languages (`["en", "es"]`).

## 7. The pill and keyboard shortcuts

```
 ┌──────────────────────────────────────────┐
 │ (◐◐◐) 4 here │  ⌨   👻  │  (You)          │
 └──────────────────────────────────────────┘
    People     Shortcuts Ghost  Your profile
```

| Part | What it does |
|---|---|
| **People** | Up to 3 faces + "N here" ("Just you" when nobody else is around). Opens a panel with the numbers (on this page, on the whole site, today's peak) and the list of people with their status (**Active**, **Typing…**, **Away**) and a **Follow** button. Your row has **Edit**. |
| **Shortcuts ⌨** | A panel with every key (`/`, `E`, `Esc`, `?`). The chat and reaction rows are also buttons: they open the chat next to your cursor or the emoji picker above the pill, so on touch screens this is how you chat and react. `?` opens it too. |
| **Ghost mode 👻** | Turns ghost mode on with one click (the same as the switch in your profile). |
| **Your profile** | Photo (upload, change or remove), name, color, 🎲 Random (name and color) and the **Ghost mode** switch. There's no Save button: color, photo and dice apply instantly, the name after a short pause in typing (or on `Enter` / leaving the field), and "✓ Saved" confirms it. |

Special states:

- **Following someone:** a frame in their color surrounds the screen, with a "Following X · Stop following ✕" button at the top.
- **Ghost mode:** the pill shrinks to "Cursors hidden · **Show**".
- **First visit:** a "👋 You're not alone on this page" hint with **Got it**. It's marked as seen when clicked or when any panel is opened.

### Shortcuts

| Key | Action |
|---|---|
| `/` | Open the chat next to your cursor |
| `Enter` (in the chat) | Send; the message stays for 4 s and disappears |
| `Esc` (in the chat) | Clear the message and close |
| `E` | Open/close the emoji picker next to your cursor |
| `?` | Open/close the shortcuts panel |
| Shake the mouse side to side | Wave 👋 at the room |
| `1`–`9` (with the picker open) | Send that emoji (hidden shortcut) |
| `Esc` | Close panels and picker; stop following |
| Wheel, `↑` `↓` `PgUp` `PgDn` `Home` `End` `Space`, swiping on a touch screen | Stop following (you get scrolling back) |

Shortcuts are ignored while you type in a text field on the page.

### On phones and tablets

- **Your finger is your cursor:** touching or swiping the page puts your cursor there, and it travels with the content as you scroll, so others see where you are reading. Touches on the pill and its panels don't move it.
- **Chat:** tap ⌨ and then "Write next to your cursor": the message field opens docked at the bottom, above the keyboard; others see your message next to your cursor.
- **Reactions:** tap ⌨ and then "React".
- **Following** stops when you swipe to scroll; a simple tap doesn't stop it.
- The welcome hint and the help texts talk about buttons instead of keyboard shortcuts.

## 8. Behavior in detail

### 8.1 Rooms

The room is the heart of Roomful: you see the cursors, messages and reactions of the people in your same room.

- By default, the room is `location.pathname` without trailing slash (`/pricing/` → `/pricing`). Query and hash don't count.
- In SPAs route changes are detected (checked every second) and the client reconnects to the new room.
- The server limits the name to 128 characters and uses `/` when empty.

### 8.2 Connection and reconnection

- On connect it sends name, color, photo, browser id, position and selection.
- If the connection drops, it retries with exponential backoff: 0.5 s, 1 s, 2 s… up to 15 s, with ±20 % jitter so a restarted server isn't flooded.
- In ghost mode there is no connection.

### 8.3 Identity and your other tabs

- **Random name and color** are generated per tab (`sessionStorage`): every new tab gets a different one **until the visitor changes anything in their profile** (it's saved automatically). From then on, the saved one is used in every tab and visit (`localStorage`).
- The random name is stored as "animal + adjective" (two indexes), so it's shown in the active language and translated when it changes: "Zen Capybara" ↔ "Capibara Zen". A name saved by the visitor is never translated.
- **Browser id** (`mc:uid`): 20 random characters shared by every tab of the same browser and domain. It stops your other tabs from showing up as somebody else: they aren't listed in the pill, can't be followed, and their cursor, clicks, reactions and selections aren't drawn.
- If a tab doesn't send an id (e.g. it still runs an older version of the script), it counts as "you" when it has your same name and color.

### 8.4 What's stored in the browser

| Key | Where | Content |
|---|---|---|
| `mc:me` | `sessionStorage` | The tab's random identity, with its name indexes (`gen`), when no profile is saved. |
| `mc:me` | `localStorage` | Saved profile: `{ name, color, avatar }`. |
| `mc:uid` | `localStorage` | Anonymous browser id. |
| `mc:ghost` | `localStorage` | `true` when ghost mode is on. |
| `mc:onboarded` | `localStorage` | `true` once the welcome hint has been seen. |
| `mc:tour` | `localStorage` | Step where the visitor left the guided tour (removed when it's finished). |

Everything is **per browser and domain**: another browser, another device, a private window, or `www.` vs. no `www.` all start from scratch. If the browser blocks storage, the script keeps working without remembering anything.

### 8.5 Profile photo

- The visitor picks an image from their computer. It's **cropped to a centered square** and **shrunk in the browser**: it tries 96, 72 and 56 px, in WebP and then JPEG, with decreasing quality, until it's ≤ 14,000 characters (~2–10 KB).
- Transparent images get a white background.
- It shows in the pill, the people panel and the cursor label, and late joiners receive it too.

### 8.6 Chat, clicks, reactions and selection

| Feature | Detail |
|---|---|
| Chat | The box grows with the text: first in width up to 216 px, then in height up to 4 lines; once it's full you can't type more (max. 140 characters in any case). `Enter` sends, so there are no line breaks. Sent while typing (others see it letter by letter). |
| Clicks | Every left click outside the pill is sent (max. one every 120 ms). Others see a ripple in your color. You don't see your own. |
| Reactions | Three emojis float up and fade out from your cursor (max. one every 250 ms). |
| Wave | Four changes of direction (strokes of ≥ 40 px) in under 0.9 s send a 👋 reaction; at most one every 2.5 s. It travels as a normal reaction, so the server needs no changes. |
| Your cursor | With a mouse, your pointer becomes the same arrow others see, in your color (a CSS cursor, so there's no lag), with your name tag next to it. Links, text fields and elements with their own `cursor` keep theirs. |
| Selection | **Which text** is selected is shared (DOM node path + offset), not pixels. Each browser highlights it on its own layout, so it lines up even when the text wraps differently. Selections inside text fields and `contenteditable` are ignored. If the page DOM differs between visitors, it simply isn't drawn. |

### 8.7 Idle state and cursor cap

- After `idleMs` (30 s) without moving, the cursor fades, animated "zzz" float up and the panel shows **Away**. Anyone whose tab is in the background or whose mouse is outside the window also shows as "Away".
- When more than `maxCursors` cursors are visible, the extra ones are hidden with this priority: real people before bots, active before away, most recent first. The person you follow is never hidden.

### 8.8 Bots

The room's regulars: fake visitors so a room never looks empty.

- They are **local**: each visitor sees their own and they never travel through the server.
- They move along smooth curves towards real elements on the page (`botTargets`) and take short pauses.
- **They take turns so they're not annoying:** each bot alternates between "visiting" your screen (7–16 s) and "away" off screen (12–30 s). Usually only one is visiting.
- They talk at most once per visit, in roughly half of their visits, and never two at once. Sometimes they click (22 % on arrival) or react (5 %), and in about 40 % of their visits they wave 👋 when they arrive.
- **They're labelled:** a small **BOT** chip on their cursor and in the people panel, so nobody mistakes them for real people.
- **They retire** once there are `botsRetireAt` real people, and come back if the room empties. `botsMin` of them (1 by default) always stay.
- They don't appear if the visitor has *reduce motion* enabled (`prefers-reduced-motion`).
- They count in the pill's numbers (see [§8.9](#89-stats)).

### 8.9 Stats

| Number | How it's computed |
|---|---|
| `page` | You + real people in the room (without your other tabs) + active bots. |
| `site` | Connections on the whole server + active bots (never less than `page`). |
| `peak` | Today's peak of simultaneous connections in this room (server clock) + bots (never less than `page`). |

The server sends its numbers on join and then every 3 s **only if they changed**. The peak lives in memory: it's lost when the server restarts. In ghost mode, all three are 0.

### 8.10 Coordinates

- `x` = pixels from the **center** of the document (with `anchor: "left"`, from the left edge).
- `y` = pixels from the **very top** of the page (not the screen).

So on centered layouts with a max width (the usual case), a cursor over a button shows up over that same button on screens of different widths, and cursors scroll with the page. On layouts that change a lot between mobile and desktop, positions are approximate. Cursors never cause horizontal scroll: they're clipped to the window width.

### 8.11 Ghost mode

Turning it on **closes the connection**: you don't see cursors and nobody sees you, not even in the people list. The preference is remembered. Turning it off reconnects.

### 8.12 Languages

- **English** (default) and **Spanish** are built in. With `lang: "auto"` the browser language is used, falling back to English.
- `mc.setLang("es")` instantly translates the pill, open panels, hints, tooltips and **random names**: yours (if you haven't saved one) and the bots'. If your name changes, others see it updated.
- Each visitor sees the interface in their own language. The names shown are the ones each person sends.
- **Custom texts or new languages** via `strings`. The keys live in the `I18N` dictionary at the top of `roomful.js`; any missing key falls back to English.

```js
Roomful.init({
  lang: "fr",
  strings: { fr: { seeWho: "Voir qui est là", chatTip: "Écrire à côté de ton curseur", saved: "✓ Enregistré" /* … */ } }
});
```

A new language uses the English random names and bot phrases, unless you pass `botPhrases` for that language.

### 8.13 Guided tour

With the `tour` option, a **guide** walks the visitor through the page. It's a bot in **grey** (no visitor color is grey, so nobody looks like it) with a **GUIDE** label.

- For each step it **scrolls the page** to the element, **flies** its cursor there, types a short line in its bubble and **spotlights** the element (the rest of the page dims a little). A card at the bottom left (a bottom sheet on phones) explains the step in detail.
- **It moves on by itself** once there's been time to read it (~220 words per minute, at least 8 s per step), with a progress bar. The card has **Back**, **Pause** / **Resume**, **Next** (**Finish** on the last step) and **✕** to close; with a keyboard, `←` `→` and `Esc`.
- Steps with `wave: true` make the guide wave 👋 when it arrives.
- **First visit:** the welcome hint offers **▶ Take the tour** (unless `offer: false`). After that, start it from your own UI with `mc.startTour()`.
- **Progress is remembered** (`mc:tour`): `mc.startTour()` continues where the visitor left off; `mc.startTour(0)` starts over. Finishing it forgets the progress.
- Meanwhile the other bots step aside and keep quiet. The guide is local (nobody else sees it), doesn't count in the numbers or appear in the people list. Turning on ghost mode closes the tour.
- Changing the language with `mc.setLang()` re-renders the current step in the new language.
- With *reduce motion*, the guide jumps instead of flying and the page doesn't scroll smoothly.

```js
Roomful.init({
  tour: {
    name: { en: "Capybara", es: "Capibara" },        // the guide's name
    steps: [
      { target: ".hero h1", wave: true,
        say:   { en: "Hi! Let me show you around 👋", es: "¡Hola! Te enseño esto 👋" },
        title: { en: "Welcome", es: "Bienvenido" },
        text:  { en: "This page is a room…", es: "Esta página es una sala…" } },
      // …
    ]
  }
});
```

Each text can be a string or `{ en, es, … }`. `text` is HTML: inside it, `<span class="mc-kb">…</span>` only shows with a mouse and keyboard, and `<span class="mc-tch">…</span>` only on touch screens, so each device gets the right instructions. The landing (`public/index.html`) has a complete 13-step tour as an example.

### 8.14 Shared board

`public/roomful-board.js` is an add-on: a board where everyone in the room can draw and write, and the drawings stay for whoever comes next. It uses the Roomful instance for your browser id, your color, the language and the "someone drew" signal.

```js
const mc = Roomful.init({ … });
const board = RoomfulBoard.mount(document.querySelector("#board"), {
  mc,                      // required for the color, id and live updates
  api: "/api/board",       // default
  lang: "es",              // default: mc.lang
  strings: { en: { … } }   // optional text overrides
});
board.setLang("en"); board.refresh(); board.destroy();
```

- **Tools:** pen (thin) and marker (thick, double ink), always in your profile color (there's deliberately no color picker: your color is your signature), plus **text** (click, type up to 60 characters, `Enter`). Each drawing is sent when you finish it.
- **Who drew it:** each drawing is saved with its author's Roomful name (`mc.me.name` at that moment). Hovering a drawing with the mouse shows that name in a tag of the drawing's color, above the pointer (your own cursor's tag sits below it). Drawings saved without a name show "Someone". On touch screens there's no hover, so it isn't shown.
- **Ink:** 5,000 units per browser, refilled completely **every 3 hours** (at 00:00, 03:00, 06:00… UTC; `INK_PERIOD_H` in `api/board.js`, `INK_PERIOD` in `server.py`); a stroke costs its length in board units (the board is 1600 × 1000), the marker double, text 40 per character. A bar shows what's left, and next to it a **live countdown** to the next refill (`↻ Refills in 2:14:05`, updated every second); when it reaches zero the board fetches the new ink by itself. If you run out mid-stroke, the stroke ends there. Trying to draw or write with no ink left shows a card over the board, **"You've used up your ink"**, with a live countdown and the local time you can draw again ("You can draw again at 16:00"); it closes with **OK**, by clicking outside it, after 8 seconds, or by itself when the ink refills. The server is the one that checks it: per browser id, and 25,000 per IP and period so a shared network can't be abused.
- **Capacity:** when the ink on the board goes over 60,000 (or there are more than 300 drawings), the oldest are erased until it fits; the newest always stays. The oldest ones fade a little once the board is three-quarters full, so you can tell what's about to go.
- **Live:** when a drawing is saved, `mc.signal("board")` tells the room and everyone else's board fetches the changes. It also fetches when it comes into view, when the tab comes back, and every minute while visible. The drawing itself only appears once finished.
- **Storage:** `server.py` keeps it in `BOARD_FILE` (JSON); on Vercel, `api/board.js` keeps it in Upstash Redis with an atomic script, under keys that start with a version prefix (`board:v2:`). Changing that prefix starts an empty board, with everyone's ink full again, without touching the database (v2 is the board where every drawing has its author's name). Both apply the same rules (constants at the top of each file).

**HTTP API** (same in both):

| Request | Response |
|---|---|
| `GET /api/board?uid=<id>&rev=<n>` | `{ rev, total, cap, ink: { left, max, resetAt }, items? }`; `items` only if the board changed since `rev`. |
| `POST /api/board` `{ uid, item }` | `200 { rev, cost, ink }`; `429 { error: "no-ink", ink }`; `400` invalid; `403` origin not allowed; `503` no storage. |

`item` is `{ k: "s", c: "#RRGGBB", n?: "author", w: 3 | 9, p: [x0, y0, x1, y1, …] }` (2–600 integer points) or `{ k: "t", c, n?, x, y, t: "text" }`. `n` is the author's name (up to 32 characters, control characters removed); the server adds `id`.

## 9. The server

### 9.1 Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | Port | `8080` |
| `HOST` | Interface | `0.0.0.0` |
| `ALLOWED_ORIGINS` | Origins allowed to connect, comma-separated, with protocol (`https://mydomain.com,https://www.mydomain.com`). Empty = any. **Set it in production.** | empty |
| `MAX_PER_ROOM` | Max users per room (above it, responds 503) | `100` |
| `MAX_CLIENTS` | Max connections in total (above it, responds 503) | `5000` |
| `STATIC_DIR` | Static files folder. `""` to serve only the WebSocket and `/health` | `./public` |
| `BOARD_FILE` | JSON file where the shared board is kept (`""` = no board). In Docker, mount it on a volume or it's lost with the container | `./board.json` |

### 9.2 Routes

| Route | Response |
|---|---|
| `GET /ws?room=<room>` with `Upgrade: websocket` | WebSocket connection. 403 if the `Origin` isn't allowed, 503 if a limit is exceeded. |
| `GET /health` | `200 {"ok": true, "clients": N, "rooms": M}` |
| `GET` / `POST /api/board` | Shared board (see [§8.14](#814-shared-board)). |
| Any other `GET` / `HEAD` | File from `STATIC_DIR` (`/` → `index.html`). 404 if missing or if it tries to escape the folder. |
| Other methods | 405 |

### 9.3 Internal limits (constants in `server.py`)

| Constant | Value | Effect |
|---|---|---|
| `MAX_FRAME` | 16 KB | A bigger message closes the connection. |
| `RATE_PER_SEC` / `RATE_BURST` | 40 / 80 | Messages per second per client; the excess is silently dropped. |
| `PING_EVERY` | 20 s | Ping to every client. |
| `DEAD_AFTER` | 60 s | Nothing received in that time closes the connection. |
| `STATS_EVERY` | 3 s | How often stats are checked. |

### 9.4 Field validation

The server only forwards known, valid fields; everything else is dropped.

| Field | Rule |
|---|---|
| `name` | Text, 1 to 32 characters |
| `color` | `#RRGGBB` |
| `avatar` | `""` or `data:image/(png\|jpeg\|webp);base64,…` of ≤ 14,000 characters (never SVG) |
| `uid` | 8–32 characters `[a-z0-9]` |
| `x`, `y` | Numbers (not booleans), `|x| < 10⁶`, `|y| < 10⁷` |
| `visible` | Boolean |
| `chat` | Text up to 140 characters |
| `sel` | `null` or `{a, ao, f, fo}`: paths of ≤ 64 integer indexes and integer offsets |
| event `kind` | `"click"`, `"reaction"` or `"board"` (the shared board changed; no extra data) |
| event `emoji` | 1–8 characters with no letters, digits, spaces or `< > & " '` |

A client isn't announced to the others until it sends a valid `name`.

## 10. Production deployment

### 10.1 Docker

```bash
docker build -t cursors .
docker run -d -p 8080:8080 \
  -e ALLOWED_ORIGINS=https://mydomain.com,https://www.mydomain.com \
  --restart unless-stopped cursors
```

The image includes a `HEALTHCHECK` against `/health`.

### 10.2 Hosts (Render, Fly.io, Railway…)

- **Service type:** web service with Docker (uses the `Dockerfile`) or with Python (command `python3 server.py`).
- **Port:** most of them inject `PORT`, and the server honors it.
- **Health check:** `/health`.
- **WebSockets:** must be allowed (they are by default on these three).
- **Instances:** use **a single instance** (see [§13](#13-performance-limits-and-scaling)).

### 10.3 Serving the script

Two options:
- **Copy `roomful.js` into your site** (recommended): it's versioned with your project. Then start the server with `STATIC_DIR=""` so it only does WebSocket.
- **Serve it from the cursors server:** `<script src="https://cursors.mydomain.com/roomful.js">`. Note that it's served with `Cache-Control: no-cache`.

### 10.4 Behind nginx

```nginx
location /ws {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header Origin $http_origin;
    proxy_read_timeout 120s;   # > PING_EVERY, so nginx doesn't cut healthy connections
}
```

### 10.5 Checklist

- [ ] The site runs on HTTPS and `url` uses `wss://` (browsers block `ws://` from an HTTPS page).
- [ ] `ALLOWED_ORIGINS` contains exactly the site's domains, with `https://` and no trailing slash.
- [ ] A single server instance.
- [ ] `/health` responds.
- [ ] Tested with two different browsers (not two tabs of the same one).

### 10.6 Vercel + Ably (no server)

Serverless hosts such as Vercel can't keep WebSockets open, so `server.py` can't run there. Instead, pass the `ably` option and the script speaks the same protocol over [Ably](https://ably.com) channels:

```js
Roomful.init({ ably: { authUrl: "/api/ably-token" } });
```

- **Channels:** one per room (`roomful:room:<room>`) plus `roomful:site` to count people across the whole site. `prefix` changes `roomful`.
- **Presence** tells who is in each room; when someone comes in, everyone re-sends their state so the newcomer can draw them.
- **Validation:** there's no server in between, so the script applies to every incoming message the same rules as `server.py` (§9.4) and drops anything that fails them.
- **Tokens:** `api/ably-token.js` (a Vercel function) signs token requests with `ABLY_API_KEY`. Tokens are bound to the connection id, last one hour and only allow the `roomful:*` channels. Only pages of the same site get tokens, unless `ALLOWED_ORIGINS` lists other sites.
- **Rate:** positions are sent at most every 100 ms (instead of 40 ms) so the plan lasts longer.
- **Differences from `server.py`:** the day's peak is the highest number this visitor has seen, not a server-wide record; `MAX_PER_ROOM`/`MAX_CLIENTS` give way to the limits of your Ably plan.

- **Shared board:** `api/board.js` keeps it in Upstash Redis (connect it under **Storage** in the Vercel project; it adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`). Without it, `/api/board` answers 503 and the board says it's not available.

Setup steps are in the [README](../README.md#deploy-on-vercel).

## 11. WebSocket protocol

JSON text messages. Connection: `GET /ws?room=<room>`.

### Client → server

```jsonc
// State (stored, and also sent to late joiners). Every field is optional.
{ "t": "update", "name": "Zen Capybara", "color": "#A259FF", "avatar": "data:image/webp;base64,…",
  "uid": "k3j9x0…", "x": -120, "y": 840, "visible": true, "chat": "hi", "sel": null }

// Ephemeral event (forwarded, not stored)
{ "t": "event", "kind": "click", "x": 10, "y": 400 }
{ "t": "event", "kind": "reaction", "emoji": "🔥", "x": 10, "y": 400 }
```

### Server → client

```jsonc
{ "t": "welcome", "id": 7, "room": "/pricing", "peers": [ { "id": 3, "name": "…", "color": "…", "x": 0, "y": 0, … } ] }
{ "t": "update", "id": 3, "x": 15, "y": 420 }             // only the changed fields
{ "t": "update", "id": 3, "name": "…", "color": "…", … }  // full state the first time someone introduces themselves
{ "t": "leave", "id": 3 }
{ "t": "event", "id": 3, "kind": "reaction", "emoji": "🔥", "x": 10, "y": 400 }
{ "t": "stats", "room": 4, "site": 12, "peak": 6 }
```

Order on connect: `welcome` → `stats`. The protocol is small: it can be ported to Node (`ws`), Cloudflare Durable Objects, PartyKit, etc. by keeping these messages and the validation rules in [§9.4](#94-field-validation).

## 12. Security and privacy

- **No authentication:** anyone who knows the WebSocket URL can join any room. Don't use it for private rooms without first adding a token to the `url` and validating it on the server.
- **`ALLOWED_ORIGINS`** stops other websites from using your server from the browser (it doesn't stop a script that forges the `Origin` header).
- **Strict validation** of every field ([§9.4](#94-field-validation)): photos can only be small raster images, "emojis" can't be text and colors can only be hex.
- **No HTML from users:** names, messages and emojis are inserted as text (`textContent`), never as HTML.
- **What others see:** name, color, photo, cursor position, chat messages, clicks, reactions and which text you select, always within the same room. The profile panel warns that people on the page will see the photo.
- **What's stored:** only the shared board: its drawings (color, lines, text and the author's Roomful name, which anyone hovering the drawing can see) and, for the ink, how much each browser id and each network has used in the current 3-hour period (on Vercel the IP is kept as a hash, and these counts expire after two periods; in `server.py` they're only in memory). Everything else is in memory and disappears on disconnect or restart.
- **The board isn't moderated:** anyone can draw or write anything, and it stays until it's erased for being the oldest. Board text is drawn on the canvas, never inserted as HTML.
- **Ghost mode:** disconnects completely.
- **Browser id:** random and not tied to any personal data.

## 13. Performance, limits and scaling

| Aspect | Value |
|---|---|
| Position updates | Max. ~25 per second per visitor (every 40 ms) |
| Animation | A single smoothed `requestAnimationFrame` loop; it only runs while something moves (or with bots) |
| Panel and pill | Re-rendered only when something visible changes |
| Selection | Max. 120 rectangles per person |
| Name / chat / photo | 32 characters / 140 characters / 14,000 characters |
| Emojis / bots | 9 / 12 at most |
| Shared board | 5,000 ink per browser every 3 hours (25,000 per IP); 60,000 ink or 300 drawings on the board; 600 points per stroke, 60 characters per text; fetched on changes and once a minute while visible |

**Scaling:** the server is **a single process** with everything in memory. With several instances, each one would have its own list of people and they wouldn't see each other. If you ever need to scale beyond one machine, add a shared channel between instances (e.g. Redis pub/sub) or port the relay to a service built for it (Durable Objects, PartyKit). For a regular website, one process with the default limits (100 per room, 5000 in total) is plenty.

## 14. Accessibility

- Every control is a `<button>` with `aria-label`; the pill is a `toolbar`, panels are `dialog`s, ghost mode is a `switch` and "Follow" uses `aria-pressed`.
- Fully usable with the keyboard. Visible focus is a blue outline and tooltips also show on focus.
- `aria-keyshortcuts` on buttons that have a shortcut.
- With `prefers-reduced-motion`: no bots, no click ripples, shorter reactions and static "zzz".
- Automatic dark mode (`prefers-color-scheme`).
- Shared board: the tools are buttons with `aria-pressed` and tooltips, the ink and messages are announced (`aria-live`), and the canvas has a label. Drawing needs a mouse, pen or finger; text can be typed once you've clicked on the board.
- The interface language is configurable (`lang`), and the demo updates `<html lang>` when it changes.

## 15. Advanced customization

- **Styles:** every class starts with `mc-` (`.mc-presence`, `.mc-pop`, `.mc-cursor`, `.mc-tag`…). Override them from your CSS with higher specificity. The cursor layer uses `z-index: 2147483000` and the pill sits above it. The landing is a full example: with `html .mc-presence`, `html .mc-pop`, `html .mc-picker`, `html .mc-coach`, `html .mc-tour` and `html .mc-tooltip` it gives the pill and everything it opens its own dark glass, fonts and colors, whatever the visitor's OS theme.
- **Constants** at the top of `roomful.js`:

| Constant | Value | What it controls |
|---|---|---|
| `I18N` | dictionary | Texts, animals, adjectives, name order and bot phrases for each language |
| `COLORS` | 12 colors | Cursor and editor palette |
| `REACTIONS` | 8 emojis | Default emojis |
| `BOT_TARGETS` | selector | Default elements the bots move towards |
| `BOT_HERE_MS` / `BOT_AWAY_MS` | 7–16 s / 12–30 s | Pace of the bots' visits |
| `SEND_EVERY_MS` | 40 | Position update interval |
| `LERP` | 0.28 | Cursor smoothing (1 = none) |
| `CHAT_LINGER_MS` | 4000 | How long a message stays after Enter |

- **Texts and languages:** every visible text goes through the `I18N` dictionary; use the `strings` option to change them without touching the script (see [§8.12](#812-languages)).

## 16. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| I can't see anyone | Are you on the same URL? (rooms are per page). Are they tabs of the same browser? Then they count as "you": try another browser or device. |
| Connection refused (403) | The domain isn't in `ALLOWED_ORIGINS`. Check the protocol (`https://`) and remove the trailing slash. |
| Connection refused (503) | `MAX_PER_ROOM` or `MAX_CLIENTS` was exceeded. |
| Works locally but not in production | Use `wss://` if the site runs on HTTPS; check that the proxy forwards `Upgrade`/`Connection` ([§10.4](#104-behind-nginx)). |
| I see myself in the list | That tab runs an older version of the script: reload it. |
| I get a different name after reloading | You haven't touched your profile: random names are per tab. Open "Your profile" and change anything (it saves on its own). |
| Bots don't show up | There are enough real people (`botsRetireAt`), the visitor has *reduce motion* enabled, or `bots` is 0. |
| Someone's selection isn't highlighted | Their page DOM differs from yours (personalized or dynamic content). Expected. |
| "Couldn't use that image" | The browser doesn't support the format (e.g. HEIC in some) or the image is damaged. Try JPG or PNG. |
| The board says "not available" | On Vercel, Upstash Redis isn't connected to the project (Storage → Upstash → Connect, then redeploy). With `server.py`, `BOARD_FILE` is set to `""`. |
| I can't draw anymore | You've used your ink: the card over the board and the countdown next to the bar show when it refills (every 3 hours). |
| Hovering a drawing says "Someone" | It was drawn before drawings kept their author's name. New drawings show the name. |
| `address already in use` on start | Something already uses that port: `lsof -i :8080` to see it, or use `PORT=3000`. |
| Duplicate panels in React | Missing `return () => mc.destroy()` in the `useEffect`. |

## 17. Repository structure

```
roomful/
├── public/
│   ├── roomful.js         # The integration (client)
│   ├── roomful-board.js   # The shared board (add-on)
│   └── index.html         # Demo landing page explaining the pill, with a shared board and a guided tour (EN/ES)
├── api/
│   ├── ably-token.js      # Vercel: Ably tokens
│   └── board.js           # Vercel: the shared board in Upstash Redis
├── server.py              # WebSocket relay + shared board + static files + /health
├── Dockerfile             # Deployment image
├── docs/
│   ├── DOCUMENTATION.md   # This document (English)
│   └── DOCUMENTACION.md   # Full documentation (Spanish)
├── README.md              # English
└── README.es.md           # Spanish
```
