import type {
  CrossShardMatch,
  CrossShardRequest,
  CrossShardResponse,
  PlayerIdentity,
} from "./types";

export class CrossShardClient {
  constructor(private readonly namespace: DurableObjectNamespace) {}

  async findMatch(target: string, player: PlayerIdentity): Promise<CrossShardMatch | null> {
    const response = await this.post(target, { t: "find_match", player });
    if (response.t !== "match_found") return null;
    return {
      target,
      roomId: response.roomId,
      opponent: response.opponent,
    };
  }

  async confirmMatch(target: string, userId: string, roomId: string): Promise<boolean> {
    try {
      const response = await this.post(target, { t: "confirm_match", userId, roomId });
      return response.t === "confirmed";
    } catch {
      return false;
    }
  }

  async cancelMatch(target: string, userId: string): Promise<void> {
    try {
      await this.post(target, { t: "cancel_match", userId });
    } catch {
      // Best-effort cancellation.
    }
  }

  private async post(target: string, body: CrossShardRequest): Promise<CrossShardResponse> {
    const response = await this.namespace
      .get(this.namespace.idFromName(target))
      .fetch(
        new Request("https://internal/cross-shard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );

    return (await response.json()) as CrossShardResponse;
  }
}
