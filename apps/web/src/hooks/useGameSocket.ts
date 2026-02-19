"use client";

import { useEffect, useRef, useCallback } from "react";
import { GameSocket, type ServerMessage } from "@/lib/ws";
import { decryptQuestion } from "@/lib/crypto";
import { useGameStore } from "@/lib/store";
import { toast } from "sonner";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8787";

export function useMatchmaking(userId: string, elo: number) {
  const socketRef = useRef<GameSocket | null>(null);
  const { setPhase, setConnection, setRoomId, setOpponent } = useGameStore();

  const joinQueue = useCallback(() => {
    if (socketRef.current) return;

    setPhase("queuing");
    setConnection("connecting");

    socketRef.current = new GameSocket({
      url: `${WS_BASE}/ws/matchmaking?userId=${userId}&elo=${elo}`,
      onOpen: () => {
        setConnection("connected");
        socketRef.current?.send({ t: "join_queue", userId, elo });
      },
      onMessage: (msg) => {
        if (msg.t === "matched") {
          toast.success("Opponent found!");
          setRoomId(msg.roomId);
          setOpponent(msg.opponent);
          socketRef.current?.close();
          socketRef.current = null;
        }
      },
      onClose: () => {
        setConnection("disconnected");
      },
    });
  }, [userId, elo, setPhase, setConnection, setRoomId, setOpponent]);

  const leaveQueue = useCallback(() => {
    socketRef.current?.send({ t: "leave_queue" });
    socketRef.current?.close();
    socketRef.current = null;
    setPhase("idle");
  }, [setPhase]);

  useEffect(() => {
    return () => {
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  return { joinQueue, leaveQueue };
}

export function useGameRoom(userId: string, elo: number) {
  const socketRef = useRef<GameSocket | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const store = useGameStore();

  useEffect(() => {
    if (!store.roomId || store.phase === "ended") return;

    store.setConnection("connecting");

    const socket = new GameSocket({
      url: `${WS_BASE}/ws/game/${store.roomId}?userId=${userId}&elo=${elo}`,
      onOpen: () => {
        store.setConnection("connected");

        pingIntervalRef.current = setInterval(() => {
          socket.send({ t: "ping" });
        }, 500);

        setTimeout(() => {
          if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
            pingIntervalRef.current = null;
          }
        }, 2000);
      },
      onMessage: async (msg: ServerMessage) => {
        switch (msg.t) {
          case "pong":
            store.addPingSample(msg.st);
            break;

          case "game_start":
            store.startGame(
              msg.q,
              msg.nextEnc,
              msg.startsAt,
              msg.duration,
              msg.opp,
            );
            break;

          case "result":
            store.updateScores(msg.scores);
            if (msg.ok && msg.key && store.nextEncrypted) {
              const decrypted = await decryptQuestion(store.nextEncrypted, msg.key);
              store.setQuestion(decrypted, msg.nextEnc);
            }
            break;

          case "opp_answered":
            store.updateScores(msg.scores);
            break;

          case "game_end":
            store.endGame(msg.result, msg.eloDelta, msg.newElo, msg.scores);
            break;

          case "opp_disconnected":
            toast.warning("Opponent disconnected");
            break;
        }
      },
      onClose: () => {
        store.setConnection("disconnected");
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
        if (store.phase === "playing") {
          toast.error("Connection lost");
        }
      },
      maxRetries: 0,
    });

    socketRef.current = socket;

    return () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      socket.close();
      socketRef.current = null;
    };
  }, [store.roomId]);

  const submitAnswer = useCallback((answer: number) => {
    socketRef.current?.send({ t: "answer", a: answer });
  }, []);

  return { submitAnswer };
}
