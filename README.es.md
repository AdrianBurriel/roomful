# Roomful

🇬🇧 [English](README.md) · 🇪🇸 **Español**

**Convierte cualquier web en una sala llena de gente.** Cada página es una sala: los visitantes ven los cursores de los demás en tiempo real, al estilo multijugador de Figma, cada uno con un nombre divertido ("Capibara Zen", "Ajolote Ninja"…). Desde una píldora en la esquina, su puerta a la sala, pueden ver quién hay, chatear junto al cursor, reaccionar con emojis, seguir a otra persona y elegir cómo aparecen.

- **Un solo script** (`multicursor.js`), sin dependencias.
- **Servidor mínimo** (`server.py`) escrito solo con la librería estándar de Python, o con Docker.
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

La demo es una landing que explica cada parte de la píldora, con demos que funcionan de verdad y 2 visitantes ficticios para que nunca esté vacía. Está en inglés por defecto, con un selector **EN | ES** en la barra superior.

## Qué incluye

| | |
|---|---|
| 🖱️ **Cursores en vivo** | Movimiento suavizado, nombre y foto en la etiqueta, una sala por página |
| 👥 **Personas** | Quién está, su estado (activo, escribiendo, ausente) y estadísticas en directo |
| 🧭 **Seguir** | Tu página se mueve con la de otra persona para ver lo mismo que ella |
| 💬 **Chat** | Mensajes que aparecen junto a tu cursor, letra a letra (`/`) |
| 🎉 **Reacciones** | Emojis que flotan desde tu cursor (`E`) |
| ✨ **Clics y selección** | Los demás ven tus clics como ondas y el texto que seleccionas |
| 🙂 **Perfil** | Nombre, color y foto propios, recordados entre visitas |
| 👻 **Modo fantasma** | Deja de ver cursores y de compartir el tuyo |
| 😴 **Reposo** | Los cursores quietos se atenúan con unas "zzz" animadas |
| 🤖 **Bots opcionales** | Visitantes de compañía que se retiran cuando llega gente real |
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
| **Chat** | Escribir junto a tu cursor; `Enter` lo deja unos segundos, `Esc` lo borra | `/` |
| **Reacciones** | Emojis que flotan desde tu cursor | `E` |
| **Tu perfil** | Nombre, color, foto, 🎲 al azar y el interruptor de **modo fantasma** | — |

Cada botón muestra un tooltip con su atajo, y la primera visita trae un aviso de bienvenida.

## Integrarlo en otro proyecto

1. Copia `public/multicursor.js` a tu web.
2. Despliega `server.py` (abajo).
3. Añade antes de `</body>`:

```html
<script src="/multicursor.js"></script>
<script>
  const mc = MultiCursor.init({
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
| `room` | ruta de la página | Sala; `"global"` para compartirla en toda la web |
| `lang` | `"en"` | Idioma de la interfaz: `"en"`, `"es"` o `"auto"` |
| `strings` | — | Textos propios o idiomas nuevos |
| `bots` | `0` | Visitantes ficticios (máx. 12) |
| `chat`, `reactions`, `clicks`, `selection`, `follow` | activadas | Activar o desactivar cada función |
| `editable` | `true` | Dejar que el visitante edite nombre, color y foto |
| `name`, `color`, `avatar` | aleatorios | Identidad fija o inicial |
| `onStats` | — | Recibir `{ page, site, peak }` para usarlas en tu interfaz |
| `onboarding` | `true` | Aviso de bienvenida en la primera visita |

Todas las opciones (25) están en la [documentación](docs/DOCUMENTACION.md#5-opciones-de-multicursorinit).

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
mc.me; mc.peers; mc.room; mc.ghost; mc.stats; mc.lang;
mc.destroy();
```

## Desplegar el servidor

Funciona en cualquier sitio con Python o Docker (Render, Fly.io, Railway, un VPS…), **en una sola instancia**:

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

### Desplegar en Render

El repo incluye un Blueprint, [`render.yaml`](render.yaml), que publica todo (landing + servidor WebSocket) como un único servicio web gratuito:

1. Entra en [Render](https://render.com) con tu cuenta de GitHub.
2. **New → Blueprint**, elige este repositorio y pulsa **Apply**.
3. Espera a la primera compilación (un par de minutos). Tu web estará en `https://roomful-XXXX.onrender.com`.
4. Opcional, pero recomendable: en **Environment** del servicio, pon esa URL en `ALLOWED_ORIGINS`.

Cada push a `main` se despliega solo. En el plan gratuito el servicio se duerme tras 15 minutos sin visitas y el primero que llega espera unos 50 segundos a que despierte.

## Limitaciones conocidas

- **Sin autenticación:** cualquiera con la URL del WebSocket puede entrar en una sala. No sirve para salas privadas tal cual.
- **Un solo proceso y todo en memoria:** no se puede repartir entre varias instancias sin añadir un canal compartido (p. ej. Redis), y las estadísticas se pierden al reiniciar.
- **El perfil es por navegador:** en otro navegador o dispositivo se empieza de cero.
- **Los bots son locales:** cada visitante ve los suyos.
- **La selección compartida** requiere que todos tengan el mismo contenido en la página.
- **Sin tests automáticos:** las comprobaciones se han hecho a mano y con clientes WebSocket de prueba.

## Estructura

```
public/multicursor.js   La integración (cliente)
public/index.html       Landing de demo que explica la píldora (EN/ES)
server.py               Relay WebSocket + estáticos + /health
Dockerfile              Imagen de despliegue
render.yaml             Blueprint de Render (despliegue en un clic)
docs/DOCUMENTATION.md   Documentación completa (inglés)
docs/DOCUMENTACION.md   Documentación completa (español)
```
