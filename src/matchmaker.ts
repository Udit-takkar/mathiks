import { DurableObject } from "cloudflare:workers";

export class MatchMaker extends DurableObject {
  private queue: { id: string; elo: number; ws: WebSocket }[] = [];

  async fetch(request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer) {
    const msg = decode(message);

    if (msg.t === "join_queue") {
      this.queue.push({ id: msg.userId, elo: msg.elo, ws });
      this.queue.sort((a, b) => a.elo - b.elo);
      this.tryMatch();
    }
  }

  private tryMatch() {
    for (let i = 0; i < this.queue.length - 1; i++) {
      const a = this.queue[i];
      const b = this.queue[i + 1];

      if (Math.abs(a.elo - b.elo) <= 100) {
        const roomId = crypto.randomUUID();

        a.ws.send(
          encode({
            t: "matched",
            roomId,
            opponent: { name: "..", elo: b.elo },
          }),
        );
        b.ws.send(
          encode({
            t: "matched",
            roomId,
            opponent: { name: "..", elo: a.elo },
          }),
        );

        this.queue.splice(i, 2);
        return;
      }
    }
  }
}
