export const SHARD_SIZE = 200;

const INITIAL_ELO_RANGE = 50;
const MAX_ELO_RANGE = 300;
const WIDEN_INTERVAL_MS = 3_000;
const WIDEN_STEP = 50;

export { INITIAL_ELO_RANGE, MAX_ELO_RANGE, WIDEN_INTERVAL_MS, WIDEN_STEP };

const SUB_SHARD_COUNTS: Record<number, number> = {
  5: 25,
  6: 25,
  4: 8,
  7: 8,
  3: 4,
  8: 4,
};

export function getSubShardCount(bucket: number): number {
  return SUB_SHARD_COUNTS[bucket] ?? 1;
}

function hashUserId(userId: string, count: number): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % count;
}

export function getShardName(elo: number, userId: string): string {
  const bucket = Math.max(0, Math.floor(elo / SHARD_SIZE));
  const subCount = getSubShardCount(bucket);
  if (subCount <= 1) return `matchmaker-${bucket}`;
  const sub = hashUserId(userId, subCount);
  return `matchmaker-${bucket}-${sub}`;
}

export function parseShard(name: string): { bucket: number; sub: number } {
  const parts = name.replace("matchmaker-", "").split("-");
  return {
    bucket: parseInt(parts[0], 10),
    sub: parts[1] ? parseInt(parts[1], 10) : 0,
  };
}

export function getSiblingShards(shardName: string): string[] {
  const { bucket, sub } = parseShard(shardName);
  const count = getSubShardCount(bucket);
  if (count <= 1) return [];
  const siblings: string[] = [];
  for (let i = 0; i < count; i++) {
    if (i !== sub) siblings.push(`matchmaker-${bucket}-${i}`);
  }
  return siblings;
}

export function getNeighborBucketShards(shardName: string): string[] {
  const { bucket } = parseShard(shardName);
  const shards: string[] = [];
  for (const b of [bucket - 1, bucket + 1]) {
    if (b < 0) continue;
    const count = getSubShardCount(b);
    if (count <= 1) {
      shards.push(`matchmaker-${b}`);
    } else {
      for (let i = 0; i < count; i++) shards.push(`matchmaker-${b}-${i}`);
    }
  }
  return shards;
}
