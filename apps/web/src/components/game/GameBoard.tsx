"use client";

import { useGameStore } from "@/lib/store";
import { useMatchmaking, useGameRoom } from "@/hooks/useGameSocket";
import { Button } from "@/components/ui/button";
import { ScoreBoard } from "./ScoreBoard";
import { QuestionDisplay } from "./QuestionDisplay";
import { AnswerInput } from "./AnswerInput";
import { MatchResult } from "./MatchResult";

interface GameBoardProps {
  userId: string;
  elo: number;
  userName: string;
}

export function GameBoard({ userId, elo, userName }: GameBoardProps) {
  const { phase } = useGameStore();
  const { joinQueue, leaveQueue } = useMatchmaking(userId, elo);
  const { submitAnswer } = useGameRoom(userId, elo);

  if (phase === "idle") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-game-bg">
        <div className="flex flex-col items-center gap-6">
          <h1 className="text-4xl font-bold text-white">Mathiks</h1>
          <p className="text-neutral-500">1v1 Competitive Math</p>
          <Button
            onClick={joinQueue}
            size="lg"
            className="rounded-xl bg-lime-accent px-10 text-lg font-semibold text-black hover:bg-lime-accent/90"
          >
            Play
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "queuing") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-game-bg">
        <div className="flex flex-col items-center gap-6">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-lime-accent border-t-transparent" />
          <p className="text-lg text-neutral-400">Finding opponent...</p>
          <Button
            onClick={leaveQueue}
            variant="ghost"
            className="text-neutral-600 hover:text-neutral-400"
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-game-bg">
      <ScoreBoard userName={userName} userElo={elo} />
      <QuestionDisplay />
      <AnswerInput onSubmit={submitAnswer} disabled={phase === "ended"} />
      {phase === "ended" && <MatchResult />}
    </div>
  );
}
