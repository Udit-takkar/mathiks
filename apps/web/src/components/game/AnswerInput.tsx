"use client";

import { useState, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";

interface AnswerInputProps {
  onSubmit: (answer: number) => void;
  disabled?: boolean;
}

export function AnswerInput({ onSubmit, disabled }: AnswerInputProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(() => {
    const num = Number(value);
    if (value !== "" && !isNaN(num)) {
      onSubmit(num);
      setValue("");
    }
  }, [value, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSubmit();
      }
    },
    [handleSubmit],
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
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="Enter Answer"
        autoFocus
        className="
          h-12 max-w-sm rounded-xl border-game-border bg-game-surface
          text-center text-lg text-neutral-200
          placeholder:text-neutral-600
          focus-visible:border-neutral-500 focus-visible:ring-0
        "
      />
    </div>
  );
}
