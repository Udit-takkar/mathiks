import { create } from "zustand";

export type GamePhase = "idle" | "queuing" | "playing" | "ended";
export type ConnectionStatus = "disconnected" | "connecting" | "connected";
export type GameResult = "win" | "lose" | "draw";

interface Question {
  expression: string;
  answer: number;
}

interface Opponent {
  userId: string;
  elo: number;
}

interface GameState {
  phase: GamePhase;
  connection: ConnectionStatus;

  question: Question | null;
  nextEncrypted: Uint8Array | null;
  scores: [number, number];
  opponent: Opponent | null;

  result: GameResult | null;
  eloDelta: number;
  newElo: number;

  serverStartsAt: number;
  duration: number;
  clockOffset: number;
  pingSamples: number[];

  roomId: string | null;

  setPhase: (phase: GamePhase) => void;
  setConnection: (status: ConnectionStatus) => void;

  startGame: (
    question: Question,
    nextEncrypted: Uint8Array,
    startsAt: number,
    duration: number,
    opponent: Opponent | null,
  ) => void;
  setQuestion: (question: Question, nextEncrypted?: Uint8Array) => void;
  updateScores: (scores: [number, number]) => void;

  endGame: (result: GameResult, eloDelta: number, newElo: number, scores: [number, number]) => void;

  addPingSample: (serverTime: number) => void;

  setRoomId: (roomId: string) => void;
  setOpponent: (opponent: Opponent) => void;

  reset: () => void;
}

const initialState = {
  phase: "idle" as GamePhase,
  connection: "disconnected" as ConnectionStatus,
  question: null,
  nextEncrypted: null,
  scores: [0, 0] as [number, number],
  opponent: null,
  result: null,
  eloDelta: 0,
  newElo: 0,
  serverStartsAt: 0,
  duration: 0,
  clockOffset: 0,
  pingSamples: [] as number[],
  roomId: null,
};

export const useGameStore = create<GameState>((set, get) => ({
  ...initialState,

  setPhase: (phase) => set({ phase }),
  setConnection: (connection) => set({ connection }),

  startGame: (question, nextEncrypted, startsAt, duration, opponent) =>
    set({
      phase: "playing",
      question,
      nextEncrypted,
      serverStartsAt: startsAt,
      duration,
      opponent,
      scores: [0, 0],
      result: null,
      eloDelta: 0,
    }),

  setQuestion: (question, nextEncrypted) =>
    set((state) => ({
      question,
      nextEncrypted: nextEncrypted ?? state.nextEncrypted,
    })),

  updateScores: (scores) => set({ scores }),

  endGame: (result, eloDelta, newElo, scores) =>
    set({ phase: "ended", result, eloDelta, newElo, scores }),

  addPingSample: (serverTime) => {
    const now = Date.now();
    const offset = serverTime - now;
    const samples = [...get().pingSamples, offset].slice(-3);
    const sorted = [...samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    set({ pingSamples: samples, clockOffset: median });
  },

  setRoomId: (roomId) => set({ roomId }),
  setOpponent: (opponent) => set({ opponent }),

  reset: () => set(initialState),
}));
