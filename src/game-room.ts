import { DurableObject } from "cloudflare:workers";

export class GameRoom extends DurableObject {
  private players: Map<WebSocket, PlayerState> = new Map();
  private scores: [number, number] = [0, 0];
  private scores: [number, number] = [0, 0];
  private questionIndex: number = 0;
  private seed: number = 0;
  private gameStartAt: number = 0;
  private gameDuration: number = 60_000;

  async fetch(request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server, ["player"]);

    if (this.ctx.getWebSockets().length === 2) {
      this.startGame();
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer) {
    const msg = decode(message);

    if (msg.t === "answer") {
      this.handleAnswer(ws, msg.a);
    }

    if (msg.t === "ping") {
      ws.send(encode({ t: "pong", st: Date.now() }));
    }
  }

  async webSocketClose(ws: WebSocket) {
    // Notify the other player, pause game, etc.
  }

  private async handleAnswer(ws: WebSocket, msg: { qId: string; a: number }) {
    const player = this.players.get(ws);
    const currentQ = generateQuestion(this.seed, player.questionIndex);
    if (msg.a !== currentQ.answer) {
      ws.send(encode({ t: "result", ok: false, scores: this.scores }));
      return;
    }

    this.scores[player.index]++;
    player.questionIndex++;

    const revealKey = player.nextQuestionKey;

    const nextNextQ = generateQuestion(this.seed, player.questionIndex + 1);
    const { encrypted, key } = await encryptQuestion(nextNextQ);
    player.nextQuestionKey = key;

    ws.send(
      encode({
        t: "result",
        ok: true,
        key: revealKey,
        nextEnc: encrypted,
        scores: this.scores,
      }),
    );

    const opponent = this.getOpponentSocket(ws);
    opponent.send(encode({ t: "opp_answered", scores: this.scores }));
  }

  private startGame() {
    this.gameStartedAt = Date.now();

    this.ctx.storage.setAlarm(this.gameStartAt + this.gameDuration);

    // Send game_start to both players with first question + encrypted second
    // ...
  }
  async alarm() {
    const sockets = this.ctx.getWebSockets();
    const result =
      this.scores[0] > this.scores[1]
        ? "p1_win"
        : this.scores[1] > this.scores[0]
          ? "p2_win"
          : "draw";
    // Calculate ELO changes
    // Send game_end to both players
    // Enqueue result to Cloudflare Queue for DB write
  }
}
