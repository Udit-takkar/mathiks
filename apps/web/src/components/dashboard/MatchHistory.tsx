import { Badge } from "@/components/ui/badge";

interface Match {
  id: string;
  player1_id: string;
  player2_id: string;
  score1: number;
  score2: number;
  elo_delta1: number;
  elo_delta2: number;
  created_at: string;
}

interface MatchHistoryProps {
  matches: Match[];
  userId: string;
}

export function MatchHistory({ matches, userId }: MatchHistoryProps) {
  if (matches.length === 0) {
    return (
      <p className="py-8 text-center text-neutral-500">
        No matches yet. Play your first game!
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {matches.map((match) => {
        const isPlayer1 = match.player1_id === userId;
        const myScore = isPlayer1 ? match.score1 : match.score2;
        const oppScore = isPlayer1 ? match.score2 : match.score1;
        const eloDelta = isPlayer1 ? match.elo_delta1 : match.elo_delta2;
        const oppId = isPlayer1 ? match.player2_id : match.player1_id;

        let result: "win" | "lose" | "draw";
        if (myScore > oppScore) result = "win";
        else if (myScore < oppScore) result = "lose";
        else result = "draw";

        const resultConfig = {
          win: {
            label: "W",
            class: "bg-green-500/15 text-green-400 border-green-500/30",
          },
          lose: {
            label: "L",
            class: "bg-red-500/15 text-red-400 border-red-500/30",
          },
          draw: {
            label: "D",
            class: "bg-amber-500/15 text-amber-400 border-amber-500/30",
          },
        };

        const rc = resultConfig[result];
        const eloSign = eloDelta >= 0 ? "+" : "";

        return (
          <div
            key={match.id}
            className="flex items-center justify-between rounded-lg border border-game-border bg-game-surface px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <Badge
                variant="outline"
                className={`w-7 justify-center rounded-md border text-xs font-bold ${rc.class}`}
              >
                {rc.label}
              </Badge>
              <div>
                <p className="text-sm text-neutral-300">
                  vs {oppId.slice(0, 8)}...
                </p>
                <p className="text-xs text-neutral-500">
                  {myScore} – {oppScore}
                </p>
              </div>
            </div>
            <span
              className={`text-sm font-semibold tabular-nums ${eloDelta >= 0 ? "text-green-400" : "text-red-400"}`}
            >
              {eloSign}
              {eloDelta}
            </span>
          </div>
        );
      })}
    </div>
  );
}
