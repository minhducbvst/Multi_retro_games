import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type Platform = 'NES' | 'SNES' | 'GBA' | 'GENESIS' | 'GB' | 'GBC';

interface SpectatorInfo {
  id: string;
  name: string;
  latencyMs: number;
}

interface NetPlayRoomState {
  id: string;
  code: string;
  hostUid: string;
  hostName: string;
  hostAvatar?: string;
  guestUid?: string | null;
  guestName?: string | null;
  guestAvatar?: string | null;
  gameId: string;
  gameTitle: string;
  platform: Platform;
  status: 'waiting' | 'ready' | 'playing' | 'closed';
  isPublic: boolean;
  hostReady: boolean;
  guestReady: boolean;
  pingMs: number;
  hostPingMs?: number;
  guestPingMs?: number;
  spectators: SpectatorInfo[];
  rollbackFrames: number;
  inputDelayTarget: string;
  pauseAuthority: string;
  createdAt: string;
  updatedAt: string;
}

interface ChatMessageState {
  id: string;
  roomId: string;
  senderUid: string;
  senderName: string;
  senderAvatar?: string;
  text: string;
  timestamp: string;
  isSystem?: boolean;
}

interface ConnectedClient {
  ws: WebSocket;
  uid: string;
  displayName: string;
  roomId: string | null;
  lobbySubscribed: boolean;
  lastPongAt: number;
  latencyMs: number;
}

interface InternalRoomRecord {
  room: NetPlayRoomState;
  messages: ChatMessageState[];
  clients: Map<string, ConnectedClient>; // uid -> client
  disconnectTimers: Map<string, ReturnType<typeof setTimeout>>;
}

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const GRACE_PERIOD_MS = 10000;

const rooms = new Map<string, InternalRoomRecord>();
const codeToRoomId = new Map<string, string>();
const allClients = new Map<WebSocket, ConnectedClient>();

function formatClock(): string {
  return new Date().toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function generateUniqueRoomCode(platform: Platform): string {
  for (let attempt = 0; attempt < 25; attempt++) {
    const num = Math.floor(1000 + Math.random() * 9000);
    const code = `RV-${num}-${platform}`;
    if (!codeToRoomId.has(code)) {
      return code;
    }
  }
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `RV-${suffix}-${platform}`;
}

function sendJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(payload));
    } catch (err) {
      console.error('WS send error:', err);
    }
  }
}

function getPublicRoomsList(): NetPlayRoomState[] {
  const list: NetPlayRoomState[] = [];
  for (const record of rooms.values()) {
    if (record.room.isPublic && record.room.status !== 'closed') {
      list.push(record.room);
    }
  }
  list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return list;
}

function broadcastLobbyRooms(): void {
  const publicRooms = getPublicRoomsList();
  for (const client of allClients.values()) {
    if (client.lobbySubscribed) {
      sendJson(client.ws, {
        type: 'lobby:rooms',
        rooms: publicRooms,
      });
    }
  }
}

function broadcastToRoom(record: InternalRoomRecord, payload: unknown, excludeUid?: string): void {
  for (const [uid, client] of record.clients.entries()) {
    if (excludeUid && uid === excludeUid) continue;
    sendJson(client.ws, payload);
  }
}

function addSystemMessage(record: InternalRoomRecord, text: string): ChatMessageState {
  const msg: ChatMessageState = {
    id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    roomId: record.room.id,
    senderUid: 'system',
    senderName: 'System',
    text,
    timestamp: formatClock(),
    isSystem: true,
  };
  record.messages.push(msg);
  if (record.messages.length > 100) {
    record.messages.shift();
  }
  broadcastToRoom(record, { type: 'room:message', message: msg });
  return msg;
}

function resolveRoomByCodeOrId(codeOrId: string): InternalRoomRecord | undefined {
  const trimmed = codeOrId.trim();
  const byId = rooms.get(trimmed);
  if (byId) return byId;

  const upper = trimmed.toUpperCase();
  const exactId = codeToRoomId.get(upper);
  if (exactId && rooms.has(exactId)) {
    return rooms.get(exactId);
  }

  // Partial numeric match (e.g., typing "7402" matches "RV-7402-SNES")
  for (const [code, roomId] of codeToRoomId.entries()) {
    if (code.includes(upper) && rooms.has(roomId)) {
      return rooms.get(roomId);
    }
  }
  return undefined;
}

function detachClientFromRoom(client: ConnectedClient, immediate: boolean): void {
  const roomId = client.roomId;
  if (!roomId) return;

  const record = rooms.get(roomId);
  client.roomId = null;
  if (!record) return;

  record.clients.delete(client.uid);

  const performLeave = () => {
    record.disconnectTimers.delete(client.uid);
    const currentRoom = record.room;
    if (currentRoom.status === 'closed') return;

    // If client reconnected in the meantime, do nothing
    if (record.clients.has(client.uid)) return;

    if (currentRoom.hostUid === client.uid) {
      if (currentRoom.guestUid) {
        const promotedUid = currentRoom.guestUid;
        const promotedName = currentRoom.guestName || 'Player 1';
        currentRoom.hostUid = promotedUid;
        currentRoom.hostName = promotedName;
        currentRoom.hostAvatar = currentRoom.guestAvatar ?? undefined;
        currentRoom.hostReady = currentRoom.guestReady;
        currentRoom.hostPingMs = currentRoom.guestPingMs;
        currentRoom.guestUid = null;
        currentRoom.guestName = null;
        currentRoom.guestAvatar = null;
        currentRoom.guestReady = false;
        currentRoom.guestPingMs = undefined;
        currentRoom.status = 'waiting';
        currentRoom.pauseAuthority = `Host Only (${promotedName})`;
        currentRoom.updatedAt = new Date().toISOString();

        addSystemMessage(record, `Host đã rời phòng. ${promotedName} được chuyển quyền làm Host (Port 1).`);
        broadcastToRoom(record, { type: 'room:state', room: currentRoom });
        broadcastLobbyRooms();
      } else {
        currentRoom.status = 'closed';
        currentRoom.updatedAt = new Date().toISOString();
        broadcastToRoom(record, { type: 'room:closed', roomId: currentRoom.id });
        codeToRoomId.delete(currentRoom.code);
        rooms.delete(currentRoom.id);
        broadcastLobbyRooms();
      }
    } else if (currentRoom.guestUid === client.uid) {
      const leftName = currentRoom.guestName || 'Challenger';
      currentRoom.guestUid = null;
      currentRoom.guestName = null;
      currentRoom.guestAvatar = null;
      currentRoom.guestReady = false;
      currentRoom.guestPingMs = undefined;
      if (currentRoom.status === 'ready') {
        currentRoom.status = 'waiting';
      }
      currentRoom.updatedAt = new Date().toISOString();

      addSystemMessage(record, `${leftName} đã rời khỏi Port 2. Vị trí Challenger hiện đang mở.`);
      broadcastToRoom(record, { type: 'room:state', room: currentRoom });
      broadcastLobbyRooms();
    } else {
      const prevLen = currentRoom.spectators.length;
      currentRoom.spectators = currentRoom.spectators.filter((s) => s.id !== client.uid);
      if (currentRoom.spectators.length !== prevLen) {
        currentRoom.updatedAt = new Date().toISOString();
        broadcastToRoom(record, { type: 'room:state', room: currentRoom });
      }
    }
  };

  if (immediate) {
    const existingTimer = record.disconnectTimers.get(client.uid);
    if (existingTimer) clearTimeout(existingTimer);
    performLeave();
  } else {
    const existingTimer = record.disconnectTimers.get(client.uid);
    if (existingTimer) clearTimeout(existingTimer);
    const timer = setTimeout(performLeave, GRACE_PERIOD_MS);
    record.disconnectTimers.set(client.uid, timer);
  }
}

async function startServer(): Promise<void> {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '1mb' }));

  // REST API: NetPlay Health & Public Discovery
  app.get('/api/netplay/health', (_req, res) => {
    res.json({
      status: 'ok',
      activeRooms: rooms.size,
      publicRooms: getPublicRoomsList().length,
      connectedClients: allClients.size,
      serverTime: Date.now(),
    });
  });

  app.get('/api/netplay/rooms', (_req, res) => {
    res.json({ rooms: getPublicRoomsList() });
  });

  app.get('/api/netplay/rooms/:code', (req, res) => {
    const record = resolveRoomByCodeOrId(req.params.code);
    if (!record || record.room.status === 'closed') {
      res.status(404).json({ error: 'Room not found or closed' });
      return;
    }
    res.json({ room: record.room });
  });

  const server = http.createServer(app);
  server.keepAliveTimeout = 65000;

  // WebSocket NetPlay Signaling, Room State, Chat & Low-Latency Relay
  const wss = new WebSocketServer({ server, path: '/ws/netplay' });

  wss.on('connection', (ws: WebSocket) => {
    const client: ConnectedClient = {
      ws,
      uid: `anon-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      displayName: 'Player',
      roomId: null,
      lobbySubscribed: false,
      lastPongAt: Date.now(),
      latencyMs: 0,
    };
    allClients.set(ws, client);

    sendJson(ws, { type: 'ws:welcome', serverTime: Date.now() });

    ws.on('message', (rawData) => {
      let msg: Record<string, any>;
      try {
        msg = JSON.parse(rawData.toString());
      } catch {
        return;
      }

      const type = String(msg.type || '');

      if (type === 'ping') {
        client.lastPongAt = Date.now();
        if (typeof msg.lastRttMs === 'number' && Number.isFinite(msg.lastRttMs)) {
          client.latencyMs = Math.max(1, Math.round(msg.lastRttMs));
        }
        sendJson(ws, {
          type: 'pong',
          clientTime: msg.clientTime,
          serverTime: Date.now(),
        });
        return;
      }

      if (type === 'hello') {
        if (typeof msg.uid === 'string' && msg.uid.trim()) {
          client.uid = msg.uid.trim().slice(0, 128);
        }
        if (typeof msg.displayName === 'string' && msg.displayName.trim()) {
          client.displayName = msg.displayName.trim().slice(0, 64);
        }
        return;
      }

      if (type === 'lobby:subscribe') {
        client.lobbySubscribed = true;
        sendJson(ws, {
          type: 'lobby:rooms',
          rooms: getPublicRoomsList(),
        });
        return;
      }

      if (type === 'lobby:unsubscribe') {
        client.lobbySubscribed = false;
        return;
      }

      if (type === 'room:create') {
        if (client.roomId) {
          detachClientFromRoom(client, true);
        }

        const hostUid = String(msg.hostUid || client.uid).slice(0, 128);
        const hostName = String(msg.hostName || client.displayName || 'RetroHost').slice(0, 64);
        const hostAvatar = typeof msg.hostAvatar === 'string' ? msg.hostAvatar : undefined;
        const platform = (msg.platform || 'SNES') as Platform;
        const gameId = String(msg.gameId || 'arena-coop');
        const gameTitle = String(msg.gameTitle || 'RetroVerse Arena');
        const isPublic = msg.isPublic !== undefined ? Boolean(msg.isPublic) : true;
        const rollbackFrames = Number(msg.rollbackFrames || 1);
        const inputDelayTarget = String(msg.inputDelayTarget || '0-1 Frame (Sub-16ms)');

        client.uid = hostUid;
        client.displayName = hostName;

        const roomId = `room-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const code = generateUniqueRoomCode(platform);
        const nowIso = new Date().toISOString();

        const newRoom: NetPlayRoomState = {
          id: roomId,
          code,
          hostUid,
          hostName,
          hostAvatar,
          guestUid: null,
          guestName: null,
          guestAvatar: null,
          gameId,
          gameTitle,
          platform,
          status: 'waiting',
          isPublic,
          hostReady: true,
          guestReady: false,
          pingMs: client.latencyMs || 0,
          hostPingMs: client.latencyMs || 0,
          spectators: [],
          rollbackFrames,
          inputDelayTarget,
          pauseAuthority: `Host Only (${hostName})`,
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        const record: InternalRoomRecord = {
          room: newRoom,
          messages: [],
          clients: new Map([[hostUid, client]]),
          disconnectTimers: new Map(),
        };

        rooms.set(roomId, record);
        codeToRoomId.set(code, roomId);
        client.roomId = roomId;

        const welcomeMsg: ChatMessageState = {
          id: `msg-${Date.now()}`,
          roomId,
          senderUid: 'system',
          senderName: 'System',
          text: `Phòng ${code} đã khởi tạo cho ${gameTitle} (${platform}). Chia sẻ mã hoặc link mời để bạn bè tham gia từ bất cứ đâu.`,
          timestamp: formatClock(),
          isSystem: true,
        };
        record.messages.push(welcomeMsg);

        sendJson(ws, {
          type: 'room:joined',
          requestId: msg.requestId,
          room: newRoom,
          messages: record.messages,
        });
        broadcastLobbyRooms();
        return;
      }

      if (type === 'room:join') {
        const codeOrId = String(msg.codeOrId || '');
        const playerUid = String(msg.uid || client.uid).slice(0, 128);
        const playerName = String(msg.displayName || client.displayName || 'Player').slice(0, 64);
        const playerAvatar = typeof msg.photoURL === 'string' ? msg.photoURL : undefined;

        client.uid = playerUid;
        client.displayName = playerName;

        const record = resolveRoomByCodeOrId(codeOrId);
        if (!record || record.room.status === 'closed') {
          sendJson(ws, {
            type: 'room:error',
            requestId: msg.requestId,
            error: `Không tìm thấy phòng với mã "${codeOrId}". Kiểm tra lại mã phòng hoặc yêu cầu Host tạo phòng mới.`,
          });
          return;
        }

        if (client.roomId && client.roomId !== record.room.id) {
          detachClientFromRoom(client, true);
        }

        const pendingTimer = record.disconnectTimers.get(playerUid);
        if (pendingTimer) {
          clearTimeout(pendingTimer);
          record.disconnectTimers.delete(playerUid);
        }

        const room = record.room;
        record.clients.set(playerUid, client);
        client.roomId = record.room.id;

        let roleNotice: string | null = null;

        if (room.hostUid === playerUid) {
          room.hostName = playerName;
          if (playerAvatar) room.hostAvatar = playerAvatar;
        } else if (room.guestUid === playerUid) {
          room.guestName = playerName;
          if (playerAvatar) room.guestAvatar = playerAvatar;
        } else if (!room.guestUid) {
          room.guestUid = playerUid;
          room.guestName = playerName;
          room.guestAvatar = playerAvatar;
          room.guestReady = false;
          room.guestPingMs = client.latencyMs || 0;
          room.updatedAt = new Date().toISOString();
          roleNotice = `${playerName} đã vào Port 2 (Challenger). Đang thiết lập kênh WebRTC P2P độ trễ thấp...`;
        } else {
          if (!room.spectators.some((s) => s.id === playerUid)) {
            room.spectators.push({
              id: playerUid,
              name: playerName,
              latencyMs: client.latencyMs || 0,
            });
            room.updatedAt = new Date().toISOString();
            roleNotice = `${playerName} đang theo dõi trận đấu (Spectator).`;
          }
        }

        sendJson(ws, {
          type: 'room:joined',
          requestId: msg.requestId,
          room,
          messages: record.messages,
        });

        if (roleNotice) {
          addSystemMessage(record, roleNotice);
        }

        broadcastToRoom(record, { type: 'room:state', room });
        broadcastLobbyRooms();
        return;
      }

      if (type === 'room:leave') {
        detachClientFromRoom(client, true);
        sendJson(ws, { type: 'room:left', requestId: msg.requestId });
        return;
      }

      // Room-scoped actions below require active room membership
      const record = client.roomId ? rooms.get(client.roomId) : undefined;
      if (!record) return;
      const room = record.room;

      if (type === 'room:ready') {
        const nextReady = Boolean(msg.ready);
        if (room.hostUid === client.uid) {
          room.hostReady = nextReady;
        } else if (room.guestUid === client.uid) {
          room.guestReady = nextReady;
        } else {
          return;
        }

        if (room.status !== 'playing') {
          room.status = room.hostReady && room.guestReady ? 'ready' : 'waiting';
        }
        room.updatedAt = new Date().toISOString();

        const actorName = room.hostUid === client.uid ? room.hostName : room.guestName || 'Challenger';
        addSystemMessage(
          record,
          `${actorName} ${nextReady ? 'ĐÃ SẴN SÀNG!' : 'đã hủy trạng thái sẵn sàng.'}${
            room.hostReady && room.guestReady ? ' Cả 2 người chơi đã đồng bộ!' : ''
          }`
        );

        broadcastToRoom(record, { type: 'room:state', room });
        broadcastLobbyRooms();
        return;
      }

      if (type === 'room:change_game') {
        if (room.hostUid !== client.uid) return;
        room.gameId = String(msg.gameId || room.gameId);
        room.gameTitle = String(msg.gameTitle || room.gameTitle);
        room.platform = (msg.platform || room.platform) as Platform;
        room.hostReady = true;
        room.guestReady = false;
        room.status = 'waiting';
        room.updatedAt = new Date().toISOString();

        addSystemMessage(record, `Host đã đổi băng game sang: ${room.gameTitle} (${room.platform}).`);
        broadcastToRoom(record, { type: 'room:state', room });
        broadcastLobbyRooms();
        return;
      }

      if (type === 'room:launch') {
        if (room.hostUid !== client.uid) return;
        room.status = 'playing';
        room.updatedAt = new Date().toISOString();
        addSystemMessage(record, `Host đã khởi chạy trận đấu ${room.gameTitle}! Đang đồng bộ màn hình & tay cầm...`);
        broadcastToRoom(record, { type: 'room:state', room });
        broadcastToRoom(record, { type: 'room:launched', room });
        broadcastLobbyRooms();
        return;
      }

      if (type === 'room:stop_match') {
        if (room.hostUid !== client.uid) return;
        room.status = room.hostReady && room.guestReady ? 'ready' : 'waiting';
        room.updatedAt = new Date().toISOString();
        addSystemMessage(record, 'Host đã kết thúc ván chơi và quay về phòng chờ.');
        broadcastToRoom(record, { type: 'room:state', room });
        broadcastLobbyRooms();
        return;
      }

      if (type === 'room:chat') {
        const text = String(msg.text || '').trim().slice(0, 500);
        if (!text) return;

        const chatMsg: ChatMessageState = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          roomId: room.id,
          senderUid: client.uid,
          senderName: client.displayName || 'Player',
          senderAvatar: typeof msg.senderAvatar === 'string' ? msg.senderAvatar : undefined,
          text,
          timestamp: formatClock(),
          isSystem: false,
        };
        record.messages.push(chatMsg);
        if (record.messages.length > 100) {
          record.messages.shift();
        }
        broadcastToRoom(record, { type: 'room:message', message: chatMsg });
        return;
      }

      if (type === 'room:ping_report') {
        const rtt = Math.max(0, Math.round(Number(msg.pingMs || 0)));
        if (room.hostUid === client.uid) {
          room.hostPingMs = rtt;
        } else if (room.guestUid === client.uid) {
          room.guestPingMs = rtt;
          room.pingMs = rtt;
        } else {
          room.spectators = room.spectators.map((s) => (s.id === client.uid ? { ...s, latencyMs: rtt } : s));
        }
        broadcastToRoom(record, { type: 'room:state', room });
        return;
      }

      if (type === 'room:signal') {
        const signalEnvelope = {
          type: 'room:signal',
          signal: {
            id: `sig-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            roomId: room.id,
            senderUid: client.uid,
            targetUid: msg.targetUid,
            type: msg.signalType,
            payload: msg.payload,
            createdAt: new Date().toISOString(),
          },
        };
        if (typeof msg.targetUid === 'string' && msg.targetUid) {
          const targetClient = record.clients.get(msg.targetUid);
          if (targetClient) {
            sendJson(targetClient.ws, signalEnvelope);
          }
        } else {
          broadcastToRoom(record, signalEnvelope, client.uid);
        }
        return;
      }

      // Low-latency WebSocket Fallback Relay for strict symmetric NATs
      if (type === 'room:relay_input') {
        const hostClient = record.clients.get(room.hostUid);
        if (hostClient && client.uid !== room.hostUid) {
          sendJson(hostClient.ws, {
            type: 'room:relay_input',
            senderUid: client.uid,
            mask: Number(msg.mask || 0),
            seq: Number(msg.seq || 0),
          });
        }
        return;
      }

      if (type === 'room:relay_frame') {
        if (room.hostUid === client.uid) {
          broadcastToRoom(
            record,
            {
              type: 'room:relay_frame',
              frame: msg.frame,
              width: msg.width,
              height: msg.height,
            },
            client.uid
          );
        }
      }
    });

    ws.on('close', () => {
      allClients.delete(ws);
      detachClientFromRoom(client, false);
    });
  });

  // Periodic stale connection reaper
  setInterval(() => {
    const now = Date.now();
    for (const [ws, client] of allClients.entries()) {
      if (now - client.lastPongAt > 120000) {
        try {
          ws.terminate();
        } catch {}
        allClients.delete(ws);
        detachClientFromRoom(client, false);
      }
    }
  }, 30000);

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build.');
      }
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`RetroVerse Full-Stack & NetPlay Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
