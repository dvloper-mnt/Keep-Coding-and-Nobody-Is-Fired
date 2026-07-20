# Timer and Pressure System

## Timer Configuration

| Parameter | Default | Source |
|-----------|---------|--------|
| `time_limit` | 180s | Per challenge (`challenge.time_limit`) |
| Penalty per wrong answer | 10s | Engine constant |
| Minimum time | 0s | Clamped, never negative |

---

## Timer Behavior

### Countdown
- Starts when game begins
- Runs globally across all steps
- Pauses only on victory/defeat screens (MVP: no pause during play)

### Audio Feedback
| Condition | Behavior |
|-----------|----------|
| Every second | Beep tick |
| ≤30s remaining | Beep accelerates (higher frequency or shorter interval) |
| ≤10s remaining | Optional urgent beep pattern |

### Visual Feedback
| Condition | Behavior |
|-----------|----------|
| >60s | Normal UI |
| 30-60s | Subtle warning tint |
| ≤30s | Progressive red overlay |
| ≤10s | Pulsing red border on timer |

---

## Boss Pressure Messages

Rotating overlay messages to simulate remote boss panic. Display on **both** screens.

```ts
const BOSS_MESSAGES = [
  '¿QUÉ ESTÁ PASANDO EN PRODUCCIÓN?',
  'TENEMOS CLIENTES MIRANDO ESTO',
  'SI ESTO FALLA, HAY CONSECUENCIAS',
  'NO TENEMOS TIEMPO',
];
```

### Display Rules
- Rotate every 15-20 seconds during gameplay
- Show as toast/overlay, not blocking interaction
- Do NOT affect timer or game logic
- Stop on victory/defeat

---

## Timer + Penalty Interaction

```
remainingTime = 180
wrong answer → remainingTime = 170
wrong answer → remainingTime = 160
tick (1s)    → remainingTime = 159
...
remainingTime = 0 → status = 'defeat'
```

Penalties and ticks are independent — both reduce time.

---

## Implementation Notes

- Timer hook (`useGameTimer`) lives in UI layer
- On each tick, call `tickTimer(state)` from engine
- On wrong answer, engine applies penalty immediately
- Sync timer state between Coder and Helper screens (future: WebSocket or polling; MVP: shared session/local state)

---

## MVP Simplification

For hackathon MVP:
- Single-device or two-browser tabs with shared session ID
- Timer runs on Coder screen, Helper sees synced time
- Boss messages on both screens via same state source