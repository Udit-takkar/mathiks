"use client";

import { useGameStore } from "@/lib/store";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Timer } from "./Timer";

interface PlayerCardProps {
  name: string;
  elo: number;
  side: "left" | "right";
  ringColor: string;
  isYou?: boolean;
}

function PlayerCard({ name, elo, side, ringColor, isYou }: PlayerCardProps) {
  const isRight = side === "right";
  const displayName = isYou
    ? "You"
    : name.length > 8
      ? name.slice(0, 8) + "..."
      : name;

  return (
    <div
      className={`flex items-center gap-2 ${isRight ? "flex-row-reverse" : ""}`}
    >
      <Avatar className={`h-10 w-10 ${ringColor}`}>
        <AvatarFallback className="bg-lime-accent text-sm font-bold text-black">
          {name[0]?.toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className={isRight ? "text-right" : ""}>
        <p className="text-sm font-semibold text-neutral-200 leading-tight">
          {displayName}
        </p>
        <p className="text-xs text-neutral-500">{elo}</p>
      </div>
    </div>
  );
}

interface ScoreBoardProps {
  userName: string;
  userElo: number;
}

export function ScoreBoard({ userName, userElo }: ScoreBoardProps) {
  const { scores, opponent, latency } = useGameStore();

  return (
    <div className="flex flex-col items-center gap-2 pt-8">
      <div className="flex items-center gap-16">
        <PlayerCard
          name={userName}
          elo={userElo}
          side="left"
          ringColor="ring-2 ring-lime-accent"
          isYou
        />
        <PlayerCard
          name={opponent?.name || "Opponent"}
          elo={opponent?.elo ?? 1200}
          side="right"
          ringColor="ring-2 ring-red-400/60"
        />
      </div>

      <div className="flex items-center gap-5">
        <Badge
          variant="secondary"
          className="w-12 justify-center rounded-lg bg-game-surface py-1 text-base font-bold tabular-nums text-neutral-200 hover:bg-game-surface"
        >
          {scores[0]}
        </Badge>
        <Timer />
        <Badge
          variant="secondary"
          className="w-12 justify-center rounded-lg bg-game-surface py-1 text-base font-bold tabular-nums text-neutral-200 hover:bg-game-surface"
        >
          {scores[1]}
        </Badge>
      </div>

      {latency !== null && (
        <p className="text-[11px] tabular-nums text-neutral-600">
          {latency}ms
        </p>
      )}
    </div>
  );
}
