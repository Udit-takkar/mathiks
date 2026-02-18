function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateQuestion(seed: number, index: number) {
  const rng = mulberry32(seed + index * 7919); // 7919 is a prime, spreads values

  const ops = ["+", "-", "×", "÷"];
  const op = ops[Math.floor(rng() * 4)];

  let a: number, b: number, answer: number;

  switch (op) {
    case "×":
      a = Math.floor(rng() * 12) + 2; // 2-13
      b = Math.floor(rng() * 12) + 2;
      answer = a * b;
      break;
    case "+":
      a = Math.floor(rng() * 90) + 10; // 10-99
      b = Math.floor(rng() * 90) + 10;
      answer = a + b;
      break;
    case "-":
      a = Math.floor(rng() * 90) + 10;
      b = Math.floor(rng() * a); // b < a, no negatives
      answer = a - b;
      break;
    case "÷":
      b = Math.floor(rng() * 11) + 2; // 2-12
      answer = Math.floor(rng() * 12) + 2;
      a = b * answer; // Ensures clean division
      break;
  }

  return { expression: `${a} ${op} ${b}`, answer };
}
