# Cursores colaborativos (estilo Figma)

Cada visitante de la web tiene un cursor con un nombre aleatorio ("Capibara Zen", "Ajolote Ninja"…) y ve en tiempo real por dónde se mueven los demás que están en la misma página.

## Probarlo

```bash
python3 server.py          # → http://localhost:8080
```

Ábrelo en varias pestañas, o desde el móvil de al lado con `http://<tu-ip-local>:8080`.

## Estructura

| Fichero | Qué es |
|---|---|
| `public/multicursor.js` | **La integración.** Un solo script sin dependencias que reutilizas en cualquier web |
| `server.py` | Relay WebSocket con salas y servidor estático. Solo usa la librería estándar de Python |
| `Dockerfile` | Para desplegar el servidor en cualquier hosting que acepte contenedores |
| `public/index.html` | Web de demo: un wireframe en lorem ipsum |

## Usarlo en otro proyecto

1. Copia `public/multicursor.js` a tu web.
2. Despliega el servidor (ver más abajo).
3. Añade a la web:

```html
<script src="/multicursor.js"></script>
<script>
  const mc = MultiCursor.init({
    url: "wss://cursores.midominio.com/ws",
    // room: "global",                   // por defecto, una sala por URL (sigue la ruta en SPAs)
    // name: "Capibara Jefa",            // nombre fijo (si no se indica, es aleatorio)
    // color: "#A259FF",
    // presence: true,                   // píldora con los avatares conectados
    // toggle: true,                     // botón 👁 para ocultar cursores / dejar de compartir el tuyo
    // chat: true,                       // tecla "/" para escribir junto al cursor
    // anchor: "center",                 // "center" (layouts con max-width) o "left"
    // maxCursors: 12,                   // máximo visibles (prioriza personas reales y activas)
    // idleMs: 30000,                    // tras 30 s quieto, el cursor se atenúa
    // bots: 2,                          // usuarios ficticios para que nunca se vea vacía
    // botsRetireAt: 2,                  // los bots se van cuando hay N personas reales
    // botChat: true,                    // los bots escriben mensajes de vez en cuando
    // botTargets: "a, button, h2",      // elementos hacia los que se mueven
    // botPhrases: ["Hola 👋", "..."],   // frases del chat de los bots
  });
  // mc.me, mc.peers, mc.room, mc.ghost
  // mc.setRoom("/otra-sala"), mc.setGhost(true), mc.destroy()
</script>
```

### Comportamiento por defecto

- **Salas por página:** solo ves a quien está en tu misma URL. En SPAs (React, Next, Vue…) detecta solo los cambios de ruta. Para compartir sala en toda la web, usa `room: "global"`.
- **Modo fantasma:** con el botón 👁 de la píldora dejas de ver cursores y de compartir el tuyo. Desconecta del todo, así que los demás tampoco te ven en la presencia. La preferencia se recuerda.
- **Límite de cursores:** con mucha gente se muestran como máximo `maxCursors`, primero las personas reales y las más activas. Los inactivos se atenúan.
- **Bots:** se retiran solos cuando ya hay gente real y vuelven si la página se vacía. No aparecen si el usuario tiene activado `prefers-reduced-motion`.
- **React / Next:** llama a `init()` dentro de un `useEffect` y devuelve `() => mc.destroy()` como limpieza.

## Desplegar el servidor

Funciona en cualquier sitio que ejecute Python o Docker (Render, Fly.io, Railway, un VPS…):

```bash
docker build -t cursores . && docker run -p 8080:8080 \
  -e ALLOWED_ORIGINS=https://midominio.com,https://www.midominio.com cursores
```

| Variable | Para qué | Por defecto |
|---|---|---|
| `ALLOWED_ORIGINS` | Dominios que pueden conectarse (¡ponlo en producción!) | cualquiera |
| `MAX_PER_ROOM` | Máximo de usuarios por sala | 100 |
| `MAX_CLIENTS` | Máximo de conexiones en total | 5000 |
| `STATIC_DIR` | Carpeta de estáticos; `""` para servir solo el WebSocket | `./public` |
| `PORT` / `HOST` | Puerto e interfaz | 8080 / 0.0.0.0 |

Además, el servidor:
- **Limita los mensajes:** como máximo 40 por segundo por cliente, con ráfagas de hasta 80.
- **Cierra conexiones muertas:** envía un ping cada 20 s y cierra las que llevan 60 s sin responder.
- **Ofrece un endpoint de estado:** `GET /health` devuelve el número de clientes y salas.

En producción, pon el servidor detrás de HTTPS (lo hacen solos la mayoría de hostings) y usa `wss://`.

## Protocolo

El protocolo es pequeño, así que es fácil portarlo a Node, Cloudflare Durable Objects, PartyKit, etc.

- Conexión: `GET /ws?room=<sala>`
- cliente → servidor: `{ t:"update", name?, color?, x?, y?, visible?, chat? }`
- servidor → cliente: `{ t:"welcome", id, room, peers:[...] }`, `{ t:"update", id, ...campos }`, `{ t:"leave", id }`

Las coordenadas son `x` = píxeles desde el centro del documento e `y` = píxeles desde arriba del todo de la página. Así los cursores encajan entre pantallas de distinto ancho y se desplazan con el scroll.
