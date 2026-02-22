import { createMiddleware } from "hono/factory";
import { createAuth } from "../lib/auth";

export const authMiddleware = createMiddleware<{
  Bindings: CloudflareBindings;
  Variables: {
    user: {
      id: string;
      name: string;
      email: string;
      elo: number;
      gamesPlayed: number;
    } | null;
    session: { id: string; userId: string; token: string } | null;
  };
}>(async (c, next) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });
  c.set("user", (session?.user as any) ?? null);
  c.set("session", (session?.session as any) ?? null);
  await next();
});
