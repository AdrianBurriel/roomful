# Roomful

🇬🇧 [English](README.md) · 🇪🇸 **Español**

**Convierte cualquier web en una sala llena de gente.** Cada página es una sala: los visitantes ven los cursores de los demás en tiempo real, al estilo multijugador de Figma, cada uno con un nombre divertido ("Capibara Zen", "Ajolote Ninja"…). Desde una píldora en la esquina, su puerta a la sala, pueden ver quién hay, chatear junto al cursor, reaccionar con emojis, saludar, seguir a otra persona y elegir cómo aparecen. Una guía gris puede enseñárselo todo a quien llega por primera vez.

🔴 **Demo en directo:** [roomful-sand.vercel.app](https://roomful-sand.vercel.app/?lang=es). Ábrela en dos navegadores distintos (o en el móvil y el ordenador) y mira cómo se encuentran vuestros cursores. Las pestañas del mismo navegador cuentan como tú, así que no se ven entre sí.

- **Un solo script** (`roomful.js`), sin dependencias (con Ably, carga el SDK de Ably desde su CDN).
- **Servidor mínimo** (`server.py`) escrito solo con la librería estándar de Python, o con Docker. O sin servidor: **Vercel + Ably**.
- **Pensado para reutilizar** en futuros proyectos: una línea para integrarlo, opciones para todo y una API para conectarlo con tu interfaz.
- **Inglés y español** incluidos, con selector de idioma y la opción de añadir más.

📖 **Documentación completa:** [`docs/DOCUMENTACION.md`](docs/DOCUMENTACION.md)

---

## Inicio rápido

Requisito: Python 3.8 o superior.

```bash
git clone https://github.com/AdrianBurriel/roomful.git
cd roomful
python3 server.py            # → http://localhost:8080
```

Abre `http://localhost:8080` y, para verte desde fuera, ábrelo también **en otro navegador o en otro dispositivo de tu red** (`http://<tu-ip-local>:8080`). Las pestañas del mismo navegador se reconocen como la misma persona.

La demo es una landing que explica cada parte de la píldora, con demos que funcionan de verdad y 2 visitantes ficticios para que nunca esté vacía (marcados como **BOT**; uno se queda siempre). Un **tour guiado** de 12 pasos se ofrece en la primera visita y está siempre disponible desde el botón de arriba. Está en inglés por defecto, con un selector **EN | ES** en la barra superior.

## Qué incluye

| | |
|---|---|
| 🖱️ **Cursores en vivo** | Movimiento suavizado, nombre y foto en la etiqueta, una sala por página. El tuyo se ve igual: una flecha de tu color con tu nombre |
| 👥 **Personas** | Quién está, su estado (activo, escribiendo, ausente) y estadísticas en directo |
| 🧭 **Seguir** | Tu página se mueve con la de otra persona para ver lo mismo que ella |
| 💬 **Chat** | Mensajes que aparecen junto a tu cursor, letra a letra (`/`); la caja crece con el texto, hasta 4 líneas |
| 🎉 **Reacciones** | Emojis que flotan desde tu cursor (`E`) |
| 👋 **Saludo** | Agita el cursor rápido de lado a lado y saludas a la sala |
| ✨ **Clics y selección** | Los demás ven tus clics como ondas y el texto que seleccionas |
| 🙂 **Perfil** | Nombre, color y foto propios, que se guardan solos al cambiarlos y se recuerdan entre visitas |
| 👻 **Modo fantasma** | Deja de ver cursores y de compartir el tuyo |
| 😴 **Reposo** | Los cursores quietos se atenúan con unas "zzz" animadas |
| 📱 **Móvil y tablet** | Tu dedo es tu cursor; chat y reacciones desde los botones de la píldora |
| 🤖 **Bots opcionales** | Visitantes de compañía, marcados con la etiqueta **BOT**. Se retiran cuando llega gente real, pero siempre se queda uno |
| 🗺️ **Tour guiado** | Una guía gris vuela a cada parte de la página y la explica paso a paso, avanzando sola (`tour`) |
| 🌍 **Idiomas** | Inglés (por defecto) y español; añade los tuyos con `strings` |
| ♿ **Accesible** | Manejable con teclado, etiquetas ARIA, modo oscuro y reducir movimiento |

## La píldora

```
 ┌──────────────────────────────────────────┐
 │ (◐◐◐) 4 aquí │  💬   😊  │  (Tú) ▾        │
 └──────────────────────────────────────────┘
    Personas      Chat Reacc.  Tu perfil
```

| Parte | Qué hace | Atajo |
|---|---|---|
| **Personas** | Lista de quién está, con su estado, las cifras (en esta página, en la web, pico de hoy) y un botón **Seguir** | — |
| **Chat** | Escribir junto a tu cursor (hasta 4 líneas); `Enter` lo deja unos segundos, `Esc` lo borra | `/` |
| **Reacciones** | Emojis que flotan desde tu cursor | `E` |
| **Tu perfil** | Nombre, color, foto y 🎲 al azar, que se guardan solos al cambiarlos (sin botón Guardar), y el interruptor de **modo fantasma** | — |

En el ordenador cada botón muestra un tooltip con su atajo; en móvil y tablet se usan los botones 💬 y 🙂. La primera visita trae un aviso de bienvenida que además ofrece el tour guiado (si la web tiene uno).

Sin tocar la píldora: agita el cursor rápido de lado a lado para saludar 👋 a la sala.

## Integrarlo en otro proyecto

1. Copia `public/roomful.js` a tu web.
2. Despliega `server.py`, o usa Vercel + Ably y pasa `ably: { authUrl: "/api/ably-token" }` en lugar de `url` (mira [Desplegar](#desplegar)).
3. Añade antes de `</body>`:

```html
<script src="/roomful.js"></script>
<script>
  const mc = Roomful.init({
    url: "wss://cursores.midominio.com/ws",   // tu servidor
    lang: "es",                                // "en" | "es" | "auto"
    bots: 2,                                   // opcional: compañía cuando la página está vacía
    onStats: s => console.log(s.page + " personas aquí")
  });
</script>
```

En **React / Next.js**, llámalo dentro de un `useEffect` en el layout raíz y devuelve `() => mc.destroy()`.

### Opciones principales

| Opción | Por defecto | Para qué |
|---|---|---|
| `url` | `ws(s)://<host>/ws` | Dirección del servidor |
| `ably` | — | Usa Ably en lugar de `server.py`, para hostings *serverless* como Vercel: `{ authUrl: "/api/ably-token" }` |
| `room` | ruta de la página | Sala; `"global"` para compartirla en toda la web |
| `lang` | `"en"` | Idioma de la interfaz: `"en"`, `"es"` o `"auto"` |
| `strings` | — | Textos propios o idiomas nuevos |
| `bots` | `0` | Visitantes ficticios (máx. 12), marcados como **BOT** |
| `botsMin` | `1` | Bots que se quedan haya la gente que haya |
| `chat`, `reactions`, `clicks`, `selection`, `follow` | activadas | Activar o desactivar cada función |
| `editable` | `true` | Dejar que el visitante edite nombre, color y foto (se guardan solos) |
| `selfCursor` | `true` | Tu propio puntero con tu color y tu nombre al lado |
| `wave` | `true` | Agitar el cursor para saludar 👋 (`false`, u otro emoji) |
| `name`, `color`, `avatar` | aleatorios | Identidad fija o inicial |
| `onStats` | — | Recibir `{ page, site, peak }` para usarlas en tu interfaz |
| `onboarding` | `true` | Aviso de bienvenida en la primera visita |
| `tour` | — | Tour guiado: `{ steps: [...] }`, ofrecido en la primera visita |

Todas las opciones (30) están en la [documentación](docs/DOCUMENTACION.md#5-opciones-de-roomfulinit).

### API

```js
mc.open("people" | "profile" | "chat" | "reactions");  // abrir una parte de la píldora
mc.close();
mc.setLang("en");                                        // cambiar de idioma al momento
mc.react("🎉");
mc.setIdentity("Capibara Jefa", "#A259FF");
mc.setGhost(true);
mc.setRoom("/otra-sala");
mc.follow(id); mc.unfollow();
mc.startTour(); mc.stopTour();                           // tour guiado (sigue donde se dejó)
mc.me; mc.peers; mc.room; mc.ghost; mc.stats; mc.lang; mc.tour;
mc.destroy();
```

## Desplegar

Dos vías: en tu propio servidor con `server.py`, o en Vercel con Ably y sin servidor.

### En tu propio servidor

`server.py` funciona en cualquier sitio con Python o Docker (Render, Fly.io, Railway, un VPS…), **en una sola instancia**:

```bash
docker build -t roomful .
docker run -d -p 8080:8080 -e ALLOWED_ORIGINS=https://midominio.com roomful
```

| Variable | Para qué | Por defecto |
|---|---|---|
| `ALLOWED_ORIGINS` | Dominios que pueden conectarse (**ponlo en producción**) | cualquiera |
| `MAX_PER_ROOM` / `MAX_CLIENTS` | Límites de usuarios por sala / en total | 100 / 5000 |
| `STATIC_DIR` | Carpeta de estáticos (`""` = solo WebSocket) | `./public` |
| `PORT` / `HOST` | Puerto e interfaz | 8080 / 0.0.0.0 |

El servidor valida cada campo (incluidas las fotos: nunca SVG), limita los mensajes a 40 por segundo por cliente, cierra conexiones muertas y ofrece `GET /health`. En producción, usa HTTPS y `wss://`. La guía completa de despliegue, con la configuración de nginx y una lista de comprobación, está en la [documentación](docs/DOCUMENTACION.md#10-despliegue-en-producción).

### Desplegar en Vercel

Vercel sirve la web, y [Ably](https://ably.com) lleva el tráfico en tiempo real en lugar de `server.py` (Vercel no mantiene WebSockets abiertos). Una pequeña función, [`api/ably-token.js`](api/ably-token.js), reparte tokens de Ably para que tu clave secreta nunca llegue al navegador.

1. Crea una cuenta gratuita en [Ably](https://ably.com), crea una app y copia su **API key** (la que tiene *publish*, *subscribe* y *presence*).
2. En [Vercel](https://vercel.com), **Add New → Project** e importa este repositorio de GitHub. Deja los valores por defecto: [`vercel.json`](vercel.json) ya indica qué publicar.
3. Antes de desplegar, añade la variable de entorno `ABLY_API_KEY` con esa clave y pulsa **Deploy**.
4. Ya está: por defecto la función solo entrega tokens a las páginas de la propia web. Pon `ALLOWED_ORIGINS` solo si otras webs (o un dominio propio en otro hosting) también deben conectarse.

Cada push a `main` se despliega solo. La landing usa Ably cuando está publicada y `server.py` en `localhost`. El plan gratuito de Ably da de sobra para una demo (consulta sus límites actuales en tu panel de Ably); un cursor en movimiento envía hasta 10 mensajes por segundo.

## Limitaciones conocidas

- **Sin autenticación:** cualquiera que pueda abrir la página entra en su sala (con `server.py`, cualquiera con la URL del WebSocket). No sirve para salas privadas tal cual.
- **`server.py` es un solo proceso con todo en memoria:** no se puede repartir entre varias instancias sin añadir un canal compartido (p. ej. Redis), y las estadísticas se pierden al reiniciar.
- **El perfil es por navegador:** en otro navegador o dispositivo se empieza de cero.
- **Los bots son locales:** cada visitante ve los suyos (y siempre se queda al menos uno, salvo con `botsMin: 0`). La guía del tour también es local.
- **Tu puntero de color** y el **saludo** necesitan ratón; en pantallas táctiles tu dedo es el cursor y se saluda con las reacciones.
- **Con Ably,** el "pico de hoy" es el máximo que ha visto cada visitante, no un récord del servidor, y cada mensaje cuenta en tu plan de Ably.
- **La selección compartida** requiere que todos tengan el mismo contenido en la página.
- **Sin tests automáticos:** las comprobaciones se han hecho a mano y con clientes WebSocket de prueba.

## Estructura

```
public/roomful.js       La integración (cliente)
public/index.html       Landing de demo que explica la píldora, con un tour guiado de 12 pasos (EN/ES)
server.py               Relay WebSocket + estáticos + /health
Dockerfile              Imagen de despliegue
api/ably-token.js       Función de Vercel que entrega tokens de Ably
vercel.json             Configuración de Vercel (publica public/)
package.json            Dependencias de la función de Vercel
docs/DOCUMENTATION.md   Documentación completa (inglés)
docs/DOCUMENTACION.md   Documentación completa (español)
```
