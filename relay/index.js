const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 8080;
const SECRET_TOKEN = process.env.SECRET_TOKEN || 'dev-token-change-me';
const FRAME_MAGIC = 0xfd;

const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' });

/** @type {WebSocket | null} */
let agentSocket = null;
/** @type {Set<WebSocket>} */
const clients = new Set();

/** @type {Map<WebSocket, { count: number, resetAt: number }>} */
const rateLimits = new Map();

const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 1000;
const HEARTBEAT_INTERVAL_MS = 10000;

function isAuthenticated(ws) {
  return ws.authenticated === true;
}

function checkRateLimit(ws) {
  const now = Date.now();
  let entry = rateLimits.get(ws);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateLimits.set(ws, entry);
  }
  entry.count += 1;
  return entry.count <= RATE_LIMIT;
}

function isBinaryFrame(raw) {
  return Buffer.isBuffer(raw) && raw.length > 0 && raw[0] === FRAME_MAGIC;
}

function broadcastAgentStatus(online) {
  const msg = JSON.stringify({ type: 'agent_status', online, timestamp: Date.now() });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN && isAuthenticated(client)) {
      client.send(msg);
    }
  }
}

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function handleAuth(ws, data) {
  const { role, token } = data;
  if (token !== SECRET_TOKEN) {
    send(ws, { type: 'auth_error', message: 'Invalid token' });
    ws.close(4001, 'Unauthorized');
    return;
  }

  if (role === 'agent') {
    if (agentSocket && agentSocket.readyState === WebSocket.OPEN) {
      send(ws, { type: 'auth_error', message: 'Agent already connected' });
      ws.close(4002, 'Agent exists');
      return;
    }
    agentSocket = ws;
    ws.role = 'agent';
    ws.authenticated = true;
    send(ws, { type: 'auth_ok', role: 'agent' });
    broadcastAgentStatus(true);
    console.log('[relay] Agent connected');
    return;
  }

  if (role === 'client') {
    ws.role = 'client';
    ws.authenticated = true;
    clients.add(ws);
    send(ws, { type: 'auth_ok', role: 'client' });
    send(ws, {
      type: 'agent_status',
      online: agentSocket !== null && agentSocket.readyState === WebSocket.OPEN,
      timestamp: Date.now(),
    });
    console.log('[relay] Client connected');
    return;
  }

  send(ws, { type: 'auth_error', message: 'Invalid role' });
  ws.close(4003, 'Invalid role');
}

function forwardBinaryFrame(ws, raw) {
  if (!isAuthenticated(ws)) {
    send(ws, { type: 'auth_error', message: 'Not authenticated' });
    ws.close(4001, 'Unauthorized');
    return;
  }

  if (ws.role === 'agent') {
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(raw, { binary: true });
      }
    }
    return;
  }

  send(ws, { type: 'error', message: 'Clients cannot send binary frames' });
}

function handleMessage(ws, raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    send(ws, { type: 'error', message: 'Invalid JSON' });
    return;
  }

  if (data.type === 'auth') {
    handleAuth(ws, data);
    return;
  }

  if (!isAuthenticated(ws)) {
    send(ws, { type: 'auth_error', message: 'Not authenticated' });
    ws.close(4001, 'Unauthorized');
    return;
  }

  switch (data.type) {
    case 'ping':
      send(ws, { type: 'pong', timestamp: data.timestamp || Date.now() });
      break;

    case 'pong':
      break;

    case 'command':
      if (ws.role === 'client') {
        if (!checkRateLimit(ws)) {
          send(ws, { type: 'error', message: 'Rate limit exceeded' });
          return;
        }
        if (agentSocket && agentSocket.readyState === WebSocket.OPEN) {
          agentSocket.send(raw);
        } else {
          send(ws, { type: 'error', message: 'Agent offline' });
        }
      }
      break;

    default:
      send(ws, { type: 'error', message: `Unknown message type: ${data.type}` });
  }
}

function cleanup(ws) {
  rateLimits.delete(ws);
  if (ws.role === 'agent' && ws === agentSocket) {
    agentSocket = null;
    broadcastAgentStatus(false);
    console.log('[relay] Agent disconnected');
  }
  if (ws.role === 'client') {
    clients.delete(ws);
    console.log('[relay] Client disconnected');
  }
}

wss.on('connection', (ws) => {
  ws.authenticated = false;
  ws.role = null;

  ws.on('message', (raw, isBinary) => {
    if (isBinary || isBinaryFrame(raw)) {
      forwardBinaryFrame(ws, raw);
      return;
    }
    handleMessage(ws, raw.toString());
  });

  ws.on('close', () => cleanup(ws));
  ws.on('error', (err) => {
    console.error('[relay] WebSocket error:', err.message);
    cleanup(ws);
  });
});

setInterval(() => {
  const heartbeat = JSON.stringify({ type: 'heartbeat', timestamp: Date.now() });
  if (agentSocket && agentSocket.readyState === WebSocket.OPEN) {
    agentSocket.send(heartbeat);
  }
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(heartbeat);
    }
  }
}, HEARTBEAT_INTERVAL_MS);

console.log(`[relay] RemoteDesk relay listening on port ${PORT}`);
