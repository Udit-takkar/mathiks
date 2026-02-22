"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { useGameStore } from "@/lib/store";

interface AnswerInputProps {
  onSubmit: (answer: number) => void;
  disabled?: boolean;
}

export function AnswerInput({ onSubmit, disabled }: AnswerInputProps) {
  const [value, setValue] = useState("");
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrongAnswer = useGameStore((s) => s.wrongAnswer);
  const digits = useGameStore((s) => s.question?.digits ?? 0);

  useEffect(() => {
    if (wrongAnswer) {
      setShake(true);
      const timer = setTimeout(() => setShake(false), 500);
      return () => clearTimeout(timer);
    }
  }, [wrongAnswer]);

  const submit = useCallback(
    (v: string) => {
      const num = Number(v);
      if (v !== "" && !isNaN(num)) {
        onSubmit(num);
        setValue("");
      }
    },
    [onSubmit],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      setValue(next);
      if (digits > 0 && next.length === digits) {
        const num = Number(next);
        if (!isNaN(num)) {
          onSubmit(num);
          setValue("");
        }
      }
    },
    [digits, onSubmit],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        submit(value);
      }
    },
    [submit, value],
  );

  return (
    <div className="flex flex-col items-center gap-2 px-4 pb-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
        Type out your answer
      </p>
      <Input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        pattern="-?[0-9]*"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="Enter Answer"
        autoFocus
        className={`
          h-12 max-w-sm rounded-xl bg-game-surface
          text-center text-lg text-neutral-200
          placeholder:text-neutral-600
          focus-visible:ring-0 transition-colors
          ${wrongAnswer ? "border-red-500 focus-visible:border-red-500" : "border-game-border focus-visible:border-neutral-500"}
          ${shake ? "animate-shake" : ""}
        `}
      />
    </div>
  );
}
