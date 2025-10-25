// Multi-room WebSocket Chat Server
// - Rooms: create/join/switch dynamically
// - Simple room passwords (optional)
// - Broadcast within room
// - Heartbeats to detect dead connections

const http = require('http');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');

const HOST = '0.0.0.0';
const PORT = process.env.PORT || 5001;

// In-memory state
const rooms = new Map(); // roomName -> Set<ws>
const users = new Map(); // ws -> {username, room}
const roomPasswords = new Map(); // roomName -> password (optional)

// Serve static client files
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.join(__dirname, 'public', pathname);

  fs.promises.readFile(filePath)
    .then((buf) => {
      const ext = path.extname(filePath);
      const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
      res.end(buf);
    })
    .catch(() => {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    });
});

const wss = new WebSocket.Server({ server });

function joinRoom(ws, roomName) {
  if (!rooms.has(roomName)) rooms.set(roomName, new Set());
  rooms.get(roomName).add(ws);
  users.set(ws, { ...(users.get(ws) || {}), room: roomName });
}

function leaveRoom(ws) {
  const info = users.get(ws);
  if (info?.room && rooms.has(info.room)) {
    const set = rooms.get(info.room);
    set.delete(ws);
    if (set.size === 0) rooms.delete(info.room);
  }
}

function broadcast(roomName, payload, except = null) {
  if (!rooms.has(roomName)) return;
  const msg = JSON.stringify(payload);
  for (const client of rooms.get(roomName)) {
    if (client !== except && client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

function listRooms() {
  return Array.from(rooms.keys()).sort();
}

function sanitizeText(text, maxLen = 2000) {
  if (typeof text !== 'string') return '';
  const trimmed = text.trim();
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

wss.on('connection', (ws) => {
  ws.isAlive = true;

  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    let packet;
    try { packet = JSON.parse(data.toString()); } catch { return; }

    // packet: {type, username?, room?, text?, password?}
    if (packet.type === 'hello') {
      const username = sanitizeText(packet.username || 'Anon', 64);
      users.set(ws, { username, room: null });
      ws.send(JSON.stringify({ type: 'rooms', rooms: listRooms() }));
      ws.send(JSON.stringify({ type: 'system', text: `Hello ${username}` }));
      return;
    }

    if (packet.type === 'create') {
      const room = sanitizeText(packet.room || 'general', 64);
      const pwd = sanitizeText(packet.password || '', 64);
      if (!rooms.has(room)) rooms.set(room, new Set());
      if (pwd) roomPasswords.set(room, pwd);
      leaveRoom(ws);
      joinRoom(ws, room);
      const info = users.get(ws);
      broadcast(room, { type: 'system', text: `${info.username} created room "${room}"` }, ws);
      ws.send(JSON.stringify({ type: 'joined', room }));
      return;
    }

    if (packet.type === 'join') {
      const room = sanitizeText(packet.room || 'general', 64);
      const pwd = sanitizeText(packet.password || '', 64);
      const required = roomPasswords.get(room) || '';
      if (required && pwd !== required) {
        ws.send(JSON.stringify({ type: 'error', text: 'Wrong password' }));
        return;
      }
      leaveRoom(ws);
      joinRoom(ws, room);
      const info = users.get(ws);
      broadcast(room, { type: 'system', text: `${info.username} joined "${room}"` }, ws);
      ws.send(JSON.stringify({ type: 'joined', room }));
      ws.send(JSON.stringify({ type: 'rooms', rooms: listRooms() }));
      return;
    }

    if (packet.type === 'chat') {
      const info = users.get(ws);
      if (!info?.room) {
        ws.send(JSON.stringify({ type: 'error', text: 'Join or create a room first' }));
        return;
      }
      const text = sanitizeText(packet.text, 2000);
      const payload = { type: 'chat', username: info.username, text, ts: Date.now(), room: info.room };
      broadcast(info.room, payload);
      return;
    }

    if (packet.type === 'list') {
      ws.send(JSON.stringify({ type: 'rooms', rooms: listRooms() }));
      return;
    }
  });

  ws.on('close', () => {
    const info = users.get(ws);
    if (info?.room) {
      broadcast(info.room, { type: 'system', text: `${info.username} left "${info.room}"` });
    }
    leaveRoom(ws);
    users.delete(ws);
  });
});

// Heartbeat to clean up dead sockets
const interval = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

wss.on('close', () => clearInterval(interval));

server.listen(PORT, HOST, () => {
  console.log(`HTTP+WS server listening on http://${HOST}:${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});