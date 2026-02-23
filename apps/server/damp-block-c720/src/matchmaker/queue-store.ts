import type { QueuedPlayer } from "./types";

export class QueueStore {
  private queue: QueuedPlayer[] = [];
  private bySocket = new Map<WebSocket, QueuedPlayer>();
  private byUserId = new Map<string, QueuedPlayer>();

  get size(): number {
    return this.queue.length;
  }

  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  players(): readonly QueuedPlayer[] {
    return this.queue;
  }

  hasSocket(ws: WebSocket): boolean {
    return this.bySocket.has(ws);
  }

  getBySocket(ws: WebSocket): QueuedPlayer | undefined {
    return this.bySocket.get(ws);
  }

  getByUserId(userId: string): QueuedPlayer | undefined {
    return this.byUserId.get(userId);
  }

  isQueued(player: QueuedPlayer): boolean {
    return this.bySocket.get(player.ws) === player;
  }

  enqueue(input: Omit<QueuedPlayer, "crossShardLock"> & { crossShardLock?: boolean }): QueuedPlayer {
    const player: QueuedPlayer = {
      ...input,
      crossShardLock: input.crossShardLock ?? false,
    };

    let lo = 0;
    let hi = this.queue.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.queue[mid].elo < player.elo) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    this.queue.splice(lo, 0, player);
    this.bySocket.set(player.ws, player);
    this.byUserId.set(player.userId, player);
    return player;
  }

  removeBySocket(ws: WebSocket): QueuedPlayer | null {
    const player = this.bySocket.get(ws);
    if (!player) return null;
    this.remove(player);
    return player;
  }

  remove(player: QueuedPlayer): boolean {
    if (!this.isQueued(player)) return false;

    const index = this.queue.indexOf(player);
    if (index !== -1) {
      this.queue.splice(index, 1);
    }
    this.bySocket.delete(player.ws);
    this.byUserId.delete(player.userId);
    return true;
  }

  removeMany(players: Iterable<QueuedPlayer>): void {
    const unique = new Set<QueuedPlayer>();
    for (const player of players) {
      if (this.isQueued(player)) unique.add(player);
    }
    if (unique.size === 0) return;

    const indices: number[] = [];
    for (const player of unique) {
      this.bySocket.delete(player.ws);
      this.byUserId.delete(player.userId);
      const index = this.queue.indexOf(player);
      if (index !== -1) indices.push(index);
    }

    indices.sort((a, b) => b - a);
    for (const index of indices) {
      this.queue.splice(index, 1);
    }
  }

  releaseCrossShardLock(player: QueuedPlayer): void {
    if (!this.isQueued(player)) return;
    player.crossShardLock = false;
    player.pendingMatch = undefined;
  }

  releaseCrossShardLockByUserId(userId: string): void {
    const player = this.byUserId.get(userId);
    if (!player) return;
    player.crossShardLock = false;
    player.pendingMatch = undefined;
  }

  cleanupStaleLocks(now: number, staleLockMs: number): void {
    for (const player of this.queue) {
      const lock = player.pendingMatch;
      if (!lock) continue;
      if (now - lock.lockedAt <= staleLockMs) continue;
      player.crossShardLock = false;
      player.pendingMatch = undefined;
    }
  }

  findOverflowCandidate(now: number, minWaitMs: number): QueuedPlayer | undefined {
    return this.queue.find(
      (player) => !player.crossShardLock && now - player.joinedAt >= minWaitMs,
    );
  }
}
