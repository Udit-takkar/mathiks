"use client";

import { useGameStore } from "@/lib/store";
import { useMatchmaking, useGameRoom } from "@/hooks/useGameSocket";
import { Button } from "@/components/ui/button";
import { ScoreBoard } from "./ScoreBoard";
import { QuestionDisplay } from "./QuestionDisplay";
import { AnswerInput } from "./AnswerInput";
import { MatchResult } from "./MatchResult";

const TEMP_USER_ID = "user-" + Math.random().toString(36).slice(2, 8);
const TEMP_ELO = 1200;

export function GameBoard() {
  const { phase } = useGameStore();
  const { joinQueue, leaveQueue } = useMatchmaking(TEMP_USER_ID, TEMP_ELO);
  const { submitAnswer } = useGameRoom(TEMP_USER_ID, TEMP_ELO);

  if (phase === "idle") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-game-bg">
        <div className="flex flex-col items-center gap-6">
          <h1 className="text-4xl font-bold text-white">Mathiks</h1>
          <p className="text-neutral-500">1v1 Competitive Math</p>
          <Button
            onClick={joinQueue}
            size="lg"
            className="rounded-xl bg-violet-600 px-10 text-lg font-semibold hover:bg-violet-500"
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
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
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
      <ScoreBoard />
      <QuestionDisplay />
      <AnswerInput onSubmit={submitAnswer} disabled={phase === "ended"} />
      {phase === "ended" && <MatchResult />}
    </div>
  );
}
