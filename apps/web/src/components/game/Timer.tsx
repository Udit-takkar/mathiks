"use client";

import { useTimer } from "@/hooks/useTimer";

export function Timer() {
  const { seconds } = useTimer();

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const display = `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;

  const isLow = seconds <= 10;

  return (
    <div className="flex items-center gap-1">
      <div
        className={`
          flex items-center gap-1.5 rounded-full px-3 py-1
          bg-game-surface
        `}
      >
        <div
          className={`h-2 w-2 rounded-full ${isLow ? "bg-red-500 animate-pulse" : "bg-green-400"}`}
        />
        <span
          className={`font-mono text-sm font-semibold tabular-nums ${isLow ? "text-red-400" : "text-green-400"}`}
        >
          {display}
        </span>
      </div>
      <span className="text-orange-400 text-sm font-bold">&gt;</span>
    </div>
  );
}
