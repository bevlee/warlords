import type { ClientMessage, ServerMessage } from './protocol';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'lost';

interface SocketLike {
  readyState: number;
  onopen: ((event: any) => void) | null;
  onmessage: ((event: any) => void) | null;
  onclose: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  send(data: string): void;
  close(): void;
}

export interface WsClientOptions {
  socketFactory?: (url: string) => SocketLike;
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
  heartbeatMs?: number;
  setRepeating?: (fn: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearRepeating?: (timer: ReturnType<typeof setInterval>) => void;
}

export class MultiplayerClient {
  private socket: SocketLike | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private awaitingPong = false;
  private stopped = true;
  private failures = 0;
  private lastSeq = 0;
  private hasSequence = false;
  private statusValue: ConnectionStatus = 'idle';
  private readonly messageListeners = new Set<(message: ServerMessage) => void>();
  private readonly statusListeners = new Set<(status: ConnectionStatus) => void>();
  private readonly socketFactory: (url: string) => SocketLike;
  private readonly setTimer: NonNullable<WsClientOptions['setTimer']>;
  private readonly clearTimer: NonNullable<WsClientOptions['clearTimer']>;
  private readonly heartbeatMs: number;
  private readonly setRepeating: NonNullable<WsClientOptions['setRepeating']>;
  private readonly clearRepeating: NonNullable<WsClientOptions['clearRepeating']>;

  constructor(private readonly url: string, private readonly token: string, options: WsClientOptions = {}) {
    this.socketFactory = options.socketFactory ?? (url => new WebSocket(url));
    this.setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = options.clearTimer ?? (timer => clearTimeout(timer));
    this.heartbeatMs = options.heartbeatMs ?? 15_000;
    this.setRepeating = options.setRepeating ?? ((fn, ms) => setInterval(fn, ms));
    this.clearRepeating = options.clearRepeating ?? (timer => clearInterval(timer));
  }

  get status(): ConnectionStatus {
    return this.statusValue;
  }

  get latestSeq(): number {
    return this.lastSeq;
  }

  start(lastSeq?: number): void {
    if (lastSeq !== undefined) {
      this.lastSeq = lastSeq;
      this.hasSequence = true;
    }
    this.stopped = false;
    this.connect();
    this.heartbeatTimer = this.setRepeating(this.heartbeat, this.heartbeatMs);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility);
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) this.clearTimer(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.heartbeatTimer) this.clearRepeating(this.heartbeatTimer);
    this.heartbeatTimer = null;
    this.awaitingPong = false;
    this.socket?.close();
    this.socket = null;
    this.setStatus('idle');
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
  }

  send(message: ClientMessage): boolean {
    if (!this.socket || this.socket.readyState !== 1) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  onMessage(listener: (message: ServerMessage) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onStatus(listener: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.statusValue);
    return () => this.statusListeners.delete(listener);
  }

  private connect(): void {
    if (this.stopped) return;
    this.setStatus(this.failures >= 2 ? 'lost' : 'connecting');
    const socket = this.socketFactory(this.url);
    this.socket = socket;
    socket.onopen = () => {
      socket.send(JSON.stringify({
        type: 'hello',
        token: this.token,
        ...(this.hasSequence ? { lastSeq: this.lastSeq } : {}),
      } satisfies ClientMessage));
    };
    socket.onmessage = event => {
      let message: ServerMessage;
      try {
        message = JSON.parse(event.data) as ServerMessage;
      } catch {
        return;
      }
      if (message.type === 'ping') {
        this.send({ type: 'pong' });
        return;
      }
      if (message.type === 'pong') {
        this.awaitingPong = false;
        return;
      }
      if (message.type === 'hello.ok') {
        this.failures = 0;
        this.awaitingPong = false;
        this.setStatus('connected');
      } else if (message.type === 'battle.applied') {
        this.hasSequence = true;
        this.lastSeq = Math.max(this.lastSeq, message.seq);
      } else if (message.type === 'battle.resync') {
        this.hasSequence = true;
        this.lastSeq = message.lastSeq;
      } else if (message.type === 'room.state' && message.phase === 'battle') {
        this.hasSequence = true;
      } else if (message.type === 'error' && message.code === 'superseded') {
        this.stopped = true;
      }
      for (const listener of this.messageListeners) listener(message);
    };
    socket.onerror = () => {};
    socket.onclose = () => {
      if (this.socket === socket) this.socket = null;
      if (!this.stopped) this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    this.failures++;
    this.setStatus(this.failures >= 2 ? 'lost' : 'connecting');
    const delay = Math.min(1000 * 2 ** (this.failures - 1), 15_000);
    this.reconnectTimer = this.setTimer(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private setStatus(status: ConnectionStatus): void {
    if (status === this.statusValue) return;
    this.statusValue = status;
    for (const listener of this.statusListeners) listener(status);
  }

  private readonly onVisibility = () => {
    if (document.visibilityState !== 'visible' || this.stopped || this.socket?.readyState === 1) return;
    if (this.reconnectTimer) this.clearTimer(this.reconnectTimer);
    this.reconnectTimer = null;
    this.connect();
  };

  private readonly heartbeat = () => {
    if (this.statusValue !== 'connected' || !this.socket || this.socket.readyState !== 1) return;
    if (this.awaitingPong) {
      this.socket.close();
      return;
    }
    this.awaitingPong = true;
    this.send({ type: 'ping' });
  };
}
