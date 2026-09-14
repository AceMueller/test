# Drift

A chat system where rooms aren't fixed: they merge when their conversations
converge on the same topic, and fracture when a single room's conversation
splits into distinct threads. Humans and AI bots share the same rooms.

This is a small learning prototype, not a production app: everything lives
in memory (state resets on restart), there's no auth, and the "topic
similarity" signal is a deliberately simple, dependency-free embedding —
see [How similarity works](#how-similarity-works) below for why.

## Running it

```
npm install
cp .env.example .env   # optional -- see Configuration below
npm run dev
```

Open http://localhost:3000, pick a name, and join the Lobby. Four bot
personas (cooking, space, music, games) are already chatting there; watch
the room list in the sidebar and the event log strip in the header as the
lobby fractures into per-topic rooms over the next minute or so.

## How it works

- **Rooms** hold messages and participants (`src/state.ts`).
- Every message is embedded into a vector (`src/embeddings/`).
- A tick loop (`src/rooms/engine.ts`, every `TICK_MS`) evaluates every room:
  - **Fracture**: aggregate each participant's recent messages in the room
    into one "topic vector." If two (or more) participants' topic vectors
    have gone below `FRACTURE_THRESHOLD` average similarity, a quick k=2
    k-means checks whether they split cleanly into two groups; if so, the
    smaller group's messages and participants move into a new room.
  - **Merge**: compare every pair of rooms' overall topic vectors; if they're
    at or above `MERGE_THRESHOLD` similarity, merge them into one room.
  - Every room touched by either gets a cooldown (`ROOM_COOLDOWN_MS`) so it
    can't immediately flap back — the fracture threshold is set well below
    the merge threshold for the same reason (hysteresis).
- Every merge/fracture is broadcast to all connected clients as a `event`
  message over WebSocket, and shown in the header's event log.

## How similarity works

Real sentence-embedding models need either a local model download
(`huggingface.co`) or a hosted embedding API (OpenAI, Voyage, etc). In the
sandbox this was built in, the outbound network proxy allows
`registry.npmjs.org` and `api.anthropic.com`, but blocks all three of those
— so neither option can be tested there. The default embedder
(`src/embeddings/hashEmbedding.ts`) is instead a dependency-free "hashing
trick" bag-of-words vector: content words (stopwords dropped) are hashed
into a fixed-size vector with a random sign, then L2-normalized.

This is much cruder than a real embedding model, and individual short
messages are too lexically sparse for it to compare reliably on their own —
that's why the engine aggregates a participant's recent messages into one
vector before comparing (see `participantVectors` in `engine.ts`). Tested
against realistic short chat messages, that aggregate signal separates
distinct topics with a wide margin (~0.4+ similarity for the same topic vs
~0.05 for unrelated topics), which is what the default thresholds are
tuned against.

If your environment *does* have network access to `huggingface.co`, a real
local transformer embedder is documented (not installed by default) in
`src/embeddings/transformersEmbedding.ts` — run
`npm install @xenova/transformers` and set `EMBEDDING_PROVIDER=transformers`.
Everything else is unchanged, since the rest of the app only depends on the
`EmbeddingProvider` interface.

## Bots

Four personas (`src/bots/bot.ts`): cooking, space, music, games. Each posts
into whichever room it's currently in, on a randomized interval.

- **No `ANTHROPIC_API_KEY` set**: bots cycle through a small canned phrase
  list per persona (`src/bots/scriptedBot.ts`). The demo works with zero
  external keys.
- **`ANTHROPIC_API_KEY` set**: bots generate each message live via the
  Claude API, in character, aware of recent room context
  (`src/bots/llmBot.ts`).

## Configuration

All optional — see `.env.example`. Notable ones:

| Var | Default | What it does |
|---|---|---|
| `PORT` | `3000` | HTTP/WS port |
| `ANTHROPIC_API_KEY` | unset | enables Claude-powered bots |
| `EMBEDDING_PROVIDER` | `hash` | `hash` (offline) or `transformers` (needs network + the optional package) |
| `TICK_MS` | `4000` | how often the merge/fracture engine runs |
| `FRACTURE_THRESHOLD` / `MERGE_THRESHOLD` | `0.15` / `0.25` | similarity thresholds — see engine.ts for the full set |
| `ROOM_COOLDOWN_MS` | `20000` | how long a room is exempt after a merge/fracture |

## Development

```
npm test              # unit tests (node --test) -- cohesion math, k-means,
                       # and the engine's fracture/merge/no-op decisions
node scripts/smoke-test.mjs   # end-to-end: drives a running server over
                               # real WebSocket connections and confirms a
                               # fracture actually happens (run `npm run dev`
                               # in another terminal first)
```

## Deploying

See [`deploy/README.md`](./deploy/README.md) — a VM works well (this app
needs one persistent process, not a serverless/autoscaled setup); there's
a cloud-init script that sets everything up automatically on first boot.

## Project layout

```
src/
  server.ts            Express + WS bootstrap, starts the tick loop
  types.ts              Room / Message / Participant types
  state.ts               in-memory world state + mutation primitives
  text.ts                  shared stopword/tokenizing helpers
  embeddings/               pluggable EmbeddingProvider (hash default)
  rooms/                     cohesion math, k-means, the merge/fracture engine
  bots/                       personas + LLM/scripted message generators
  ws/                           WebSocket protocol + connection handling
  public/                        static frontend (no build step)
test/                    unit tests
scripts/smoke-test.mjs    end-to-end WS smoke test
deploy/                   VM deployment (systemd unit, setup/cloud-init scripts)
```
