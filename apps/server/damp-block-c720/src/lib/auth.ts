import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../db/pg-schema";

export function createAuth(env: CloudflareBindings) {
  const sql = neon(env.DATABASE_URL);
  const db = drizzle(sql, { schema });

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      usePlural: true,
      schema,
    }),
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.FRONTEND_URL],
    emailAndPassword: {
      enabled: true,
    },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    user: {
      additionalFields: {
        elo: {
          type: "number",
          required: false,
          defaultValue: 1200,
          input: false,
        },
        gamesPlayed: {
          type: "number",
          required: false,
          defaultValue: 0,
          input: false,
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await env.mathiks_db
              .prepare(
                `INSERT OR IGNORE INTO users (id, name, email, elo, games_played, created_at)
                 VALUES (?, ?, ?, 1200, 0, ?)`,
              )
              .bind(user.id, user.name ?? "", user.email, Date.now())
              .run();
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
