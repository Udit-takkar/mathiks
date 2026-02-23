import type { QueuedPlayer } from "./types";

export interface LocalMatchPair {
  player: QueuedPlayer;
  opponent: QueuedPlayer;
}

export type EloRangePolicy = (waitTimeMs: number) => number;

export class LocalMatcher {
  constructor(private readonly getEloRange: EloRangePolicy) {}

  findMatches(players: readonly QueuedPlayer[], now: number): LocalMatchPair[] {
    const matchedIndices = new Set<number>();
    const pairs: LocalMatchPair[] = [];

    for (let i = 0; i < players.length; i++) {
      if (matchedIndices.has(i)) continue;

      const player = players[i];
      if (player.crossShardLock) continue;

      const range = this.getEloRange(now - player.joinedAt);
      for (let j = i + 1; j < players.length; j++) {
        if (matchedIndices.has(j)) continue;

        const opponent = players[j];
        if (opponent.crossShardLock) continue;

        if (opponent.elo - player.elo > range) {
          break;
        }

        pairs.push({ player, opponent });
        matchedIndices.add(i);
        matchedIndices.add(j);
        break;
      }
    }

    return pairs;
  }
}
