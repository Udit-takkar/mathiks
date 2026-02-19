import { DurableObject } from "cloudflare:workers";
import { encode, decode } from "./protocol";

interface QueuedPlayer {
  userId: string;
  elo: number;
  ws: WebSocket;
  joinedAt: number;
}

interface Env {
  ROOM: DurableObjectNamespace;
}

const INITIAL_ELO_RANGE = 50;
const MAX_ELO_RANGE = 300;
const WIDEN_INTERVAL_MS = 3_000;
const WIDEN_STEP = 50;

export class MatchMaker extends DurableObject<Env> {
  private queue: QueuedPlayer[] = [];
  private widenTimer: ReturnType<typeof setInterval> | null = null;

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const upgrade = request.headers.get("Upgrade");
    if (upgrade !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const userId = url.searchParams.get("userId") ?? "";
    this.ctx.acceptWebSocket(server, [userId]);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
    const msg = decode(
      message instanceof ArrayBuffer
        ? new Uint8Array(message)
        : new TextEncoder().encode(message),
    ) as Record<string, any>;

    if (msg.t === "join_queue") {
      const alreadyQueued = this.queue.some((p) => p.userId === msg.userId);
      if (alreadyQueued) {
        ws.send(encode({ t: "error", msg: "Already in queue" }));
        return;
      }

      this.queue.push({
        userId: msg.userId,
        elo: msg.elo,
        ws,
        joinedAt: Date.now(),
      });
      this.queue.sort((a, b) => a.elo - b.elo);

      ws.send(encode({ t: "queued", position: this.queue.length }));

      this.tryMatch();
      this.startWidening();
    }

    if (msg.t === "leave_queue") {
      this.removeFromQueue(ws);
      ws.send(encode({ t: "left_queue" }));
    }
  }

  async webSocketClose(ws: WebSocket) {
    this.removeFromQueue(ws);
  }

  private tryMatch() {
    const now = Date.now();

    for (let i = 0; i < this.queue.length; i++) {
      const player = this.queue[i];
      const waitTime = now - player.joinedAt;
      const eloRange =
        INITIAL_ELO_RANGE +
        Math.floor(waitTime / WIDEN_INTERVAL_MS) * WIDEN_STEP;
      const range = Math.min(eloRange, MAX_ELO_RANGE);

      for (let j = i + 1; j < this.queue.length; j++) {
        const opponent = this.queue[j];
        if (opponent.elo - player.elo > range) break;

        this.createMatch(player, opponent);
        this.queue.splice(j, 1);
        this.queue.splice(i, 1);

        if (this.queue.length === 0) this.stopWidening();
        return;
      }
    }
  }

  private createMatch(a: QueuedPlayer, b: QueuedPlayer) {
    const roomId = crypto.randomUUID();

    a.ws.send(
      encode({
        t: "matched",
        roomId,
        opponent: { userId: b.userId, elo: b.elo },
      }),
    );
    b.ws.send(
      encode({
        t: "matched",
        roomId,
        opponent: { userId: a.userId, elo: a.elo },
      }),
    );
  }

  private removeFromQueue(ws: WebSocket) {
    const idx = this.queue.findIndex((p) => p.ws === ws);
    if (idx !== -1) this.queue.splice(idx, 1);
    if (this.queue.length === 0) this.stopWidening();
  }

  private startWidening() {
    if (this.widenTimer) return;
    this.widenTimer = setInterval(() => this.tryMatch(), WIDEN_INTERVAL_MS);
  }

  private stopWidening() {
    if (this.widenTimer) {
      clearInterval(this.widenTimer);
      this.widenTimer = null;
    }
  }
}
