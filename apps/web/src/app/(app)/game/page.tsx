import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth-server";
import { GameBoard } from "@/components/game/GameBoard";

export default async function GamePage() {
  const session = await getServerSession();
  if (!session) redirect("/login");

  return (
    <GameBoard
      userId={session.user.id}
      elo={session.user.elo ?? 1200}
      userName={session.user.name}
    />
  );
}
