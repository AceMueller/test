// Standalone end-to-end smoke test: connects two WebSocket clients to a
// running Drift server, has them post distinct-topic messages into the
// Lobby, and confirms the server actually fractures the room -- proving
// the full pipeline (WS protocol -> World mutation -> merge/fracture
// engine -> broadcast) works, not just the pure decision functions the
// unit tests cover.
//
// Usage: start the server (npm run dev) in one terminal, then in another:
//   node scripts/smoke-test.mjs

import WebSocket from "ws";

const URL = process.env.DRIFT_URL ?? "ws://localhost:3000";

const COOKING = [
  "what's your favorite pasta recipe for a weeknight dinner",
  "I love making fresh tomato sauce from scratch",
  "garlic and olive oil are essential in my kitchen",
  "simmer the tomato sauce for twenty minutes on low heat",
  "fresh basil in the sauce makes such a difference",
  "parmesan cheese on top of the pasta is a must",
  "my grandmother's pasta recipe uses three kinds of cheese",
  "I always toast the garlic before adding it to the sauce",
];

const SPACE = [
  "the rocket launch window opens next tuesday morning",
  "the rocket booster separated cleanly from the stage",
  "mission control confirmed the rocket reached orbit",
  "the astronauts began their scheduled spacewalk today",
  "telemetry from the rocket looks nominal so far",
  "the spacecraft docked with the station without issue",
  "engineers are reviewing booster performance after launch",
  "the next launch attempt depends on weather at the pad",
];

function connectAndJoin(name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    const events = [];
    ws.on("message", (raw) => events.push(JSON.parse(raw.toString())));
    ws.on("open", () => ws.send(JSON.stringify({ type: "join", name })));
    ws.on("error", reject);
    const check = setInterval(() => {
      if (events.some((e) => e.type === "welcome")) {
        clearInterval(check);
        resolve({ ws, events });
      }
    }, 50);
    setTimeout(() => {
      clearInterval(check);
      reject(new Error(`${name} never got a welcome message`));
    }, 5000);
  });
}

function sendChat(ws, text) {
  ws.send(JSON.stringify({ type: "chat", text }));
}

function waitForEvent(events, type, timeoutMs) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = setInterval(() => {
      const found = events.find((e) => e.type === "event" && e.event.type === type);
      if (found) {
        clearInterval(check);
        resolve(found.event);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(check);
        reject(new Error(`timed out waiting for ${type} (saw: ${events.map((e) => e.type).join(", ")})`));
      }
    }, 200);
  });
}

async function main() {
  console.log(`Connecting to ${URL}...`);
  const alice = await connectAndJoin("Alice");
  const bob = await connectAndJoin("Bob");
  console.log("Both clients joined the Lobby.");

  console.log("Posting 8 cooking-topic messages as Alice, 8 space-topic messages as Bob...");
  for (let i = 0; i < COOKING.length; i++) {
    sendChat(alice.ws, COOKING[i]);
    sendChat(bob.ws, SPACE[i]);
    await new Promise((r) => setTimeout(r, 50));
  }

  console.log("Waiting for the tick loop to fracture the Lobby...");
  const fractureEvent = await waitForEvent(alice.events, "room:fractured", 15_000);
  console.log("PASS: room:fractured event received:", fractureEvent);

  alice.ws.close();
  bob.ws.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
