import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as pgSchema from "./pg-schema";

export function createPgDb(databaseUrl: string) {
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema: pgSchema });
}

export type PgDatabase = ReturnType<typeof createPgDb>;
export { pgSchema };
