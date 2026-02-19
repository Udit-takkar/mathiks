import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as pgSchema from "./pg-schema";

export function createPgDb(hyperdrive: Hyperdrive) {
  const sql = neon(hyperdrive.connectionString);
  return drizzle(sql, { schema: pgSchema });
}

export type PgDatabase = ReturnType<typeof createPgDb>;
export { pgSchema };
