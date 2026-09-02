// One popup, shared by every keyword on the page. Dozens of terms can be on
// screen at once — in a unit's ability list, in a draft card — and each of them
// mounting its own card would be wasteful and would let two open at once.

import type { KeywordTarget } from '$lib/compendium/keywords';

/** Long enough that a cursor crossing a sentence does not strobe. */
export const OPEN_DELAY = 150;
/** The safe bridge: time to travel from the term into the popup. */
export const CLOSE_DELAY = 200;

interface PopupState {
  /** Drill-down history. The last entry is what is shown; earlier ones are
   *  what `back()` returns to. */
  trail: KeywordTarget[];
  /** The element the popup points at — always the term first hovered, even
   *  after drilling into a different entry. */
  anchor: HTMLElement;
  /** Opened from the keyboard, so focus should move into the popup. */
  fromKeyboard: boolean;
}

let state = $state<PopupState | null>(null);
let closeTimer: ReturnType<typeof setTimeout> | undefined;

function cancelClose() {
  clearTimeout(closeTimer);
  closeTimer = undefined;
}

export const keywordPopup = {
  get open(): boolean {
    return state !== null;
  },
  get target(): KeywordTarget | null {
    return state?.trail.at(-1) ?? null;
  },
  get anchor(): HTMLElement | null {
    return state?.anchor ?? null;
  },
  get fromKeyboard(): boolean {
    return state?.fromKeyboard ?? false;
  },
  /** True once the reader has drilled at least one level in. */
  get canGoBack(): boolean {
    return (state?.trail.length ?? 0) > 1;
  },

  show(target: KeywordTarget, anchor: HTMLElement, fromKeyboard = false) {
    cancelClose();
    state = { trail: [target], anchor, fromKeyboard };
  },

  /** Follow a term inside the popup, replacing what it shows. Cards are never
   *  stacked: the pool contains reference cycles, and a tower of them runs off
   *  the bottom of a phone. */
  drill(target: KeywordTarget) {
    cancelClose();
    if (state) state = { ...state, trail: [...state.trail, target] };
  },

  back() {
    cancelClose();
    if (state && state.trail.length > 1) state = { ...state, trail: state.trail.slice(0, -1) };
  },

  /** Start the bridge timer. Entering the popup cancels it. */
  scheduleClose() {
    cancelClose();
    closeTimer = setTimeout(() => {
      state = null;
      closeTimer = undefined;
    }, CLOSE_DELAY);
  },

  keepOpen() {
    cancelClose();
  },

  close() {
    cancelClose();
    state = null;
  },
};

/** Dismiss the popup from outside the keyword system — a battle action being
 *  dispatched, say, which must not leave a card sitting over the board. */
export const closeKeywordPopup = () => keywordPopup.close();
