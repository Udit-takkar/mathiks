export interface MatchMakerEnv {
  ROOM: DurableObjectNamespace;
  MATCHMAKER: DurableObjectNamespace;
}

export interface PlayerIdentity {
  userId: string;
  elo: number;
  name: string;
}

export interface PendingMatch {
  roomId: string;
  opponent: PlayerIdentity;
  lockedAt: number;
}

export interface QueuedPlayer extends PlayerIdentity {
  ws: WebSocket;
  joinedAt: number;
  crossShardLock: boolean;
  pendingMatch?: PendingMatch;
}

export interface WebSocketSessionData extends PlayerIdentity {}

export type ClientQueueMessage =
  | { t: "join_queue" }
  | { t: "leave_queue" }
  | { t: "ping" };

export type ServerQueueMessage =
  | { t: "queued"; position: number }
  | { t: "left_queue" }
  | { t: "matched"; roomId: string; opponent: PlayerIdentity }
  | { t: "error"; msg: string }
  | { t: "pong"; st: number };

export type CrossShardRequest =
  | { t: "find_match"; player: PlayerIdentity }
  | { t: "confirm_match"; userId: string; roomId: string }
  | { t: "cancel_match"; userId: string };

export type CrossShardResponse =
  | { t: "match_found"; roomId: string; opponent: PlayerIdentity }
  | { t: "no_match" }
  | { t: "confirmed" }
  | { t: "expired" }
  | { t: "cancelled" }
  | { t: "error"; msg?: string };

export interface CrossShardMatch {
  target: string;
  roomId: string;
  opponent: PlayerIdentity;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isPlayerIdentity(value: unknown): value is PlayerIdentity {
  if (!isRecord(value)) return false;
  return (
    typeof value.userId === "string" &&
    typeof value.elo === "number" &&
    Number.isFinite(value.elo) &&
    typeof value.name === "string"
  );
}

export function isClientQueueMessage(value: unknown): value is ClientQueueMessage {
  if (!isRecord(value) || typeof value.t !== "string") return false;
  return value.t === "join_queue" || value.t === "leave_queue" || value.t === "ping";
}

export function isCrossShardRequest(value: unknown): value is CrossShardRequest {
  if (!isRecord(value) || typeof value.t !== "string") return false;

  if (value.t === "find_match") {
    return isPlayerIdentity(value.player);
  }

  if (value.t === "confirm_match") {
    return typeof value.userId === "string" && typeof value.roomId === "string";
  }

  if (value.t === "cancel_match") {
    return typeof value.userId === "string";
  }

  return false;
}
