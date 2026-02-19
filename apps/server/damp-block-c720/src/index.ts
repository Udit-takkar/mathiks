import { Hono } from "hono";
import { cors } from "hono/cors";
import { eq, sql } from "drizzle-orm";
import { createPgDb } from "./db/neon";
import { pgSchema } from "./db/neon";
export { GameRoom } from "./game-room";
export { MatchMaker } from "./matchmaker";

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.use("*", cors());

app.get("/ws/matchmaking", (c) => {
  const id = c.env.MATCHMAKER.idFromName("global");
  const matchmaker = c.env.MATCHMAKER.get(id);
  return matchmaker.fetch(c.req.raw);
});

app.get("/ws/game/:roomId", (c) => {
  const roomId = c.req.param("roomId");
  const id = c.env.ROOM.idFromName(roomId);
  const room = c.env.ROOM.get(id);
  return room.fetch(c.req.raw);
});

app.get("/api/health", (c) => {
  return c.json({ status: "ok", timestamp: Date.now() });
});

app.get("/api/leaderboard", async (c) => {
  const limit = Number(c.req.query("limit") ?? 50);
  const result = await c.env.mathiks_db
    .prepare(
      "SELECT id, name, elo, games_played FROM users ORDER BY elo DESC LIMIT ?",
    )
    .bind(limit)
    .all();
  return c.json(result.results);
});

app.get("/api/user/:userId", async (c) => {
  const userId = c.req.param("userId");
  const user = await c.env.mathiks_db
    .prepare("SELECT id, name, elo, games_played FROM users WHERE id = ?")
    .bind(userId)
    .first();
  if (!user) return c.json({ error: "User not found" }, 404);
  return c.json(user);
});

app.get("/api/user/:userId/matches", async (c) => {
  const userId = c.req.param("userId");
  const limit = Number(c.req.query("limit") ?? 20);
  const result = await c.env.mathiks_db
    .prepare(
      `SELECT * FROM matches
       WHERE player1_id = ? OR player2_id = ?
       ORDER BY created_at DESC LIMIT ?`,
    )
    .bind(userId, userId, limit)
    .all();
  return c.json(result.results);
});

// --- Queue consumer ---

export default {
  fetch: app.fetch,

  async queue(
    batch: MessageBatch<Record<string, any>>,
    env: CloudflareBindings,
  ) {
    const pg = createPgDb(env.HYPERDRIVE);

    for (const msg of batch.messages) {
      const data = msg.body as Record<string, any>;

      if (data.type === "match_result") {
        const { player1, player2, seed, duration, timestamp } = data;
        const matchId = crypto.randomUUID();

        // Neon (source of truth) — write via Hyperdrive
        await pg
          .update(pgSchema.users)
          .set({
            elo: sql`${pgSchema.users.elo} + ${player1.eloDelta}`,
            gamesPlayed: sql`${pgSchema.users.gamesPlayed} + 1`,
          })
          .where(eq(pgSchema.users.id, player1.userId));

        await pg
          .update(pgSchema.users)
          .set({
            elo: sql`${pgSchema.users.elo} + ${player2.eloDelta}`,
            gamesPlayed: sql`${pgSchema.users.gamesPlayed} + 1`,
          })
          .where(eq(pgSchema.users.id, player2.userId));

        await pg.insert(pgSchema.matches).values({
          id: matchId,
          player1Id: player1.userId,
          player2Id: player2.userId,
          score1: player1.score,
          score2: player2.score,
          eloDelta1: player1.eloDelta,
          eloDelta2: player2.eloDelta,
          seed,
          duration,
          createdAt: new Date(timestamp),
        });

        // D1 (edge read cache) — replicate the same writes
        await env.mathiks_db.batch([
          env.mathiks_db
            .prepare(
              `UPDATE users SET elo = elo + ?, games_played = games_played + 1 WHERE id = ?`,
            )
            .bind(player1.eloDelta, player1.userId),
          env.mathiks_db
            .prepare(
              `UPDATE users SET elo = elo + ?, games_played = games_played + 1 WHERE id = ?`,
            )
            .bind(player2.eloDelta, player2.userId),
          env.mathiks_db
            .prepare(
              `INSERT INTO matches (id, player1_id, player2_id, score1, score2, elo_delta1, elo_delta2, seed, duration, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              matchId,
              player1.userId,
              player2.userId,
              player1.score,
              player2.score,
              player1.eloDelta,
              player2.eloDelta,
              seed,
              duration,
              timestamp,
            ),
        ]);
      }

      msg.ack();
    }
  },
};
