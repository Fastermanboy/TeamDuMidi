/**
 * HOLE 'EM ALL — Serveur WebSocket
 * Node.js + ws
 *
 * Installation :
 *   npm install ws
 *   node server.js
 *
 * Variables d'environnement :
 *   PORT  (défaut 8080)
 */

const { WebSocketServer } = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8080;

// ═══════════════════════════════════════
//  CONSTANTES DE JEU (identiques au client)
// ═══════════════════════════════════════
const WORLD_W   = 6400;
const WORLD_H   = 4800;
const FOOD_COUNT = 200;
const FOOD_RADIUS = 8;
const BASE_SIZE  = 38;
const GROW_FOOD  = 4;
const GROW_PLAYER= 18;
const BASE_SPEED = 2.2;
const FRICTION   = 0.85;
const TICK_MS    = 1000 / 60;   // 60 Hz

const PLAYER_COLORS = [
  { main: '#ff4d4d', glow: '#ff0000' },
  { main: '#4d9fff', glow: '#0066ff' },
  { main: '#4dff7a', glow: '#00cc44' },
  { main: '#ffcc00', glow: '#ff9900' },
  { main: '#cc44ff', glow: '#9900ff' },
  { main: '#ff8800', glow: '#ff5500' },
  { main: '#00ffee', glow: '#00bbbb' },
  { main: '#ff66aa', glow: '#ff0066' },
];

// ═══════════════════════════════════════
//  STATE GLOBAL
// ═══════════════════════════════════════
let rooms      = {};          // roomId → RoomState
let clientRoom = new Map();   // ws → roomId
let clientId   = new Map();   // ws → playerId

// ═══════════════════════════════════════
//  HTTP (ping de santé)
// ═══════════════════════════════════════
const server = http.createServer((req, res) => {
  res.writeHead(200); res.end('HOLE EM ALL server OK');
});
const wss = new WebSocketServer({ server });

server.listen(PORT, () => console.log(`🕳  Serveur démarré sur le port ${PORT}`));

// ═══════════════════════════════════════
//  CONNEXION WS
// ═══════════════════════════════════════
wss.on('connection', ws => {
  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    handleMessage(ws, msg);
  });

  ws.on('close', () => {
    const rid = clientRoom.get(ws);
    const pid = clientId.get(ws);
    if (!rid || !rooms[rid]) return;
    const room = rooms[rid];

    const p = room.players.find(p => p.id === pid);
    if (p) { p.alive = false; p.disconnected = true; }
    clientRoom.delete(ws);
    clientId.delete(ws);

    broadcast(room, { type: 'playerLeft', playerId: pid });

    const connected = room.players.filter(p => !p.disconnected);
    if (connected.length === 0) destroyRoom(rid);
  });
});

// ═══════════════════════════════════════
//  MESSAGES
// ═══════════════════════════════════════
function handleMessage(ws, msg) {
  switch (msg.type) {

    case 'createRoom': {
      const rid = genId(6);
      const room = createRoom(rid, msg.duration || 120);
      rooms[rid] = room;
      const pid = joinRoom(ws, room, msg.name);
      room.hostId = pid; // ← on mémorise explicitement le host
      send(ws, { type: 'roomCreated', roomId: rid, playerId: pid, colors: PLAYER_COLORS });
      // Envoyer lobbyUpdate au créateur aussi (pour qu'il voie son nom dans la liste)
      broadcast(room, { type: 'lobbyUpdate', players: room.players.map(lobbyPlayer) });
      break;
    }

    case 'joinRoom': {
      const room = rooms[msg.roomId];
      if (!room) { send(ws, { type: 'error', msg: 'Room introuvable' }); return; }
      if (room.started) { send(ws, { type: 'error', msg: 'Partie déjà commencée' }); return; }
      if (room.players.length >= 8) { send(ws, { type: 'error', msg: 'Room pleine (8 max)' }); return; }
      const pid = joinRoom(ws, room, msg.name);
      send(ws, { type: 'roomJoined', roomId: msg.roomId, playerId: pid, colors: PLAYER_COLORS });
      broadcast(room, { type: 'lobbyUpdate', players: room.players.map(lobbyPlayer) });
      break;
    }

    case 'startGame': {
      const room = rooms[clientRoom.get(ws)];
      if (!room || room.started) return;
      if (room.players.length < 2) { send(ws, { type: 'error', msg: 'Il faut au moins 2 joueurs' }); return; }
      // Seul le host peut démarrer — on compare avec hostId (robuste)
      if (room.hostId !== clientId.get(ws)) {
        send(ws, { type: 'error', msg: 'Seul le host peut lancer la partie' });
        return;
      }
      startRoom(room);
      break;
    }

    case 'input': {
      const room = rooms[clientRoom.get(ws)];
      if (!room || !room.started) return;
      const p = room.players.find(p => p.id === clientId.get(ws));
      if (p && p.alive) {
        p.input = msg.input;
      }
      break;
    }
  }
}

// ═══════════════════════════════════════
//  ROOM
// ═══════════════════════════════════════
function createRoom(rid, duration) {
  return {
    id: rid,
    duration,
    started: false,
    ended: false,
    players: [],
    foods: [],
    particles: [],
    timerLeft: duration,
    tick: null,
    timerInterval: null,
  };
}

function joinRoom(ws, room, name) {
  const idx = room.players.length;
  const c   = PLAYER_COLORS[idx];
  const pid = genId(8);
  room.players.push({
    id: pid,
    name: name || `Joueur ${idx + 1}`,
    colorIdx: idx,
    color: c.main,
    glow: c.glow,
    x: 0, y: 0,
    vx: 0, vy: 0,
    size: BASE_SIZE,
    alive: true,
    disconnected: false,
    eaten: 0,
    eatenPlayers: 0,
    input: { up: false, down: false, left: false, right: false },
    pulseT: 0,
    ws,
  });
  clientRoom.set(ws, room.id);
  clientId.set(ws,   pid);
  return pid;
}

function startRoom(room) {
  room.started = true;

  // Positions initiales
  room.players.forEach((p, i) => {
    const angle = (i / room.players.length) * Math.PI * 2;
    p.x = clamp(WORLD_W / 2 + Math.cos(angle) * 1800, 200, WORLD_W - 200);
    p.y = clamp(WORLD_H / 2 + Math.sin(angle) * 1200, 200, WORLD_H - 200);
  });

  // Nourriture
  room.foods = [];
  for (let i = 0; i < FOOD_COUNT; i++) room.foods.push(spawnFood());

  // Notifier tous les clients
  broadcast(room, {
    type: 'gameStart',
    players: room.players.map(netPlayer),
    foods: room.foods,
    duration: room.duration,
  });

  // Timer
  room.timerLeft = room.duration;
  room.timerInterval = setInterval(() => {
    room.timerLeft--;
    broadcast(room, { type: 'timer', t: room.timerLeft });
    if (room.timerLeft <= 0) endRoom(room);
  }, 1000);

  // Game loop
  room.tick = setInterval(() => tickRoom(room), TICK_MS);
}

function tickRoom(room) {
  if (room.ended) return;

  const alive = room.players.filter(p => p.alive);
  if (alive.length <= 1 && room.players.length > 1) { endRoom(room); return; }

  const eaten = [];   // { foodIdx }
  const kills = [];   // { killer, victim }
  const spawned = []; // new foods

  room.players.forEach(p => {
    if (!p.alive) return;
    p.pulseT += 0.04;

    // Mouvement
    const spd = BASE_SPEED * (1 - 0.3 * Math.log10(p.size / BASE_SIZE + 1));
    if (p.input.up)    p.vy -= spd;
    if (p.input.down)  p.vy += spd;
    if (p.input.left)  p.vx -= spd;
    if (p.input.right) p.vx += spd;
    p.vx *= FRICTION; p.vy *= FRICTION;
    p.x = clamp(p.x + p.vx, p.size, WORLD_W - p.size);
    p.y = clamp(p.y + p.vy, p.size, WORLD_H - p.size);

    // Manger nourriture
    for (let fi = room.foods.length - 1; fi >= 0; fi--) {
      const f = room.foods[fi];
      const dx = p.x - f.x, dy = p.y - f.y;
      if (dx * dx + dy * dy < (p.size * 0.6 + f.r) ** 2) {
        p.size += GROW_FOOD;
        p.eaten++;
        eaten.push(fi);
        const nf = spawnFood();
        room.foods[fi] = nf; // remplace sur place
        spawned.push({ idx: fi, food: nf });
      }
    }

    // Manger joueurs
    alive.forEach(other => {
      if (other.id === p.id || !other.alive) return;
      const dx = p.x - other.x, dy = p.y - other.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (p.size > other.size * 1.2 && dist < p.size * 0.55) {
        other.alive = false;
        p.size += GROW_PLAYER + other.size * 0.5;
        p.eatenPlayers++;
        kills.push({ killer: p.id, victim: other.id });
      }
    });
  });

  // Broadcast état
  broadcast(room, {
    type: 'state',
    players: room.players.map(netPlayer),
    foodUpdates: spawned,
    kills,
  });
}

function endRoom(room) {
  if (room.ended) return;
  room.ended = true;
  clearInterval(room.tick);
  clearInterval(room.timerInterval);

  const sorted = [...room.players].sort((a, b) => b.size - a.size);
  broadcast(room, { type: 'gameEnd', results: sorted.map(netPlayer) });

  setTimeout(() => destroyRoom(room.id), 30000);
}

function destroyRoom(rid) {
  const room = rooms[rid];
  if (!room) return;
  clearInterval(room.tick);
  clearInterval(room.timerInterval);
  delete rooms[rid];
  console.log(`Room ${rid} détruite`);
}

// ═══════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════
function spawnFood() {
  const types = ['circle', 'star', 'diamond'];
  const hues  = [0, 30, 60, 120, 180, 200, 270, 300, 340];
  const h = hues[Math.floor(Math.random() * hues.length)];
  return {
    x: rand(FOOD_RADIUS * 2, WORLD_W - FOOD_RADIUS * 2),
    y: rand(FOOD_RADIUS * 2, WORLD_H - FOOD_RADIUS * 2),
    r: FOOD_RADIUS + rand(0, 4),
    color: `hsl(${h},90%,65%)`,
    type: types[Math.floor(Math.random() * types.length)],
    wobble: Math.random() * Math.PI * 2,
  };
}

function netPlayer(p) {
  return {
    id: p.id, name: p.name, colorIdx: p.colorIdx,
    color: p.color, glow: p.glow,
    x: p.x, y: p.y, size: p.size,
    alive: p.alive, eaten: p.eaten, eatenPlayers: p.eatenPlayers,
    pulseT: p.pulseT,
  };
}

function lobbyPlayer(p) {
  return { id: p.id, name: p.name, colorIdx: p.colorIdx, color: p.color, glow: p.glow };
}

function broadcast(room, msg) {
  const data = JSON.stringify(msg);
  room.players.forEach(p => {
    if (p.ws && p.ws.readyState === 1) p.ws.send(data);
  });
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function genId(len) {
  return Math.random().toString(36).substr(2, len).toUpperCase();
}

function rand(min, max) { return min + Math.random() * (max - min); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
