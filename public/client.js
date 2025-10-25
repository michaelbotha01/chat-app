let ws = null;
let me = { username: 'Anon', room: null };

const els = {
  server: document.getElementById('server'),
  username: document.getElementById('username'),
  connect: document.getElementById('connect'),
  disconnect: document.getElementById('disconnect'),
  roomJoin: document.getElementById('roomJoin'),
  roomJoinPwd: document.getElementById('roomJoinPwd'),
  roomCreate: document.getElementById('roomCreate'),
  roomCreatePwd: document.getElementById('roomCreatePwd'),
  join: document.getElementById('join'),
  create: document.getElementById('create'),
  refreshRooms: document.getElementById('refreshRooms'),
  rooms: document.getElementById('rooms'),
  status: document.getElementById('status'),
  currentRoom: document.getElementById('currentRoom'),
  messages: document.getElementById('messages'),
  text: document.getElementById('text'),
  send: document.getElementById('send'),
};

function setStatus(text) { els.status.textContent = text; }
function setRoom(room) { els.currentRoom.textContent = room || 'none'; }
function addSystem(text) {
  const el = document.createElement('div');
  el.className = 'system';
  el.textContent = text;
  els.messages.appendChild(el);
  els.messages.scrollTop = els.messages.scrollHeight;
}
function addMessage({ username, text, ts, room }) {
  const wrap = document.createElement('div');
  wrap.className = 'msg';
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `${username} • ${new Date(ts).toLocaleTimeString()} • #${room}`;
  const body = document.createElement('div');
  body.textContent = text;
  wrap.appendChild(meta);
  wrap.appendChild(body);
  els.messages.appendChild(wrap);
  els.messages.scrollTop = els.messages.scrollHeight;
}

function renderRooms(list) {
  els.rooms.innerHTML = '';
  list.forEach((name) => {
    const btn = document.createElement('button');
    btn.textContent = name;
    btn.onclick = () => {
      els.roomJoin.value = name;
      els.roomJoinPwd.value = '';
    };
    els.rooms.appendChild(btn);
  });
}

function connect() {
  const url = els.server.value.trim() || 'ws://localhost:5001';
  me.username = els.username.value.trim() || 'Anon';

  try {
    ws = new WebSocket(url);
  } catch (e) {
    setStatus('invalid url');
    return;
  }

  setStatus('connecting...');
  ws.onopen = () => {
    setStatus('connected');
    ws.send(JSON.stringify({ type: 'hello', username: me.username }));
    addSystem(`Connected to ${url} as ${me.username}`);
    els.connect.disabled = true;
    els.disconnect.disabled = false;
  };

  ws.onmessage = (evt) => {
    let packet;
    try { packet = JSON.parse(evt.data); } catch { return; }

    if (packet.type === 'system') {
      addSystem(packet.text);
    } else if (packet.type === 'rooms') {
      renderRooms(packet.rooms);
    } else if (packet.type === 'joined') {
      me.room = packet.room;
      setRoom(me.room);
      addSystem(`Joined "${me.room}"`);
    } else if (packet.type === 'chat') {
      addMessage(packet);
    } else if (packet.type === 'error') {
      addSystem(`Error: ${packet.text}`);
    }
  };

  ws.onclose = () => {
    setStatus('disconnected');
    els.connect.disabled = false;
    els.disconnect.disabled = true;
    addSystem('Disconnected');
  };

  ws.onerror = () => {
    setStatus('error');
    addSystem('Connection error');
  };
}

function disconnect() {
  if (ws) {
    ws.close();
    ws = null;
  }
}

function joinRoom() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const room = els.roomJoin.value.trim() || 'general';
  const pwd = els.roomJoinPwd.value.trim();
  ws.send(JSON.stringify({ type: 'join', room, password: pwd }));
}

function createRoom() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const room = els.roomCreate.value.trim() || 'newroom';
  const pwd = els.roomCreatePwd.value.trim();
  ws.send(JSON.stringify({ type: 'create', room, password: pwd }));
}

function sendChat() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const text = els.text.value.trim();
  if (!text) return;
  ws.send(JSON.stringify({ type: 'chat', text }));
  els.text.value = '';
}

els.connect.addEventListener('click', connect);
els.disconnect.addEventListener('click', disconnect);
els.join.addEventListener('click', joinRoom);
els.create.addEventListener('click', createRoom);
els.refreshRooms.addEventListener('click', () => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: 'list' }));
});
els.send.addEventListener('click', sendChat);
els.text.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

// Defaults
els.server.value = 'ws://localhost:5001';
setStatus('disconnected');
setRoom(null);