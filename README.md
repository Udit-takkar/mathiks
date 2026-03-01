# Mathiks

Real-time 1v1 competitive math game. Players are matched by ELO rating, solve arithmetic problems head-to-head under a 60-second timer, and gain or lose ELO based on the result.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Zustand, Tailwind CSS, shadcn/ui |
| Backend | Cloudflare Workers (Hono), Durable Objects, Queues |
| Database | Neon PostgreSQL (source of truth) + Cloudflare D1 (edge cache) |
| Auth | Better Auth (email/password + Google OAuth) |
| Protocol | msgpack binary over WebSocket, AES-GCM question encryption |
| Monorepo | pnpm workspaces + Turborepo |

## Architecture

```
                         ┌─────────────────────────────────────────────┐
                         │              Cloudflare Edge                │
                         │                                             │
Browser ──WS──►  Worker (Hono)  ──►  MatchMaker DO (sharded by ELO)   │
                     │                    │                            │
                     │              ┌─────┴───────┐                   │
                     │              │ Cross-shard  │                   │
                     │              │  DO ↔ DO     │                   │
                     │              └──────────────┘                   │
                     │                                                 │
                     ├──►  GameRoom DO (one per match)                 │
                     │                                                 │
                     ├──►  D1 (edge reads: leaderboard, ELO)          │
                     │                                                 │
                     └──►  Queue ──► Consumer ──┬──► Neon PostgreSQL   │
                                                └──► D1 (write-back)  │
                         └─────────────────────────────────────────────┘
```

## Project Structure

```
mathiks/
├── apps/
│   ├── web/                          # Next.js frontend
│   │   └── src/
│   │       ├── app/                  # Pages: auth, dashboard, game
│   │       ├── components/game/      # GameBoard, ScoreBoard, QuestionDisplay, AnswerInput
│   │       ├── hooks/                # useGameSocket (matchmaking + game room WS)
│   │       └── lib/                  # Zustand store, WebSocket client, AES-GCM crypto
│   │
│   └── server/damp-block-c720/       # Cloudflare Workers backend
│       └── src/
│           ├── index.ts              # Hono routes, queue consumer
│           ├── game-room.ts          # GameRoom Durable Object
│           ├── protocol.ts           # msgpack + AES-GCM encryption
│           ├── shard-config.ts       # ELO bucket & sub-shard routing
│           ├── matchmaker/
│           │   ├── index.ts          # MatchMaker Durable Object
│           │   ├── queue-store.ts    # Sorted array + index maps
│           │   ├── local-matcher.ts  # ELO-range pair matching
│           │   ├── cross-shard-coordinator.ts  # Two-phase overflow
│           │   ├── cross-shard-client.ts       # DO-to-DO HTTP client
│           │   └── types.ts          # Message types + validators
│           ├── db/
│           │   ├── schema.ts         # D1 schema (Drizzle)
│           │   └── pg-schema.ts      # PostgreSQL schema (Drizzle)
│           └── lib/auth.ts           # Better Auth config + D1 sync hook
│
├── turbo.json
└── pnpm-workspace.yaml
```

## System Design

### Matchmaking

Players are routed to **ELO-sharded Durable Objects**. Each shard covers a 200-point ELO bucket. Hot buckets (1000-1400 where most players cluster) are further divided into **sub-shards** by hashing the userId (up to 25 sub-shards per bucket).

```
Player (ELO 1250) ──► getShardName(1250, id)
                           │
                      bucket = floor(1250/200) = 6
                      sub   = hash(id) % 25 = 14
                           │
                      ──► matchmaker-6-14  (Durable Object)
```

**Local matching** uses a sorted queue with binary search insertion. The matching algorithm does a single-pass scan, pairing players whose ELO difference falls within an expanding range:

```
Time waiting    ELO range
0s              ±50
3s              ±100
6s              ±150
9s              ±200
...             ...
15s+            ±300 (cap)
```

**Cross-shard matching** activates after 5 seconds if no local match is found. Uses a **two-phase commit** protocol to prevent one-sided matches:

```
Shard A (has player)              Shard B (has opponent)
        │                                  │
        ├── find_match ───────────────────►│
        │                                  ├── lock opponent
        │◄── match_found (roomId, opp) ───┤
        │                                  │
  [check player still queued]              │
        │                                  │
        ├── confirm_match ────────────────►│
        │                                  ├── send "matched" to opponent
        │◄── confirmed ──────────────────┤   remove from queue
        │                                  │
  send "matched" to player                 │
  remove from queue                        │
```

If player A disconnects during the async round-trip, Shard A sends `cancel_match` instead, and the opponent stays in queue.

**Adaptive fan-out**: when a shard has few players (≤10), it queries all sibling/neighbor shards in parallel. When busy, it randomly samples 3 targets per cycle to avoid overwhelming the system.

### Game Room

Each match runs in its own **GameRoom Durable Object**:

- Both players connect via WebSocket to `/ws/game/:roomId`
- Questions generated deterministically from a shared seed (same questions, same order)
- Next question is **pre-encrypted** (AES-GCM) and sent with the current result; the decryption key is only revealed when the player answers correctly
- 60-second countdown, scores tracked server-side
- On game end, match result is pushed to a **Cloudflare Queue**

### Database

**Dual-write** with PostgreSQL as source of truth:

```
                  ┌──────────────┐
                  │ Neon Postgres │ ◄── Source of truth
                  │              │     Auth, ELO, match history
                  └──────────────┘
                         ▲
                         │  Queue consumer writes
                         │  match results to both
                         ▼
                  ┌──────────────┐
                  │ Cloudflare D1 │ ◄── Edge cache
                  │              │     Fast reads: leaderboard, current ELO
                  └──────────────┘
```

- New user signs up → Better Auth writes to Postgres → `databaseHooks.user.create.after` syncs to D1
- Match ends → Queue consumer updates ELO + writes match to both databases (D1 is best-effort)
- WebSocket auth fetches current ELO from D1 (low latency at the edge)

### Auth

- **Better Auth** with Drizzle adapter on Neon PostgreSQL
- Email/password and Google OAuth
- Session cookies managed automatically
- WebSocket endpoints: Worker validates session, fetches current ELO from D1, passes `userId`/`elo`/`name` as URL params to the Durable Object (server-trusted, client cannot spoof)

## WebSocket Protocol

All messages are msgpack-encoded binary.

**Matchmaking (`/ws/matchmaking`)**

| Direction | Type | Payload |
|-----------|------|---------|
| Client → | `join_queue` | — |
| Client → | `leave_queue` | — |
| ← Server | `queued` | `position` |
| ← Server | `matched` | `roomId`, `opponent: { userId, elo, name }` |

**Game Room (`/ws/game/:roomId`)**

| Direction | Type | Payload |
|-----------|------|---------|
| Client → | `answer` | `a: number` |
| ← Server | `game_start` | `q` (clear), `nextEnc` (encrypted), `startsAt`, `duration`, `opp` |
| ← Server | `result` | `ok`, `key` (AES), `nextEnc`, `scores` |
| ← Server | `opp_answered` | `scores` |
| ← Server | `game_end` | `result`, `eloDelta`, `newElo`, `scores` |

## ELO System

Standard chess ELO formula with K-factor 32:

```
expected = 1 / (1 + 10^((opponentElo - playerElo) / 400))
delta    = round(K * (score - expected))
```

- Starting ELO: 1200
- `score`: 1 (win), 0.5 (draw), 0 (loss)
- Win against higher-rated → large gain; loss against lower-rated → large loss

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm
- Cloudflare account (for Workers, D1, Queues)
- Neon PostgreSQL database

### Setup

```bash
git clone https://github.com/your-username/mathiks.git
cd mathiks
pnpm install
```

Create `apps/server/damp-block-c720/.dev.vars`:

```env
DATABASE_URL=postgresql://...
BETTER_AUTH_URL=http://localhost:8787
BETTER_AUTH_SECRET=your-secret
FRONTEND_URL=http://localhost:3000
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

### Database Migrations

```bash
cd apps/server/damp-block-c720

# PostgreSQL (Neon)
pnpm db:pg:generate
pnpm db:pg:migrate

# D1 (local)
pnpm db:generate
pnpm db:migrate:local
```

### Development

```bash
# From root — starts both frontend and backend
pnpm dev
```

- Frontend: http://localhost:3000
- Backend: http://localhost:8787

### Scripts

| Script | Location | Description |
|--------|----------|-------------|
| `pnpm dev` | root | Start all apps via Turbo |
| `pnpm dev` | `apps/web` | Next.js dev server |
| `pnpm dev` | `apps/server/...` | Wrangler dev server |
| `pnpm deploy` | `apps/server/...` | Deploy to Cloudflare |
| `pnpm db:generate` | `apps/server/...` | Generate D1 migrations |
| `pnpm db:migrate:local` | `apps/server/...` | Apply D1 migrations locally |
| `pnpm db:migrate:remote` | `apps/server/...` | Apply D1 migrations to production |
| `pnpm db:pg:generate` | `apps/server/...` | Generate PostgreSQL migrations |
| `pnpm db:pg:migrate` | `apps/server/...` | Apply PostgreSQL migrations |
| `pnpm cf-typegen` | `apps/server/...` | Generate Cloudflare binding types |
