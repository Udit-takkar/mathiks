"use client";

import { useGameStore } from "@/lib/store";

function parseExpression(expression: string) {
  const parts = expression.split(" ");
  if (parts.length === 3) {
    return { a: parts[0], op: parts[1], b: parts[2] };
  }
  return { a: expression, op: "", b: "" };
}

export function QuestionDisplay() {
  const { question } = useGameStore();

  if (!question) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-neutral-600 text-lg">Waiting for game to start...</p>
      </div>
    );
  }

  const { a, op, b } = parseExpression(question.expression);

  return (
    <div className="flex flex-1 items-center justify-center px-8">
      <div className="grid-bg relative flex aspect-square w-full max-w-md items-center justify-center rounded-xl border border-game-border">
        <div className="relative z-10 flex flex-col items-end">
          <span className="text-6xl font-bold text-neutral-200 tabular-nums">
            {a}
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-neutral-400">{op}</span>
            <span className="text-6xl font-bold text-neutral-200 tabular-nums">
              {b}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
