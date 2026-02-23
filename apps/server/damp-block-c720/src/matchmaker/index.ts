import { DurableObject } from "cloudflare:workers";
import { decode, encode } from "../protocol";
import {
  INITIAL_ELO_RANGE,
  MAX_ELO_RANGE,
  parseShard,
  SHARD_SIZE,
  WIDEN_INTERVAL_MS,
  WIDEN_STEP,
} from "../shard-config";
import { CrossShardClient } from "./cross-shard-client";
import { CrossShardCoordinator } from "./cross-shard-coordinator";
import { LocalMatcher } from "./local-matcher";
import { QueueStore } from "./queue-store";
import {
  isClientQueueMessage,
  isCrossShardRequest,
  type MatchMakerEnv,
  type PlayerIdentity,
  type QueuedPlayer,
  type ServerQueueMessage,
  type WebSocketSessionData,
} from "./types";

const STALE_LOCK_MS = 10_000;

function eloRange(waitTimeMs: number): number {
  return Math.min(
    INITIAL_ELO_RANGE +
      Math.floor(waitTimeMs / WIDEN_INTERVAL_MS) * WIDEN_STEP,
    MAX_ELO_RANGE,
  );
}

function decodeMessage(message: ArrayBuffer | string): unknown {
  const payload =
    message instanceof ArrayBuffer
      ? new Uint8Array(message)
      : new TextEncoder().encode(message);
  return decode(payload);
}

export class MatchMaker extends DurableObject<MatchMakerEnv> {
  private readonly queueStore = new QueueStore();
  private readonly localMatcher = new LocalMatcher(eloRange);
  private readonly wsSessionData = new Map<WebSocket, WebSocketSessionData>();

  private widenTimer: ReturnType<typeof setInterval> | null = null;
  private cycleRunning = false;
  private cycleQueued = false;

  private shardName = "";
  private shardMinElo = 0;
  private shardMaxElo = 0;

  private _crossShardClient: CrossShardClient | null = null;
  private _crossShardCoordinator: CrossShardCoordinator | null = null;

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/cross-shard") {
      return this.handleCrossShardRequest(request);
    }

    if (url.pathname === "/status") {
      return Response.json({
        shard: this.shardName,
        queueSize: this.queueStore.size,
        eloRange: [this.shardMinElo, this.shardMaxElo],
      });
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    this.initializeShard(url.searchParams.get("shardName") ?? "");

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const sessionData = this.readSessionData(url);
    this.ctx.acceptWebSocket(server, [
      sessionData.userId,
      String(sessionData.elo),
      sessionData.name,
    ]);
    this.wsSessionData.set(server, sessionData);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
    let decoded: unknown;
    try {
      decoded = decodeMessage(message);
    } catch {
      this.send(ws, { t: "error", msg: "Invalid message payload" });
      return;
    }

    if (!isClientQueueMessage(decoded)) {
      this.send(ws, { t: "error", msg: "Unknown message type" });
      return;
    }

    switch (decoded.t) {
      case "join_queue":
        await this.handleJoinQueue(ws);
        return;
      case "leave_queue":
        this.handleLeaveQueue(ws);
        return;
      case "ping":
        this.send(ws, { t: "pong", st: Date.now() });
        return;
    }
  }

  async webSocketClose(ws: WebSocket) {
    this.removeFromQueue(ws);
    this.wsSessionData.delete(ws);
  }

  private get crossShardClient(): CrossShardClient {
    if (!this._crossShardClient) {
      this._crossShardClient = new CrossShardClient(this.env.MATCHMAKER);
    }
    return this._crossShardClient;
  }

  private get crossShardCoordinator(): CrossShardCoordinator {
    if (!this._crossShardCoordinator) {
      this._crossShardCoordinator = new CrossShardCoordinator(
        this.queueStore,
        this.crossShardClient,
        eloRange,
      );
    }
    return this._crossShardCoordinator;
  }

  private readSessionData(url: URL): WebSocketSessionData {
    const rawElo = Number(url.searchParams.get("elo") ?? "1200");
    return {
      userId: url.searchParams.get("userId") ?? "",
      elo: Number.isFinite(rawElo) ? rawElo : 1200,
      name: url.searchParams.get("name") ?? "",
    };
  }

  private initializeShard(shardParam: string): void {
    if (!shardParam || this.shardName) return;

    this.shardName = shardParam;
    const { bucket } = parseShard(shardParam);
    this.shardMinElo = bucket * SHARD_SIZE;
    this.shardMaxElo = (bucket + 1) * SHARD_SIZE;
  }

  private getWsData(ws: WebSocket): WebSocketSessionData | null {
    const cached = this.wsSessionData.get(ws);
    if (cached) return cached;

    const tags = this.ctx.getTags(ws);
    if (tags.length < 2) return null;

    const parsedElo = Number(tags[1]);
    const sessionData = {
      userId: tags[0],
      elo: Number.isFinite(parsedElo) ? parsedElo : 1200,
      name: tags[2] ?? "",
    };
    this.wsSessionData.set(ws, sessionData);
    return sessionData;
  }

  private async handleJoinQueue(ws: WebSocket): Promise<void> {
    const sessionData = this.getWsData(ws);
    if (!sessionData) {
      this.send(ws, { t: "error", msg: "Missing websocket session data" });
      return;
    }

    if (this.queueStore.hasSocket(ws)) {
      this.send(ws, { t: "error", msg: "Already in queue" });
      return;
    }

    this.queueStore.enqueue({
      userId: sessionData.userId,
      elo: sessionData.elo,
      name: sessionData.name,
      ws,
      joinedAt: Date.now(),
    });

    this.send(ws, { t: "queued", position: this.queueStore.size });
    this.startWidening();
    await this.requestMatchCycle();
  }

  private handleLeaveQueue(ws: WebSocket): void {
    this.removeFromQueue(ws);
    this.send(ws, { t: "left_queue" });
  }

  private removeFromQueue(ws: WebSocket): void {
    this.queueStore.removeBySocket(ws);
    if (this.queueStore.isEmpty()) {
      this.stopWidening();
    }
  }

  private async requestMatchCycle(): Promise<void> {
    if (this.cycleRunning) {
      this.cycleQueued = true;
      return;
    }

    this.cycleRunning = true;
    try {
      do {
        this.cycleQueued = false;
        await this.runMatchCycleOnce();
      } while (this.cycleQueued);
    } finally {
      this.cycleRunning = false;
    }
  }

  private async runMatchCycleOnce(): Promise<void> {
    const now = Date.now();
    this.queueStore.cleanupStaleLocks(now, STALE_LOCK_MS);

    const localMatches = this.localMatcher.findMatches(this.queueStore.players(), now);
    if (localMatches.length > 0) {
      const matchedPlayers: QueuedPlayer[] = [];
      for (const { player, opponent } of localMatches) {
        this.createLocalMatch(player, opponent);
        matchedPlayers.push(player, opponent);
      }
      this.queueStore.removeMany(matchedPlayers);
    }

    if (this.queueStore.isEmpty()) {
      this.stopWidening();
      return;
    }

    if (!this.shardName) return;

    const overflow = await this.crossShardCoordinator.tryMatch({
      shardName: this.shardName,
      shardMinElo: this.shardMinElo,
      shardMaxElo: this.shardMaxElo,
      now,
    });

    if (overflow.kind === "matched") {
      this.send(overflow.candidate.ws, {
        t: "matched",
        roomId: overflow.roomId,
        opponent: overflow.opponent,
      });
      this.queueStore.remove(overflow.candidate);
      this.cycleQueued = true;
    }

    if (this.queueStore.isEmpty()) {
      this.stopWidening();
    }
  }

  private createLocalMatch(
    a: QueuedPlayer,
    b: QueuedPlayer,
  ): void {
    const roomId = crypto.randomUUID();
    this.send(a.ws, {
      t: "matched",
      roomId,
      opponent: { userId: b.userId, elo: b.elo, name: b.name },
    });
    this.send(b.ws, {
      t: "matched",
      roomId,
      opponent: { userId: a.userId, elo: a.elo, name: a.name },
    });
  }

  private async handleCrossShardRequest(request: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { t: "error", msg: "Invalid JSON payload" },
        { status: 400 },
      );
    }

    if (!isCrossShardRequest(body)) {
      return Response.json(
        { t: "error", msg: "Invalid cross-shard request" },
        { status: 400 },
      );
    }

    switch (body.t) {
      case "find_match":
        return Response.json(this.handleFindMatch(body.player));
      case "confirm_match":
        return Response.json(this.handleConfirmMatch(body.userId, body.roomId));
      case "cancel_match":
        return Response.json(this.handleCancelMatch(body.userId));
    }
  }

  private handleFindMatch(remotePlayer: PlayerIdentity) {
    const now = Date.now();

    for (const localPlayer of this.queueStore.players()) {
      if (localPlayer.crossShardLock) continue;

      const range = eloRange(now - localPlayer.joinedAt);
      if (Math.abs(localPlayer.elo - remotePlayer.elo) > range) continue;

      const roomId = crypto.randomUUID();
      localPlayer.crossShardLock = true;
      localPlayer.pendingMatch = {
        roomId,
        opponent: remotePlayer,
        lockedAt: now,
      };

      return {
        t: "match_found" as const,
        roomId,
        opponent: {
          userId: localPlayer.userId,
          elo: localPlayer.elo,
          name: localPlayer.name,
        },
      };
    }

    return { t: "no_match" as const };
  }

  private handleConfirmMatch(userId: string, roomId: string) {
    const localPlayer = this.queueStore.getByUserId(userId);
    const pendingMatch = localPlayer?.pendingMatch;
    if (!localPlayer || !pendingMatch || pendingMatch.roomId !== roomId) {
      return { t: "expired" as const };
    }

    this.send(localPlayer.ws, {
      t: "matched",
      roomId: pendingMatch.roomId,
      opponent: pendingMatch.opponent,
    });
    this.queueStore.remove(localPlayer);
    if (this.queueStore.isEmpty()) {
      this.stopWidening();
    } else {
      this.cycleQueued = true;
      void this.requestMatchCycle();
    }

    return { t: "confirmed" as const };
  }

  private handleCancelMatch(userId: string) {
    this.queueStore.releaseCrossShardLockByUserId(userId);
    this.cycleQueued = true;
    void this.requestMatchCycle();
    return { t: "cancelled" as const };
  }

  private startWidening(): void {
    if (this.widenTimer) return;
    this.widenTimer = setInterval(() => {
      void this.requestMatchCycle();
    }, WIDEN_INTERVAL_MS);
  }

  private stopWidening(): void {
    if (!this.widenTimer) return;
    clearInterval(this.widenTimer);
    this.widenTimer = null;
  }

  private send(ws: WebSocket, message: ServerQueueMessage): void {
    try {
      ws.send(encode(message));
    } catch {
      // If websocket is already closed, dropping the event keeps matchmaking progress.
    }
  }
}
