import { encode, decode } from "@msgpack/msgpack";

type MessageHandler = (msg: ServerMessage) => void;

export type ServerMessage =
  | {
      t: "game_start";
      q: { expression: string; answer: number };
      nextEnc: Uint8Array;
      startsAt: number;
      duration: number;
      opp: { userId: string; elo: number } | null;
    }
  | {
      t: "result";
      ok: boolean;
      key?: Uint8Array;
      nextEnc?: Uint8Array;
      scores: [number, number];
    }
  | { t: "opp_answered"; scores: [number, number] }
  | {
      t: "game_end";
      result: "win" | "lose" | "draw";
      eloDelta: number;
      newElo: number;
      scores: [number, number];
    }
  | { t: "opp_disconnected" }
  | { t: "pong"; st: number }
  | { t: "queued"; position: number }
  | {
      t: "matched";
      roomId: string;
      opponent: { userId: string; elo: number };
    }
  | { t: "left_queue" }
  | { t: "error"; msg: string };

export type ClientMessage =
  | { t: "answer"; a: number }
  | { t: "ping" }
  | { t: "join_queue"; userId: string; elo: number }
  | { t: "leave_queue" };

interface GameSocketOptions {
  url: string;
  onMessage: MessageHandler;
  onOpen?: () => void;
  onClose?: (code: number, reason: string) => void;
  maxRetries?: number;
  retryDelayMs?: number;
}

export class GameSocket {
  private ws: WebSocket | null = null;
  private options: Required<GameSocketOptions>;
  private retryCount = 0;
  private closed = false;

  constructor(options: GameSocketOptions) {
    this.options = {
      maxRetries: 5,
      retryDelayMs: 1000,
      onOpen: () => {},
      onClose: () => {},
      ...options,
    };
    this.connect();
  }

  private connect() {
    if (this.closed) return;

    this.ws = new WebSocket(this.options.url);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = () => {
      this.retryCount = 0;
      this.options.onOpen();
    };

    this.ws.onmessage = (event) => {
      const data =
        event.data instanceof ArrayBuffer
          ? new Uint8Array(event.data)
          : new TextEncoder().encode(event.data);
      const msg = decode(data) as ServerMessage;
      this.options.onMessage(msg);
    };

    this.ws.onclose = (event) => {
      this.options.onClose(event.code, event.reason);

      if (event.code === 1000 || this.closed) return;

      if (this.retryCount < this.options.maxRetries) {
        this.retryCount++;
        const delay =
          this.options.retryDelayMs * Math.pow(2, this.retryCount - 1);
        setTimeout(() => this.connect(), delay);
      }
    };
  }

  send(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(encode(msg));
    }
  }

  close() {
    this.closed = true;
    this.ws?.close(1000, "client closed");
  }

  get readyState() {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }
}
