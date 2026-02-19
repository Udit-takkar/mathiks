function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Question {
  expression: string;
  answer: number;
}

export type Difficulty = "easy" | "medium" | "hard";

export function generateQuestion(
  seed: number,
  index: number,
  difficulty: Difficulty = "medium",
): Question {
  const rng = mulberry32(seed + index * 7919);

  const ops = getOpsForDifficulty(difficulty);
  const op = ops[Math.floor(rng() * ops.length)];

  let a: number;
  let b: number;
  let answer: number;

  switch (op) {
    case "×": {
      const [maxA, maxB] = difficulty === "easy" ? [10, 10] : difficulty === "medium" ? [12, 12] : [20, 20];
      a = Math.floor(rng() * maxA) + 2;
      b = Math.floor(rng() * maxB) + 2;
      answer = a * b;
      break;
    }
    case "+": {
      const max = difficulty === "easy" ? 50 : difficulty === "medium" ? 99 : 999;
      a = Math.floor(rng() * max) + 10;
      b = Math.floor(rng() * max) + 10;
      answer = a + b;
      break;
    }
    case "-": {
      const max = difficulty === "easy" ? 50 : difficulty === "medium" ? 99 : 999;
      a = Math.floor(rng() * max) + 10;
      b = Math.floor(rng() * (a - 1)) + 1;
      answer = a - b;
      break;
    }
    case "÷": {
      const maxDiv = difficulty === "easy" ? 10 : difficulty === "medium" ? 12 : 20;
      b = Math.floor(rng() * (maxDiv - 1)) + 2;
      answer = Math.floor(rng() * maxDiv) + 2;
      a = b * answer;
      break;
    }
    default: {
      a = 1;
      b = 1;
      answer = 2;
    }
  }

  return { expression: `${a} ${op} ${b}`, answer };
}

function getOpsForDifficulty(difficulty: Difficulty): string[] {
  switch (difficulty) {
    case "easy":
      return ["+", "-", "×"];
    case "medium":
      return ["+", "-", "×", "÷"];
    case "hard":
      return ["+", "-", "×", "÷"];
  }
}
