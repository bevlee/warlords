// The words the rules use but never explain.
//
// Ability and artifact text leans on a vocabulary a new player has no way to
// learn: "primary", "retaliation", "engaged", "ATB". Each one had no entry to
// point at, so the text either had to define it inline every time — which is
// how descriptions bloat — or leave the reader stuck.
//
// These are entries like any other: they get a compendium page, and `[[…]]`
// markup can link a term straight to its definition where it is used.

export interface ConceptDef {
  id: string;
  name: string;
  /** One or two sentences. A player reads this in a hover card mid-battle, so
   *  it has to land without a second paragraph. */
  description: string;
}

export const CONCEPTS: ConceptDef[] = [
  {
    id: 'atb',
    name: 'ATB',
    description:
      'The turn gauge. Every stack fills a bar from 0% to 100% and acts when it is full, then starts again from empty. ' +
      '[[initiative]] sets how fast it fills, so an effect that "returns a stack at 50% ATB" means it starts half full ' +
      'and its next turn comes twice as soon; 100% means it acts again immediately.',
  },
  {
    id: 'stack',
    name: 'Stack',
    description:
      'A group of identical creatures that moves, fights and dies as one. Damage is dealt to the group as a whole — ' +
      'creatures die off it one at a time — and its attack scales with how many are left alive.',
  },
  {
    id: 'primary_target',
    name: 'Primary target',
    description:
      'The stack an attack is aimed at, as opposed to anything caught beside it. Splash, bites and chain hits are ' +
      'secondary; abilities that trigger "on a primary kill" need the aimed-at stack to die, not a splashed one.',
  },
  {
    id: 'retaliation',
    name: 'Retaliation',
    description:
      'A stack that survives a melee attack strikes back once, immediately, at no cost to its own turn. ' +
      'It can only do so once per round unless it has Unlimited Retaliation, and abilities that attack ' +
      '"without retaliation" avoid the counterblow entirely.',
  },
  {
    id: 'engaged',
    name: 'Engaged',
    description:
      'Standing next to a living enemy. A shooter that is engaged cannot fire unless something says otherwise, ' +
      'which is why melee stacks are sent to tie up archers.',
  },
  {
    id: 'charge',
    name: 'Charge',
    description:
      'Moving several cells and attacking in the same turn. Abilities that ask for "a 3-cell charge" measure the ' +
      'distance actually travelled before the blow lands, so starting adjacent to the target earns nothing.',
  },
  {
    id: 'overkill',
    name: 'Overkill',
    description:
      'Damage beyond what was needed to make a [[stack]] [[perished|perish]]. It is normally wasted; a few abilities pass some of it ' +
      'on to another enemy instead.',
  },
  {
    id: 'direct_attack',
    name: 'Direct attack',
    description:
      'A normal melee or ranged attack aimed directly at a [[primary_target|primary target]]. Splash damage, ' +
      'retaliations, spells and ongoing damage are not direct attacks.',
  },
  {
    id: 'perished',
    name: 'Perished',
    description:
      'A [[stack]] has perished when every creature in it has died. Effects that revive creatures in a surviving ' +
      'stack do not normally restore a perished stack unless they explicitly say so.',
  },
  {
    id: 'tier',
    name: 'Tier',
    description:
      'A creature’s rank from 1 to 7, roughly its power and cost. Every faction fields one unit per tier, and a ' +
      'few abilities care about the difference between them.',
  },
  {
    id: 'initiative',
    name: 'Initiative',
    description:
      'How fast a stack fills its [[atb]] gauge, and so how often it acts. 10 Initiative is one turn per round; ' +
      'double that and it acts twice as often.',
  },
  {
    id: 'luck',
    name: 'Luck',
    description:
      'The chance of a lucky strike, which deals double damage, or a fumble at negative Luck, which halves it. ' +
      'It runs from −3 to +3.',
  },
  {
    id: 'morale',
    name: 'Morale',
    description:
      'The chance a stack acts twice in a row, or at negative Morale freezes and skips its turn entirely. ' +
      'It runs from −3 to +3.',
  },
  {
    id: 'construct',
    name: 'Construct',
    description:
      'A built creature rather than a living one. Construct is shown as a type on the unit’s compendium entry; ' +
      'Gremlin’s Repair normally works only on these units.',
  },
  {
    id: 'affliction',
    name: 'Affliction',
    description:
      'Any negative effect on a stack, counting a burn and negative [[morale]] as well as named debuffs. ' +
      'Several Necromancer artifacts scale with how many a target is carrying.',
  },
];

export const CONCEPT_IDS = CONCEPTS.map((c) => c.id);
