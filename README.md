# ⚽ Golazo Park — fútbol arcade 3D

Fútbol de 1 contra 1 hasta 4 contra 4 en una **arena con paredes**, que se juega en el navegador, en PC o en el móvil.
Controlas a **un solo jugador** en tercera persona; tus compañeros los maneja la PC (o tus amigos en línea) y cada equipo tiene un portero de la PC.
Usa el mismo estilo que [Remate Park](https://github.com/AlejandroEspinoPerez/Volleyball), [Jonrón Park](https://github.com/AlejandroEspinoPerez/Baseball-Game) y [Derrape Park](https://github.com/AlejandroEspinoPerez/Carreras-Game): jugadores chibi con contorno, materiales toon y estadios hechos con primitivas de three.js.

**Jugar:** https://alejandroespinoperez.github.io/Futbol-Game/

## Modos

- **Partido contra la PC**: elige tu club y el rival (8 clubes), jugadores por equipo (1 a 4, más el portero), duración (2, 3 o 5 min), dificultad, estadio y si un empate se define con **gol de oro**.
- **En línea (hasta 8 personas)**: 🌐 Crear sala y compartir el código, el link o el QR; los amigos entran con 🔗 Unirme y eligen equipo. Pueden jugar todos contra todos o juntos contra la PC; la PC completa los equipos. Si alguien se desconecta, la PC maneja a su jugador; si vuelve, lo recupera.
- **Copa Golazo**: cuartos, semifinal y final contra clubes cada vez más fuertes (la final es más difícil).
- **Entrenar**: 6 lecciones cortas que se completan jugando (moverse, pasar, tirar, regatear, robar y rematar de primera).
- **Tu jugador**: nombre, número, club, piel, pelo, botines, accesorio, celebración de gol, estilo de juego (delantero, mediocampista, defensa, extremo veloz) y estela del tiro. Se desbloquea más al subir de nivel.
- **Retos diarios** (3 por día) y **14 logros**.

## Estadios

| | Estadio | Cómo es |
|---|---|---|
| 🏟️ | Estadio Central | Pasto de día, grada llena |
| 🏖️ | Playa Sol | Arena al atardecer: el balón bota menos y frena más |
| 🌃 | Arena Neón | De noche en la ciudad |
| ❄️ | Valle Nevado | Nieve: los jugadores resbalan |

## Cómo se juega

- No hay faltas ni fuera de juego, y el balón nunca sale: rebota en las vallas y el cristal.
- **Tiro**: el balón va hacia donde apuntas. Un toque corto es un tiro colocado; mantener carga un cañonazo que sube y es menos preciso.
- **Remate de primera**: si el balón viene por el aire, pulsa TIRAR justo antes de que llegue: cabezazo, volea o, de espaldas al arco, ¡chilena! Con PASE la devuelves de primera.
- **Pase**: toque = raso al compañero hacia donde apuntas; mantener = pase elevado. Sin balón, PASE pide la pelota ("¡Pásala!") o hace una entrada si el rival está cerca.
- **Regate**: con balón esquiva barridas y entradas si lo haces a tiempo. **Barrida**: sin balón llega lejos y tumba al rival, pero si fallas te quedas en el suelo.
- **Sprint** con una barra de aguante. Los goles tienen repetición en cámara lenta.

## Controles

| | PC | Móvil | Mando |
|---|---|---|---|
| Moverse | WASD / flechas | Joystick | Palanca |
| Tirar (mantén para cargar) | J / clic izquierdo | TIRAR | B |
| Pase (mantén = elevado) | K / clic derecho | PASE | A |
| Regate · barrida | L / Espacio | REGATE / BARRIDA | X |
| Sprint | Shift | SPRINT | Gatillos |
| ¡Pásala! | E | (PASE sin balón) | LB |
| Cámara · pausa | C · Esc | 🎥 · II | Y · Start |

Hay tres cámaras: **Equipo** (detrás de ti mirando al arco rival), **Detrás** (pegada a tu jugador, siguiendo el balón) y **TV**.

## Archivos

- `index.html`: pantallas, HUD y estilos.
- `game.js`: todo el juego (render, estadios, jugadores animados, física del balón, IA, controles, modo en línea, narrador y sonido sintetizado). Usa three.js desde jsDelivr y PeerJS (con relevo MQTT de respaldo) para jugar en línea; no hay que instalar nada.

Para probarlo en local hace falta un servidor (los módulos ES no cargan con `file://`), por ejemplo:

```bash
npx http-server .
```

Con `?touch=1` en la URL se fuerza la interfaz táctil, y con `?relevo` el invitado entra por el servidor de relevo. En la consola, `window.__GP.ff(segundos)` adelanta la simulación, `__GP.tick(n)` avanza cuadros completos (sirve con la pestaña oculta) y `__GP.give()` te da el balón.
