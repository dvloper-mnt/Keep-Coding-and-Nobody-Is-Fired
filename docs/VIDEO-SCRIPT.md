# 🎬 Guion del video — Keep Coding and Nobody Is Fired

**Duración objetivo:** 4:40 (límite duro 5:00) · **Equipo:** Luis (Coder) + Moisés (Helper)
**Hackathon:** Códigofacilito × Kiro 2026

> **Regla de oro:** los primeros 30 segundos deciden. El jurado ve decenas de
> videos — enganchen con el PROBLEMA y la ACCIÓN, no con "hola, somos...".

---

## Antes de grabar (checklist)

- [ ] Abrir la demo en un navegador **limpio** (o borrar el `localStorage` de `hackaton.dvloper.com.co`) para que el **onboarding de 6 slides auto-abra** — es parte del gancho.
- [ ] Ensayar UNA ronda completa antes de grabar (que salga fluida).
- [ ] Pantalla partida: Luis (Coder) a la izquierda, Moisés (Helper) a la derecha.
- [ ] Audio claro por encima de todo. Considerar subtítulos (muchos jurados ven sin sonido).
- [ ] Tener a mano: la demo, el README (diagrama Mermaid), y una pantalla de código de `cooperative-integrity.ts`.

---

## Reparto

| Quién | Rol en el juego | Voz en el video |
|---|---|---|
| **Luis** | Coder (teclado, ve el código roto) | Abre, narra el problema y la arquitectura |
| **Moisés** | Helper (manual, guía la teoría) | Narra la mecánica cooperativa y la IA |

---

## ⏱️ 0:00 – 0:35 · El gancho (Impacto — 30%)

**Muestra:** el onboarding auto-abriéndose (slide 1: "🚨 Producción se cayó en plena demo"), luego corta al landing con los dos roles.

**LUIS (con energía):**
> "Producción se cae. El cliente está mirando en vivo. Y son dos desarrolladores
> que tienen que arreglarlo juntos — porque **ninguno puede solo.**"

**MOISÉS:**
> "Esto es **Keep Coding and Nobody Is Fired**: un simulador cooperativo de
> debugging bajo presión. Inspirado en *Keep Talking and Nobody Explodes*, pero
> con bugs reales de producción."

---

## ⏱️ 0:35 – 2:05 · La mecánica EN VIVO (Game design — 30%)

**Muestra:** pantalla partida, una ronda real. Luis inicia partida como Coder, Moisés se une como Helper con el código de sala.

**LUIS (leyendo su pantalla):**
> "Yo soy el Coder. Veo el código roto, el error 500 y cuatro diagnósticos.
> Pero **no tengo la teoría** — no sé por qué falla."

**MOISÉS (leyendo la suya):**
> "Y yo, el Helper, tengo el manual completo... pero **no veo su código.**
> Solo puedo guiarlo con mi voz. Mira: mis reglas ni siquiera me dejan cantarle
> la respuesta — dicen *'pregúntale al Coder qué método invoca cada ruta'*."

**LUIS + MOISÉS (la cooperación en acción — improvisen natural):**
> — LUIS: "El error dice que la ruta POST falla..."
> — MOISÉS: "En Laravel, la creación de un recurso usa un método canónico...
>   ¿cuál método tienes en esa ruta?"
> — LUIS: "¡`create`! Debería ser `store`." *(clickea la respuesta correcta)*

**MOISÉS (señalando):**
> "Y hay presión extra: el cliente me interrumpe con preguntas que me cuestan
> tiempo, el reloj corre, y cada uno tiene tres vidas."

> 💡 **Momento clave a mostrar:** el conocimiento bloqueado con costo de tiempo
> (`🔒 –5s`) y una consulta del cliente apareciendo en la pantalla del Helper.

---

## ⏱️ 2:05 – 3:00 · Por qué es DIFERENTE (Innovación — 30%)

**Muestra:** unos segundos del código `cooperative-integrity.ts`, luego el challenge generándose en streaming (token por token).

**MOISÉS:**
> "Aquí está lo que nos hace distintos: la cooperación **no depende de la buena
> fe — está garantizada por código.** Un validador determinista compara el bug
> con su solución y **rechaza cualquier reto donde yo podría cantar la respuesta**
> sin que Luis describa el síntoma."

**LUIS:**
> "Y cada incidente lo genera **AWS Bedrock en vivo**, token por token. Si la IA
> falla o se pasa de tiempo, caemos a un catálogo curado — **el juego nunca se
> rompe.** La IA enriquece, no es un punto único de falla."

---

## ⏱️ 3:00 – 3:55 · El cierre del juego + mentor IA (Impacto + entregable)

**Muestra:** el game-over real — resumen de la partida, el análisis del mentor IA
apareciendo, y el leaderboard global.

**LUIS:**
> "Al terminar, un **mentor IA** analiza la partida real y nos dice qué mejorar.
> El puntaje entra a un ranking global compartido en tiempo real."

**MOISÉS:**
> "No es trivia: entrena una habilidad que nadie practica — **comunicación
> técnica bajo presión.** Sirve para educación, onboarding de devs, y team
> building técnico."

---

## ⏱️ 3:55 – 4:35 · Arquitectura (AWS + Kiro — 10%)

**Muestra:** el diagrama Mermaid del README.

**LUIS:**
> "Todo corre en **AWS de verdad**, no en un mock: ECS Fargate, ElastiCache
> Valkey para el estado compartido en tiempo real, y Bedrock con Claude Haiku 4.5
> para la IA. Desplegado por CI con OIDC — sin claves."

**MOISÉS:**
> "Y lo construimos con **Kiro** dirigiendo el proceso: specs, steering y agent
> hooks. El repo es público, con 434 tests, licencia MIT y escaneo de seguridad
> continuo. **La demo que vieron es la arquitectura real en producción.**"

---

## ⏱️ 4:35 – 4:50 · Cierre

**Muestra:** el landing con la URL grande.

**LUIS + MOISÉS (juntos o alternando):**
> "**Keep Coding and Nobody Is Fired.** Pruébenlo en **hackaton.dvloper.com.co**.
> Gracias." 🐊

---

## Notas de producción

- **No pasen de 5:00** — es límite duro. Mejor 4:40 apretado que 5:10 cortado.
- **La partida que graben debe salir bien** — ensayen la ronda antes. Una victoria
  limpia o una derrota digna (no un desastre confuso).
- **Muestren el código sin datos sensibles** — `cooperative-integrity.ts` y el
  streaming de Bedrock son seguros de mostrar. Nada de `.env` ni credenciales.
- **El onboarding es un regalo narrativo** — arranquen con él, cuenta el problema
  solo.
- Si el tiempo aprieta, la sección que más se puede recortar es la 3:00–3:55
  (game-over) — pero intenten dejar al menos el mentor IA, que impresiona.
