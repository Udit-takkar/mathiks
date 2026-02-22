import { headers } from "next/headers";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

export async function getServerSession() {
  const headersList = await headers();
  const cookie = headersList.get("cookie") ?? "";

  const res = await fetch(`${API_URL}/api/auth/get-session`, {
    headers: { cookie },
    cache: "no-store",
  });

  if (!res.ok) return null;

  const data = await res.json();
  if (!data?.user) return null;

  return data as {
    user: {
      id: string;
      name: string;
      email: string;
      elo: number;
      gamesPlayed: number;
      image: string | null;
    };
    session: {
      id: string;
      userId: string;
      token: string;
      expiresAt: string;
    };
  };
}
