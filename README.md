# Cursores colaborativos (estilo Figma)

Cada visitante de la web tiene un cursor con un nombre aleatorio ("Capibara Zen", "Ajolote Ninja"…) y ve en tiempo real por dónde se mueven los demás.

## Probarlo

```bash
python3 server.py          # → http://localhost:8080
```

Ábrelo en varias pestañas, o desde el móvil de al lado con `http://<tu-ip-local>:8080`.

## Estructura

| Fichero | Qué es |
|---|---|
| `public/multicursor.js` | **La integración.** Un solo script sin dependencias que reutilizas en cualquier web |
| `server.py` | Relay WebSocket y servidor estático. Solo usa la librería estándar de Python |
| `public/index.html` | Web de demo: un wireframe en lorem ipsum |

## Usarlo en otro proyecto

```html
<script src="/multicursor.js"></script>
<script>
  const mc = MultiCursor.init({
    // url: "wss://mi-servidor.com/ws",  // si el WebSocket vive en otro dominio
    // name: "Capibara Jefa",            // nombre fijo (si no se indica, es aleatorio)
    // color: "#A259FF",
    // presence: true,                   // avatares de quién está conectado
    // chat: true,                       // tecla "/" para escribir junto al cursor
    // anchor: "center",                 // "center" (layouts con max-width) o "left"
    // bots: 2,                          // usuarios ficticios para que nunca se vea vacía
    // botChat: true,                    // los bots escriben mensajes de vez en cuando
    // botTargets: "a, button, h2",      // elementos hacia los que se mueven
    // botPhrases: ["Hola 👋", "..."],   // frases del chat de los bots
  });
  // mc.me.name, mc.peers, mc.destroy()
</script>
```

## Protocolo

El protocolo es pequeño, así que es fácil portarlo a Node, Cloudflare Durable Objects, PartyKit, Supabase Realtime, etc.

- cliente → servidor: `{ t:"update", name?, color?, x?, y?, visible?, chat? }`
- servidor → cliente: `{ t:"welcome", id, peers:[...] }`, `{ t:"update", id, ...campos }`, `{ t:"leave", id }`

Las coordenadas son `x` = píxeles desde el centro del documento e `y` = píxeles desde arriba del todo de la página. Así los cursores encajan entre pantallas de distinto ancho y se desplazan con el scroll.
