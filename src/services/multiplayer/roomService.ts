import { auth } from '../firebase';
import { NetPlayRoom, ChatMessage, SignalingMessage, Platform } from '../../types';

export interface CreateRoomInput {
  gameId: string;
  gameTitle: string;
  platform: Platform;
  isPublic?: boolean;
  rollbackFrames?: number;
  inputDelayTarget?: string;
  hostName?: string;
}

export interface PlayerProfile {
  uid: string;
  displayName: string;
  photoURL?: string;
}

export type ServerConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

const TAB_UID_KEY = 'retroverse_tab_player_uid';
const NICKNAME_KEY = 'retroverse_player_nickname';

export function generateRoomCode(platform: Platform): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `RV-${num}-${platform}`;
}

export function getOrCreatePlayerProfile(): PlayerProfile {
  const user = auth.currentUser;
  let tabUid = '';
  let storedNick = '';

  try {
    tabUid = sessionStorage.getItem(TAB_UID_KEY) || '';
    if (!tabUid) {
      tabUid = `player-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
      sessionStorage.setItem(TAB_UID_KEY, tabUid);
    }
    storedNick = localStorage.getItem(NICKNAME_KEY) || '';
  } catch {
    tabUid = `player-${Math.random().toString(36).substring(2, 8)}`;
  }

  if (user) {
    // Include tab suffix if another tab isn't using the same identity, or use uid directly
    // Using user.uid keeps Google Identity consistent across machines!
    return {
      uid: user.uid,
      displayName: user.displayName || storedNick || 'RetroPlayer',
      photoURL: user.photoURL || undefined,
    };
  }

  if (!storedNick) {
    storedNick = `Player-${tabUid.slice(-4).toUpperCase()}`;
  }

  return {
    uid: tabUid,
    displayName: storedNick,
  };
}

export function setLocalPlayerName(name: string): void {
  const clean = name.trim().slice(0, 32);
  if (!clean) return;
  try {
    localStorage.setItem(NICKNAME_KEY, clean);
  } catch {}
  roomService.sendHello();
}

interface PendingRequest {
  resolve: (data: any) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class RoomService {
  private ws: WebSocket | null = null;
  private status: ServerConnectionStatus = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastServerRttMs = 0;

  private activeRoom: NetPlayRoom | null = null;
  private activeRoomId: string | null = null;
  private messages: ChatMessage[] = [];
  private publicRooms: NetPlayRoom[] = [];
  private lobbySubscribed = false;

  private pendingRequests = new Map<string, PendingRequest>();

  private statusListeners = new Set<(status: ServerConnectionStatus, rttMs: number) => void>();
  private publicRoomsListeners = new Set<(rooms: NetPlayRoom[]) => void>();
  private roomListeners = new Map<string, Set<(room: NetPlayRoom | null) => void>>();
  private messageListeners = new Map<string, Set<(messages: ChatMessage[]) => void>>();
  private signalListeners = new Map<string, Set<(signal: SignalingMessage) => void>>();
  private launchListeners = new Set<(room: NetPlayRoom) => void>();
  private relayInputListeners = new Set<(mask: number, senderUid: string) => void>();
  private relayFrameListeners = new Set<(frameDataUrl: string) => void>();

  private getWsUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws/netplay`;
  }

  public ensureConnected(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.updateStatus(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    try {
      const ws = new WebSocket(this.getWsUrl());
      this.ws = ws;

      ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.updateStatus('connected');
        this.sendHello();

        if (this.lobbySubscribed || this.publicRoomsListeners.size > 0) {
          this.sendRaw({ type: 'lobby:subscribe' });
        }

        // Auto-rejoin active room after brief network blip
        if (this.activeRoomId) {
          const profile = getOrCreatePlayerProfile();
          this.sendRaw({
            type: 'room:join',
            codeOrId: this.activeRoomId,
            uid: profile.uid,
            displayName: profile.displayName,
            photoURL: profile.photoURL,
          });
        }

        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => {
          this.sendRaw({
            type: 'ping',
            clientTime: performance.now(),
            lastRttMs: this.lastServerRttMs,
          });
        }, 2500);
        // Immediate ping
        this.sendRaw({ type: 'ping', clientTime: performance.now() });
      };

      ws.onmessage = (ev) => {
        let msg: Record<string, any>;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        this.handleServerMessage(msg);
      };

      ws.onclose = () => {
        this.ws = null;
        if (this.pingTimer) {
          clearInterval(this.pingTimer);
          this.pingTimer = null;
        }
        this.updateStatus('reconnecting');
        this.scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose will handle reconnect
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = Math.min(5000, 400 * Math.pow(1.6, this.reconnectAttempts));
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureConnected();
    }, delay);
  }

  public sendHello(): void {
    const profile = getOrCreatePlayerProfile();
    this.sendRaw({
      type: 'hello',
      uid: profile.uid,
      displayName: profile.displayName,
    });
  }

  private sendRaw(payload: Record<string, unknown>): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(payload));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  private waitForSocketOpen(timeoutMs = 5000): Promise<void> {
    this.ensureConnected();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          resolve();
        } else if (Date.now() - start > timeoutMs) {
          reject(new Error('Không thể kết nối tới máy chủ NetPlay. Vui lòng thử lại.'));
        } else {
          setTimeout(check, 60);
        }
      };
      check();
    });
  }

  private async request<T>(payload: Record<string, unknown>): Promise<T> {
    await this.waitForSocketOpen();
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Hết thời gian phản hồi từ máy chủ NetPlay.'));
      }, 6000);

      this.pendingRequests.set(requestId, { resolve, reject, timer });
      const sent = this.sendRaw({ ...payload, requestId });
      if (!sent) {
        clearTimeout(timer);
        this.pendingRequests.delete(requestId);
        reject(new Error('Kết nối WebSocket chưa sẵn sàng.'));
      }
    });
  }

  private handleServerMessage(msg: Record<string, any>): void {
    const type = String(msg.type || '');

    if (type === 'pong' && typeof msg.clientTime === 'number') {
      this.lastServerRttMs = Math.max(1, Math.round(performance.now() - msg.clientTime));
      this.statusListeners.forEach((cb) => cb(this.status, this.lastServerRttMs));
      return;
    }

    if (type === 'lobby:rooms') {
      this.publicRooms = Array.isArray(msg.rooms) ? msg.rooms : [];
      this.publicRoomsListeners.forEach((cb) => cb(this.publicRooms));
      return;
    }

    if (type === 'room:joined') {
      const room = msg.room as NetPlayRoom;
      const msgs = Array.isArray(msg.messages) ? (msg.messages as ChatMessage[]) : [];
      this.activeRoom = room;
      this.activeRoomId = room.id;
      this.messages = msgs;

      if (msg.requestId && this.pendingRequests.has(msg.requestId)) {
        const pending = this.pendingRequests.get(msg.requestId)!;
        clearTimeout(pending.timer);
        this.pendingRequests.delete(msg.requestId);
        pending.resolve(room);
      }

      this.notifyRoomListeners(room.id, room);
      this.notifyMessageListeners(room.id, msgs);
      return;
    }

    if (type === 'room:error') {
      if (msg.requestId && this.pendingRequests.has(msg.requestId)) {
        const pending = this.pendingRequests.get(msg.requestId)!;
        clearTimeout(pending.timer);
        this.pendingRequests.delete(msg.requestId);
        pending.reject(new Error(String(msg.error || 'Lỗi phòng chơi')));
      }
      return;
    }

    if (type === 'room:state') {
      const room = msg.room as NetPlayRoom;
      if (this.activeRoomId === room.id) {
        this.activeRoom = room;
      }
      this.notifyRoomListeners(room.id, room);
      return;
    }

    if (type === 'room:launched') {
      const room = msg.room as NetPlayRoom;
      this.activeRoom = room;
      this.notifyRoomListeners(room.id, room);
      this.launchListeners.forEach((cb) => cb(room));
      return;
    }

    if (type === 'room:closed') {
      const closedId = String(msg.roomId || '');
      if (this.activeRoomId === closedId) {
        this.activeRoom = null;
        this.activeRoomId = null;
        this.messages = [];
      }
      this.notifyRoomListeners(closedId, null);
      return;
    }

    if (type === 'room:left') {
      if (msg.requestId && this.pendingRequests.has(msg.requestId)) {
        const pending = this.pendingRequests.get(msg.requestId)!;
        clearTimeout(pending.timer);
        this.pendingRequests.delete(msg.requestId);
        pending.resolve(undefined);
      }
      return;
    }

    if (type === 'room:message') {
      const chatMsg = msg.message as ChatMessage;
      if (chatMsg && chatMsg.roomId === this.activeRoomId) {
        if (!this.messages.some((m) => m.id === chatMsg.id)) {
          this.messages = [...this.messages, chatMsg];
          this.notifyMessageListeners(chatMsg.roomId, this.messages);
        }
      }
      return;
    }

    if (type === 'room:signal') {
      const sig = msg.signal as SignalingMessage;
      if (sig && sig.roomId) {
        const listeners = this.signalListeners.get(sig.roomId);
        if (listeners) {
          listeners.forEach((cb) => cb(sig));
        }
      }
      return;
    }

    if (type === 'room:relay_input') {
      const mask = Number(msg.mask || 0);
      const senderUid = String(msg.senderUid || '');
      this.relayInputListeners.forEach((cb) => cb(mask, senderUid));
      return;
    }

    if (type === 'room:relay_frame') {
      if (typeof msg.frame === 'string') {
        this.relayFrameListeners.forEach((cb) => cb(msg.frame));
      }
    }
  }

  private notifyRoomListeners(roomId: string, room: NetPlayRoom | null): void {
    const set = this.roomListeners.get(roomId);
    if (set) set.forEach((cb) => cb(room));
  }

  private notifyMessageListeners(roomId: string, msgs: ChatMessage[]): void {
    const set = this.messageListeners.get(roomId);
    if (set) set.forEach((cb) => cb(msgs));
  }

  private updateStatus(next: ServerConnectionStatus): void {
    this.status = next;
    this.statusListeners.forEach((cb) => cb(next, this.lastServerRttMs));
  }

  public getServerRttMs(): number {
    return this.lastServerRttMs;
  }

  public getConnectionStatus(): ServerConnectionStatus {
    return this.status;
  }

  public subscribeToConnectionStatus(cb: (status: ServerConnectionStatus, rttMs: number) => void): () => void {
    this.ensureConnected();
    this.statusListeners.add(cb);
    cb(this.status, this.lastServerRttMs);
    return () => this.statusListeners.delete(cb);
  }

  // 1. Create a new multiplayer room
  public async createRoom(input: CreateRoomInput): Promise<NetPlayRoom> {
    const profile = getOrCreatePlayerProfile();
    const room = await this.request<NetPlayRoom>({
      type: 'room:create',
      hostUid: profile.uid,
      hostName: input.hostName || profile.displayName,
      hostAvatar: profile.photoURL,
      gameId: input.gameId,
      gameTitle: input.gameTitle,
      platform: input.platform,
      isPublic: input.isPublic !== undefined ? input.isPublic : true,
      rollbackFrames: input.rollbackFrames || 1,
      inputDelayTarget: input.inputDelayTarget || '0-1 Frame (Sub-16ms)',
    });
    return room;
  }

  // 2. Join room by Room Code (e.g. "RV-7402-SNES" or "7402")
  public async joinRoomByCode(code: string, player?: PlayerProfile): Promise<NetPlayRoom> {
    const profile = player || getOrCreatePlayerProfile();
    return this.request<NetPlayRoom>({
      type: 'room:join',
      codeOrId: code.trim(),
      uid: profile.uid,
      displayName: profile.displayName,
      photoURL: profile.photoURL,
    });
  }

  // 3. Join room by Room ID
  public async joinRoomById(roomId: string, player?: PlayerProfile): Promise<NetPlayRoom> {
    return this.joinRoomByCode(roomId, player);
  }

  // 4. Toggle Player Ready State
  public async toggleReady(_roomId: string, _isHost: boolean, nextReadyState: boolean): Promise<void> {
    await this.waitForSocketOpen();
    this.sendRaw({ type: 'room:ready', ready: nextReadyState });
  }

  // 5. Update game cartridge selected in lobby
  public async updateRoomGame(_roomId: string, gameId: string, gameTitle: string, platform: Platform): Promise<void> {
    await this.waitForSocketOpen();
    this.sendRaw({
      type: 'room:change_game',
      gameId,
      gameTitle,
      platform,
    });
  }

  // 5b. Launch match for all players in room
  public async launchMatch(): Promise<void> {
    await this.waitForSocketOpen();
    this.sendRaw({ type: 'room:launch' });
  }

  public async stopMatch(): Promise<void> {
    await this.waitForSocketOpen();
    this.sendRaw({ type: 'room:stop_match' });
  }

  // 6. Leave or close room
  public async leaveRoom(_roomId?: string, _playerUid?: string): Promise<void> {
    this.activeRoom = null;
    this.activeRoomId = null;
    this.messages = [];
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendRaw({ type: 'room:leave' });
    }
  }

  // 7. Subscribe to real-time updates for a single room
  public subscribeToRoom(
    roomId: string,
    onUpdate: (room: NetPlayRoom | null) => void,
    _onError?: (err: unknown) => void
  ): () => void {
    this.ensureConnected();
    if (!this.roomListeners.has(roomId)) {
      this.roomListeners.set(roomId, new Set());
    }
    this.roomListeners.get(roomId)!.add(onUpdate);
    if (this.activeRoom && this.activeRoom.id === roomId) {
      onUpdate(this.activeRoom);
    }
    return () => {
      this.roomListeners.get(roomId)?.delete(onUpdate);
    };
  }

  // 8. Subscribe to public rooms lobby
  public subscribeToPublicRooms(
    onUpdate: (rooms: NetPlayRoom[]) => void,
    _onError?: (err: unknown) => void
  ): () => void {
    this.ensureConnected();
    this.lobbySubscribed = true;
    this.publicRoomsListeners.add(onUpdate);
    onUpdate(this.publicRooms);
    this.sendRaw({ type: 'lobby:subscribe' });

    return () => {
      this.publicRoomsListeners.delete(onUpdate);
      if (this.publicRoomsListeners.size === 0) {
        this.lobbySubscribed = false;
        this.sendRaw({ type: 'lobby:unsubscribe' });
      }
    };
  }

  // 9. Send in-room chat message
  public async sendChatMessage(_roomId: string, text: string, sender?: PlayerProfile): Promise<void> {
    await this.waitForSocketOpen();
    this.sendRaw({
      type: 'room:chat',
      text,
      senderAvatar: sender?.photoURL,
    });
  }

  // 10. Subscribe to chat messages stream
  public subscribeToMessages(
    roomId: string,
    onUpdate: (messages: ChatMessage[]) => void,
    _onError?: (err: unknown) => void
  ): () => void {
    this.ensureConnected();
    if (!this.messageListeners.has(roomId)) {
      this.messageListeners.set(roomId, new Set());
    }
    this.messageListeners.get(roomId)!.add(onUpdate);
    if (this.activeRoomId === roomId) {
      onUpdate(this.messages);
    }
    return () => {
      this.messageListeners.get(roomId)?.delete(onUpdate);
    };
  }

  // 11. Send WebRTC Signaling
  public async sendSignal(_roomId: string, signal: Omit<SignalingMessage, 'id' | 'createdAt'>): Promise<void> {
    await this.waitForSocketOpen();
    this.sendRaw({
      type: 'room:signal',
      targetUid: signal.targetUid,
      signalType: signal.type,
      payload: signal.payload,
    });
  }

  // 12. Subscribe to WebRTC Signaling
  public subscribeToSignals(
    roomId: string,
    userUid: string,
    onSignal: (signal: SignalingMessage) => void
  ): () => void {
    this.ensureConnected();
    if (!this.signalListeners.has(roomId)) {
      this.signalListeners.set(roomId, new Set());
    }
    const handler = (sig: SignalingMessage) => {
      if (sig.senderUid !== userUid) {
        onSignal(sig);
      }
    };
    this.signalListeners.get(roomId)!.add(handler);
    return () => {
      this.signalListeners.get(roomId)?.delete(handler);
    };
  }

  public subscribeToLaunch(cb: (room: NetPlayRoom) => void): () => void {
    this.launchListeners.add(cb);
    return () => this.launchListeners.delete(cb);
  }

  public reportPing(pingMs: number): void {
    this.sendRaw({ type: 'room:ping_report', pingMs });
  }

  public sendRelayInput(mask: number, seq: number): void {
    this.sendRaw({ type: 'room:relay_input', mask, seq });
  }

  public subscribeToRelayInput(cb: (mask: number, senderUid: string) => void): () => void {
    this.relayInputListeners.add(cb);
    return () => this.relayInputListeners.delete(cb);
  }

  public sendRelayFrame(frameDataUrl: string, width: number, height: number): void {
    this.sendRaw({ type: 'room:relay_frame', frame: frameDataUrl, width, height });
  }

  public subscribeToRelayFrame(cb: (frameDataUrl: string) => void): () => void {
    this.relayFrameListeners.add(cb);
    return () => this.relayFrameListeners.delete(cb);
  }
}

export const roomService = new RoomService();
