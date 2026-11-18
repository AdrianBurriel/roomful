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
    // reactions: ["❤️","👍","🔥"],      // tecla "E" (o botón 😊) para reaccionar; false = desactivar
    // clicks: true,                     // ver los clics de los demás como ondas
    // selection: true,                  // ver el texto que seleccionan los demás
    // follow: true,                     // pulsar un avatar para seguir a esa persona
    // editable: true,                   // pulsar tu avatar para cambiar nombre y color
    // onStats: s => console.log(s),     // { page, site, peak } cada vez que cambian
    // anchor: "center",                 // "center" (layouts con max-width) o "left"
    // maxCursors: 12,                   // máximo visibles (prioriza personas reales y activas)
    // idleMs: 30000,                    // tras 30 s quieto, el cursor se atenúa
    // bots: 2,                          // usuarios ficticios para que nunca se vea vacía
    // botsRetireAt: 2,                  // los bots se van cuando hay N personas reales
    // botChat: true,                    // los bots escriben mensajes de vez en cuando
    // botTargets: "a, button, h2",      // elementos hacia los que se mueven
    // botPhrases: ["Hola 👋", "..."],   // frases del chat de los bots
  });
  // mc.me, mc.peers, mc.room, mc.ghost, mc.stats
  // mc.setRoom("/otra-sala"), mc.setGhost(true), mc.setIdentity("Nombre", "#0D99FF"),
  // mc.react("🎉"), mc.follow(id), mc.unfollow(), mc.destroy()
</script>
```

### Qué puede hacer el visitante

| Acción | Cómo |
|---|---|
| Chat junto al cursor | Tecla `/`, luego Enter para enviar o Esc para cancelar |
| Reaccionar con emoji | Tecla `E` y después un número del 1 al 8 (o clic); en el móvil, botón 😊 de la píldora |
| Seguir a alguien | Clic en su avatar; se deja de seguir con Esc, la rueda del ratón o las flechas |
| Cambiar nombre y color | Clic en tu avatar; se recuerda entre visitas |
| Ver estadísticas | Clic en "N en esta página": personas en la página, en toda la web y pico de hoy |
| Ocultar cursores | Botón 👁 de la píldora |

Además, los demás ven tus **clics** como una onda de tu color y el **texto que seleccionas** resaltado con tu color. Si llevas 30 s sin moverte, tu cursor se atenúa y muestra 💤.

La selección se comparte como *qué texto* está seleccionado y no como píxeles. Así encaja aunque el texto se reparta en líneas distintas en cada pantalla. Requiere que el DOM de la página sea el mismo para todos, lo normal en una misma URL.

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
- cliente → servidor:
  - `{ t:"update", name?, color?, x?, y?, visible?, chat?, sel? }`: estado; se guarda y lo reciben también quienes entren después
  - `{ t:"event", kind:"click"|"reaction", x, y, emoji? }`: evento efímero
- servidor → cliente:
  - `{ t:"welcome", id, room, peers:[...] }`, `{ t:"update", id, ...campos }`, `{ t:"leave", id }`
  - `{ t:"event", id, kind, x, y, emoji? }`
  - `{ t:"stats", room, site, peak }`: cada 3 s, solo si cambian

Las coordenadas son `x` = píxeles desde el centro del documento e `y` = píxeles desde arriba del todo de la página. Así los cursores encajan entre pantallas de distinto ancho y se desplazan con el scroll.
