import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  elo: integer("elo").notNull().default(1200),
  gamesPlayed: integer("games_played").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const matches = pgTable("matches", {
  id: text("id").primaryKey(),
  player1Id: text("player1_id")
    .notNull()
    .references(() => users.id),
  player2Id: text("player2_id")
    .notNull()
    .references(() => users.id),
  score1: integer("score1").notNull(),
  score2: integer("score2").notNull(),
  eloDelta1: integer("elo_delta1").notNull(),
  eloDelta2: integer("elo_delta2").notNull(),
  seed: integer("seed").notNull(),
  duration: integer("duration").notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
    .notNull()
    .defaultNow(),
});
