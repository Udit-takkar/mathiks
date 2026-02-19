"use client";

import { useEffect } from "react";
import { useGameStore } from "@/lib/store";
import { ScoreBoard } from "@/components/game/ScoreBoard";
import { QuestionDisplay } from "@/components/game/QuestionDisplay";
import { AnswerInput } from "@/components/game/AnswerInput";
import { MatchResult } from "@/components/game/MatchResult";

function MockControls() {
  const store = useGameStore();

  const mockPlaying = () => {
    store.startGame(
      { expression: "3 × 9", answer: 27 },
      new Uint8Array(0),
      Date.now(),
      60_000,
      { userId: "kripaagra", elo: 1228 },
    );
  };

  const mockScore = () => {
    const current = store.scores;
    store.updateScores([current[0] + 1, current[1]]);
    store.setQuestion(
      {
        expression: [
          "12 + 45",
          "8 × 7",
          "99 - 34",
          "144 ÷ 12",
          "15 × 6",
        ][Math.floor(Math.random() * 5)],
        answer: 0,
      },
    );
  };

  const mockOppScore = () => {
    const current = store.scores;
    store.updateScores([current[0], current[1] + 1]);
  };

  const mockEnd = (result: "win" | "lose" | "draw") => {
    const deltas = { win: 18, lose: -14, draw: 2 };
    store.endGame(result, deltas[result], 1200 + deltas[result], store.scores);
  };

  return (
    <div className="fixed bottom-4 left-4 z-[60] flex flex-wrap gap-2">
      {[
        { label: "Play", action: mockPlaying, color: "bg-violet-600" },
        { label: "+1 You", action: mockScore, color: "bg-emerald-600" },
        { label: "+1 Opp", action: mockOppScore, color: "bg-amber-600" },
        { label: "Win", action: () => mockEnd("win"), color: "bg-emerald-700" },
        { label: "Lose", action: () => mockEnd("lose"), color: "bg-red-700" },
        { label: "Draw", action: () => mockEnd("draw"), color: "bg-amber-700" },
        { label: "Reset", action: store.reset, color: "bg-neutral-700" },
      ].map((btn) => (
        <button
          key={btn.label}
          onClick={btn.action}
          className={`${btn.color} rounded-lg px-3 py-1.5 text-xs font-semibold text-white hover:opacity-80`}
        >
          {btn.label}
        </button>
      ))}
    </div>
  );
}

export default function GameTestPage() {
  const { phase } = useGameStore();

  return (
    <>
      <div className="flex min-h-dvh flex-col bg-game-bg">
        {phase === "idle" && (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-neutral-500">
              Use the controls below to test UI states
            </p>
          </div>
        )}
        {(phase === "playing" || phase === "ended") && (
          <>
            <ScoreBoard />
            <QuestionDisplay />
            <AnswerInput
              onSubmit={(answer) => console.log("Submitted:", answer)}
              disabled={phase === "ended"}
            />
          </>
        )}
        {phase === "ended" && <MatchResult />}
      </div>
      <MockControls />
    </>
  );
}
