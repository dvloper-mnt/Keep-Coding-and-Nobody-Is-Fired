# Backlog explorado — ideas post-hackathon

Análisis rápido de qué más se le podría agregar al juego, con costo (esfuerzo)
y valor (impacto en video / valor para el jurado / valor de producto). Ordenado
por costo/beneficio.

Verificado antes de escribir: **todos los specs de `.kiro/specs/` están
implementados** al día de este documento. No hay pickups "gratis" desde ahí.

---

## Fast wins (bajo costo, alto impacto para el video)

### 1. Cutscene de entrada al jefe

Cuando se dispara una ronda de jefe (múltiplo de 10 en modo infinito), congelar
la pantalla ~1s con un banner tipo *"⚠ El jefe entró al Slack"* + un sonido
grave y un breve fade. Aprovecha lo que ya existe (`RoundModifierBanner`),
suma dramatismo real para el video del jurado.

- **Costo:** 30-45 min. Un keyframe CSS + una modal simple + un audio.
- **Impacto:** alto — momento cinemático fácil de destacar.
- **Riesgo:** cero. Solo UI.

### 2. SFX de victoria y derrota

El juego tiene sonidos de tecla (correct/wrong/tick) pero nada al game over.
Un jingle corto de 8-bit para victoria (~2s) y un sting de derrota (~1.5s)
mueven mucho la percepción de "producto terminado".

- **Costo:** 30-45 min. Búsqueda de assets libres (freesound.org / zapsplat) +
  wire en `useCoderGame` / `useHelperGame` al cambio de status.
- **Impacto:** alto — el video se escucha "producto".
- **Riesgo:** bajo. Cuidar loudness normalization.

### 3. Meta tags para Twitter/X card

El endpoint `/api/game/share-card` genera una PNG OG. Verificar que las meta
tags de `og:image` / `twitter:card` en el `layout.tsx` apunten a esa URL con
los params correctos, para que el link del juego en X/LinkedIn muestre la
tarjeta previa automáticamente.

- **Costo:** 20 min.
- **Impacto:** medio-alto — hace que compartir en redes se vea profesional.
- **Riesgo:** bajo. Solo meta tags.

### 4. Tooltip / leyenda de "por qué esta pista cuesta"

Ahora los botones "🔒 Revelar (−5s)" no explican POR QUÉ. Un tooltip de una
línea del tipo *"Preguntar antes de mirar es mejor cooperación"* justifica
la mecánica. Cero riesgo, transmite intención de diseño al jurado.

- **Costo:** 15 min.
- **Impacto:** medio. Educativo.
- **Riesgo:** cero.

---

## Medio plazo (post-video)

### 5. Modo tutorial / onboarding guiado

El juego es asimétrico y sin explicación explícita. Un primer flow con dos
pestañas guiadas ("clic acá primero, ahora hablás vos") elimina fricción de
primera vez. Aumenta la conversión de curiosos → jugadores.

- **Costo:** 2-3 h. Componente Overlay + narrativa por paso + persistencia
  local del "ya vi el tutorial".
- **Impacto:** alto para adopción real; medio para el video (el jurado va a
  ver a devs jugando, no a alguien que necesita el tutorial).
- **Riesgo:** medio. Requiere playtesting con no-devs.

### 6. Logros / achievements

*"Primera racha ×3"*, *"Sobreviviste al primer jefe"*, *"10 rondas seguidas"*.
Persistidos en localStorage o en el token de Coder. Aumentan replay value.

- **Costo:** 3-4 h. Definir catálogo, wire en game-engine (puro), UI de
  notificación de logro desbloqueado, persistencia.
- **Impacto:** medio-alto para retención.
- **Riesgo:** bajo (cero riesgo de romper existente si la lógica es aditiva).

### 7. Cuenta regresiva visible al streak break

Cuando se rompe una racha alta (5+, 7+), animar el multiplicador cayendo
*×3 → ×1* con impacto visual. Ya existe la lógica; falta el drama.

- **Costo:** 30-45 min.
- **Impacto:** medio.
- **Riesgo:** cero.

---

## Larga cola (v2+)

Estos son ideas grandes que no tienen sentido tocar antes del video, pero
valdría discutir para después.

### 8. Modo solo (bot Helper via Bedrock)

El Coder juega solo; un "Helper IA" responde por chat usando el mismo Bedrock.
Elimina la fricción de necesitar dos personas.

- **Costo:** ~6-8 h. Nueva ruta, prompt del Helper-bot, UI de chat.
- **Impacto:** alto para adopción, pero cambia la esencia cooperativa —
  cuidado con canibalizar el mensaje principal del juego.

### 9. Multi-idioma (i18n)

Hoy la UI es solo español. Agregar EN abre a hackathons/audiencias
internacionales. Los challenges del juego ya soportan 8 lenguajes de
programación — el idioma UI es lo que falta.

- **Costo:** 4-6 h. Extraer todos los strings a un catálogo, agregar
  selector de idioma, traducir prompts de Bedrock.
- **Impacto:** medio.

### 10. Persistencia de historial por equipo

Hoy el leaderboard es anónimo. Agregar un "reclamar mi equipo" con un token
por dispositivo (sin login real) permite ver historial propio.

- **Costo:** 4-5 h.
- **Impacto:** medio (retención).

### 11. WebSockets

Reemplazar el polling de 1s por SSE bidireccional. Menos latencia, menos
consumo de red, mismo comportamiento.

- **Costo:** 6-8 h. Requiere rediseñar la sync loop.
- **Impacto:** técnico — cero visible para el jugador.

---

## Recomendación de qué hacer si sobra tiempo antes del video

En orden estricto de costo/beneficio:

1. **#1 Cutscene del jefe** — 30-45 min, alto impacto cinemático.
2. **#2 SFX victoria/derrota** — 30-45 min, hace ver el juego terminado.
3. **#3 Meta tags OG** — 20 min, ganancia gratis para el share.
4. **#4 Tooltip del costo de la pista** — 15 min, transmite intención de diseño.

Total: ~2 horas para 4 pulidos de video. Todo lo demás va a v2.

## Fuera del alcance del backlog visible

- Cambios de arquitectura (WebSockets, base de datos, autenticación real).
- Nuevas features masivas (multiplayer real, torneos, matchmaking).
- Refactors sin valor de producto directo.

El proyecto ya cumple los 4 criterios de la rúbrica del jurado (impacto
tecnológico, innovación, software funcional y entregables, AWS+Kiro).
Las ideas de esta lista son polish; ninguna es bloqueante.
