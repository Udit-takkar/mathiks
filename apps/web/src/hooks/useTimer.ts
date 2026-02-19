"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";
import { useGameStore } from "@/lib/store";

export function useTimer() {
  const { phase, serverStartsAt, duration, clockOffset } = useGameStore();
  const remainingRef = useRef(duration);
  const rafRef = useRef(0);

  const subscribe = useCallback(
    (cb: () => void) => {
      if (phase === "playing" && serverStartsAt) {
        const endTime = serverStartsAt + duration;

        const tick = () => {
          const serverNow = Date.now() + clockOffset;
          remainingRef.current = Math.max(0, endTime - serverNow);
          cb();

          if (remainingRef.current > 0) {
            rafRef.current = requestAnimationFrame(tick);
          }
        };

        rafRef.current = requestAnimationFrame(tick);
      } else {
        remainingRef.current = duration;
      }

      return () => cancelAnimationFrame(rafRef.current);
    },
    [phase, serverStartsAt, duration, clockOffset],
  );

  const remaining = useSyncExternalStore(
    subscribe,
    () => remainingRef.current,
    () => duration,
  );

  return {
    remaining,
    seconds: Math.ceil(remaining / 1000),
    progress: duration > 0 ? 1 - remaining / duration : 0,
  };
}
