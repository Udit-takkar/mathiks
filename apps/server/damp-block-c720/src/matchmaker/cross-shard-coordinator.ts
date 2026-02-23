import {
  getNeighborBucketShards,
  getSiblingShards,
  WIDEN_INTERVAL_MS,
} from "../shard-config";
import { QueueStore } from "./queue-store";
import type { CrossShardClient } from "./cross-shard-client";
import type { PlayerIdentity, QueuedPlayer } from "./types";

const MIN_OVERFLOW_WAIT_MS = 5_000;
const MAX_TARGETS_WHEN_BUSY = 3;

export interface OverflowContext {
  shardName: string;
  shardMinElo: number;
  shardMaxElo: number;
  now?: number;
}

export type OverflowAttemptResult =
  | { kind: "none" }
  | {
      kind: "matched";
      candidate: QueuedPlayer;
      roomId: string;
      opponent: PlayerIdentity;
    };

export class CrossShardCoordinator {
  constructor(
    private readonly queueStore: QueueStore,
    private readonly crossShardClient: CrossShardClient,
    private readonly getEloRange: (waitTimeMs: number) => number,
  ) {}

  async tryMatch(context: OverflowContext): Promise<OverflowAttemptResult> {
    const now = context.now ?? Date.now();
    const candidate = this.queueStore.findOverflowCandidate(now, MIN_OVERFLOW_WAIT_MS);
    if (!candidate) return { kind: "none" };

    const waitTime = now - candidate.joinedAt;
    const range = this.getEloRange(waitTime);
    const targets = this.selectTargets(candidate, context, waitTime, range);
    if (targets.length === 0) return { kind: "none" };

    candidate.crossShardLock = true;
    try {
      const maxTargets =
        this.queueStore.size <= 10 ? targets.length : MAX_TARGETS_WHEN_BUSY;
      const selectedTargets = pickRandom(targets, maxTargets);

      const settled = await Promise.allSettled(
        selectedTargets.map((target) =>
          this.crossShardClient.findMatch(target, {
            userId: candidate.userId,
            elo: candidate.elo,
            name: candidate.name,
          }),
        ),
      );

      const matches = settled
        .filter(
          (
            result,
          ): result is PromiseFulfilledResult<
            Awaited<ReturnType<CrossShardClient["findMatch"]>>
          > => result.status === "fulfilled",
        )
        .map((result) => result.value)
        .filter((value): value is NonNullable<typeof value> => value !== null);

      if (matches.length === 0) {
        this.queueStore.releaseCrossShardLock(candidate);
        return { kind: "none" };
      }

      const [winner, ...rest] = matches;
      await Promise.all(
        rest.map((match) =>
          this.crossShardClient.cancelMatch(match.target, match.opponent.userId),
        ),
      );

      if (!this.queueStore.isQueued(candidate)) {
        await this.crossShardClient.cancelMatch(winner.target, winner.opponent.userId);
        return { kind: "none" };
      }

      const confirmed = await this.crossShardClient.confirmMatch(
        winner.target,
        winner.opponent.userId,
        winner.roomId,
      );

      if (!this.queueStore.isQueued(candidate)) {
        return { kind: "none" };
      }

      if (!confirmed) {
        this.queueStore.releaseCrossShardLock(candidate);
        return { kind: "none" };
      }

      return {
        kind: "matched",
        candidate,
        roomId: winner.roomId,
        opponent: winner.opponent,
      };
    } catch {
      this.queueStore.releaseCrossShardLock(candidate);
      return { kind: "none" };
    }
  }

  private selectTargets(
    candidate: QueuedPlayer,
    context: OverflowContext,
    waitTime: number,
    range: number,
  ): string[] {
    const targets = new Set<string>();
    for (const sibling of getSiblingShards(context.shardName)) {
      targets.add(sibling);
    }

    const needsNeighborBuckets =
      waitTime >= WIDEN_INTERVAL_MS * 2 &&
      (candidate.elo - range < context.shardMinElo ||
        candidate.elo + range >= context.shardMaxElo);

    if (needsNeighborBuckets) {
      for (const neighbor of getNeighborBucketShards(context.shardName)) {
        targets.add(neighbor);
      }
    }

    return [...targets];
  }
}

function pickRandom<T>(items: readonly T[], count: number): T[] {
  if (items.length <= count) return [...items];

  const pool = [...items];
  const selected: T[] = [];
  for (let i = 0; i < count; i++) {
    const index = Math.floor(Math.random() * pool.length);
    selected.push(pool[index]);
    pool[index] = pool[pool.length - 1];
    pool.pop();
  }
  return selected;
}
