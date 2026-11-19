# Documentación completa · Roomful

🇬🇧 [English](DOCUMENTATION.md) · 🇪🇸 **Español**

Referencia técnica de Roomful: la integración `roomful.js`, que convierte cada página en una sala, y el servidor `server.py`, que la mantiene llena. Para una introducción rápida, mira el [README](../README.es.md).

## Índice

1. [Qué es y cómo funciona](#1-qué-es-y-cómo-funciona)
2. [Requisitos](#2-requisitos)
3. [Puesta en marcha en local](#3-puesta-en-marcha-en-local)
4. [Integrarlo en un proyecto](#4-integrarlo-en-un-proyecto)
5. [Opciones de `Roomful.init()`](#5-opciones-de-roomfulinit)
6. [API del objeto devuelto](#6-api-del-objeto-devuelto)
7. [La píldora y los atajos de teclado](#7-la-píldora-y-los-atajos-de-teclado)
8. [Comportamientos en detalle](#8-comportamientos-en-detalle)
9. [El servidor](#9-el-servidor)
10. [Despliegue en producción](#10-despliegue-en-producción)
11. [Protocolo WebSocket](#11-protocolo-websocket)
12. [Seguridad y privacidad](#12-seguridad-y-privacidad)
13. [Rendimiento, límites y escalado](#13-rendimiento-límites-y-escalado)
14. [Accesibilidad](#14-accesibilidad)
15. [Personalización avanzada](#15-personalización-avanzada)
16. [Solución de problemas](#16-solución-de-problemas)
17. [Estructura del repositorio](#17-estructura-del-repositorio)

---

## 1. Qué es y cómo funciona

Roomful convierte cada página de una web en una **sala**. Todos los que están en la misma página están en la misma sala y ven en tiempo real los cursores de los demás, al estilo del espacio multijugador de Figma. Cada cursor lleva un nombre aleatorio ("Capibara Zen", "Ajolote Ninja"…). Abajo a la derecha, una **píldora**, la puerta a la sala, muestra quién hay y permite chatear, reaccionar, seguir a otra persona y editar tu perfil.

Son dos piezas:

```
 Navegador A                          Servidor (server.py)                    Navegador B
┌──────────────────┐   WebSocket    ┌──────────────────────────┐  WebSocket ┌──────────────────┐
│ roomful.js   │ ─────────────▶ │ Relay por salas          │ ─────────▶ │ roomful.js   │
│ · envía su estado│ ◀───────────── │ · valida cada campo      │ ◀───────── │ · pinta cursores │
│ · pinta cursores │                │ · guarda el último estado│            │ · píldora        │
│ · píldora        │                │ · reenvía al resto       │            │                  │
└──────────────────┘                │ · estadísticas, límites  │            └──────────────────┘
                                    └──────────────────────────┘
```

- **`public/roomful.js`** (cliente): un único script sin dependencias. Inyecta sus propios estilos (todas las clases empiezan por `mc-`), envía tu posición y tu estado, y dibuja los cursores de los demás y la píldora.
- **`server.py`** (servidor): un relay WebSocket escrito solo con la librería estándar de Python. No tiene lógica de negocio. Agrupa a los clientes por sala, valida lo que recibe, guarda el último estado de cada uno para quien llegue después y lo reenvía al resto. También puede servir ficheros estáticos.

No hay base de datos. Todo vive en la memoria del servidor y en el navegador de cada visitante.

## 2. Requisitos

| Pieza | Requisito |
|---|---|
| Servidor | Python **3.8 o superior**, sin paquetes externos. También funciona con Docker (`python:3.12-slim`). |
| Navegador | Navegadores modernos de escritorio y móvil. Usa WebSocket, `localStorage`, Canvas (para las fotos) y CSS moderno (`overflow-x: clip`, `:focus-visible`, `aspect-ratio`). Probado en Chrome. |
| Producción | HTTPS en la web y `wss://` en el WebSocket. La mayoría de hostings lo dan hecho. |

## 3. Puesta en marcha en local

```bash
git clone https://github.com/AdrianBurriel/roomful.git
cd roomful
python3 server.py                 # → http://localhost:8080
```

- Abre `http://localhost:8080` en **varias pestañas** o en **otro dispositivo de tu red** (`http://<tu-ip-local>:8080`) para ver los cursores. Tus propias pestañas no se muestran entre sí (ver [§8.3](#83-identidad-y-tus-otras-pestañas)), así que para ver tu cursor desde "fuera" usa otro navegador, una ventana privada u otro dispositivo.
- Otro puerto: `PORT=3000 python3 server.py`.
- Para pararlo, pulsa `Ctrl+C`.
- Comprobar que está vivo: `curl http://localhost:8080/health` → `{"ok": true, "clients": 0, "rooms": 0}`.

La demo (`public/index.html`) es una landing que explica la píldora, con demos que funcionan de verdad, arranca con 2 bots y tiene un tour guiado de 12 pasos (se ofrece en la primera visita y siempre está disponible desde el botón de arriba). Está en **inglés por defecto** y tiene un selector **EN | ES** en la barra superior (también vale `?lang=es` en la URL); la elección se recuerda.

## 4. Integrarlo en un proyecto

### 4.1 Web estática o con servidor propio

1. Copia `public/roomful.js` a tu proyecto (o sírvelo desde el servidor de cursores, ver [§10.3](#103-servir-el-script)).
2. Despliega `server.py` (ver [§10](#10-despliegue-en-producción)).
3. Añade antes de `</body>`:

```html
<script src="/roomful.js"></script>
<script>
  const mc = Roomful.init({
    url: "wss://cursores.midominio.com/ws"
  });
</script>
```

Si el servidor de cursores sirve también tu web (como en la demo), puedes omitir `url`: por defecto se conecta a `ws(s)://<mismo host>/ws`.

### 4.2 React / Next.js

```jsx
import { useEffect } from "react";

export function Cursores() {
  useEffect(() => {
    // roomful.js cargado con <Script src="/roomful.js" strategy="afterInteractive" />
    const mc = window.Roomful.init({ url: process.env.NEXT_PUBLIC_CURSORES_WS });
    return () => mc.destroy();   // imprescindible: evita duplicados al desmontar o en StrictMode
  }, []);
  return null;
}
```

- Monta el componente **una sola vez**, en el layout raíz.
- Con `room` sin indicar, las salas siguen la ruta automáticamente al navegar: el script comprueba `location.pathname` cada segundo, así que no hace falta llamar a `setRoom()` en cada cambio de página.
- En Next.js el script toca `window` y `document`: cárgalo solo en el cliente.

### 4.3 Vue / otros frameworks

La misma idea: `init()` al montar el componente raíz y `destroy()` al desmontarlo.

### 4.4 Una sala para toda la web

```js
Roomful.init({ url: "...", room: "global" });
```

Así todos se ven entre sí aunque estén en páginas distintas. Úsalo solo si las páginas comparten diseño: las posiciones se pintan sobre la página de cada uno.

## 5. Opciones de `Roomful.init()`

Todas son opcionales. Los nombres anteriores siguen funcionando: `MultiCursor.init()` es un alias de `Roomful.init()`, y `/multicursor.js` sirve el mismo script que `/roomful.js`.

| Opción | Tipo | Por defecto | Descripción |
|---|---|---|---|
| `url` | string | `ws(s)://<host>/ws` | URL del WebSocket. Puede llevar query (`?token=…`); el script añade `&room=`. |
| `ably` | object | — | Usa [Ably](https://ably.com) en lugar de `server.py`, para hostings *serverless* como Vercel: `{ authUrl, prefix, sdk }`. Mira el [§10.6](#106-vercel--ably-sin-servidor). |
| `room` | string | ruta de la página | Sala (máx. 128 caracteres). Sin indicar, una sala por URL (sin barra final) que sigue los cambios de ruta. |
| `lang` | `"en"` \| `"es"` \| `"auto"` | `"en"` | Idioma de la interfaz. `"auto"` usa el del navegador. Ver [§8.12](#812-idiomas). |
| `strings` | objeto | — | Textos propios o idiomas nuevos: `{ en: { clave: "…" }, fr: { … } }`. |
| `name` | string | aleatorio | Nombre fijo. **Desactiva la edición del perfil** (`editable` pasa a `false`). |
| `color` | `#RRGGBB` | aleatorio | Color inicial (el visitante puede cambiarlo si `editable`). |
| `avatar` | data URL | — | Foto inicial: PNG, JPEG o WebP en base64, de 14 000 caracteres como máximo. |
| `presence` | boolean | `true` | Muestra la píldora. Con `false` solo hay cursores (y `onStats`). |
| `onboarding` | boolean | `true` | Aviso de bienvenida la primera vez (aparece a los 1,5 s y no vuelve a salir). |
| `toggle` | boolean | `true` | Interruptor de "modo fantasma" en el panel de perfil. |
| `chat` | boolean | `true` | Chat junto al cursor (botón 💬 y tecla `/`). |
| `reactions` | array \| `false` | `["❤️","👍","🔥","😂","🎉","👏","😮","👀"]` | Emojis disponibles (se usan los 9 primeros). `false` las desactiva. |
| `clicks` | boolean | `true` | Muestra los clics de los demás como ondas de su color. |
| `selection` | boolean | `true` | Muestra el texto que seleccionan los demás. |
| `follow` | boolean | `true` | Botón "Seguir" en el panel de personas. |
| `editable` | boolean | `true` | Permite editar nombre, color y foto. Cada cambio se guarda solo (no hay botón Guardar). Es `false` si se pasa `name`. |
| `selfCursor` | boolean | `true` | Tu propio puntero se ve como el de los demás: una flecha de tu color con tu etiqueta de nombre. Solo con ratón; el modo fantasma devuelve el puntero normal. |
| `wave` | boolean \| emoji | `true` | Agitar el cursor rápido de lado a lado envía una reacción 👋. `false` lo desactiva; un texto usa otro emoji. |
| `onStats` | función | — | `({ page, site, peak }) => …` cada vez que cambian las cifras (ver [§8.9](#89-estadísticas)). |
| `anchor` | `"center"` \| `"left"` | `"center"` | Referencia horizontal de las coordenadas (ver [§8.10](#810-coordenadas)). |
| `maxCursors` | número | `12` | Máximo de cursores visibles a la vez. |
| `idleMs` | número (ms) | `30000` | Tiempo sin actividad para considerar a alguien ausente (cursor atenuado + "zzz"). |
| `bots` | número | `0` | Usuarios ficticios (máx. 12). Ver [§8.8](#88-bots). |
| `botsRetireAt` | número | `= bots` (mín. 1) | Los bots se retiran cuando hay al menos este número de personas reales. |
| `botsMin` | número | `1` | Bots que no se retiran nunca, haya la gente que haya. `0` deja que se vayan todos. |
| `botChat` | boolean | `true` | Los bots escriben mensajes de vez en cuando. |
| `botTargets` | selector CSS | enlaces, botones, títulos, imágenes… | Elementos hacia los que se mueven los bots. Admite `[data-mc-target]`. |
| `botPhrases` | array \| objeto | frases según idioma | Frases del chat de los bots: un array, o `{ en: [...], es: [...] }` para que sigan el idioma. |
| `tour` | objeto | — | Tour guiado: `{ steps, name?, offer? }`. Una guía gris enseña la página al visitante. Ver [§8.13](#813-tour-guiado). |

## 6. API del objeto devuelto

```js
const mc = Roomful.init({ ... });
```

| Miembro | Tipo | Descripción |
|---|---|---|
| `mc.me` | objeto | `{ name, color, avatar }` del visitante (se actualiza al editar). |
| `mc.peers` | objeto | Mapa `id → peer` de los demás (incluye bots). Solo lectura. |
| `mc.room` | getter | Sala actual. |
| `mc.ghost` | getter | `true` si está en modo fantasma. |
| `mc.lang` | getter | Idioma actual de la interfaz. |
| `mc.stats` | getter | `{ page, site, peak }` en este momento. |
| `mc.setRoom(room)` | función | Cambia de sala manualmente (reconecta). Desde ese momento deja de seguir la ruta de la página de forma automática. |
| `mc.setGhost(bool)` | función | Activa o desactiva el modo fantasma (se recuerda). |
| `mc.setLang(lang)` | función | Cambia el idioma de la píldora, los paneles y los nombres aleatorios al momento. |
| `mc.setIdentity(name, color, avatar?)` | función | Cambia la identidad y la guarda. `avatar`: data URL, `""` para quitarla, `undefined` para no tocarla. Devuelve `false` si no cambia nada. |
| `mc.open(part)` | función | Abre `"people"`, `"profile"`, `"chat"` o `"reactions"`. Si está en modo fantasma, lo desactiva (salvo para `"profile"`). |
| `mc.close()` | función | Cierra paneles y el selector de emojis. |
| `mc.react(emoji)` | función | Lanza una reacción desde tu cursor (máximo una cada 250 ms). |
| `mc.follow(id)` / `mc.unfollow()` | función | Empieza o deja de seguir a otra persona. No se puede seguir a uno mismo. |
| `mc.startTour(step?)` / `mc.stopTour()` | función | Lanza el tour guiado (sin `step`, donde lo dejó el visitante) o lo cierra. |
| `mc.tour` | objeto | `{ active, step, total, saved }`: si el tour está en marcha, el paso actual, cuántos hay y el paso recordado. |
| `mc.destroy()` | función | Desconecta, quita todos los elementos y listeners. Úsalo al desmontar. |

Además, `Roomful.languages` lista los idiomas incluidos (`["en", "es"]`).

## 7. La píldora y los atajos de teclado

```
 ┌──────────────────────────────────────────┐
 │ (◐◐◐) 4 aquí │  💬   😊  │  (Tú) ▾        │
 └──────────────────────────────────────────┘
    Personas      Chat Reacc.  Tu perfil
```

| Parte | Qué hace |
|---|---|
| **Personas** | Caras de hasta 3 personas + "N aquí" ("Solo tú" si no hay nadie). Abre un panel con las cifras (en esta página, en toda la web, pico de hoy) y la lista de personas con su estado (**Activo**, **Escribiendo…**, **Ausente**) y un botón **Seguir**. Tu fila tiene **Editar**. |
| **Chat 💬** | Abre un campo de texto junto a tu cursor. Se oculta en pantallas táctiles (no hay cursor). |
| **Reacciones 😊** | Abre el selector de emojis encima de la píldora. |
| **Tu perfil ▾** | Foto (subir, cambiar o quitar), nombre, color, 🎲 Al azar (nombre y color) y el interruptor **Modo fantasma**. No hay botón Guardar: color, foto y dado se aplican al momento, el nombre tras una breve pausa al escribir (o con `Enter` / al salir del campo), y "✓ Guardado" lo confirma. |

Estados especiales:

- **Siguiendo a alguien:** un marco de su color rodea la pantalla, con el botón "Siguiendo a X · Dejar de seguir ✕" arriba.
- **Modo fantasma:** la píldora se reduce a "Cursores ocultos · **Mostrar**".
- **Primera visita:** aviso "👋 No estás solo en esta página" con **Entendido**. Se marca como visto al pulsarlo o al abrir cualquier panel.

### Atajos

| Tecla | Acción |
|---|---|
| `/` | Abrir el chat junto al cursor |
| `Enter` (en el chat) | Enviar; el mensaje se queda 4 s y desaparece |
| `Esc` (en el chat) | Borrar el mensaje y cerrar |
| `E` | Abrir/cerrar el selector de emojis junto al cursor |
| Agitar el ratón de lado a lado | Saludar 👋 a la sala |
| `1`–`9` (con el selector abierto) | Lanzar ese emoji (atajo oculto) |
| `Esc` | Cerrar paneles y selector; dejar de seguir |
| Rueda, `↑` `↓` `RePág` `AvPág` `Inicio` `Fin` `Espacio`, deslizar en una pantalla táctil | Dejar de seguir (recuperas el control del scroll) |

Los atajos no se activan mientras escribes en un campo de texto de la página.

### En móvil y tablet

- **Tu dedo es tu cursor:** al tocar o deslizar la página, tu cursor se coloca ahí y viaja con el contenido al hacer scroll, así los demás ven por dónde vas leyendo. Tocar la píldora o sus paneles no lo mueve.
- **Chat:** el botón 💬 abre el campo de mensaje abajo, encima del teclado; los demás ven tu mensaje junto a tu cursor.
- **Reacciones:** el botón 🙂.
- **Seguir** se detiene al deslizar para hacer scroll; un simple toque no lo corta.
- El aviso de bienvenida y los textos de ayuda hablan de botones en vez de atajos de teclado.

## 8. Comportamientos en detalle

### 8.1 Salas

La sala es el corazón de Roomful: ves los cursores, mensajes y reacciones de quienes están en tu misma sala.

- Por defecto, la sala es `location.pathname` sin barra final (`/precios/` → `/precios`). La query y el hash no cuentan.
- En SPAs se detecta el cambio de ruta (comprobación cada segundo) y se reconecta a la nueva sala.
- El servidor limita el nombre a 128 caracteres y usa `/` si viene vacío.

### 8.2 Conexión y reconexión

- Al conectar se envía nombre, color, foto, id de navegador, posición y selección.
- Si se cae, reintenta con espera exponencial: 0,5 s, 1 s, 2 s… hasta un máximo de 15 s, con ±20 % de variación para no saturar el servidor tras un reinicio.
- En modo fantasma no hay conexión.

### 8.3 Identidad y tus otras pestañas

- **Nombre y color aleatorios** se generan por pestaña (`sessionStorage`): cada pestaña nueva recibe uno distinto **hasta que el visitante cambia algo de su perfil** (se guarda solo). Desde ese momento, se usa el guardado en todas las pestañas y visitas (`localStorage`).
- El nombre aleatorio se guarda como "animal + adjetivo" (dos índices), así que se muestra en el idioma activo y se traduce al cambiarlo: "Zen Capybara" ↔ "Capibara Zen". Un nombre guardado por el visitante no se traduce nunca.
- **Id de navegador** (`mc:uid`): 20 caracteres aleatorios, compartidos por todas las pestañas del mismo navegador y dominio. Sirve para que tus otras pestañas no aparezcan como otra persona: no salen en la píldora, no se pueden seguir y no se dibuja su cursor ni sus clics, reacciones o selecciones.
- Si una pestaña no envía id (por ejemplo, tiene cargada una versión antigua del script), se considera "tú" si tiene tu mismo nombre y color.

### 8.4 Qué se guarda en el navegador

| Clave | Dónde | Contenido |
|---|---|---|
| `mc:me` | `sessionStorage` | Identidad aleatoria de la pestaña, con sus índices de nombre (`gen`), si no hay perfil guardado. |
| `mc:me` | `localStorage` | Perfil guardado: `{ name, color, avatar }`. |
| `mc:uid` | `localStorage` | Id anónimo del navegador. |
| `mc:ghost` | `localStorage` | `true` si el modo fantasma está activo. |
| `mc:onboarded` | `localStorage` | `true` cuando ya se vio el aviso de bienvenida. |
| `mc:tour` | `localStorage` | Paso en el que el visitante dejó el tour guiado (se borra al terminarlo). |

Todo es por **navegador y dominio**: en otro navegador, otro dispositivo, una ventana privada o con `www.` y sin `www.` se empieza de cero. Si el navegador bloquea el almacenamiento, el script sigue funcionando sin recordar nada.

### 8.5 Foto de perfil

- El visitante elige una imagen desde su ordenador. Se **recorta en cuadrado por el centro** y se **reduce en el navegador**: prueba 96, 72 y 56 px, en WebP y luego en JPEG, con calidades decrecientes, hasta que ocupa ≤ 14 000 caracteres (~2–10 KB).
- Las imágenes transparentes reciben fondo blanco.
- Se muestra en la píldora, en el panel de personas y en la etiqueta del cursor, y la reciben también quienes entren después.

### 8.6 Chat, clics, reacciones y selección

| Función | Detalle |
|---|---|
| Chat | La caja crece con el texto: primero a lo ancho hasta 216 px y luego a lo alto hasta 4 líneas; cuando está llena no deja escribir más (máx. 140 caracteres en cualquier caso). `Enter` envía, así que no hay saltos de línea. Se envía mientras escribes (los demás lo ven letra a letra). |
| Clics | Se envía cada clic izquierdo fuera de la píldora (máx. uno cada 120 ms). Los demás ven una onda de tu color. Tú no ves la tuya. |
| Reacciones | Tres emojis que suben y se desvanecen desde tu cursor (máx. una cada 250 ms). |
| Saludo | Cuatro cambios de dirección (trazos de ≥ 40 px) en menos de 0,9 s envían una reacción 👋; como mucho una cada 2,5 s. Viaja como una reacción normal, así que el servidor no necesita cambios. |
| Tu cursor | Con ratón, tu puntero pasa a ser la misma flecha que ven los demás, en tu color (un cursor CSS, sin retraso), con tu etiqueta de nombre al lado. Los enlaces, los campos de texto y los elementos con su propio `cursor` conservan el suyo. |
| Selección | Se comparte **qué texto** está seleccionado (ruta de nodos DOM + posición), no píxeles. Cada navegador lo resalta sobre su propio diseño, así que encaja aunque el texto ocupe líneas distintas. Se ignoran las selecciones dentro de campos de texto y `contenteditable`. Si el DOM de la página no coincide entre visitantes, simplemente no se pinta. |

### 8.7 Reposo y límite de cursores

- Tras `idleMs` (30 s) sin moverse, el cursor se atenúa, le salen "zzz" animadas y en el panel pasa a **Ausente**. También sale como "Ausente" quien tiene la pestaña en segundo plano o el ratón fuera de la ventana.
- Si hay más de `maxCursors` cursores visibles, se ocultan los sobrantes con esta prioridad: personas reales antes que bots, activos antes que ausentes, y los más recientes primero. A quien sigues nunca se le oculta.

### 8.8 Bots

Los habituales de la sala: visitantes ficticios para que ninguna sala parezca vacía.

- Son **locales**: cada visitante ve los suyos y no viajan por el servidor.
- Se mueven en curvas suaves hacia elementos reales de la página (`botTargets`) y hacen pequeñas pausas.
- **Se turnan para no molestar:** cada bot alterna entre "de visita" en tu pantalla (7–16 s) y "a lo suyo" fuera de ella (12–30 s). Normalmente solo hay uno de visita.
- Hablan como mucho una vez por visita, en la mitad de las visitas aproximadamente, y nunca dos a la vez. A veces hacen clic (22 % al llegar) o reaccionan (5 %), y en un 40 % de sus visitas saludan 👋 al llegar.
- **Van marcados:** una pequeña etiqueta **BOT** en su cursor y en el panel de personas, para que nadie los confunda con gente real.
- **Se retiran** cuando hay `botsRetireAt` personas reales y vuelven si la sala se vacía. `botsMin` de ellos (1 por defecto) se quedan siempre.
- No aparecen si el visitante tiene activado *reducir movimiento* (`prefers-reduced-motion`).
- Cuentan en las cifras de la píldora (ver [§8.9](#89-estadísticas)).

### 8.9 Estadísticas

| Cifra | Cálculo |
|---|---|
| `page` | Tú + personas reales en la sala (sin tus otras pestañas) + bots activos. |
| `site` | Conexiones en todo el servidor + bots activos (nunca menos que `page`). |
| `peak` | Pico de conexiones simultáneas de hoy en esta sala (según el reloj del servidor) + bots (nunca menos que `page`). |

El servidor envía sus cifras al entrar y luego cada 3 s **solo si cambian**. El pico se guarda en memoria: se pierde al reiniciar el servidor. En modo fantasma, las tres valen 0.

### 8.10 Coordenadas

- `x` = píxeles desde el **centro** del documento (con `anchor: "left"`, desde el borde izquierdo).
- `y` = píxeles desde **arriba del todo** de la página (no de la pantalla).

Así, en diseños centrados con ancho máximo (lo habitual), un cursor sobre un botón aparece sobre ese mismo botón en pantallas de distinto ancho, y los cursores se desplazan con el scroll. En diseños que cambian mucho entre móvil y escritorio, la posición es aproximada. Los cursores nunca generan scroll horizontal: se recortan al ancho de la ventana.

### 8.11 Modo fantasma

Al activarlo se **cierra la conexión**: no ves cursores y nadie te ve, ni siquiera en la lista de personas. La preferencia se recuerda. Al desactivarlo se reconecta.

### 8.12 Idiomas

- Incluye **inglés** (por defecto) y **español**. Con `lang: "auto"` se usa el idioma del navegador, o inglés si no está disponible.
- `mc.setLang("es")` traduce al momento la píldora, los paneles abiertos, los avisos, los tooltips y los **nombres aleatorios**: el tuyo (si no lo has guardado) y los de los bots. Si tu nombre cambia, los demás lo ven actualizado.
- Cada visitante ve la interfaz en su idioma. Los nombres que se ven son los que envía cada persona.
- **Textos propios o idiomas nuevos** con `strings`. Las claves están en el diccionario `I18N` al principio de `roomful.js`; si falta una clave, se usa la versión en inglés.

```js
Roomful.init({
  lang: "fr",
  strings: { fr: { seeWho: "Voir qui est là", chatTip: "Écrire à côté de ton curseur", saved: "✓ Enregistré" /* … */ } }
});
```

Los nombres aleatorios y las frases de los bots de un idioma nuevo usan los del inglés, salvo que pases `botPhrases` con ese idioma.

### 8.13 Tour guiado

Con la opción `tour`, una **guía** enseña la página al visitante. Es un bot en **gris** (ningún color de visitante es gris, así que nadie se le parece) con la etiqueta **GUÍA**.

- En cada paso **desplaza la página** hasta el elemento, **vuela** con su cursor hasta él, escribe una frase corta en su bocadillo y lo **resalta** (el resto de la página se oscurece un poco). Una tarjeta abajo a la izquierda (una hoja inferior en el móvil) explica el paso en detalle.
- **Avanza sola** cuando ha dado tiempo a leerlo (~220 palabras por minuto, mínimo 8 s por paso), con una barra de progreso. La tarjeta tiene **Atrás**, **Pausar** / **Seguir**, **Siguiente** (**Terminar** en el último) y **✕** para cerrar; con teclado, `←` `→` y `Esc`.
- Los pasos con `wave: true` hacen que la guía salude 👋 al llegar.
- **Primera visita:** el aviso de bienvenida ofrece **▶ Haz el tour** (salvo con `offer: false`). Después, se lanza desde tu propia interfaz con `mc.startTour()`.
- **Se recuerda el progreso** (`mc:tour`): `mc.startTour()` sigue donde lo dejó el visitante; `mc.startTour(0)` empieza de cero. Al terminarlo se olvida el progreso.
- Mientras tanto, los demás bots se apartan y no hablan. La guía es local (nadie más la ve), no cuenta en las cifras ni sale en la lista de personas. Activar el modo fantasma cierra el tour.
- Cambiar el idioma con `mc.setLang()` vuelve a mostrar el paso actual en el nuevo idioma.
- Con *reducir movimiento*, la guía salta en lugar de volar y la página no se desplaza con suavidad.

```js
Roomful.init({
  tour: {
    name: { en: "Capybara", es: "Capibara" },        // nombre de la guía
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

Cada texto puede ser una cadena o `{ en, es, … }`. `text` es HTML: dentro, `<span class="mc-kb">…</span>` solo se muestra con ratón y teclado, y `<span class="mc-tch">…</span>` solo en pantallas táctiles, para que cada dispositivo reciba las instrucciones correctas. La landing (`public/index.html`) tiene un tour completo de 12 pasos como ejemplo.

## 9. El servidor

### 9.1 Variables de entorno

| Variable | Para qué | Por defecto |
|---|---|---|
| `PORT` | Puerto | `8080` |
| `HOST` | Interfaz | `0.0.0.0` |
| `ALLOWED_ORIGINS` | Dominios que pueden conectarse, separados por comas, con protocolo (`https://midominio.com,https://www.midominio.com`). Vacío = cualquiera. **Ponlo en producción.** | vacío |
| `MAX_PER_ROOM` | Máximo de usuarios por sala (al pasarse, responde 503) | `100` |
| `MAX_CLIENTS` | Máximo de conexiones en total (al pasarse, responde 503) | `5000` |
| `STATIC_DIR` | Carpeta de ficheros estáticos. `""` para servir solo el WebSocket y `/health` | `./public` |

### 9.2 Rutas

| Ruta | Respuesta |
|---|---|
| `GET /ws?room=<sala>` con `Upgrade: websocket` | Conexión WebSocket. 403 si el `Origin` no está permitido, 503 si se supera un límite. |
| `GET /health` | `200 {"ok": true, "clients": N, "rooms": M}` |
| `GET` / `HEAD` cualquier otra | Fichero de `STATIC_DIR` (`/` → `index.html`). 404 si no existe o intenta salir de la carpeta. |
| Otros métodos | 405 |

### 9.3 Límites internos (constantes en `server.py`)

| Constante | Valor | Efecto |
|---|---|---|
| `MAX_FRAME` | 16 KB | Un mensaje más grande cierra la conexión. |
| `RATE_PER_SEC` / `RATE_BURST` | 40 / 80 | Mensajes por segundo por cliente; el exceso se descarta en silencio. |
| `PING_EVERY` | 20 s | Ping a cada cliente. |
| `DEAD_AFTER` | 60 s | Sin recibir nada en ese tiempo, se cierra la conexión. |
| `STATS_EVERY` | 3 s | Frecuencia de revisión de estadísticas. |

### 9.4 Validación de campos

El servidor solo reenvía campos conocidos y válidos; el resto se descarta.

| Campo | Regla |
|---|---|
| `name` | Texto de 1 a 32 caracteres |
| `color` | `#RRGGBB` |
| `avatar` | `""` o `data:image/(png\|jpeg\|webp);base64,…` de ≤ 14 000 caracteres (nunca SVG) |
| `uid` | 8–32 caracteres `[a-z0-9]` |
| `x`, `y` | Números (no booleanos), `|x| < 10⁶`, `|y| < 10⁷` |
| `visible` | Booleano |
| `chat` | Texto de hasta 140 caracteres |
| `sel` | `null` o `{a, ao, f, fo}`: rutas de ≤ 64 índices enteros y offsets enteros |
| evento `kind` | `"click"` o `"reaction"` |
| evento `emoji` | 1–8 caracteres sin letras, números, espacios ni `< > & " '` |

Un cliente no se anuncia al resto hasta que envía un `name` válido.

## 10. Despliegue en producción

### 10.1 Docker

```bash
docker build -t cursores .
docker run -d -p 8080:8080 \
  -e ALLOWED_ORIGINS=https://midominio.com,https://www.midominio.com \
  --restart unless-stopped cursores
```

La imagen incluye un `HEALTHCHECK` contra `/health`.

### 10.2 Hostings (Render, Fly.io, Railway…)

- **Tipo de servicio:** web service con Docker (usa el `Dockerfile`) o con Python (comando `python3 server.py`).
- **Puerto:** la mayoría inyectan `PORT`, y el servidor lo respeta.
- **Health check:** `/health`.
- **WebSockets:** deben estar permitidos (en estos tres lo están por defecto).
- **Instancias:** usa **una sola instancia** (ver [§13](#13-rendimiento-límites-y-escalado)).

### 10.3 Servir el script

Hay dos opciones:
- **Copiar `roomful.js` a tu web** (recomendado): lo versionas con tu proyecto. En ese caso arranca el servidor con `STATIC_DIR=""` y quedará solo el WebSocket.
- **Servirlo desde el servidor de cursores:** `<script src="https://cursores.midominio.com/roomful.js">`. Ten en cuenta que se sirve con `Cache-Control: no-cache`.

### 10.4 Detrás de nginx

```nginx
location /ws {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header Origin $http_origin;
    proxy_read_timeout 120s;   # > PING_EVERY, para que nginx no corte conexiones sanas
}
```

### 10.5 Lista de comprobación

- [ ] La web va por HTTPS y `url` usa `wss://` (un `ws://` desde una página HTTPS lo bloquea el navegador).
- [ ] `ALLOWED_ORIGINS` contiene exactamente los dominios de la web, con `https://` y sin barra final.
- [ ] Una sola instancia del servidor.
- [ ] `/health` responde.
- [ ] Probado con dos navegadores distintos (no dos pestañas del mismo).

### 10.6 Vercel + Ably (sin servidor)

Los hostings *serverless* como Vercel no mantienen WebSockets abiertos, así que `server.py` no puede ejecutarse ahí. En su lugar, pasa la opción `ably` y el script habla el mismo protocolo sobre canales de [Ably](https://ably.com):

```js
Roomful.init({ ably: { authUrl: "/api/ably-token" } });
```

- **Canales:** uno por sala (`roomful:room:<sala>`) más `roomful:site` para contar a la gente de toda la web. `prefix` cambia `roomful`.
- **La presencia** dice quién hay en cada sala; cuando alguien entra, todos reenvían su estado para que el recién llegado pueda dibujarlos.
- **Validación:** no hay servidor en medio, así que el script aplica a cada mensaje que recibe las mismas reglas que `server.py` (§9.4) y descarta lo que no las cumpla.
- **Tokens:** `api/ably-token.js` (una función de Vercel) firma las peticiones de token con `ABLY_API_KEY`. Los tokens van ligados al id de la conexión, duran una hora y solo permiten los canales `roomful:*`. Solo las páginas de la propia web reciben tokens, salvo que `ALLOWED_ORIGINS` indique otras webs.
- **Ritmo:** las posiciones se envían como mucho cada 100 ms (en vez de 40 ms) para que el plan dure más.
- **Diferencias con `server.py`:** el pico del día es el máximo que ha visto este visitante, no un récord de todo el servidor; `MAX_PER_ROOM`/`MAX_CLIENTS` dejan paso a los límites de tu plan de Ably.

Los pasos de configuración están en el [README](../README.es.md#desplegar-en-vercel).

## 11. Protocolo WebSocket

Mensajes JSON por texto. Conexión: `GET /ws?room=<sala>`.

### Cliente → servidor

```jsonc
// Estado (se guarda y lo reciben también quienes entren después). Todos los campos son opcionales.
{ "t": "update", "name": "Capibara Zen", "color": "#A259FF", "avatar": "data:image/webp;base64,…",
  "uid": "k3j9x0…", "x": -120, "y": 840, "visible": true, "chat": "hola", "sel": null }

// Evento efímero (se reenvía, no se guarda)
{ "t": "event", "kind": "click", "x": 10, "y": 400 }
{ "t": "event", "kind": "reaction", "emoji": "🔥", "x": 10, "y": 400 }
```

### Servidor → cliente

```jsonc
{ "t": "welcome", "id": 7, "room": "/precios", "peers": [ { "id": 3, "name": "…", "color": "…", "x": 0, "y": 0, … } ] }
{ "t": "update", "id": 3, "x": 15, "y": 420 }             // solo los campos que cambian
{ "t": "update", "id": 3, "name": "…", "color": "…", … }  // estado completo la primera vez que alguien se presenta
{ "t": "leave", "id": 3 }
{ "t": "event", "id": 3, "kind": "reaction", "emoji": "🔥", "x": 10, "y": 400 }
{ "t": "stats", "room": 4, "site": 12, "peak": 6 }
```

Orden al conectar: `welcome` → `stats`. El protocolo es pequeño: se puede portar a Node (`ws`), Cloudflare Durable Objects, PartyKit, etc. manteniendo estos mensajes y las validaciones de [§9.4](#94-validación-de-campos).

## 12. Seguridad y privacidad

- **Sin autenticación:** cualquiera que conozca la URL del WebSocket puede entrar en cualquier sala. No lo uses para salas privadas sin añadir antes un token en la `url` y validarlo en el servidor.
- **`ALLOWED_ORIGINS`** impide que otras webs usen tu servidor desde el navegador (no frena a un script que falsifique la cabecera `Origin`).
- **Validación estricta** de cada campo ([§9.4](#94-validación-de-campos)): las fotos solo pueden ser imágenes rasterizadas pequeñas, los "emojis" no pueden ser texto y los colores solo pueden ser hexadecimales.
- **Sin HTML de usuarios:** nombres, mensajes y emojis se insertan como texto (`textContent`), nunca como HTML.
- **Lo que ven los demás:** nombre, color, foto, posición del cursor, mensajes de chat, clics, reacciones y qué texto seleccionas, siempre dentro de la misma sala. El panel de perfil avisa de que la foto la verán quienes estén en la página.
- **Lo que no se guarda:** el servidor no escribe nada en disco; todo está en memoria y desaparece al desconectar o reiniciar.
- **Modo fantasma:** desconecta del todo.
- **Id de navegador:** es aleatorio y no está ligado a ningún dato personal.

## 13. Rendimiento, límites y escalado

| Aspecto | Valor |
|---|---|
| Envío de posición | Máx. ~25 por segundo por visitante (cada 40 ms) |
| Animación | Un único `requestAnimationFrame` con suavizado; solo corre si hay algo moviéndose (o bots) |
| Panel y píldora | Se redibujan solo cuando cambia algo visible |
| Selección | Máx. 120 rectángulos por persona |
| Nombre / chat / foto | 32 caracteres / 140 caracteres / 14 000 caracteres |
| Emojis / bots | 9 / 12 como máximo |

**Escalado:** el servidor es **un solo proceso** con todo en memoria. Con varias instancias, cada una tendría su propia lista de personas y no se verían entre ellas. Si en algún momento hace falta escalar más allá de una máquina, hay que añadir un canal compartido entre instancias (por ejemplo Redis pub/sub) o portar el relay a un servicio pensado para ello (Durable Objects, PartyKit). Para una web normal, un proceso con los límites por defecto (100 por sala, 5000 en total) sobra.

## 14. Accesibilidad

- Todos los controles son `<button>` con `aria-label`; la píldora es un `toolbar`, los paneles son `dialog`, el modo fantasma es un `switch` y "Seguir" usa `aria-pressed`.
- Se puede usar entero con teclado. El foco visible es un contorno azul y los tooltips también aparecen con el foco.
- `aria-keyshortcuts` en los botones con atajo.
- Con `prefers-reduced-motion`: sin bots, sin ondas de clic, reacciones más cortas y "zzz" estáticas.
- Modo oscuro automático (`prefers-color-scheme`).

## 15. Personalización avanzada

- **Estilos:** todas las clases empiezan por `mc-` (`.mc-presence`, `.mc-pop`, `.mc-cursor`, `.mc-tag`…). Puedes sobrescribirlas desde tu CSS con más especificidad. La capa de cursores usa `z-index: 2147483000` y la píldora está por encima.
- **Constantes** al principio de `roomful.js`:

| Constante | Valor | Qué controla |
|---|---|---|
| `I18N` | diccionario | Textos, animales, adjetivos, orden del nombre y frases de bots de cada idioma |
| `COLORS` | 12 colores | Paleta de cursores y del editor |
| `REACTIONS` | 8 emojis | Emojis por defecto |
| `BOT_TARGETS` | selector | Elementos hacia los que van los bots por defecto |
| `BOT_HERE_MS` / `BOT_AWAY_MS` | 7–16 s / 12–30 s | Ritmo de visitas de los bots |
| `SEND_EVERY_MS` | 40 | Frecuencia de envío de posición |
| `LERP` | 0.28 | Suavizado de cursores (1 = sin suavizado) |
| `CHAT_LINGER_MS` | 4000 | Tiempo que se queda un mensaje tras Enter |

- **Textos e idiomas:** todo texto visible pasa por el diccionario `I18N`; usa la opción `strings` para cambiarlos sin tocar el script (ver [§8.12](#812-idiomas)).

## 16. Solución de problemas

| Síntoma | Causa probable y solución |
|---|---|
| No veo a nadie | ¿Estáis en la misma URL? (salas por página). ¿Son pestañas del mismo navegador? Entonces se reconocen como "tú": prueba con otro navegador o dispositivo. |
| Conexión rechazada (403) | El dominio no está en `ALLOWED_ORIGINS`. Revisa el protocolo (`https://`) y quita la barra final. |
| Conexión rechazada (503) | Se ha superado `MAX_PER_ROOM` o `MAX_CLIENTS`. |
| Funciona en local pero no en producción | Usa `wss://` si la web va por HTTPS; revisa que el proxy reenvíe `Upgrade`/`Connection` ([§10.4](#104-detrás-de-nginx)). |
| Me veo a mí mismo en la lista | Esa pestaña tiene cargada una versión antigua del script: recárgala. |
| Al recargar tengo otro nombre | No has tocado tu perfil: los aleatorios son por pestaña. Abre "Tu perfil" y cambia cualquier cosa (se guarda solo). |
| Los bots no aparecen | Ya hay suficiente gente real (`botsRetireAt`), el visitante tiene *reducir movimiento* activado o `bots` es 0. |
| La selección de otro no se resalta | El DOM de su página no coincide con el tuyo (contenido personalizado o dinámico). Es esperado. |
| "No se ha podido usar esa imagen" | Formato no soportado por el navegador (p. ej. HEIC en algunos) o imagen dañada. Prueba con JPG o PNG. |
| `address already in use` al arrancar | Ya hay algo en ese puerto: `lsof -i :8080` para verlo, o usa `PORT=3000`. |
| Paneles duplicados en React | Falta `return () => mc.destroy()` en el `useEffect`. |

## 17. Estructura del repositorio

```
roomful/
├── public/
│   ├── roomful.js     # La integración (cliente)
│   └── index.html         # Landing de demo que explica la píldora, con tour guiado (EN/ES)
├── server.py              # Relay WebSocket + estáticos + /health
├── Dockerfile             # Imagen de despliegue
├── docs/
│   ├── DOCUMENTATION.md   # Documentación completa (inglés)
│   └── DOCUMENTACION.md   # Este documento (español)
├── README.md              # Inglés
└── README.es.md           # Español
```
