import { DurableObject } from "cloudflare:workers";
import { encode, decode, encryptQuestion } from "./protocol";
import { generateQuestion } from "./services/question";

interface PlayerState {
  index: 0 | 1;
  userId: string;
  elo: number;
  questionIndex: number;
  nextQuestionKey: Uint8Array | null;
}

interface Env {
  mathiks_jobs: Queue;
}

export class GameRoom extends DurableObject<Env> {
  private players: Map<WebSocket, PlayerState> = new Map();
  private scores: [number, number] = [0, 0];
  private seed: number = 0;
  private gameStartAt: number = 0;
  private gameDuration: number = 60_000;

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId") ?? crypto.randomUUID();
    const elo = Number(url.searchParams.get("elo") ?? 1200);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const playerIndex = this.players.size as 0 | 1;
    this.ctx.acceptWebSocket(server, [userId]);

    this.players.set(server, {
      index: playerIndex,
      userId,
      elo,
      questionIndex: 0,
      nextQuestionKey: null,
    });

    if (this.players.size === 2) {
      await this.startGame();
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
    const msg = decode(
      message instanceof ArrayBuffer
        ? new Uint8Array(message)
        : new TextEncoder().encode(message),
    ) as Record<string, any>;

    if (msg.t === "answer") {
      await this.handleAnswer(ws, msg.a);
    }

    if (msg.t === "ping") {
      ws.send(encode({ t: "pong", st: Date.now() }));
    }
  }

  async webSocketClose(ws: WebSocket) {
    const player = this.players.get(ws);
    if (!player) return;

    const opponent = this.getOpponentSocket(ws);
    if (opponent) {
      opponent.send(encode({ t: "opp_disconnected" }));
    }

    this.players.delete(ws);
  }

  private async handleAnswer(ws: WebSocket, answer: number) {
    const player = this.players.get(ws);
    if (!player) return;

    const currentQ = generateQuestion(this.seed, player.questionIndex);
    if (answer !== currentQ.answer) {
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
    if (opponent) {
      opponent.send(encode({ t: "opp_answered", scores: this.scores }));
    }
  }

  private async startGame() {
    this.seed = Math.floor(Math.random() * 2_147_483_647);
    this.gameStartAt = Date.now();
    this.scores = [0, 0];

    this.ctx.storage.setAlarm(this.gameStartAt + this.gameDuration);

    for (const [ws, player] of this.players) {
      player.questionIndex = 0;

      const firstQ = generateQuestion(this.seed, 0);
      const secondQ = generateQuestion(this.seed, 1);
      const { encrypted, key } = await encryptQuestion(secondQ);
      player.nextQuestionKey = key;

      const opponents = [...this.players.entries()].find(([s]) => s !== ws);
      const oppState = opponents?.[1];

      ws.send(
        encode({
          t: "game_start",
          q: firstQ,
          nextEnc: encrypted,
          startsAt: this.gameStartAt,
          duration: this.gameDuration,
          opp: oppState ? { userId: oppState.userId, elo: oppState.elo } : null,
        }),
      );
    }
  }

  async alarm() {
    const players = [...this.players.entries()];
    const [p1State, p2State] = players.map(([, p]) => p);

    const result =
      this.scores[0] > this.scores[1]
        ? "p1_win"
        : this.scores[1] > this.scores[0]
          ? "p2_win"
          : "draw";

    const p1Won = result === "p1_win";
    const p2Won = result === "p2_win";
    const isDraw = result === "draw";

    const p1EloDelta = calculateElo(
      p1State.elo,
      p2State.elo,
      p1Won ? 1 : isDraw ? 0.5 : 0,
    );
    const p2EloDelta = calculateElo(
      p2State.elo,
      p1State.elo,
      p2Won ? 1 : isDraw ? 0.5 : 0,
    );

    for (const [ws, player] of this.players) {
      const isP1 = player.index === 0;
      const won = isP1 ? p1Won : p2Won;
      const eloDelta = isP1 ? p1EloDelta : p2EloDelta;

      ws.send(
        encode({
          t: "game_end",
          result: won ? "win" : isDraw ? "draw" : "lose",
          eloDelta,
          newElo: player.elo + eloDelta,
          scores: this.scores,
        }),
      );
      ws.close(1000, "game over");
    }

    await this.env.mathiks_jobs.send({
      type: "match_result",
      player1: {
        userId: p1State.userId,
        elo: p1State.elo,
        eloDelta: p1EloDelta,
        score: this.scores[0],
      },
      player2: {
        userId: p2State.userId,
        elo: p2State.elo,
        eloDelta: p2EloDelta,
        score: this.scores[1],
      },
      seed: this.seed,
      duration: this.gameDuration,
      timestamp: Date.now(),
    });

    this.players.clear();
  }

  private getOpponentSocket(ws: WebSocket): WebSocket | null {
    for (const [socket] of this.players) {
      if (socket !== ws) return socket;
    }
    return null;
  }
}

function calculateElo(
  playerElo: number,
  opponentElo: number,
  score: number,
  k = 32,
): number {
  const expected = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
  return Math.round(k * (score - expected));
}
