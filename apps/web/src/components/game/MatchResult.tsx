"use client";

import { useRouter } from "next/navigation";
import { useGameStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const config = {
  win: {
    title: "Victory",
    emoji: "🏆",
    titleClass: "text-lime-accent",
    scoreBorder: "border-lime-accent/20",
  },
  lose: {
    title: "Defeat",
    emoji: "💀",
    titleClass: "text-red-400",
    scoreBorder: "border-red-400/20",
  },
  draw: {
    title: "Draw",
    emoji: "🤝",
    titleClass: "text-amber-400",
    scoreBorder: "border-amber-400/20",
  },
};

export function MatchResult() {
  const router = useRouter();
  const { result, eloDelta, newElo, scores, reset } = useGameStore();

  if (!result) return null;

  const c = config[result];
  const eloSign = eloDelta >= 0 ? "+" : "";
  const eloColor =
    eloDelta > 0
      ? "text-lime-accent"
      : eloDelta < 0
        ? "text-red-400"
        : "text-neutral-400";

  return (
    <Dialog open onOpenChange={() => reset()}>
      <DialogContent
        showCloseButton={false}
        className="w-80 gap-0 border-game-border bg-game-surface p-0 sm:max-w-80"
      >
        <DialogHeader className="items-center pb-0 pt-8">
          <p className="text-4xl">{c.emoji}</p>
          <DialogTitle
            className={`text-3xl font-extrabold uppercase tracking-tight ${c.titleClass}`}
          >
            {c.title}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Match result
          </DialogDescription>
        </DialogHeader>

        <div className="px-8 py-6">
          <div
            className={`flex items-center justify-center rounded-xl border ${c.scoreBorder} bg-landing-bg px-6 py-4`}
          >
            <div className="flex-1 text-center">
              <p className="text-4xl font-extrabold tabular-nums text-white">
                {scores[0]}
              </p>
              <p className="mt-1 text-[11px] font-medium uppercase tracking-widest text-neutral-500">
                You
              </p>
            </div>
            <div className="mx-4 h-10 w-px bg-game-border" />
            <div className="flex-1 text-center">
              <p className="text-4xl font-extrabold tabular-nums text-neutral-400">
                {scores[1]}
              </p>
              <p className="mt-1 text-[11px] font-medium uppercase tracking-widest text-neutral-500">
                Opponent
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-center gap-3">
            <span className={`text-2xl font-bold tabular-nums ${eloColor}`}>
              {eloSign}
              {eloDelta}
            </span>
            <span className="text-sm text-neutral-500">
              → {newElo} ELO
            </span>
          </div>
        </div>

        <div className="flex gap-2 border-t border-game-border px-6 py-4">
          <Button
            onClick={() => {
              reset();
              router.push("/dashboard");
            }}
            variant="ghost"
            className="flex-1 text-neutral-400 hover:text-neutral-200"
          >
            Dashboard
          </Button>
          <Button
            onClick={reset}
            className="flex-1 bg-lime-accent font-semibold text-black hover:bg-lime-accent/90"
          >
            Play Again
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
