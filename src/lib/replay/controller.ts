import type { BattleAction, BattleState } from '$lib/engine/types';
import type { ReplayChat, ReplayTimeline } from './timeline';

export interface ReplaySink {
  apply(action: BattleAction): Promise<BattleState>;
  resync(state: BattleState): void;
}

export interface ReplaySnapshot {
  cursor: number;
  total: number;
  paused: boolean;
  running: boolean;
  done: boolean;
  chat: ReplayChat[];
}

export interface ReplayControllerOptions {
  delay?: (ms: number) => Promise<void>;
  interActionMs?: number;
  onChange?: (snapshot: ReplaySnapshot) => void;
}

export class ReplayController {
  private sink: ReplaySink | null = null;
  private cursor = 0;
  private paused = true;
  private running = false;
  private speed = 1;
  private generation = 0;
  private readonly delay: (ms: number) => Promise<void>;
  private readonly interActionMs: number;
  private readonly onChange?: (snapshot: ReplaySnapshot) => void;

  constructor(private readonly timeline: ReplayTimeline, options: ReplayControllerOptions = {}) {
    this.delay = options.delay ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
    this.interActionMs = options.interActionMs ?? 180;
    this.onChange = options.onChange;
  }

  attach(sink: ReplaySink): void {
    this.sink = sink;
    sink.resync(this.stateAtCursor());
    this.emit();
  }

  setSpeed(speed: number): void {
    if (![0.5, 1, 2, 4].includes(speed)) throw new Error('unsupported replay speed');
    this.speed = speed;
  }

  pause(): void {
    this.paused = true;
    this.emit();
  }

  async play(): Promise<void> {
    if (!this.sink || this.running || this.cursor >= this.timeline.frames.length) return;
    this.paused = false;
    this.running = true;
    const generation = ++this.generation;
    this.emit();
    try {
      while (!this.paused && this.cursor < this.timeline.frames.length && generation === this.generation) {
        const frame = this.timeline.frames[this.cursor];
        await this.sink.apply(frame.action);
        if (generation !== this.generation) return;
        this.cursor++;
        this.emit();
        if (this.paused || this.cursor >= this.timeline.frames.length) break;
        await this.delay(this.interActionMs / this.speed);
      }
    } finally {
      if (generation === this.generation) {
        this.running = false;
        if (this.cursor >= this.timeline.frames.length) this.paused = true;
        this.emit();
      }
    }
  }

  restart(): void {
    this.generation++;
    this.cursor = 0;
    this.paused = true;
    this.running = false;
    this.sink?.resync(this.timeline.initialState);
    this.emit();
  }

  snapshot(): ReplaySnapshot {
    const frameChat = this.timeline.frames.slice(0, this.cursor).flatMap(frame => frame.chat);
    const done = this.cursor >= this.timeline.frames.length;
    return {
      cursor: this.cursor,
      total: this.timeline.frames.length,
      paused: this.paused,
      running: this.running,
      done,
      chat: [...this.timeline.initialChat, ...frameChat, ...(done ? this.timeline.trailingChat : [])],
    };
  }

  private stateAtCursor(): BattleState {
    return this.cursor === 0 ? this.timeline.initialState : this.timeline.frames[this.cursor - 1].state;
  }

  private emit(): void {
    this.onChange?.(this.snapshot());
  }
}
