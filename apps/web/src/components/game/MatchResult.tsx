"use client";

import { useGameStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const config = {
  win: {
    title: "Victory!",
    titleClass: "text-green-400",
    badge: "bg-green-500/15 text-green-400 ring-1 ring-green-500/30",
  },
  lose: {
    title: "Defeat",
    titleClass: "text-red-400",
    badge: "bg-red-500/15 text-red-400 ring-1 ring-red-500/30",
  },
  draw: {
    title: "Draw",
    titleClass: "text-amber-400",
    badge: "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30",
  },
};

export function MatchResult() {
  const { result, eloDelta, newElo, scores, reset } = useGameStore();

  if (!result) return null;

  const c = config[result];
  const eloSign = eloDelta >= 0 ? "+" : "";

  return (
    <Dialog open onOpenChange={() => reset()}>
      <DialogContent
        showCloseButton={false}
        className="w-72 border-game-border bg-game-surface p-8 sm:max-w-72"
      >
        <DialogHeader className="items-center">
          <DialogTitle className={`text-5xl font-extrabold ${c.titleClass}`}>
            {c.title}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Match result
          </DialogDescription>
        </DialogHeader>

        <div className="flex w-full items-center justify-center gap-6">
          <div className="text-center">
            <p className="text-3xl font-extrabold text-neutral-200 tabular-nums">
              {scores[0]}
            </p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
              You
            </p>
          </div>
          <span className="text-xl text-neutral-600">:</span>
          <div className="text-center">
            <p className="text-3xl font-extrabold text-neutral-200 tabular-nums">
              {scores[1]}
            </p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
              Opponent
            </p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-1">
          <span
            className={`rounded-full px-4 py-1 text-lg font-bold tabular-nums ${c.badge}`}
          >
            {eloSign}{eloDelta} ELO
          </span>
          <p className="text-xs text-neutral-500">
            Rating: <span className="text-neutral-300">{newElo}</span>
          </p>
        </div>

        <DialogFooter className="sm:justify-center">
          <Button
            onClick={reset}
            variant="secondary"
            className="w-full rounded-xl bg-game-border text-neutral-200 hover:bg-neutral-600"
          >
            Play Again
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
