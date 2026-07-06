# ATB Initiative Bar — Design

Gap #1 from `docs/VISION.md`: replace the per-round speed queue with a
LordsWM/HoMM5-style continuous initiative scale.

## Engine model

- `UnitDef.initiative` (new stat; `speed` stays movement cells). Baseline 10.
  Goblin 11, Wolf Rider 13, Orc 10, Ogre 9, Cyclops 10, Thunderbird 14,
  Behemoth 9.
- `UnitStack.atb ∈ [0, 1)` — position on the scale. A stack acts when it
  reaches 1. Time is measured in rounds such that a baseline init-10 stack
  takes exactly one turn per round: time-to-act `dt = (1 − atb) × 10 / init`.
- `advanceTurn`: pick the living stack with the smallest `dt`
  (ties: player side first, then id), advance every stack by
  `dt × init / 10`, zero the actor, make it current, and reset **its own**
  `hasRetaliated` (retaliation now refreshes at the start of the stack's own
  turn, not per round — HoMM5 rule). `battleTime += dt`; when
  `floor(battleTime)` increments, bump `round` and log `round_start`
  (cosmetic clock).
- Battle start: seeded rng gives each stack a random 0–10% head start
  (`atb = rng() × 0.1`), per LordsWM.
- **Wait**: the actor re-enters at `atb = 0.5` — moved back half a cycle
  instead of a full one. Freeze (bad morale) and normal actions re-enter at 0.
  Morale boost still repeats the turn without advancing the scale.
- `predictTurnOrder(units, n)` — pure selector simulating the next `n` actors
  from current atb values (ignores future waits/deaths, like LordsWM's bar);
  fast stacks appear more than once.
- `BattleState`: `turnQueue` is gone; `battleTime` added.

## UI

- `TurnBar` becomes a **horizontal strip under the board** (LordsWM puts it
  bottom-center): current stack first, then the next ~11 predicted turns,
  left-to-right, small tokens with owner-coloured frames and a round label.
- **Hover sync both ways**: hovering a bar entry highlights the stack on the
  battlefield; hovering a battlefield stack highlights its bar entries.
  (Also feeds the existing UnitInfo panel.)
- Sidebar keeps UnitInfo + combat log.

## Testing

TDD the engine: ordering by initiative, a fast stack acting twice before a
slow one, wait = half-cycle re-entry, retaliation refresh on own turn, round
ticks, start deviation from seed, prediction repeats fast units. Old
speed-queue tests are replaced. UI verified in headless Chrome per the
project verify skill.
