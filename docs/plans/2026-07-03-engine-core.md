# Warlords Engine Core Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Scaffold the Warlords SvelteKit project and build a pure, side-effect-free TypeScript battle engine (grid, units, combat, turn order, AI, battle orchestrator) with full Vitest coverage, wired into a throwaway console demo page.

**Architecture:** SvelteKit (static adapter) + TypeScript + Tailwind v3 shell project. All game logic lives in `src/lib/engine/*.ts` as plain functions/types with no Svelte, DOM, or store dependencies — this makes it trivially unit-testable and keeps the UI layer (future milestone) a thin consumer. State is treated as immutable: every engine function returns a new `BattleState` rather than mutating in place.

**Tech Stack:** SvelteKit + `adapter-static`, TypeScript, Tailwind CSS v3, Vitest, `idb`, `uuid`.

---

## Task 1: Scaffold the project

**Files:**
- Create: entire `warlords/` SvelteKit skeleton (via CLI)
- Modify: `svelte.config.js`, `src/routes/+layout.ts` (new), `src/app.css`, `tailwind.config.cjs` / `postcss.config.cjs` if the scaffold defaults to Tailwind v4 syntax

**Step 1: Scaffold with `sv create`**

From `/Users/bevan/projects`, run (the `docs/plans` folder already exists from planning, so pass `--no-dir-check`):

```bash
npx sv create warlords \
  --template minimal \
  --types ts \
  --add vitest="usages:unit" tailwindcss="plugins:none" sveltekit-adapter="adapter:static" \
  --install npm \
  --no-dir-check
cd warlords
```

**Step 2: Verify Tailwind version is v3**

```bash
cat package.json | grep tailwindcss
```

If it installed Tailwind v4 (no `tailwind.config.js`/`.cjs` present, `app.css` uses `@import "tailwindcss";`), downgrade:

```bash
npm install -D tailwindcss@^3 postcss autoprefixer
npx tailwindcss init -p
```

Then rewrite `src/app.css` to the v3 form:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

And ensure `tailwind.config.cjs` content globs cover `./src/**/*.{html,js,svelte,ts}`.

**Step 3: Install engine dependencies**

```bash
npm install idb uuid
npm install -D @types/uuid
```

**Step 4: Configure static adapter for SPA-style output**

Confirm `svelte.config.js` uses `@sveltejs/adapter-static`. Create `src/routes/+layout.ts`:

```ts
export const prerender = true;
export const ssr = false;
```

If `adapter-static` needs an explicit fallback (check the generated `svelte.config.js` — the `sveltekit-adapter` add-on usually wires `pages`/`assets`/`fallback` already), set `fallback: 'index.html'` in the adapter options so the app runs as a single-page app.

**Step 5: Verify the scaffold builds**

```bash
npm run check
npm run build
```

Expected: both complete with no errors (build output in `build/`).

**Step 6: Commit**

```bash
git init
git add -A
git commit -m "chore: scaffold SvelteKit project with Tailwind v3, vitest, static adapter"
```

---

## Task 2: Grid module

**Files:**
- Create: `src/lib/engine/grid.ts`
- Test: `src/lib/engine/grid.test.ts`

**Step 1: Write the failing tests**

```ts
// src/lib/engine/grid.test.ts
import { describe, it, expect } from 'vitest';
import { createGrid, getCell, getNeighbours, isInRange, findPath } from './grid';

describe('grid', () => {
	it('getCell returns the cell within bounds', () => {
		const grid = createGrid(12, 10);
		expect(getCell(grid, 3, 4)).toEqual({ col: 3, row: 4, blocked: false, occupant: null });
	});

	it('getCell returns null out of bounds', () => {
		const grid = createGrid(12, 10);
		expect(getCell(grid, -1, 0)).toBeNull();
		expect(getCell(grid, 12, 0)).toBeNull();
		expect(getCell(grid, 0, 10)).toBeNull();
	});

	it('getNeighbours returns 4-directional cells, fewer at edges', () => {
		const grid = createGrid(12, 10);
		expect(getNeighbours(grid, 5, 5)).toHaveLength(4);
		expect(getNeighbours(grid, 0, 0)).toHaveLength(2);
	});

	it('isInRange uses Chebyshev distance (diagonal allowed)', () => {
		expect(isInRange({ col: 0, row: 0 }, { col: 1, row: 1 }, 1)).toBe(true);
		expect(isInRange({ col: 0, row: 0 }, { col: 2, row: 0 }, 1)).toBe(false);
		expect(isInRange({ col: 0, row: 0 }, { col: 2, row: 2 }, 2)).toBe(true);
	});

	it('findPath finds a direct path with no obstacles', () => {
		const grid = createGrid(5, 5);
		const path = findPath(grid, { col: 0, row: 0 }, { col: 2, row: 0 });
		expect(path).toEqual([
			{ col: 1, row: 0 },
			{ col: 2, row: 0 }
		]);
	});

	it('findPath routes around a blocked cell', () => {
		const grid = createGrid(3, 3);
		grid.cells[0][1].blocked = true;
		const path = findPath(grid, { col: 0, row: 0 }, { col: 2, row: 0 });
		expect(path[path.length - 1]).toEqual({ col: 2, row: 0 });
		expect(path.some((p) => p.col === 1 && p.row === 0)).toBe(false);
	});

	it('findPath returns empty array when no path exists', () => {
		const grid = createGrid(3, 3);
		grid.cells[0][1].blocked = true;
		grid.cells[1][1].blocked = true;
		grid.cells[2][1].blocked = true;
		const path = findPath(grid, { col: 0, row: 0 }, { col: 2, row: 0 });
		expect(path).toEqual([]);
	});

	it('findPath returns empty array when from equals to', () => {
		const grid = createGrid(3, 3);
		expect(findPath(grid, { col: 1, row: 1 }, { col: 1, row: 1 })).toEqual([]);
	});

	it('findPath cannot path onto an occupied cell', () => {
		const grid = createGrid(3, 1);
		grid.cells[0][2].occupant = {} as never;
		const path = findPath(grid, { col: 0, row: 0 }, { col: 2, row: 0 });
		expect(path).toEqual([]);
	});
});
```

**Step 2: Run to verify failure**

```bash
npx vitest run src/lib/engine/grid.test.ts
```

Expected: FAIL — `grid.ts` does not exist yet.

**Step 3: Implement**

```ts
// src/lib/engine/grid.ts
import type { UnitStack } from './units';

export type Position = { col: number; row: number };

export type Cell = {
	col: number;
	row: number;
	blocked: boolean;
	occupant: UnitStack | null;
};

export type Grid = {
	width: number;
	height: number;
	cells: Cell[][]; // cells[row][col]
};

export function createGrid(width: number, height: number): Grid {
	const cells: Cell[][] = [];
	for (let row = 0; row < height; row++) {
		const rowCells: Cell[] = [];
		for (let col = 0; col < width; col++) {
			rowCells.push({ col, row, blocked: false, occupant: null });
		}
		cells.push(rowCells);
	}
	return { width, height, cells };
}

export function getCell(grid: Grid, col: number, row: number): Cell | null {
	if (row < 0 || row >= grid.height || col < 0 || col >= grid.width) return null;
	return grid.cells[row][col];
}

export function getNeighbours(grid: Grid, col: number, row: number): Cell[] {
	const offsets = [
		{ dc: 0, dr: -1 },
		{ dc: 0, dr: 1 },
		{ dc: -1, dr: 0 },
		{ dc: 1, dr: 0 }
	];
	const result: Cell[] = [];
	for (const { dc, dr } of offsets) {
		const cell = getCell(grid, col + dc, row + dr);
		if (cell) result.push(cell);
	}
	return result;
}

export function isInRange(from: Position, to: Position, range: number): boolean {
	const distance = Math.max(Math.abs(from.col - to.col), Math.abs(from.row - to.row));
	return distance <= range;
}

export function findPath(grid: Grid, from: Position, to: Position): Position[] {
	if (!getCell(grid, to.col, to.row)) return [];
	if (from.col === to.col && from.row === to.row) return [];

	const key = (c: number, r: number) => `${c},${r}`;
	const visited = new Set<string>([key(from.col, from.row)]);
	const cameFrom = new Map<string, Position>();
	const queue: Position[] = [{ col: from.col, row: from.row }];

	while (queue.length > 0) {
		const current = queue.shift()!;
		if (current.col === to.col && current.row === to.row) {
			const path: Position[] = [];
			let step: Position | undefined = current;
			while (step && !(step.col === from.col && step.row === from.row)) {
				path.unshift({ col: step.col, row: step.row });
				step = cameFrom.get(key(step.col, step.row));
			}
			return path;
		}
		for (const neighbour of getNeighbours(grid, current.col, current.row)) {
			const nKey = key(neighbour.col, neighbour.row);
			if (visited.has(nKey) || neighbour.blocked || neighbour.occupant) continue;
			visited.add(nKey);
			cameFrom.set(nKey, { col: current.col, row: current.row });
			queue.push({ col: neighbour.col, row: neighbour.row });
		}
	}
	return [];
}
```

**Step 4: Run to verify pass**

```bash
npx vitest run src/lib/engine/grid.test.ts
```

Expected: PASS (all 9 tests).

**Step 5: Commit**

```bash
git add src/lib/engine/grid.ts src/lib/engine/grid.test.ts
git commit -m "feat(engine): add grid module with BFS pathfinding"
```

---

## Task 3: Units module

**Files:**
- Create: `src/lib/engine/units.ts`
- Test: `src/lib/engine/units.test.ts`

**Step 1: Write the failing test**

```ts
// src/lib/engine/units.test.ts
import { describe, it, expect } from 'vitest';
import { createUnitStack, type UnitDef } from './units';

const dummyDef: UnitDef = {
	name: 'Test Unit',
	tier: 1,
	speed: 5,
	hp: 10,
	attack: 3,
	defense: 3,
	minDamage: 1,
	maxDamage: 2,
	shots: 0,
	isLarge: false,
	abilities: []
};

describe('createUnitStack', () => {
	it('initialises hp, morale, luck, and retaliation defaults', () => {
		const stack = createUnitStack(dummyDef, 10, { col: 0, row: 0 }, 'player');
		expect(stack.hp).toBe(10);
		expect(stack.count).toBe(10);
		expect(stack.hasRetaliated).toBe(false);
		expect(stack.morale).toBe(0);
		expect(stack.luck).toBe(0);
		expect(stack.side).toBe('player');
		expect(stack.id).toBeTruthy();
	});

	it('generates a unique id per stack', () => {
		const a = createUnitStack(dummyDef, 1, { col: 0, row: 0 }, 'player');
		const b = createUnitStack(dummyDef, 1, { col: 0, row: 0 }, 'player');
		expect(a.id).not.toBe(b.id);
	});
});
```

**Step 2: Run to verify failure**

```bash
npx vitest run src/lib/engine/units.test.ts
```

**Step 3: Implement**

```ts
// src/lib/engine/units.ts
import { v4 as uuidv4 } from 'uuid';

export type UnitDef = {
	name: string;
	tier: 1 | 2 | 3 | 4 | 5 | 6 | 7;
	speed: number;
	hp: number;
	attack: number;
	defense: number;
	minDamage: number;
	maxDamage: number;
	shots: number;
	isLarge: boolean;
	abilities: string[];
};

export type UnitStack = {
	id: string;
	definition: UnitDef;
	count: number;
	hp: number;
	pos: { col: number; row: number };
	side: 'player' | 'enemy';
	hasRetaliated: boolean;
	morale: number;
	luck: number;
};

export function createUnitStack(
	definition: UnitDef,
	count: number,
	pos: { col: number; row: number },
	side: 'player' | 'enemy'
): UnitStack {
	return {
		id: uuidv4(),
		definition,
		count,
		hp: definition.hp,
		pos,
		side,
		hasRetaliated: false,
		morale: 0,
		luck: 0
	};
}
```

**Step 4: Run to verify pass, Step 5: Commit**

```bash
npx vitest run src/lib/engine/units.test.ts
git add src/lib/engine/units.ts src/lib/engine/units.test.ts
git commit -m "feat(engine): add UnitDef/UnitStack types and factory"
```

---

## Task 4: Barbarian roster

**Files:**
- Create: `src/lib/engine/barbarian.ts`
- Test: `src/lib/engine/barbarian.test.ts`

**Step 1: Write the failing test**

```ts
// src/lib/engine/barbarian.test.ts
import { describe, it, expect } from 'vitest';
import { BARBARIAN_UNITS } from './barbarian';

describe('BARBARIAN_UNITS', () => {
	it('defines exactly 7 tiers in order', () => {
		expect(BARBARIAN_UNITS).toHaveLength(7);
		expect(BARBARIAN_UNITS.map((u) => u.tier)).toEqual([1, 2, 3, 4, 5, 6, 7]);
	});

	it('marks the correct units as ranged', () => {
		const ranged = BARBARIAN_UNITS.filter((u) => u.shots > 0).map((u) => u.name);
		expect(ranged).toEqual(['Orc', 'Cyclops']);
	});

	it('gives Thunderbird the flying ability', () => {
		const thunderbird = BARBARIAN_UNITS.find((u) => u.name === 'Thunderbird')!;
		expect(thunderbird.abilities).toContain('flying');
	});
});
```

**Step 2: Run to verify failure.**

**Step 3: Implement (verbatim roster data from the spec)**

```ts
// src/lib/engine/barbarian.ts
import type { UnitDef } from './units';

export const BARBARIAN_UNITS: UnitDef[] = [
	{ name: 'Goblin', tier: 1, speed: 5, hp: 5, attack: 2, defense: 1, minDamage: 1, maxDamage: 2, shots: 0, isLarge: false, abilities: [] },
	{ name: 'Wolf Rider', tier: 2, speed: 7, hp: 20, attack: 5, defense: 3, minDamage: 2, maxDamage: 5, shots: 0, isLarge: false, abilities: [] },
	{ name: 'Orc', tier: 3, speed: 4, hp: 35, attack: 7, defense: 5, minDamage: 4, maxDamage: 8, shots: 4, isLarge: false, abilities: [] },
	{ name: 'Ogre', tier: 4, speed: 4, hp: 75, attack: 10, defense: 7, minDamage: 7, maxDamage: 14, shots: 0, isLarge: false, abilities: [] },
	{ name: 'Cyclops', tier: 5, speed: 6, hp: 100, attack: 15, defense: 10, minDamage: 12, maxDamage: 24, shots: 3, isLarge: false, abilities: [] },
	{ name: 'Thunderbird', tier: 6, speed: 9, hp: 150, attack: 20, defense: 12, minDamage: 18, maxDamage: 30, shots: 0, isLarge: false, abilities: ['flying'] },
	{ name: 'Behemoth', tier: 7, speed: 6, hp: 300, attack: 30, defense: 18, minDamage: 30, maxDamage: 55, shots: 0, isLarge: false, abilities: ['defense_reduction'] }
];
```

**Step 4: Run to verify pass, Step 5: Commit**

```bash
npx vitest run src/lib/engine/barbarian.test.ts
git add src/lib/engine/barbarian.ts src/lib/engine/barbarian.test.ts
git commit -m "feat(engine): add Barbarian 7-tier roster"
```

---

## Task 5: Hero module

**Files:**
- Create: `src/lib/engine/hero.ts`
- Test: `src/lib/engine/hero.test.ts`

**Step 1: Write the failing test**

```ts
// src/lib/engine/hero.test.ts
import { describe, it, expect } from 'vitest';
import { createBarbarianHero } from './hero';
import { BARBARIAN_UNITS } from './barbarian';

describe('createBarbarianHero', () => {
	it('creates a level 1 hero with zero stat bonuses and the given army', () => {
		const goblin = BARBARIAN_UNITS[0];
		const hero = createBarbarianHero([{ unit: goblin, count: 10 }]);
		expect(hero.class).toBe('barbarian');
		expect(hero.level).toBe(1);
		expect(hero.attack).toBe(0);
		expect(hero.defense).toBe(0);
		expect(hero.army).toEqual([{ unit: goblin, count: 10 }]);
	});
});
```

**Step 2: Run to verify failure.**

**Step 3: Implement**

```ts
// src/lib/engine/hero.ts
import type { UnitDef } from './units';

export type ArmySlot = {
	unit: UnitDef;
	count: number;
};

export type Hero = {
	class: 'barbarian';
	level: number;
	xp: number;
	attack: number;
	defense: number;
	statPoints: number;
	army: ArmySlot[];
};

export function createBarbarianHero(army: ArmySlot[] = []): Hero {
	return {
		class: 'barbarian',
		level: 1,
		xp: 0,
		attack: 0,
		defense: 0,
		statPoints: 0,
		army
	};
}
```

**Step 4: Run to verify pass, Step 5: Commit**

```bash
npx vitest run src/lib/engine/hero.test.ts
git add src/lib/engine/hero.ts src/lib/engine/hero.test.ts
git commit -m "feat(engine): add Hero type and Barbarian hero factory"
```

---

## Task 6: Combat module

**Files:**
- Create: `src/lib/engine/combat.ts`
- Test: `src/lib/engine/combat.test.ts`

**Step 1: Write the failing tests**

```ts
// src/lib/engine/combat.test.ts
import { describe, it, expect, vi } from 'vitest';
import { calculateDamage, applyDamage, canRetaliate, checkMorale } from './combat';
import { createUnitStack } from './units';
import { BARBARIAN_UNITS } from './barbarian';

const orc = BARBARIAN_UNITS.find((u) => u.name === 'Orc')!; // attack 7, minDamage 4, maxDamage 8
const goblin = BARBARIAN_UNITS.find((u) => u.name === 'Goblin')!; // defense 1, attack 2, hp 5, minDamage 1, maxDamage 2

describe('calculateDamage', () => {
	it('boosts damage when attack exceeds defense', () => {
		const attacker = createUnitStack(orc, 1, { col: 0, row: 0 }, 'player');
		const defender = createUnitStack(goblin, 1, { col: 1, row: 0 }, 'enemy');
		const rng = vi.fn().mockReturnValue(0); // roll = minDamage (4); luck is 0 so no 2nd call
		const damage = calculateDamage(attacker, defender, 0, rng);
		// roll 4 * count 1 = 4; (attack 7 - defense 1) = 6 -> *(1 + 0.3) = 5.2 -> round 5
		expect(damage).toBe(5);
	});

	it('reduces damage when defense exceeds attack', () => {
		const attacker = createUnitStack(goblin, 1, { col: 0, row: 0 }, 'player'); // attack 2
		const defender = createUnitStack(orc, 1, { col: 1, row: 0 }, 'enemy'); // defense 5
		const rng = vi.fn().mockReturnValue(0.99); // roll = maxDamage (2)
		const damage = calculateDamage(attacker, defender, 0, rng);
		// roll 2; (defense 5 - attack 2) = 3 -> /(1 + 0.15) = 1.739 -> round 2
		expect(damage).toBe(2);
	});

	it('doubles damage on a luck proc', () => {
		const attacker = createUnitStack(goblin, 1, { col: 0, row: 0 }, 'player');
		attacker.luck = 1;
		const defender = createUnitStack(goblin, 1, { col: 1, row: 0 }, 'enemy');
		const rng = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(0); // roll = min(1); luck roll 0 < 0.125
		const damage = calculateDamage(attacker, defender, 0, rng);
		// roll 1; (attack 2 - defense 1) = 1 -> *1.05 = 1.05; luck doubles -> 2.1 -> round 2
		expect(damage).toBe(2);
	});

	it('does not double damage when luck is zero, even on a low roll', () => {
		const attacker = createUnitStack(goblin, 1, { col: 0, row: 0 }, 'player');
		const defender = createUnitStack(goblin, 1, { col: 1, row: 0 }, 'enemy');
		const rng = vi.fn().mockReturnValue(0);
		const damage = calculateDamage(attacker, defender, 0, rng);
		expect(rng).toHaveBeenCalledTimes(1); // luck check skipped entirely
		expect(damage).toBe(1); // roll 1 * 1.05 -> round 1
	});
});

describe('applyDamage', () => {
	it('kills whole creatures and leaves partial hp on the survivor', () => {
		const stack = createUnitStack(goblin, 5, { col: 0, row: 0 }, 'player'); // 5 hp each, 25 total
		const { killed, remaining } = applyDamage(stack, 12);
		expect(killed).toBe(2);
		expect(remaining.count).toBe(3);
		expect(remaining.hp).toBe(3);
	});

	it('wipes the stack when damage exceeds total hp', () => {
		const stack = createUnitStack(goblin, 2, { col: 0, row: 0 }, 'player');
		const { killed, remaining } = applyDamage(stack, 100);
		expect(killed).toBe(2);
		expect(remaining.count).toBe(0);
	});

	it('leaves count unchanged when damage does not kill the top creature', () => {
		const stack = createUnitStack(goblin, 3, { col: 0, row: 0 }, 'player');
		const { killed, remaining } = applyDamage(stack, 2);
		expect(killed).toBe(0);
		expect(remaining.count).toBe(3);
		expect(remaining.hp).toBe(3);
	});
});

describe('canRetaliate', () => {
	it('is true for a fresh, living stack', () => {
		const stack = createUnitStack(goblin, 1, { col: 0, row: 0 }, 'player');
		expect(canRetaliate(stack)).toBe(true);
	});

	it('is false once the stack has already retaliated this round', () => {
		const stack = createUnitStack(goblin, 1, { col: 0, row: 0 }, 'player');
		stack.hasRetaliated = true;
		expect(canRetaliate(stack)).toBe(false);
	});

	it('is false for a dead stack', () => {
		const stack = createUnitStack(goblin, 0, { col: 0, row: 0 }, 'player');
		expect(canRetaliate(stack)).toBe(false);
	});
});

describe('checkMorale', () => {
	it('grants an extra action when the roll beats positive morale odds', () => {
		const stack = createUnitStack(goblin, 1, { col: 0, row: 0 }, 'player');
		stack.morale = 3;
		expect(checkMorale(stack, vi.fn().mockReturnValue(0))).toBe('extra_action');
	});

	it('freezes the unit when the roll beats negative morale odds', () => {
		const stack = createUnitStack(goblin, 1, { col: 0, row: 0 }, 'player');
		stack.morale = -3;
		expect(checkMorale(stack, vi.fn().mockReturnValue(0))).toBe('frozen');
	});

	it('is normal when morale is zero', () => {
		const stack = createUnitStack(goblin, 1, { col: 0, row: 0 }, 'player');
		expect(checkMorale(stack, vi.fn().mockReturnValue(0))).toBe('normal');
	});
});
```

**Step 2: Run to verify failure.**

**Step 3: Implement**

```ts
// src/lib/engine/combat.ts
import type { UnitStack } from './units';

export type Rng = () => number;

function randomInt(min: number, max: number, rng: Rng): number {
	return Math.floor(rng() * (max - min + 1)) + min;
}

export function calculateDamage(
	attacker: UnitStack,
	defender: UnitStack,
	heroAttack: number,
	rng: Rng = Math.random
): number {
	const roll = randomInt(attacker.definition.minDamage, attacker.definition.maxDamage, rng);
	let damage = roll * attacker.count;

	const effectiveAttack = attacker.definition.attack + heroAttack;
	const defense = defender.definition.defense;

	if (effectiveAttack > defense) {
		damage *= 1 + 0.05 * Math.min(effectiveAttack - defense, 20);
	} else if (defense > effectiveAttack) {
		damage *= 1 / (1 + 0.05 * Math.min(defense - effectiveAttack, 20));
	}

	if (attacker.luck > 0 && rng() < 0.125) {
		damage *= 2;
	}

	return Math.round(damage);
}

export function applyDamage(
	defender: UnitStack,
	damage: number
): { killed: number; remaining: UnitStack } {
	const perCreatureHp = defender.definition.hp;
	const totalHp = defender.hp + (defender.count - 1) * perCreatureHp;
	const remainingHp = Math.max(0, totalHp - damage);

	const newCount = remainingHp === 0 ? 0 : Math.ceil(remainingHp / perCreatureHp);
	const newTopHp = newCount === 0 ? 0 : remainingHp - (newCount - 1) * perCreatureHp;
	const killed = defender.count - newCount;

	return {
		killed,
		remaining: { ...defender, count: newCount, hp: newTopHp }
	};
}

export function canRetaliate(defender: UnitStack): boolean {
	return !defender.hasRetaliated && defender.count > 0;
}

export type MoraleResult = 'extra_action' | 'frozen' | 'normal';

export function checkMorale(unit: UnitStack, rng: Rng = Math.random): MoraleResult {
	if (unit.morale > 0) {
		return rng() < unit.morale / 24 ? 'extra_action' : 'normal';
	}
	if (unit.morale < 0) {
		return rng() < Math.abs(unit.morale) / 24 ? 'frozen' : 'normal';
	}
	return 'normal';
}
```

**Step 4: Run to verify pass**

```bash
npx vitest run src/lib/engine/combat.test.ts
```

Expected: PASS (all cases, including the luck short-circuit call-count check).

**Step 5: Commit**

```bash
git add src/lib/engine/combat.ts src/lib/engine/combat.test.ts
git commit -m "feat(engine): add HoMM3-style damage, hp-pool kill math, retaliation and morale"
```

---

## Task 7: Turn order module

**Files:**
- Create: `src/lib/engine/turnOrder.ts`
- Test: `src/lib/engine/turnOrder.test.ts`

**Step 1: Write the failing tests**

```ts
// src/lib/engine/turnOrder.test.ts
import { describe, it, expect } from 'vitest';
import { buildTurnQueue, advanceTurn, type BattleState } from './turnOrder';
import { createGrid } from './grid';
import { createUnitStack } from './units';
import { BARBARIAN_UNITS } from './barbarian';

const goblin = BARBARIAN_UNITS.find((u) => u.name === 'Goblin')!; // speed 5
const wolfRider = BARBARIAN_UNITS.find((u) => u.name === 'Wolf Rider')!; // speed 7
const orc = BARBARIAN_UNITS.find((u) => u.name === 'Orc')!; // speed 4

describe('buildTurnQueue', () => {
	it('orders stacks by speed descending', () => {
		const a = createUnitStack(goblin, 1, { col: 0, row: 0 }, 'player');
		const b = createUnitStack(wolfRider, 1, { col: 0, row: 1 }, 'enemy');
		const c = createUnitStack(orc, 1, { col: 0, row: 2 }, 'player');
		expect(buildTurnQueue([a, b, c])).toEqual([b.id, a.id, c.id]);
	});

	it('breaks speed ties in favour of the player side', () => {
		const a = createUnitStack(goblin, 1, { col: 0, row: 0 }, 'enemy');
		const b = createUnitStack(goblin, 1, { col: 0, row: 1 }, 'player');
		expect(buildTurnQueue([a, b])).toEqual([b.id, a.id]);
	});

	it('excludes stacks with zero count', () => {
		const a = createUnitStack(goblin, 0, { col: 0, row: 0 }, 'player');
		const b = createUnitStack(wolfRider, 1, { col: 0, row: 1 }, 'enemy');
		expect(buildTurnQueue([a, b])).toEqual([b.id]);
	});
});

describe('advanceTurn', () => {
	it('advances to the next unit in the queue within the same round', () => {
		const a = createUnitStack(wolfRider, 1, { col: 0, row: 0 }, 'player');
		const b = createUnitStack(goblin, 1, { col: 0, row: 1 }, 'enemy');
		const state: BattleState = {
			grid: createGrid(12, 10),
			units: [a, b],
			round: 1,
			turnQueue: [b.id],
			currentUnitId: a.id,
			log: []
		};
		const next = advanceTurn(state);
		expect(next.currentUnitId).toBe(b.id);
		expect(next.round).toBe(1);
	});

	it('starts a new round and resets retaliation once the queue is exhausted', () => {
		const a = createUnitStack(wolfRider, 1, { col: 0, row: 0 }, 'player');
		a.hasRetaliated = true;
		const state: BattleState = {
			grid: createGrid(12, 10),
			units: [a],
			round: 1,
			turnQueue: [],
			currentUnitId: a.id,
			log: []
		};
		const next = advanceTurn(state);
		expect(next.round).toBe(2);
		expect(next.currentUnitId).toBe(a.id);
		expect(next.units[0].hasRetaliated).toBe(false);
		expect(next.log.some((e) => e.type === 'round_start')).toBe(true);
	});

	it('skips dead stacks still sitting in the queue and starts a new round if none remain', () => {
		const a = createUnitStack(wolfRider, 1, { col: 0, row: 0 }, 'player');
		const b = createUnitStack(goblin, 0, { col: 0, row: 1 }, 'enemy'); // already dead
		const state: BattleState = {
			grid: createGrid(12, 10),
			units: [a, b],
			round: 1,
			turnQueue: [b.id],
			currentUnitId: a.id,
			log: []
		};
		const next = advanceTurn(state);
		expect(next.round).toBe(2);
		expect(next.currentUnitId).toBe(a.id);
	});
});
```

**Step 2: Run to verify failure.**

**Step 3: Implement**

```ts
// src/lib/engine/turnOrder.ts
import type { UnitStack } from './units';
import type { Grid } from './grid';

export type BattleEventType =
	| 'attack'
	| 'move'
	| 'shoot'
	| 'retaliate'
	| 'morale'
	| 'death'
	| 'round_start'
	| 'battle_end';

export type BattleEvent = {
	type: BattleEventType;
	data: Record<string, unknown>;
};

export type BattleState = {
	grid: Grid;
	units: UnitStack[];
	round: number;
	turnQueue: string[];
	currentUnitId: string | null;
	log: BattleEvent[];
};

export function buildTurnQueue(units: UnitStack[]): string[] {
	return units
		.filter((u) => u.count > 0)
		.slice()
		.sort((a, b) => {
			if (b.definition.speed !== a.definition.speed) {
				return b.definition.speed - a.definition.speed;
			}
			if (a.side !== b.side) {
				return a.side === 'player' ? -1 : 1;
			}
			return a.id.localeCompare(b.id);
		})
		.map((u) => u.id);
}

export function advanceTurn(state: BattleState): BattleState {
	const queue = [...state.turnQueue];
	while (queue.length > 0) {
		const nextId = queue.shift()!;
		const unit = state.units.find((u) => u.id === nextId);
		if (unit && unit.count > 0) {
			return { ...state, turnQueue: queue, currentUnitId: nextId };
		}
	}

	const resetUnits = state.units.map((u) => ({ ...u, hasRetaliated: false }));
	const livingUnits = resetUnits.filter((u) => u.count > 0);
	const newQueue = buildTurnQueue(livingUnits);
	const round = state.round + 1;
	const log = [...state.log, { type: 'round_start' as const, data: { round } }];

	if (newQueue.length === 0) {
		return { ...state, units: resetUnits, round, turnQueue: [], currentUnitId: null, log };
	}

	const [first, ...rest] = newQueue;
	return { ...state, units: resetUnits, round, turnQueue: rest, currentUnitId: first, log };
}
```

**Step 4: Run to verify pass, Step 5: Commit**

```bash
npx vitest run src/lib/engine/turnOrder.test.ts
git add src/lib/engine/turnOrder.ts src/lib/engine/turnOrder.test.ts
git commit -m "feat(engine): add initiative-based turn queue and round advancement"
```

---

## Task 8: Battle orchestrator (initBattle, applyAction, checkBattleEnd)

**Files:**
- Create: `src/lib/engine/battle.ts`
- Test: `src/lib/engine/battle.test.ts`

Note: this comes before AI because AI's tests need `initBattle` to set up realistic states, and `ai.ts` will import `BattleAction`, which we define here-adjacent in `ai.ts` per the spec — but `battle.ts`'s `applyAction` needs to accept that type, so we define `BattleAction` in `ai.ts` (Task 9) and have `battle.ts` import it. To avoid a forward-reference problem, write `battle.ts`'s action handling against a local structural type first, then Task 9 will just re-export/import — see Task 9 for the wiring. For simplicity, define `BattleAction` in `ai.ts` and import it into `battle.ts`; do Task 9 (ai.ts) first if your editor complains about the missing module, then return to finish `battle.ts`'s tests.

**Step 1: Write the failing tests**

```ts
// src/lib/engine/battle.test.ts
import { describe, it, expect } from 'vitest';
import { initBattle, checkBattleEnd, applyAction } from './battle';
import { createBarbarianHero } from './hero';
import { BARBARIAN_UNITS } from './barbarian';

const goblin = BARBARIAN_UNITS.find((u) => u.name === 'Goblin')!;

describe('initBattle', () => {
	it('places player stacks on the left and enemy stacks on the right', () => {
		const hero = createBarbarianHero();
		const state = initBattle([{ unit: goblin, count: 5 }], [{ unit: goblin, count: 5 }], hero);
		const player = state.units.find((u) => u.side === 'player')!;
		const enemy = state.units.find((u) => u.side === 'enemy')!;
		expect(player.pos.col).toBe(0);
		expect(enemy.pos.col).toBe(11);
	});

	it('builds an initial turn queue with a current unit set', () => {
		const hero = createBarbarianHero();
		const state = initBattle([{ unit: goblin, count: 5 }], [{ unit: goblin, count: 5 }], hero);
		expect(state.currentUnitId).not.toBeNull();
		expect(state.round).toBe(1);
	});
});

describe('checkBattleEnd', () => {
	it('returns null while both sides have living units', () => {
		const hero = createBarbarianHero();
		const state = initBattle([{ unit: goblin, count: 5 }], [{ unit: goblin, count: 5 }], hero);
		expect(checkBattleEnd(state)).toBeNull();
	});

	it('declares enemy_wins when the player army is wiped out', () => {
		const hero = createBarbarianHero();
		const state = initBattle([{ unit: goblin, count: 5 }], [{ unit: goblin, count: 5 }], hero);
		state.units[0].count = 0;
		expect(checkBattleEnd(state)).toBe('enemy_wins');
	});

	it('declares player_wins when the enemy army is wiped out', () => {
		const hero = createBarbarianHero();
		const state = initBattle([{ unit: goblin, count: 5 }], [{ unit: goblin, count: 5 }], hero);
		state.units[1].count = 0;
		expect(checkBattleEnd(state)).toBe('player_wins');
	});
});

describe('applyAction', () => {
	it('moves the current unit to the target cell and clears the old cell', () => {
		const hero = createBarbarianHero();
		const state = initBattle([{ unit: goblin, count: 5 }], [{ unit: goblin, count: 5 }], hero);
		const mover = state.units.find((u) => u.id === state.currentUnitId)!;
		const to = { col: mover.pos.col + 1, row: mover.pos.row };
		const next = applyAction(state, { type: 'move', to });
		const moved = next.units.find((u) => u.id === mover.id)!;
		expect(moved.pos).toEqual(to);
		expect(next.grid.cells[mover.pos.row][mover.pos.col].occupant).toBeNull();
		expect(next.grid.cells[to.row][to.col].occupant?.id).toBe(mover.id);
	});

	it('applies attack damage to the target and advances the turn', () => {
		const hero = createBarbarianHero();
		const state = initBattle([{ unit: goblin, count: 5 }], [{ unit: goblin, count: 5 }], hero);
		const attacker = state.units.find((u) => u.id === state.currentUnitId)!;
		const target = state.units.find((u) => u.side !== attacker.side)!;
		const next = applyAction(state, { type: 'attack', targetId: target.id });
		const updatedTarget = next.units.find((u) => u.id === target.id)!;
		expect(updatedTarget.count + (target.count - updatedTarget.count)).toBe(target.count);
		expect(updatedTarget.count).toBeLessThanOrEqual(target.count);
		expect(next.currentUnitId).not.toBe(attacker.id);
	});
});
```

**Step 2: Run to verify failure.**

**Step 3: Implement** (see Task 9 for `BattleAction`; write both files together if the type isn't available yet)

```ts
// src/lib/engine/battle.ts
import { createGrid, isInRange, type Grid } from './grid';
import { createUnitStack, type UnitStack } from './units';
import type { ArmySlot, Hero } from './hero';
import { buildTurnQueue, advanceTurn, type BattleState, type BattleEvent } from './turnOrder';
import { calculateDamage, applyDamage, canRetaliate } from './combat';
import type { BattleAction } from './ai';

const GRID_WIDTH = 12;
const GRID_HEIGHT = 10;

export function initBattle(
	playerArmy: ArmySlot[],
	enemyArmy: ArmySlot[],
	hero: Hero
): BattleState {
	const grid = createGrid(GRID_WIDTH, GRID_HEIGHT);
	const units: UnitStack[] = [];

	playerArmy.forEach((slot, index) => {
		const stack = createUnitStack(slot.unit, slot.count, { col: 0, row: index }, 'player');
		units.push(stack);
		grid.cells[stack.pos.row][stack.pos.col].occupant = stack;
	});

	enemyArmy.forEach((slot, index) => {
		const stack = createUnitStack(
			slot.unit,
			slot.count,
			{ col: GRID_WIDTH - 1, row: index },
			'enemy'
		);
		units.push(stack);
		grid.cells[stack.pos.row][stack.pos.col].occupant = stack;
	});

	const turnQueue = buildTurnQueue(units);
	const [currentUnitId, ...rest] = turnQueue;
	const log: BattleEvent[] = [{ type: 'round_start', data: { round: 1 } }];

	return {
		grid,
		units,
		round: 1,
		turnQueue: rest,
		currentUnitId: currentUnitId ?? null,
		log
	};
}

export function checkBattleEnd(state: BattleState): 'player_wins' | 'enemy_wins' | null {
	const playerAlive = state.units.some((u) => u.side === 'player' && u.count > 0);
	const enemyAlive = state.units.some((u) => u.side === 'enemy' && u.count > 0);
	if (!playerAlive) return 'enemy_wins';
	if (!enemyAlive) return 'player_wins';
	return null;
}

function withUnit(
	state: BattleState,
	unitId: string,
	update: (u: UnitStack) => UnitStack
): BattleState {
	return { ...state, units: state.units.map((u) => (u.id === unitId ? update(u) : u)) };
}

function moveUnitOnGrid(grid: Grid, unit: UnitStack, to: { col: number; row: number }): Grid {
	const cells = grid.cells.map((row) => row.map((cell) => ({ ...cell })));
	cells[unit.pos.row][unit.pos.col].occupant = null;
	cells[to.row][to.col].occupant = { ...unit, pos: to };
	return { ...grid, cells };
}

export function applyAction(state: BattleState, action: BattleAction): BattleState {
	const currentId = state.currentUnitId;
	if (!currentId) return state;
	const unit = state.units.find((u) => u.id === currentId);
	if (!unit) return state;

	let nextState = state;

	if (action.type === 'move') {
		const grid = moveUnitOnGrid(state.grid, unit, action.to);
		nextState = withUnit(state, unit.id, (u) => ({ ...u, pos: action.to }));
		nextState = { ...nextState, grid };
		nextState = {
			...nextState,
			log: [...nextState.log, { type: 'move', data: { unitId: unit.id, to: action.to } }]
		};
	} else if (action.type === 'attack' || action.type === 'shoot') {
		const target = state.units.find((u) => u.id === action.targetId);
		if (!target) return state;

		const damage = calculateDamage(unit, target, 0);
		const { killed, remaining } = applyDamage(target, damage);

		nextState = withUnit(state, target.id, () => remaining);
		nextState = {
			...nextState,
			log: [
				...nextState.log,
				{ type: action.type, data: { attackerId: unit.id, targetId: target.id, damage, killed } }
			]
		};

		if (remaining.count === 0) {
			nextState = {
				...nextState,
				log: [...nextState.log, { type: 'death', data: { unitId: target.id } }]
			};
		} else if (
			action.type === 'attack' &&
			canRetaliate(remaining) &&
			isInRange(unit.pos, target.pos, 1)
		) {
			const retaliationDamage = calculateDamage(remaining, unit, 0);
			const retaliationResult = applyDamage(unit, retaliationDamage);
			nextState = withUnit(nextState, unit.id, () => retaliationResult.remaining);
			nextState = withUnit(nextState, target.id, (t) => ({ ...t, hasRetaliated: true }));
			nextState = {
				...nextState,
				log: [
					...nextState.log,
					{
						type: 'retaliate',
						data: {
							attackerId: target.id,
							targetId: unit.id,
							damage: retaliationDamage,
							killed: retaliationResult.killed
						}
					}
				]
			};
		}
	}

	const result = checkBattleEnd(nextState);
	if (result) {
		return {
			...nextState,
			currentUnitId: null,
			log: [...nextState.log, { type: 'battle_end', data: { result } }]
		};
	}

	return advanceTurn(nextState);
}
```

**Step 4: Run to verify pass (after Task 9's `ai.ts` exists), Step 5: Commit**

```bash
npx vitest run src/lib/engine/battle.test.ts
git add src/lib/engine/battle.ts src/lib/engine/battle.test.ts
git commit -m "feat(engine): add battle orchestrator (init, apply action, end check)"
```

---

## Task 9: Basic AI

**Files:**
- Create: `src/lib/engine/ai.ts`
- Test: `src/lib/engine/ai.test.ts`

**Step 1: Write the failing tests**

```ts
// src/lib/engine/ai.test.ts
import { describe, it, expect } from 'vitest';
import { aiTakeTurn } from './ai';
import { initBattle } from './battle';
import { createBarbarianHero } from './hero';
import { BARBARIAN_UNITS } from './barbarian';

const goblin = BARBARIAN_UNITS.find((u) => u.name === 'Goblin')!;
const orc = BARBARIAN_UNITS.find((u) => u.name === 'Orc')!; // ranged, shots: 4

describe('aiTakeTurn', () => {
	it('moves toward the nearest enemy when out of range and melee', () => {
		const hero = createBarbarianHero();
		const state = initBattle([{ unit: goblin, count: 5 }], [{ unit: goblin, count: 5 }], hero);
		const mover = state.units.find((u) => u.side === 'player')!;
		const action = aiTakeTurn(state, mover.id);
		expect(action.type).toBe('move');
	});

	it('shoots the nearest enemy when the unit is ranged', () => {
		const hero = createBarbarianHero();
		const state = initBattle([{ unit: orc, count: 3 }], [{ unit: goblin, count: 5 }], hero);
		const shooter = state.units.find((u) => u.side === 'player')!;
		const enemy = state.units.find((u) => u.side === 'enemy')!;
		expect(aiTakeTurn(state, shooter.id)).toEqual({ type: 'shoot', targetId: enemy.id });
	});

	it('attacks when already adjacent to an enemy', () => {
		const hero = createBarbarianHero();
		const state = initBattle([{ unit: goblin, count: 5 }], [{ unit: goblin, count: 5 }], hero);
		const player = state.units.find((u) => u.side === 'player')!;
		const enemy = state.units.find((u) => u.side === 'enemy')!;
		player.pos = { col: 0, row: 0 };
		enemy.pos = { col: 1, row: 0 };
		expect(aiTakeTurn(state, player.id)).toEqual({ type: 'attack', targetId: enemy.id });
	});

	it('waits when there are no living enemies', () => {
		const hero = createBarbarianHero();
		const state = initBattle([{ unit: goblin, count: 5 }], [{ unit: goblin, count: 5 }], hero);
		const enemy = state.units.find((u) => u.side === 'enemy')!;
		enemy.count = 0;
		const player = state.units.find((u) => u.side === 'player')!;
		expect(aiTakeTurn(state, player.id)).toEqual({ type: 'wait' });
	});
});
```

**Step 2: Run to verify failure.**

**Step 3: Implement**

```ts
// src/lib/engine/ai.ts
import type { BattleState } from './turnOrder';
import { findPath, getNeighbours, isInRange, type Position } from './grid';

export type BattleAction =
	| { type: 'move'; to: Position }
	| { type: 'attack'; targetId: string }
	| { type: 'shoot'; targetId: string }
	| { type: 'wait' };

function chebyshevDistance(a: Position, b: Position): number {
	return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

export function aiTakeTurn(state: BattleState, unitId: string): BattleAction {
	const unit = state.units.find((u) => u.id === unitId);
	if (!unit || unit.count === 0) return { type: 'wait' };

	const enemies = state.units.filter((u) => u.side !== unit.side && u.count > 0);
	if (enemies.length === 0) return { type: 'wait' };

	const nearest = enemies.reduce((closest, enemy) =>
		chebyshevDistance(unit.pos, enemy.pos) < chebyshevDistance(unit.pos, closest.pos)
			? enemy
			: closest
	);

	if (unit.definition.shots > 0) {
		return { type: 'shoot', targetId: nearest.id };
	}

	if (isInRange(unit.pos, nearest.pos, 1)) {
		return { type: 'attack', targetId: nearest.id };
	}

	const adjacentFreeCells = getNeighbours(state.grid, nearest.pos.col, nearest.pos.row).filter(
		(cell) => !cell.blocked && !cell.occupant
	);

	let bestPath: Position[] = [];
	for (const cell of adjacentFreeCells) {
		const path = findPath(state.grid, unit.pos, { col: cell.col, row: cell.row });
		if (path.length > 0 && (bestPath.length === 0 || path.length < bestPath.length)) {
			bestPath = path;
		}
	}

	if (bestPath.length === 0) return { type: 'wait' };

	const steps = bestPath.slice(0, unit.definition.speed);
	const destination = steps[steps.length - 1];
	return { type: 'move', to: { col: destination.col, row: destination.row } };
}
```

**Step 4: Run to verify pass**

```bash
npx vitest run src/lib/engine/ai.test.ts src/lib/engine/battle.test.ts
```

Expected: PASS for both files now that `ai.ts` exists.

**Step 5: Commit**

```bash
git add src/lib/engine/ai.ts src/lib/engine/ai.test.ts
git commit -m "feat(engine): add basic move/attack/shoot AI"
```

---

## Task 10: Demo wiring page

**Files:**
- Modify: `src/routes/+page.svelte`

**Step 1: Write the demo**

```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import { initBattle, applyAction, checkBattleEnd } from '$lib/engine/battle';
	import { aiTakeTurn } from '$lib/engine/ai';
	import { createBarbarianHero } from '$lib/engine/hero';
	import { BARBARIAN_UNITS } from '$lib/engine/barbarian';

	onMount(() => {
		const goblin = BARBARIAN_UNITS.find((u) => u.name === 'Goblin')!;
		const orc = BARBARIAN_UNITS.find((u) => u.name === 'Orc')!;
		const hero = createBarbarianHero();

		let state = initBattle(
			[{ unit: goblin, count: 10 }],
			[{ unit: orc, count: 5 }],
			hero
		);

		console.log('Battle start', state);

		let turns = 0;
		while (checkBattleEnd(state) === null && turns < 200) {
			const unitId = state.currentUnitId;
			if (!unitId) break;
			const action = aiTakeTurn(state, unitId);
			state = applyAction(state, action);
			console.log(`Turn ${turns}:`, action, '-> round', state.round);
			turns++;
		}

		console.log('Battle result:', checkBattleEnd(state));
		console.log('Final state:', state);
	});
</script>

<h1>Warlords</h1>
<p>Engine demo running — open the browser console to see battle output.</p>
```

**Step 2: Manually verify**

```bash
npm run dev
```

Open the printed local URL, open devtools console, confirm you see `Battle start`, a sequence of `Turn N` logs, and a final `Battle result` of `player_wins` or `enemy_wins` (not stuck at `null` after 200 turns — if it is, that's a bug to chase before moving on).

**Step 3: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat: wire engine into a console demo battle on the home page"
```

---

## Task 11: Full verification pass

**Step 1: Type-check**

```bash
npm run check
```

Expected: zero TypeScript errors.

**Step 2: Run the full test suite**

```bash
npx vitest run
```

Expected: all suites pass (grid, units, barbarian, hero, combat, turnOrder, battle, ai).

**Step 3: Production build**

```bash
npm run build
```

Expected: succeeds, static output in `build/`.

**Step 4: Final commit (if anything is unstaged)**

```bash
git status
git add -A
git commit -m "chore: verify engine core milestone (typecheck, tests, build all green)"
```
