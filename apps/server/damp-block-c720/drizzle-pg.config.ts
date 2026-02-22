import { readFileSync } from "fs";
import { defineConfig } from "drizzle-kit";

function getDbUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const vars = readFileSync(".dev.vars", "utf-8");
    const match = vars.match(
      /CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=(.*)/,
    );
    return match?.[1]?.trim() ?? "";
  } catch {
    return "";
  }
}

export default defineConfig({
  schema: "./src/db/pg-schema.ts",
  out: "./drizzle/pg-migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: getDbUrl(),
  },
});
