import "dotenv/config";
import express from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

import { World } from "./state.js";
import { createEmbeddingProvider } from "./embeddings/index.js";
import { configFromEnv, runTick } from "./rooms/engine.js";
import { BotRunner, createMessageGenerator } from "./bots/bot.js";
import { ConnectionHub } from "./ws/handlers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Defense in depth: a single bad request degrading to a logged error beats
// the whole in-memory world (every room, every conversation) getting wiped
// by a process crash + systemd restart. See ws/handlers.ts for the one
// concrete crash this was written to catch (a malformed WS frame); this is
// the backstop for anything else.
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception (continuing):", err);
});
process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection (continuing):", err);
});

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? 3000);
  const tickMs = Number(process.env.TICK_MS ?? 4000);

  const world = new World();
  const embeddings = createEmbeddingProvider();
  const engineConfig = configFromEnv();
  const hub = new ConnectionHub(world, embeddings);

  const generator = await createMessageGenerator();
  const botRunner = new BotRunner(world, embeddings, generator, (roomId, message) => {
    hub.broadcastMessage(roomId, message);
    hub.broadcastRoomList();
  });
  botRunner.spawnAll();
  botRunner.start();

  const app = express();
  app.use(express.static(path.join(__dirname, "public")));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });
  wss.on("connection", (ws) => hub.registerConnection(ws));

  const tick = setInterval(() => {
    const events = runTick(world, engineConfig);
    if (events.length === 0) return;
    for (const event of events) hub.broadcastToAll({ type: "event", event });
    hub.broadcastRoomList();
    hub.refreshAllRoomViews();
  }, tickMs);

  const shutdown = () => {
    clearInterval(tick);
    botRunner.stop();
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  server.listen(port, () => {
    console.log(`Drift listening on http://localhost:${port}`);
    console.log(`Embedding provider: ${process.env.EMBEDDING_PROVIDER ?? "hash"}`);
    console.log(`Bots: ${process.env.ANTHROPIC_API_KEY ? "Claude-powered" : "scripted (set ANTHROPIC_API_KEY for live bots)"}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
