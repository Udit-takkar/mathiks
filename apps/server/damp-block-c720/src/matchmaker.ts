import { DurableObject } from "cloudflare:workers";
import { encode, decode } from "./protocol";
import {
  SHARD_SIZE,
  INITIAL_ELO_RANGE,
  MAX_ELO_RANGE,
  WIDEN_INTERVAL_MS,
  WIDEN_STEP,
  parseShard,
  getSiblingShards,
  getNeighborBucketShards,
} from "./shard-config";

interface QueuedPlayer {
  userId: string;
  elo: number;
  name: string;
  ws: WebSocket;
  joinedAt: number;
  crossShardLock?: boolean;
  pendingMatch?: {
    roomId: string;
    opponent: { userId: string; elo: number; name: string };
    lockedAt: number;
  };
}

interface Env {
  ROOM: DurableObjectNamespace;
  MATCHMAKER: DurableObjectNamespace;
}

const STALE_LOCK_MS = 10_000;

function eloRange(waitTime: number): number {
  return Math.min(
    INITIAL_ELO_RANGE +
      Math.floor(waitTime / WIDEN_INTERVAL_MS) * WIDEN_STEP,
    MAX_ELO_RANGE,
  );
}

function pickRandom<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const copy = [...arr];
  const result: T[] = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    result.push(copy[idx]);
    copy[idx] = copy[copy.length - 1];
    copy.pop();
  }
  return result;
}

export class MatchMaker extends DurableObject<Env> {
  private queue: QueuedPlayer[] = [];
  private byWs = new Map<WebSocket, QueuedPlayer>();
  private byUserId = new Map<string, QueuedPlayer>();
  private wsData = new Map<
    WebSocket,
    { userId: string; elo: number; name: string }
  >();
  private widenTimer: ReturnType<typeof setInterval> | null = null;
  private shardName = "";
  private shardMinElo = 0;
  private shardMaxElo = 0;

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/cross-shard") {
      return this.handleCrossShardRequest(request);
    }

    if (url.pathname === "/status") {
      return Response.json({
        shard: this.shardName,
        queueSize: this.queue.length,
        eloRange: [this.shardMinElo, this.shardMaxElo],
      });
    }

    const upgrade = request.headers.get("Upgrade");
    if (upgrade !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const shardParam = url.searchParams.get("shardName") ?? "";
    if (shardParam && !this.shardName) {
      this.shardName = shardParam;
      const { bucket } = parseShard(shardParam);
      this.shardMinElo = bucket * SHARD_SIZE;
      this.shardMaxElo = (bucket + 1) * SHARD_SIZE;
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const userId = url.searchParams.get("userId") ?? "";
    const elo = Number(url.searchParams.get("elo") ?? "1200");
    const name = url.searchParams.get("name") ?? "";

    this.ctx.acceptWebSocket(server, [userId, String(elo), name]);
    this.wsData.set(server, { userId, elo, name });

    return new Response(null, { status: 101, webSocket: client });
  }

  private getWsData(ws: WebSocket): {
    userId: string;
    elo: number;
    name: string;
  } | null {
    let data = this.wsData.get(ws);
    if (data) return data;

    const tags = this.ctx.getTags(ws);
    if (tags.length >= 2) {
      data = { userId: tags[0], elo: Number(tags[1]), name: tags[2] ?? "" };
      this.wsData.set(ws, data);
      return data;
    }
    return null;
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
    const msg = decode(
      message instanceof ArrayBuffer
        ? new Uint8Array(message)
        : new TextEncoder().encode(message),
    ) as Record<string, any>;

    if (msg.t === "join_queue") {
      const data = this.getWsData(ws);
      if (!data) return;

      if (this.byWs.has(ws)) {
        ws.send(encode({ t: "error", msg: "Already in queue" }));
        return;
      }

      this.insertSorted({
        userId: data.userId,
        elo: data.elo,
        name: data.name,
        ws,
        joinedAt: Date.now(),
      });

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
    this.wsData.delete(ws);
  }

  private tryMatch() {
    const now = Date.now();

    for (const p of this.queue) {
      if (p.pendingMatch && now - p.pendingMatch.lockedAt > STALE_LOCK_MS) {
        p.crossShardLock = false;
        p.pendingMatch = undefined;
      }
    }

    const matched = new Set<number>();

    for (let i = 0; i < this.queue.length; i++) {
      if (matched.has(i)) continue;
      const player = this.queue[i];
      if (player.crossShardLock) continue;

      const range = eloRange(now - player.joinedAt);

      for (let j = i + 1; j < this.queue.length; j++) {
        if (matched.has(j)) continue;
        const opponent = this.queue[j];
        if (opponent.crossShardLock) continue;
        if (opponent.elo - player.elo > range) break;

        this.createMatch(player, opponent);
        matched.add(i);
        matched.add(j);
        break;
      }
    }

    if (matched.size > 0) {
      for (const idx of [...matched].sort((a, b) => b - a)) {
        const p = this.queue[idx];
        this.byWs.delete(p.ws);
        this.byUserId.delete(p.userId);
        this.queue.splice(idx, 1);
      }
    }

    if (this.queue.length === 0) this.stopWidening();

    this.tryOverflow();
  }

  // --- Cross-shard overflow (one candidate per cycle, parallel fan-out) ---

  private async tryOverflow() {
    const now = Date.now();

    const candidate = this.queue.find(
      (p) => !p.crossShardLock && now - p.joinedAt >= 5000,
    );
    if (!candidate) return;

    const waitTime = now - candidate.joinedAt;
    const range = eloRange(waitTime);

    const targets: string[] = [];
    targets.push(...getSiblingShards(this.shardName));

    if (
      waitTime >= WIDEN_INTERVAL_MS * 2 &&
      (candidate.elo - range < this.shardMinElo ||
        candidate.elo + range >= this.shardMaxElo)
    ) {
      targets.push(...getNeighborBucketShards(this.shardName));
    }

    if (targets.length === 0) return;

    const maxTargets = this.queue.length <= 10 ? targets.length : 3;
    const selected = pickRandom(targets, maxTargets);
    candidate.crossShardLock = true;

    try {
      const results = await Promise.allSettled(
        selected.map((target) => this.queryShard(target, candidate)),
      );

      const fulfilled = results
        .filter(
          (
            r,
          ): r is PromiseFulfilledResult<{
            target: string;
            roomId: string;
            opponent: { userId: string; elo: number; name: string };
          }> => r.status === "fulfilled",
        )
        .map((r) => r.value);

      if (fulfilled.length === 0) {
        if (this.byWs.has(candidate.ws)) candidate.crossShardLock = false;
        return;
      }

      for (let i = 1; i < fulfilled.length; i++) {
        this.cancelCrossShardMatch(
          fulfilled[i].target,
          fulfilled[i].opponent.userId,
        ).catch(() => {});
      }

      const match = fulfilled[0];

      if (!this.byWs.has(candidate.ws)) {
        this.cancelCrossShardMatch(
          match.target,
          match.opponent.userId,
        ).catch(() => {});
        return;
      }

      const confirmed = await this.confirmCrossShardMatch(
        match.target,
        match.opponent.userId,
        match.roomId,
      );

      if (!this.byWs.has(candidate.ws)) return;

      if (confirmed) {
        candidate.ws.send(
          encode({
            t: "matched",
            roomId: match.roomId,
            opponent: match.opponent,
          }),
        );
        this.removeFromQueue(candidate.ws);
      } else {
        candidate.crossShardLock = false;
      }
    } catch {
      if (this.byWs.has(candidate.ws)) candidate.crossShardLock = false;
    }
  }

  private async queryShard(
    target: string,
    player: QueuedPlayer,
  ): Promise<{
    target: string;
    roomId: string;
    opponent: { userId: string; elo: number; name: string };
  }> {
    const resp = await this.env.MATCHMAKER.get(
      this.env.MATCHMAKER.idFromName(target),
    ).fetch(
      new Request("https://internal/cross-shard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          t: "find_match",
          player: {
            userId: player.userId,
            elo: player.elo,
            name: player.name,
          },
        }),
      }),
    );

    const result = (await resp.json()) as {
      t: string;
      roomId?: string;
      opponent?: { userId: string; elo: number; name: string };
    };

    if (result.t === "match_found" && result.roomId && result.opponent) {
      return { target, roomId: result.roomId, opponent: result.opponent };
    }

    throw new Error("no_match");
  }

  private async confirmCrossShardMatch(
    target: string,
    userId: string,
    roomId: string,
  ): Promise<boolean> {
    try {
      const resp = await this.env.MATCHMAKER.get(
        this.env.MATCHMAKER.idFromName(target),
      ).fetch(
        new Request("https://internal/cross-shard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ t: "confirm_match", userId, roomId }),
        }),
      );
      const result = (await resp.json()) as { t: string };
      return result.t === "confirmed";
    } catch {
      return false;
    }
  }

  private async cancelCrossShardMatch(
    target: string,
    userId: string,
  ): Promise<void> {
    await this.env.MATCHMAKER.get(
      this.env.MATCHMAKER.idFromName(target),
    ).fetch(
      new Request("https://internal/cross-shard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t: "cancel_match", userId }),
      }),
    );
  }

  // --- Incoming cross-shard request handlers ---

  private async handleCrossShardRequest(
    request: Request,
  ): Promise<Response> {
    const body = (await request.json()) as {
      t: string;
      player?: { userId: string; elo: number; name: string };
      userId?: string;
      roomId?: string;
    };

    if (body.t === "find_match" && body.player) {
      return this.handleFindMatch(body.player);
    }

    if (body.t === "confirm_match" && body.userId && body.roomId) {
      return this.handleConfirmMatch(body.userId, body.roomId);
    }

    if (body.t === "cancel_match" && body.userId) {
      return this.handleCancelMatch(body.userId);
    }

    return Response.json({ t: "error" }, { status: 400 });
  }

  private handleFindMatch(
    remote: { userId: string; elo: number; name: string },
  ): Response {
    const now = Date.now();

    for (const local of this.queue) {
      if (local.crossShardLock) continue;

      const range = eloRange(now - local.joinedAt);
      if (Math.abs(local.elo - remote.elo) <= range) {
        const roomId = crypto.randomUUID();

        local.crossShardLock = true;
        local.pendingMatch = { roomId, opponent: remote, lockedAt: now };

        return Response.json({
          t: "match_found",
          roomId,
          opponent: {
            userId: local.userId,
            elo: local.elo,
            name: local.name,
          },
        });
      }
    }

    return Response.json({ t: "no_match" });
  }

  private handleConfirmMatch(userId: string, roomId: string): Response {
    const local = this.byUserId.get(userId);
    if (!local || local.pendingMatch?.roomId !== roomId) {
      return Response.json({ t: "expired" });
    }
    const idx = this.queue.indexOf(local);
    if (idx === -1) return Response.json({ t: "expired" });
    try {
      local.ws.send(
        encode({
          t: "matched",
          roomId: local.pendingMatch!.roomId,
          opponent: local.pendingMatch!.opponent,
        }),
      );
    } catch {
      /* WS dead — match still counts, GameRoom handles single-player timeout */
    }

    this.byWs.delete(local.ws);
    this.byUserId.delete(local.userId);
    this.queue.splice(idx, 1);
    if (this.queue.length === 0) this.stopWidening();

    return Response.json({ t: "confirmed" });
  }

  private handleCancelMatch(userId: string): Response {
    const player = this.byUserId.get(userId);
    if (player?.pendingMatch) {
      player.crossShardLock = false;
      player.pendingMatch = undefined;
    }
    return Response.json({ t: "cancelled" });
  }

  // --- Local matching ---

  private createMatch(a: QueuedPlayer, b: QueuedPlayer) {
    const roomId = crypto.randomUUID();

    a.ws.send(
      encode({
        t: "matched",
        roomId,
        opponent: { userId: b.userId, elo: b.elo, name: b.name },
      }),
    );
    b.ws.send(
      encode({
        t: "matched",
        roomId,
        opponent: { userId: a.userId, elo: a.elo, name: a.name },
      }),
    );
  }

  private insertSorted(player: QueuedPlayer) {
    let lo = 0;
    let hi = this.queue.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.queue[mid].elo < player.elo) lo = mid + 1;
      else hi = mid;
    }
    this.queue.splice(lo, 0, player);
    this.byWs.set(player.ws, player);
    this.byUserId.set(player.userId, player);
  }

  private removeFromQueue(ws: WebSocket) {
    const player = this.byWs.get(ws);
    if (!player) return;
    const idx = this.queue.indexOf(player);
    if (idx !== -1) this.queue.splice(idx, 1);
    this.byWs.delete(ws);
    this.byUserId.delete(player.userId);
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
