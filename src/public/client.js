let ws = null;
let participantId = null;
let currentRoomId = null;
let currentRoomLabel = "";
let lastRooms = [];

const joinOverlay = document.getElementById("join-overlay");
const app = document.getElementById("app");
const nameInput = document.getElementById("name-input");
const joinBtn = document.getElementById("join-btn");
const roomListEl = document.getElementById("room-list");
const roomHeaderEl = document.getElementById("room-header");
const messagesEl = document.getElementById("messages");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const eventLogEl = document.getElementById("event-log");

function connect(name) {
  const proto = location.protocol === "https:" ? "wss://" : "ws://";
  ws = new WebSocket(proto + location.host);

  ws.addEventListener("open", () => {
    ws.send(JSON.stringify({ type: "join", name }));
  });

  ws.addEventListener("message", (ev) => {
    handleServerMessage(JSON.parse(ev.data));
  });

  ws.addEventListener("close", () => {
    logEvent("Disconnected from server.");
  });

  ws.addEventListener("error", () => {
    logEvent("Connection error.");
  });
}

function handleServerMessage(msg) {
  switch (msg.type) {
    case "welcome":
      participantId = msg.participantId;
      currentRoomId = msg.roomId;
      joinOverlay.hidden = true;
      app.hidden = false;
      chatInput.focus();
      break;
    case "roomState":
      currentRoomId = msg.roomId;
      currentRoomLabel = msg.label;
      roomHeaderEl.textContent = currentRoomLabel;
      renderMessages(msg.messages);
      renderRoomList(lastRooms);
      break;
    case "roomList":
      lastRooms = msg.rooms;
      renderRoomList(lastRooms);
      break;
    case "message":
      if (msg.roomId === currentRoomId) appendMessage(msg.message);
      break;
    case "event":
      handleWorldEvent(msg.event);
      break;
    case "error":
      logEvent(`Error: ${msg.message}`);
      break;
  }
}

function renderMessages(messages) {
  messagesEl.innerHTML = "";
  for (const m of messages) appendMessage(m, false);
  scrollToBottom();
}

function appendMessage(m, scroll = true) {
  const div = document.createElement("div");
  div.className = "message";
  if (m.authorType === "bot") div.classList.add("bot");
  if (m.authorId === participantId) div.classList.add("mine");

  const author = document.createElement("span");
  author.className = "author";
  author.textContent = m.authorName;

  const text = document.createElement("span");
  text.className = "text";
  text.textContent = m.text;

  div.appendChild(author);
  div.appendChild(text);
  messagesEl.appendChild(div);
  if (scroll) scrollToBottom();
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderRoomList(rooms) {
  roomListEl.innerHTML = "";
  for (const room of rooms) {
    const item = document.createElement("button");
    item.className = "room-item" + (room.id === currentRoomId ? " active" : "");

    const label = document.createElement("span");
    label.className = "room-label";
    label.textContent = room.label;

    const meta = document.createElement("span");
    meta.className = "room-meta";
    meta.textContent = `${room.participantCount} here · ${room.messageCount} msgs`;

    item.appendChild(label);
    item.appendChild(meta);
    item.addEventListener("click", () => {
      if (room.id === currentRoomId || !ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: "switchRoom", roomId: room.id }));
    });
    roomListEl.appendChild(item);
  }
}

function handleWorldEvent(event) {
  if (event.type === "room:merged") {
    logEvent(`🔀 rooms merged into "${event.label}"`);
  } else if (event.type === "room:fractured") {
    logEvent(`🧩 "${event.sourceLabel}" split off "${event.newLabel}"`);
  }
}

function logEvent(text) {
  const div = document.createElement("div");
  div.className = "event-entry";
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  div.textContent = `[${time}] ${text}`;
  eventLogEl.prepend(div);
  while (eventLogEl.children.length > 20) eventLogEl.removeChild(eventLogEl.lastChild);
}

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "chat", text }));
  chatInput.value = "";
});

function doJoin() {
  const name = nameInput.value.trim() || "Anonymous";
  joinBtn.disabled = true;
  connect(name);
}

joinBtn.addEventListener("click", doJoin);
nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") doJoin();
});
nameInput.focus();
