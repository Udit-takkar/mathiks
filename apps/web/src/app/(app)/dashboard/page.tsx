import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getServerSession } from "@/lib/auth-server";
import { Button } from "@/components/ui/button";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { MatchHistory } from "@/components/dashboard/MatchHistory";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

async function fetchMatches(userId: string, cookie: string) {
  try {
    const res = await fetch(
      `${API_URL}/api/user/${userId}/matches?limit=20`,
      { headers: { cookie }, cache: "no-store" },
    );
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function DashboardPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const headersList = await headers();
  const cookie = headersList.get("cookie") ?? "";
  const matches = await fetchMatches(session.user.id, cookie);

  const user = session.user;
  const totalGames = user.gamesPlayed ?? matches.length;

  const wins = matches.filter(
    (m: any) =>
      (m.player1_id === user.id && m.score1 > m.score2) ||
      (m.player2_id === user.id && m.score2 > m.score1),
  ).length;
  const winRate =
    totalGames > 0 ? `${Math.round((wins / totalGames) * 100)}%` : "—";

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold text-white">
        Hey, {user.name}
      </h1>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <StatsCard label="ELO" value={user.elo ?? 1200} />
        <StatsCard label="Games" value={totalGames} />
        <StatsCard label="Win Rate" value={winRate} />
      </div>

      <Button
        asChild
        size="lg"
        className="mt-8 w-full rounded-xl bg-lime-accent text-lg font-semibold text-black hover:bg-lime-accent/90"
      >
        <Link href="/game">Play</Link>
      </Button>

      <div className="mt-10">
        <h2 className="mb-3 text-lg font-semibold text-neutral-300">
          Recent Matches
        </h2>
        <MatchHistory matches={matches} userId={user.id} />
      </div>
    </div>
  );
}
